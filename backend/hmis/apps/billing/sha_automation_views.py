# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SHA Claims Automation API Views.

Provides endpoints for:
- Batch claim validation
- Bulk claim submission
- Claims daily digest
- Intervention suggestions
- Eligibility pre-check trigger
"""

import logging

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.licensing.permissions import requires_feature

logger = logging.getLogger(__name__)


ShaAutomationGenericResponseSerializer = inline_serializer(
    name="ShaAutomationGenericResponse",
    fields={
        "data": serializers.JSONField(required=False),
        "status": serializers.CharField(required=False),
        "message": serializers.CharField(required=False),
    },
)

ShaAutomationErrorResponseSerializer = inline_serializer(
    name="ShaAutomationErrorResponse",
    fields={"error": serializers.CharField()},
)

SHA_AUTOMATION_RESPONSES = {
    200: ShaAutomationGenericResponseSerializer,
    400: ShaAutomationErrorResponseSerializer,
    404: ShaAutomationErrorResponseSerializer,
}


class SHAAutomationSchemaMixin:
    """Schema fallback helpers for APIViews used by drf-spectacular."""

    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}


@extend_schema(responses=SHA_AUTOMATION_RESPONSES)
class ClaimBatchValidateView(SHAAutomationSchemaMixin, APIView):
    """
    Validate all draft SHA claims for the user's facility in batch.

    POST /api/sha/claims/batch-validate/

    Returns summary with ready/invalid/missing_docs counts and claim details.
    """

    permission_classes = [
        IsAuthenticated,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        facility = getattr(request.user, "active_facility", None)
        if not facility:
            staff_profile = getattr(request.user, "staff_profile", None)
            facility = getattr(staff_profile, "primary_facility", None) if staff_profile else None

        if not facility:
            return Response(
                {"error": "No facility associated with user"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = SHAClaimAutomationService.batch_validate_claims(facility.pk)
        return Response(result)


@extend_schema(responses=SHA_AUTOMATION_RESPONSES)
class ClaimBulkSubmitView(SHAAutomationSchemaMixin, APIView):
    """
    Submit multiple validated SHA claims in bulk.

    POST /api/sha/claims/bulk-submit/
    Body: {"claim_ids": [1, 2, 3, ...]}

    Only submits claims that pass validation. Returns detailed results.
    """

    permission_classes = [
        IsAuthenticated,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        claim_ids = request.data.get("claim_ids", [])
        if not claim_ids:
            return Response(
                {"error": "claim_ids is required and must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(claim_ids, list) or len(claim_ids) > 50:
            return Response(
                {"error": "claim_ids must be a list with max 50 items"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate all IDs are integers
        try:
            claim_ids = [int(cid) for cid in claim_ids]
        except (TypeError, ValueError):
            return Response(
                {"error": "All claim_ids must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = SHAClaimAutomationService.bulk_submit_claims(claim_ids, user=request.user)
        return Response(result)


@extend_schema(responses=SHA_AUTOMATION_RESPONSES)
class ClaimDailyDigestView(SHAAutomationSchemaMixin, APIView):
    """
    Get the SHA claims daily digest for the user's facility.

    GET /api/sha/claims/daily-digest/

    Returns comprehensive summary with counts, amounts, and action items.
    """

    permission_classes = [
        IsAuthenticated,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        facility = getattr(request.user, "active_facility", None)
        if not facility:
            staff_profile = getattr(request.user, "staff_profile", None)
            facility = getattr(staff_profile, "primary_facility", None) if staff_profile else None

        if not facility:
            return Response(
                {"error": "No facility associated with user"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        digest = SHAClaimAutomationService.generate_daily_digest(facility.pk)
        return Response(digest)


@extend_schema(responses=SHA_AUTOMATION_RESPONSES)
class ClaimInterventionSuggestionsView(SHAAutomationSchemaMixin, APIView):
    """
    Get intervention suggestions for a specific encounter/claim.

    GET /api/sha/claims/{claim_id}/suggest-interventions/

    Returns list of suggested SHA interventions based on clinical data.
    """

    permission_classes = [
        IsAuthenticated,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer]

    def get(self, _request, claim_id):
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        try:
            claim = SHAClaim.objects.get(pk=claim_id)
        except SHAClaim.DoesNotExist:
            return Response(
                {"error": "Claim not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not claim.encounter_id:
            return Response({"suggestions": [], "message": "No encounter linked"})

        suggestions = SHAClaimAutomationService.suggest_interventions_for_encounter(
            claim.encounter_id
        )
        return Response({"suggestions": suggestions, "count": len(suggestions)})

    def post(self, request, claim_id):
        """
        Accept and attach suggested interventions to the claim.

        POST /api/sha/claims/{claim_id}/suggest-interventions/
        Body: {"interventions": [{"code": "...", "name": "...", ...}]}
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        if not SHAClaim.objects.filter(pk=claim_id).exists():
            return Response(
                {"error": "Claim not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        interventions = request.data.get("interventions", [])
        if not interventions:
            return Response(
                {"error": "interventions list is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = SHAClaimAutomationService.auto_attach_interventions(claim_id, interventions)
        return Response(result)


@extend_schema(responses=SHA_AUTOMATION_RESPONSES)
class EligibilityPreCheckView(SHAAutomationSchemaMixin, APIView):
    """
    Trigger eligibility pre-check for a patient.

    POST /api/sha/eligibility/pre-check/
    Body: {"patient_id": 123}

    Queues a background eligibility check and caches the result.
    """

    permission_classes = [
        IsAuthenticated,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        from hmis.apps.billing.tasks import cache_patient_eligibility

        patient_id = request.data.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        facility = getattr(request.user, "active_facility", None)
        if not facility:
            staff_profile = getattr(request.user, "staff_profile", None)
            facility = getattr(staff_profile, "primary_facility", None) if staff_profile else None

        facility_id = facility.pk if facility else None

        try:
            cache_patient_eligibility.delay(int(patient_id), facility_id)
            return Response(
                {"status": "queued", "message": "Eligibility check queued for processing"}
            )
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError):
            # Celery not available — run synchronously
            from hmis.apps.billing.sha_automation import SHAClaimAutomationService

            result = SHAClaimAutomationService.cache_patient_eligibility(
                int(patient_id), facility_id
            )
            return Response(result)


@extend_schema(responses=SHA_AUTOMATION_RESPONSES)
class ClaimAutoAttachDocumentsView(SHAAutomationSchemaMixin, APIView):
    """
    Trigger auto-attachment of digital documents to a claim.

    POST /api/sha/claims/{claim_id}/auto-attach-documents/

    Scans the encounter for completed lab results, prescriptions, and
    clinical notes, then attaches them as claim documents.
    """

    permission_classes = [
        IsAuthenticated,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer]

    def post(self, _request, claim_id):
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.auto_attach_documents(claim_id)
        return Response(result)
