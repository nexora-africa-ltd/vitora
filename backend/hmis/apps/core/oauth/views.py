"""
SMART on FHIR Views.

Implements:
- .well-known/smart-configuration endpoint
- FHIR CapabilityStatement
- SMART launch handlers (EHR and standalone)
"""

import logging
from datetime import UTC
from typing import Any

from django.conf import settings
from django.http import JsonResponse
from django.views import View
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

from rest_framework.views import APIView

from hmis.apps.core.oauth.scopes import SMARTScopes

logger = logging.getLogger(__name__)


def get_base_url(request) -> str:
    """Get the base URL for the FHIR server."""
    if hasattr(settings, "FHIR_BASE_URL") and settings.FHIR_BASE_URL:
        return settings.FHIR_BASE_URL.rstrip("/")
    # Build from request
    return f"{request.scheme}://{request.get_host()}"


class SMARTConfigurationView(View):
    """
    SMART on FHIR configuration endpoint.

    Returns the .well-known/smart-configuration document that describes
    the server's SMART on FHIR capabilities.

    Reference: http://hl7.org/fhir/smart-app-launch/conformance.html
    """

    def get(self, request) -> JsonResponse:
        """Return SMART configuration document."""
        base_url = get_base_url(request)

        # Get all supported scopes
        smart_scopes = SMARTScopes()
        scopes_supported = smart_scopes.get_available_scopes(request=request)

        config = {
            # Required fields
            "issuer": base_url,
            "authorization_endpoint": f"{base_url}/oauth/authorize/",
            "token_endpoint": f"{base_url}/oauth/token/",
            "capabilities": [
                "launch-ehr",
                "launch-standalone",
                "client-public",
                "client-confidential-symmetric",
                "client-confidential-asymmetric",
                "context-ehr-patient",
                "context-ehr-encounter",
                "context-standalone-patient",
                "context-standalone-encounter",
                "permission-offline",
                "permission-patient",
                "permission-user",
                "sso-openid-connect",
            ],
            # Optional but recommended
            "jwks_uri": f"{base_url}/oauth/jwks/",
            "registration_endpoint": f"{base_url}/oauth/applications/register/",
            "scopes_supported": scopes_supported,
            "response_types_supported": ["code"],
            "management_endpoint": f"{base_url}/oauth/applications/",
            "introspection_endpoint": f"{base_url}/oauth/introspect/",
            "revocation_endpoint": f"{base_url}/oauth/revoke_token/",
            # Code challenge methods for PKCE
            "code_challenge_methods_supported": ["S256"],
            # Token endpoint auth methods
            "token_endpoint_auth_methods_supported": [
                "client_secret_basic",
                "client_secret_post",
                "private_key_jwt",
            ],
            # Grant types
            "grant_types_supported": [
                "authorization_code",
                "refresh_token",
                "client_credentials",
            ],
        }

        return JsonResponse(config, content_type="application/json")


class CapabilityStatementView(APIView):
    """
    FHIR CapabilityStatement endpoint.

    Returns the server's CapabilityStatement resource describing
    all supported FHIR resources and operations.

    Reference: https://hl7.org/fhir/R4/capabilitystatement.html
    """

    permission_classes = [AllowAny]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request) -> Response:
        """Return FHIR CapabilityStatement."""
        base_url = get_base_url(request)

        # Define supported resources with their operations
        resources = self._get_supported_resources(base_url)

        capability_statement = {
            "resourceType": "CapabilityStatement",
            "id": "vitora-hmis",
            "url": f"{base_url}/fhir/metadata",
            "version": "0.1.0",
            "name": "VitoraHMISCapabilityStatement",
            "title": "Vitora HMIS FHIR CapabilityStatement",
            "status": "active",
            "experimental": False,
            "date": "2026-01-31",
            "publisher": "Nexora Africa Ltd",
            "contact": [
                {
                    "name": "Nexora Africa Ltd",
                    "telecom": [{"system": "email", "value": "dev@nexora.africa"}],
                }
            ],
            "description": (
                "CapabilityStatement for Vitora HMIS - An offline-first Hospital "
                "Management Information System for Kenya's healthcare infrastructure."
            ),
            "jurisdiction": [
                {
                    "coding": [
                        {
                            "system": "urn:iso:std:iso:3166",
                            "code": "KE",
                            "display": "Kenya",
                        }
                    ]
                }
            ],
            "kind": "instance",
            "fhirVersion": "4.0.1",
            "format": ["json"],
            "implementationGuide": [
                # Kenya SHA implementation guide (when published)
                "http://fhir.health.go.ke/ImplementationGuide/kenya-sha",
                # International Patient Summary
                "http://hl7.org/fhir/uv/ips/ImplementationGuide/hl7.fhir.uv.ips",
            ],
            "rest": [
                {
                    "mode": "server",
                    "documentation": "Vitora HMIS FHIR R4 API Server",
                    "security": {
                        "cors": True,
                        "service": [
                            {
                                "coding": [
                                    {
                                        "system": "http://terminology.hl7.org/CodeSystem/restful-security-service",
                                        "code": "SMART-on-FHIR",
                                        "display": "SMART on FHIR",
                                    }
                                ],
                                "text": "OAuth2 with SMART on FHIR extensions",
                            }
                        ],
                        "description": (
                            "This server implements SMART on FHIR OAuth2 authorization. "
                            "See .well-known/smart-configuration for details."
                        ),
                        "extension": [
                            {
                                "url": "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                                "extension": [
                                    {
                                        "url": "authorize",
                                        "valueUri": f"{base_url}/oauth/authorize/",
                                    },
                                    {
                                        "url": "token",
                                        "valueUri": f"{base_url}/oauth/token/",
                                    },
                                    {
                                        "url": "register",
                                        "valueUri": f"{base_url}/oauth/applications/register/",
                                    },
                                ],
                            }
                        ],
                    },
                    "resource": resources,
                    "interaction": [
                        {"code": "transaction"},
                        {"code": "batch"},
                    ],
                    "searchParam": [
                        {
                            "name": "_id",
                            "type": "token",
                            "documentation": "Logical id of the resource",
                        },
                        {
                            "name": "_lastUpdated",
                            "type": "date",
                            "documentation": "When the resource was last updated",
                        },
                    ],
                }
            ],
        }

        return Response(capability_statement, status=status.HTTP_200_OK)

    def _get_supported_resources(self, base_url: str) -> list[dict]:
        """Return list of supported FHIR resource definitions."""
        return [
            {
                "type": "Patient",
                "profile": "http://hl7.org/fhir/StructureDefinition/Patient",
                "interaction": [
                    {"code": "read"},
                    {"code": "vread"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                    {"code": "delete"},
                    {"code": "history-instance"},
                ],
                "searchParam": [
                    {"name": "identifier", "type": "token"},
                    {"name": "name", "type": "string"},
                    {"name": "family", "type": "string"},
                    {"name": "given", "type": "string"},
                    {"name": "birthdate", "type": "date"},
                    {"name": "gender", "type": "token"},
                    {"name": "phone", "type": "token"},
                ],
            },
            {
                "type": "Practitioner",
                "profile": "http://hl7.org/fhir/StructureDefinition/Practitioner",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                ],
                "searchParam": [
                    {"name": "identifier", "type": "token"},
                    {"name": "name", "type": "string"},
                ],
            },
            {
                "type": "Organization",
                "profile": "http://hl7.org/fhir/StructureDefinition/Organization",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                ],
                "searchParam": [
                    {"name": "identifier", "type": "token"},
                    {"name": "name", "type": "string"},
                ],
            },
            {
                "type": "Encounter",
                "profile": "http://hl7.org/fhir/StructureDefinition/Encounter",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "date", "type": "date"},
                    {"name": "status", "type": "token"},
                    {"name": "class", "type": "token"},
                ],
            },
            {
                "type": "Observation",
                "profile": "http://hl7.org/fhir/StructureDefinition/Observation",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "category", "type": "token"},
                    {"name": "code", "type": "token"},
                    {"name": "date", "type": "date"},
                    {"name": "status", "type": "token"},
                ],
            },
            {
                "type": "Condition",
                "profile": "http://hl7.org/fhir/StructureDefinition/Condition",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "code", "type": "token"},
                    {"name": "clinical-status", "type": "token"},
                ],
            },
            {
                "type": "MedicationRequest",
                "profile": "http://hl7.org/fhir/StructureDefinition/MedicationRequest",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "status", "type": "token"},
                    {"name": "authoredon", "type": "date"},
                ],
            },
            {
                "type": "MedicationDispense",
                "profile": "http://hl7.org/fhir/StructureDefinition/MedicationDispense",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "status", "type": "token"},
                ],
            },
            {
                "type": "AllergyIntolerance",
                "profile": "http://hl7.org/fhir/StructureDefinition/AllergyIntolerance",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "clinical-status", "type": "token"},
                ],
            },
            {
                "type": "ServiceRequest",
                "profile": "http://hl7.org/fhir/StructureDefinition/ServiceRequest",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                    {"code": "update"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "status", "type": "token"},
                    {"name": "category", "type": "token"},
                ],
            },
            {
                "type": "DiagnosticReport",
                "profile": "http://hl7.org/fhir/StructureDefinition/DiagnosticReport",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "status", "type": "token"},
                    {"name": "category", "type": "token"},
                ],
            },
            {
                "type": "Coverage",
                "profile": "http://hl7.org/fhir/StructureDefinition/Coverage",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "status", "type": "token"},
                ],
            },
            {
                "type": "Claim",
                "profile": "http://hl7.org/fhir/StructureDefinition/Claim",
                "interaction": [
                    {"code": "read"},
                    {"code": "search-type"},
                    {"code": "create"},
                ],
                "searchParam": [
                    {"name": "patient", "type": "reference"},
                    {"name": "status", "type": "token"},
                ],
            },
        ]


class SMARTLaunchView(APIView):
    """
    SMART App Launch endpoint.

    Handles EHR launch flow where the EHR initiates the authorization
    with a launch context (patient, encounter).

    Reference: http://hl7.org/fhir/smart-app-launch/app-launch.html
    """

    permission_classes = [AllowAny]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request) -> Response:
        """
        Handle SMART EHR launch.

        Query params:
        - iss: FHIR server base URL
        - launch: Opaque launch token (contains context)
        """
        iss = request.GET.get("iss")
        launch_token = request.GET.get("launch")

        if not iss or not launch_token:
            return Response(
                {"error": "Missing required parameters: iss and launch"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate iss matches our server
        base_url = get_base_url(request)
        if not iss.startswith(base_url):
            logger.warning(f"Invalid iss parameter: {iss}")
            return Response(
                {"error": "Invalid iss parameter"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Decode and validate launch token
        try:
            launch_context = self._decode_launch_token(launch_token)
        except ValueError as e:
            return Response(
                {"error": f"Invalid launch token: {e}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store launch context in session for authorization flow
        request.session["smart_launch_context"] = launch_context
        request.session["smart_iss"] = iss

        # Return launch info for the client
        return Response(
            {
                "iss": iss,
                "launch": launch_token,
                "authorization_endpoint": f"{base_url}/oauth/authorize/",
                "token_endpoint": f"{base_url}/oauth/token/",
                "context": {
                    "patient": launch_context.get("patient"),
                    "encounter": launch_context.get("encounter"),
                },
            },
            status=status.HTTP_200_OK,
        )

    def _decode_launch_token(self, token: str) -> dict[str, Any]:
        """
        Decode the launch token to extract context.

        In a real implementation, this would be an encrypted/signed token.
        For now, we use a simple base64-encoded JSON.
        """
        import base64
        import json

        try:
            decoded = base64.urlsafe_b64decode(token + "==")  # Pad if needed
            return json.loads(decoded)
        except (ValueError, json.JSONDecodeError) as e:
            raise ValueError(f"Invalid launch token format: {e}") from e


class SMARTLaunchContextView(APIView):
    """
    Create a SMART launch context token.

    Used by the EHR to create a launch token for third-party apps.
    """
    @extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})

    def post(self, request) -> Response:
        """
        Create a new launch context token.

        Request body:
        - patient_id: Patient ID for context
        - encounter_id: Encounter ID for context (optional)
        - app_client_id: Target app's client ID
        """
        patient_id = request.data.get("patient_id")
        encounter_id = request.data.get("encounter_id")
        app_client_id = request.data.get("app_client_id")

        if not patient_id or not app_client_id:
            return Response(
                {"error": "Missing required fields: patient_id, app_client_id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create launch context
        import base64
        import json
        import secrets
        from datetime import datetime

        context = {
            "patient": str(patient_id),
            "encounter": str(encounter_id) if encounter_id else None,
            "client_id": app_client_id,
            "created_by": request.user.id,
            "created_at": datetime.now(UTC).isoformat(),
            "nonce": secrets.token_hex(16),
        }

        # Encode as launch token
        token = base64.urlsafe_b64encode(
            json.dumps(context).encode()
        ).decode().rstrip("=")

        base_url = get_base_url(request)

        return Response(
            {
                "launch": token,
                "launch_url": f"{base_url}/smart/launch?iss={base_url}/fhir&launch={token}",
                "context": {
                    "patient": context["patient"],
                    "encounter": context["encounter"],
                },
                "expires_in": 300,  # 5 minutes
            },
            status=status.HTTP_201_CREATED,
        )


class SMARTTokenIntrospectionView(APIView):
    """
    Token introspection endpoint for SMART apps.

    Returns information about an access token including:
    - Whether the token is active
    - Scopes granted
    - Launch context (patient, encounter)
    """
    @extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})

    def post(self, request) -> Response:
        """
        Introspect an access token.

        Request body:
        - token: The access token to introspect
        """
        from oauth2_provider.models import AccessToken

        token_value = request.data.get("token")
        if not token_value:
            return Response(
                {"error": "Missing required field: token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = AccessToken.objects.get(token=token_value)
        except AccessToken.DoesNotExist:
            return Response({"active": False}, status=status.HTTP_200_OK)

        # Check if token is expired
        from django.utils import timezone

        if token.expires < timezone.now():
            return Response({"active": False}, status=status.HTTP_200_OK)

        # Build introspection response
        response_data = {
            "active": True,
            "scope": token.scope,
            "client_id": token.application.client_id if token.application else None,
            "username": token.user.username if token.user else None,
            "token_type": "Bearer",
            "exp": int(token.expires.timestamp()),
            "iat": int(token.created.timestamp()) if hasattr(token, "created") else None,
            "sub": str(token.user.id) if token.user else None,
            "aud": token.application.client_id if token.application else None,
            "iss": get_base_url(request),
        }

        # Add SMART context if present
        if hasattr(token, "launch_context") and token.launch_context:
            if "patient" in token.launch_context:
                response_data["patient"] = token.launch_context["patient"]
            if "encounter" in token.launch_context:
                response_data["encounter"] = token.launch_context["encounter"]

        # Add fhirUser if scope includes it
        if "fhirUser" in (token.scope or ""):
            if token.user and hasattr(token.user, "staffprofile"):
                response_data["fhirUser"] = f"Practitioner/{token.user.staffprofile.id}"
            elif token.user:
                response_data["fhirUser"] = f"Practitioner/{token.user.id}"

        return Response(response_data, status=status.HTTP_200_OK)
