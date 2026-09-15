# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Encounters views clinical history for Vitora HMIS.

What this file is for:
- Implement views clinical history logic for the encounters domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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


class MedicationViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for Medication model.

    Provides CRUD operations for treatment plan medications.

    Endpoints:
    - GET /api/encounters/{encounter_id}/treatment-plan/medications/ - List
    - POST /api/encounters/{encounter_id}/treatment-plan/medications/ - Create
    - GET /api/encounters/{encounter_id}/treatment-plan/medications/{id}/ - Retrieve
    - PUT /api/encounters/{encounter_id}/treatment-plan/medications/{id}/ - Update
    - DELETE /api/encounters/{encounter_id}/treatment-plan/medications/{id}/ - Delete
    """

    serializer_class = MedicationSerializer
    queryset = Medication.objects.all()
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    tenant_facility_chain = "treatment_plan__encounter__facility"
    tenant_org_chain = "treatment_plan__encounter__organization"

    def _get_treatment_plan(self, encounter_pk):
        """Get treatment plan for encounter."""
        try:
            encounter = resolve_encounter_lookup(encounter_pk)
            return TreatmentPlan.objects.get(encounter=encounter)
        except (Encounter.DoesNotExist, TreatmentPlan.DoesNotExist):
            return None

    def get_queryset(self):
        """Filter medications by treatment plan and tenant."""
        qs = super().get_queryset()
        encounter_pk = self.kwargs.get("encounter_pk")
        plan = self._get_treatment_plan(encounter_pk)
        if plan:
            return qs.filter(treatment_plan=plan)
        return Medication.objects.none()

    def create(self, request, *args, **kwargs):
        """Create medication with treatment plan from URL."""
        encounter_pk = self.kwargs.get("encounter_pk")
        plan = self._get_treatment_plan(encounter_pk)

        if not plan:
            return Response(
                {"detail": "Treatment plan not found for this encounter."},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data.copy()
        data["treatment_plan"] = plan.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Audit log
        AuditLog.log(
            action="medication_create",
            user=request.user,
            resource_type="Medication",
            resource_id=serializer.data.get("id"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=plan.encounter.patient_id,
            details={"medication_name": serializer.data.get("name")},
        )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class SNOMEDSearchView(APIView):
    """
    Search SNOMED CT concepts.

    Uses SNOMED International Snowstorm API with local cache fallback.

    Query Parameters:
        q: Search term (required, min 2 chars)
        semantic_tag: Filter by semantic tag (e.g., 'disorder', 'finding', 'procedure')
        limit: Max results (default 20, max 50)
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            inline_serializer(
                "SNOMEDSearchParams",
                fields={
                    "q": serializers.CharField(help_text="Search term"),
                    "semantic_tag": serializers.CharField(
                        required=False, help_text="Filter by semantic tag"
                    ),
                    "limit": serializers.IntegerField(
                        required=False, help_text="Max results (default 20)"
                    ),
                },
            )
        ],
        responses={
            200: inline_serializer(
                "SNOMEDSearchResponse",
                fields={
                    "results": serializers.ListField(),
                    "count": serializers.IntegerField(),
                },
            )
        },
    )
    def get(self, request):
        """Search SNOMED CT concepts by term."""
        from hmis.apps.core.services.snomed_service import SNOMEDService

        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response(
                {"detail": "Search term must be at least 2 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        semantic_tag = request.query_params.get("semantic_tag", "")
        try:
            limit = min(int(request.query_params.get("limit", 20)), 50)
        except (ValueError, TypeError):
            limit = 20

        service = SNOMEDService()
        results = service.search(query=query, semantic_tag=semantic_tag, limit=limit)

        return Response(
            {
                "results": [
                    {
                        "concept_id": r.concept_id,
                        "display": r.display,
                        "semantic_tag": r.semantic_tag,
                    }
                    for r in results
                ],
                "count": len(results),
            }
        )


class SocialHistoryObservationViewSet(
    ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet
):
    """
    ViewSet for SocialHistoryObservation.

    Provides CRUD for structured social-history observations scoped by patient.

    Endpoints:
    - GET  /api/patients/{patient_id}/social-history/        List observations
    - POST /api/patients/{patient_id}/social-history/        Create observation
    - GET  /api/patients/{patient_id}/social-history/{id}/   Retrieve
    - PATCH /api/patients/{patient_id}/social-history/{id}/  Update
    - DELETE /api/patients/{patient_id}/social-history/{id}/ Delete
    """

    queryset = SocialHistoryObservation.objects.select_related(
        "patient", "encounter", "recorded_by"
    )
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["observation_type", "status"]
    ordering_fields = ["effective_date", "created_at"]
    ordering = ["-effective_date", "-created_at"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SocialHistoryObservationCreateSerializer
        return SocialHistoryObservationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        return qs

    def perform_create(self, serializer):
        patient_pk = self.kwargs.get("patient_pk")
        instance = serializer.save(
            patient_id=patient_pk,
            recorded_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="social_history_create",
            user=self.request.user,
            resource_type="SocialHistoryObservation",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_pk,
            details={"observation_type": instance.observation_type, "status": instance.status},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="social_history_update",
            user=self.request.user,
            resource_type="SocialHistoryObservation",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={"observation_type": instance.observation_type, "status": instance.status},
        )

    def perform_destroy(self, instance):
        obs_id = instance.pk
        patient_id = instance.patient_id
        obs_type = instance.observation_type
        super().perform_destroy(instance)
        AuditLog.log(
            action="social_history_delete",
            user=self.request.user,
            resource_type="SocialHistoryObservation",
            resource_id=obs_id,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_id,
            details={"observation_type": obs_type},
        )


class ChronicConditionViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for structured chronic conditions scoped by patient."""

    queryset = ChronicCondition.objects.select_related("patient", "encounter", "recorded_by")
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["onset_date", "created_at"]
    ordering = ["-created_at"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ChronicConditionCreateSerializer
        return ChronicConditionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        return qs

    def perform_create(self, serializer):
        patient_pk = self.kwargs.get("patient_pk")
        instance = serializer.save(
            patient_id=patient_pk,
            recorded_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="chronic_condition_create",
            user=self.request.user,
            resource_type="ChronicCondition",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_pk,
            details={"condition_name": instance.condition_name, "status": instance.status},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="chronic_condition_update",
            user=self.request.user,
            resource_type="ChronicCondition",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={"condition_name": instance.condition_name, "status": instance.status},
        )

    def perform_destroy(self, instance):
        pk, patient_id, name = instance.pk, instance.patient_id, instance.condition_name
        super().perform_destroy(instance)
        AuditLog.log(
            action="chronic_condition_delete",
            user=self.request.user,
            resource_type="ChronicCondition",
            resource_id=pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_id,
            details={"condition_name": name},
        )


class VitalFlagSuggestionViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Review and resolve vitals-derived clinical flag suggestions for a patient."""

    queryset = VitalFlagSuggestion.objects.select_related(
        "patient",
        "encounter",
        "triage_assessment",
        "suggested_icd10",
        "selected_icd10",
        "resolved_by",
        "linked_diagnosis",
        "linked_chronic_condition",
    ).prefetch_related("actions")
    serializer_class = VitalFlagSuggestionSerializer
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "severity", "flag_key", "mapping_status", "source_type"]
    ordering_fields = ["detected_at", "created_at", "resolved_at"]
    ordering = ["-detected_at"]
    tenant_scope = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        return qs

    def get_serializer_class(self):
        if self.action == "acknowledge":
            return VitalFlagSuggestionAcknowledgeSerializer
        if self.action == "map_codes":
            return VitalFlagSuggestionMapSerializer
        if self.action == "accept":
            return VitalFlagSuggestionAcceptSerializer
        if self.action == "reject":
            return VitalFlagSuggestionRejectSerializer
        return VitalFlagSuggestionSerializer

    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, patient_pk=None, pk=None):
        suggestion = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if suggestion.status not in (
            VitalFlagSuggestion.Status.NEW,
            VitalFlagSuggestion.Status.MAPPED,
        ):
            return Response(
                {"detail": f"Cannot acknowledge suggestion in status {suggestion.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_status = suggestion.status
        suggestion.status = VitalFlagSuggestion.Status.ACKNOWLEDGED
        suggestion.acknowledged_at = timezone.now()
        suggestion.save(update_fields=["status", "acknowledged_at", "updated_at"])

        note = serializer.validated_data.get("note", "")
        self._append_action(
            suggestion=suggestion,
            action_type=VitalFlagSuggestionAction.ActionType.ACKNOWLEDGED,
            from_status=from_status,
            to_status=suggestion.status,
            actor=request.user,
            payload={"note": note},
        )

        self._audit(
            request=request,
            action="vital_flag_suggestion_acknowledge",
            suggestion=suggestion,
            details={"note": note, "from_status": from_status, "to_status": suggestion.status},
        )
        return Response(
            VitalFlagSuggestionSerializer(suggestion, context={"request": request}).data
        )

    @action(detail=True, methods=["post"], url_path="map-codes")
    def map_codes(self, request, patient_pk=None, pk=None):
        suggestion = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from_status = suggestion.status
        suggestion.selected_icd10 = serializer.validated_data.get("selected_icd10")
        suggestion.selected_icd11_code = serializer.validated_data.get("selected_icd11_code", "")
        suggestion.selected_icd11_title = serializer.validated_data.get("selected_icd11_title", "")
        suggestion.mapping_status = VitalFlagSuggestion.MappingStatus.CONFIRMED
        if suggestion.status in (
            VitalFlagSuggestion.Status.NEW,
            VitalFlagSuggestion.Status.ACKNOWLEDGED,
        ):
            suggestion.status = VitalFlagSuggestion.Status.MAPPED
        suggestion.save(
            update_fields=[
                "selected_icd10",
                "selected_icd11_code",
                "selected_icd11_title",
                "mapping_status",
                "status",
                "updated_at",
            ]
        )

        self._append_action(
            suggestion=suggestion,
            action_type=VitalFlagSuggestionAction.ActionType.MAPPING_UPDATED,
            from_status=from_status,
            to_status=suggestion.status,
            actor=request.user,
            payload={
                "selected_icd10": (
                    suggestion.selected_icd10.code if suggestion.selected_icd10 else ""
                ),
                "selected_icd11_code": suggestion.selected_icd11_code,
            },
        )
        self._audit(
            request=request,
            action="vital_flag_suggestion_map_codes",
            suggestion=suggestion,
            details={"from_status": from_status, "to_status": suggestion.status},
        )
        return Response(
            VitalFlagSuggestionSerializer(suggestion, context={"request": request}).data
        )

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, patient_pk=None, pk=None):
        suggestion = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        from_status = suggestion.status

        selected_icd10 = data.get("selected_icd10")
        selected_icd11_code = data.get("selected_icd11_code", "")
        selected_icd11_title = data.get("selected_icd11_title", "")
        if selected_icd10 is not None or selected_icd11_code or selected_icd11_title:
            suggestion.selected_icd10 = selected_icd10
            suggestion.selected_icd11_code = selected_icd11_code
            suggestion.selected_icd11_title = selected_icd11_title
            suggestion.mapping_status = VitalFlagSuggestion.MappingStatus.CONFIRMED

        resolution_action = data["resolution_action"]
        note = data.get("note", "")

        created_diagnosis = None
        created_condition = None
        if resolution_action in {
            VitalFlagSuggestion.ResolutionAction.CREATE_DIAGNOSIS_PROVISIONAL,
            VitalFlagSuggestion.ResolutionAction.CREATE_DIAGNOSIS_CONFIRMED,
        }:
            if suggestion.encounter_id is None:
                return Response(
                    {"detail": "Diagnosis creation requires a linked encounter."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            created_diagnosis = Diagnosis.objects.create(
                encounter=suggestion.encounter,
                icd10_code=suggestion.selected_icd10,
                icd11_code=suggestion.selected_icd11_code,
                icd11_display=suggestion.selected_icd11_title,
                diagnosis_type=data.get("diagnosis_type", "WORKING"),
                notes=note,
                is_confirmed=(
                    resolution_action
                    == VitalFlagSuggestion.ResolutionAction.CREATE_DIAGNOSIS_CONFIRMED
                ),
                certainty=data.get(
                    "certainty",
                    (
                        "confirmed"
                        if resolution_action
                        == VitalFlagSuggestion.ResolutionAction.CREATE_DIAGNOSIS_CONFIRMED
                        else "provisional"
                    ),
                ),
                diagnosed_by=request.user,
            )
            suggestion.linked_diagnosis = created_diagnosis

        elif resolution_action == VitalFlagSuggestion.ResolutionAction.ADD_CHRONIC_CONDITION:
            condition_name = (
                data.get("condition_name", "").strip()
                or suggestion.flag_key.replace("_", " ").title()
            )
            icd10_code = suggestion.selected_icd10.code if suggestion.selected_icd10 else ""
            created_condition = ChronicCondition.objects.create(
                patient=suggestion.patient,
                encounter=suggestion.encounter,
                condition_name=condition_name,
                icd10_code=icd10_code,
                status=data.get("chronic_status", ChronicCondition.ConditionStatus.ACTIVE),
                notes=note,
                recorded_by=request.user,
                **self.get_tenant_save_kwargs(),
            )
            suggestion.linked_chronic_condition = created_condition

        suggestion.status = VitalFlagSuggestion.Status.ACCEPTED
        suggestion.resolution_action = resolution_action
        suggestion.resolution_note = note
        suggestion.resolved_by = request.user
        suggestion.resolved_at = timezone.now()
        suggestion.save(
            update_fields=[
                "selected_icd10",
                "selected_icd11_code",
                "selected_icd11_title",
                "mapping_status",
                "linked_diagnosis",
                "linked_chronic_condition",
                "status",
                "resolution_action",
                "resolution_note",
                "resolved_by",
                "resolved_at",
                "updated_at",
            ]
        )

        self._append_action(
            suggestion=suggestion,
            action_type=VitalFlagSuggestionAction.ActionType.ACCEPTED,
            from_status=from_status,
            to_status=suggestion.status,
            actor=request.user,
            payload={
                "resolution_action": resolution_action,
                "diagnosis_id": created_diagnosis.id if created_diagnosis else None,
                "chronic_condition_id": created_condition.id if created_condition else None,
            },
        )
        self._audit(
            request=request,
            action="vital_flag_suggestion_accept",
            suggestion=suggestion,
            details={
                "from_status": from_status,
                "to_status": suggestion.status,
                "resolution_action": resolution_action,
                "diagnosis_id": created_diagnosis.id if created_diagnosis else None,
                "chronic_condition_id": created_condition.id if created_condition else None,
            },
        )
        return Response(
            VitalFlagSuggestionSerializer(suggestion, context={"request": request}).data
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, patient_pk=None, pk=None):
        suggestion = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from_status = suggestion.status
        reason = serializer.validated_data["reason"]

        suggestion.status = VitalFlagSuggestion.Status.REJECTED
        suggestion.resolution_action = VitalFlagSuggestion.ResolutionAction.NO_ACTION
        suggestion.resolution_note = reason
        suggestion.resolved_by = request.user
        suggestion.resolved_at = timezone.now()
        suggestion.save(
            update_fields=[
                "status",
                "resolution_action",
                "resolution_note",
                "resolved_by",
                "resolved_at",
                "updated_at",
            ]
        )

        self._append_action(
            suggestion=suggestion,
            action_type=VitalFlagSuggestionAction.ActionType.REJECTED,
            from_status=from_status,
            to_status=suggestion.status,
            actor=request.user,
            payload={"reason": reason},
        )
        self._audit(
            request=request,
            action="vital_flag_suggestion_reject",
            suggestion=suggestion,
            details={"from_status": from_status, "to_status": suggestion.status, "reason": reason},
        )
        return Response(
            VitalFlagSuggestionSerializer(suggestion, context={"request": request}).data
        )

    def _append_action(self, *, suggestion, action_type, from_status, to_status, actor, payload):
        VitalFlagSuggestionAction.objects.create(
            suggestion=suggestion,
            action_type=action_type,
            from_status=from_status,
            to_status=to_status,
            actor=actor,
            payload_json=payload,
        )

    def _audit(self, *, request, action: str, suggestion, details: dict):
        AuditLog.log(
            action=action,
            user=request.user,
            resource_type="VitalFlagSuggestion",
            resource_id=suggestion.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=suggestion.patient_id,
            details=details,
        )


class CurrentMedicationViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for structured current medication statements scoped by patient."""

    queryset = CurrentMedication.objects.select_related(
        "patient", "encounter", "recorded_by", "drug"
    )
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["start_date", "created_at"]
    ordering = ["-created_at"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return CurrentMedicationCreateSerializer
        return CurrentMedicationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        return qs

    def perform_create(self, serializer):
        patient_pk = self.kwargs.get("patient_pk")
        instance = serializer.save(
            patient_id=patient_pk,
            recorded_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="current_medication_create",
            user=self.request.user,
            resource_type="CurrentMedication",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_pk,
            details={"medication_name": instance.medication_name, "status": instance.status},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="current_medication_update",
            user=self.request.user,
            resource_type="CurrentMedication",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={"medication_name": instance.medication_name, "status": instance.status},
        )

    def perform_destroy(self, instance):
        pk, patient_id, name = instance.pk, instance.patient_id, instance.medication_name
        super().perform_destroy(instance)
        AuditLog.log(
            action="current_medication_delete",
            user=self.request.user,
            resource_type="CurrentMedication",
            resource_id=pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_id,
            details={"medication_name": name},
        )


class PastSurgeryViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for structured past surgeries/procedures scoped by patient."""

    queryset = PastSurgery.objects.select_related("patient", "encounter", "recorded_by")
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["outcome"]
    ordering_fields = ["procedure_date", "created_at"]
    ordering = ["-procedure_date", "-created_at"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PastSurgeryCreateSerializer
        return PastSurgerySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        return qs

    def perform_create(self, serializer):
        patient_pk = self.kwargs.get("patient_pk")
        instance = serializer.save(
            patient_id=patient_pk,
            recorded_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="past_surgery_create",
            user=self.request.user,
            resource_type="PastSurgery",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_pk,
            details={"procedure_name": instance.procedure_name},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="past_surgery_update",
            user=self.request.user,
            resource_type="PastSurgery",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={"procedure_name": instance.procedure_name},
        )

    def perform_destroy(self, instance):
        pk, patient_id, name = instance.pk, instance.patient_id, instance.procedure_name
        super().perform_destroy(instance)
        AuditLog.log(
            action="past_surgery_delete",
            user=self.request.user,
            resource_type="PastSurgery",
            resource_id=pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_id,
            details={"procedure_name": name},
        )


class FamilyHistoryViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for structured family history scoped by patient."""

    queryset = FamilyHistory.objects.select_related("patient", "encounter", "recorded_by")
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["relationship"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return FamilyHistoryCreateSerializer
        return FamilyHistorySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        return qs

    def perform_create(self, serializer):
        patient_pk = self.kwargs.get("patient_pk")
        instance = serializer.save(
            patient_id=patient_pk,
            recorded_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="family_history_create",
            user=self.request.user,
            resource_type="FamilyHistory",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_pk,
            details={"relationship": instance.relationship, "condition": instance.condition_name},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="family_history_update",
            user=self.request.user,
            resource_type="FamilyHistory",
            resource_id=instance.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={"relationship": instance.relationship, "condition": instance.condition_name},
        )

    def perform_destroy(self, instance):
        pk, patient_id = instance.pk, instance.patient_id
        relationship, condition = instance.relationship, instance.condition_name
        super().perform_destroy(instance)
        AuditLog.log(
            action="family_history_delete",
            user=self.request.user,
            resource_type="FamilyHistory",
            resource_id=pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient_id,
            details={"relationship": relationship, "condition": condition},
        )
