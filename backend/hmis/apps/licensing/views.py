# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Licensing API views.

Endpoints:
- POST /api/licensing/activate/      — Activate an installation with a code
- POST /api/licensing/check-in/      — Periodic check-in to refresh token
- GET  /api/licensing/status/        — Local token verification (no internet needed)
- POST /api/licensing/generate-code/ — Admin: generate activation codes
- GET  /api/licensing/installations/ — Admin: list all installations
- POST /api/licensing/installations/{id}/revoke/ — Admin: revoke an installation
"""

import secrets

from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

from .bootstrap import build_activation_bootstrap_payload
from .models import Installation
from .serializers import (
    ActivationRequestSerializer,
    CheckInRequestSerializer,
    GenerateActivationCodeSerializer,
    InstallationDetailSerializer,
    InstallationListSerializer,
    RevokeSerializer,
)
from .tokens import (
    build_license_payload,
    is_check_in_overdue,
    sign_license_token,
    verify_license_token,
)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def activate_installation(request: Request) -> Response:
    """
    Activate an installation using a one-time activation code.

    This endpoint is called by the desktop app on first-run activation.
    No authentication required (the activation code serves as auth).
    """
    serializer = ActivationRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    activation_code = data["activation_code"]
    installation_id = data["installation_id"]

    # Find the pending installation by activation code (case-insensitive)
    try:
        installation = Installation.objects.select_related(
            "facility",
            "facility__county",
            "facility__sub_county",
            "organization",
            "organization__subscription_plan",
        ).get(
            activation_code__iexact=activation_code,
            status=Installation.Status.PENDING,
        )
    except Installation.DoesNotExist:
        return Response(
            {"error": "Invalid or already used activation code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Activate
    installation.installation_id = installation_id
    installation.status = Installation.Status.ACTIVE
    installation.activated_at = timezone.now()
    installation.name = data.get("name") or installation.name
    installation.app_version = data.get("app_version", "")
    installation.os_info = data.get("os_info", "")
    installation.check_in_ip = _get_client_ip(request)

    # Sign the license token
    payload = build_license_payload(installation)
    token = sign_license_token(payload)
    installation.license_jwt = token
    installation.last_check_in = timezone.now()

    # Clear activation code (one-time use)
    installation.activation_code = ""
    installation.save()

    # Build response
    import jwt as pyjwt

    decoded = pyjwt.decode(token, options={"verify_signature": False})

    return Response(
        build_activation_bootstrap_payload(installation, token, decoded),
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def check_in(request: Request) -> Response:
    """
    Periodic check-in to refresh the license token (Phase 3 enhanced).

    Called by the hub every 6 hours. Accepts telemetry, binary hashes,
    and hardware fingerprint. Performs integrity verification and issues
    a fresh JWT.
    """
    serializer = CheckInRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    installation_id = data["installation_id"]

    try:
        installation = Installation.objects.select_related(
            "organization", "organization__subscription_plan"
        ).get(installation_id=installation_id)
    except Installation.DoesNotExist:
        return Response(
            {"error": "Installation not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Check if revoked/suspended
    if installation.status == Installation.Status.REVOKED:
        return Response(
            {"error": "This installation has been revoked.", "code": "revoked"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if installation.status == Installation.Status.SUSPENDED:
        return Response(
            {"error": "This installation is suspended.", "code": "suspended"},
            status=status.HTTP_403_FORBIDDEN,
        )

    if installation.status == Installation.Status.PENDING:
        return Response(
            {"error": "This installation has not been activated yet."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Update metadata
    client_ip = _get_client_ip(request)
    app_version = data.get("version") or data.get("app_version") or installation.app_version

    installation.last_check_in = timezone.now()
    installation.check_in_ip = client_ip
    installation.app_version = app_version
    installation.os_info = data.get("os_info") or installation.os_info
    installation.hostname = data.get("hostname") or installation.hostname
    installation.check_in_count = (installation.check_in_count or 0) + 1

    # Phase 3: Hardware fingerprint binding
    hardware_fp = data.get("hardware_fingerprint", "")
    if hardware_fp and not installation.hardware_fingerprint:
        # First check-in with fingerprint — bind it
        installation.hardware_fingerprint = hardware_fp
        # Note: mismatch detection handled below (clone detection)

    # Phase 3: Binary integrity verification
    binary_hashes = data.get("binary_hashes", {})
    integrity_result = None
    if binary_hashes:
        installation.last_reported_hashes = binary_hashes
        integrity_result = _verify_integrity(installation, binary_hashes, app_version)

    # Sign a fresh token
    payload = build_license_payload(installation)

    # Add tamper_detected flag if integrity check failed
    if integrity_result and not integrity_result.get("match", True):
        payload.setdefault("features", {})["tamper_detected"] = True

    token = sign_license_token(payload)
    installation.license_jwt = token

    update_fields = [
        "last_check_in",
        "check_in_ip",
        "app_version",
        "os_info",
        "hostname",
        "check_in_count",
        "hardware_fingerprint",
        "last_reported_hashes",
        "license_jwt",
        "updated_at",
    ]
    installation.save(update_fields=update_fields)

    # Log the check-in
    _create_check_in_log(installation, data, client_ip, integrity_result)

    import jwt as pyjwt

    decoded = pyjwt.decode(token, options={"verify_signature": False})

    # Build response
    response_data = {
        "license": token,
        "license_token": token,  # Legacy compatibility
        "installation_id": str(installation.installation_id),
        "org_name": payload.get("org_name", ""),
        "tier": payload.get("tier", ""),
        "features": payload.get("features", {}),
        "expires_at": decoded.get("exp"),
        "check_in_by": decoded.get("check_in_by"),
        "binary_manifest_id": installation.binary_manifest_id,
        "actions": [],
    }

    # Detect clone: different hardware fingerprint
    if (
        hardware_fp
        and installation.hardware_fingerprint
        and hardware_fp != installation.hardware_fingerprint
    ):
        response_data["actions"].append(
            {"type": "hardware_mismatch", "message": "Hardware fingerprint does not match."}
        )

    return Response(response_data, status=status.HTTP_200_OK)


def _verify_integrity(installation, binary_hashes: dict, app_version: str) -> dict | None:
    """
    Compare reported binary hashes against the expected release manifest.

    Returns the verification result dict, or None if no manifest exists.
    """
    from .models import ReleaseManifest

    try:
        manifest = ReleaseManifest.objects.get(version=app_version)
    except ReleaseManifest.DoesNotExist:
        # No manifest for this version — can't verify (expected during dev)
        return None

    result = manifest.verify_hashes(binary_hashes)

    if not result["match"]:
        # Flag tamper if not already flagged
        if not installation.tamper_flagged_at:
            installation.flag_tamper()
        installation.binary_manifest_id = manifest.manifest_id
        installation.save(update_fields=["binary_manifest_id", "updated_at"])
    else:
        # Hashes match — clear any previous tamper flag
        if installation.tamper_flagged_at and not installation.tamper_resolved_at:
            installation.clear_tamper()

    return result


def _create_check_in_log(installation, data: dict, client_ip: str, integrity_result) -> None:
    """Create a CheckInLog entry for audit trail."""
    from .models import CheckInLog

    CheckInLog.objects.create(
        installation=installation,
        ip_address=client_ip,
        hostname=data.get("hostname", ""),
        app_version=data.get("version") or data.get("app_version", ""),
        os_info=data.get("os_info", ""),
        uptime_seconds=data.get("uptime_seconds", 0),
        user_count_24h=data.get("user_count_24h", 0),
        encounter_count_24h=data.get("encounter_count_24h", 0),
        hardware_fingerprint=data.get("hardware_fingerprint", ""),
        binary_hashes=data.get("binary_hashes", {}),
        integrity_match=integrity_result.get("match") if integrity_result else None,
        token_issued=True,
    )


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def license_status(request: Request) -> Response:
    """
    Verify a license token locally (no internet required).

    The token is passed via X-License-Token header or as a query param.
    This endpoint is used by the hub for self-verification.
    """
    token = _extract_license_token(request)
    if not token:
        return Response(
            {
                "valid": False,
                "tier": "",
                "features": {},
                "org_name": "",
                "subscription_status": "",
                "expires_at": None,
                "check_in_by": None,
                "check_in_overdue": False,
                "error": "No license token provided.",
            },
            status=status.HTTP_200_OK,
        )

    try:
        payload = verify_license_token(token)
        return Response(
            {
                "valid": True,
                "tier": payload.get("tier", ""),
                "features": payload.get("features", {}),
                "org_name": payload.get("org_name", ""),
                "subscription_status": payload.get("subscription_status", ""),
                "expires_at": payload.get("exp"),
                "check_in_by": payload.get("check_in_by"),
                "check_in_overdue": is_check_in_overdue(payload),
                "error": "",
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response(
            {
                "valid": False,
                "tier": "",
                "features": {},
                "org_name": "",
                "subscription_status": "",
                "expires_at": None,
                "check_in_by": None,
                "check_in_overdue": False,
                "error": str(e),
            },
            status=status.HTTP_200_OK,
        )


@api_view(["POST"])
@permission_classes([permissions.IsAdminUser])
def generate_activation_code(request: Request) -> Response:
    """
    Generate a new activation code for an organization (admin only).

    Creates a pending Installation with a random activation code that can
    be given to the customer for first-run activation.
    """
    serializer = GenerateActivationCodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    from hmis.apps.core.models import Facility, Organization

    try:
        org = Organization.objects.get(pk=data["organization_id"])
    except Organization.DoesNotExist:
        return Response(
            {"error": "Organization not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    facility = None
    if data.get("facility_id"):
        try:
            facility = Facility.objects.get(pk=data["facility_id"], organization=org)
        except Facility.DoesNotExist:
            return Response(
                {"error": "Facility not found in this organization."},
                status=status.HTTP_404_NOT_FOUND,
            )

    # Generate a unique activation code (16 chars, URL-safe)
    code = secrets.token_urlsafe(12)  # 16 chars

    installation = Installation.objects.create(
        organization=org,
        facility=facility,
        name=data.get("name", ""),
        activation_code=code,
        status=Installation.Status.PENDING,
        activated_by=request.user,
    )

    return Response(
        {
            "id": installation.pk,
            "activation_code": code,
            "organization": org.name,
            "facility": facility.name if facility else None,
            "status": installation.status,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])  # License JWT, not a user JWT — skip DRF auth
@permission_classes([permissions.AllowAny])
def registry_token(request: Request) -> Response:
    """
    Exchange a valid license JWT for a short-lived Docker registry pull token.

    POST /api/licensing/registry-token/
    Authorization: Bearer <license-jwt>
    Body: {"installation_id": "..."}

    Returns a short-lived bearer token scoped for pulling the hub image.
    """
    import time as _time

    # Manually extract token — don't rely on DRF auth (this is a license JWT, not user JWT)
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth_header.startswith("Bearer "):
        return Response(
            {"detail": "License JWT required in Authorization header."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    from .tokens import verify_license_token

    license_jwt = auth_header[7:]
    payload = verify_license_token(license_jwt)
    if payload is None:
        return Response(
            {"detail": "Invalid or expired license token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    installation_id = request.data.get("installation_id", "")
    if installation_id and installation_id != payload.get("installation_id"):
        return Response(
            {"detail": "Installation ID mismatch."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Generate a short-lived registry token (1 hour)
    import hashlib
    import hmac

    from django.conf import settings as _settings

    secret = getattr(_settings, "DJANGO_SECRET_KEY", "") or getattr(_settings, "SECRET_KEY", "")
    inst_id = payload.get("installation_id", installation_id)
    expires_at = int(_time.time()) + 3600  # 1 hour

    # HMAC-based token: not a full JWT but sufficient for private registry auth
    token_data = f"{inst_id}:{expires_at}"
    signature = hmac.new(
        secret.encode(),
        token_data.encode(),
        hashlib.sha256,
    ).hexdigest()[:32]
    registry_pull_token = f"{token_data}:{signature}"

    return Response(
        {
            "token": registry_pull_token,
            "expires_at": expires_at,
            "registry": "registry.vitora.digital",
            "scope": "pull",
        },
        status=status.HTTP_200_OK,
    )


class InstallationViewSet(viewsets.ModelViewSet):
    """Admin viewset for managing installations."""

    http_method_names = ["get", "patch", "post", "head", "options"]
    permission_classes = [permissions.IsAdminUser]
    queryset = Installation.objects.select_related("organization", "facility").order_by(
        "-created_at"
    )

    def get_serializer_class(self):
        if self.action == "list":
            return InstallationListSerializer
        return InstallationDetailSerializer

    def create(self, request, *args, **kwargs):
        """Installations are created via generate-code, not direct POST."""
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        """Revoke an installation's license."""
        installation = self.get_object()
        serializer = RevokeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if installation.status == Installation.Status.REVOKED:
            return Response(
                {"error": "Already revoked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        installation.revoke(reason=serializer.validated_data.get("reason", ""))
        return Response(
            {"status": "revoked", "installation_id": str(installation.installation_id)},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        """Suspend an installation temporarily."""
        installation = self.get_object()
        serializer = RevokeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        installation.suspend(reason=serializer.validated_data.get("reason", ""))
        return Response(
            {"status": "suspended", "installation_id": str(installation.installation_id)},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        """Reactivate a suspended installation."""
        installation = self.get_object()
        if installation.status != Installation.Status.SUSPENDED:
            return Response(
                {"error": "Can only reactivate suspended installations."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        installation.status = Installation.Status.ACTIVE
        installation.revoked_reason = ""

        # Issue a fresh token
        payload = build_license_payload(installation)
        token = sign_license_token(payload)
        installation.license_jwt = token
        installation.save(update_fields=["status", "revoked_reason", "license_jwt", "updated_at"])

        return Response(
            {"status": "active", "installation_id": str(installation.installation_id)},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="send-code")
    def send_code(self, request, pk=None):
        """Email the activation code to the organization's contact email.

        Accepts optional overrides in the request body:
          - to_email: override recipient (defaults to org contact_email)
          - subject: override email subject
          - body: override email body (plain text — will be wrapped in the HTML template)
        """
        from hmis.apps.core.services.email_service import send_activation_code_email

        installation = self.get_object()

        if not installation.activation_code:
            return Response(
                {"error": "No activation code available for this installation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        org = installation.organization

        # Allow recipient override
        to_email = (request.data.get("to_email") or "").strip()
        if not to_email:
            to_email = getattr(org, "contact_email", "") or ""
        if not to_email:
            return Response(
                {"error": "No recipient email provided and organization has no contact email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Allow subject/body overrides
        custom_subject = (request.data.get("subject") or "").strip()
        custom_body = (request.data.get("body") or "").strip()

        if custom_body:
            # Use custom body — render with a minimal wrapper template
            from hmis.apps.core.services.email_service import _send

            subject = custom_subject or f"Vitora HMIS Activation Code — {org.name}"
            # Wrap plain text in basic HTML with line breaks preserved
            html_body = (
                "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
                'font-size:14px;color:#18181b;line-height:1.6;white-space:pre-wrap">'
                f"{custom_body}</div>"
            )
            success = _send(subject=subject, html_body=html_body, to_email=to_email)
        else:
            success = send_activation_code_email(
                to_email=to_email,
                organization_name=org.name,
                activation_code=installation.activation_code,
                installation_name=installation.name or "",
                facility_name=installation.facility.name if installation.facility else "",
            )

        if success:
            return Response(
                {"sent_to": to_email, "organization": org.name},
                status=status.HTTP_200_OK,
            )
        return Response(
            {"error": "Failed to send email. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request headers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _extract_license_token(request: Request) -> str:
    """Extract license token from X-License-Token header or query param."""
    # Try custom header (avoids conflict with DRF JWT auth on Authorization header)
    license_header = request.META.get("HTTP_X_LICENSE_TOKEN", "")
    if license_header:
        return license_header

    # Try query parameter
    return request.query_params.get("token", "")
