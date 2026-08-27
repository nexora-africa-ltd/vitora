"""
What this file is for: observation-chart inpatient viewsets (temperature, fluid balance, transfusion).
How to use: imported by ``inpatient.views`` so existing router registrations keep working.
Supported inputs/args: DRF ViewSet request inputs defined by existing serializers/actions.
"""

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

from ..models import (
    BloodTransfusionObservation,
    FluidBalanceEntry,
    FluidBalanceSheet,
    TemperatureReading,
)
from ..serializers import (
    BloodTransfusionCreateSerializer,
    BloodTransfusionSerializer,
    FluidBalanceEntryCreateSerializer,
    FluidBalanceEntrySerializer,
    FluidBalanceSheetCreateSerializer,
    FluidBalanceSheetSerializer,
    TemperatureReadingCreateSerializer,
    TemperatureReadingSerializer,
    TransfusionObservationEntryCreateSerializer,
    TransfusionObservationEntrySerializer,
)


def _sync_bedside_vitals_to_ipd_encounter(admission, *, vitals_payload: dict) -> None:
    """Mirror bedside vitals onto the linked IPD encounter for downstream workflows."""
    encounter = getattr(admission, "ipd_encounter", None)
    if encounter is None or encounter.status in {"CLOSED", "CANCELLED"}:
        return

    changed_fields = []
    for field_name, value in vitals_payload.items():
        if value is None:
            continue
        if getattr(encounter, field_name, None) != value:
            setattr(encounter, field_name, value)
            changed_fields.append(field_name)

    if not changed_fields:
        return

    encounter.save(update_fields=[*changed_fields, "updated_at"])


class TemperatureReadingViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for temperature chart readings."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission"]
    ordering_fields = ["recorded_at"]
    ordering = ["-recorded_at"]

    def get_queryset(self):
        return TemperatureReading.objects.select_related(
            "admission", "admission__patient", "recorded_by"
        )

    def get_serializer_class(self):
        if self.action == "create":
            return TemperatureReadingCreateSerializer
        return TemperatureReadingSerializer

    def create(self, request, *_args, **_kwargs):
        """Return the full read serializer after creating a temperature reading."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = TemperatureReadingSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        _sync_bedside_vitals_to_ipd_encounter(
            instance.admission,
            vitals_payload={
                "temperature": instance.temperature,
                "pulse": instance.pulse,
                "respiratory_rate": instance.respiratory_rate,
            },
        )
        AuditLog.log(
            action="temperature_reading_create",
            user=self.request.user,
            resource_type="TemperatureReading",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "temperature": str(instance.temperature),
            },
            ip_address=get_client_ip(self.request),
        )


class FluidBalanceSheetViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for daily fluid balance sheets."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission", "chart_date"]
    ordering_fields = ["chart_date", "created_at"]
    ordering = ["-chart_date", "-created_at"]

    def get_queryset(self):
        return FluidBalanceSheet.objects.select_related(
            "admission", "admission__patient", "recorded_by"
        ).prefetch_related("entries", "entries__recorded_by")

    def get_serializer_class(self):
        if self.action == "create":
            return FluidBalanceSheetCreateSerializer
        return FluidBalanceSheetSerializer

    def create(self, request, *_args, **_kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = FluidBalanceSheetSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="fluid_balance_sheet_create",
            user=self.request.user,
            resource_type="FluidBalanceSheet",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "chart_date": instance.chart_date.isoformat(),
            },
            ip_address=get_client_ip(self.request),
        )


class FluidBalanceEntryViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for categorized fluid balance entries."""

    tenant_facility_chain = "fluid_balance_sheet__admission__facility"
    tenant_org_chain = "fluid_balance_sheet__admission__organization"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["fluid_balance_sheet", "entry_type"]
    ordering_fields = ["recorded_at", "created_at"]
    ordering = ["-recorded_at", "-created_at"]

    def get_queryset(self):
        return FluidBalanceEntry.objects.select_related(
            "fluid_balance_sheet",
            "fluid_balance_sheet__admission",
            "fluid_balance_sheet__admission__patient",
            "recorded_by",
        )

    def get_serializer_class(self):
        if self.action == "create":
            return FluidBalanceEntryCreateSerializer
        return FluidBalanceEntrySerializer

    def create(self, request, *_args, **_kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = FluidBalanceEntrySerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="fluid_balance_entry_create",
            user=self.request.user,
            resource_type="FluidBalanceEntry",
            resource_id=instance.id,
            details={
                "fluid_balance_sheet_id": instance.fluid_balance_sheet_id,
                "entry_type": instance.entry_type,
                "amount_ml": instance.amount_ml,
            },
            ip_address=get_client_ip(self.request),
        )


class BloodTransfusionViewSet(NestedTenantScopeMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """ViewSet for blood transfusion observation charts."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission", "status"]
    ordering_fields = ["transfusion_date"]
    ordering = ["-transfusion_date"]

    def get_queryset(self):
        return BloodTransfusionObservation.objects.select_related(
            "admission", "admission__patient", "started_by", "counter_checked_by"
        ).prefetch_related("observations", "observations__recorded_by")

    def get_serializer_class(self):
        if self.action == "create":
            return BloodTransfusionCreateSerializer
        if self.action == "add_observation":
            return TransfusionObservationEntryCreateSerializer
        return BloodTransfusionSerializer

    def perform_create(self, serializer):
        instance = serializer.save(started_by=self.request.user)
        AuditLog.log(
            action="blood_transfusion_create",
            user=self.request.user,
            resource_type="BloodTransfusionObservation",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "blood_product": instance.blood_product,
                "amount_ml": instance.amount_ml,
                "blood_bank_unit_id": instance.blood_bank_unit_id,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"], url_path="add-observation")
    def add_observation(self, request, _pk=None):
        """Add an observation entry to a transfusion record."""
        transfusion = self.get_object()
        serializer = TransfusionObservationEntryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(
            transfusion=transfusion,
            recorded_by=request.user,
        )
        AuditLog.log(
            action="transfusion_observation_create",
            user=request.user,
            resource_type="TransfusionObservationEntry",
            resource_id=entry.id,
            details={
                "transfusion_id": transfusion.id,
                "interval": entry.observation_interval,
            },
            ip_address=get_client_ip(request),
        )
        return Response(
            TransfusionObservationEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-reaction")
    def mark_reaction(self, request, _pk=None):
        """Record a transfusion reaction."""
        transfusion = self.get_object()
        reaction_type = request.data.get("reaction_type", "")
        action_taken = request.data.get("action_taken", "")

        if not reaction_type:
            return Response(
                {"error": "reaction_type is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        transfusion.reaction_occurred = True
        transfusion.reaction_type = reaction_type
        transfusion.reaction_action_taken = action_taken
        transfusion.status = "STOPPED"
        transfusion.save()

        AuditLog.log(
            action="transfusion_reaction_recorded",
            user=request.user,
            resource_type="BloodTransfusionObservation",
            resource_id=transfusion.id,
            details={
                "reaction_type": reaction_type,
                "action_taken": action_taken,
            },
            ip_address=get_client_ip(request),
        )
        return Response(BloodTransfusionSerializer(transfusion).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete_transfusion(self, request, _pk=None):
        """Mark a transfusion as completed."""
        transfusion = self.get_object()
        import datetime

        from django.utils import timezone as tz

        transfusion.status = "COMPLETED"
        transfusion.time_ended = request.data.get("time_ended", tz.localtime().time())
        if isinstance(transfusion.time_ended, str):
            transfusion.time_ended = datetime.time.fromisoformat(transfusion.time_ended)
        transfusion.save()

        AuditLog.log(
            action="blood_transfusion_complete",
            user=request.user,
            resource_type="BloodTransfusionObservation",
            resource_id=transfusion.id,
            details={"admission_id": transfusion.admission_id},
            ip_address=get_client_ip(request),
        )
        return Response(BloodTransfusionSerializer(transfusion).data)
