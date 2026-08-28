# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Laboratory views queue reports for Vitora HMIS.

What this file is for:
- Implement views queue reports logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.core.pagination import StandardPagination
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission
from hmis.apps.core.utils import resolve_model_pk_or_public_id
from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.views_catalog_orders import _parse_date_range

from .models import LabOrder, LabResult, LabResultAttachment, LOINCCode
from .reports import LabReportService
from .serializers import (
    LabOrderSerializer,
    LabResultAttachmentSerializer,
    LabResultSerializer,
    LOINCCodeSerializer,
)

logger = logging.getLogger(__name__)


class LabAttachmentViewSet(NestedTenantScopeMixin, viewsets.GenericViewSet):
    """Delete lab attachments."""

    queryset = LabResultAttachment.objects.all().select_related("lab_order", "uploaded_by")
    serializer_class = LabResultAttachmentSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_facility_chain = "lab_order__facility"
    tenant_org_chain = "lab_order__organization"

    @extend_schema(responses={204: None})
    def destroy(self, request, pk=None):
        if not request.user.has_perm("laboratory.delete_labresultattachment"):
            return Response(
                {"detail": "You do not have permission to delete this attachment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance = self.get_object()

        if instance.file:
            instance.file.delete(save=False)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientLabOrderViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing lab orders by patient.
    Used for nested route: /api/patients/{id}/lab-orders/
    """

    queryset = LabOrder.objects.all()
    serializer_class = LabOrderSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_facility_chain = "facility"
    tenant_org_chain = "organization"

    def get_queryset(self):
        patient_pk = self.kwargs.get("patient_pk")
        return (
            super()
            .get_queryset()
            .filter(patient_id=patient_pk)
            .select_related("patient", "encounter", "ordered_by")
        )


class EncounterLabOrderViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing lab orders by encounter.
    Used for nested route: /api/encounters/{id}/lab-orders/
    """

    queryset = LabOrder.objects.all()
    serializer_class = LabOrderSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_facility_chain = "facility"
    tenant_org_chain = "organization"

    def get_queryset(self):
        encounter_pk = self.kwargs.get("encounter_pk")
        try:
            encounter_id = resolve_model_pk_or_public_id(Encounter, encounter_pk)[0].id
        except Encounter.DoesNotExist:
            return super().get_queryset().none()
        return (
            super()
            .get_queryset()
            .filter(encounter_id=encounter_id)
            .select_related("patient", "encounter", "ordered_by")
        )


class PatientLabResultViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing lab results by patient.
    Used for nested route: /api/patients/{id}/lab-results/
    """

    queryset = LabResult.objects.all()
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_facility_chain = "order_item__lab_order__facility"
    tenant_org_chain = "order_item__lab_order__organization"

    def get_queryset(self):
        patient_pk = self.kwargs.get("patient_pk")
        return (
            super()
            .get_queryset()
            .filter(order_item__lab_order__patient_id=patient_pk)
            .select_related("order_item__test", "entered_by")
        )


class LOINCCodeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for LOINC codes."""

    queryset = LOINCCode.objects.all()
    serializer_class = LOINCCodeSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]


class LOINCSearchView(APIView):
    """
    Search LOINC terminology using LOINCTerminologyService.

    Queries local cache first, then falls back to external LOINC FHIR server
    if credentials are configured. Used by lab ordering UI for code selection.

    GET /api/laboratory/loinc-search/?q=<term>&limit=<n>
    GET /api/laboratory/loinc-search/?code=<code>  (validate/lookup single code)
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]
    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}

    @extend_schema(
        summary="Search LOINC terminology codes",
        description="Search LOINC codes by term or validate a specific code.",
    )
    def get(self, request):
        from .services.loinc_service import LOINCTerminologyService

        service = LOINCTerminologyService()

        # Single code lookup/validation
        code = request.query_params.get("code")
        if code:
            result = service.lookup(code)
            if result:
                return Response({"valid": True, "result": result})
            return Response({"valid": False, "result": None})

        # Search by term
        term = request.query_params.get("q", "").strip()
        if len(term) < 2:
            return Response(
                {"detail": "Query 'q' must be at least 2 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        limit = min(int(request.query_params.get("limit", 20)), 50)
        results = service.search(term, limit=limit)

        return Response(
            {
                "count": len(results),
                "external_available": service.is_external_available,
                "results": results,
            }
        )


# ============================================================================
# Lab Queue ViewSet
# ============================================================================


class LabQueueViewSet(AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for lab queue management.

    Provides queue listing, filtering, and workflow actions:
    - collect: Record sample collection
    - assign: Assign to technician
    - start-processing: Begin processing
    - submit-review: Submit for review
    - release: Release results
    - reject: Reject sample with reason
    - notes: Add/update technician notes
    - stats: Get queue statistics
    - lookup: Find by barcode
    - technicians: List available technicians
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    audit_resource_type = "LabQueue"
    audit_action_prefix = "laboratory.queue"
    audit_source = "laboratory_api"
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["queue_status", "priority", "assigned_technician"]
    lookup_field = "queue_number"
    pagination_class = StandardPagination
    tenant_facility_chain = "lab_order__facility"
    tenant_org_chain = "lab_order__organization"

    def get_queryset(self):
        from .models import LabQueue

        return LabQueue.objects.select_related(
            "lab_order__patient",
            "lab_order__ordered_by",
            "assigned_technician",
            "collected_by",
            "reviewed_by",
            "specimen",
            "specimen__collected_by",
            "specimen__received_by",
        ).prefetch_related("lab_order__items__test")

    def get_serializer_class(self):
        from .serializers import (
            LabQueueAssignSerializer,
            LabQueueCollectSerializer,
            LabQueueNotesSerializer,
            LabQueueRejectSerializer,
            LabQueueSerializer,
        )

        if self.action == "collect":
            return LabQueueCollectSerializer
        if self.action == "assign":
            return LabQueueAssignSerializer
        if self.action == "reject":
            return LabQueueRejectSerializer
        if self.action == "notes":
            return LabQueueNotesSerializer
        return LabQueueSerializer

    @action(detail=True, methods=["post"])
    def collect(self, request, queue_number=None):
        """Record sample collection."""
        from .serializers import LabQueueCollectSerializer, LabQueueSerializer

        queue_entry = self.get_object()
        serializer = LabQueueCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        barcode = serializer.validated_data.get("barcode", "")
        queue_entry.collect_sample(request.user, sample_id=barcode, barcode=barcode)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, queue_number=None):
        """Assign to technician."""
        from django.contrib.auth import get_user_model

        from .serializers import LabQueueAssignSerializer, LabQueueSerializer

        User = get_user_model()
        queue_entry = self.get_object()
        serializer = LabQueueAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        technician_id = serializer.validated_data.get("technician_id")

        if technician_id is None:
            # Unassign
            queue_entry.assigned_technician = None
            queue_entry.save(update_fields=["assigned_technician"])
        else:
            try:
                technician = User.objects.get(pk=technician_id)
            except User.DoesNotExist:
                return Response(
                    {"error": "Technician not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            queue_entry.assign_to(technician)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"], url_path="start-processing")
    def start_processing(self, request, queue_number=None):
        """Start processing sample."""
        from .serializers import LabQueueSerializer

        queue_entry = self.get_object()
        queue_entry.start_processing()

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"], url_path="submit-review")
    def submit_review(self, request, queue_number=None):
        """Submit results for review."""
        from .serializers import LabQueueSerializer

        queue_entry = self.get_object()
        queue_entry.submit_for_review()

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def release(self, request, queue_number=None):
        """Release results."""
        from .serializers import LabQueueSerializer

        queue_entry = self.get_object()
        queue_entry.release_results(request.user)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, queue_number=None):
        """Reject sample with reason."""
        from .serializers import LabQueueRejectSerializer, LabQueueSerializer

        queue_entry = self.get_object()

        # Cannot reject released samples
        if queue_entry.queue_status == "RELEASED":
            return Response(
                {"error": "Cannot reject released samples"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LabQueueRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data["reason"]
        queue_entry.reject_sample(reason)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def notes(self, request, queue_number=None):
        """Add or update technician notes."""
        from .serializers import LabQueueNotesSerializer, LabQueueSerializer

        queue_entry = self.get_object()
        serializer = LabQueueNotesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data["notes"]
        append = serializer.validated_data.get("append", False)

        if append and queue_entry.technician_notes:
            queue_entry.technician_notes = f"{queue_entry.technician_notes}\n{notes}"
        else:
            queue_entry.technician_notes = notes

        queue_entry.save(update_fields=["technician_notes"])

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Get queue statistics."""
        from django.db.models import Count

        from .models import LabQueue

        stats = LabQueue.objects.values("queue_status").annotate(count=Count("id"))

        result = {
            "pending": 0,
            "collected": 0,
            "processing": 0,
            "review": 0,
            "released": 0,
        }

        status_map = {
            "PENDING": "pending",
            "COLLECTED": "collected",
            "PROCESSING": "processing",
            "REVIEW": "review",
            "RELEASED": "released",
        }

        for stat in stats:
            key = status_map.get(stat["queue_status"])
            if key:
                result[key] = stat["count"]

        return Response(result)

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """Find queue entry by barcode (specimen barcode, sample_id, or queue_number)."""
        from .models import LabQueue
        from .serializers import LabQueueSerializer

        barcode = request.query_params.get("barcode")

        if not barcode:
            return Response(
                {"error": "barcode parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try to find by queue_number first, then by sample_id
        queue_entry = LabQueue.objects.filter(queue_number=barcode).first()

        if not queue_entry:
            queue_entry = LabQueue.objects.filter(specimen__barcode=barcode).first()

        if not queue_entry:
            queue_entry = LabQueue.objects.filter(sample_id=barcode).first()

        if not queue_entry:
            return Response(
                {"error": "Queue entry not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=False, methods=["get"])
    def technicians(self, request):
        """List available lab technicians."""
        from django.contrib.auth import get_user_model

        from .serializers import TechnicianSerializer

        User = get_user_model()
        # Get all active users (in production, filter by role/group)
        users = User.objects.filter(is_active=True)

        return Response(TechnicianSerializer(users, many=True).data)


class LabTurnaroundTimeReportView(APIView):
    """Report turnaround time metrics for lab operations."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="TurnaroundTimeReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "overall": drf_serializers.DictField(),
                    "by_test": drf_serializers.ListField(),
                    "by_priority": drf_serializers.ListField(),
                    "queue_tat": drf_serializers.DictField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.turnaround_time_report(start_date, end_date)
        return Response(data)


class LabWorkloadReportView(APIView):
    """Report lab workload metrics."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="WorkloadReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "totals": drf_serializers.DictField(),
                    "by_day": drf_serializers.ListField(),
                    "by_technician": drf_serializers.ListField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.workload_report(start_date, end_date)
        return Response(data)


class LabCriticalValuesReportView(APIView):
    """Report critical values metrics."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="CriticalValuesReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "total_critical": drf_serializers.IntegerField(),
                    "by_test": drf_serializers.ListField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.critical_values_report(start_date, end_date)
        return Response(data)


class LabSampleRejectionReportView(APIView):
    """Report sample rejection metrics."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SampleRejectionReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "total_orders": drf_serializers.IntegerField(),
                    "rejected_orders": drf_serializers.IntegerField(),
                    "rejection_rate": drf_serializers.FloatField(),
                    "reasons": drf_serializers.ListField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.sample_rejection_report(start_date, end_date)
        return Response(data)


# ============================================================================
# Phase L3 — Analyzer Integration Support
# ============================================================================
