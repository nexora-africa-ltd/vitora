"""
Tests for TibaBot user-identity JWT minting and dual-layer auth.

Tests cover:
- JWT minting with valid user + secret
- JWT claims structure (standard + tibabot/* namespaced)
- Graceful no-op when TIBABOT_JWT_SECRET is empty
- Role mapping to TibaBot-expected lowercase values
- Facility level parsing
- Thread-local tibabot_user_context context manager
- TibaBotClient sends Bearer header when user context is set
- TibaBotClient omits Bearer header when no user or no secret
"""

import time
from datetime import date
from unittest.mock import MagicMock, patch

import jwt
import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.ai.client import TibaBotClient, _get_current_user, tibabot_user_context
from hmis.apps.ai.tokens import _map_role, _parse_facility_level, mint_tibabot_jwt

TEST_SECRET = "test-tibabot-jwt-secret-32bytes!"


@pytest.mark.django_db
class TestMintTibabotJWT:
    """Tests for the mint_tibabot_jwt function."""

    @override_settings(TIBABOT_JWT_SECRET="")
    def test_returns_none_when_secret_empty(self, test_user):
        """Should gracefully return None when TIBABOT_JWT_SECRET is not set."""
        result = mint_tibabot_jwt(test_user)
        assert result is None

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_ISSUER="vitora.nexora.africa",
        TIBABOT_JWT_AUDIENCE="tibabot-api",
        TIBABOT_JWT_EXPIRY_SECONDS=300,
    )
    def test_returns_valid_jwt_with_standard_claims(self, test_user):
        """Should produce a decodable JWT with sub, iss, aud, iat, exp."""
        token = mint_tibabot_jwt(test_user)
        assert token is not None

        claims = jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")
        assert claims["sub"] == str(test_user.pk)
        assert claims["iss"] == "vitora.nexora.africa"
        assert claims["aud"] == "tibabot-api"
        assert "iat" in claims
        assert "exp" in claims
        assert claims["exp"] - claims["iat"] == 300

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_ISSUER="vitora.nexora.africa",
        TIBABOT_JWT_AUDIENCE="tibabot-api",
        TIBABOT_JWT_EXPIRY_SECONDS=300,
    )
    def test_includes_display_name(self, test_user):
        """Should include tibabot/name when user has first/last name."""
        test_user.first_name = "Dr."
        test_user.last_name = "Ochieng"
        test_user.save()

        token = mint_tibabot_jwt(test_user)
        claims = jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")
        assert claims["tibabot/name"] == "Dr. Ochieng"

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_includes_role_and_org_from_staff_profile(
        self, test_user, sample_organization, sample_facility
    ):
        """Should include tibabot/role, tibabot/org_id, tibabot/facility_id."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role, _ = Role.objects.get_or_create(
            code="DOCTOR",
            defaults={"name": "Doctor", "hierarchy_level": 5, "is_active": True},
        )
        dept, _ = Department.objects.get_or_create(
            code="MED", defaults={"name": "Medical", "is_active": True}
        )
        StaffProfile.objects.get_or_create(
            user=test_user,
            defaults={
                "employee_id": f"TOK-{test_user.pk}",
                "organization": sample_organization,
                "primary_facility": sample_facility,
                "primary_department": dept,
                "primary_role": role,
                "date_joined": date.today(),
            },
        )

        token = mint_tibabot_jwt(test_user)
        claims = jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")
        assert claims["tibabot/role"] == "doctor"
        assert claims["tibabot/org_id"] == str(sample_organization.pk)
        assert claims["tibabot/facility_id"] == str(sample_facility.pk)

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_includes_facility_level(self, test_user, sample_organization, sample_facility):
        """Should parse facility level string to int in tibabot/facility_level."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        # sample_facility has level="3" (string)
        role, _ = Role.objects.get_or_create(
            code="NURSE",
            defaults={"name": "Nurse", "hierarchy_level": 7, "is_active": True},
        )
        dept, _ = Department.objects.get_or_create(
            code="NUR", defaults={"name": "Nursing", "is_active": True}
        )
        StaffProfile.objects.get_or_create(
            user=test_user,
            defaults={
                "employee_id": f"TOK-LVL-{test_user.pk}",
                "organization": sample_organization,
                "primary_facility": sample_facility,
                "primary_department": dept,
                "primary_role": role,
                "date_joined": date.today(),
            },
        )

        token = mint_tibabot_jwt(test_user)
        claims = jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")
        assert claims["tibabot/facility_level"] == 3

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_no_staff_profile_still_works(self, test_user):
        """Should produce a JWT even when user has no StaffProfile."""
        test_user.first_name = "Jane"
        test_user.last_name = "Doe"
        test_user.save()

        token = mint_tibabot_jwt(test_user)
        assert token is not None
        claims = jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")
        assert claims["sub"] == str(test_user.pk)
        assert claims["tibabot/name"] == "Jane Doe"
        # No role/org/facility claims when no staff profile
        assert "tibabot/role" not in claims
        assert "tibabot/org_id" not in claims


class TestRoleMapping:
    """Tests for role code to TibaBot role string mapping."""

    @pytest.mark.parametrize(
        "code,expected",
        [
            ("DOCTOR", "doctor"),
            ("CLINICAL_OFFICER", "clinical_officer"),
            ("NURSE", "nurse"),
            ("CHW", "chw"),
            ("PHARMACIST", "pharmacist"),
            ("LAB_TECH", "lab_tech"),
            ("LAB_SCIENTIST", "lab_scientist"),
            ("ADMIN", "admin"),
            ("ORG-ADMIN", "admin"),
            ("OWNER", "admin"),
            ("UNKNOWN_ROLE", "unknown_role"),
        ],
    )
    def test_role_mapping(self, code, expected):
        assert _map_role(code) == expected


class TestFacilityLevelParsing:
    """Tests for facility level string/int parsing."""

    @pytest.mark.parametrize(
        "value,expected",
        [
            (3, 3),
            (1, 1),
            (6, 6),
            (0, None),
            (7, None),
            ("3", 3),
            ("L3", 3),
            ("L5", 5),
            ("invalid", None),
            ("", None),
        ],
    )
    def test_parse_facility_level(self, value, expected):
        assert _parse_facility_level(value) == expected


class TestTibabotUserContext:
    """Tests for the thread-local user context manager."""

    def test_sets_and_clears_user(self, test_user):
        """Should set user during context and clear after."""
        assert _get_current_user() is None
        with tibabot_user_context(test_user):
            assert _get_current_user() is test_user
        assert _get_current_user() is None

    def test_clears_user_on_exception(self, test_user):
        """Should clear user even when block raises."""
        try:
            with tibabot_user_context(test_user):
                assert _get_current_user() is test_user
                raise ValueError("boom")
        except ValueError:
            pass
        assert _get_current_user() is None


@pytest.mark.django_db
class TestTibaBotClientBearerHeader:
    """Tests that TibaBotClient sends the Authorization: Bearer header."""

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
        TIBABOT_API_URL="https://tibabot.test",
        TIBABOT_API_KEY="tb_test123",
    )
    def test_request_includes_bearer_when_user_context_set(self, test_user):
        """Should include Authorization: Bearer when tibabot_user_context is active."""
        client = TibaBotClient()

        with patch.object(client.session, "request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"ok": True}
            mock_response.raise_for_status = MagicMock()
            mock_request.return_value = mock_response

            with tibabot_user_context(test_user):
                client._request("GET", "/health")

            call_kwargs = mock_request.call_args
            headers = call_kwargs.kwargs.get("headers", {})
            assert "Authorization" in headers
            assert headers["Authorization"].startswith("Bearer ")

            # Verify it's a valid JWT
            token = headers["Authorization"].split(" ", 1)[1]
            claims = jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")
            assert claims["sub"] == str(test_user.pk)

    @override_settings(
        TIBABOT_JWT_SECRET="",
        TIBABOT_API_URL="https://tibabot.test",
        TIBABOT_API_KEY="tb_test123",
    )
    def test_request_omits_bearer_when_no_secret(self, test_user):
        """Should NOT include Authorization when TIBABOT_JWT_SECRET is empty."""
        client = TibaBotClient()

        with patch.object(client.session, "request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"ok": True}
            mock_response.raise_for_status = MagicMock()
            mock_request.return_value = mock_response

            with tibabot_user_context(test_user):
                client._request("GET", "/health")

            call_kwargs = mock_request.call_args
            headers = call_kwargs.kwargs.get("headers", {})
            assert "Authorization" not in headers

    @override_settings(
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_API_URL="https://tibabot.test",
        TIBABOT_API_KEY="tb_test123",
    )
    def test_request_omits_bearer_when_no_user_context(self):
        """Should NOT include Authorization when no tibabot_user_context is set."""
        client = TibaBotClient()

        with patch.object(client.session, "request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"ok": True}
            mock_response.raise_for_status = MagicMock()
            mock_request.return_value = mock_response

            client._request("GET", "/health")

            call_kwargs = mock_request.call_args
            headers = call_kwargs.kwargs.get("headers", {})
            assert "Authorization" not in headers


@pytest.mark.django_db
class TestAIFeatureGatedMixinSetsUserContext:
    """Tests that AIFeatureGatedMixin sets tibabot_user_context during dispatch."""

    @override_settings(
        TIBABOT_ENABLED=True,
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_icd10_suggest_sends_bearer_header(self, authenticated_client):
        """Should send Bearer header in TibaBot request when user is authenticated."""
        mock_response = {
            "suggestions": [{"code": "B50.9", "description": "Malaria", "confidence": 0.9}]
        }

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.suggest_icd10.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/icd10-suggest/",
                {"clinical_text": "fever and chills"},
                format="json",
            )
            assert response.status_code == 200
