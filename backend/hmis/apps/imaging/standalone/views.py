"""Views for standalone Imaging operations."""

import logging

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.imaging.permissions import ImagingModuleRequired, ImagingStandaloneRequired
from hmis.apps.imaging.serializers import ImagingOrderSerializer

from .models import ExternalImagingOrderRequest, WalkInImagingPatient
from .serializers import (
    ExternalImagingOrderAcceptSerializer,
    ExternalImagingOrderRejectSerializer,
    ExternalImagingOrderRequestSerializer,
    StandaloneImagingOrderCreateSerializer,
    WalkInImagingPatientCreateSerializer,
    WalkInImagingPatientSerializer,
)

logger = logging.getLogger(__name__)


class WalkInImagingPatientViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for walk-in imaging patient registrations."""

    tenant_scope = "facility"
    queryset = WalkInImagingPatient.objects.all().select_related("linked_patient")
    permission_classes = [
        IsAuthenticated,
        ImagingModuleRequired,
        RequiresActiveShiftPermission,
        ImagingStandaloneRequired,
    ]
    filter_backends = [filters.SearchFilter]
    search_fields = ["first_name", "last_name", "registration_number"]

    def get_serializer_class(self):
        if self.action == "create":
            return WalkInImagingPatientCreateSerializer
        return WalkInImagingPatientSerializer

    def perform_create(self, serializer):
        serializer.save(
            registered_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"], url_path="link-patient")
    def link_patient(self, request, pk=None):
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

        return Response(WalkInImagingPatientSerializer(walkin).data)


class StandaloneImagingOrderViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """Standalone imaging order creation (no encounter required)."""

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        ImagingModuleRequired,
        RequiresActiveShiftPermission,
        ImagingStandaloneRequired,
    ]

    def get_serializer_class(self):
        return StandaloneImagingOrderCreateSerializer

    def create(self, request, *args, **kwargs):
        serializer = StandaloneImagingOrderCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "tenant_kwargs": self.get_tenant_save_kwargs(),
            },
        )
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(
            ImagingOrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )


class ExternalImagingOrderRequestViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """View and process external imaging order requests."""

    tenant_scope = "facility"
    queryset = ExternalImagingOrderRequest.objects.all().select_related(
        "walkin_patient", "imaging_order"
    )
    permission_classes = [
        IsAuthenticated,
        ImagingModuleRequired,
        RequiresActiveShiftPermission,
        ImagingStandaloneRequired,
    ]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        return ExternalImagingOrderRequestSerializer

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        ext_req = self.get_object()

        if ext_req.status != ExternalImagingOrderRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot accept request in {ext_req.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalImagingOrderAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import process_external_imaging_order

        try:
            order = process_external_imaging_order(
                ext_req,
                user=request.user,
                auto_create_walkin=serializer.validated_data.get("auto_create_walkin", True),
                facility=getattr(request, "_facility", None) or ext_req.facility,
                organization=getattr(request, "_organization", None) or ext_req.organization,
            )
            ext_req.accept(request.user)
            ext_req.imaging_order = order
            ext_req.save(update_fields=["imaging_order", "updated_at"])

            return Response(
                {
                    "status": "accepted",
                    "imaging_order": ImagingOrderSerializer(order).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.exception("Error processing external imaging order %s", ext_req.id)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        ext_req = self.get_object()

        if ext_req.status != ExternalImagingOrderRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot reject request in {ext_req.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalImagingOrderRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ext_req.reject(request.user, serializer.validated_data["reason"])

        return Response(ExternalImagingOrderRequestSerializer(ext_req).data)
