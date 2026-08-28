# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: encounter treatment plan application and template API views.
How to use: imported by encounter view compatibility shims.
Supported inputs/args: DRF API views for treatment plan and template application workflows.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: encounter core viewset plus treatment-plan application API views.
How to use: imported by `hmis.apps.encounters.views` compatibility shim.
Supported inputs/args: DRF viewsets/API views for encounter lifecycle and treatment plan actions.
"""

from django.core.exceptions import ValidationError
from django.db.models import ProtectedError
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.checkin.serializers import ClinicalSnapshotSerializer
from hmis.apps.core.history_views import ModelHistoryMixin
from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    PublicIdLookupMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)
from hmis.apps.core.utils import resolve_model_pk_or_public_id
from hmis.apps.encounters.views_shared import resolve_encounter_lookup

from .filters import EncounterFilter
from .models import (
    ChronicCondition,
    CurrentMedication,
    Diagnosis,
    Encounter,
    FamilyHistory,
    ICD10Code,
    Medication,
    PastSurgery,
    SocialHistoryObservation,
    TreatmentPlan,
    TreatmentPlanTemplate,
    VitalFlagSuggestion,
    VitalFlagSuggestionAction,
)
from .serializers import (
    ChronicConditionCreateSerializer,
    ChronicConditionSerializer,
    ClaimedEncounterSerializer,
    CurrentMedicationCreateSerializer,
    CurrentMedicationSerializer,
    DiagnosisSerializer,
    EncounterListSerializer,
    EncounterSerializer,
    FamilyHistoryCreateSerializer,
    FamilyHistorySerializer,
    ICD10CodeSerializer,
    MedicationSerializer,
    PastSurgeryCreateSerializer,
    PastSurgerySerializer,
    SocialHistoryObservationCreateSerializer,
    SocialHistoryObservationSerializer,
    TreatmentPlanSerializer,
    TreatmentPlanTemplateSerializer,
    VitalFlagSuggestionAcceptSerializer,
    VitalFlagSuggestionAcknowledgeSerializer,
    VitalFlagSuggestionMapSerializer,
    VitalFlagSuggestionRejectSerializer,
    VitalFlagSuggestionSerializer,
)


class TreatmentPlanView(APIView):
    """
    View for Treatment Plan operations.

    Supports GET, POST, PUT, PATCH for single treatment plan per encounter.

    Endpoints:
    - GET /api/encounters/{encounter_id}/treatment-plan/ - Get treatment plan
    - POST /api/encounters/{encounter_id}/treatment-plan/ - Create treatment plan
    - PUT/PATCH /api/encounters/{encounter_id}/treatment-plan/ - Update treatment plan
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_encounter(self, encounter_pk):
        """Get encounter or return 404."""
        try:
            return resolve_encounter_lookup(encounter_pk)
        except Encounter.DoesNotExist:
            return None

    @extend_schema(
        responses={200: TreatmentPlanSerializer},
    )
    def get(self, request, encounter_pk):
        """Get treatment plan for encounter."""
        encounter = self._get_encounter(encounter_pk)
        if not encounter:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            plan = TreatmentPlan.objects.get(encounter=encounter)
            serializer = TreatmentPlanSerializer(plan)
            return Response(serializer.data)
        except TreatmentPlan.DoesNotExist:
            return Response(
                {"detail": "Treatment plan not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @extend_schema(
        request=TreatmentPlanSerializer,
        responses={201: TreatmentPlanSerializer},
    )
    def post(self, request, encounter_pk):
        """Create treatment plan for encounter."""
        encounter = self._get_encounter(encounter_pk)
        if not encounter:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if plan already exists
        if TreatmentPlan.objects.filter(encounter=encounter).exists():
            return Response(
                {"detail": "Treatment plan already exists for this encounter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data.copy()
        data["encounter"] = encounter.id

        serializer = TreatmentPlanSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        AuditLog.log(
            action="treatment_plan_create",
            user=request.user,
            resource_type="TreatmentPlan",
            resource_id=serializer.data.get("id"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=TreatmentPlanSerializer,
        responses={200: TreatmentPlanSerializer},
    )
    def patch(self, request, encounter_pk):
        """Partially update treatment plan."""
        encounter = self._get_encounter(encounter_pk)
        if not encounter:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            plan = TreatmentPlan.objects.get(encounter=encounter)
        except TreatmentPlan.DoesNotExist:
            return Response(
                {"detail": "Treatment plan not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = TreatmentPlanSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        AuditLog.log(
            action="treatment_plan_update",
            user=request.user,
            resource_type="TreatmentPlan",
            resource_id=plan.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
        )

        return Response(serializer.data)

    @extend_schema(
        request=TreatmentPlanSerializer,
        responses={200: TreatmentPlanSerializer},
    )
    def put(self, request, encounter_pk):
        """Full update of treatment plan."""
        return self.patch(request, encounter_pk)


class ApplyTemplateView(APIView):
    """
    Apply a treatment plan template to an encounter.

    Endpoint:
    - POST /api/encounters/{encounter_id}/treatment-plan/apply-template/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        request=inline_serializer(
            name="ApplyTemplateRequest",
            fields={
                "template_id": serializers.IntegerField(),
            },
        ),
        responses={200: TreatmentPlanSerializer},
    )
    def post(self, request, encounter_pk):
        """Apply template to treatment plan."""
        # Get encounter
        try:
            encounter = resolve_encounter_lookup(encounter_pk)
        except Encounter.DoesNotExist:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get template ID from request
        template_id = request.data.get("template_id")
        if not template_id:
            return Response(
                {"detail": "template_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get template
        try:
            template = TreatmentPlanTemplate.objects.get(pk=template_id, is_active=True)
        except TreatmentPlanTemplate.DoesNotExist:
            return Response(
                {"detail": "Template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get or create treatment plan
        plan, created = TreatmentPlan.objects.get_or_create(
            encounter=encounter,
            defaults={"created_by": request.user},
        )

        # Apply template
        plan.apply_template(template)

        # Audit log
        AuditLog.log(
            action="treatment_plan_apply_template",
            user=request.user,
            resource_type="TreatmentPlan",
            resource_id=plan.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
            details={"template_id": template_id, "template_name": template.name},
        )

        serializer = TreatmentPlanSerializer(plan)
        return Response(serializer.data, status=status.HTTP_200_OK)
