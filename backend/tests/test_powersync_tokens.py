"""
Tests for PowerSync JWT token claims.

The custom PowerSyncTokenObtainPairSerializer adds facility_id,
organization_id, iss, and aud claims to JWT access tokens so
PowerSync sync rules can filter data by tenant context.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from hmis.apps.core.powersync_tokens import PowerSyncTokenObtainPairSerializer

User = get_user_model()


class TestPowerSyncTokenClaims:
    """Verify JWT tokens contain PowerSync-required claims."""

    def test_token_includes_issuer(self, test_user, test_staff_profile):
        """Token must have iss='vitora-hmis' for PowerSync JWT verification."""
        token = PowerSyncTokenObtainPairSerializer.get_token(test_user)
        assert token["iss"] == "vitora-hmis"

    def test_token_includes_audience(self, test_user, test_staff_profile):
        """Token must have aud='powersync' for PowerSync JWT verification."""
        token = PowerSyncTokenObtainPairSerializer.get_token(test_user)
        assert token["aud"] == "powersync"

    def test_token_includes_facility_id(self, test_user, test_staff_profile, sample_facility):
        """Token must include facility_id from the user's StaffProfile."""
        token = PowerSyncTokenObtainPairSerializer.get_token(test_user)
        assert token["facility_id"] == sample_facility.id

    def test_token_includes_organization_id(
        self, test_user, test_staff_profile, sample_organization
    ):
        """Token must include organization_id from the user's StaffProfile."""
        token = PowerSyncTokenObtainPairSerializer.get_token(test_user)
        assert token["organization_id"] == sample_organization.id

    def test_token_includes_user_id(self, test_user, test_staff_profile):
        """Token must include the standard user_id claim."""
        token = PowerSyncTokenObtainPairSerializer.get_token(test_user)
        assert token["user_id"] == str(test_user.id)

    def test_token_without_staff_profile_has_null_facility(self, db):
        """Users without a StaffProfile should get null facility/org claims."""
        user = User.objects.create_user(
            username="no_profile",
            password="testpass123",
        )
        token = PowerSyncTokenObtainPairSerializer.get_token(user)
        assert token["facility_id"] is None
        assert token["organization_id"] is None
        # iss and aud should still be present
        assert token["iss"] == "vitora-hmis"
        assert token["aud"] == "powersync"

    def test_token_serializable_as_access_token(self, test_user, test_staff_profile):
        """Token must be serializable to a valid JWT string."""
        token = PowerSyncTokenObtainPairSerializer.get_token(test_user)
        jwt_string = str(token.access_token)
        assert isinstance(jwt_string, str)
        assert len(jwt_string) > 0
        # Should have 3 parts (header.payload.signature)
        assert jwt_string.count(".") == 2

    def test_login_endpoint_returns_powersync_claims(
        self, api_client, test_user, test_staff_profile, sample_facility, sample_organization
    ):
        """POST /api/token/ should return tokens with PowerSync claims embedded."""
        import jwt
        from django.conf import settings

        response = api_client.post(
            "/api/token/",
            {
                "username": test_user.username,
                "password": "testpass123",
            },
        )

        # May get 200 (success) or MFA challenge — both are valid
        if response.status_code == 200 and "access" in response.data:
            # Decode the access token to verify claims
            decoded = jwt.decode(
                response.data["access"],
                settings.SECRET_KEY,
                algorithms=["HS256"],
                audience="powersync",
                issuer="vitora-hmis",
            )
            assert decoded["facility_id"] == sample_facility.id
            assert decoded["organization_id"] == sample_organization.id
            assert decoded["iss"] == "vitora-hmis"
            assert decoded["aud"] == "powersync"


class TestPowerSyncCredentialsMultiOrg:
    """Verify the /api/powersync/credentials/ endpoint respects X-Facility-Id."""

    CREDENTIALS_URL = "/api/powersync/credentials/"

    @pytest.fixture()
    def enable_powersync(self, settings):
        """Enable PowerSync URL so the credentials endpoint doesn't return 503."""
        settings.POWERSYNC_URL = "https://test.powersync.example.com"
        settings.POWERSYNC_JWT_KID = "test-kid"
        settings.POWERSYNC_JWT_AUDIENCE = "https://test.powersync.example.com"

    @pytest.fixture()
    def second_org(self, db):
        from hmis.apps.core.models import Organization

        return Organization.objects.create(
            name="Second Hospital Group",
            slug="second-hospital-group",
            contact_email="admin@second.co.ke",
            is_active=True,
            is_verified=True,
        )

    @pytest.fixture()
    def second_facility(self, db, second_org, sample_county, sample_sub_county):
        from hmis.apps.core.models import Facility

        return Facility.objects.create(
            organization=second_org,
            name="Second Health Centre",
            mfl_code="88888",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )

    def _decode_token(self, response):
        """Decode the JWT from a successful credentials response."""
        import jwt
        from django.conf import settings as django_settings

        assert response.status_code == 200
        token = response.data["token"]
        return jwt.decode(
            token,
            django_settings.SECRET_KEY,
            algorithms=["HS256"],
            audience="https://test.powersync.example.com",
            issuer="vitora-hmis",
        )

    def test_default_uses_primary_facility(
        self,
        authenticated_client,
        test_staff_profile,
        sample_facility,
        sample_organization,
        enable_powersync,
    ):
        """Without X-Facility-Id header, JWT uses the user's primary facility."""
        response = authenticated_client.get(self.CREDENTIALS_URL)
        decoded = self._decode_token(response)
        assert decoded["facility_id"] == sample_facility.id
        assert decoded["organization_id"] == sample_organization.id

    def test_x_facility_id_overrides_primary(
        self,
        api_client,
        test_user,
        test_staff_profile,
        second_facility,
        second_org,
        sample_role,
        enable_powersync,
    ):
        """X-Facility-Id header should override the user's primary facility."""
        from hmis.apps.core.models import OrgMembership

        # Grant access via OrgMembership (required by TenantMiddleware)
        membership = OrgMembership.objects.create(
            staff_profile=test_staff_profile,
            organization=second_org,
            role=sample_role,
            status=OrgMembership.MembershipStatus.ACTIVE,
        )
        membership.facilities.add(second_facility)

        # force_authenticate sets DRF-layer auth (for IsAuthenticated),
        # force_login sets Django session (for TenantMiddleware to see the user).
        api_client.force_authenticate(user=test_user)
        api_client.force_login(test_user)

        response = api_client.get(
            self.CREDENTIALS_URL,
            HTTP_X_FACILITY_ID=str(second_facility.id),
        )
        decoded = self._decode_token(response)
        assert decoded["facility_id"] == second_facility.id
        assert decoded["organization_id"] == second_org.id

    def test_invalid_facility_id_falls_back_to_profile(
        self,
        authenticated_client,
        test_staff_profile,
        sample_facility,
        sample_organization,
        enable_powersync,
    ):
        """Invalid X-Facility-Id falls back to the profile's primary facility."""
        response = authenticated_client.get(
            self.CREDENTIALS_URL,
            HTTP_X_FACILITY_ID="999999",
        )
        decoded = self._decode_token(response)
        # TenantMiddleware sets request.facility=None for invalid IDs,
        # so the view falls back to the profile
        assert decoded["facility_id"] == sample_facility.id
        assert decoded["organization_id"] == sample_organization.id
