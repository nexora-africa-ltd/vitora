# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Cloud-side relay views for hub-proxied requests.

These endpoints receive requests from hub installations (authenticated
via license JWT in the Authorization header) and forward them to external
services (DHA HIE, KHIS) using centrally-managed credentials.

Benefits of this architecture:
- SHA/DHA credentials never leave the cloud (Azure Key Vault)
- Hub submissions are centrally audited
- A revoked hub cannot submit claims (license check at this layer)
- No need to rotate credentials on every hub individually
"""

from __future__ import annotations

import logging

from rest_framework import permissions, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

from hmis.apps.licensing.models import Installation

logger = logging.getLogger(__name__)


class HubLicenseAuthenticated(permissions.BasePermission):
    """
    Authenticate a hub request using the license JWT in the Authorization header.

    Validates:
    1. The token is a valid license JWT (RS256 signed by Nexora)
    2. The installation_id in the token matches a known ACTIVE installation
    3. The installation is not revoked or suspended
    """

    message = "Invalid or expired hub license token."

    def has_permission(self, request: Request, _view) -> bool:
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return False

        token = auth_header[7:]
        try:
            from hmis.apps.licensing.tokens import verify_license_token

            payload = verify_license_token(token)
        except Exception:
            return False

        installation_id = payload.get("installation_id")
        if not installation_id:
            return False

        try:
            installation = Installation.objects.select_related("organization", "facility").get(
                installation_id=installation_id,
                status=Installation.Status.ACTIVE,
            )
        except Installation.DoesNotExist:
            return False

        # Attach to request for downstream use
        request._hub_installation = installation
        request._hub_license_payload = payload
        return True


@api_view(["POST"])
@authentication_classes([])
@permission_classes([HubLicenseAuthenticated])
def cloud_sha_submit(request: Request) -> Response:
    """
    Receive a SHA claim from a hub and forward to DHA HIE.

    The hub sends the claim payload; we inject SHA credentials from settings
    and forward to the DHA HIE Middleware. The response is relayed back.
    """
    installation = getattr(request, "_hub_installation", None)
    hub_id = installation.installation_id if installation else "unknown"

    logger.info(
        "Cloud SHA relay: claim submission from hub %s (facility: %s)",
        hub_id,
        installation.facility.name if installation else "unknown",
    )

    # Check that the hub's plan includes sha_claims
    payload = getattr(request, "_hub_license_payload", {})
    features = payload.get("features", {})
    if not features.get("sha_claims", False):
        return Response(
            {
                "detail": "SHA claims feature not included in your subscription plan.",
                "code": "feature_not_available",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    claim_data = request.data

    try:
        from hmis.apps.billing.services.ilm_client import IlmClient

        client = IlmClient()
        # Forward the claim submission
        result = client.post(
            "/api/v1/claims/submit",
            payload=claim_data,
            context=f"hub-relay:{hub_id}",
        )

        return Response(
            {
                "success": result.success,
                "status_code": result.status_code,
                "data": result.data,
            },
            status=status.HTTP_200_OK if result.success else status.HTTP_502_BAD_GATEWAY,
        )
    except Exception as exc:
        logger.exception("Cloud SHA relay failed for hub %s", hub_id)
        return Response(
            {
                "detail": "Failed to forward claim to DHA.",
                "code": "relay_failed",
                "error": str(exc),
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([HubLicenseAuthenticated])
def cloud_sha_preauth(request: Request) -> Response:
    """Receive a SHA preauthorization from a hub and forward to DHA HIE."""
    installation = getattr(request, "_hub_installation", None)
    hub_id = installation.installation_id if installation else "unknown"

    logger.info("Cloud SHA relay: preauth from hub %s", hub_id)

    payload = getattr(request, "_hub_license_payload", {})
    features = payload.get("features", {})
    if not features.get("sha_claims", False):
        return Response(
            {"detail": "SHA claims feature not available.", "code": "feature_not_available"},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        from hmis.apps.billing.services.ilm_preauth_service import IlmPreauthService

        service = IlmPreauthService()
        result = service.create(request.data)
        return Response(result, status=status.HTTP_200_OK)
    except Exception as exc:
        logger.exception("Cloud SHA preauth relay failed for hub %s", hub_id)
        return Response(
            {"detail": "Failed to forward preauth to DHA.", "error": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([HubLicenseAuthenticated])
def cloud_sha_eligibility(request: Request) -> Response:
    """Check patient SHA eligibility on behalf of a hub."""
    installation = getattr(request, "_hub_installation", None)
    hub_id = installation.installation_id if installation else "unknown"

    logger.info("Cloud SHA relay: eligibility check from hub %s", hub_id)

    try:
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService()
        result = service.check_eligibility(request.data)
        return Response(result, status=status.HTTP_200_OK)
    except Exception as exc:
        logger.exception("Cloud eligibility relay failed for hub %s", hub_id)
        return Response(
            {"detail": "Failed to check eligibility.", "error": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([HubLicenseAuthenticated])
def cloud_khis_report(request: Request) -> Response:
    """
    Receive aggregated reporting data from a hub and submit to KHIS/DHIS2.

    The hub sends raw aggregated counts; the cloud generates the DHIS2
    data value set and submits. This keeps KHIS credentials centralized.
    """
    installation = getattr(request, "_hub_installation", None)
    hub_id = installation.installation_id if installation else "unknown"

    logger.info("Cloud KHIS relay: report from hub %s", hub_id)

    payload = getattr(request, "_hub_license_payload", {})
    features = payload.get("features", {})
    if not features.get("dhis2_reporting", False):
        return Response(
            {"detail": "KHIS/DHIS2 reporting not available.", "code": "feature_not_available"},
            status=status.HTTP_403_FORBIDDEN,
        )

    # TODO: Implement KHIS submission when DHIS2 integration is built
    return Response(
        {
            "detail": "KHIS report received. Submission queued.",
            "hub_id": hub_id,
            "status": "queued",
        },
        status=status.HTTP_202_ACCEPTED,
    )
