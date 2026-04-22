"""
Views for the occupational therapy module.

Provides REST API endpoints for:
- OTTreatmentType (catalog management)
- OccupationalTherapyOrder (referral orders)
- OTSession (treatment sessions)
"""

from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.occupational_therapy.models import (
    OccupationalTherapyOrder,
    OTSession,
    OTTreatmentType,
)
from hmis.apps.occupational_therapy.serializers import (
    OccupationalTherapyOrderAssignTherapistSerializer,
    OccupationalTherapyOrderCreateSerializer,
    OccupationalTherapyOrderListSerializer,
    OccupationalTherapyOrderSerializer,
    OccupationalTherapyOrderUpdateStatusSerializer,
    OTSessionCompleteSerializer,
    OTSessionCreateSerializer,
    OTSessionSerializer,
    OTTreatmentTypeListSerializer,
    OTTreatmentTypeSerializer,
)


class OTTreatmentTypeFilter(django_filters.FilterSet):
    """Filter for OTTreatmentType."""

    category = django_filters.CharFilter(lookup_expr="iexact")
    sha_claimable = django_filters.BooleanFilter()
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = OTTreatmentType
        fields = ["category", "sha_claimable", "is_active"]


class OTTreatmentTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing occupational therapy treatment types (catalog).

    Provides CRUD operations for the treatment type catalog.
    """

    queryset = OTTreatmentType.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = OTTreatmentTypeFilter
    search_fields = ["code", "name", "description"]
    ordering_fields = ["name", "category", "cost_per_session", "created_at"]
    ordering = ["category", "name"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return OTTreatmentTypeListSerializer
        return OTTreatmentTypeSerializer

    def get_queryset(self):
        """Filter queryset based on active status for non-staff users."""
        qs = super().get_queryset()
        if not self.request.user.is_staff:
            qs = qs.filter(is_active=True)
        return qs


class OccupationalTherapyOrderFilter(django_filters.FilterSet):
    """Filter for OccupationalTherapyOrder."""

    patient = django_filters.NumberFilter()
    patient_id = django_filters.NumberFilter(field_name="patient")
    encounter = django_filters.NumberFilter()
    encounter_id = django_filters.NumberFilter(field_name="encounter")
    status = django_filters.CharFilter(lookup_expr="iexact")
    priority = django_filters.CharFilter(lookup_expr="iexact")
    assessment_type = django_filters.CharFilter(lookup_expr="iexact")
    assigned_therapist = django_filters.NumberFilter()
    treatment_type = django_filters.NumberFilter()
    ordered_from = django_filters.DateFilter(field_name="ordered_at", lookup_expr="date__gte")
    ordered_to = django_filters.DateFilter(field_name="ordered_at", lookup_expr="date__lte")
    is_paid = django_filters.BooleanFilter()

    class Meta:
        model = OccupationalTherapyOrder
        fields = [
            "patient",
            "patient_id",
            "encounter",
            "encounter_id",
            "status",
            "priority",
            "assessment_type",
            "assigned_therapist",
            "treatment_type",
            "is_paid",
        ]


class OccupationalTherapyOrderViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing occupational therapy orders.

    Provides CRUD operations plus custom actions for:
    - Updating order status
    - Assigning therapist
    - Approving orders
    - Generating sessions
    """

    queryset = OccupationalTherapyOrder.objects.select_related(
        "patient",
        "encounter",
        "treatment_type",
        "ordered_by",
        "assigned_therapist",
    ).prefetch_related("sessions")
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = OccupationalTherapyOrderFilter
    search_fields = [
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_indication",
        "treatment_goals",
    ]
    ordering_fields = ["ordered_at", "status", "priority", "total_sessions"]
    ordering = ["-ordered_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return OccupationalTherapyOrderListSerializer
        if self.action == "create":
            return OccupationalTherapyOrderCreateSerializer
        if self.action == "update_status":
            return OccupationalTherapyOrderUpdateStatusSerializer
        if self.action == "assign_therapist":
            return OccupationalTherapyOrderAssignTherapistSerializer
        return OccupationalTherapyOrderSerializer

    def perform_create(self, serializer):
        """Create order and log audit."""
        order = serializer.save(ordered_by=self.request.user)
        AuditLog.log(
            action="ot_order_create",
            user=self.request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "patient_id": order.patient_id,
                "treatment_type": order.treatment_type.name,
                "assessment_type": order.assessment_type,
            },
        )
        # Store the created order for response serialization
        self._created_order = order

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_order"):
            response.data = OccupationalTherapyOrderSerializer(self._created_order).data
        return response

    def perform_update(self, serializer):
        """Update order and log audit."""
        order = serializer.save()
        AuditLog.log(
            action="ot_order_update",
            user=self.request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number, "changes": serializer.validated_data},
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """
        Update order status with validation.

        POST /api/occupational-therapy/orders/{id}/update_status/
        Body: {"status": "APPROVED", "notes": "Optional notes"}
        """
        order = self.get_object()
        serializer = self.get_serializer(order, data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = order.status
        new_status = serializer.validated_data["status"]

        try:
            order.update_status(new_status, user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="ot_order_status_change",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "old_status": old_status,
                "new_status": new_status,
                "notes": serializer.validated_data.get("notes", ""),
            },
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve an order (shortcut for update_status with APPROVED).

        POST /api/occupational-therapy/orders/{id}/approve/
        """
        order = self.get_object()

        if order.status != "PENDING":
            return Response(
                {"error": f"Cannot approve order with status '{order.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order.update_status("APPROVED", user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="ot_order_approved",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number},
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def assign_therapist(self, request, pk=None):
        """
        Assign occupational therapist to order.

        POST /api/occupational-therapy/orders/{id}/assign_therapist/
        Body: {"assigned_therapist": <user_id>}
        """
        order = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        therapist = serializer.validated_data["assigned_therapist"]
        order.assigned_therapist = therapist
        order.save(update_fields=["assigned_therapist"])

        AuditLog.log(
            action="ot_therapist_assigned",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "therapist_id": therapist.id,
                "therapist_name": f"{therapist.first_name} {therapist.last_name}",
            },
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def generate_sessions(self, request, pk=None):
        """
        Generate scheduled sessions for the order.

        POST /api/occupational-therapy/orders/{id}/generate_sessions/
        Body: {"start_date": "2026-02-25", "therapist": <user_id>} (optional)
        """
        from datetime import timedelta

        order = self.get_object()

        if order.status not in ["APPROVED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot generate sessions for order with status '{order.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get parameters
        start_date = request.data.get("start_date")
        if start_date:
            from datetime import datetime

            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        else:
            from datetime import date

            start_date = order.start_date or date.today()

        therapist_id = request.data.get("therapist")
        if therapist_id:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            therapist = User.objects.get(pk=therapist_id)
        else:
            therapist = order.assigned_therapist

        if not therapist:
            return Response(
                {"error": "No therapist assigned. Please assign a therapist first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate sessions to create
        existing_sessions = order.sessions.count()
        sessions_to_create = order.total_sessions - existing_sessions

        if sessions_to_create <= 0:
            return Response(
                {"message": "All sessions already created"},
                status=status.HTTP_200_OK,
            )

        # Parse frequency to determine interval days
        frequency = order.frequency.lower()
        if "daily" in frequency:
            interval_days = 1
        elif "3x" in frequency or "three" in frequency:
            interval_days = 2
        elif "2x" in frequency or "twice" in frequency:
            interval_days = 3
        else:  # Default to weekly
            interval_days = 7

        # Create sessions
        created_sessions = []
        current_date = start_date
        for i in range(sessions_to_create):
            session = OTSession.objects.create(
                order=order,
                therapist=therapist,
                scheduled_date=current_date,
            )
            created_sessions.append(session)
            current_date += timedelta(days=interval_days)

        # Update order start/end dates
        if not order.start_date:
            order.start_date = start_date
        order.expected_end_date = current_date - timedelta(days=interval_days)
        order.save(update_fields=["start_date", "expected_end_date"])

        AuditLog.log(
            action="ot_sessions_generated",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "sessions_created": len(created_sessions),
                "start_date": str(start_date),
                "therapist_id": therapist.id,
            },
        )

        return Response(
            {
                "message": f"Created {len(created_sessions)} sessions",
                "sessions": OTSessionSerializer(created_sessions, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start the order (transition to IN_PROGRESS).

        POST /api/occupational-therapy/orders/{id}/start/
        """
        order = self.get_object()

        if order.status != "APPROVED":
            return Response(
                {"error": f"Cannot start order with status '{order.status}'. Must be APPROVED."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order.update_status("IN_PROGRESS", user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="ot_order_started",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number},
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete the order.

        POST /api/occupational-therapy/orders/{id}/complete/
        """
        order = self.get_object()

        if order.status != "IN_PROGRESS":
            return Response(
                {
                    "error": f"Cannot complete order with status '{order.status}'. Must be IN_PROGRESS."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order.update_status("COMPLETED", user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="ot_order_completed",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "sessions_completed": order.sessions_completed,
            },
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel the order.

        POST /api/occupational-therapy/orders/{id}/cancel/
        Body: {"reason": "Optional cancellation reason"}
        """
        order = self.get_object()
        reason = request.data.get("reason", "")

        if order.status in ["COMPLETED", "CANCELLED"]:
            return Response(
                {"error": f"Cannot cancel order with status '{order.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order.update_status("CANCELLED", user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="ot_order_cancelled",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number, "reason": reason},
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def put_on_hold(self, request, pk=None):
        """
        Put the order on hold.

        POST /api/occupational-therapy/orders/{id}/put_on_hold/
        Body: {"reason": "Optional reason"}
        """
        order = self.get_object()
        reason = request.data.get("reason", "")

        if order.status not in ["APPROVED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot put order with status '{order.status}' on hold"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order.update_status("ON_HOLD", user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="ot_order_on_hold",
            user=request.user,
            resource_type="OccupationalTherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number, "reason": reason},
        )

        return Response(OccupationalTherapyOrderSerializer(order).data)


class OTSessionFilter(django_filters.FilterSet):
    """Filter for OTSession."""

    order = django_filters.NumberFilter()
    therapist = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    scheduled_date_from = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    scheduled_date_to = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")
    is_billed = django_filters.BooleanFilter()

    class Meta:
        model = OTSession
        fields = ["order", "therapist", "status", "is_billed"]


class OTSessionViewSet(NestedTenantScopeMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing OT sessions.

    Provides CRUD operations plus custom actions for:
    - Starting sessions
    - Completing sessions
    - Cancelling/rescheduling
    """

    tenant_facility_chain = "order__facility"
    tenant_org_chain = "order__organization"

    queryset = OTSession.objects.select_related(
        "order",
        "order__patient",
        "order__treatment_type",
        "therapist",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = OTSessionFilter
    search_fields = [
        "order__order_number",
        "order__patient__first_name",
        "order__patient__last_name",
        "progress_notes",
    ]
    ordering_fields = ["scheduled_date", "session_number", "status", "created_at"]
    ordering = ["scheduled_date", "session_number"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "create":
            return OTSessionCreateSerializer
        if self.action == "complete":
            return OTSessionCompleteSerializer
        return OTSessionSerializer

    def perform_create(self, serializer):
        """Create session and log audit."""
        session = serializer.save()
        AuditLog.log(
            action="ot_session_create",
            user=self.request.user,
            resource_type="OTSession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
                "scheduled_date": str(session.scheduled_date),
            },
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start a session.

        POST /api/occupational-therapy/sessions/{id}/start/
        """
        session = self.get_object()

        if session.status != "SCHEDULED":
            return Response(
                {"error": f"Cannot start session with status '{session.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "IN_PROGRESS"
        session.save(update_fields=["status"])

        # Update order status if needed
        if session.order.status == "APPROVED":
            session.order.update_status("IN_PROGRESS", user=request.user)

        AuditLog.log(
            action="ot_session_started",
            user=request.user,
            resource_type="OTSession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
            },
        )

        return Response(OTSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete a session with clinical notes.

        POST /api/occupational-therapy/sessions/{id}/complete/
        Body: {...session completion data...}
        """
        session = self.get_object()

        if session.status not in ["SCHEDULED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot complete session with status '{session.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(session, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Mark as completed
        session.complete_session(user=request.user)

        AuditLog.log(
            action="ot_session_completed",
            user=request.user,
            resource_type="OTSession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
                "outcome": session.outcome,
            },
        )

        return Response(OTSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel a session.

        POST /api/occupational-therapy/sessions/{id}/cancel/
        Body: {"reason": "Optional reason"}
        """
        session = self.get_object()
        reason = request.data.get("reason", "")

        if session.status == "COMPLETED":
            return Response(
                {"error": "Cannot cancel a completed session"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "CANCELLED"
        session.save(update_fields=["status"])

        AuditLog.log(
            action="ot_session_cancelled",
            user=request.user,
            resource_type="OTSession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
                "reason": reason,
            },
        )

        return Response(OTSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def no_show(self, request, pk=None):
        """
        Mark session as no-show.

        POST /api/occupational-therapy/sessions/{id}/no_show/
        """
        session = self.get_object()

        if session.status not in ["SCHEDULED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot mark session with status '{session.status}' as no-show"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "NO_SHOW"
        session.save(update_fields=["status"])

        AuditLog.log(
            action="ot_session_no_show",
            user=request.user,
            resource_type="OTSession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
            },
        )

        return Response(OTSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        """
        Reschedule a session.

        POST /api/occupational-therapy/sessions/{id}/reschedule/
        Body: {"scheduled_date": "2026-03-01", "scheduled_time": "10:00"}
        """
        session = self.get_object()

        if session.status in ["COMPLETED", "NO_SHOW"]:
            return Response(
                {"error": f"Cannot reschedule session with status '{session.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_date = request.data.get("scheduled_date")
        new_time = request.data.get("scheduled_time")

        if not new_date:
            return Response(
                {"error": "scheduled_date is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_date = session.scheduled_date
        session.scheduled_date = new_date
        if new_time:
            session.scheduled_time = new_time
        session.status = "RESCHEDULED"
        session.save()

        # Create a new scheduled session
        new_session = OTSession.objects.create(
            order=session.order,
            therapist=session.therapist,
            scheduled_date=new_date,
            scheduled_time=new_time if new_time else session.scheduled_time,
        )

        AuditLog.log(
            action="ot_session_rescheduled",
            user=request.user,
            resource_type="OTSession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "old_session_number": session.session_number,
                "new_session_number": new_session.session_number,
                "old_date": str(old_date),
                "new_date": new_date,
            },
        )

        return Response(
            {
                "old_session": OTSessionSerializer(session).data,
                "new_session": OTSessionSerializer(new_session).data,
            },
            status=status.HTTP_201_CREATED,
        )
