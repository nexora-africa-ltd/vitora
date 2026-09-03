# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Views for standalone LIS operations."""

import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.decorators import permission_classes as drf_permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    get_client_ip,
)
from hmis.apps.laboratory.analyzers.models import InstrumentChannel
from hmis.apps.laboratory.models import Instrument, LabWorkflowSettings, TestCatalog
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISStandaloneRequired
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


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_status(request):
    """Get/complete LIS standalone onboarding checklist for the active facility."""
    profile = getattr(request.user, "staff_profile", None)
    facility = getattr(profile, "primary_facility", None)

    if not facility:
        return Response(
            {"detail": "No facility is linked to your staff profile."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if facility.operating_mode != facility.OperatingMode.STANDALONE_LAB:
        return Response(
            {"detail": "LIS standalone onboarding is only available in standalone lab mode."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    steps = facility.get_lis_onboarding_checklist()

    if request.method == "GET":
        return Response(
            {
                "complete": facility.lis_onboarding_complete,
                "steps": steps,
                "completed_at": facility.lis_onboarding_completed_at.isoformat()
                if facility.lis_onboarding_completed_at
                else None,
            }
        )

    if facility.lis_onboarding_complete:
        return Response(
            {
                "complete": True,
                "steps": steps,
                "completed_at": facility.lis_onboarding_completed_at.isoformat()
                if facility.lis_onboarding_completed_at
                else None,
            }
        )

    missing_required = [step["key"] for step in steps if step["required"] and not step["done"]]
    if missing_required:
        return Response(
            {
                "detail": "Please complete all required LIS onboarding steps first.",
                "code": "lis_onboarding_incomplete",
                "missing_steps": missing_required,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    facility.lis_onboarding_completed_at = timezone.now()
    facility.save(update_fields=["lis_onboarding_completed_at", "updated_at"])

    AuditLog.log(
        action="lis_onboarding_completed",
        user=request.user,
        resource_type="Facility",
        resource_id=facility.id,
        facility=facility,
        organization=facility.organization,
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details={"operating_mode": str(facility.operating_mode)},
        request=request,
    )

    return Response(
        {
            "complete": True,
            "steps": steps,
            "completed_at": facility.lis_onboarding_completed_at.isoformat()
            if facility.lis_onboarding_completed_at
            else None,
        }
    )


@extend_schema(exclude=True)
@api_view(["POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_seed_defaults(request):
    """Seed default LIS onboarding data for a selected lab archetype."""
    profile = getattr(request.user, "staff_profile", None)
    facility = getattr(profile, "primary_facility", None)

    if not facility:
        return Response(
            {"detail": "No facility is linked to your staff profile."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if facility.operating_mode != facility.OperatingMode.STANDALONE_LAB:
        return Response(
            {"detail": "Default seeding is only available in standalone lab mode."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    archetype = str(request.data.get("archetype", "small")).strip().lower()
    if archetype not in {"small", "medium", "reference"}:
        return Response(
            {"detail": "archetype must be one of: small, medium, reference."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    catalogue_by_archetype = {
        "small": [
            ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", 500),
            ("RBS", "Random Blood Sugar", "CHEMISTRY", "BLOOD", 250),
            ("URINALYSIS", "Urinalysis", "URINALYSIS", "URINE", 300),
        ],
        "medium": [
            ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", 500),
            ("RBS", "Random Blood Sugar", "CHEMISTRY", "BLOOD", 250),
            ("LFT", "Liver Function Test", "CHEMISTRY", "SERUM", 1200),
            ("RFT", "Renal Function Test", "CHEMISTRY", "SERUM", 1200),
            ("MALARIA", "Malaria Parasite", "PARASITOLOGY", "BLOOD", 400),
            ("URINALYSIS", "Urinalysis", "URINALYSIS", "URINE", 300),
        ],
        "reference": [
            ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", 500),
            ("ESR", "Erythrocyte Sedimentation Rate", "HEMATOLOGY", "BLOOD", 350),
            ("LFT", "Liver Function Test", "CHEMISTRY", "SERUM", 1200),
            ("RFT", "Renal Function Test", "CHEMISTRY", "SERUM", 1200),
            ("LIPID", "Lipid Profile", "CHEMISTRY", "SERUM", 1500),
            ("TSH", "Thyroid Stimulating Hormone", "CHEMISTRY", "SERUM", 1800),
            ("HBA1C", "HbA1c", "CHEMISTRY", "BLOOD", 900),
            ("HIV", "HIV 1/2 Antibody", "SEROLOGY", "SERUM", 600),
            ("HB", "Hepatitis B Surface Antigen", "SEROLOGY", "SERUM", 700),
            ("MALARIA", "Malaria Parasite", "PARASITOLOGY", "BLOOD", 400),
        ],
    }

    created_tests = 0
    created_instruments = 0
    created_channels = 0

    LabWorkflowSettings.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
    )

    for code, name, category, specimen, cost in catalogue_by_archetype[archetype]:
        _, created = TestCatalog.objects.get_or_create(
            facility=facility,
            organization=facility.organization,
            code=code,
            defaults={
                "name": name,
                "short_name": code,
                "category": category,
                "specimen_type": specimen,
                "cost": cost,
                "result_type": "NUMERIC",
                "is_active": True,
            },
        )
        if created:
            created_tests += 1

    instrument_code = f"AUTO-{archetype.upper()}-01"
    instrument, inst_created = Instrument.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
        code=instrument_code,
        defaults={
            "name": f"{archetype.title()} Lab Analyzer",
            "manufacturer": "Generic",
            "model": "LIS Seed",
            "department": "Laboratory",
            "interface_type": Instrument.InterfaceType.MANUAL,
            "is_active": True,
        },
    )
    if inst_created:
        created_instruments += 1

    _, ch_created = InstrumentChannel.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
        instrument=instrument,
        name="Primary Channel",
        defaults={
            "protocol": InstrumentChannel.Protocol.TCP,
            "direction": InstrumentChannel.Direction.BIDIRECTIONAL,
            "host": "127.0.0.1",
            "port": 5000,
            "encoding": "ascii",
            "is_active": True,
        },
    )
    if ch_created:
        created_channels += 1

    return Response(
        {
            "archetype": archetype,
            "created_tests": created_tests,
            "created_instruments": created_instruments,
            "created_channels": created_channels,
        },
        status=status.HTTP_200_OK,
    )


class WalkInPatientViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for walk-in patient registrations.

    Walk-in patients are lightweight records for labs operating independently
    of the full HMIS patient module.
    """

    tenant_scope = "facility"
    queryset = WalkInPatient.objects.all().select_related("linked_patient")
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "first_name",
        "last_name",
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

    @action(detail=True, methods=["post"], url_path="promote")
    def promote(self, request, pk=None):
        """
        Promote a walk-in patient into a full HMIS ``Patient`` record.

        Optional request payload:
            county: int, sub_county: int, ward: int, date_of_birth: ISO date,
            identification_type: str, plus any other ``Patient`` field overrides.

        Idempotent — returns the existing linked patient if already promoted.
        """
        walkin = self.get_object()
        data = request.data or {}
        was_linked = bool(walkin.linked_patient_id)

        try:
            patient = walkin.promote_to_patient(
                user=request.user,
                county_id=data.get("county"),
                sub_county_id=data.get("sub_county"),
                ward_id=data.get("ward"),
                **{
                    k: v
                    for k, v in data.items()
                    if k
                    in {
                        "date_of_birth",
                        "identification_type",
                        "title",
                        "middle_name",
                        "phone_number",
                        "email",
                        "village",
                    }
                },
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:  # noqa: BLE001
            logger.exception("Walk-in promotion failed for id=%s", walkin.pk)
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not was_linked:
            AuditLog.log(
                action="patient_create",
                user=request.user,
                resource_type="Patient",
                resource_id=patient.id,
                patient_id=patient.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                details={
                    "source": "walkin_promote",
                    "patient_mrn": patient.mrn,
                    "walkin_patient_id": walkin.id,
                    "registered_by": request.user.username,
                },
                request=request,
            )

        serializer = WalkInPatientSerializer(walkin)
        return Response(
            {"walkin": serializer.data, "patient_id": patient.pk, "mrn": patient.mrn},
            status=status.HTTP_200_OK,
        )


class StandaloneOrderViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """
    Standalone lab order creation (no encounter required).

    Supports walk-in patients and external referrals.
    """

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

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
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]
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
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
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
