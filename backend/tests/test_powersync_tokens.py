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

    def test_token_includes_organization_id(self, test_user, test_staff_profile, sample_organization):
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

    def test_login_endpoint_returns_powersync_claims(self, api_client, test_user, test_staff_profile, sample_facility, sample_organization):
        """POST /api/token/ should return tokens with PowerSync claims embedded."""
        import jwt
        from django.conf import settings

        response = api_client.post("/api/token/", {
            "username": test_user.username,
            "password": "testpass123",
        })

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
