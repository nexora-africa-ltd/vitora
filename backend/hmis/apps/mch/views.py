"""Views for the MCH module."""

from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.mch.models import (
    AEFI,
    ANCVisit,
    Delivery,
    GrowthMeasurement,
    HEIFollowUp,
    HEIPCRTest,
    ImmunizationRecord,
    MCHRegistration,
    PNCVisit,
    Vaccine,
    VitaminASupplement,
)
from hmis.apps.mch.serializers import (
    AdministerVaccineSerializer,
    AEFIListSerializer,
    AEFISerializer,
    ANCVisitListSerializer,
    ANCVisitSerializer,
    DeliveryListSerializer,
    DeliverySerializer,
    GrowthChartDataSerializer,
    GrowthMeasurementListSerializer,
    GrowthMeasurementSerializer,
    HEIFollowUpSerializer,
    HEIPCRTestSerializer,
    ImmunizationRecordListSerializer,
    ImmunizationRecordSerializer,
    MCHRegistrationCreateSerializer,
    MCHRegistrationListSerializer,
    MCHRegistrationSerializer,
    PNCVisitListSerializer,
    PNCVisitSerializer,
    VaccineSerializer,
    VitaminASupplementSerializer,
)
from hmis.apps.mch.services.immunization import generate_immunization_schedule


# =============================================================================
# Filters
# =============================================================================


class MCHRegistrationFilter(django_filters.FilterSet):
    """Filter for MCH registrations."""

    mother = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    is_high_risk = django_filters.BooleanFilter()
    linda_jamii_beneficiary = django_filters.BooleanFilter()
    registration_from = django_filters.DateFilter(
        field_name="registration_date", lookup_expr="gte"
    )
    registration_to = django_filters.DateFilter(
        field_name="registration_date", lookup_expr="lte"
    )

    class Meta:
        model = MCHRegistration
        fields = ["mother", "status", "is_high_risk", "linda_jamii_beneficiary"]


class ANCVisitFilter(django_filters.FilterSet):
    """Filter for ANC visits."""

    registration = django_filters.NumberFilter()
    visit_number = django_filters.NumberFilter()
    visit_from = django_filters.DateFilter(field_name="visit_date", lookup_expr="gte")
    visit_to = django_filters.DateFilter(field_name="visit_date", lookup_expr="lte")

    class Meta:
        model = ANCVisit
        fields = ["registration", "visit_number"]


class DeliveryFilter(django_filters.FilterSet):
    """Filter for delivery records."""

    registration = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    delivery_from = django_filters.DateFilter(field_name="delivery_date", lookup_expr="gte")
    delivery_to = django_filters.DateFilter(field_name="delivery_date", lookup_expr="lte")

    class Meta:
        model = Delivery
        fields = ["registration", "status", "delivery_type", "delivery_outcome"]


class PNCVisitFilter(django_filters.FilterSet):
    """Filter for PNC visits."""

    registration = django_filters.NumberFilter()
    visit_number = django_filters.NumberFilter()
    visit_from = django_filters.DateFilter(field_name="visit_date", lookup_expr="gte")
    visit_to = django_filters.DateFilter(field_name="visit_date", lookup_expr="lte")

    class Meta:
        model = PNCVisit
        fields = ["registration", "visit_number"]


class GrowthMeasurementFilter(django_filters.FilterSet):
    """Filter for growth measurements."""

    patient = django_filters.NumberFilter()
    muac_classification = django_filters.CharFilter(lookup_expr="iexact")
    measurement_from = django_filters.DateFilter(
        field_name="measurement_date", lookup_expr="gte"
    )
    measurement_to = django_filters.DateFilter(
        field_name="measurement_date", lookup_expr="lte"
    )

    class Meta:
        model = GrowthMeasurement
        fields = ["patient", "muac_classification"]


class ImmunizationRecordFilter(django_filters.FilterSet):
    """Filter for immunization records."""

    patient = django_filters.NumberFilter()
    vaccine = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = ImmunizationRecord
        fields = ["patient", "vaccine", "status"]


class AEFIFilter(django_filters.FilterSet):
    """Filter for AEFI reports."""

    event_type = django_filters.CharFilter(lookup_expr="iexact")
    severity = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = AEFI
        fields = ["event_type", "severity"]


class HEIFollowUpFilter(django_filters.FilterSet):
    """Filter for HEI follow-ups."""

    infant = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = HEIFollowUp
        fields = ["infant", "status"]


# =============================================================================
# ViewSets
# =============================================================================


class MCHRegistrationViewSet(viewsets.ModelViewSet):
    """ViewSet for MCH registrations."""

    queryset = MCHRegistration.objects.select_related(
        "mother",
        "anc_enrollment",
        "baby",
        "registered_by",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = MCHRegistrationFilter
    search_fields = [
        "mch_number",
        "mother__first_name",
        "mother__last_name",
        "mother__mrn",
    ]
    ordering_fields = ["registration_date", "created_at", "status"]
    ordering = ["-registration_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return MCHRegistrationListSerializer
        if self.action == "create":
            return MCHRegistrationCreateSerializer
        return MCHRegistrationSerializer

    def perform_create(self, serializer):
        serializer.save(registered_by=self.request.user)


class ANCVisitViewSet(viewsets.ModelViewSet):
    """ViewSet for ANC visits."""

    queryset = ANCVisit.objects.select_related("registration")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ANCVisitFilter
    ordering_fields = ["visit_date", "visit_number"]
    ordering = ["-visit_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return ANCVisitListSerializer
        return ANCVisitSerializer


class DeliveryViewSet(viewsets.ModelViewSet):
    """ViewSet for delivery records."""

    queryset = Delivery.objects.select_related("registration", "delivered_by", "baby_patient")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = DeliveryFilter
    ordering_fields = ["delivery_date", "created_at", "status"]
    ordering = ["-delivery_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return DeliveryListSerializer
        return DeliverySerializer


class PNCVisitViewSet(viewsets.ModelViewSet):
    """ViewSet for PNC visits."""

    queryset = PNCVisit.objects.select_related("registration")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = PNCVisitFilter
    ordering_fields = ["visit_date", "visit_number"]
    ordering = ["-visit_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return PNCVisitListSerializer
        return PNCVisitSerializer


class GrowthMeasurementViewSet(viewsets.ModelViewSet):
    """ViewSet for growth measurements."""

    queryset = GrowthMeasurement.objects.select_related("patient", "measured_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = GrowthMeasurementFilter
    ordering_fields = ["measurement_date", "created_at"]
    ordering = ["-measurement_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return GrowthMeasurementListSerializer
        return GrowthMeasurementSerializer

    @action(detail=False, methods=["get"], url_path="chart-data")
    def chart_data(self, request):
        """Return growth chart data for a patient."""
        patient_id = request.query_params.get("patient")
        chart_type = request.query_params.get("chart_type", "weight_for_age")
        sex = request.query_params.get("sex")

        measurements = self.get_queryset()
        if patient_id:
            measurements = measurements.filter(patient_id=patient_id)

        serializer = GrowthMeasurementListSerializer(measurements, many=True)

        percentile_lines = {}
        if sex:
            try:
                from hmis.apps.mch.services.growth import WHOGrowthCalculator

                calculator = WHOGrowthCalculator()
                indicator_map = {
                    "weight_for_age": ("wfa", "age_days"),
                    "height_for_age": ("lhfa", "age_days"),
                    "bmi_for_age": ("bfa", "age_days"),
                    "head_circumference_for_age": ("hcfa", "age_days"),
                }

                if chart_type in indicator_map:
                    indicator, target_key = indicator_map[chart_type]
                    data = calculator._load_data(
                        calculator._get_sex_filename(indicator, sex)
                    )
                    percentile_lines = calculator.get_percentile_lines(data, target_key)
                elif chart_type == "weight_for_height":
                    # Prefer weight-for-length if data exists, else weight-for-height.
                    sex_label = "boys" if sex.upper() == "M" else "girls"
                    data = calculator._load_data(f"wfl_{sex_label}.json")
                    target_key = "length"
                    if not data:
                        data = calculator._load_data(f"wfh_{sex_label}.json")
                        target_key = "height"
                    if data:
                        percentile_lines = calculator.get_percentile_lines(data, target_key)
            except Exception:
                percentile_lines = {}

        payload = {
            "measurements": serializer.data,
            "percentile_lines": percentile_lines,
            "chart_type": chart_type,
            "sex": sex or "",
        }
        return Response(GrowthChartDataSerializer(payload).data)


class VaccineViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for vaccine reference data."""

    queryset = Vaccine.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]
    serializer_class = VaccineSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["standard_age_days", "code"]
    ordering = ["standard_age_days", "code"]


class ImmunizationRecordViewSet(viewsets.ModelViewSet):
    """ViewSet for immunization records."""

    queryset = ImmunizationRecord.objects.select_related("patient", "vaccine", "administered_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ImmunizationRecordFilter
    ordering_fields = ["scheduled_date", "created_at", "status"]
    ordering = ["scheduled_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return ImmunizationRecordListSerializer
        if self.action == "administer":
            return AdministerVaccineSerializer
        return ImmunizationRecordSerializer

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

        return Response(ImmunizationRecordSerializer(record).data)

    @action(detail=False, methods=["post"], url_path="generate-schedule")
    def generate_schedule(self, request):
        """Generate immunization schedule for a patient."""
        patient_id = request.data.get("patient")
        if not patient_id:
            return Response({"detail": "patient is required"}, status=status.HTTP_400_BAD_REQUEST)

        from hmis.apps.patients.models import Patient

        patient = Patient.objects.filter(id=patient_id).first()
        if not patient:
            return Response({"detail": "patient not found"}, status=status.HTTP_404_NOT_FOUND)

        records = generate_immunization_schedule(patient)
        serializer = ImmunizationRecordListSerializer(records, many=True)
        return Response(serializer.data)


class VitaminASupplementViewSet(viewsets.ModelViewSet):
    """ViewSet for Vitamin A supplements."""

    queryset = VitaminASupplement.objects.select_related("patient", "administered_by")
    permission_classes = [IsAuthenticated]
    serializer_class = VitaminASupplementSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["administered_date", "created_at"]
    ordering = ["-administered_date"]


class AEFIViewSet(viewsets.ModelViewSet):
    """ViewSet for AEFI reporting."""

    queryset = AEFI.objects.select_related("immunization_record", "investigated_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = AEFIFilter
    ordering_fields = ["event_date", "created_at"]
    ordering = ["-event_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return AEFIListSerializer
        return AEFISerializer


class HEIFollowUpViewSet(viewsets.ModelViewSet):
    """ViewSet for HEI follow-up records."""

    queryset = HEIFollowUp.objects.select_related("infant", "mch_registration", "enrolled_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = HEIFollowUpFilter
    ordering_fields = ["enrollment_date", "created_at", "status"]
    ordering = ["-enrollment_date"]
    serializer_class = HEIFollowUpSerializer

    def perform_create(self, serializer):
        serializer.save(enrolled_by=self.request.user)


class HEIPCRTestViewSet(viewsets.ModelViewSet):
    """ViewSet for HEI PCR tests."""

    queryset = HEIPCRTest.objects.select_related("hei_followup")
    permission_classes = [IsAuthenticated]
    serializer_class = HEIPCRTestSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["scheduled_date", "actual_date", "created_at"]
    ordering = ["-scheduled_date"]
