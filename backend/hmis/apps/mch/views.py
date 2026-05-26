"""Views for the MCH module."""

from django.db import models
from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import WriteRequiresRolePermission, get_client_ip

# Immunization models now come from the unified immunizations app
from hmis.apps.immunizations.models import AEFI as ImmunizationsAEFI
from hmis.apps.immunizations.models import ImmunizationRecord as ImmunizationsImmunizationRecord
from hmis.apps.immunizations.models import VaccineDefinition

# MCH immunization serializers now delegate to the immunizations app
from hmis.apps.immunizations.serializers import (
    AdministerVaccineSerializer as ImmAdministerVaccineSerializer,
)
from hmis.apps.immunizations.serializers import AEFIListSerializer as ImmAEFIListSerializer
from hmis.apps.immunizations.serializers import AEFISerializer as ImmAEFISerializer
from hmis.apps.immunizations.serializers import (
    ImmunizationRecordListSerializer as ImmRecordListSerializer,
)
from hmis.apps.immunizations.serializers import ImmunizationRecordSerializer as ImmRecordSerializer
from hmis.apps.immunizations.serializers import VaccineDefinitionSerializer as ImmVaccineSerializer
from hmis.apps.immunizations.services.schedule import generate_kepi_schedule
from hmis.apps.mch.models import (
    ANCVisit,
    CommunityScreening,
    Delivery,
    GrowthMeasurement,
    HEIFollowUp,
    HEIPCRTest,
    LabourPartograph,
    LabourPartographObservation,
    MCHRegistration,
    PNCVisit,
    VitaminASupplement,
)
from hmis.apps.mch.serializers import (
    ANCVisitListSerializer,
    ANCVisitSerializer,
    CommunityScreeningListSerializer,
    CommunityScreeningSerializer,
    DeliveryListSerializer,
    DeliverySerializer,
    GrowthChartDataSerializer,
    GrowthMeasurementListSerializer,
    GrowthMeasurementSerializer,
    HEIFollowUpListSerializer,
    HEIFollowUpSerializer,
    HEIPCRTestSerializer,
    LabourPartographObservationSerializer,
    LabourPartographSerializer,
    MCHRegistrationCreateSerializer,
    MCHRegistrationListSerializer,
    MCHRegistrationSerializer,
    PNCVisitListSerializer,
    PNCVisitSerializer,
    PregnancyHistorySerializer,
    VitaminASupplementSerializer,
)
from hmis.apps.mch.services.clinic_unification import (
    finalize_program_attendance_from_clinic_visit,
    link_or_create_clinic_visit_for_mch_visit,
)

# =============================================================================
# Filters
# =============================================================================


class MCHRegistrationFilter(django_filters.FilterSet):
    """Filter for MCH registrations."""

    mother = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    is_high_risk = django_filters.BooleanFilter()
    linda_jamii_beneficiary = django_filters.BooleanFilter()
    registration_from = django_filters.DateFilter(field_name="registration_date", lookup_expr="gte")
    registration_to = django_filters.DateFilter(field_name="registration_date", lookup_expr="lte")

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


class CommunityScreeningFilter(django_filters.FilterSet):
    """Filter for community screening records with delta sync support."""

    patient = django_filters.NumberFilter()
    screening_type = django_filters.CharFilter(lookup_expr="iexact")
    modified_after = django_filters.IsoDateTimeFilter(
        field_name="updated_at",
        lookup_expr="gte",
        help_text="Return screenings modified at or after this ISO 8601 timestamp.",
    )

    class Meta:
        model = CommunityScreening
        fields = ["patient", "screening_type", "modified_after"]


class DeliveryFilter(django_filters.FilterSet):
    """Filter for delivery records."""

    registration = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    delivery_from = django_filters.DateFilter(field_name="delivery_date", lookup_expr="gte")
    delivery_to = django_filters.DateFilter(field_name="delivery_date", lookup_expr="lte")

    class Meta:
        model = Delivery
        fields = ["registration", "status", "delivery_type", "delivery_outcome"]


class LabourPartographFilter(django_filters.FilterSet):
    """Filter for labour partographs."""

    registration = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = LabourPartograph
        fields = ["registration", "status"]


class LabourPartographObservationFilter(django_filters.FilterSet):
    """Filter for labour partograph observations."""

    partograph = django_filters.NumberFilter()

    class Meta:
        model = LabourPartographObservation
        fields = ["partograph"]


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
    measurement_from = django_filters.DateFilter(field_name="measurement_date", lookup_expr="gte")
    measurement_to = django_filters.DateFilter(field_name="measurement_date", lookup_expr="lte")

    class Meta:
        model = GrowthMeasurement
        fields = ["patient", "muac_classification"]


class ImmunizationRecordFilter(django_filters.FilterSet):
    """Filter for immunization records (unified immunizations app)."""

    patient = django_filters.NumberFilter()
    vaccine = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = ImmunizationsImmunizationRecord
        fields = ["patient", "vaccine", "status"]


class AEFIFilter(django_filters.FilterSet):
    """Filter for AEFI reports (unified immunizations app)."""

    event_type = django_filters.CharFilter(lookup_expr="iexact")
    severity = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = ImmunizationsAEFI
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


class MCHRegistrationViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for MCH registrations."""

    queryset = MCHRegistration.objects.select_related(
        "mother",
        "anc_enrollment",
        "baby",
        "registered_by",
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
        instance = serializer.save(registered_by=self.request.user)
        AuditLog.log(
            action="mch_registration_create",
            user=self.request.user,
            resource_type="MCHRegistration",
            resource_id=instance.id,
            details={"mch_number": instance.mch_number, "mother_id": instance.mother_id},
            ip_address=get_client_ip(self.request),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="mch_registration_update",
            user=self.request.user,
            resource_type="MCHRegistration",
            resource_id=instance.id,
            details={"mch_number": instance.mch_number, "status": instance.status},
            ip_address=get_client_ip(self.request),
        )

    def create(self, request, *args, **kwargs):
        """Override create to return full serializer response (not the write-only create serializer)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Re-serialize with the full detail serializer
        instance = serializer.instance
        # Re-fetch with select_related to ensure computed fields work
        # Note: skip annotate here — the model already has anc_visit_count/pnc_visit_count
        # properties. Annotating would clash with the property setters.
        instance = self.get_queryset().get(pk=instance.pk)
        output_serializer = MCHRegistrationSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def _route_to_clinic(self, registration, clinic_type: str, clinic_id=None, notes: str = ""):
        """Route an MCH registration into a clinic queue."""
        if clinic_id:
            clinic = Clinic.objects.filter(
                id=clinic_id,
                clinic_type=clinic_type,
                status="ACTIVE",
            ).first()
            if not clinic:
                return Response(
                    {"detail": f"{clinic_type} clinic with ID {clinic_id} not found or inactive."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            clinic = Clinic.objects.filter(
                clinic_type=clinic_type,
                status="ACTIVE",
            ).first()
            if not clinic:
                return Response(
                    {"detail": f"No active {clinic_type} clinic found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        session = ClinicSession.objects.filter(
            clinic=clinic,
            session_date=registration.registration_date,
        ).first()
        if not session:
            from django.utils import timezone

            session = ClinicSession.objects.create(
                clinic=clinic,
                session_date=registration.registration_date,
                status="OPEN",
                opened_at=timezone.now(),
            )

        max_queue = (
            ClinicVisit.objects.filter(session=session).aggregate(max_q=models.Max("queue_number"))[
                "max_q"
            ]
            or 0
        )

        visit = ClinicVisit.objects.create(
            session=session,
            patient=registration.mother,
            queue_number=max_queue + 1,
            status="REGISTERED",
            priority="STANDARD",
            visit_type="FOLLOW_UP" if clinic_type == "PNC" else "SCHEDULED",
            source="DIRECT",
            source_module=f"MCH_{clinic_type}",
            source_record_id=registration.id,
            registered_by=self.request.user,
            chief_complaint=notes or f"{clinic_type} visit - MCH: {registration.mch_number}",
            notes=notes,
        )

        return Response(
            {
                "message": f"Mother routed to {clinic_type} queue successfully.",
                "clinic_visit_id": visit.id,
                "queue_number": visit.queue_number,
                "clinic": clinic.name,
                "session_id": session.id,
            }
        )

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
        return self._route_to_clinic(registration, "ANC", clinic_id=clinic_id, notes=notes)

    @action(detail=True, methods=["post"])
    def route_to_pnc(self, request, pk=None):
        """Route mother to PNC clinic queue."""
        registration = self.get_object()
        clinic_id = request.data.get("clinic_id")
        notes = request.data.get("notes", "")
        return self._route_to_clinic(registration, "PNC", clinic_id=clinic_id, notes=notes)

    @action(detail=True, methods=["post"])
    def schedule_anc_visit(self, request, pk=None):
        """
        Schedule a future ANC visit for this MCH registration.

        Creates a scheduling Appointment for the mother on the given date.
        Accepts: { "date": "2026-03-15", "notes": "..." }
        """
        registration = self.get_object()
        visit_date_str = request.data.get("date")
        notes = request.data.get("notes", "")

        if not visit_date_str:
            return Response(
                {"detail": "date is required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from datetime import date as dt_date
            from datetime import datetime, time, timedelta

            visit_date = dt_date.fromisoformat(visit_date_str)
        except ValueError:
            return Response(
                {"detail": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from datetime import date as dt_date

        if visit_date <= dt_date.today():
            return Response(
                {
                    "detail": "Scheduled date must be in the future. Use 'Send to ANC Queue' for today's visit."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from datetime import datetime, time, timedelta

            from hmis.apps.scheduling.models import Appointment, Resource

            patient = registration.mother

            # Check for existing appointment on same date
            existing = Appointment.objects.filter(
                patient=patient,
                scheduled_start__date=visit_date,
                appointment_type="FOLLOW_UP",
                status__in=["CREATED", "CONFIRMED"],
            ).exists()

            if existing:
                return Response(
                    {"detail": f"An ANC appointment already exists for {visit_date_str}."},
                    status=status.HTTP_409_CONFLICT,
                )

            # Find ANC resource
            resource = Resource.objects.filter(
                resource_type="PLACE",
                is_active=True,
                code__icontains="ANC",
            ).first()

            if not resource:
                resource = Resource.objects.filter(
                    resource_type="PLACE",
                    is_active=True,
                ).first()

            if not resource:
                return Response(
                    {
                        "detail": "No scheduling resource found. Please configure an ANC resource first."
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            import zoneinfo

            tz = zoneinfo.ZoneInfo("Africa/Nairobi")
            start_dt = datetime.combine(visit_date, time(8, 0), tzinfo=tz)
            end_dt = start_dt + timedelta(minutes=30)

            appointment = Appointment(
                patient=patient,
                resource=resource,
                appointment_type="FOLLOW_UP",
                scheduled_start=start_dt,
                scheduled_end=end_dt,
                reason=f"ANC visit - MCH: {registration.mch_number}",
                notes=notes or f"Scheduled from MCH registration {registration.mch_number}",
                priority="URGENT" if registration.is_high_risk else "ROUTINE",
            )
            appointment.save()

            return Response(
                {
                    "message": f"ANC visit scheduled for {visit_date_str}.",
                    "appointment_id": appointment.id,
                    "appointment_number": appointment.appointment_number,
                    "scheduled_date": visit_date_str,
                    "resource": resource.name,
                }
            )

        except Exception as exc:
            return Response(
                {"detail": f"Failed to schedule ANC visit: {exc!s}"},
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

        registration.status = new_status

        # Set completed_at when transitioning to COMPLETED
        if new_status == "COMPLETED":
            from django.utils import timezone

            registration.completed_at = timezone.now()

        registration.save(
            update_fields=["status", "completed_at"] if new_status == "COMPLETED" else ["status"]
        )

        # Re-fetch instance (model properties provide anc_visit_count/pnc_visit_count)
        instance = self.get_queryset().get(pk=registration.pk)

        return Response(MCHRegistrationSerializer(instance).data)

    @action(detail=True, methods=["get"])
    def pregnancy_history(self, request, pk=None):
        """
        Get all past pregnancies for the same mother.

        Returns a list of previous MCH registrations (excluding the current one)
        ordered by registration_date desc. Useful for multi-gravida visibility.
        """
        registration = self.get_object()
        previous = (
            MCHRegistration.objects.filter(
                mother=registration.mother,
            )
            .exclude(pk=registration.pk)
            .select_related("mother")
            .order_by("-registration_date")
        )

        serializer = PregnancyHistorySerializer(previous, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def suggested_obstetric_history(self, request):
        """
        Get auto-calculated gravida/parity for a mother.

        Query param: mother={patient_id}
        Returns suggested gravida, parity, and count of previous pregnancies.
        """
        mother_id = request.query_params.get("mother")
        if not mother_id:
            return Response(
                {"detail": "mother query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            mother_id = int(mother_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": "mother must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = MCHRegistration.suggested_obstetric_history(mother_id)
        return Response(result)


class ANCVisitViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for ANC visits."""

    tenant_facility_chain = "registration__facility"
    tenant_org_chain = "registration__organization"

    queryset = ANCVisit.objects.select_related("registration", "clinic_visit", "conducted_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ANCVisitFilter
    ordering_fields = ["visit_date", "visit_number"]
    ordering = ["-visit_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return ANCVisitListSerializer
        return ANCVisitSerializer

    def perform_create(self, serializer):
        conducted_by = serializer.validated_data.get("conducted_by") or self.request.user
        instance = serializer.save(conducted_by=conducted_by)
        link_or_create_clinic_visit_for_mch_visit(instance, user=self.request.user)
        finalize_program_attendance_from_clinic_visit(instance)
        AuditLog.log(
            action="anc_visit_create",
            user=self.request.user,
            resource_type="ANCVisit",
            resource_id=instance.id,
            details={
                "registration_id": instance.registration_id,
                "visit_number": instance.visit_number,
            },
            ip_address=get_client_ip(self.request),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        link_or_create_clinic_visit_for_mch_visit(instance, user=self.request.user)
        finalize_program_attendance_from_clinic_visit(instance)
        AuditLog.log(
            action="anc_visit_update",
            user=self.request.user,
            resource_type="ANCVisit",
            resource_id=instance.id,
            details={
                "registration_id": instance.registration_id,
                "visit_number": instance.visit_number,
            },
            ip_address=get_client_ip(self.request),
        )


class CommunityScreeningViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for CHW community screening records."""

    tenant_facility_chain = ""
    tenant_org_chain = "patient__organization"

    queryset = CommunityScreening.objects.select_related("patient", "captured_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = CommunityScreeningFilter
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "patient_name_snapshot",
        "patient_mrn_snapshot",
        "chu_name",
        "territory",
    ]
    ordering_fields = ["screening_date", "created_at", "updated_at"]
    ordering = ["-screening_date", "-created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return CommunityScreeningListSerializer
        return CommunityScreeningSerializer

    def perform_create(self, serializer):
        instance = serializer.save(captured_by=self.request.user)
        AuditLog.log(
            action="community_screening_create",
            user=self.request.user,
            resource_type="CommunityScreening",
            resource_id=instance.id,
            patient_id=instance.patient_id,
            details={
                "screening_type": instance.screening_type,
                "chu_name": instance.chu_name,
                "territory": instance.territory,
            },
            ip_address=get_client_ip(self.request),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="community_screening_update",
            user=self.request.user,
            resource_type="CommunityScreening",
            resource_id=instance.id,
            patient_id=instance.patient_id,
            details={"screening_type": instance.screening_type},
            ip_address=get_client_ip(self.request),
        )


class DeliveryViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for delivery records."""

    tenant_facility_chain = "registration__facility"
    tenant_org_chain = "registration__organization"

    queryset = Delivery.objects.select_related(
        "registration",
        "registration__mother",
        "delivered_by",
        "baby_patient",
        "admission",
        "partograph",
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = DeliveryFilter
    search_fields = [
        "registration__mch_number",
        "registration__mother__first_name",
        "registration__mother__last_name",
        "registration__mother__mrn",
    ]
    ordering_fields = ["delivery_date", "created_at", "status"]
    ordering = ["-delivery_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return DeliveryListSerializer
        return DeliverySerializer

    def perform_create(self, serializer):
        instance = serializer.save(delivered_by=self.request.user)
        AuditLog.log(
            action="delivery_create",
            user=self.request.user,
            resource_type="Delivery",
            resource_id=instance.id,
            details={
                "registration_id": instance.registration_id,
                "delivery_type": instance.delivery_type,
                "delivery_outcome": instance.delivery_outcome,
            },
            ip_address=get_client_ip(self.request),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="delivery_update",
            user=self.request.user,
            resource_type="Delivery",
            resource_id=instance.id,
            details={
                "registration_id": instance.registration_id,
                "status": instance.status,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """
        Delivery dashboard stats.

        Returns aggregated statistics for the delivery dashboard including:
        - Summary counts (total, this month, today, live birth rate, CS rate)
        - Upcoming EDDs (active MCH registrations sorted by EDD proximity)
        - Delivery outcome breakdown
        - Delivery type breakdown
        - High-risk pregnancies nearing term
        """
        from datetime import date as dt_date
        from datetime import timedelta

        from django.db.models import Count, Q
        from django.db.models.functions import TruncMonth

        today = dt_date.today()
        month_start = today.replace(day=1)

        # --- Delivery stats ---
        total_deliveries = Delivery.objects.count()
        this_month = Delivery.objects.filter(delivery_date__gte=month_start).count()
        today_count = Delivery.objects.filter(delivery_date=today).count()

        # Outcome breakdown
        outcomes = dict(
            Delivery.objects.values_list("delivery_outcome")
            .annotate(count=Count("id"))
            .values_list("delivery_outcome", "count")
        )
        live_births = outcomes.get("LIVE_BIRTH", 0)
        live_birth_rate = round(live_births / total_deliveries * 100, 1) if total_deliveries else 0

        # Type breakdown
        types = dict(
            Delivery.objects.values_list("delivery_type")
            .annotate(count=Count("id"))
            .values_list("delivery_type", "count")
        )
        cs_count = types.get("ELECTIVE_CS", 0) + types.get("EMERGENCY_CS", 0)
        cs_rate = round(cs_count / total_deliveries * 100, 1) if total_deliveries else 0

        # Place of delivery breakdown
        places = dict(
            Delivery.objects.values_list("place_of_delivery")
            .annotate(count=Count("id"))
            .values_list("place_of_delivery", "count")
        )

        # Complications stats
        with_complications = Delivery.objects.filter(
            Q(maternal_complications__gt="") | Q(neonatal_complications__gt="")
        ).count()

        # --- Upcoming EDDs (active registrations with EDD data) ---

        active_registrations = (
            MCHRegistration.objects.filter(status="ACTIVE")
            .select_related("mother", "anc_enrollment")
            .order_by("anc_enrollment__edd")
        )

        upcoming_deliveries = []
        overdue_count = 0
        due_7_days = 0
        due_14_days = 0
        due_30_days = 0

        for reg in active_registrations:
            edd = reg.edd
            if edd is None:
                continue

            days_until = (edd - today).days if isinstance(edd, dt_date) else None
            if days_until is None:
                continue

            if days_until < 0:
                overdue_count += 1
            if days_until <= 7:
                due_7_days += 1
            if days_until <= 14:
                due_14_days += 1
            if days_until <= 30:
                due_30_days += 1

            upcoming_deliveries.append(
                {
                    "id": reg.id,
                    "mch_number": reg.mch_number,
                    "mother_name": f"{reg.mother.first_name} {reg.mother.last_name}",
                    "mother_mrn": reg.mother.mrn,
                    "edd": str(edd),
                    "days_until_edd": days_until,
                    "gestation_display": reg.gestation_display,
                    "trimester": reg.trimester,
                    "is_high_risk": reg.is_high_risk,
                    "risk_factors": reg.risk_factors,
                    "status": reg.status,
                }
            )

        # Sort: overdue first, then soonest EDD
        upcoming_deliveries.sort(key=lambda x: x["days_until_edd"])

        # High-risk due within 30 days
        high_risk_due_soon = [
            d for d in upcoming_deliveries if d["is_high_risk"] and d["days_until_edd"] <= 30
        ]

        # --- Monthly trend (last 6 months) ---
        six_months_ago = today - timedelta(days=180)
        monthly_trend = list(
            Delivery.objects.filter(delivery_date__gte=six_months_ago)
            .annotate(month=TruncMonth("delivery_date"))
            .values("month")
            .annotate(
                total=Count("id"),
                live_births=Count("id", filter=Q(delivery_outcome="LIVE_BIRTH")),
                stillbirths=Count("id", filter=Q(delivery_outcome="STILLBIRTH")),
                cs_deliveries=Count(
                    "id",
                    filter=Q(delivery_type__in=["ELECTIVE_CS", "EMERGENCY_CS"]),
                ),
            )
            .order_by("month")
        )

        # Serialize month as string
        for item in monthly_trend:
            item["month"] = item["month"].strftime("%Y-%m") if item["month"] else None

        return Response(
            {
                "stats": {
                    "total_deliveries": total_deliveries,
                    "this_month": this_month,
                    "today": today_count,
                    "live_birth_rate": live_birth_rate,
                    "cs_rate": cs_rate,
                    "with_complications": with_complications,
                    "overdue": overdue_count,
                    "due_7_days": due_7_days,
                    "due_14_days": due_14_days,
                    "due_30_days": due_30_days,
                    "high_risk_due_soon": len(high_risk_due_soon),
                    "active_pregnancies": active_registrations.count(),
                },
                "outcomes_breakdown": {
                    "LIVE_BIRTH": outcomes.get("LIVE_BIRTH", 0),
                    "STILLBIRTH": outcomes.get("STILLBIRTH", 0),
                    "NEONATAL_DEATH": outcomes.get("NEONATAL_DEATH", 0),
                    "MATERNAL_DEATH": outcomes.get("MATERNAL_DEATH", 0),
                },
                "types_breakdown": {
                    "SVD": types.get("SVD", 0),
                    "ASSISTED_VAGINAL": types.get("ASSISTED_VAGINAL", 0),
                    "ELECTIVE_CS": types.get("ELECTIVE_CS", 0),
                    "EMERGENCY_CS": types.get("EMERGENCY_CS", 0),
                    "VACUUM": types.get("VACUUM", 0),
                    "FORCEPS": types.get("FORCEPS", 0),
                },
                "places_breakdown": {
                    "FACILITY": places.get("FACILITY", 0),
                    "HOME": places.get("HOME", 0),
                    "EN_ROUTE": places.get("EN_ROUTE", 0),
                },
                "upcoming_deliveries": upcoming_deliveries[:20],
                "high_risk_due_soon": high_risk_due_soon[:10],
                "monthly_trend": monthly_trend,
            }
        )


class LabourPartographViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for labour partographs."""

    tenant_facility_chain = "registration__facility"
    tenant_org_chain = "registration__organization"

    queryset = LabourPartograph.objects.select_related(
        "registration",
        "registration__mother",
        "encounter",
        "admission",
        "created_by",
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = LabourPartographFilter
    search_fields = [
        "registration__mch_number",
        "registration__mother__first_name",
        "registration__mother__last_name",
        "registration__mother__mrn",
    ]
    ordering_fields = ["started_at", "created_at", "status"]
    ordering = ["-started_at"]
    serializer_class = LabourPartographSerializer

    def get_queryset(self):
        return self.queryset.annotate(observation_count=models.Count("observations"))

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        AuditLog.log(
            action="labour_partograph_create",
            user=self.request.user,
            resource_type="LabourPartograph",
            resource_id=instance.id,
            details={"registration_id": instance.registration_id, "status": instance.status},
            ip_address=get_client_ip(self.request),
        )
        # Re-fetch through annotated queryset so observation_count is present
        # in the serialized response.
        refreshed = self.get_queryset().get(pk=instance.pk)
        serializer.instance = refreshed


class LabourPartographObservationViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for labour partograph observations."""

    tenant_facility_chain = "partograph__registration__facility"
    tenant_org_chain = "partograph__registration__organization"

    queryset = LabourPartographObservation.objects.select_related(
        "partograph",
        "partograph__registration",
        "recorded_by",
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = LabourPartographObservationFilter
    ordering_fields = ["observation_time", "created_at"]
    ordering = ["observation_time"]
    serializer_class = LabourPartographObservationSerializer

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="labour_partograph_observation_create",
            user=self.request.user,
            resource_type="LabourPartographObservation",
            resource_id=instance.id,
            details={
                "partograph_id": instance.partograph_id,
                "fetal_heart_rate": instance.fetal_heart_rate,
                "cervical_dilation_cm": (
                    str(instance.cervical_dilation_cm)
                    if instance.cervical_dilation_cm is not None
                    else None
                ),
            },
            ip_address=get_client_ip(self.request),
        )


class PNCVisitViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for PNC visits."""

    tenant_facility_chain = "registration__facility"
    tenant_org_chain = "registration__organization"

    queryset = PNCVisit.objects.select_related(
        "registration",
        "admission",
        "discharge",
        "clinic_visit",
        "conducted_by",
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = PNCVisitFilter
    ordering_fields = ["visit_date", "visit_number"]
    ordering = ["-visit_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return PNCVisitListSerializer
        return PNCVisitSerializer

    def perform_create(self, serializer):
        conducted_by = serializer.validated_data.get("conducted_by") or self.request.user
        instance = serializer.save(conducted_by=conducted_by)
        link_or_create_clinic_visit_for_mch_visit(instance, user=self.request.user)
        AuditLog.log(
            action="pnc_visit_create",
            user=self.request.user,
            resource_type="PNCVisit",
            resource_id=instance.id,
            details={
                "registration_id": instance.registration_id,
                "visit_number": instance.visit_number,
            },
            ip_address=get_client_ip(self.request),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        link_or_create_clinic_visit_for_mch_visit(instance, user=self.request.user)
        AuditLog.log(
            action="pnc_visit_update",
            user=self.request.user,
            resource_type="PNCVisit",
            resource_id=instance.id,
            details={
                "registration_id": instance.registration_id,
                "visit_number": instance.visit_number,
            },
            ip_address=get_client_ip(self.request),
        )


class GrowthMeasurementViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for growth measurements."""

    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    queryset = GrowthMeasurement.objects.select_related("patient", "measured_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = GrowthMeasurementFilter
    ordering_fields = ["measurement_date", "created_at"]
    ordering = ["-measurement_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return GrowthMeasurementListSerializer
        return GrowthMeasurementSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="growth_measurement_create",
            user=self.request.user,
            resource_type="GrowthMeasurement",
            resource_id=instance.id,
            details={"patient_id": instance.patient_id},
            ip_address=get_client_ip(self.request),
        )

    @action(detail=False, methods=["get"], url_path="chart-data")
    def chart_data(self, request):
        """Return growth chart data for a patient.

        Supports an optional ``age_range`` query parameter:
        - ``0_5``  – WHO Child Growth Standards (0-5 years, default)
        - ``5_19`` – WHO Growth Reference 2007 (5-19 years)
        - ``5_10`` – WHO Growth Reference 2007 weight-for-age only (5-10 years)
        - ``all``  – Combined 0-5 + 5-19/5-10 data for full range charts
        """
        patient_id = request.query_params.get("patient")
        chart_type = request.query_params.get("chart_type", "weight_for_age")
        sex = request.query_params.get("sex")
        age_range = request.query_params.get("age_range", "0_5")

        measurements = self.get_queryset()
        if patient_id:
            measurements = measurements.filter(patient_id=patient_id)

        percentile_lines = {}
        if sex:
            try:
                from hmis.apps.mch.services.growth import WHOGrowthCalculator

                calculator = WHOGrowthCalculator()
                indicator_map = {
                    "weight_for_age": "wfa",
                    "height_for_age": "lhfa",
                    "bmi_for_age": "bfa",
                    "head_circumference_for_age": "hcfa",
                }

                if chart_type in indicator_map:
                    indicator = indicator_map[chart_type]
                    target_key = "age_days"

                    if age_range == "all":
                        # Combine 0-5 and 5-19/5-10 data for a full range chart
                        data_0_5 = calculator._load_data(
                            calculator._get_sex_filename(indicator, sex, age_days=0)
                        )
                        # Use a large age_days to get the extended file
                        data_ext = calculator._load_data(
                            calculator._get_sex_filename(indicator, sex, age_days=2000)
                        )
                        data = data_0_5 + data_ext
                    elif age_range in ("5_19", "5_10"):
                        data = calculator._load_data(
                            calculator._get_sex_filename(indicator, sex, age_days=2000)
                        )
                    else:
                        data = calculator._load_data(
                            calculator._get_sex_filename(indicator, sex, age_days=0)
                        )

                    if data:
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

        # Pass the queryset (model instances) so GrowthChartDataSerializer can serialize
        # them correctly. Passing pre-serialized data (dicts) would cause
        # PrimaryKeyRelatedField.to_representation to fail with 'int has no attribute pk'.
        payload = {
            "measurements": measurements,
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
            response["Content-Disposition"] = (
                f'attachment; filename="growth_chart_{patient.mrn}.pdf"'
            )
            return response

        except Exception as exc:
            return Response(
                {"detail": f"Failed to generate PDF: {exc!s}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class VaccineViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for vaccine reference data.

    Delegates to the unified immunizations app VaccineDefinition model.
    Filters to KEPI vaccines only for MCH context.
    """

    queryset = VaccineDefinition.objects.filter(is_active=True, program="KEPI")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    serializer_class = ImmVaccineSerializer
    pagination_class = None  # Small reference dataset, return flat array
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["standard_age_days", "code"]
    ordering = ["standard_age_days", "code"]


class ImmunizationRecordViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for immunization records.

    Delegates to the unified immunizations app ImmunizationRecord model.
    """

    tenant_facility_chain = ""
    tenant_org_chain = "patient__organization"

    queryset = ImmunizationsImmunizationRecord.objects.select_related(
        "patient", "vaccine", "administered_by"
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ImmunizationRecordFilter
    ordering_fields = ["scheduled_date", "created_at", "status"]
    ordering = ["scheduled_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return ImmRecordListSerializer
        if self.action == "administer":
            return ImmAdministerVaccineSerializer
        return ImmRecordSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="immunization_record_create",
            user=self.request.user,
            resource_type="ImmunizationRecord",
            resource_id=instance.id,
            details={"patient_id": instance.patient_id, "vaccine_id": instance.vaccine_id},
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def administer(self, request, pk=None):
        """Mark a vaccine as administered."""
        record = self.get_object()
        serializer = ImmAdministerVaccineSerializer(data=request.data)
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

        return Response(ImmRecordSerializer(record).data)

    @action(detail=False, methods=["post"], url_path="generate-schedule")
    def generate_schedule(self, request):
        """Generate KEPI immunization schedule for a patient."""
        patient_id = request.data.get("patient")
        if not patient_id:
            return Response({"detail": "patient is required"}, status=status.HTTP_400_BAD_REQUEST)

        from hmis.apps.patients.models import Patient

        patient = Patient.objects.filter(id=patient_id).first()
        if not patient:
            return Response({"detail": "patient not found"}, status=status.HTTP_404_NOT_FOUND)

        records = generate_kepi_schedule(patient)
        serializer = ImmRecordListSerializer(records, many=True)
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

        from hmis.apps.immunizations.models import AEFIEventType

        valid_event_types = [c.value for c in AEFIEventType]
        if event_type not in valid_event_types:
            return Response(
                {"detail": f"Invalid event_type. Must be one of: {valid_event_types}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create AEFI record in the unified immunizations app
        aefi = ImmunizationsAEFI.objects.create(
            immunization_record=record,
            event_date=event_date,
            event_types=[event_type],
            description=description,
            severity=request.data.get("severity", "MILD"),
            outcome=request.data.get("outcome", "UNKNOWN"),
            investigation_notes=request.data.get("notes", ""),
        )

        return Response(
            ImmAEFISerializer(aefi).data,
            status=status.HTTP_201_CREATED,
        )


class VitaminASupplementViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for Vitamin A supplements."""

    tenant_facility_chain = ""
    tenant_org_chain = "patient__organization"

    queryset = VitaminASupplement.objects.select_related("patient", "administered_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    serializer_class = VitaminASupplementSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = VitaminASupplementFilter
    ordering_fields = ["administered_date", "created_at"]
    ordering = ["-administered_date"]

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="vitamin_a_supplement_create",
            user=self.request.user,
            resource_type="VitaminASupplement",
            resource_id=instance.id,
            details={"patient_id": instance.patient_id},
            ip_address=get_client_ip(self.request),
        )


class AEFIViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for AEFI reporting.

    Delegates to the unified immunizations app AEFI model.
    """

    tenant_facility_chain = ""
    tenant_org_chain = "immunization_record__patient__organization"

    queryset = ImmunizationsAEFI.objects.select_related("immunization_record", "investigated_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = AEFIFilter
    ordering_fields = ["event_date", "created_at"]
    ordering = ["-event_date"]

    def get_serializer_class(self):
        if self.action == "list":
            return ImmAEFIListSerializer
        return ImmAEFISerializer

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


class HEIFollowUpViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for HEI follow-up records."""

    tenant_facility_chain = "mch_registration__facility"
    tenant_org_chain = "mch_registration__organization"

    queryset = HEIFollowUp.objects.select_related("infant", "mch_registration", "enrolled_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
        instance = serializer.save(enrolled_by=self.request.user)
        AuditLog.log(
            action="hei_followup_create",
            user=self.request.user,
            resource_type="HEIFollowUp",
            resource_id=instance.id,
            details={"infant_id": instance.infant_id, "hei_number": instance.hei_number},
            ip_address=get_client_ip(self.request),
        )

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
            return Response(
                {
                    "status": "CONFIRMED_POSITIVE",
                    "message": "Infant confirmed HIV-positive. CCC enrollment may be auto-created.",
                    "positive_test_number": positive_tests.first().test_number,
                }
            )

        # Check if sufficient negative results
        negative_tests = pcr_tests.filter(result="NEGATIVE")
        pending_tests = pcr_tests.filter(result="PENDING")

        # Kenya protocol: need at least 2 negative PCR tests to confirm negative
        # (one at 6 weeks, one at 9 months or after cessation of breastfeeding)
        if negative_tests.count() >= 2 and pending_tests.count() == 0:
            hei.status = "CONFIRMED_NEGATIVE"
            hei.save(update_fields=["status"])
            return Response(
                {
                    "status": "CONFIRMED_NEGATIVE",
                    "message": "Infant confirmed HIV-negative after 2+ negative PCR tests.",
                    "negative_test_count": negative_tests.count(),
                }
            )

        # Still pending determination
        return Response(
            {
                "status": "ACTIVE",
                "message": "Insufficient results to determine final status.",
                "negative_tests": negative_tests.count(),
                "pending_tests": pending_tests.count(),
                "required_negative_tests": 2,
            }
        )

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

        return Response(
            {
                "hei_number": hei.hei_number,
                "breastfeeding_status": new_status,
                "message": f"Breastfeeding status updated to {hei.get_breastfeeding_status_display()}",
            }
        )


class HEIPCRTestViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for HEI PCR tests."""

    tenant_facility_chain = "hei_followup__mch_registration__facility"
    tenant_org_chain = "hei_followup__mch_registration__organization"

    queryset = HEIPCRTest.objects.select_related("hei_followup")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    serializer_class = HEIPCRTestSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["scheduled_date", "actual_date", "created_at"]
    ordering = ["-scheduled_date"]

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="hei_pcr_test_create",
            user=self.request.user,
            resource_type="HEIPCRTest",
            resource_id=instance.id,
            details={
                "hei_followup_id": instance.hei_followup_id,
                "test_number": instance.test_number,
            },
            ip_address=get_client_ip(self.request),
        )
