from datetime import date, datetime, timedelta

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

from .filters import ProcedureCatalogFilter, ProcedureOrderFilter
from .models import ProcedureCatalog, ProcedureConsent, ProcedureLog, ProcedureOrder
from .serializers import (
    ProcedureCancelSerializer,
    ProcedureCatalogDetailSerializer,
    ProcedureCatalogListSerializer,
    ProcedureCompleteSerializer,
    ProcedureConsentCreateSerializer,
    ProcedureConsentSerializer,
    ProcedureConsumableCreateSerializer,
    ProcedureConsumableSerializer,
    ProcedureOrderCreateSerializer,
    ProcedureOrderDetailSerializer,
    ProcedureOrderListSerializer,
    ProcedureOutcomeCreateSerializer,
    ProcedureOutcomeSerializer,
    ProcedureScheduleSerializer,
    ProcedureStartSerializer,
)


class ProcedureCatalogViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for browsing the procedure catalog.

    Catalog is reference data shared across all facilities in the
    organization, so tenant_scope is set to "organization" rather
    than the default "facility".
    """

    queryset = ProcedureCatalog.objects.all()
    permission_classes = [IsAuthenticated]
    tenant_scope = "organization"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProcedureCatalogFilter
    search_fields = ["code", "name", "ichi_code", "cpt_code"]
    ordering_fields = ["name", "code", "category", "risk_level", "base_fee"]

    def get_serializer_class(self):
        if self.action == "list":
            return ProcedureCatalogListSerializer
        return ProcedureCatalogDetailSerializer

    @action(detail=True, methods=["get"], url_path="available-slots")
    def available_slots(self, request, pk=None):
        """Return available time slots for scheduling this procedure.

        Derives slots from ClinicSchedule of each ``default_clinic`` for the
        requested date, then subtracts already-booked procedure orders.

        Query params:
            date (required): YYYY-MM-DD
        """
        catalog = self.get_object()
        date_str = request.query_params.get("date")
        if not date_str:
            return Response(
                {"error": "date query parameter is required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clinics = catalog.default_clinics.filter(status="ACTIVE")
        if not clinics.exists():
            return Response(
                {
                    "slots": [],
                    "message": "No clinics configured for this procedure. Use manual scheduling.",
                },
            )

        from hmis.apps.clinics.models import ClinicSchedule

        day_of_week = target_date.weekday()  # 0=Monday
        duration = catalog.typical_duration_minutes or 30
        slots = []

        for clinic in clinics:
            schedules = ClinicSchedule.objects.filter(
                clinic=clinic,
                day_of_week=day_of_week,
                is_active=True,
            )
            if not schedules.exists():
                continue

            # Get already booked slots for this clinic on this date
            booked_times = set(
                ProcedureOrder.objects.filter(
                    scheduled_clinic=clinic,
                    scheduled_date=target_date,
                    status__in=[
                        ProcedureOrder.Status.SCHEDULED,
                        ProcedureOrder.Status.READY,
                        ProcedureOrder.Status.IN_PROGRESS,
                    ],
                )
                .exclude(scheduled_time__isnull=True)
                .values_list("scheduled_time", flat=True)
            )

            for schedule in schedules:
                current = datetime.combine(target_date, schedule.start_time)
                end = datetime.combine(target_date, schedule.end_time)

                while current + timedelta(minutes=duration) <= end:
                    slot_time = current.time()
                    slots.append(
                        {
                            "clinic_id": clinic.id,
                            "clinic_name": clinic.name,
                            "date": date_str,
                            "start_time": slot_time.strftime("%H:%M"),
                            "end_time": (current + timedelta(minutes=duration))
                            .time()
                            .strftime("%H:%M"),
                            "duration_minutes": duration,
                            "available": slot_time not in booked_times,
                        }
                    )
                    current += timedelta(minutes=duration)

        return Response({"slots": slots})


class ProcedureOrderViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for procedure orders with workflow @actions."""

    queryset = ProcedureOrder.objects.select_related("procedure", "patient").all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProcedureOrderFilter
    search_fields = [
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "procedure__name",
    ]
    ordering_fields = [
        "ordered_at",
        "scheduled_date",
        "status",
        "priority",
    ]

    # ── helpers ──────────────────────────────────────────────────────

    def _audit(self, action_name: str, order: ProcedureOrder, **extra):
        """Create an audit log entry for a procedure order action."""
        AuditLog.log(
            action=action_name,
            user=self.request.user,
            resource_type="ProcedureOrder",
            resource_id=order.pk,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=order.patient_id,
            details={
                "order_number": order.order_number,
                "procedure": order.procedure.name,
                "status": order.status,
                **extra,
            },
        )

    def get_serializer_class(self):
        if self.action == "list":
            return ProcedureOrderListSerializer
        if self.action == "create":
            return ProcedureOrderCreateSerializer
        if self.action in ("schedule", "reschedule"):
            return ProcedureScheduleSerializer
        if self.action == "cancel":
            return ProcedureCancelSerializer
        if self.action == "start":
            return ProcedureStartSerializer
        if self.action == "complete":
            return ProcedureCompleteSerializer
        if self.action == "create_consent":
            return ProcedureConsentCreateSerializer
        if self.action == "add_consumable":
            return ProcedureConsumableCreateSerializer
        if self.action == "add_outcome":
            return ProcedureOutcomeCreateSerializer
        return ProcedureOrderDetailSerializer

    def perform_create(self, serializer):
        encounter = serializer.validated_data.get("encounter")
        if not encounter:
            # Auto-create a PROCEDURE encounter for the patient
            from hmis.apps.encounters.models import Encounter

            tenant_kwargs = self.get_tenant_save_kwargs()
            patient = serializer.validated_data["patient"]
            procedure = serializer.validated_data["procedure"]
            encounter = Encounter.objects.create(
                patient=patient,
                encounter_type="PROCEDURE",
                chief_complaint=f"Procedure: {procedure.name}",
                visit_reason="SCHEDULED_PROCEDURE",
                created_by=self.request.user,
                **tenant_kwargs,
            )
        serializer.save(
            ordered_by=self.request.user,
            encounter=encounter,
            **self.get_tenant_save_kwargs(),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return detail serializer for the created object
        detail = ProcedureOrderDetailSerializer(serializer.instance)
        self._audit(
            "procedure_order_create", serializer.instance, priority=serializer.instance.priority
        )
        return Response(detail.data, status=status.HTTP_201_CREATED)

    # ----- Workflow Actions -----

    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        """Schedule a procedure order."""
        order = self.get_object()
        serializer = ProcedureScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        order.schedule(
            date=data["scheduled_date"],
            time=data.get("scheduled_time"),
            location=data.get("scheduled_location", ""),
            duration=data.get("estimated_duration_minutes"),
            clinic=data.get("scheduled_clinic"),
        )
        self._audit(
            "procedure_order_schedule",
            order,
            scheduled_date=str(data["scheduled_date"]),
            scheduled_clinic=(
                data["scheduled_clinic"].name if data.get("scheduled_clinic") else None
            ),
        )
        return Response(ProcedureOrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        """Reschedule a SCHEDULED or READY procedure order."""
        order = self.get_object()
        if order.status not in [
            ProcedureOrder.Status.SCHEDULED,
            ProcedureOrder.Status.READY,
        ]:
            return Response(
                {"error": "Only SCHEDULED or READY orders can be rescheduled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProcedureScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_date = str(order.scheduled_date) if order.scheduled_date else None
        data = serializer.validated_data
        order.scheduled_date = data["scheduled_date"]
        order.scheduled_time = data.get("scheduled_time")
        if data.get("scheduled_location"):
            order.scheduled_location = data["scheduled_location"]
        if data.get("estimated_duration_minutes"):
            order.estimated_duration_minutes = data["estimated_duration_minutes"]
        if "scheduled_clinic" in data:
            order.scheduled_clinic = data.get("scheduled_clinic")
        # Stay in current status (SCHEDULED or READY)
        order.save(
            update_fields=[
                "scheduled_date",
                "scheduled_time",
                "scheduled_location",
                "scheduled_clinic",
                "estimated_duration_minutes",
                "updated_at",
            ]
        )
        self._audit(
            "procedure_order_reschedule",
            order,
            old_date=old_date,
            new_date=str(data["scheduled_date"]),
        )
        return Response(ProcedureOrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start a procedure — creates ProcedureLog."""
        order = self.get_object()
        if order.status not in [
            ProcedureOrder.Status.SCHEDULED,
            ProcedureOrder.Status.READY,
        ]:
            return Response(
                {"error": "Order must be SCHEDULED or READY to start."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProcedureStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        location = serializer.validated_data.get("location", "")
        if location:
            order.scheduled_location = location
        order.start_procedure(performed_by=request.user)
        self._audit("procedure_start", order)
        return Response(
            ProcedureOrderDetailSerializer(order).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete a procedure."""
        order = self.get_object()
        if order.status != ProcedureOrder.Status.IN_PROGRESS:
            return Response(
                {"error": "Order must be IN_PROGRESS to complete."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProcedureCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        log = order.log
        data = serializer.validated_data
        log.complications_occurred = data.get("complications_occurred", False)
        log.complication_details = data.get("complication_details", "")
        log.complete(
            status=data.get("status", "COMPLETED"),
            outcome=data.get("immediate_outcome", ""),
        )

        order.refresh_from_db()
        self._audit(
            "procedure_complete",
            order,
            outcome_status=data.get("status", "COMPLETED"),
            complications=data.get("complications_occurred", False),
        )
        return Response(ProcedureOrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a procedure order."""
        order = self.get_object()
        if order.status in [
            ProcedureOrder.Status.COMPLETED,
            ProcedureOrder.Status.CANCELLED,
        ]:
            return Response(
                {"error": "Cannot cancel a completed or already cancelled order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProcedureCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order.cancel(user=request.user, reason=serializer.validated_data["reason"])
        self._audit("procedure_order_cancel", order, reason=serializer.validated_data["reason"])
        return Response(ProcedureOrderDetailSerializer(order).data)

    # ----- Consent -----

    @action(detail=True, methods=["get"], url_path="consent", url_name="consent-detail")
    def get_consent(self, request, pk=None):
        """Get consent for an order."""
        order = self.get_object()
        try:
            consent = order.consent
        except ProcedureConsent.DoesNotExist:
            return Response(
                {"detail": "No consent record found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ProcedureConsentSerializer(consent).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="consent/create",
        url_name="consent-create",
    )
    def create_consent(self, request, pk=None):
        """Create consent for an order."""
        order = self.get_object()
        serializer = ProcedureConsentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        consent = serializer.save(
            order=order,
            obtained_by=request.user,
            **self.get_tenant_save_kwargs(),
        )
        order.request_consent()
        self._audit(
            "procedure_consent_create",
            order,
            consent_type=consent.consent_type,
        )
        return Response(
            ProcedureConsentSerializer(consent).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="consent/sign",
        url_name="consent-sign",
    )
    def sign_consent(self, request, pk=None):
        """Sign consent for an order."""
        order = self.get_object()
        try:
            consent = order.consent
        except ProcedureConsent.DoesNotExist:
            return Response(
                {"error": "No consent record found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        consent.sign(user=request.user)
        self._audit("procedure_consent_sign", order)
        return Response(ProcedureConsentSerializer(consent).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="consent/decline",
        url_name="consent-decline",
    )
    def decline_consent(self, request, pk=None):
        """Decline consent for an order."""
        order = self.get_object()
        try:
            consent = order.consent
        except ProcedureConsent.DoesNotExist:
            return Response(
                {"error": "No consent record found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        reason = request.data.get("reason", "")
        consent.decline(reason=reason)
        self._audit("procedure_consent_decline", order, reason=reason)
        return Response(ProcedureConsentSerializer(consent).data)

    # ----- Consumables -----

    @action(detail=True, methods=["get"], url_path="consumables", url_name="consumables-list")
    def list_consumables(self, request, pk=None):
        """List consumables for an order's log."""
        order = self.get_object()
        try:
            log = order.log
        except ProcedureLog.DoesNotExist:
            return Response(
                {"error": "No procedure log found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        consumables = log.consumables.select_related("drug").all()
        return Response(ProcedureConsumableSerializer(consumables, many=True).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="consumables/add",
        url_name="consumables-add",
    )
    def add_consumable(self, request, pk=None):
        """Add a consumable to the procedure log."""
        order = self.get_object()
        try:
            log = order.log
        except ProcedureLog.DoesNotExist:
            return Response(
                {"error": "No procedure log found. Start the procedure first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProcedureConsumableCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        consumable = serializer.save(log=log, recorded_by=request.user)
        return Response(
            ProcedureConsumableSerializer(consumable).data,
            status=status.HTTP_201_CREATED,
        )

    # ----- Outcomes -----

    @action(detail=True, methods=["get"], url_path="outcomes", url_name="outcomes-list")
    def list_outcomes(self, request, pk=None):
        """List outcomes for an order's log."""
        order = self.get_object()
        try:
            log = order.log
        except ProcedureLog.DoesNotExist:
            return Response(
                {"error": "No procedure log found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        outcomes = log.outcomes.all()
        return Response(ProcedureOutcomeSerializer(outcomes, many=True).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="outcomes/add",
        url_name="outcomes-add",
    )
    def add_outcome(self, request, pk=None):
        """Add an outcome assessment."""
        order = self.get_object()
        try:
            log = order.log
        except ProcedureLog.DoesNotExist:
            return Response(
                {"error": "No procedure log found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProcedureOutcomeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outcome = serializer.save(
            log=log,
            assessed_by=request.user,
            **self.get_tenant_save_kwargs(),
        )
        return Response(
            ProcedureOutcomeSerializer(outcome).data,
            status=status.HTTP_201_CREATED,
        )


class ProcedureDashboardView(APIView):
    """Dashboard stats for procedures."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        facility = getattr(request, "facility", None)

        base_qs = ProcedureOrder.objects.all()
        if facility:
            base_qs = base_qs.filter(facility=facility)

        scheduled_today = base_qs.filter(
            scheduled_date=today,
            status__in=[
                ProcedureOrder.Status.SCHEDULED,
                ProcedureOrder.Status.READY,
            ],
        ).count()

        pending_consent = base_qs.filter(
            status=ProcedureOrder.Status.CONSENT_PENDING,
        ).count()

        in_progress = base_qs.filter(
            status=ProcedureOrder.Status.IN_PROGRESS,
        ).count()

        completed_today = base_qs.filter(
            status=ProcedureOrder.Status.COMPLETED,
            updated_at__date=today,
        ).count()

        return Response(
            {
                "scheduled_today": scheduled_today,
                "pending_consent": pending_consent,
                "in_progress": in_progress,
                "completed_today": completed_today,
            }
        )
