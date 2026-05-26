"""Views for the immunizations app."""

import django_filters.rest_framework
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import WriteRequiresRolePermission, get_client_ip
from hmis.apps.immunizations.filters import (
    AEFIFilter,
    ImmunizationRecordFilter,
    VaccineCampaignFilter,
    VaccineDefinitionFilter,
)
from hmis.apps.immunizations.models import (
    AEFI,
    AEFIReportType,
    ColdChainEquipment,
    ImmunizationRecord,
    StockTransaction,
    TemperatureLog,
    VaccineCampaign,
    VaccineDefinition,
    VaccineIncident,
    VaccineStock,
)
from hmis.apps.immunizations.serializers import (
    AdministerVaccineSerializer,
    AEFICreateSerializer,
    AEFIFollowUpSerializer,
    AEFIListSerializer,
    AEFISerializer,
    AEFISubmitToAuthoritiesSerializer,
    ColdChainEquipmentListSerializer,
    ColdChainEquipmentSerializer,
    GenerateAdultScheduleSerializer,
    ImmunizationRecordListSerializer,
    ImmunizationRecordSerializer,
    StockIssueSerializer,
    StockReceiveSerializer,
    StockTransactionSerializer,
    TemperatureLogSerializer,
    VaccineCampaignListSerializer,
    VaccineCampaignSerializer,
    VaccineDefinitionSerializer,
    VaccineIncidentListSerializer,
    VaccineIncidentSerializer,
    VaccineStockListSerializer,
    VaccineStockSerializer,
)
from hmis.apps.immunizations.services.coverage import calculate_coverage
from hmis.apps.immunizations.services.schedule import (
    generate_adult_schedule,
    generate_kepi_schedule,
)


class VaccineDefinitionViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for vaccine definition reference data."""

    queryset = VaccineDefinition.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    serializer_class = VaccineDefinitionSerializer
    pagination_class = None  # Small reference dataset
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VaccineDefinitionFilter
    ordering_fields = ["standard_age_days", "code", "program"]
    ordering = ["standard_age_days", "code"]


class ImmunizationRecordViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for immunization records (all ages, all programs)."""

    queryset = ImmunizationRecord.objects.select_related(
        "patient", "vaccine", "administered_by", "campaign"
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"
    filter_backends = [
        django_filters.rest_framework.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ImmunizationRecordFilter
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "vaccine__name",
        "vaccine__code",
        "batch_number",
    ]
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
        instance = serializer.save(**self.get_tenant_save_kwargs())
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
        """Mark a vaccine as administered.

        If stock_batch is provided, auto-fills batch details from stock
        and deducts 1 dose with a ISSUE StockTransaction.
        """
        record = self.get_object()
        serializer = AdministerVaccineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        stock_batch_id = serializer.validated_data.get("stock_batch")
        stock = None

        if stock_batch_id:
            try:
                stock = VaccineStock.objects.get(pk=stock_batch_id)
            except VaccineStock.DoesNotExist:
                return Response(
                    {"stock_batch": "Stock batch not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if stock.vaccine_id != record.vaccine_id:
                return Response(
                    {"stock_batch": "Stock batch does not match the vaccine being administered."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if stock.quantity_on_hand < 1:
                return Response(
                    {"stock_batch": "Insufficient stock. This batch has 0 doses remaining."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if stock.is_expired:
                return Response(
                    {"stock_batch": "This batch has expired."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        record.administered_date = serializer.validated_data["administered_date"]
        record.site = serializer.validated_data.get("site", "")
        record.notes = serializer.validated_data.get("notes", "")
        record.diluent_batch_number = serializer.validated_data.get("diluent_batch_number", "")
        record.diluent_manufacturer = serializer.validated_data.get("diluent_manufacturer", "")
        record.diluent_expiry_date = serializer.validated_data.get("diluent_expiry_date")

        # Auto-fill from stock batch if provided, otherwise use manual entry
        if stock:
            record.batch_number = stock.batch_number
            record.lot_number = (
                serializer.validated_data.get("lot_number", "") or stock.batch_number
            )
            record.expiry_date = stock.expiry_date
            record.vaccine_manufacturer = stock.manufacturer
        else:
            record.batch_number = serializer.validated_data.get("batch_number", "")
            record.lot_number = serializer.validated_data.get("lot_number", "")
            record.expiry_date = serializer.validated_data.get("expiry_date")
            record.vaccine_manufacturer = serializer.validated_data.get("vaccine_manufacturer", "")

        record.status = "ADMINISTERED"
        record.administered_by = request.user
        record.save()

        # Deduct 1 dose from stock batch
        if stock:
            stock.quantity_on_hand -= 1
            stock.save(update_fields=["quantity_on_hand"])
            StockTransaction.objects.create(
                stock=stock,
                transaction_type="ISSUE",
                quantity=-1,
                balance_after=stock.quantity_on_hand,
                performed_by=request.user,
                immunization_record=record,
                reason="Vaccine administration",
                notes=f"Administered to patient {record.patient_id}, dose {record.dose_number}",
            )

        AuditLog.log(
            action="immunization_administered",
            user=request.user,
            resource_type="ImmunizationRecord",
            resource_id=record.id,
            details={
                "patient_id": record.patient_id,
                "vaccine_code": record.vaccine.code,
                "dose_number": record.dose_number,
                "stock_batch_id": stock_batch_id,
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

        patient = Patient.objects.filter(id=serializer.validated_data["patient"]).first()
        if not patient:
            return Response(
                {"detail": "Patient not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        vaccine = VaccineDefinition.objects.filter(id=serializer.validated_data["vaccine"]).first()
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
        return Response(ImmunizationRecordListSerializer(records, many=True).data)


class VaccineCampaignViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for vaccine campaigns."""

    queryset = VaccineCampaign.objects.prefetch_related("vaccines")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VaccineCampaignFilter
    ordering_fields = ["start_date", "created_at", "status"]
    ordering = ["-start_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return VaccineCampaignListSerializer
        return VaccineCampaignSerializer

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_tenant_save_kwargs())
        AuditLog.log(
            action="vaccine_campaign_create",
            user=self.request.user,
            resource_type="VaccineCampaign",
            resource_id=instance.id,
            details={"name": instance.name, "status": instance.status},
            ip_address=get_client_ip(self.request),
        )


class AEFIViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for AEFI reporting — aligned with MOH AEFI Reporting Form."""

    queryset = AEFI.objects.select_related(
        "immunization_record",
        "immunization_record__vaccine",
        "immunization_record__patient",
        "investigated_by",
        "reported_by",
        "parent_report",
        "vaccination_centre_county",
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = AEFIFilter
    ordering_fields = ["event_date", "created_at", "severity"]
    ordering = ["-event_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return AEFIListSerializer
        if self.action == "create":
            return AEFICreateSerializer
        if self.action == "submit_to_authorities":
            return AEFISubmitToAuthoritiesSerializer
        if self.action == "follow_up":
            return AEFIFollowUpSerializer
        return AEFISerializer

    def perform_create(self, serializer):
        instance = serializer.save(
            reported_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="aefi_create",
            user=self.request.user,
            resource_type="AEFI",
            resource_id=instance.id,
            details={
                "immunization_record_id": instance.immunization_record_id,
                "severity": instance.severity,
                "event_types": instance.event_types,
                "report_type": instance.report_type,
            },
            ip_address=get_client_ip(self.request),
        )
        # Store for create() to return full detail serializer
        self._created_instance = instance

    def create(self, request, *args, **kwargs):
        """Override to return full AEFISerializer (not the input serializer)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        detail_serializer = AEFISerializer(self._created_instance)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="submit-to-authorities")
    def submit_to_authorities(self, request, pk=None):
        """Submit AEFI report to national authorities."""
        aefi = self.get_object()
        if aefi.reported_to_authorities:
            return Response(
                {"detail": "This AEFI has already been reported to authorities."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AEFISubmitToAuthoritiesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        aefi.submit_to_authorities(
            user=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )

        AuditLog.log(
            action="aefi_submit_to_authorities",
            user=request.user,
            resource_type="AEFI",
            resource_id=aefi.id,
            details={
                "immunization_record_id": aefi.immunization_record_id,
                "severity": aefi.severity,
            },
            ip_address=get_client_ip(request),
        )

        return Response(AEFISerializer(aefi).data)

    @action(detail=True, methods=["post"], url_path="follow-up")
    def follow_up(self, request, pk=None):
        """Create a follow-up AEFI report linked to this (parent) report.

        Carries forward patient/vaccine/facility context from the parent.
        Only updates fields provided in the request; inherits the rest.
        """
        parent = self.get_object()
        serializer = AEFIFollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        follow_up_report = AEFI.objects.create(
            immunization_record=parent.immunization_record,
            report_type=AEFIReportType.FOLLOW_UP,
            parent_report=parent,
            # Carry forward from parent
            guardian_name=parent.guardian_name,
            vaccination_service_type=parent.vaccination_service_type,
            event_date=parent.event_date,
            onset_time=parent.onset_time,
            past_medical_history_notes=parent.past_medical_history_notes,
            # Allow overrides from request
            event_types=data.get("event_types") or parent.event_types,
            severity=data.get("severity") or parent.severity,
            outcome=data.get("outcome") or parent.outcome,
            treatment_given=data.get("treatment_given", parent.treatment_given),
            treatment_details=data.get("treatment_details") or parent.treatment_details,
            specimen_collected=data.get("specimen_collected", parent.specimen_collected),
            specimen_type=data.get("specimen_type") or parent.specimen_type,
            description=data.get("notes", ""),
            reported_by=request.user,
            # Tenant scoping
            facility=parent.facility,
            organization=parent.organization,
        )

        AuditLog.log(
            action="aefi_follow_up_create",
            user=request.user,
            resource_type="AEFI",
            resource_id=follow_up_report.id,
            details={
                "parent_aefi_id": parent.id,
                "immunization_record_id": parent.immunization_record_id,
            },
            ip_address=get_client_ip(request),
        )

        return Response(AEFISerializer(follow_up_report).data, status=status.HTTP_201_CREATED)


class CoverageView(APIView):
    """
    Immunization coverage statistics endpoint.

    GET /api/immunizations/coverage/?vaccine_code=BCG&start_date=2026-01-01&end_date=2026-03-31

    Returns coverage percentage and breakdown for a specific vaccine.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            OpenApiParameter("vaccine_code", OpenApiTypes.STR, required=True),
            OpenApiParameter("start_date", OpenApiTypes.DATE, required=False),
            OpenApiParameter("end_date", OpenApiTypes.DATE, required=False),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
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


# =============================================================================
# Vaccine Stock ViewSets
# =============================================================================


class VaccineStockFilter(django_filters.rest_framework.FilterSet):
    """Filter for vaccine stock."""

    vaccine = django_filters.rest_framework.NumberFilter()
    is_expired = django_filters.rest_framework.BooleanFilter(method="filter_expired")
    is_low_stock = django_filters.rest_framework.BooleanFilter(method="filter_low_stock")
    available = django_filters.rest_framework.BooleanFilter(method="filter_available")

    class Meta:
        model = VaccineStock
        fields = ["vaccine"]

    def filter_expired(self, queryset, name, value):
        from datetime import date

        if value:
            return queryset.filter(expiry_date__lt=date.today())
        return queryset.filter(expiry_date__gte=date.today())

    def filter_low_stock(self, queryset, name, value):
        from django.db.models import F

        if value:
            return queryset.filter(quantity_on_hand__lte=F("min_stock_level"))
        return queryset.filter(quantity_on_hand__gt=F("min_stock_level"))

    def filter_available(self, queryset, name, value):
        """Filter for batches that are usable: not expired and have stock > 0."""
        from datetime import date

        if value:
            return queryset.filter(expiry_date__gte=date.today(), quantity_on_hand__gt=0)
        return queryset


class VaccineStockViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for vaccine stock batch management."""

    queryset = VaccineStock.objects.select_related("vaccine", "received_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VaccineStockFilter
    ordering_fields = ["expiry_date", "quantity_on_hand", "created_at"]
    ordering = ["expiry_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return VaccineStockListSerializer
        if self.action == "receive":
            return StockReceiveSerializer
        if self.action in ("issue", "wastage"):
            return StockIssueSerializer
        return VaccineStockSerializer

    def perform_create(self, serializer):
        tenant_kwargs = self.get_tenant_save_kwargs()
        instance = serializer.save(
            received_by=self.request.user,
            quantity_on_hand=serializer.validated_data["quantity_received"],
            **tenant_kwargs,
        )
        # Create initial RECEIVE transaction
        StockTransaction.objects.create(
            stock=instance,
            transaction_type="RECEIVE",
            quantity=instance.quantity_received,
            balance_after=instance.quantity_on_hand,
            performed_by=self.request.user,
            notes="Initial stock receipt",
        )
        AuditLog.log(
            action="vaccine_stock_receive",
            user=self.request.user,
            resource_type="VaccineStock",
            resource_id=instance.id,
            details={
                "vaccine_id": instance.vaccine_id,
                "batch_number": instance.batch_number,
                "quantity": instance.quantity_received,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        """Issue stock (wastage, adjustment, transfer out, expired)."""
        stock = self.get_object()
        serializer = StockIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        qty = serializer.validated_data["quantity"]
        if qty > stock.quantity_on_hand:
            return Response(
                {"detail": f"Insufficient stock. Only {stock.quantity_on_hand} doses available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stock.quantity_on_hand -= qty
        stock.save(update_fields=["quantity_on_hand"])

        txn = StockTransaction.objects.create(
            stock=stock,
            transaction_type=serializer.validated_data["transaction_type"],
            quantity=-qty,
            balance_after=stock.quantity_on_hand,
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
            notes=serializer.validated_data.get("notes", ""),
        )

        AuditLog.log(
            action="vaccine_stock_issue",
            user=request.user,
            resource_type="VaccineStock",
            resource_id=stock.id,
            details={
                "transaction_type": txn.transaction_type,
                "quantity": qty,
                "balance_after": stock.quantity_on_hand,
            },
            ip_address=get_client_ip(request),
        )

        return Response(VaccineStockSerializer(stock).data)

    @action(detail=True, methods=["get"])
    def transactions(self, request, pk=None):
        """List transactions for a stock batch."""
        stock = self.get_object()
        txns = stock.transactions.select_related("performed_by").all()
        serializer = StockTransactionSerializer(txns, many=True)
        return Response(serializer.data)


# =============================================================================
# Cold Chain ViewSets
# =============================================================================


class ColdChainEquipmentFilter(django_filters.rest_framework.FilterSet):
    """Filter for cold chain equipment."""

    equipment_type = django_filters.rest_framework.CharFilter(lookup_expr="iexact")
    status = django_filters.rest_framework.CharFilter(lookup_expr="iexact")

    class Meta:
        model = ColdChainEquipment
        fields = ["equipment_type", "status"]


class ColdChainEquipmentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for cold chain equipment management."""

    queryset = ColdChainEquipment.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ColdChainEquipmentFilter
    ordering_fields = ["name", "status", "created_at"]
    ordering = ["name"]

    def get_serializer_class(self):
        if self.action == "list":
            return ColdChainEquipmentListSerializer
        return ColdChainEquipmentSerializer

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_tenant_save_kwargs())
        AuditLog.log(
            action="cold_chain_equipment_create",
            user=self.request.user,
            resource_type="ColdChainEquipment",
            resource_id=instance.id,
            details={"name": instance.name, "type": instance.equipment_type},
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["get"])
    def temperatures(self, request, pk=None):
        """List temperature logs for this equipment."""
        equipment = self.get_object()
        logs = equipment.temperature_logs.select_related("recorded_by").all()[:100]
        serializer = TemperatureLogSerializer(logs, many=True)
        return Response(serializer.data)


class TemperatureLogViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for temperature log entries."""

    queryset = TemperatureLog.objects.select_related("equipment", "recorded_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_facility_chain = "equipment__facility"
    tenant_org_chain = "equipment__organization"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["recorded_at", "temperature"]
    ordering = ["-recorded_at"]
    serializer_class = TemperatureLogSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        equipment_id = self.request.query_params.get("equipment")
        excursions_only = self.request.query_params.get("excursions_only")
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        if excursions_only and excursions_only.lower() in ("true", "1"):
            qs = qs.filter(is_excursion=True)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        if instance.is_excursion:
            AuditLog.log(
                action="temperature_excursion",
                user=self.request.user,
                resource_type="TemperatureLog",
                resource_id=instance.id,
                details={
                    "equipment_id": instance.equipment_id,
                    "temperature": str(instance.temperature),
                },
                ip_address=get_client_ip(self.request),
            )


# =============================================================================
# Vaccine Incident ViewSet
# =============================================================================


class VaccineIncidentFilter(django_filters.rest_framework.FilterSet):
    """Filter for vaccine incidents."""

    incident_type = django_filters.rest_framework.CharFilter(lookup_expr="iexact")
    severity = django_filters.rest_framework.CharFilter(lookup_expr="iexact")
    status = django_filters.rest_framework.CharFilter(lookup_expr="iexact")

    class Meta:
        model = VaccineIncident
        fields = ["incident_type", "severity", "status"]


class VaccineIncidentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for vaccine incident reporting."""

    queryset = VaccineIncident.objects.prefetch_related(
        "affected_equipment", "affected_batches"
    ).select_related("reported_by", "investigated_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VaccineIncidentFilter
    ordering_fields = ["occurred_at", "severity", "status", "created_at"]
    ordering = ["-occurred_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return VaccineIncidentListSerializer
        return VaccineIncidentSerializer

    def perform_create(self, serializer):
        instance = serializer.save(reported_by=self.request.user, **self.get_tenant_save_kwargs())
        AuditLog.log(
            action="vaccine_incident_create",
            user=self.request.user,
            resource_type="VaccineIncident",
            resource_id=instance.id,
            details={
                "incident_type": instance.incident_type,
                "severity": instance.severity,
                "doses_affected": instance.doses_affected,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Mark an incident as resolved."""
        incident = self.get_object()
        if incident.status == "RESOLVED" or incident.status == "CLOSED":
            return Response(
                {"detail": "Incident is already resolved/closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone

        incident.status = "RESOLVED"
        incident.resolved_at = timezone.now()
        incident.corrective_actions = request.data.get(
            "corrective_actions", incident.corrective_actions
        )
        incident.preventive_actions = request.data.get(
            "preventive_actions", incident.preventive_actions
        )
        incident.investigated_by = request.user
        if incident.occurred_at:
            delta = incident.resolved_at - incident.occurred_at
            incident.duration_minutes = int(delta.total_seconds() / 60)
        incident.save()

        AuditLog.log(
            action="vaccine_incident_resolve",
            user=request.user,
            resource_type="VaccineIncident",
            resource_id=incident.id,
            details={"duration_minutes": incident.duration_minutes},
            ip_address=get_client_ip(request),
        )

        return Response(VaccineIncidentSerializer(incident).data)
