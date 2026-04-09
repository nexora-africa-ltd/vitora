"""
Custom JWT token serializer for PowerSync integration.

Adds facility_id, organization_id, and PowerSync-required claims
(iss, aud) to JWT access tokens so PowerSync sync rules can filter
data by tenant context.
"""

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
