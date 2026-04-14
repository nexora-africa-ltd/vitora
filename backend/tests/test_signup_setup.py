"""
Tests for self-service org signup, email verification, and setup wizard.

Covers:
- EmailVerificationToken model lifecycle
- Organization signup (public)
- Email verification (public)
- Setup wizard check + initialize (public, feature-flagged)
"""

import uuid
from datetime import timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import (
    County,
    EmailVerificationToken,
    Facility,
    Organization,
    StaffProfile,
    SubCounty,
)

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def anon_client(db):
    """Unauthenticated API client."""
    return APIClient()


@pytest.fixture
def sample_county(db):
    """Create a sample county."""
    return County.objects.create(code=1, name="Mombasa")


@pytest.fixture
def sample_sub_county(sample_county):
    """Create a sample sub-county."""
    return SubCounty.objects.create(county=sample_county, name="Mvita")


@pytest.fixture
def signup_data():
    """Valid org signup payload."""
    return {
        "org_name": "Afya Health Clinic",
        "admin_email": "admin@afyahealth.co.ke",
        "admin_first_name": "Jane",
        "admin_last_name": "Wanjiku",
        "admin_password": "StrongPass123!",
        "confirm_password": "StrongPass123!",
    }


@pytest.fixture
def setup_data(sample_county, sample_sub_county):
    """Valid setup wizard payload."""
    return {
        "org_name": "Sunrise Hospital",
        "org_contact_email": "info@sunrise.co.ke",
        "org_contact_phone": "+254712345678",
        "facility_name": "Sunrise Main Branch",
        "facility_mfl_code": "MFL-12345",
        "facility_level": "3",
        "facility_ownership": "PRIVATE",
        "facility_county": sample_county.id,
        "facility_sub_county": sample_sub_county.id,
        "admin_username": "sunrise.admin",
        "admin_email": "admin@sunrise.co.ke",
        "admin_first_name": "Peter",
        "admin_last_name": "Ochieng",
        "admin_password": "SecurePass456!",
        "confirm_password": "SecurePass456!",
    }


# ============================================================================
# EmailVerificationToken Model Tests
# ============================================================================


@pytest.mark.django_db
class TestEmailVerificationToken:
    """Tests for EmailVerificationToken model."""

    def test_auto_generates_token_and_expiry(self):
        user = User.objects.create_user(username="tokenuser", password="pass123")
        org = Organization.objects.create(name="Token Org", slug="token-org")
        token = EmailVerificationToken.objects.create(user=user, organization=org)

        assert token.token is not None
        assert token.expires_at is not None
        assert not token.used
        assert token.is_valid

    def test_is_valid_when_fresh(self):
        user = User.objects.create_user(username="freshuser", password="pass123")
        org = Organization.objects.create(name="Fresh Org", slug="fresh-org")
        token = EmailVerificationToken.objects.create(user=user, organization=org)
        assert token.is_valid

    def test_not_valid_after_consume(self):
        user = User.objects.create_user(username="consumeuser", password="pass123")
        org = Organization.objects.create(name="Consume Org", slug="consume-org")
        token = EmailVerificationToken.objects.create(user=user, organization=org)
        token.consume()
        assert not token.is_valid
        assert token.used
        assert token.used_at is not None

    def test_not_valid_after_expiry(self):
        user = User.objects.create_user(username="expuser", password="pass123")
        org = Organization.objects.create(name="Exp Org", slug="exp-org")
        token = EmailVerificationToken.objects.create(user=user, organization=org)
        token.expires_at = timezone.now() - timedelta(hours=1)
        token.save(update_fields=["expires_at"])
        assert not token.is_valid


# ============================================================================
# Organization Signup Tests
# ============================================================================


@pytest.mark.django_db
class TestOrgSignup:
    """Tests for self-service organization signup endpoint."""

    def test_signup_creates_org_user_and_token(self, anon_client, signup_data):
        response = anon_client.post("/api/core/auth/signup/", signup_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "message" in response.data
        assert response.data["org_name"] == "Afya Health Clinic"

        # Verify org created (inactive + unverified)
        org = Organization.objects.get(name="Afya Health Clinic")
        assert not org.is_active
        assert not org.is_verified

        # Verify user created
        user = User.objects.get(email="admin@afyahealth.co.ke")
        assert user.first_name == "Jane"
        assert user.is_staff
        assert user.is_active

        # Verify StaffProfile
        profile = StaffProfile.objects.get(user=user)
        assert profile.organization == org
        assert not profile.must_change_password

        # Verify token created
        token = EmailVerificationToken.objects.get(user=user, organization=org)
        assert token.is_valid

    def test_signup_duplicate_org_name_rejected(self, anon_client, signup_data):
        Organization.objects.create(name="Afya Health Clinic", slug="afya-health-clinic")
        response = anon_client.post("/api/core/auth/signup/", signup_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_signup_duplicate_email_rejected(self, anon_client, signup_data):
        User.objects.create_user(
            username="existing", email="admin@afyahealth.co.ke", password="pass123"
        )
        response = anon_client.post("/api/core/auth/signup/", signup_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_signup_password_mismatch_rejected(self, anon_client, signup_data):
        signup_data["confirm_password"] = "DifferentPass456!"
        response = anon_client.post("/api/core/auth/signup/", signup_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_signup_generates_unique_slug(self, anon_client, signup_data):
        # Create an org that would conflict on slug
        Organization.objects.create(name="Existing Org", slug="afya-health-clinic")
        response = anon_client.post("/api/core/auth/signup/", signup_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        org = Organization.objects.get(name="Afya Health Clinic")
        assert org.slug != "afya-health-clinic"
        assert org.slug.startswith("afya-health-clinic")


# ============================================================================
# Email Verification Tests
# ============================================================================


@pytest.mark.django_db
class TestEmailVerification:
    """Tests for email verification endpoint."""

    def test_verify_marks_org_as_verified(self, anon_client):
        user = User.objects.create_user(
            username="verifyuser", email="v@test.com", password="pass123"
        )
        org = Organization.objects.create(
            name="Verify Org", slug="verify-org", is_active=False, is_verified=False
        )
        token = EmailVerificationToken.objects.create(user=user, organization=org)

        response = anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(token.token)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "verified" in response.data["message"].lower()

        org.refresh_from_db()
        assert org.is_verified
        # Org should still be inactive (pending admin review)
        assert not org.is_active

        token.refresh_from_db()
        assert token.used

    def test_verify_invalid_token_rejected(self, anon_client):
        response = anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(uuid.uuid4())},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_expired_token_rejected(self, anon_client):
        user = User.objects.create_user(username="expuser2", password="pass123")
        org = Organization.objects.create(name="Exp Org 2", slug="exp-org-2")
        token = EmailVerificationToken.objects.create(user=user, organization=org)
        token.expires_at = timezone.now() - timedelta(hours=1)
        token.save(update_fields=["expires_at"])

        response = anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(token.token)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_used_token_rejected(self, anon_client):
        user = User.objects.create_user(username="useduser", password="pass123")
        org = Organization.objects.create(name="Used Org", slug="used-org")
        token = EmailVerificationToken.objects.create(user=user, organization=org)
        token.consume()

        response = anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(token.token)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# Setup Wizard Tests
# ============================================================================


@pytest.mark.django_db
class TestSetupCheck:
    """Tests for setup wizard check endpoint."""

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_check_returns_required_when_no_orgs(self, anon_client):
        response = anon_client.get("/api/core/setup/check/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["setup_required"] is True
        assert response.data["has_organizations"] is False

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_check_returns_required_when_org_exists_but_no_facility(self, anon_client):
        """Org alone is not enough — facility + staff required."""
        Organization.objects.create(name="Existing", slug="existing")
        response = anon_client.get("/api/core/setup/check/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["setup_required"] is True
        assert response.data["has_organizations"] is True
        assert response.data["has_facilities"] is False

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_check_returns_not_required_when_setup_complete(self, anon_client, setup_data):
        """Setup complete = org + facility + staff linked to facility."""
        # Run the full setup wizard to create everything properly
        anon_client.post("/api/core/setup/initialize/", setup_data, format="json")
        response = anon_client.get("/api/core/setup/check/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["setup_required"] is False
        assert response.data["has_organizations"] is True
        assert response.data["has_facilities"] is True
        assert response.data["has_staff_with_facility"] is True

    @override_settings(SETUP_WIZARD_ENABLED=False)
    def test_check_returns_not_required_when_disabled(self, anon_client):
        response = anon_client.get("/api/core/setup/check/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["setup_required"] is False


@pytest.mark.django_db
class TestSetupInitialize:
    """Tests for setup wizard initialization."""

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_initialize_creates_org_facility_and_admin(self, anon_client, setup_data):
        response = anon_client.post("/api/core/setup/initialize/", setup_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["org_name"] == "Sunrise Hospital"
        assert response.data["facility_name"] == "Sunrise Main Branch"
        assert response.data["username"] == "sunrise.admin"

        # Verify org created (active + verified)
        org = Organization.objects.get(name="Sunrise Hospital")
        assert org.is_active
        assert org.is_verified

        # Verify facility
        facility = Facility.objects.get(mfl_code="MFL-12345")
        assert facility.organization == org
        assert facility.is_headquarters
        assert facility.is_active

        # Verify admin user
        user = User.objects.get(username="sunrise.admin")
        assert user.is_staff
        assert user.is_superuser
        assert user.check_password("SecurePass456!")

        # Verify StaffProfile
        profile = StaffProfile.objects.get(user=user)
        assert profile.organization == org
        assert profile.primary_facility == facility

    @override_settings(SETUP_WIZARD_ENABLED=False)
    def test_initialize_rejected_when_disabled(self, anon_client, setup_data):
        response = anon_client.post("/api/core/setup/initialize/", setup_data, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_initialize_rejected_when_orgs_exist(self, anon_client, setup_data):
        Organization.objects.create(name="Existing", slug="existing")
        response = anon_client.post("/api/core/setup/initialize/", setup_data, format="json")
        assert response.status_code == status.HTTP_409_CONFLICT

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_initialize_password_mismatch_rejected(self, anon_client, setup_data):
        setup_data["confirm_password"] = "WrongPass!"
        response = anon_client.post("/api/core/setup/initialize/", setup_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(SETUP_WIZARD_ENABLED=True)
    def test_initialize_duplicate_mfl_rejected(
        self, anon_client, setup_data, sample_county, sample_sub_county
    ):
        """MFL code uniqueness is enforced even during setup.

        Since setup_initialize rejects when orgs exist (HTTP 409), we test the
        MFL validation at the serializer level instead of through the endpoint.
        """
        from hmis.apps.core.serializers import SetupWizardSerializer

        # Pre-create a facility with the same MFL code
        other_org = Organization.objects.create(name="Other", slug="other")
        Facility.objects.create(
            organization=other_org,
            name="Old Facility",
            mfl_code="MFL-12345",
            level="2",
            ownership="GOK",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        serializer = SetupWizardSerializer(data=setup_data)
        assert not serializer.is_valid()
        assert "facility_mfl_code" in serializer.errors
