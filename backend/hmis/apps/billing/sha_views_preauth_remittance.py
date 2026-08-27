"""
What this file is for: preauth, remittance, and capitation endpoints extracted from sha_views.
How to use: imported and re-exported by hmis.apps.billing.sha_views to preserve existing URL imports.
Supported inputs/args: DRF APIView/ViewSet requests for SHA preauth, remittance, and capitation validation endpoints.
"""

import logging

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import SHAClaim, SHAMember
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


class PreauthSubmitView(APIView):
    """
    Submit pre-authorization request to DHA.

    POST /api/sha/preauth/submit/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="PreauthSubmitRequest",
            fields={
                "claim_id": serializers.IntegerField(),
                "consent_token_id": serializers.IntegerField(),
                "procedure_code": serializers.CharField(),
                "diagnosis_codes": serializers.ListField(),
                "estimated_cost": serializers.DecimalField(max_digits=12, decimal_places=2),
                "scheduled_date": serializers.DateField(),
                "clinical_notes": serializers.CharField(required=False),
            },
        ),
        responses={
            201: inline_serializer(
                name="PreauthSubmitResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "preauth_reference": serializers.CharField(),
                    "decision": serializers.CharField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Submit pre-authorization request."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.services.sha_preauth import SHAPreauthError, SHAPreauthService
        from hmis.apps.billing.sha_serializers import SubmitPreauthSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SubmitPreauthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            claim = SHAClaim.objects.select_related("patient", "sha_member").get(
                id=data["claim_id"], facility=facility
            )
        except SHAClaim.DoesNotExist:
            return Response(
                {"error": "SHA claim not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            consent = ConsentToken.objects.get(id=data["consent_token_id"], facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not consent.is_valid:
            return Response(
                {"error": "Consent token is expired or invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAPreauthService()
            preauth = service.submit_preauth(
                claim=claim,
                consent=consent,
                procedure_code=data["procedure_code"],
                diagnosis_codes=data["diagnosis_codes"],
                estimated_cost=data["estimated_cost"],
                scheduled_date=data["scheduled_date"],
                clinical_notes=data.get("clinical_notes", ""),
                user=request.user,
            )

            return Response(
                {
                    "id": preauth.id,
                    "preauth_reference": preauth.preauth_reference,
                    "decision": preauth.decision,
                    "message": "Pre-authorization submitted successfully",
                },
                status=status.HTTP_201_CREATED,
            )
        except SHAPreauthError as e:
            logger.warning("Failed to submit preauth: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class PreauthStatusView(APIView):
    """
    Check pre-authorization status.

    GET /api/sha/preauth/{id}/status/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PreauthStatusResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "preauth_reference": serializers.CharField(),
                    "decision": serializers.CharField(),
                    "approved_amount": serializers.DecimalField(max_digits=12, decimal_places=2),
                    "valid_until": serializers.DateField(),
                    "is_valid": serializers.BooleanField(),
                    "poll_count": serializers.IntegerField(),
                },
            )
        },
    )
    def get(self, request, pk):
        """Retrieve pre-authorization status."""
        from hmis.apps.billing.models import PreauthRequest
        from hmis.apps.billing.sha_serializers import PreauthRequestSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            preauth = PreauthRequest.objects.select_related("patient", "sha_member", "claim").get(
                id=pk, facility=facility
            )
        except PreauthRequest.DoesNotExist:
            return Response(
                {"error": "Pre-authorization request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PreauthRequestSerializer(preauth)
        return Response(serializer.data)


class PreauthPendingListView(APIView):
    """
    List pending pre-authorization requests for the facility.

    GET /api/sha/preauth/pending/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PreauthPendingListResponse",
                fields={
                    "count": serializers.IntegerField(),
                    "results": serializers.ListField(),
                },
            )
        },
    )
    def get(self, request):
        """List all pending preauth requests for the current facility."""
        from hmis.apps.billing.models import PreauthRequest
        from hmis.apps.billing.sha_serializers import PreauthRequestSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        preauths = (
            PreauthRequest.objects.filter(
                decision=PreauthRequest.PreauthDecision.PENDING,
                facility=facility,
            )
            .select_related("patient", "sha_member", "claim")
            .order_by("-created_at")
        )

        serializer = PreauthRequestSerializer(preauths, many=True)
        return Response(
            {
                "count": preauths.count(),
                "results": serializer.data,
            }
        )


class SHARemittanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    SHA Remittance management.

    GET /api/sha/remittances/          -> list remittances
    GET /api/sha/remittances/{id}/     -> remittance detail
    GET /api/sha/remittances/{id}/claims/ -> claims paid by this remittance
    POST /api/sha/remittances/fetch/   -> trigger DHA fetch
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get_queryset(self):
        from hmis.apps.billing.models import SHARemittance
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(self.request)
        facility = getattr(self.request, "facility", None)
        if not facility:
            return SHARemittance.objects.none()
        return SHARemittance.objects.filter(facility=facility).order_by("-payment_date")

    def get_serializer_class(self):
        from hmis.apps.billing.sha_serializers import (
            SHARemittanceLineSerializer,
            SHARemittanceSerializer,
        )

        if self.action == "claims":
            return SHARemittanceLineSerializer
        return SHARemittanceSerializer

    @action(detail=True, methods=["get"])
    def claims(self, request, pk=None):  # noqa: ARG002
        """Get claims paid by this remittance."""
        from hmis.apps.billing.models import SHARemittanceLine

        remittance = self.get_object()
        lines = SHARemittanceLine.objects.filter(remittance=remittance).select_related("claim")
        serializer = self.get_serializer(lines, many=True)
        return Response({"count": lines.count(), "results": serializer.data})

    @action(detail=False, methods=["post"])
    def fetch(self, request):
        """Trigger a fetch of remittances from DHA for the current facility."""
        from hmis.apps.billing.services.sha_remittance import (
            SHARemittanceError,
            SHARemittanceService,
        )
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context"},
                status=status.HTTP_403_FORBIDDEN,
            )

        facility_code = getattr(facility, "facility_code", "") or ""
        if not facility_code:
            return Response(
                {"error": "Facility has no MFL code configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHARemittanceService()
            remittances = service.fetch_remittances(facility_code=facility_code, facility=facility)
            for remittance in remittances:
                if remittance.status in ("received", "partial"):
                    service.fetch_claims_paid(remittance, facility_code)

            return Response(
                {
                    "message": f"Fetched {len(remittances)} remittance(s) from DHA",
                    "count": len(remittances),
                }
            )
        except SHARemittanceError as e:
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CapitationValidationView(APIView):
    """
    Pre-flight validation for PHC/capitation claims.

    POST /api/billing/capitation/validate/
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]

    @extend_schema(
        request=inline_serializer(
            name="CapitationValidationRequest",
            fields={
                "sha_member_id": serializers.IntegerField(required=True),
                "claim_id": serializers.IntegerField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="CapitationValidationResponse",
                fields={
                    "is_valid": serializers.BooleanField(),
                    "warning": serializers.CharField(allow_blank=True),
                    "blocking": serializers.BooleanField(),
                    "details": serializers.DictField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """Validate capitation provider selection."""
        from hmis.apps.billing.services.capitation_validation import validate_capitation_provider

        sha_member_id = request.data.get("sha_member_id")
        claim_id = request.data.get("claim_id")

        if not sha_member_id:
            return Response(
                {"error": "sha_member_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sha_member = SHAMember.objects.select_related("patient").get(pk=sha_member_id)
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        facility = None
        if claim_id:
            try:
                claim = SHAClaim.objects.select_related("facility").get(pk=claim_id)
                facility = claim.facility
            except SHAClaim.DoesNotExist:
                pass

        if not facility:
            staff_profile = getattr(request.user, "staff_profile", None)
            if staff_profile:
                facility = getattr(staff_profile, "primary_facility", None)

        if not facility:
            return Response(
                {
                    "error": "Could not determine facility. Provide claim_id or ensure user has a primary facility."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = validate_capitation_provider(sha_member, facility)

        return Response(
            {
                "is_valid": result.is_valid,
                "warning": result.warning,
                "blocking": result.blocking,
                "details": result.details,
            },
            status=status.HTTP_200_OK,
        )


class CapitationValidateDirectView(APIView):
    """
    Pre-flight capitation provider validation using raw eligibility response.

    POST /api/billing/capitation/validate-direct/
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]

    @extend_schema(
        request=inline_serializer(
            name="CapitationValidateDirectRequest",
            fields={
                "eligibility_response": serializers.DictField(required=True),
            },
        ),
        responses={
            200: inline_serializer(
                name="CapitationValidateDirectResponse",
                fields={
                    "is_valid": serializers.BooleanField(),
                    "warning": serializers.CharField(allow_blank=True),
                    "blocking": serializers.BooleanField(),
                    "details": serializers.DictField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """Validate capitation provider using raw eligibility data."""
        from hmis.apps.billing.services.capitation_validation import (
            CapitationValidationResult,
            _extract_provider_code,
            _get_facility_codes,
        )

        eligibility_response = request.data.get("eligibility_response")
        if not eligibility_response or not isinstance(eligibility_response, dict):
            return Response(
                {"error": "eligibility_response dict is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff_profile = getattr(request.user, "staff_profile", None)
        facility = getattr(staff_profile, "primary_facility", None) if staff_profile else None

        if not facility:
            return Response(
                {"error": "Could not determine your facility."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider_code = _extract_provider_code(eligibility_response)

        if not provider_code:
            result = CapitationValidationResult(is_valid=True)
        else:
            facility_codes = _get_facility_codes(facility)
            if provider_code.upper() in {c.upper() for c in facility_codes if c}:
                result = CapitationValidationResult(
                    is_valid=True,
                    details={"matched_code": provider_code},
                )
            else:
                result = CapitationValidationResult(
                    is_valid=False,
                    warning=(
                        f"Patient's selected outpatient provider ({provider_code}) "
                        f"does not match this facility. If you register and treat "
                        f"this patient under capitation (PHC), the claim may be "
                        f"rejected by SHA."
                    ),
                    blocking=False,
                    details={
                        "patient_provider_code": provider_code,
                        "facility_codes": facility_codes,
                    },
                )

        return Response(
            {
                "is_valid": result.is_valid,
                "warning": result.warning,
                "blocking": result.blocking,
                "details": result.details,
            },
            status=status.HTTP_200_OK,
        )
