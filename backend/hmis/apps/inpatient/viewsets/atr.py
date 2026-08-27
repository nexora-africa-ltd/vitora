"""
What this file is for: inpatient Adverse Transfusion Reaction (ATR) workflows.
How to use: imported by ``inpatient.views`` so existing router registrations keep working.
Supported inputs/args: DRF ViewSet request payloads defined by ATR serializers/actions.
"""

# ruff: noqa: ARG002

from contextlib import suppress

from django.core.exceptions import ValidationError as DjangoValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import AdverseTransfusionReaction
from ..serializers import (
    ATRAcknowledgeSerializer,
    ATRCreateSerializer,
    ATRDetailSerializer,
    ATRLabInvestigationSerializer,
    ATRListSerializer,
    ATRSubmitToPPBSerializer,
)


class AdverseTransfusionReactionViewSet(
    TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet
):
    """ViewSet for Adverse Transfusion Reaction (ATR) reports."""

    tenant_scope = "facility"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "transfusion", "transfusion__admission"]
    ordering_fields = ["report_date", "created_at"]
    ordering = ["-report_date"]

    def get_queryset(self):
        return AdverseTransfusionReaction.objects.select_related(
            "transfusion",
            "transfusion__admission",
            "transfusion__admission__patient",
            "transfusion__admission__ward",
            "transfusion__started_by",
            "initial_reporter",
            "facility",
            "lab_order",
        ).prefetch_related("transfusion__observations")

    def get_serializer_class(self):
        if self.action == "create":
            return ATRCreateSerializer
        if self.action == "list":
            return ATRListSerializer
        if self.action == "update_lab_investigation":
            return ATRLabInvestigationSerializer
        if self.action == "submit_to_ppb":
            return ATRSubmitToPPBSerializer
        if self.action == "mark_acknowledged":
            return ATRAcknowledgeSerializer
        return ATRDetailSerializer

    def perform_create(self, serializer):
        from datetime import date as date_mod

        instance = serializer.save(
            initial_reporter=self.request.user,
            report_date=date_mod.today(),
        )
        admission = instance.transfusion.admission
        if admission.facility:
            instance.facility = admission.facility
            instance.organization = admission.organization
        if instance.volume_transfused_ml is None:
            instance.volume_transfused_ml = instance.transfusion.amount_ml
        instance.auto_populate_vitals()
        instance.save()

        AuditLog.log(
            action="atr_create",
            user=self.request.user,
            resource_type="AdverseTransfusionReaction",
            resource_id=instance.id,
            details={
                "transfusion_id": instance.transfusion_id,
                "admission_id": instance.transfusion.admission_id,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["patch"], url_path="update-lab-investigation")
    def update_lab_investigation(self, request, pk=None):
        """Update the lab investigation section of an ATR report."""
        atr = self.get_object()
        serializer = ATRLabInvestigationSerializer(atr, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        AuditLog.log(
            action="atr_lab_investigation_update",
            user=request.user,
            resource_type="AdverseTransfusionReaction",
            resource_id=atr.id,
            details={"fields_updated": list(request.data.keys())},
            ip_address=get_client_ip(request),
        )
        return Response(ATRDetailSerializer(atr).data)

    @action(detail=True, methods=["post"], url_path="submit-to-ppb")
    def submit_to_ppb(self, request, pk=None):
        """Submit the ATR report to PPB."""
        atr = self.get_object()
        serializer = ATRSubmitToPPBSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            if value:
                setattr(atr, field, value)
        pii_to_db = {
            "ppb_submitter_mobile": "ppb_submitter_mobile_encrypted",
            "ppb_submitter_email": "ppb_submitter_email_encrypted",
        }
        db_fields = [pii_to_db.get(k, k) for k in serializer.validated_data] + ["updated_at"]
        atr.save(update_fields=db_fields)

        try:
            atr.submit_to_ppb(user=request.user)
        except DjangoValidationError as e:
            return Response(
                {"error": e.messages[0] if e.messages else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="atr_submit_ppb",
            user=request.user,
            resource_type="AdverseTransfusionReaction",
            resource_id=atr.id,
            details={"status": atr.status},
            ip_address=get_client_ip(request),
        )
        return Response(ATRDetailSerializer(atr).data)

    @action(detail=True, methods=["post"], url_path="mark-acknowledged")
    def mark_acknowledged(self, request, pk=None):
        """Record PPB acknowledgment of the ATR report."""
        atr = self.get_object()
        serializer = ATRAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            atr.mark_acknowledged(
                adr_number=serializer.validated_data["adr_report_number"],
                vigiflow_number=serializer.validated_data.get("vigiflow_entry_number", ""),
            )
        except DjangoValidationError as e:
            return Response(
                {"error": e.messages[0] if e.messages else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="atr_ppb_acknowledged",
            user=request.user,
            resource_type="AdverseTransfusionReaction",
            resource_id=atr.id,
            details={
                "adr_report_number": atr.adr_report_number,
                "vigiflow_entry_number": atr.vigiflow_entry_number,
            },
            ip_address=get_client_ip(request),
        )
        return Response(ATRDetailSerializer(atr).data)

    @action(detail=True, methods=["post"], url_path="request-lab-investigation")
    def request_lab_investigation(self, request, pk=None):
        """Create a lab order for ATR post-transfusion investigation."""
        atr = self.get_object()

        try:
            order = atr.create_lab_order(user=request.user)
        except DjangoValidationError as e:
            return Response(
                {"error": e.messages[0] if e.messages else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with suppress(DjangoValidationError):
            order.update_status("ORDERED", request.user)

        AuditLog.log(
            action="atr_lab_order_created",
            user=request.user,
            resource_type="AdverseTransfusionReaction",
            resource_id=atr.id,
            details={
                "lab_order_id": order.id,
                "lab_order_number": order.order_number,
                "tests": list(order.items.values_list("test__code", flat=True)),
            },
            ip_address=get_client_ip(request),
        )

        atr.refresh_from_db()
        return Response(ATRDetailSerializer(atr).data)

    @action(detail=True, methods=["post"], url_path="sync-lab-results")
    def sync_lab_results(self, request, pk=None):
        """Pull verified lab results from the linked lab order into ATR fields."""
        atr = self.get_object()

        if not atr.lab_order_id:
            return Response(
                {"error": "No lab order linked to this ATR report."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = atr.populate_from_lab_results()

        AuditLog.log(
            action="atr_lab_results_synced",
            user=request.user,
            resource_type="AdverseTransfusionReaction",
            resource_id=atr.id,
            details={"updated": updated, "lab_order_id": atr.lab_order_id},
            ip_address=get_client_ip(request),
        )

        atr.refresh_from_db()
        return Response(ATRDetailSerializer(atr).data)
