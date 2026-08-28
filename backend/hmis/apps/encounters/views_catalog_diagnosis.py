# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Encounters views catalog diagnosis for Vitora HMIS.

What this file is for:
- Implement views catalog diagnosis logic for the encounters domain.

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


class ICD10CodeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for ICD-10 codes (read-only).

    Provides search and filtering for ICD-10 code lookup.

    Endpoints:
    - GET /api/icd10-codes/ - List/search ICD-10 codes
    - GET /api/icd10-codes/{id}/ - Retrieve an ICD-10 code
    """

    queryset = ICD10Code.objects.filter(is_active=True)
    serializer_class = ICD10CodeSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["chapter", "category"]
    search_fields = ["code", "description", "category"]
    ordering_fields = ["code", "description"]
    ordering = ["code"]


class TreatmentPlanTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Treatment Plan Templates.

    Provides CRUD operations and template suggestions by diagnosis.

    Endpoints:
    - GET /api/treatment-templates/ - List templates
    - POST /api/treatment-templates/ - Create template
    - GET /api/treatment-templates/{id}/ - Retrieve template
    - PUT /api/treatment-templates/{id}/ - Update template
    - DELETE /api/treatment-templates/{id}/ - Delete template
    - GET /api/treatment-templates/suggest/?diagnosis=<code> - Suggest by diagnosis
    """

    queryset = TreatmentPlanTemplate.objects.filter(is_active=True)
    serializer_class = TreatmentPlanTemplateSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["department", "is_active"]
    search_fields = ["name", "description", "department"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        """Filter templates, optionally including inactive ones."""
        queryset = TreatmentPlanTemplate.objects.all()
        # By default, only show active templates
        if not self.request.query_params.get("include_inactive"):
            queryset = queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        """Set created_by on creation."""
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def suggest(self, request):
        """
        Suggest templates based on diagnosis code.

        Query params:
        - diagnosis: ICD-10 code to match against template diagnosis_codes
        """
        diagnosis_code = request.query_params.get("diagnosis", "")
        if not diagnosis_code:
            return Response(
                {"detail": "diagnosis parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find templates linked to this diagnosis code
        templates = TreatmentPlanTemplate.objects.filter(
            is_active=True,
            diagnosis_codes__code__iexact=diagnosis_code,
        ).distinct()

        page = self.paginate_queryset(templates)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(templates, many=True)
        return Response({"results": serializer.data})


class DiagnosisViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for Diagnosis model.

    Provides CRUD operations for encounter diagnoses.

    Endpoints:
    - GET /api/encounters/{encounter_id}/diagnoses/ - List diagnoses
    - POST /api/encounters/{encounter_id}/diagnoses/ - Create diagnosis
    - GET /api/encounters/{encounter_id}/diagnoses/{id}/ - Retrieve
    - PUT /api/encounters/{encounter_id}/diagnoses/{id}/ - Update
    - DELETE /api/encounters/{encounter_id}/diagnoses/{id}/ - Delete
    """

    serializer_class = DiagnosisSerializer
    queryset = Diagnosis.objects.all()
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["diagnosis_type", "is_confirmed"]
    ordering_fields = ["diagnosis_type", "created_at"]
    ordering = ["created_at"]
    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    def get_queryset(self):
        """Filter diagnoses by encounter and tenant."""
        qs = super().get_queryset()
        encounter_lookup = self.kwargs.get("encounter_pk")
        try:
            encounter = resolve_encounter_lookup(encounter_lookup)
        except Encounter.DoesNotExist:
            return qs.none()
        return qs.filter(encounter_id=encounter.id).select_related("icd10_code")

    def get_serializer_context(self):
        """Add encounter to serializer context."""
        context = super().get_serializer_context()
        encounter_lookup = self.kwargs.get("encounter_pk")
        try:
            context["encounter_pk"] = resolve_encounter_lookup(encounter_lookup).id
        except Encounter.DoesNotExist:
            context["encounter_pk"] = encounter_lookup
        return context

    def create(self, request, *args, **kwargs):
        """Create diagnosis with encounter from URL."""
        encounter_pk = self.kwargs.get("encounter_pk")

        # Verify encounter exists
        try:
            encounter = resolve_encounter_lookup(encounter_pk)
        except Encounter.DoesNotExist:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Add encounter to data
        data = request.data.copy()
        data["encounter"] = encounter.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Audit log
        AuditLog.log(
            action="diagnosis_create",
            user=request.user,
            resource_type="Diagnosis",
            resource_id=serializer.data.get("id"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
            details={"diagnosis_type": serializer.data.get("diagnosis_type")},
        )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def destroy(self, request, *args, **kwargs):
        """Delete diagnosis with permission check and audit logging."""
        if not request.user.has_perm("encounters.delete_diagnosis"):
            return Response(
                {"detail": "You do not have permission to delete diagnoses."},
                status=status.HTTP_403_FORBIDDEN,
            )

        diagnosis = self.get_object()
        diagnosis_id = diagnosis.id
        patient_id = diagnosis.encounter.patient_id
        diagnosis_type = diagnosis.diagnosis_type

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == 204:
            AuditLog.log(
                action="diagnosis_delete",
                user=request.user,
                resource_type="Diagnosis",
                resource_id=diagnosis_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient_id,
                details={"diagnosis_type": diagnosis_type},
            )

        return response

    def update(self, request, *args, **kwargs):
        """Update diagnosis with audit logging."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # Add encounter to data if not provided
        data = request.data.copy()
        if "encounter" not in data:
            data["encounter"] = instance.encounter_id

        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Audit log
        AuditLog.log(
            action="diagnosis_update",
            user=request.user,
            resource_type="Diagnosis",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.encounter.patient_id,
            details={"diagnosis_type": serializer.data.get("diagnosis_type")},
        )

        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """Partial update diagnosis."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)
