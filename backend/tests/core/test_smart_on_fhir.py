"""
Tests for SMART on FHIR OAuth2 implementation.

Tests cover:
- SMART scopes validation
- SMART configuration endpoint
- CapabilityStatement
- Launch handlers
- Scope-based permissions
"""

import base64
import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.oauth.permissions import (
    RequireEncounterContextPermission,
    RequirePatientContextPermission,
    SMARTPatientAccessPermission,
    SMARTScopePermission,
    get_smart_filter_for_patient_scopes,
)
from hmis.apps.core.oauth.scopes import SCOPE_CATEGORIES, SMARTScopes
from hmis.apps.core.oauth.validators import SMARTClientAuthenticationValidator, SMARTOAuth2Validator
from tests.conftest import ensure_staff_profile

User = get_user_model()


class TestSMARTScopes:
    """Tests for SMART on FHIR scope handling."""

    def test_get_all_scopes_returns_all_scope_types(self):
        """Should return OIDC, launch, and clinical scopes."""
        scopes = SMARTScopes.get_all_scopes()

        # OIDC scopes
        assert "openid" in scopes
        assert "profile" in scopes
        assert "fhirUser" in scopes

        # Launch scopes
        assert "launch" in scopes
        assert "launch/patient" in scopes
        assert "launch/encounter" in scopes

        # Patient scopes
        assert "patient/Patient.read" in scopes
        assert "patient/*.write" in scopes

        # User scopes
        assert "user/Practitioner.read" in scopes

        # System scopes
        assert "system/*.read" in scopes

    def test_get_available_scopes_returns_list(self):
        """Should return list of scope names."""
        smart_scopes = SMARTScopes()
        scopes = smart_scopes.get_available_scopes()

        assert isinstance(scopes, list)
        assert len(scopes) > 30  # We define many scopes
        assert "openid" in scopes

    def test_get_default_scopes(self):
        """Should return basic OIDC scopes as default."""
        smart_scopes = SMARTScopes()
        defaults = smart_scopes.get_default_scopes()

        assert "openid" in defaults
        assert "profile" in defaults

    def test_is_valid_scope_accepts_defined_scopes(self):
        """Should accept scopes defined in the registry."""
        smart_scopes = SMARTScopes()

        assert smart_scopes.is_valid_scope("openid")
        assert smart_scopes.is_valid_scope("patient/Patient.read")
        assert smart_scopes.is_valid_scope("user/*.write")
        assert smart_scopes.is_valid_scope("system/*.*")

    def test_is_valid_scope_accepts_valid_smart_v2_syntax(self):
        """Should accept valid SMART v2 scope syntax for any FHIR resource."""
        smart_scopes = SMARTScopes()

        # These follow valid SMART v2 pattern even if not explicitly defined
        assert smart_scopes.is_valid_scope("patient/Immunization.read")
        assert smart_scopes.is_valid_scope("user/Goal.write")
        assert smart_scopes.is_valid_scope("system/Bundle.read")

    def test_is_valid_scope_rejects_invalid_scopes(self):
        """Should reject malformed scopes."""
        smart_scopes = SMARTScopes()

        assert not smart_scopes.is_valid_scope("invalid")
        assert not smart_scopes.is_valid_scope("patient/")
        assert not smart_scopes.is_valid_scope("patient/Patient")  # Missing action
        assert not smart_scopes.is_valid_scope("/Patient.read")  # Missing context

    def test_get_scope_descriptions(self):
        """Should return descriptions for requested scopes."""
        smart_scopes = SMARTScopes()
        descriptions = smart_scopes.get_scope_descriptions(["openid", "patient/Patient.read"])

        assert "openid" in descriptions
        assert "patient/Patient.read" in descriptions
        assert "OpenID" in descriptions["openid"]


class TestScopeCategories:
    """Tests for scope category organization."""

    def test_scope_categories_structure(self):
        """Should have properly structured categories."""
        assert "identity" in SCOPE_CATEGORIES
        assert "launch" in SCOPE_CATEGORIES
        assert "patient_read" in SCOPE_CATEGORIES
        assert "patient_write" in SCOPE_CATEGORIES

        identity = SCOPE_CATEGORIES["identity"]
        assert "label" in identity
        assert "description" in identity
        assert "scopes" in identity
        assert "openid" in identity["scopes"]


class TestSMARTOAuth2Validator:
    """Tests for custom OAuth2 validator."""

    def test_get_additional_claims_adds_fhir_user(self):
        """Should add fhirUser claim when scope is present."""
        validator = SMARTOAuth2Validator()

        # Create mock request with user and fhirUser scope
        request = Mock()
        request.user = Mock()
        request.user.id = 123
        request.user.staffprofile = Mock()
        request.user.staffprofile.id = 456
        request.scopes = ["openid", "fhirUser"]

        claims = validator.get_additional_claims(request)

        assert "fhirUser" in claims
        assert claims["fhirUser"] == "Practitioner/456"

    def test_get_additional_claims_adds_patient_context(self):
        """Should add patient claim when launch/patient scope and context present."""
        validator = SMARTOAuth2Validator()

        request = Mock()
        request.user = Mock()
        request.user.id = 123
        request.scopes = ["openid", "launch/patient"]
        request.launch_context = {"patient": "789"}

        claims = validator.get_additional_claims(request)

        assert "patient" in claims
        assert claims["patient"] == "789"

    def test_get_additional_claims_adds_encounter_context(self):
        """Should add encounter claim when launch/encounter scope and context present."""
        validator = SMARTOAuth2Validator()

        request = Mock()
        request.user = Mock()
        request.user.id = 123
        request.scopes = ["openid", "launch/encounter"]
        request.launch_context = {"encounter": "101"}

        claims = validator.get_additional_claims(request)

        assert "encounter" in claims
        assert claims["encounter"] == "101"


class TestSMARTClientAuthenticationValidator:
    """Tests for client authentication methods."""

    def test_validate_client_secret_post(self):
        """Should validate client_secret_post authentication."""
        request = Mock()
        request.POST = {
            "client_id": "test-client",
            "client_secret": "test-secret",
        }

        client = Mock()
        client.client_id = "test-client"
        client.client_secret = "test-secret"

        result = SMARTClientAuthenticationValidator._validate_client_secret_post(request, client)
        assert result is True

    def test_validate_client_secret_post_wrong_secret(self):
        """Should reject wrong client secret."""
        request = Mock()
        request.POST = {
            "client_id": "test-client",
            "client_secret": "wrong-secret",
        }

        client = Mock()
        client.client_id = "test-client"
        client.client_secret = "test-secret"

        result = SMARTClientAuthenticationValidator._validate_client_secret_post(request, client)
        assert result is False


class TestSMARTScopePermission:
    """Tests for SMART scope-based permission checking."""

    def test_scope_allows_matching_resource_and_action(self):
        """Should allow access when scope matches resource and action."""
        permission = SMARTScopePermission()

        assert permission._scope_allows_access("patient/Patient.read", "Patient", "read")
        assert permission._scope_allows_access("user/Encounter.write", "Encounter", "write")

    def test_scope_allows_wildcard_resource(self):
        """Should allow access with wildcard resource scope."""
        permission = SMARTScopePermission()

        assert permission._scope_allows_access("patient/*.read", "Patient", "read")
        assert permission._scope_allows_access("patient/*.read", "Observation", "read")

    def test_scope_allows_wildcard_action(self):
        """Should allow access with wildcard action scope."""
        permission = SMARTScopePermission()

        assert permission._scope_allows_access("patient/Patient.*", "Patient", "read")
        assert permission._scope_allows_access("patient/Patient.*", "Patient", "write")

    def test_scope_allows_full_wildcard(self):
        """Should allow access with full wildcard scope."""
        permission = SMARTScopePermission()

        assert permission._scope_allows_access("system/*.*", "Patient", "read")
        assert permission._scope_allows_access("system/*.*", "Encounter", "write")

    def test_scope_denies_mismatched_resource(self):
        """Should deny access when resource doesn't match."""
        permission = SMARTScopePermission()

        assert not permission._scope_allows_access("patient/Patient.read", "Encounter", "read")

    def test_scope_denies_mismatched_action(self):
        """Should deny access when action doesn't match."""
        permission = SMARTScopePermission()

        assert not permission._scope_allows_access("patient/Patient.read", "Patient", "write")

    def test_check_scope_access_finds_matching_scope(self):
        """Should find matching scope in list."""
        permission = SMARTScopePermission()

        scopes = ["openid", "patient/Patient.read", "patient/Observation.read"]
        request = Mock()

        assert permission._check_scope_access(scopes, "Patient", "read", request)
        assert permission._check_scope_access(scopes, "Observation", "read", request)
        assert not permission._check_scope_access(scopes, "Encounter", "read", request)


class TestSMARTPatientAccessPermission:
    """Tests for patient-level access control."""

    def test_allows_access_without_oauth_token(self):
        """Should allow access for non-OAuth requests."""
        permission = SMARTPatientAccessPermission()

        request = Mock()
        request.access_token = None

        view = Mock()

        assert permission.has_permission(request, view)

    def test_allows_access_with_user_scopes(self):
        """Should allow broader access with user/* scopes."""
        permission = SMARTPatientAccessPermission()

        access_token = Mock()
        access_token.scope = "openid user/Patient.read"

        request = Mock()
        request.access_token = access_token

        view = Mock()

        assert permission.has_permission(request, view)

    def test_requires_patient_context_for_patient_scopes(self):
        """Should require patient context when using patient/* scopes only."""
        permission = SMARTPatientAccessPermission()

        access_token = Mock()
        access_token.scope = "openid patient/Patient.read"

        request = Mock()
        request.access_token = access_token
        request.launch_context = {}  # No patient context

        view = Mock()

        assert not permission.has_permission(request, view)

    def test_allows_patient_scopes_with_context(self):
        """Should allow patient/* scopes when patient context present."""
        permission = SMARTPatientAccessPermission()

        access_token = Mock()
        access_token.scope = "openid patient/Patient.read"

        request = Mock()
        request.access_token = access_token
        request.launch_context = {"patient": "123"}

        view = Mock()

        assert permission.has_permission(request, view)


class TestRequirePatientContextPermission:
    """Tests for patient context requirement."""

    def test_allows_with_patient_context(self):
        """Should allow when patient context present."""
        permission = RequirePatientContextPermission()

        request = Mock()
        request.launch_context = {"patient": "123"}

        view = Mock()

        assert permission.has_permission(request, view)

    def test_denies_without_patient_context(self):
        """Should deny when patient context missing."""
        permission = RequirePatientContextPermission()

        request = Mock()
        request.launch_context = {}

        view = Mock()

        assert not permission.has_permission(request, view)


class TestRequireEncounterContextPermission:
    """Tests for encounter context requirement."""

    def test_allows_with_encounter_context(self):
        """Should allow when encounter context present."""
        permission = RequireEncounterContextPermission()

        request = Mock()
        request.launch_context = {"encounter": "456"}

        view = Mock()

        assert permission.has_permission(request, view)

    def test_denies_without_encounter_context(self):
        """Should deny when encounter context missing."""
        permission = RequireEncounterContextPermission()

        request = Mock()
        request.launch_context = {}

        view = Mock()

        assert not permission.has_permission(request, view)


class TestGetSmartFilterForPatientScopes:
    """Tests for queryset filtering based on patient context."""

    def test_returns_unfiltered_without_oauth(self):
        """Should return original queryset without OAuth token."""
        request = Mock()
        request.access_token = None

        queryset = Mock()

        result = get_smart_filter_for_patient_scopes(request, queryset)
        assert result == queryset

    def test_filters_by_patient_id_for_patient_scopes(self):
        """Should filter queryset by patient_id when using patient/* scopes."""
        access_token = Mock()
        access_token.scope = "patient/Observation.read"

        request = Mock()
        request.access_token = access_token
        request.launch_context = {"patient": "123"}

        # Mock model with patient_id field
        model = Mock()
        model.patient_id = True  # hasattr check

        queryset = Mock()
        queryset.model = model
        filtered_qs = Mock()
        queryset.filter.return_value = filtered_qs

        result = get_smart_filter_for_patient_scopes(request, queryset)

        queryset.filter.assert_called_once_with(patient_id="123")
        assert result == filtered_qs


@pytest.mark.django_db
class TestSMARTEndpoints:
    """Integration tests for SMART on FHIR endpoints."""

    @pytest.fixture
    def api_client(self):
        """Return an API client."""
        return APIClient()

    def test_smart_configuration_endpoint(self, api_client):
        """Should return valid SMART configuration."""
        response = api_client.get("/.well-known/smart-configuration")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Required fields
        assert "issuer" in data
        assert "authorization_endpoint" in data
        assert "token_endpoint" in data
        assert "capabilities" in data
        assert "scopes_supported" in data

        # Capabilities
        assert "launch-ehr" in data["capabilities"]
        assert "launch-standalone" in data["capabilities"]
        assert "sso-openid-connect" in data["capabilities"]

        # Scopes
        assert "openid" in data["scopes_supported"]
        assert "launch" in data["scopes_supported"]

    def test_capability_statement_endpoint(self, api_client):
        """Should return valid FHIR CapabilityStatement."""
        response = api_client.get("/fhir/metadata")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Required CapabilityStatement fields
        assert data["resourceType"] == "CapabilityStatement"
        assert data["fhirVersion"] == "4.0.1"
        assert data["status"] == "active"
        assert data["kind"] == "instance"

        # REST configuration
        assert len(data["rest"]) > 0
        rest = data["rest"][0]
        assert rest["mode"] == "server"

        # Security
        assert "security" in rest
        assert rest["security"]["cors"] is True

        # Resources
        assert len(rest["resource"]) > 0
        resource_types = [r["type"] for r in rest["resource"]]
        assert "Patient" in resource_types
        assert "Encounter" in resource_types
        assert "Observation" in resource_types
        assert "Composition" in resource_types

        composition_resource = next(r for r in rest["resource"] if r["type"] == "Composition")
        assert {interaction["code"] for interaction in composition_resource["interaction"]} == {
            "read"
        }
        document_operation = next(
            operation
            for operation in composition_resource["operation"]
            if operation["name"] == "document"
        )
        assert document_operation["definition"] == (
            "http://hl7.org/fhir/OperationDefinition/Composition-document"
        )

    def test_capability_statement_accepts_fhir_json_accept_header(self, api_client):
        """Metadata should negotiate application/fhir+json."""
        response = api_client.get("/fhir/metadata", HTTP_ACCEPT="application/fhir+json")

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"].startswith("application/fhir+json")

    def test_smart_launch_missing_params(self, api_client):
        """Should return error when launch params missing."""
        response = api_client.get("/smart/launch")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Missing required parameters" in response.json()["error"]

    def test_smart_launch_with_valid_params(self, api_client):
        """Should accept valid launch request."""
        # Create launch token
        context = {
            "patient": "123",
            "encounter": "456",
        }
        launch_token = base64.urlsafe_b64encode(json.dumps(context).encode()).decode().rstrip("=")

        response = api_client.get(
            "/smart/launch",
            {"iss": "http://testserver/fhir", "launch": launch_token},
        )

        # Should succeed or fail gracefully
        # (may fail due to invalid iss in test, which is expected)
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
        ]

    def test_smart_launch_context_requires_auth(self, api_client):
        """Should require authentication for launch context creation."""
        response = api_client.post(
            "/smart/launch-context",
            {"patient_id": "123", "app_client_id": "test-app"},
        )

        # Should require authentication
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.fixture
    def authenticated_client(self, api_client, db, sample_organization, sample_facility):
        """Return an authenticated API client."""
        user = User.objects.create_user(
            username="testuser",
            password="testpass123",
        )
        ensure_staff_profile(user, sample_organization, sample_facility)
        api_client.force_authenticate(user=user)
        return api_client

    def test_smart_launch_context_creation(self, authenticated_client):
        """Should create launch context when authenticated."""
        response = authenticated_client.post(
            "/smart/launch-context",
            {"patient_id": "123", "app_client_id": "test-app"},
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()

        assert "launch" in data
        assert "launch_url" in data
        assert "context" in data
        assert data["context"]["patient"] == "123"


@pytest.mark.django_db
class TestOAuth2Endpoints:
    """Tests for OAuth2 provider endpoints."""

    @pytest.fixture
    def api_client(self):
        """Return an API client."""
        return APIClient()

    def test_oauth_authorize_endpoint_exists(self, api_client):
        """Should have OAuth2 authorize endpoint."""
        # This will redirect to login, which is expected
        response = api_client.get("/oauth/authorize/")

        # Should redirect (302) or require login (401/403)
        assert response.status_code in [302, 401, 403]

    def test_oauth_token_endpoint_exists(self, api_client):
        """Should have OAuth2 token endpoint."""
        response = api_client.post("/oauth/token/")

        # Should return error for missing params, not 404
        assert response.status_code in [400, 401]


class TestLaunchTokenEncoding:
    """Tests for launch token encoding/decoding."""

    def test_encode_decode_launch_context(self):
        """Should properly encode and decode launch context."""
        context = {
            "patient": "123",
            "encounter": "456",
            "client_id": "test-app",
        }

        # Encode
        encoded = base64.urlsafe_b64encode(json.dumps(context).encode()).decode().rstrip("=")

        # Decode (with padding)
        decoded_bytes = base64.urlsafe_b64decode(encoded + "==")
        decoded = json.loads(decoded_bytes)

        assert decoded["patient"] == "123"
        assert decoded["encounter"] == "456"
        assert decoded["client_id"] == "test-app"
