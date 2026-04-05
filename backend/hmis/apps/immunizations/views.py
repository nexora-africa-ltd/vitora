"""Views for the immunizations app."""


import django_filters.rest_framework
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip
from hmis.apps.immunizations.filters import (
    AEFIFilter,
    ImmunizationRecordFilter,
    VaccineCampaignFilter,
    VaccineDefinitionFilter,
)
from hmis.apps.immunizations.models import (
    AEFI,
    ImmunizationRecord,
    VaccineCampaign,
    VaccineDefinition,
)
from hmis.apps.immunizations.serializers import (
    AdministerVaccineSerializer,
    AEFIListSerializer,
    AEFISerializer,
    GenerateAdultScheduleSerializer,
    ImmunizationRecordListSerializer,
    ImmunizationRecordSerializer,
    VaccineCampaignListSerializer,
    VaccineCampaignSerializer,
    VaccineDefinitionSerializer,
)
from hmis.apps.immunizations.services.coverage import calculate_coverage
from hmis.apps.immunizations.services.schedule import (
    generate_adult_schedule,
    generate_kepi_schedule,
)


class VaccineDefinitionViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for vaccine definition reference data."""

    queryset = VaccineDefinition.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]
    serializer_class = VaccineDefinitionSerializer
    pagination_class = None  # Small reference dataset
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VaccineDefinitionFilter
    ordering_fields = ["standard_age_days", "code", "program"]
    ordering = ["standard_age_days", "code"]


class ImmunizationRecordViewSet(viewsets.ModelViewSet):
    """ViewSet for immunization records (all ages, all programs)."""

    queryset = ImmunizationRecord.objects.select_related(
        "patient", "vaccine", "administered_by", "campaign"
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ImmunizationRecordFilter
    ordering_fields = ["scheduled_date", "created_at", "status"]
    ordering = ["scheduled_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return ImmunizationRecordListSerializer
        if self.action == "administer":
            return AdministerVaccineSerializer
        if self.action == "generate_adult_schedule":
            return GenerateAdultScheduleSerializer
        return ImmunizationRecordSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="immunization_record_create",
            user=self.request.user,
            resource_type="ImmunizationRecord",
            resource_id=instance.id,
            details={
                "patient_id": instance.patient_id,
                "vaccine_id": instance.vaccine_id,
                "dose_number": instance.dose_number,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def administer(self, request, pk=None):
        """Mark a vaccine as administered."""
        record = self.get_object()
        serializer = AdministerVaccineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        record.administered_date = serializer.validated_data["administered_date"]
        record.batch_number = serializer.validated_data.get("batch_number", "")
        record.lot_number = serializer.validated_data.get("lot_number", "")
        record.expiry_date = serializer.validated_data.get("expiry_date")
        record.site = serializer.validated_data.get("site", "")
        record.notes = serializer.validated_data.get("notes", "")
        record.status = "ADMINISTERED"
        record.administered_by = request.user
        record.save()

        AuditLog.log(
            action="immunization_administered",
            user=request.user,
            resource_type="ImmunizationRecord",
            resource_id=record.id,
            details={
                "patient_id": record.patient_id,
                "vaccine_code": record.vaccine.code,
                "dose_number": record.dose_number,
            },
            ip_address=get_client_ip(request),
        )

        return Response(ImmunizationRecordSerializer(record).data)

    @action(detail=False, methods=["post"], url_path="generate-kepi-schedule")
    def generate_kepi_schedule(self, request):
        """Generate KEPI immunization schedule for a child patient."""
        patient_id = request.data.get("patient")
        if not patient_id:
            return Response(
                {"detail": "patient is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.patients.models import Patient

        patient = Patient.objects.filter(id=patient_id).first()
        if not patient:
            return Response(
                {"detail": "Patient not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        records = generate_kepi_schedule(patient)
        serializer = ImmunizationRecordListSerializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="generate-adult-schedule")
    def generate_adult_schedule(self, request):
        """Generate a multi-dose schedule for an adult vaccine."""
        serializer = GenerateAdultScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from hmis.apps.patients.models import Patient

        patient = Patient.objects.filter(
            id=serializer.validated_data["patient"]
        ).first()
        if not patient:
            return Response(
                {"detail": "Patient not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        vaccine = VaccineDefinition.objects.filter(
            id=serializer.validated_data["vaccine"]
        ).first()
        if not vaccine:
            return Response(
                {"detail": "Vaccine not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        records = generate_adult_schedule(
            patient=patient,
            vaccine=vaccine,
            start_date=serializer.validated_data["start_date"],
        )
        return Response(
            ImmunizationRecordListSerializer(records, many=True).data
        )


class VaccineCampaignViewSet(viewsets.ModelViewSet):
    """ViewSet for vaccine campaigns."""

    queryset = VaccineCampaign.objects.prefetch_related("vaccines")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VaccineCampaignFilter
    ordering_fields = ["start_date", "created_at", "status"]
    ordering = ["-start_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return VaccineCampaignListSerializer
        return VaccineCampaignSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="vaccine_campaign_create",
            user=self.request.user,
            resource_type="VaccineCampaign",
            resource_id=instance.id,
            details={"name": instance.name, "status": instance.status},
            ip_address=get_client_ip(self.request),
        )


class AEFIViewSet(viewsets.ModelViewSet):
    """ViewSet for AEFI reporting."""

    queryset = AEFI.objects.select_related(
        "immunization_record",
        "immunization_record__vaccine",
        "immunization_record__patient",
        "investigated_by",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = AEFIFilter
    ordering_fields = ["event_date", "created_at"]
    ordering = ["-event_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return AEFIListSerializer
        return AEFISerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="aefi_create",
            user=self.request.user,
            resource_type="AEFI",
            resource_id=instance.id,
            details={
                "immunization_record_id": instance.immunization_record_id,
                "severity": instance.severity,
            },
            ip_address=get_client_ip(self.request),
        )


class CoverageView(APIView):
    """
    Immunization coverage statistics endpoint.

    GET /api/immunizations/coverage/?vaccine_code=BCG&start_date=2026-01-01&end_date=2026-03-31

    Returns coverage percentage and breakdown for a specific vaccine.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        vaccine_code = request.query_params.get("vaccine_code")
        if not vaccine_code:
            return Response(
                {"detail": "vaccine_code query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # Parse dates if provided
        from datetime import date as date_cls

        parsed_start = None
        parsed_end = None
        if start_date:
            try:
                parsed_start = date_cls.fromisoformat(start_date)
            except ValueError:
                return Response(
                    {"detail": "Invalid start_date format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if end_date:
            try:
                parsed_end = date_cls.fromisoformat(end_date)
            except ValueError:
                return Response(
                    {"detail": "Invalid end_date format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        result = calculate_coverage(
            vaccine_code=vaccine_code,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return Response(result)
