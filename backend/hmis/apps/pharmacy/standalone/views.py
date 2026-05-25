"""Views for standalone Pharmacy operations."""

import logging

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.pharmacy.permissions import PharmacyModuleRequired, PharmacyStandaloneRequired
from hmis.apps.pharmacy.serializers import PrescriptionSerializer

from .models import ExternalPrescriptionRequest, WalkInCustomer
from .serializers import (
    ExternalPrescriptionAcceptSerializer,
    ExternalPrescriptionRejectSerializer,
    ExternalPrescriptionRequestSerializer,
    StandalonePrescriptionCreateSerializer,
    WalkInCustomerCreateSerializer,
    WalkInCustomerSerializer,
)

logger = logging.getLogger(__name__)


class WalkInCustomerViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for walk-in pharmacy customer registrations."""

    tenant_scope = "facility"
    queryset = WalkInCustomer.objects.all().select_related("linked_patient")
    permission_classes = [
        IsAuthenticated,
        PharmacyModuleRequired,
        RequiresActiveShiftPermission,
        PharmacyStandaloneRequired,
    ]
    filter_backends = [filters.SearchFilter]
    search_fields = ["first_name", "last_name", "registration_number"]

    def get_serializer_class(self):
        if self.action == "create":
            return WalkInCustomerCreateSerializer
        return WalkInCustomerSerializer

    def perform_create(self, serializer):
        serializer.save(
            registered_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"], url_path="link-patient")
    def link_patient(self, request, pk=None):
        """Link a walk-in customer to a full HMIS patient record."""
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

        return Response(WalkInCustomerSerializer(walkin).data)


class StandalonePrescriptionViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """Standalone pharmacy prescription creation (no encounter required)."""

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        PharmacyModuleRequired,
        RequiresActiveShiftPermission,
        PharmacyStandaloneRequired,
    ]

    def get_serializer_class(self):
        return StandalonePrescriptionCreateSerializer

    def create(self, request, *args, **kwargs):
        serializer = StandalonePrescriptionCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "tenant_kwargs": self.get_tenant_save_kwargs(),
            },
        )
        serializer.is_valid(raise_exception=True)
        prescription = serializer.save()
        return Response(
            PrescriptionSerializer(prescription).data,
            status=status.HTTP_201_CREATED,
        )


class ExternalPrescriptionRequestViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """View and process external prescription requests (HL7 RDE^O11 or e-prescriptions)."""

    tenant_scope = "facility"
    queryset = ExternalPrescriptionRequest.objects.all().select_related(
        "walkin_customer", "prescription"
    )
    permission_classes = [
        IsAuthenticated,
        PharmacyModuleRequired,
        RequiresActiveShiftPermission,
        PharmacyStandaloneRequired,
    ]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        return ExternalPrescriptionRequestSerializer

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Accept an external prescription and create a Prescription from it."""
        ext_req = self.get_object()

        if ext_req.status != ExternalPrescriptionRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot accept request in {ext_req.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalPrescriptionAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import process_external_prescription

        try:
            prescription = process_external_prescription(
                ext_req,
                user=request.user,
                auto_create_walkin=serializer.validated_data.get("auto_create_walkin", True),
                facility=getattr(request, "_facility", None) or ext_req.facility,
                organization=getattr(request, "_organization", None) or ext_req.organization,
            )
            ext_req.accept(request.user)
            ext_req.prescription = prescription
            ext_req.save(update_fields=["prescription", "updated_at"])

            return Response(
                {
                    "status": "accepted",
                    "prescription": PrescriptionSerializer(prescription).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.exception("Error processing external prescription %s", ext_req.id)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject an external prescription request."""
        ext_req = self.get_object()

        if ext_req.status != ExternalPrescriptionRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot reject request in {ext_req.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalPrescriptionRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ext_req.reject(request.user, serializer.validated_data["reason"])

        return Response(ExternalPrescriptionRequestSerializer(ext_req).data)
