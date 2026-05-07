"""Views for standalone LIS operations."""

import logging

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.laboratory.permissions import LISStandaloneRequired
from hmis.apps.laboratory.serializers import LabOrderSerializer

from .models import ExternalOrderRequest, WalkInPatient
from .serializers import (
    ExternalOrderAcceptSerializer,
    ExternalOrderRejectSerializer,
    ExternalOrderRequestSerializer,
    StandaloneOrderCreateSerializer,
    WalkInPatientCreateSerializer,
    WalkInPatientSerializer,
)

logger = logging.getLogger(__name__)


class WalkInPatientViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for walk-in patient registrations.

    Walk-in patients are lightweight records for labs operating independently
    of the full HMIS patient module.
    """

    tenant_scope = "facility"
    queryset = WalkInPatient.objects.all().select_related("linked_patient")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission, LISStandaloneRequired]
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "first_name",
        "last_name",
        "national_id",
        "phone_number",
        "registration_number",
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return WalkInPatientCreateSerializer
        return WalkInPatientSerializer

    def perform_create(self, serializer):
        serializer.save(
            registered_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"], url_path="link-patient")
    def link_patient(self, request, pk=None):
        """Link a walk-in patient to a full HMIS patient record."""
        walkin = self.get_object()
        patient_id = request.data.get("patient_id")

        if not patient_id:
            return Response(
                {"error": "patient_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        walkin.linked_patient = patient
        walkin.save(update_fields=["linked_patient", "updated_at"])

        serializer = WalkInPatientSerializer(walkin)
        return Response(serializer.data)


class StandaloneOrderViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """
    Standalone lab order creation (no encounter required).

    Supports walk-in patients and external referrals.
    """

    tenant_scope = "facility"
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission, LISStandaloneRequired]

    def get_serializer_class(self):
        return StandaloneOrderCreateSerializer

    def create(self, request, *args, **kwargs):
        """Create a standalone lab order."""
        serializer = StandaloneOrderCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "tenant_kwargs": self.get_tenant_save_kwargs(),
            },
        )
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        output_serializer = LabOrderSerializer(order)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class ExternalOrderRequestViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    View and process external order requests (from HL7 ORM^O01 messages).

    External systems send orders via the HL7 ingest endpoint. These appear
    here for lab staff to accept/reject.
    """

    tenant_scope = "facility"
    queryset = ExternalOrderRequest.objects.all().select_related("walkin_patient", "lab_order")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission, LISStandaloneRequired]
    http_method_names = ["get", "post", "head", "options"]  # Read + accept/reject actions

    def get_serializer_class(self):
        return ExternalOrderRequestSerializer

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Accept an external order and create a lab order from it."""
        ext_order = self.get_object()

        if ext_order.status != ExternalOrderRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot accept order in {ext_order.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalOrderAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import process_external_order

        try:
            lab_order = process_external_order(
                ext_order,
                user=request.user,
                auto_create_walkin=serializer.validated_data.get("auto_create_walkin", True),
                facility=getattr(request, "_facility", None) or ext_order.facility,
                organization=getattr(request, "_organization", None) or ext_order.organization,
            )
            ext_order.accept(request.user)
            ext_order.lab_order = lab_order
            ext_order.save(update_fields=["lab_order", "updated_at"])

            return Response(
                {
                    "status": "accepted",
                    "lab_order": LabOrderSerializer(lab_order).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.exception("Error processing external order %s", ext_order.id)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject an external order request."""
        ext_order = self.get_object()

        if ext_order.status != ExternalOrderRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot reject order in {ext_order.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalOrderRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ext_order.reject(request.user, serializer.validated_data["reason"])

        return Response(ExternalOrderRequestSerializer(ext_order).data)
