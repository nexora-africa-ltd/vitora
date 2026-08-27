"""
What this file is for: inpatient medication/vitals viewsets (BP monitoring and MAR workflows).
How to use: imported by ``inpatient.views`` so existing router registrations keep working.
Supported inputs/args: DRF ViewSet request payloads defined by existing serializers/actions.
"""

# ruff: noqa: ARG002

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import BPMonitoringReading, MedicationAdministration
from ..serializers import (
    BPMonitoringReadingCreateSerializer,
    BPMonitoringReadingSerializer,
    MedicationAdministrationActionSerializer,
    MedicationAdministrationCreateSerializer,
    MedicationAdministrationSerializer,
)
from .observation_chart import _sync_bedside_vitals_to_ipd_encounter


class BPMonitoringViewSet(NestedTenantScopeMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """ViewSet for blood pressure monitoring readings."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission"]
    ordering_fields = ["recorded_at"]
    ordering = ["-recorded_at"]

    def get_queryset(self):
        return BPMonitoringReading.objects.select_related(
            "admission", "admission__patient", "recorded_by"
        )

    def get_serializer_class(self):
        if self.action == "create":
            return BPMonitoringReadingCreateSerializer
        return BPMonitoringReadingSerializer

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        _sync_bedside_vitals_to_ipd_encounter(
            instance.admission,
            vitals_payload={
                "blood_pressure": f"{instance.systolic}/{instance.diastolic}",
                "pulse": instance.pulse,
            },
        )
        AuditLog.log(
            action="bp_reading_create",
            user=self.request.user,
            resource_type="BPMonitoringReading",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "systolic": instance.systolic,
                "diastolic": instance.diastolic,
            },
            ip_address=get_client_ip(self.request),
        )


class MedicationAdministrationViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for Medication Administration Record (MAR) entries."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission", "status", "prescription_item"]
    ordering_fields = ["scheduled_time", "created_at"]
    ordering = ["-scheduled_time"]

    def get_queryset(self):
        return MedicationAdministration.objects.select_related(
            "admission",
            "admission__patient",
            "prescription_item",
            "prescription_item__drug",
            "administered_by",
        )

    def get_serializer_class(self):
        if self.action == "create":
            return MedicationAdministrationCreateSerializer
        if self.action == "record_administration":
            return MedicationAdministrationActionSerializer
        return MedicationAdministrationSerializer

    def create(self, request, *_args, **_kwargs):
        """Return the full read serializer after creating a MAR entry."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = MedicationAdministrationSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="medication_administration_create",
            user=self.request.user,
            resource_type="MedicationAdministration",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "prescription_item_id": instance.prescription_item_id,
                "scheduled_time": str(instance.scheduled_time),
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"], url_path="record")
    def record_administration(self, request, pk=None):
        """Record that a dose was given, skipped, refused, held, or vomited."""
        mar_entry = self.get_object()
        serializer = MedicationAdministrationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        dose_given = serializer.validated_data.get("dose_given", "")
        notes = serializer.validated_data.get("notes", "")

        if new_status == "GIVEN":
            mar_entry.administer(user=request.user, dose_given=dose_given, notes=notes)
        else:
            from django.utils import timezone as tz

            mar_entry.status = new_status
            mar_entry.actual_time = tz.now()
            mar_entry.administered_by = request.user
            if notes:
                mar_entry.notes = notes
            mar_entry.save(
                update_fields=["status", "actual_time", "administered_by", "notes", "updated_at"]
            )

        AuditLog.log(
            action="medication_administration_record",
            user=request.user,
            resource_type="MedicationAdministration",
            resource_id=mar_entry.id,
            details={
                "admission_id": mar_entry.admission_id,
                "new_status": new_status,
                "dose_given": dose_given,
            },
            ip_address=get_client_ip(request),
        )

        refreshed = self.get_queryset().get(pk=mar_entry.pk)
        return Response(MedicationAdministrationSerializer(refreshed).data)
