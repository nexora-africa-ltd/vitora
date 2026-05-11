"""
Views for the sick_notes module.

Provides a ViewSet for CRUD operations on SickNote with:
- List (filterable by status, patient, encounter, date range)
- Detail
- Create
- Issue (DRAFT → ISSUED)
- Revoke (ISSUED → REVOKED)
- Cancel (DRAFT → CANCELLED)
- Stats
"""

import django_filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.sick_notes.models import SickNote
from hmis.apps.sick_notes.serializers import (
    SickNoteCreateSerializer,
    SickNoteIssueSerializer,
    SickNoteListSerializer,
    SickNoteRevokeSerializer,
    SickNoteSerializer,
)


class SickNoteFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    patient = django_filters.NumberFilter(field_name="patient_id")
    encounter = django_filters.NumberFilter(field_name="encounter_id")
    issued_by = django_filters.NumberFilter(field_name="issued_by_id")
    leave_start_after = django_filters.DateFilter(field_name="leave_start_date", lookup_expr="gte")
    leave_start_before = django_filters.DateFilter(field_name="leave_start_date", lookup_expr="lte")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = SickNote
        fields = ["status", "patient", "encounter", "issued_by"]

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            models.Q(note_number__icontains=value)
            | models.Q(patient__first_name__icontains=value)
            | models.Q(patient__last_name__icontains=value)
            | models.Q(patient__mrn__icontains=value)
            | models.Q(diagnosis_text__icontains=value)
        )


# Need to import models for Q objects in the filter
from django.db import models  # noqa: E402


class SickNoteViewSet(ReadOnCreateMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """CRUD + workflow actions for sick notes."""

    queryset = SickNote.objects.select_related(
        "patient", "encounter", "issued_by", "revoked_by", "cancelled_by"
    )
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = SickNoteFilter
    ordering_fields = ["created_at", "leave_start_date", "note_number"]
    ordering = ["-created_at"]
    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    def get_serializer_class(self):
        if self.action == "create":
            return SickNoteCreateSerializer
        if self.action == "list":
            return SickNoteListSerializer
        if self.action == "issue":
            return SickNoteIssueSerializer
        if self.action == "revoke":
            return SickNoteRevokeSerializer
        return SickNoteSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="sick_note_create",
            user=self.request.user,
            resource_type="SickNote",
            resource_id=instance.pk,
            details={
                "note_number": instance.note_number,
                "patient_id": instance.patient_id,
                "encounter_id": instance.encounter_id,
            },
        )

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        """Issue a draft sick note (DRAFT → ISSUED)."""
        sick_note = self.get_object()
        if sick_note.status != SickNote.Status.DRAFT:
            return Response(
                {"error": "Only draft sick notes can be issued."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sick_note.issue(user=request.user)
        AuditLog.log(
            action="sick_note_issue",
            user=request.user,
            resource_type="SickNote",
            resource_id=sick_note.pk,
            details={"note_number": sick_note.note_number},
        )
        return Response(SickNoteSerializer(sick_note).data)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        """Revoke an issued sick note (ISSUED → REVOKED)."""
        sick_note = self.get_object()
        if sick_note.status != SickNote.Status.ISSUED:
            return Response(
                {"error": "Only issued sick notes can be revoked."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = SickNoteRevokeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sick_note.revoke(
            user=request.user,
            reason=serializer.validated_data["reason"],
        )
        AuditLog.log(
            action="sick_note_revoke",
            user=request.user,
            resource_type="SickNote",
            resource_id=sick_note.pk,
            details={
                "note_number": sick_note.note_number,
                "reason": serializer.validated_data["reason"],
            },
        )
        return Response(SickNoteSerializer(sick_note).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a draft sick note (DRAFT → CANCELLED)."""
        sick_note = self.get_object()
        if sick_note.status != SickNote.Status.DRAFT:
            return Response(
                {"error": "Only draft sick notes can be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sick_note.cancel(user=request.user)
        AuditLog.log(
            action="sick_note_cancel",
            user=request.user,
            resource_type="SickNote",
            resource_id=sick_note.pk,
            details={"note_number": sick_note.note_number},
        )
        return Response(SickNoteSerializer(sick_note).data)

    @action(detail=False, methods=["get"])
    def for_encounter(self, request):
        """List sick notes for a specific encounter."""
        encounter_id = request.query_params.get("encounter_id")
        if not encounter_id:
            return Response(
                {"error": "encounter_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = self.get_queryset().filter(encounter_id=encounter_id)
        serializer = SickNoteListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def for_patient(self, request):
        """List sick notes for a specific patient."""
        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = self.get_queryset().filter(patient_id=patient_id)
        serializer = SickNoteListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Return summary statistics for sick notes."""
        qs = self.get_queryset()
        return Response(
            {
                "total": qs.count(),
                "draft": qs.filter(status=SickNote.Status.DRAFT).count(),
                "issued": qs.filter(status=SickNote.Status.ISSUED).count(),
                "revoked": qs.filter(status=SickNote.Status.REVOKED).count(),
                "cancelled": qs.filter(status=SickNote.Status.CANCELLED).count(),
            }
        )
