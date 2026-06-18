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
import json
import uuid
from typing import Any, cast

import jwt as pyjwt
import pytest  # type: ignore
from django.conf import settings
from django.core.management import call_command
from django.test import override_settings
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
        installation_id=f"pending-{uuid.uuid4()}",
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
        installation_id=f"active-{uuid.uuid4()}",
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
        assert pending_installation.installation_id == str(client_uuid)
        assert pending_installation.activation_code == ""  # Cleared
        assert pending_installation.license_jwt != ""

    def test_activation_returns_hub_bootstrap_payload(self, api_client, pending_installation):
        """Activation should return org/facility data needed to seed a local hub."""
        client_uuid = uuid.uuid4()

        response = api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(client_uuid),
                "activation_code": "TEST-ACTIVATION-CODE",
                "app_version": "0.2.0",
                "os_info": "Windows 11",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["sync_url"] == settings.SYNC_SERVER_URL
        assert response.data["encryption_key"] == settings.ENCRYPTION_KEY
        assert response.data["pii_hmac_key"] == settings.PII_HMAC_KEY
        assert response.data["organization"] == {
            "id": pending_installation.organization.id,
            "name": pending_installation.organization.name,
            "slug": pending_installation.organization.slug,
            "contact_email": pending_installation.organization.contact_email,
            "contact_phone": pending_installation.organization.contact_phone,
        }
        assert response.data["facility"]["id"] == pending_installation.facility.id
        assert response.data["facility"]["name"] == pending_installation.facility.name
        assert response.data["facility"]["mfl_code"] == pending_installation.facility.mfl_code
        assert response.data["facility"]["level"] == pending_installation.facility.level
        assert response.data["facility"]["ownership"] == pending_installation.facility.ownership
        assert response.data["facility"]["county_id"] == pending_installation.facility.county_id
        assert (
            response.data["facility"]["sub_county_id"]
            == pending_installation.facility.sub_county_id
        )
        assert response.data["facility"]["modules"]["outpatient"] is True
        assert "bootstrap" in response.data
        assert "departments" in response.data["bootstrap"]
        assert "roles" in response.data["bootstrap"]

    @override_settings(
        SYNC_SERVER_URL="http://localhost:9088/api/sync",
        CLOUD_API_BASE_URL="https://vitora-api.example.test",
    )
    def test_activation_sync_url_uses_cloud_base_url(self, api_client, pending_installation):
        """Activation should derive hub sync URL from configured cloud API base URL."""
        response = api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(uuid.uuid4()),
                "activation_code": "TEST-ACTIVATION-CODE",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["sync_url"] == "https://vitora-api.example.test/api/sync"

    @override_settings(
        DEBUG=False,
        ALLOWED_HOSTS=["vitora-api.agreeabledune-6cc420cc.eastus.azurecontainerapps.io"],
        SYNC_SERVER_URL="http://localhost:9088/api/sync",
        CLOUD_API_BASE_URL="",
    )
    def test_activation_sync_url_falls_back_to_request_origin(
        self, api_client, pending_installation
    ):
        """Activation should use the request host when no cloud base URL is configured."""
        response = api_client.post(
            "/api/licensing/activate/",
            {
                "installation_id": str(uuid.uuid4()),
                "activation_code": "TEST-ACTIVATION-CODE",
            },
            format="json",
            HTTP_HOST="vitora-api.agreeabledune-6cc420cc.eastus.azurecontainerapps.io",
            secure=True,
        )

        assert response.status_code == status.HTTP_200_OK
        assert (
            response.data["sync_url"]
            == "https://vitora-api.agreeabledune-6cc420cc.eastus.azurecontainerapps.io/api/sync"
        )

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


class TestSeedFromActivationCommand:
    """Tests for seeding hub identity from the cloud activation response."""

    def test_seed_from_activation_creates_org_and_facility_with_cloud_ids(
        self, db, tmp_path, sample_county, sample_sub_county
    ):
        """Command should mirror cloud org/facility primary keys locally."""
        from hmis.apps.core.models import Facility, Organization

        payload = {
            "installation_id": "hub-test-001",
            "status": "ACTIVE",
            "sync_url": "https://api.vitora.digital/api/sync",
            "organization": {
                "id": 4242,
                "name": "Demo Health Facility Group",
                "slug": "demo-health-facility-group",
                "contact_email": "admin@example.test",
                "contact_phone": "+254700000000",
            },
            "facility": {
                "id": 9090,
                "name": "Demo Health Facility",
                "mfl_code": "MFL-9090",
                "level": "4",
                "ownership": "PRIVATE",
                "county_id": sample_county.id,
                "county_name": sample_county.name,
                "sub_county_id": sample_sub_county.id,
                "sub_county_name": sample_sub_county.name,
                "modules": {
                    "outpatient": True,
                    "inpatient": True,
                    "pharmacy": True,
                    "laboratory": True,
                    "billing": True,
                    "imaging": False,
                },
            },
            "bootstrap": {"departments": [], "roles": []},
        }
        response_file = tmp_path / "activation.json"
        response_file.write_text(json.dumps(payload))

        call_command("seed_from_activation", response_file=str(response_file), verbosity=0)

        org = Organization.objects.get(pk=4242)
        facility = Facility.objects.get(pk=9090)
        assert org.name == "Demo Health Facility Group"
        assert org.slug == "demo-health-facility-group"
        assert org.contact_email == "admin@example.test"
        assert org.contact_phone == "+254700000000"
        assert org.is_active is True
        assert org.is_verified is True
        assert facility.organization == org
        assert facility.name == "Demo Health Facility"
        assert facility.mfl_code == "MFL-9090"
        assert facility.county == sample_county
        assert facility.sub_county == sample_sub_county
        assert facility.has_outpatient is True
        assert facility.has_inpatient is True
        assert facility.has_pharmacy is True
        assert facility.has_laboratory is True
        assert facility.has_billing is True
        assert facility.has_imaging is False


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
        """Revoked installation should get 401 (triggers hub token wipe)."""
        active_installation.revoke(reason="Payment failed")

        response = api_client.post(
            "/api/licensing/check-in/",
            {"installation_id": str(active_installation.installation_id)},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
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

    def test_multiple_pending_codes_can_coexist(self, authenticated_client, license_org):
        """Generating multiple pending codes should not collide on installation_id.

        Regression: installation_id had default="" + unique=True, so only one
        pending row could exist at a time. Fixed by pre-populating a unique
        placeholder identifier on creation.
        """
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.is_superuser = True
        user.save()

        ids = []
        for i in range(3):
            response = authenticated_client.post(
                "/api/licensing/generate-code/",
                {"organization_id": license_org.pk, "name": f"Hub {i}"},
                format="json",
            )
            assert response.status_code == status.HTTP_201_CREATED, response.data
            ids.append(response.data["id"])

        # All three rows exist with unique placeholder installation_ids
        from hmis.apps.licensing.models import Installation

        rows = Installation.objects.filter(pk__in=ids)
        assert rows.count() == 3
        placeholders = {row.installation_id for row in rows}
        assert len(placeholders) == 3, "Placeholder installation_ids must be unique"
        for ph in placeholders:
            assert ph.startswith("pending-"), f"Expected placeholder, got {ph!r}"

    def test_activate_overwrites_placeholder_installation_id(self, api_client, license_org):
        """After installer activation, installation_id should be the hub-generated value.

        Regression: previously the row was created with installation_id="" and
        the activate view would update it, but customers reported it didn't
        appear to "sync back". Now we pre-populate a placeholder and the
        activate view explicitly replaces it.
        """
        # Create a pending row via the admin endpoint
        from django.contrib.auth import get_user_model

        from hmis.apps.licensing.models import Installation

        admin = get_user_model().objects.create_user(
            "admin-x", password="x", is_staff=True, is_superuser=True
        )
        api_client.force_authenticate(user=admin)
        gen_response = api_client.post(
            "/api/licensing/generate-code/",
            {"organization_id": license_org.pk, "name": "Reception"},
            format="json",
        )
        assert gen_response.status_code == status.HTTP_201_CREATED
        installation_pk = gen_response.data["id"]
        activation_code = gen_response.data["activation_code"]

        pending = Installation.objects.get(pk=installation_pk)
        assert pending.installation_id.startswith("pending-")

        # Now simulate the installer activating
        api_client.force_authenticate(user=None)
        hub_id = "hub-CUSTOMER-PC-1734512000"
        activate_response = api_client.post(
            "/api/licensing/activate/",
            {"activation_code": activation_code, "installation_id": hub_id},
            format="json",
        )
        assert activate_response.status_code == status.HTTP_200_OK, activate_response.data

        # The row's installation_id should now be the hub-generated value
        activated = Installation.objects.get(pk=installation_pk)
        assert activated.installation_id == hub_id
        assert activated.status == Installation.Status.ACTIVE
        # And the response payload reflects it
        assert activate_response.data["installation_id"] == hub_id


# ---------------------------------------------------------------------------
# Bootstrap seeding tests
# ---------------------------------------------------------------------------


class TestSeedBootstrapData:
    """Tests for seed_bootstrap_data (activation payload → local hub records)."""

    def test_seeds_system_role_without_collision(self, db, license_org, sample_facility):
        """A system role (organization_id=None) in the payload must update the
        existing hub-side system role rather than failing the global unique
        constraint on Role.code.

        Regression: bootstrap previously called update_or_create with
        organization=<customer_org> in the lookup, which missed the existing
        org=None system role, then INSERT failed on `UNIQUE constraint failed:
        core_role.code` during seed_from_activation.
        """
        from hmis.apps.core.models import Role
        from hmis.apps.licensing.bootstrap import seed_bootstrap_data

        # Simulate initialize_hub having seeded a global system role
        Role.objects.create(
            code="DOCTOR",
            name="Doctor (system)",
            category="CLINICAL",
            scope="ORG",
            organization=None,
        )

        payload = {
            "departments": [],
            "roles": [
                {
                    "code": "DOCTOR",
                    "name": "Doctor",
                    "category": "CLINICAL",
                    "scope": "ORG",
                    "organization_id": None,
                    "facility_id": None,
                    "permissions_matrix": {},
                    "hierarchy_level": 20,
                    "is_active": True,
                },
            ],
        }

        counts = seed_bootstrap_data(payload, organization=license_org, facility=sample_facility)

        # Should not raise, should update existing system role (not create new)
        assert counts["roles"] == 0
        role = Role.objects.get(code="DOCTOR")
        assert role.organization is None, "System role must keep organization=None"
        assert role.name == "Doctor"

    def test_seeds_org_scoped_role_attaches_to_organization(self, db, license_org, sample_facility):
        """A payload role with organization_id set should be attached to the
        activating organization on the hub."""
        from hmis.apps.core.models import Role
        from hmis.apps.licensing.bootstrap import seed_bootstrap_data

        payload = {
            "departments": [],
            "roles": [
                {
                    "code": "CUSTOM-ROLE",
                    "name": "Custom Role",
                    "category": "CLINICAL",
                    "scope": "FACILITY",
                    "organization_id": 99,  # Whatever cloud org id; hub maps to its org
                    "facility_id": 99,
                    "permissions_matrix": {},
                    "hierarchy_level": 50,
                    "is_active": True,
                },
            ],
        }

        counts = seed_bootstrap_data(payload, organization=license_org, facility=sample_facility)

        assert counts["roles"] == 1
        role = Role.objects.get(code="CUSTOM-ROLE")
        role_with_fk_ids = cast(Any, role)
        assert role_with_fk_ids.organization_id == license_org.pk
        assert role_with_fk_ids.facility_id == sample_facility.pk


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


@pytest.mark.django_db
class TestRequiresActiveLicense:
    """Tests for RequiresActiveLicense permission."""

    @pytest.fixture(autouse=True)
    def enable_enforcement(self, settings):
        """Enable subscription expiry enforcement for these tests."""
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = True

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
