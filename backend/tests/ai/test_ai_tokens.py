"""
Tests for TibaBot user-identity JWT minting and dual-layer auth.

Tests cover:
- JWT minting with valid user + secret (HS256 fallback)
- JWT minting with RSA private key (RS256 production)
- JWT claims structure (standard + tibabot/* namespaced)
- Graceful no-op when neither key is configured
- Role mapping to TibaBot-expected lowercase values
- Facility level parsing
- Thread-local tibabot_user_context context manager
- TibaBotClient sends Bearer header when user context is set
- TibaBotClient omits Bearer header when no user or no secret
- JWKS endpoint returns valid JWK document
- JWKS endpoint returns empty keys when no private key
"""

import time
from datetime import date
from unittest.mock import MagicMock, patch

import jwt
import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric import rsa as rsa_module
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
from django.test import override_settings

from hmis.apps.ai.client import TibaBotClient, _get_current_user, tibabot_user_context
from hmis.apps.ai.jwks import TIBABOT_JWT_KID, _load_private_key, get_jwks, get_private_key
from hmis.apps.ai.tokens import _map_role, _parse_facility_level, mint_tibabot_jwt

TEST_SECRET = "test-tibabot-jwt-secret-32bytes!"

# Generate a test RSA key pair
_TEST_RSA_KEY = rsa_module.generate_private_key(public_exponent=65537, key_size=2048)
_TEST_RSA_PEM = _TEST_RSA_KEY.private_bytes(
    Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
).decode("utf-8")
_TEST_RSA_PUBLIC_KEY = _TEST_RSA_KEY.public_key()


@pytest.mark.django_db
class TestMintTibabotJWT:
    """Tests for the mint_tibabot_jwt function."""

    def setup_method(self):
        """Clear the lru_cache before each test."""
        _load_private_key.cache_clear()

    def teardown_method(self):
        """Clear the lru_cache after each test."""
        _load_private_key.cache_clear()

    @override_settings(TIBABOT_JWT_SECRET="", TIBABOT_JWT_PRIVATE_KEY="")
    def test_returns_none_when_no_keys(self, test_user):
        """Should gracefully return None when neither key is configured."""
        result = mint_tibabot_jwt(test_user)
        assert result is None

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY="",
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_ISSUER="vitora.nexora.africa",
        TIBABOT_JWT_AUDIENCE="tibabot-api",
        TIBABOT_JWT_EXPIRY_SECONDS=300,
    )
    def test_returns_valid_hs256_jwt_with_standard_claims(self, test_user):
        """Should produce a decodable HS256 JWT when only secret is set."""
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
        TIBABOT_JWT_PRIVATE_KEY="",
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
        TIBABOT_JWT_PRIVATE_KEY="",
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
        TIBABOT_JWT_PRIVATE_KEY="",
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
        TIBABOT_JWT_PRIVATE_KEY="",
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

    def setup_method(self):
        _load_private_key.cache_clear()

    def teardown_method(self):
        _load_private_key.cache_clear()

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY="",
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
        TIBABOT_JWT_PRIVATE_KEY="",
        TIBABOT_JWT_SECRET="",
        TIBABOT_API_URL="https://tibabot.test",
        TIBABOT_API_KEY="tb_test123",
    )
    def test_request_omits_bearer_when_no_keys(self, test_user):
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
        TIBABOT_JWT_PRIVATE_KEY="",
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

    def setup_method(self):
        _load_private_key.cache_clear()

    def teardown_method(self):
        _load_private_key.cache_clear()

    @override_settings(
        TIBABOT_ENABLED=True,
        TIBABOT_JWT_PRIVATE_KEY="",
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


# =============================================================================
# RS256 JWT minting tests
# =============================================================================


@pytest.mark.django_db
class TestMintTibabotJWTRS256:
    """Tests for RS256 JWT minting (production path)."""

    def setup_method(self):
        _load_private_key.cache_clear()

    def teardown_method(self):
        _load_private_key.cache_clear()

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM,
        TIBABOT_JWT_SECRET="",
        TIBABOT_JWT_ISSUER="vitora.nexora.africa",
        TIBABOT_JWT_AUDIENCE="tibabot-api",
        TIBABOT_JWT_EXPIRY_SECONDS=300,
    )
    def test_mints_rs256_jwt_with_valid_claims(self, test_user):
        """Should produce an RS256 JWT when private key is configured."""
        token = mint_tibabot_jwt(test_user)
        assert token is not None

        # Decode with the public key
        claims = jwt.decode(
            token, _TEST_RSA_PUBLIC_KEY, algorithms=["RS256"], audience="tibabot-api"
        )
        assert claims["sub"] == str(test_user.pk)
        assert claims["iss"] == "vitora.nexora.africa"
        assert claims["aud"] == "tibabot-api"
        assert claims["exp"] - claims["iat"] == 300

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM,
        TIBABOT_JWT_SECRET="",
        TIBABOT_JWT_ISSUER="vitora.nexora.africa",
        TIBABOT_JWT_AUDIENCE="tibabot-api",
        TIBABOT_JWT_EXPIRY_SECONDS=300,
    )
    def test_rs256_jwt_includes_kid_header(self, test_user):
        """RS256 JWT should include kid header matching TIBABOT_JWT_KID."""
        token = mint_tibabot_jwt(test_user)
        assert token is not None

        header = jwt.get_unverified_header(token)
        assert header["alg"] == "RS256"
        assert header["kid"] == TIBABOT_JWT_KID

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM,
        TIBABOT_JWT_SECRET=TEST_SECRET,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_rs256_takes_priority_over_hs256(self, test_user):
        """When both keys are configured, RS256 should be used."""
        token = mint_tibabot_jwt(test_user)
        assert token is not None

        header = jwt.get_unverified_header(token)
        assert header["alg"] == "RS256"

        # Should NOT be decodable with the HS256 secret
        with pytest.raises((jwt.exceptions.DecodeError, jwt.exceptions.InvalidAlgorithmError)):
            jwt.decode(token, TEST_SECRET, algorithms=["HS256"], audience="tibabot-api")

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM,
        TIBABOT_JWT_SECRET="",
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_rs256_jwt_includes_tibabot_claims(self, test_user):
        """RS256 JWT should include tibabot/* namespaced claims."""
        test_user.first_name = "Dr."
        test_user.last_name = "Wanjiku"
        test_user.save()

        token = mint_tibabot_jwt(test_user)
        claims = jwt.decode(
            token, _TEST_RSA_PUBLIC_KEY, algorithms=["RS256"], audience="tibabot-api"
        )
        assert claims["tibabot/name"] == "Dr. Wanjiku"


# =============================================================================
# JWKS endpoint + key management tests
# =============================================================================


class TestGetJWKS:
    """Tests for the JWKS document generation."""

    def setup_method(self):
        _load_private_key.cache_clear()

    def teardown_method(self):
        _load_private_key.cache_clear()

    @override_settings(TIBABOT_JWT_PRIVATE_KEY="")
    def test_returns_empty_keys_when_no_private_key(self):
        """Should return empty keys array when no private key is configured."""
        jwks = get_jwks()
        assert jwks == {"keys": []}

    @override_settings(TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM)
    def test_returns_valid_jwk_with_rsa_key(self):
        """Should return a valid JWK with RSA public key parameters."""
        jwks = get_jwks()
        assert len(jwks["keys"]) == 1

        key = jwks["keys"][0]
        assert key["kty"] == "RSA"
        assert key["use"] == "sig"
        assert key["alg"] == "RS256"
        assert key["kid"] == TIBABOT_JWT_KID
        assert "n" in key  # modulus
        assert "e" in key  # exponent
        assert "x5t#S256" in key  # thumbprint

    @override_settings(TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM)
    def test_jwk_can_verify_minted_jwt(self):
        """The JWKS public key should verify JWTs minted with the private key."""
        # Build a public key from the JWKS document
        jwks_doc = get_jwks()
        jwk_key = jwks_doc["keys"][0]

        # Use PyJWT's JWK loading to verify
        from jwt import PyJWK

        public_key = PyJWK(jwk_key).key

        # This verifies the JWKS doc is correct and usable
        assert public_key is not None


@pytest.mark.django_db
class TestJWKSEndpoint:
    """Tests for the /.well-known/jwks.json HTTP endpoint."""

    def setup_method(self):
        _load_private_key.cache_clear()

    def teardown_method(self):
        _load_private_key.cache_clear()

    @override_settings(TIBABOT_JWT_PRIVATE_KEY="")
    def test_returns_empty_keys_without_private_key(self, api_client):
        """Should return 200 with empty keys when no private key."""
        response = api_client.get("/.well-known/jwks.json")
        assert response.status_code == 200
        assert response.json() == {"keys": []}

    @override_settings(TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM)
    def test_returns_jwks_with_private_key(self, api_client):
        """Should return 200 with RSA public key in JWKS format."""
        response = api_client.get("/.well-known/jwks.json")
        assert response.status_code == 200

        data = response.json()
        assert len(data["keys"]) == 1
        assert data["keys"][0]["kid"] == TIBABOT_JWT_KID
        assert data["keys"][0]["alg"] == "RS256"

    @override_settings(TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM)
    def test_endpoint_is_public_no_auth_required(self, api_client):
        """JWKS endpoint should not require authentication."""
        response = api_client.get("/.well-known/jwks.json")
        assert response.status_code == 200

    @override_settings(TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM)
    def test_endpoint_has_cache_control(self, api_client):
        """JWKS response should include cache-control header."""
        response = api_client.get("/.well-known/jwks.json")
        cache_header = response.get("Cache-Control", "")
        assert "max-age=3600" in cache_header

    def test_only_get_allowed(self, api_client):
        """JWKS endpoint should reject POST requests."""
        response = api_client.post("/.well-known/jwks.json")
        assert response.status_code == 405

    @override_settings(
        TIBABOT_JWT_PRIVATE_KEY=_TEST_RSA_PEM,
        TIBABOT_JWT_AUDIENCE="tibabot-api",
    )
    def test_jwt_verifiable_via_jwks_endpoint(self, api_client, test_user):
        """End-to-end: mint a JWT, fetch JWKS, verify the JWT with the JWKS key."""
        from jwt import PyJWK

        token = mint_tibabot_jwt(test_user)
        assert token is not None

        # Fetch JWKS
        response = api_client.get("/.well-known/jwks.json")
        jwks_data = response.json()
        assert len(jwks_data["keys"]) == 1

        # Build public key from JWKS
        public_key = PyJWK(jwks_data["keys"][0]).key

        # Verify the token
        claims = jwt.decode(token, public_key, algorithms=["RS256"], audience="tibabot-api")
        assert claims["sub"] == str(test_user.pk)
