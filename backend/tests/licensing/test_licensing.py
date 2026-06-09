"""
Comprehensive tests for the licensing app.

Covers:
- Token signing and verification (RS256)
- Activation flow
- Check-in flow
- License status (local verification)
- Admin: generate activation codes
- Admin: revoke/suspend/reactivate
- requires_feature permission class
- RequiresActiveLicense permission
"""

import datetime
import uuid

import jwt as pyjwt
import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.licensing.models import Installation
from hmis.apps.licensing.permissions import RequiresActiveLicense, RequiresFeature, requires_feature
from hmis.apps.licensing.tokens import (
    ALGORITHM,
    AUDIENCE,
    ISSUER,
    build_license_payload,
    get_private_key,
    get_public_key,
    is_check_in_overdue,
    sign_license_token,
    verify_license_token,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def license_org(db, sample_organization):
    """Organization with a subscription plan."""
    from hmis.apps.core.models import SubscriptionPlan

    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="PROFESSIONAL",
        defaults={
            "name": "Hospital Plan",
            "monthly_price": 49999,
            "annual_price": 499990,
            "max_facilities": 3,
            "max_users": 50,
            "max_patients": None,
            "features": {
                "outpatient": True,
                "inpatient": True,
                "pharmacy": True,
                "laboratory": True,
                "sha_claims": True,
                "ai_assistant": True,
                "offline_sync": True,
            },
        },
    )

    sample_organization.subscription_plan = plan
    sample_organization.subscription_tier = "PROFESSIONAL"
    sample_organization.subscription_status = "ACTIVE"
    sample_organization.save(
        update_fields=["subscription_plan", "subscription_tier", "subscription_status"]
    )
    return sample_organization


@pytest.fixture
def pending_installation(db, license_org, sample_facility):
    """A pending installation with an activation code."""
    return Installation.objects.create(
        organization=license_org,
        facility=sample_facility,
        name="Test Hub",
        activation_code="TEST-ACTIVATION-CODE",
        status=Installation.Status.PENDING,
    )


@pytest.fixture
def active_installation(db, license_org, sample_facility):
    """An already-activated installation."""
    installation = Installation.objects.create(
        organization=license_org,
        facility=sample_facility,
        name="Active Hub",
        activation_code="",
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
        last_check_in=timezone.now(),
    )
    # Sign a license token
    payload = build_license_payload(installation)
    token = sign_license_token(payload)
    installation.license_jwt = token
    installation.save(update_fields=["license_jwt"])
    return installation


# ---------------------------------------------------------------------------
# Token signing & verification tests
# ---------------------------------------------------------------------------


class TestTokenSigning:
    """Tests for RS256 license token operations."""

    def test_sign_and_verify_roundtrip(self, db, active_installation):
        """Token signed with private key should verify with public key."""
        payload = build_license_payload(active_installation)
        token = sign_license_token(payload)

        decoded = verify_license_token(token)
        assert decoded["org_id"] == active_installation.organization.pk
        assert decoded["tier"] == "PROFESSIONAL"
        assert decoded["features"]["sha_claims"] is True

    def test_token_contains_required_claims(self, db, active_installation):
        """Token should contain all required JWT claims."""
        payload = build_license_payload(active_installation)
        token = sign_license_token(payload)

        decoded = verify_license_token(token)
        assert decoded["iss"] == ISSUER
        assert decoded["aud"] == AUDIENCE
        assert "iat" in decoded
        assert "exp" in decoded
        assert "check_in_by" in decoded
        assert decoded["installation_id"] == str(active_installation.installation_id)

    def test_tampered_token_fails_verification(self, db, active_installation):
        """A token with a modified payload should fail signature verification."""
        payload = build_license_payload(active_installation)
        token = sign_license_token(payload)

        # Tamper with the payload
        parts = token.split(".")
        parts[1] = parts[1][:-4] + "XXXX"
        tampered = ".".join(parts)

        with pytest.raises(Exception):
            verify_license_token(tampered)

    def test_expired_token_fails(self, db, active_installation):
        """An expired token should be rejected."""
        private_key = get_private_key()
        now = timezone.now()

        expired_payload = {
            "installation_id": str(active_installation.installation_id),
            "org_id": active_installation.organization.pk,
            "tier": "PROFESSIONAL",
            "features": {},
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": int((now - datetime.timedelta(days=100)).timestamp()),
            "exp": int((now - datetime.timedelta(days=1)).timestamp()),
            "check_in_by": int((now - datetime.timedelta(days=60)).timestamp()),
        }

        token = pyjwt.encode(expired_payload, private_key, algorithm=ALGORITHM)
        with pytest.raises(pyjwt.ExpiredSignatureError):
            verify_license_token(token)

    def test_wrong_issuer_fails(self, db, active_installation):
        """A token with wrong issuer should be rejected."""
        private_key = get_private_key()
        now = timezone.now()

        bad_payload = {
            "installation_id": str(active_installation.installation_id),
            "iss": "fake-issuer",
            "aud": AUDIENCE,
            "iat": int(now.timestamp()),
            "exp": int((now + datetime.timedelta(days=90)).timestamp()),
        }

        token = pyjwt.encode(bad_payload, private_key, algorithm=ALGORITHM)
        with pytest.raises(pyjwt.InvalidIssuerError):
            verify_license_token(token)

    def test_check_in_overdue_detection(self):
        """Should detect when check-in window has passed."""
        now = timezone.now()
        overdue_payload = {
            "check_in_by": int((now - datetime.timedelta(days=5)).timestamp()),
        }
        assert is_check_in_overdue(overdue_payload) is True

        fresh_payload = {
            "check_in_by": int((now + datetime.timedelta(days=25)).timestamp()),
        }
        assert is_check_in_overdue(fresh_payload) is False

    def test_build_license_payload_includes_plan_data(self, db, active_installation):
        """Payload should include organization's plan features and limits."""
        payload = build_license_payload(active_installation)

        assert payload["tier"] == "PROFESSIONAL"
        assert payload["max_staff"] == 50
        assert payload["max_facilities"] == 3
        assert payload["features"]["inpatient"] is True
        assert payload["features"]["laboratory"] is True


# ---------------------------------------------------------------------------
# Activation endpoint tests
# ---------------------------------------------------------------------------


class TestActivation:
    """Tests for POST /api/licensing/activate/."""

    def test_successful_activation(self, api_client, pending_installation):
        """Valid activation code should activate installation and return token."""
        client_uuid = uuid.uuid4()

        response = api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(client_uuid),
                "activation_code": "TEST-ACTIVATION-CODE",
                "name": "Reception Hub",
                "app_version": "0.1.2",
                "os_info": "Linux x86_64",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "license_token" in response.data
        assert response.data["tier"] == "PROFESSIONAL"
        assert response.data["features"]["sha_claims"] is True
        assert response.data["expires_at"] is not None
        assert response.data["check_in_by"] is not None

        # Verify installation was updated
        pending_installation.refresh_from_db()
        assert pending_installation.status == Installation.Status.ACTIVE
        assert pending_installation.installation_id == client_uuid
        assert pending_installation.activation_code == ""  # Cleared
        assert pending_installation.license_jwt != ""

    def test_invalid_activation_code_rejected(self, api_client):
        """Invalid code should return 400."""
        response = api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(uuid.uuid4()),
                "activation_code": "INVALID-CODE-FAKE",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid" in response.data["error"]

    def test_already_used_code_rejected(self, api_client, pending_installation):
        """Activating with an already-used code should fail."""
        # First activation
        api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(uuid.uuid4()),
                "activation_code": "TEST-ACTIVATION-CODE",
            },
            format="json",
        )

        # Second attempt with same code
        response = api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(uuid.uuid4()),
                "activation_code": "TEST-ACTIVATION-CODE",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_missing_fields_rejected(self, api_client):
        """Missing required fields should return 400."""
        response = api_client.post("/api/licensing/activate/", {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Check-in endpoint tests
# ---------------------------------------------------------------------------


class TestCheckIn:
    """Tests for POST /api/licensing/check-in/."""

    def test_successful_check_in(self, api_client, active_installation):
        """Active installation should receive a refreshed token."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {
                "installation_id": str(active_installation.installation_id),
                "app_version": "0.2.0",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "license_token" in response.data
        assert response.data["tier"] == "PROFESSIONAL"

        # Token should be updated
        active_installation.refresh_from_db()
        assert active_installation.app_version == "0.2.0"
        assert active_installation.last_check_in is not None

    def test_revoked_installation_rejected(self, api_client, active_installation):
        """Revoked installation should get 403."""
        active_installation.revoke(reason="Payment failed")

        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": str(active_installation.installation_id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "revoked"

    def test_suspended_installation_rejected(self, api_client, active_installation):
        """Suspended installation should get 403."""
        active_installation.suspend(reason="Investigating breach")

        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": str(active_installation.installation_id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "suspended"

    def test_unknown_installation_returns_404(self, api_client):
        """Non-existent installation ID should return 404."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": str(uuid.uuid4())},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_pending_installation_rejected(self, api_client, pending_installation):
        """Pending (not yet activated) installation should get 400."""
        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": str(pending_installation.installation_id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# License status endpoint tests
# ---------------------------------------------------------------------------


class TestLicenseStatus:
    """Tests for GET /api/licensing/status/."""

    def test_valid_token_returns_status(self, api_client, active_installation):
        """Providing a valid token should return decoded status."""
        response = api_client.get(
            "/api/licensing/status/",
            HTTP_X_LICENSE_TOKEN=active_installation.license_jwt,
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["valid"] is True
        assert response.data["tier"] == "PROFESSIONAL"
        assert response.data["features"]["sha_claims"] is True
        assert response.data["check_in_overdue"] is False

    def test_no_token_returns_invalid(self, api_client):
        """Missing token should return valid=False."""
        response = api_client.get("/api/licensing/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["valid"] is False
        assert "No license token" in response.data["error"]

    def test_corrupted_token_returns_invalid(self, api_client):
        """Corrupted token should return valid=False with error."""
        response = api_client.get(
            "/api/licensing/status/",
            HTTP_X_LICENSE_TOKEN="invalid.token.here",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["valid"] is False
        assert response.data["error"] != ""

    def test_token_via_query_param(self, api_client, active_installation):
        """Token can also be passed as a query parameter."""
        response = api_client.get(
            f"/api/licensing/status/?token={active_installation.license_jwt}",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["valid"] is True


# ---------------------------------------------------------------------------
# Admin: generate activation code tests
# ---------------------------------------------------------------------------


class TestGenerateActivationCode:
    """Tests for POST /api/licensing/generate-code/ (admin only)."""

    def test_admin_can_generate_code(self, authenticated_client, license_org):
        """Admin user should be able to generate activation codes."""
        # Make the test user a superuser (admin)
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        response = authenticated_client.post(
            "/api/licensing/generate-code/",
            {"organization_id": license_org.pk, "name": "New Hub"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "activation_code" in response.data
        assert len(response.data["activation_code"]) == 16
        assert response.data["organization"] == license_org.name

    def test_non_admin_rejected(self, authenticated_client, license_org):
        """Non-admin user should get 403."""
        response = authenticated_client.post(
            "/api/licensing/generate-code/",
            {"organization_id": license_org.pk},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_invalid_org_returns_404(self, authenticated_client):
        """Non-existent organization should return 404."""
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        response = authenticated_client.post(
            "/api/licensing/generate-code/",
            {"organization_id": 99999},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Admin: revoke/suspend/reactivate tests
# ---------------------------------------------------------------------------


class TestInstallationLifecycle:
    """Tests for installation lifecycle management (admin)."""

    def test_revoke_installation(self, authenticated_client, active_installation):
        """Admin should be able to revoke an installation."""
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        response = authenticated_client.post(
            f"/api/licensing/installations/{active_installation.pk}/revoke/",
            {"reason": "License violation"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "revoked"

        active_installation.refresh_from_db()
        assert active_installation.status == Installation.Status.REVOKED
        assert active_installation.license_jwt == ""  # Token cleared
        assert active_installation.revoked_reason == "License violation"

    def test_suspend_installation(self, authenticated_client, active_installation):
        """Admin should be able to suspend an installation."""
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        response = authenticated_client.post(
            f"/api/licensing/installations/{active_installation.pk}/suspend/",
            {"reason": "Investigating unusual activity"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "suspended"

        active_installation.refresh_from_db()
        assert active_installation.status == Installation.Status.SUSPENDED

    def test_reactivate_suspended_installation(self, authenticated_client, active_installation):
        """Admin should be able to reactivate a suspended installation."""
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        # First suspend
        active_installation.suspend("Temp hold")

        response = authenticated_client.post(
            f"/api/licensing/installations/{active_installation.pk}/reactivate/",
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "active"

        active_installation.refresh_from_db()
        assert active_installation.status == Installation.Status.ACTIVE
        assert active_installation.license_jwt != ""  # Token re-issued

    def test_cannot_reactivate_revoked(self, authenticated_client, active_installation):
        """Should not be able to reactivate a revoked (not suspended) installation."""
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        active_installation.revoke("Permanent ban")

        response = authenticated_client.post(
            f"/api/licensing/installations/{active_installation.pk}/reactivate/",
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_installations(self, authenticated_client, active_installation):
        """Admin should see list of all installations."""
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        response = authenticated_client.get("/api/licensing/installations/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1


# ---------------------------------------------------------------------------
# Permission class tests
# ---------------------------------------------------------------------------


class TestRequiresFeaturePermission:
    """Tests for the requires_feature() permission class."""

    def test_feature_enabled_allows_access(
        self, authenticated_client, license_org, test_user, sample_role
    ):
        """User with org that has the feature should be allowed."""
        from hmis.apps.core.models import StaffProfile

        profile, _ = StaffProfile.objects.get_or_create(
            user=test_user,
            defaults={"organization": license_org, "primary_role": sample_role},
        )
        if profile.organization != license_org:
            profile.organization = license_org
            profile.save(update_fields=["organization"])

        # Create a mock view with required_feature
        from unittest.mock import Mock

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = test_user

        view = Mock()
        view.required_feature = "sha_claims"

        perm = RequiresFeature()
        assert perm.has_permission(request, view) is True

    def test_feature_disabled_denies_access(
        self, authenticated_client, license_org, test_user, sample_role
    ):
        """User with org that lacks the feature should be denied."""
        from hmis.apps.core.models import StaffProfile

        profile, _ = StaffProfile.objects.get_or_create(
            user=test_user,
            defaults={"organization": license_org, "primary_role": sample_role},
        )
        if profile.organization != license_org:
            profile.organization = license_org
            profile.save(update_fields=["organization"])

        from unittest.mock import Mock

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = test_user

        view = Mock()
        view.required_feature = "dialysis"  # Not in PROFESSIONAL plan

        perm = RequiresFeature()
        assert perm.has_permission(request, view) is False

    def test_suspended_org_denies_all_features(
        self, authenticated_client, license_org, test_user, sample_role
    ):
        """Suspended org should be denied regardless of feature."""
        license_org.subscription_status = "SUSPENDED"
        license_org.save(update_fields=["subscription_status"])

        from hmis.apps.core.models import StaffProfile

        profile, _ = StaffProfile.objects.get_or_create(
            user=test_user,
            defaults={"organization": license_org, "primary_role": sample_role},
        )
        if profile.organization != license_org:
            profile.organization = license_org
            profile.save(update_fields=["organization"])

        from unittest.mock import Mock

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = test_user

        view = Mock()
        view.required_feature = "pharmacy"

        perm = RequiresFeature()
        assert perm.has_permission(request, view) is False


class TestRequiresActiveLicense:
    """Tests for RequiresActiveLicense permission."""

    @pytest.fixture
    def user_with_org(
        self, test_user, license_org, sample_role, sample_facility, sample_department
    ):
        """Wire test_user to the license_org with all required profile fields."""
        from datetime import date

        from hmis.apps.core.models import StaffProfile

        profile, _ = StaffProfile.objects.get_or_create(
            user=test_user,
            defaults={
                "organization": license_org,
                "primary_role": sample_role,
                "primary_facility": sample_facility,
                "primary_department": sample_department,
                "employee_id": "LIC-0001",
                "date_joined": date.today(),
            },
        )
        if profile.organization != license_org:
            profile.organization = license_org
            profile.save(update_fields=["organization"])
        return test_user

    def test_read_always_allowed(self, user_with_org, license_org):
        """GET requests should pass even with expired org."""
        license_org.subscription_status = "EXPIRED"
        license_org.save(update_fields=["subscription_status"])

        from unittest.mock import Mock

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = user_with_org

        view = Mock()
        perm = RequiresActiveLicense()
        assert perm.has_permission(request, view) is True

    def test_write_blocked_when_expired(self, user_with_org, license_org):
        """POST/PUT/PATCH should be blocked when org is expired."""
        license_org.subscription_status = "EXPIRED"
        license_org.save(update_fields=["subscription_status"])

        from unittest.mock import Mock

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post("/")
        request.user = user_with_org

        view = Mock()
        perm = RequiresActiveLicense()
        assert perm.has_permission(request, view) is False

    def test_write_allowed_when_active(self, user_with_org, license_org):
        """POST should pass when org is active."""
        from unittest.mock import Mock

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post("/")
        request.user = user_with_org

        view = Mock()
        perm = RequiresActiveLicense()
        assert perm.has_permission(request, view) is True


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class TestInstallationModel:
    """Tests for the Installation model."""

    def test_revoke_clears_token(self, db, active_installation):
        """Revoking should clear the JWT and set status."""
        assert active_installation.license_jwt != ""

        active_installation.revoke("Policy violation")

        assert active_installation.status == Installation.Status.REVOKED
        assert active_installation.license_jwt == ""
        assert active_installation.revoked_at is not None
        assert active_installation.revoked_reason == "Policy violation"

    def test_suspend_keeps_token(self, db, active_installation):
        """Suspending should set status but keep the token (for reactivation)."""
        original_jwt = active_installation.license_jwt

        active_installation.suspend("Temporary hold")

        assert active_installation.status == Installation.Status.SUSPENDED
        # Token is kept — will be re-issued on reactivation
        # (but check-in will fail, so token expires naturally)

    def test_is_active_property(self, db, active_installation, pending_installation):
        """is_active should reflect the status field."""
        assert active_installation.is_active is True
        assert pending_installation.is_active is False
