"""
What this file is for: eligibility endpoints extracted from sha_views for modular SHA billing APIs.
How to use: imported by hmis.apps.billing.sha_views and exposed through existing URL routes.
Supported inputs/args: DRF APIView requests for eligibility check and direct eligibility lookup.
"""

import logging

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import SHAMember
from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


def _stringify_error(exc: Exception) -> str:
    """Convert exception details to a safe string for API responses."""
    detail = getattr(exc, "detail", None)
    if detail is not None:
        try:
            return str(detail)
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError):
            return exc.__class__.__name__
    return str(exc)


class EligibilityCheckView(APIView):
    """
    API view for SHA eligibility verification.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        request=inline_serializer(
            name="EligibilityCheckRequest",
            fields={
                "patient_id": serializers.IntegerField(required=False),
                "sha_number": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="EligibilityCheckResponse",
                fields={
                    "is_eligible": serializers.BooleanField(),
                    "result": serializers.CharField(),
                    "eligible_until": serializers.CharField(required=False),
                    "benefit_balance": serializers.FloatField(required=False),
                    "ineligibility_reason": serializers.CharField(required=False),
                    "sha_number": serializers.CharField(),
                    "membership_type": serializers.CharField(),
                    "eligible_schemes": serializers.ListField(
                        child=serializers.CharField(), required=False
                    ),
                    "billable_schemes": serializers.ListField(
                        child=serializers.CharField(), required=False
                    ),
                    "coverage_caveat": serializers.CharField(required=False, allow_blank=True),
                    "coverage_blocked": serializers.BooleanField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """
        Check eligibility for a patient or SHA member.

        POST /api/billing/eligibility/check/
        {
            "patient_id": 123,
            "sha_number": "SHA-XXXXX"
        }
        """
        patient_id = request.data.get("patient_id")
        sha_number = request.data.get("sha_number")
        sha_member_id = request.data.get("sha_member_id")

        if not patient_id and not sha_number and not sha_member_id:
            return Response(
                {"error": "patient_id, sha_number, or sha_member_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            member = None
            if sha_member_id:
                member = SHAMember.objects.filter(id=sha_member_id).first()
            elif sha_number:
                member = SHAMember.objects.filter(sha_number=sha_number).first()
            elif patient_id:
                member = SHAMember.objects.filter(patient_id=patient_id).first()

            if not member:
                return Response(
                    {
                        "is_eligible": False,
                        "result": "NOT_FOUND",
                        "message": "No SHA membership found for this patient",
                    }
                )

            service = SHAEligibilityService()
            facility = getattr(request, "facility", None)
            check = service.check_eligibility(member, request.user, facility=facility)

            response_data = getattr(check, "response_data", {}) or {}
            if not isinstance(response_data, dict):
                response_data = {}
            eligible_schemes = response_data.get("eligible_schemes") or []
            if not isinstance(eligible_schemes, list):
                eligible_schemes = []
            billable_schemes = response_data.get("billable_schemes") or []
            if not isinstance(billable_schemes, list):
                billable_schemes = []
            coverage_caveat = response_data.get("coverage_caveat") or ""
            if not isinstance(coverage_caveat, str):
                coverage_caveat = ""
            coverage_blocked = bool(response_data.get("coverage_blocked", False))

            return Response(
                {
                    "is_eligible": getattr(check, "is_eligible", False),
                    "result": getattr(check, "result", ""),
                    "eligible_until": (
                        str(check.eligible_until)
                        if getattr(check, "eligible_until", None)
                        else None
                    ),
                    "benefit_balance": (
                        float(check.benefit_balance)
                        if getattr(check, "benefit_balance", None)
                        else None
                    ),
                    "ineligibility_reason": getattr(check, "ineligibility_reason", ""),
                    "sha_number": member.sha_number,
                    "membership_type": member.membership_type,
                    "eligible_schemes": eligible_schemes,
                    "billable_schemes": billable_schemes,
                    "coverage_caveat": coverage_caveat,
                    "coverage_blocked": coverage_blocked,
                    "is_pfms_eligible": member.is_pfms_eligible,
                    "pfms_category": member.pfms_category or None,
                    "pfms_category_display": (
                        member.get_pfms_category_display() if member.pfms_category else None
                    ),
                    "pfms_verified": member.pfms_verified,
                }
            )

        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
            logger.exception("SHA eligibility check failed")
            return Response(
                {"error": _stringify_error(exc), "is_eligible": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DirectEligibilityCheckView(APIView):
    """
    API view for direct SHA eligibility verification by ID number.

    This endpoint checks eligibility directly with SHA API without
    requiring a pre-existing SHAMember record. Useful during patient
    registration or lookup to verify SHA coverage status.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "national_id", OpenApiTypes.STR, description="Kenya National ID number"
            ),
            OpenApiParameter("sha_number", OpenApiTypes.STR, description="SHA/CR number"),
            OpenApiParameter("identification_type", OpenApiTypes.STR, description="Custom ID type"),
            OpenApiParameter("identification_number", OpenApiTypes.STR, description="ID value"),
        ],
        responses={
            200: inline_serializer(
                name="DirectEligibilityResponse",
                fields={
                    "is_eligible": serializers.BooleanField(),
                    "sha_number": serializers.CharField(required=False),
                    "full_name": serializers.CharField(required=False),
                    "coverage_end_date": serializers.CharField(required=False),
                    "copay_percentage": serializers.IntegerField(required=False),
                    "reason": serializers.CharField(required=False),
                    "is_employed": serializers.BooleanField(required=False),
                    "error": serializers.CharField(required=False),
                },
            )
        },
    )
    def get(self, request):
        """
        Check SHA eligibility by identification.

        GET /api/billing/eligibility/direct/?national_id=12345678
        GET /api/billing/eligibility/direct/?sha_number=CR1234567890-0
        """
        national_id = request.query_params.get("national_id")
        sha_number = request.query_params.get("sha_number")
        identification_type = request.query_params.get("identification_type")
        identification_number = request.query_params.get("identification_number")

        if national_id:
            id_type = "National ID"
            id_number = national_id
        elif sha_number:
            id_type = "SHA Number"
            id_number = sha_number
        elif identification_type and identification_number:
            id_type = identification_type
            id_number = identification_number
        else:
            return Response(
                {
                    "error": (
                        "national_id, sha_number, or identification_type+identification_number "
                        "is required"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAEligibilityService()
            result = service.check_eligibility_direct(id_type, id_number)

            if result.get("error"):
                error_code = result.get("error_code")
                if error_code == "SHA_AUTH_FAILED":
                    error_status = status.HTTP_502_BAD_GATEWAY
                elif error_code == "SHA_UPSTREAM_TIMEOUT":
                    error_status = status.HTTP_504_GATEWAY_TIMEOUT
                else:
                    error_status = status.HTTP_503_SERVICE_UNAVAILABLE

                return Response(
                    {
                        **result,
                        "message": result.get("error"),
                        "detail": result.get("error"),
                    },
                    status=error_status,
                )

            return Response(result)

        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
            logger.exception("Direct SHA eligibility check failed")
            return Response(
                {
                    "is_eligible": False,
                    "error": _stringify_error(exc),
                    "sha_number": None,
                    "full_name": None,
                    "coverage_end_date": None,
                    "copay_percentage": 100,
                    "reason": "Internal error",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
