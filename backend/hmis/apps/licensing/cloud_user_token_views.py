# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Cloud user-token exchange endpoint authenticated by a hub license and Ed25519 proof.

Use POST /api/licensing/cloud/user-token/ with an active hub license Bearer
token plus an Ed25519 signature over a canonical staff request. No password is
accepted. Inputs are username, optional employee_id, timestamp, nonce, and signature.
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
import uuid

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog, StaffProfile
from hmis.apps.core.permissions import get_client_ip
from hmis.apps.licensing.hub_auth import HubLicenseAuthenticated
from hmis.apps.licensing.hub_signing import get_hub_device_signing_key
from hmis.apps.licensing.serializers import (
    CloudUserTokenRequestSerializer,
    CloudUserTokenResponseSerializer,
    HubCloudUserTokenRequestSerializer,
)
from hmis.apps.licensing.tokens import CLOUD_USER_TOKEN_VALIDITY_SECONDS, issue_cloud_user_token

INSTALLATION_PROOF_FRESHNESS_SECONDS = 60
INSTALLATION_PROOF_REPLAY_TTL_SECONDS = INSTALLATION_PROOF_FRESHNESS_SECONDS * 2


def canonical_cloud_user_token_request(
    *, installation_id: str, username: str, employee_id: str | None, timestamp: int, nonce: str
) -> bytes:
    """Return the deterministic request representation signed by a hub installation."""
    return json.dumps(
        {
            "employee_id": employee_id,
            "installation_id": installation_id,
            "nonce": nonce,
            "timestamp": timestamp,
            "username": username,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _verify_installation_proof(installation, data: dict[str, object]) -> str | None:
    """Verify a fresh proof and reserve its nonce; return a rejection code when invalid."""
    if not installation.device_signing_public_key:
        return "installation_proof_not_configured"

    if abs(time.time() - data["timestamp"]) > INSTALLATION_PROOF_FRESHNESS_SECONDS:
        return "stale_installation_proof"

    try:
        public_key = Ed25519PublicKey.from_public_bytes(
            base64.b64decode(installation.device_signing_public_key, validate=True)
        )
        signature = base64.b64decode(data["signature"], validate=True)
        public_key.verify(
            signature,
            canonical_cloud_user_token_request(
                installation_id=str(installation.installation_id),
                username=data["username"],
                employee_id=data.get("employee_id"),
                timestamp=data["timestamp"],
                nonce=data["nonce"],
            ),
        )
    except (InvalidSignature, TypeError, ValueError):
        return "invalid_installation_proof"

    nonce_digest = hashlib.sha256(data["nonce"].encode("utf-8")).hexdigest()
    replay_key = f"licensing:cloud-user-token-proof:{installation.pk}:{nonce_digest}"
    if not cache.add(replay_key, "1", timeout=INSTALLATION_PROOF_REPLAY_TTL_SECONDS):
        return "replayed_installation_proof"
    return None


@extend_schema(
    request=CloudUserTokenRequestSerializer,
    responses={
        200: CloudUserTokenResponseSerializer,
        403: CloudUserTokenResponseSerializer,
        404: CloudUserTokenResponseSerializer,
    },
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([HubLicenseAuthenticated])
def cloud_user_token(request: Request) -> Response:
    """Exchange an active installation license and proof for one scoped cloud user token."""
    serializer = CloudUserTokenRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    installation = request._hub_installation

    proof_rejection = _verify_installation_proof(installation, serializer.validated_data)
    if proof_rejection:
        return Response(
            {"detail": "Installation proof was rejected.", "code": proof_rejection},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not installation.facility_id:
        return Response(
            {"detail": "Installation must be assigned to a facility.", "code": "facility_required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    staff_filters = {
        "user__username": serializer.validated_data["username"],
        "user__is_active": True,
        "employment_status": "ACTIVE",
        "organization_id": installation.organization_id,
        "primary_facility_id": installation.facility_id,
    }
    if employee_id := serializer.validated_data.get("employee_id"):
        staff_filters["employee_id"] = employee_id

    try:
        staff_profile = StaffProfile.objects.select_related("user").get(**staff_filters)
    except StaffProfile.DoesNotExist:
        # Do not disclose whether an account exists outside this installation scope.
        return Response(
            {"detail": "Active staff account not found."}, status=status.HTTP_404_NOT_FOUND
        )

    access_token, jti = issue_cloud_user_token(installation, staff_profile.user)

    AuditLog.log(
        action="hub_cloud_user_token_issued",
        user=staff_profile.user,
        resource_type="User",
        resource_id=staff_profile.user_id,
        organization=installation.organization,
        facility=installation.facility,
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details={"installation_id": str(installation.installation_id), "jti": jti},
    )
    return Response(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": CLOUD_USER_TOKEN_VALIDITY_SECONDS,
        }
    )


@extend_schema(
    request=HubCloudUserTokenRequestSerializer,
    responses={
        200: CloudUserTokenResponseSerializer,
        403: CloudUserTokenResponseSerializer,
        409: CloudUserTokenResponseSerializer,
        503: CloudUserTokenResponseSerializer,
        502: CloudUserTokenResponseSerializer,
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def hub_cloud_user_token(request: Request) -> Response:
    """Sign and proxy the authenticated local user's cloud-token request on a hub."""
    from django.conf import settings

    if getattr(settings, "ENVIRONMENT", "") != "hub":
        return Response(
            {"detail": "This endpoint is available only on a hub.", "code": "hub_only"},
            status=status.HTTP_409_CONFLICT,
        )

    serializer = HubCloudUserTokenRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    employee_id = getattr(getattr(request.user, "staff_profile", None), "employee_id", "")
    timestamp = int(time.time())
    nonce = uuid.uuid4().hex
    proof = {
        "username": request.user.username,
        "timestamp": timestamp,
        "nonce": nonce,
    }
    if employee_id:
        proof["employee_id"] = employee_id

    try:
        signing_key = get_hub_device_signing_key()
        installation_id = str(getattr(settings, "HUB_ID", ""))
        if not installation_id:
            raise ValueError("HUB_ID is required for hub exchange proof signing")
        signature = signing_key.sign(
            canonical_cloud_user_token_request(installation_id=installation_id, **proof)
        )
    except ValueError:
        return Response(
            {"detail": "Hub signing key is not configured.", "code": "hub_signing_key_unavailable"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    proof["signature"] = base64.b64encode(signature).decode("ascii")

    # The proxy reads the hub license server-side and never exposes it to the browser.
    from hmis.apps.licensing.cloud_proxy import exchange_cloud_user_token

    proxy_response = exchange_cloud_user_token(proof)
    if not proxy_response.success:
        error_code = proxy_response.data.get("code", "cloud_user_token_exchange_failed")
        return Response(
            {
                "detail": proxy_response.error or "Cloud user-token exchange failed.",
                "code": error_code,
            },
            status=proxy_response.status_code,
        )

    response_serializer = CloudUserTokenResponseSerializer(data=proxy_response.data)
    if not response_serializer.is_valid():
        return Response(
            {"detail": "Cloud user-token exchange returned an invalid response."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response(response_serializer.validated_data)
