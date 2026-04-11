"""
PowerSync JWT integration.

Two responsibilities:
1. PowerSyncTokenObtainPairSerializer — adds tenant claims (facility_id,
   organization_id) to the standard Django login JWT so sync rules can
   evaluate them.  These tokens are used for regular API auth.

2. PowerSyncCredentialsView — dedicated endpoint that returns a
   purpose-built JWT for PowerSync Cloud.  It uses PyJWT directly
   (not simplejwt) so we can set the required `kid` header, `sub`
   claim, and correct `aud` claim that PowerSync Cloud verifies.

PowerSync Cloud HS256 requirements (docs.powersync.com):
  - JWT header must include `kid` matching the dashboard key ID
  - `sub` claim = user ID
  - `aud` claim = PowerSync instance URL (or custom audience in dashboard)
  - `iss`, `iat`, `exp` present; exp − iat ≤ 86400
"""

import time

import jwt as pyjwt
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class PowerSyncTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT token to include tenant context claims.

    PowerSync reads these claims from the JWT to evaluate sync rules:
      - facility_id: filters facility-scoped data (encounters, triage, etc.)
      - organization_id: filters organization-scoped data (patients, etc.)
      - user_id: already included by default via SIMPLE_JWT config
      - iss: issuer claim for token verification
      - aud: audience claim for token verification
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add PowerSync-required claims
        token["iss"] = "vitora-hmis"
        token["aud"] = "powersync"

        # Add tenant context from StaffProfile
        facility_id = None
        organization_id = None

        profile = getattr(user, "staff_profile", None)
        if profile:
            try:
                profile = user.staff_profile
            except Exception:
                profile = None

        if profile:
            if profile.primary_facility_id:
                facility_id = profile.primary_facility_id
            if profile.organization_id:
                organization_id = profile.organization_id

        # PowerSync reads these via token_parameters.<name> in sync rules
        token["facility_id"] = facility_id
        token["organization_id"] = organization_id

        return token


def _get_powersync_settings():
    """Return PowerSync settings with defaults."""
    return {
        "url": getattr(settings, "POWERSYNC_URL", ""),
        "kid": getattr(settings, "POWERSYNC_JWT_KID", "vitora-hmis-1"),
        "audience": getattr(settings, "POWERSYNC_JWT_AUDIENCE", "powersync"),
        "issuer": "vitora-hmis",
        "expiry_seconds": 3600,  # 60 minutes (PowerSync max is 24h, recommended ≤ 60m)
    }


class PowerSyncCredentialsView(APIView):
    """
    Returns a JWT credential for PowerSync Cloud.

    GET /api/powersync/credentials/

    The token is purpose-built for PowerSync with:
      - `kid` header matching the PowerSync Cloud dashboard HS256 key
      - `sub` = user_id (required by PowerSync)
      - `aud` = PowerSync instance URL or custom audience
      - `iss` = "vitora-hmis"
      - `facility_id`, `organization_id` for sync rule evaluation
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ps = _get_powersync_settings()

        if not ps["url"]:
            return Response(
                {"error": "PowerSync is not configured on this server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Resolve tenant context from the user's StaffProfile
        facility_id = None
        organization_id = None
        profile = getattr(request.user, "staff_profile", None)
        if profile:
            try:
                profile = request.user.staff_profile
            except Exception:
                profile = None
        if profile:
            facility_id = profile.primary_facility_id
            organization_id = profile.organization_id

        now = int(time.time())
        payload = {
            "sub": str(request.user.id),
            "user_id": request.user.id,
            "iss": ps["issuer"],
            "aud": ps["audience"],
            "iat": now,
            "exp": now + ps["expiry_seconds"],
            # Tenant context for sync stream WHERE clauses
            "facility_id": facility_id,
            "organization_id": organization_id,
        }

        token = pyjwt.encode(
            payload,
            settings.SECRET_KEY,
            algorithm="HS256",
            headers={"kid": ps["kid"]},
        )

        return Response(
            {
                "token": token,
                "powersync_url": ps["url"],
                "expires_at": now + ps["expiry_seconds"],
            }
        )
