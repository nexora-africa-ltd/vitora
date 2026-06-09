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
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

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

    # Find the pending installation by activation code
    try:
        installation = Installation.objects.select_related(
            "organization", "organization__subscription_plan"
        ).get(
            activation_code=activation_code,
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
        {
            "license_token": token,
            "installation_id": str(installation.installation_id),
            "org_name": payload.get("org_name", ""),
            "tier": payload.get("tier", ""),
            "features": payload.get("features", {}),
            "expires_at": decoded.get("exp"),
            "check_in_by": decoded.get("check_in_by"),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def check_in(request: Request) -> Response:
    """
    Periodic check-in to refresh the license token.

    Called by the desktop app every 24h when internet is available.
    Returns a fresh token with updated features/limits from the org's plan.
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
            status=status.HTTP_403_FORBIDDEN,
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
    installation.last_check_in = timezone.now()
    installation.check_in_ip = _get_client_ip(request)
    installation.app_version = data.get("app_version") or installation.app_version
    installation.os_info = data.get("os_info") or installation.os_info

    # Sign a fresh token
    payload = build_license_payload(installation)
    token = sign_license_token(payload)
    installation.license_jwt = token
    installation.save(
        update_fields=[
            "last_check_in",
            "check_in_ip",
            "app_version",
            "os_info",
            "license_jwt",
            "updated_at",
        ]
    )

    import jwt as pyjwt

    decoded = pyjwt.decode(token, options={"verify_signature": False})

    return Response(
        {
            "license_token": token,
            "installation_id": str(installation.installation_id),
            "org_name": payload.get("org_name", ""),
            "tier": payload.get("tier", ""),
            "features": payload.get("features", {}),
            "expires_at": decoded.get("exp"),
            "check_in_by": decoded.get("check_in_by"),
        },
        status=status.HTTP_200_OK,
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


class InstallationViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin viewset for managing installations."""

    permission_classes = [permissions.IsAdminUser]
    queryset = Installation.objects.select_related("organization", "facility").order_by(
        "-created_at"
    )

    def get_serializer_class(self):
        if self.action == "list":
            return InstallationListSerializer
        return InstallationDetailSerializer

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
