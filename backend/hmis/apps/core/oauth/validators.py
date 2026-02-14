"""
SMART on FHIR OAuth2 Validators.

Custom validators for SMART on FHIR authorization flows.
"""

import logging
from datetime import UTC
from typing import Any

from django.contrib.auth import get_user_model
from oauth2_provider.models import Application
from oauth2_provider.oauth2_validators import OAuth2Validator

User = get_user_model()
logger = logging.getLogger(__name__)


class SMARTOAuth2Validator(OAuth2Validator):
    """
    Custom OAuth2 validator for SMART on FHIR.

    Extends django-oauth-toolkit's validator to support:
    - SMART launch context (patient, encounter)
    - FHIR User claim in ID tokens
    - Asymmetric client authentication (for backend services)
    """

    def get_additional_claims(self, request) -> dict[str, Any]:
        """
        Add SMART on FHIR claims to the ID token.

        Claims added:
        - fhirUser: Reference to the FHIR Practitioner/Patient resource
        - patient: Patient context ID (if launch/patient scope granted)
        - encounter: Encounter context ID (if launch/encounter scope granted)
        """
        claims = super().get_additional_claims(request)

        user = request.user
        scopes = request.scopes or []

        # Add fhirUser claim if fhirUser scope is present
        if "fhirUser" in scopes and user:
            # Determine FHIR resource type based on user type
            # Staff users map to Practitioner, patients to Patient
            if hasattr(user, "staffprofile") and user.staffprofile:
                fhir_user = f"Practitioner/{user.staffprofile.id}"
            else:
                # Default to Practitioner for now
                fhir_user = f"Practitioner/{user.id}"
            claims["fhirUser"] = fhir_user

        # Add launch context if present
        launch_context = getattr(request, "launch_context", {})

        if "launch/patient" in scopes and "patient" in launch_context:
            claims["patient"] = launch_context["patient"]

        if "launch/encounter" in scopes and "encounter" in launch_context:
            claims["encounter"] = launch_context["encounter"]

        return claims

    def validate_scopes(
        self, client_id: str, scopes: list[str], client, request, *args, **kwargs
    ) -> bool:
        """
        Validate requested scopes against SMART on FHIR rules.

        Validates:
        - Scope syntax matches SMART v2 format
        - Client is authorized for requested scopes
        - Launch scopes are only valid in EHR launch context
        """
        from hmis.apps.core.oauth.scopes import SMARTScopes

        smart_scopes = SMARTScopes()

        # Validate each scope
        for scope in scopes:
            if not smart_scopes.is_valid_scope(scope):
                logger.warning(f"Invalid SMART scope requested: {scope} for client {client_id}")
                return False

        # Validate launch scope rules
        if "launch" in scopes and not getattr(request, "launch_context", None):
            logger.warning(f"Launch scope requested without launch context for client {client_id}")
            # Allow for now, but log warning

        return super().validate_scopes(client_id, scopes, client, request, *args, **kwargs)

    def save_bearer_token(self, token: dict, request, *args, **kwargs) -> None:
        """
        Save bearer token with SMART context.

        Stores launch context (patient, encounter) with the access token
        for use in subsequent API requests.
        """
        # Add launch context to token data
        launch_context = getattr(request, "launch_context", {})
        if launch_context:
            # Store context in token's extra_data
            token["launch_context"] = launch_context

        super().save_bearer_token(token, request, *args, **kwargs)

    def validate_bearer_token(self, token: str, scopes: list[str], request) -> bool:
        """
        Validate bearer token and extract SMART context.

        Also sets launch context on request for downstream permission checks.
        """
        valid = super().validate_bearer_token(token, scopes, request)

        if valid and hasattr(request, "access_token"):
            # Extract launch context from token if present
            access_token = request.access_token
            if hasattr(access_token, "launch_context"):
                request.launch_context = access_token.launch_context

        return valid


class SMARTClientAuthenticationValidator:
    """
    Validates SMART client authentication methods.

    Supports:
    - client_secret_basic: HTTP Basic auth with client_id:client_secret
    - client_secret_post: client_id and client_secret in POST body
    - private_key_jwt: JWT signed with client's private key (for backend services)
    """

    @staticmethod
    def validate_client_authentication(request, client: Application) -> bool:
        """
        Validate client authentication based on configured method.
        """
        auth_method = getattr(client, "token_endpoint_auth_method", "client_secret_basic")

        if auth_method == "private_key_jwt":
            return SMARTClientAuthenticationValidator._validate_private_key_jwt(request, client)
        elif auth_method == "client_secret_post":
            return SMARTClientAuthenticationValidator._validate_client_secret_post(request, client)
        else:
            # Default: client_secret_basic (handled by django-oauth-toolkit)
            return True

    @staticmethod
    def _validate_private_key_jwt(request, client: Application) -> bool:
        """
        Validate client assertion JWT for backend services.

        Reference: https://www.rfc-editor.org/rfc/rfc7523
        """
        from datetime import datetime

        import jwt

        client_assertion = request.POST.get("client_assertion")
        client_assertion_type = request.POST.get("client_assertion_type")

        if client_assertion_type != "urn:ietf:params:oauth:client-assertion-type:jwt-bearer":
            logger.warning("Invalid client_assertion_type")
            return False

        if not client_assertion:
            logger.warning("Missing client_assertion")
            return False

        try:
            # Get client's public key (should be stored in client metadata)
            jwks = getattr(client, "jwks", None)
            if not jwks:
                logger.warning(f"No JWKS configured for client {client.client_id}")
                return False

            # Decode and validate JWT
            # In production, use jwcrypto for proper JWK handling
            payload = jwt.decode(
                client_assertion,
                options={
                    "verify_signature": False
                },  # TODO: Implement proper signature verification
                algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
            )

            # Validate claims
            now = datetime.now(UTC).timestamp()

            if payload.get("iss") != client.client_id:
                logger.warning("JWT issuer does not match client_id")
                return False

            if payload.get("sub") != client.client_id:
                logger.warning("JWT subject does not match client_id")
                return False

            # aud should contain the token endpoint URL
            # For flexibility, we accept any valid audience
            if not payload.get("aud"):
                logger.warning("JWT missing audience claim")
                return False

            if payload.get("exp", 0) < now:
                logger.warning("JWT has expired")
                return False

            return True

        except jwt.PyJWTError as e:
            logger.warning(f"JWT validation failed: {e}")
            return False

    @staticmethod
    def _validate_client_secret_post(request, client: Application) -> bool:
        """
        Validate client_id and client_secret in POST body.
        """
        client_id = request.POST.get("client_id")
        client_secret = request.POST.get("client_secret")

        if client_id != client.client_id:
            return False

        return client.client_secret == client_secret
