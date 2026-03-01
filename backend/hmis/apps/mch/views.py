"""Views for the MCH module."""

from django.db import models
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
    HEIFollowUpListSerializer,
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


class VitaminASupplementFilter(django_filters.FilterSet):
    """Filter for Vitamin A supplements."""

    patient = django_filters.NumberFilter()

    class Meta:
        model = VitaminASupplement
        fields = ["patient"]


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

    def create(self, request, *args, **kwargs):
        """Override create to return full serializer response (not the write-only create serializer)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Re-serialize with the full detail serializer
        instance = serializer.instance
        # Re-fetch with select_related to ensure computed fields work
        instance = self.get_queryset().annotate(
            anc_visit_count=models.Count("anc_visits", distinct=True),
            pnc_visit_count=models.Count("pnc_visits", distinct=True),
        ).get(pk=instance.pk)
        output_serializer = MCHRegistrationSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def route_to_anc(self, request, pk=None):
        """
        Route mother to ANC clinic queue.

        Creates a ClinicVisit for the mother in an ANC clinic.
        Optionally accepts `clinic_id` in request data to specify which ANC clinic.
        """
        registration = self.get_object()
        clinic_id = request.data.get("clinic_id")
        notes = request.data.get("notes", "")

        try:
            from datetime import date as dt_date
            from datetime import timedelta

            from django.utils import timezone

            from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit

            # Find ANC clinic
            if clinic_id:
                clinic = Clinic.objects.filter(
                    id=clinic_id,
                    clinic_type="ANC",
                    status="ACTIVE",
                ).first()
                if not clinic:
                    return Response(
                        {"detail": f"ANC clinic with ID {clinic_id} not found or inactive."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                clinic = Clinic.objects.filter(
                    clinic_type="ANC",
                    status="ACTIVE",
                ).first()
                if not clinic:
                    return Response(
                        {"detail": "No active ANC clinic found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

            # Get or create today's session
            today = dt_date.today()
            session = ClinicSession.objects.filter(
                clinic=clinic,
                session_date=today,
            ).first()

            if not session:
                # Create a default session for today
                session = ClinicSession.objects.create(
                    clinic=clinic,
                    session_date=today,
                    status="OPEN",
                    opened_at=timezone.now(),
                )

            # Get next queue number
            max_queue = ClinicVisit.objects.filter(session=session).aggregate(
                max_q=models.Max("queue_number")
            )["max_q"] or 0

            # Create clinic visit
            visit = ClinicVisit.objects.create(
                session=session,
                patient=registration.mother,
                queue_number=max_queue + 1,
                status="REGISTERED",
                priority="STANDARD",
                visit_type="SCHEDULED" if registration.anc_enrollment else "NEW",
                source="DIRECT",
                chief_complaint=f"ANC visit - MCH: {registration.mch_number}",
                notes=notes,
            )

            return Response({
                "message": "Mother routed to ANC queue successfully.",
                "clinic_visit_id": visit.id,
                "queue_number": visit.queue_number,
                "clinic": clinic.name,
                "session_id": session.id,
            })

        except Exception as exc:
            return Response(
                {"detail": f"Failed to route to ANC: {exc!s}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def transition_status(self, request, pk=None):
        """
        Transition MCH registration to a new status.

        Validates against STATUS_TRANSITIONS state machine on the model.
        Accepts: { "status": "DELIVERED" }
        """
        registration = self.get_object()
        new_status = request.data.get("status")

        if not new_status:
            return Response(
                {"detail": "status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_choices = [c[0] for c in MCHRegistration.STATUS_CHOICES]
        if new_status not in valid_choices:
            return Response(
                {"detail": f"Invalid status. Must be one of: {valid_choices}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_transitions = MCHRegistration.STATUS_TRANSITIONS.get(registration.status, [])
        if new_status not in allowed_transitions:
            return Response(
                {
                    "detail": f"Cannot transition from '{registration.status}' to '{new_status}'. "
                    f"Allowed transitions: {allowed_transitions}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = registration.status
        registration.status = new_status

        # Set completed_at when transitioning to COMPLETED
        if new_status == "COMPLETED":
            from django.utils import timezone
            registration.completed_at = timezone.now()

        registration.save(update_fields=["status", "completed_at"] if new_status == "COMPLETED" else ["status"])

        # Re-fetch with annotations
        instance = self.get_queryset().annotate(
            anc_visit_count=models.Count("anc_visits", distinct=True),
            pnc_visit_count=models.Count("pnc_visits", distinct=True),
        ).get(pk=registration.pk)

        return Response(MCHRegistrationSerializer(instance).data)


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

    @action(detail=False, methods=["get"], url_path="export-pdf")
    def export_pdf(self, request):
        """
        Export growth chart as PDF for a patient.

        Query parameters:
            - patient: Required. Patient ID to export growth chart for.
        """
        from django.http import HttpResponse

        patient_id = request.query_params.get("patient")
        if not patient_id:
            return Response(
                {"detail": "patient query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.patients.models import Patient

        patient = Patient.objects.filter(id=patient_id).first()
        if not patient:
            return Response(
                {"detail": "Patient not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from hmis.apps.mch.services.pdf_export import generate_growth_chart_pdf

            pdf_bytes = generate_growth_chart_pdf(patient)

            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="growth_chart_{patient.mrn}.pdf"'
            return response

        except Exception as exc:
            return Response(
                {"detail": f"Failed to generate PDF: {exc!s}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class VaccineViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for vaccine reference data."""

    queryset = Vaccine.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]
    serializer_class = VaccineSerializer
    pagination_class = None  # Small reference dataset, return flat array
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

    @action(detail=True, methods=["post"], url_path="report-aefi")
    def report_aefi(self, request, pk=None):
        """
        Report an AEFI (Adverse Event Following Immunization) for this immunization.

        Required fields:
            - event_date: Date the adverse event occurred
            - event_type: LOCAL_REACTION, SYSTEMIC_REACTION, SEVERE, or DEATH
            - description: Description of the event

        Optional fields:
            - severity: MILD, MODERATE, or SEVERE
            - outcome: RECOVERED, RECOVERING, NOT_RECOVERED, SEQUELAE, or DEATH
            - notes: Additional notes
        """
        record = self.get_object()

        # Validate that the vaccine was administered
        if record.status != "ADMINISTERED":
            return Response(
                {"detail": "AEFI can only be reported for administered vaccines."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract and validate required fields
        event_date = request.data.get("event_date")
        event_type = request.data.get("event_type")
        description = request.data.get("description")

        if not event_date or not event_type or not description:
            return Response(
                {"detail": "event_date, event_type, and description are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate event_type
        valid_event_types = [choice[0] for choice in AEFI.EVENT_TYPE_CHOICES]
        if event_type not in valid_event_types:
            return Response(
                {"detail": f"Invalid event_type. Must be one of: {valid_event_types}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create AEFI record
        aefi = AEFI.objects.create(
            immunization_record=record,
            event_date=event_date,
            event_type=event_type,
            description=description,
            severity=request.data.get("severity", "MILD"),
            outcome=request.data.get("outcome", "UNKNOWN"),
            investigation_notes=request.data.get("notes", ""),
        )

        return Response(
            AEFISerializer(aefi).data,
            status=status.HTTP_201_CREATED,
        )


class VitaminASupplementViewSet(viewsets.ModelViewSet):
    """ViewSet for Vitamin A supplements."""

    queryset = VitaminASupplement.objects.select_related("patient", "administered_by")
    permission_classes = [IsAuthenticated]
    serializer_class = VitaminASupplementSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VitaminASupplementFilter
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

    def get_serializer_class(self):
        if self.action == "list":
            return HEIFollowUpListSerializer
        return HEIFollowUpSerializer

    def perform_create(self, serializer):
        serializer.save(enrolled_by=self.request.user)

    @action(detail=True, methods=["post"])
    def determine_final_status(self, request, pk=None):
        """
        Determine final HIV status based on PCR test results.

        Business rules:
        - If any PCR test is POSITIVE → CONFIRMED_POSITIVE
        - If all scheduled PCR tests (at least 2) are NEGATIVE → CONFIRMED_NEGATIVE
        - If tests are still PENDING or insufficient → remains ACTIVE

        When confirmed positive, auto-enrollment to CCC is triggered via signal.
        """
        hei = self.get_object()

        if hei.status != "ACTIVE":
            return Response(
                {"detail": f"Cannot determine status: HEI is already {hei.get_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pcr_tests = hei.pcr_tests.all()

        if not pcr_tests.exists():
            return Response(
                {"detail": "No PCR tests recorded. Cannot determine final status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check for positive results
        positive_tests = pcr_tests.filter(result="POSITIVE")
        if positive_tests.exists():
            hei.status = "CONFIRMED_POSITIVE"
            hei.save(update_fields=["status"])
            return Response({
                "status": "CONFIRMED_POSITIVE",
                "message": "Infant confirmed HIV-positive. CCC enrollment may be auto-created.",
                "positive_test_number": positive_tests.first().test_number,
            })

        # Check if sufficient negative results
        negative_tests = pcr_tests.filter(result="NEGATIVE")
        pending_tests = pcr_tests.filter(result="PENDING")

        # Kenya protocol: need at least 2 negative PCR tests to confirm negative
        # (one at 6 weeks, one at 9 months or after cessation of breastfeeding)
        if negative_tests.count() >= 2 and pending_tests.count() == 0:
            hei.status = "CONFIRMED_NEGATIVE"
            hei.save(update_fields=["status"])
            return Response({
                "status": "CONFIRMED_NEGATIVE",
                "message": "Infant confirmed HIV-negative after 2+ negative PCR tests.",
                "negative_test_count": negative_tests.count(),
            })

        # Still pending determination
        return Response({
            "status": "ACTIVE",
            "message": "Insufficient results to determine final status.",
            "negative_tests": negative_tests.count(),
            "pending_tests": pending_tests.count(),
            "required_negative_tests": 2,
        })

    @action(detail=True, methods=["post"])
    def update_feeding(self, request, pk=None):
        """Update infant's breastfeeding status."""
        hei = self.get_object()
        new_status = request.data.get("breastfeeding_status")

        valid_statuses = [choice[0] for choice in HEIFollowUp.BREASTFEEDING_STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response(
                {"detail": f"Invalid breastfeeding_status. Must be one of: {valid_statuses}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hei.breastfeeding_status = new_status
        hei.save(update_fields=["breastfeeding_status"])

        return Response({
            "hei_number": hei.hei_number,
            "breastfeeding_status": new_status,
            "message": f"Breastfeeding status updated to {hei.get_breastfeeding_status_display()}",
        })


class HEIPCRTestViewSet(viewsets.ModelViewSet):
    """ViewSet for HEI PCR tests."""

    queryset = HEIPCRTest.objects.select_related("hei_followup")
    permission_classes = [IsAuthenticated]
    serializer_class = HEIPCRTestSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["scheduled_date", "actual_date", "created_at"]
    ordering = ["-scheduled_date"]
