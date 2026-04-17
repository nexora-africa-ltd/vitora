"""
Views for the physiotherapy module.

Provides REST API endpoints for:
- PhysiotherapyTreatmentType (catalog management)
- PhysiotherapyOrder (referral orders)
- PhysiotherapySession (treatment sessions)
"""

from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.physiotherapy.models import (
    PhysiotherapyOrder,
    PhysiotherapySession,
    PhysiotherapyTreatmentType,
)
from hmis.apps.physiotherapy.serializers import (
    PhysiotherapyOrderAssignTherapistSerializer,
    PhysiotherapyOrderCreateSerializer,
    PhysiotherapyOrderListSerializer,
    PhysiotherapyOrderSerializer,
    PhysiotherapyOrderUpdateStatusSerializer,
    PhysiotherapySessionCompleteSerializer,
    PhysiotherapySessionCreateSerializer,
    PhysiotherapySessionSerializer,
    PhysiotherapyTreatmentTypeListSerializer,
    PhysiotherapyTreatmentTypeSerializer,
)


class PhysiotherapyTreatmentTypeFilter(django_filters.FilterSet):
    """Filter for PhysiotherapyTreatmentType."""

    category = django_filters.CharFilter(lookup_expr="iexact")
    sha_claimable = django_filters.BooleanFilter()
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = PhysiotherapyTreatmentType
        fields = ["category", "sha_claimable", "is_active"]


class PhysiotherapyTreatmentTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing physiotherapy treatment types (catalog).

    Provides CRUD operations for the treatment type catalog.
    """

    queryset = PhysiotherapyTreatmentType.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = PhysiotherapyTreatmentTypeFilter
    search_fields = ["code", "name", "description"]
    ordering_fields = ["name", "category", "cost_per_session", "created_at"]
    ordering = ["category", "name"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return PhysiotherapyTreatmentTypeListSerializer
        return PhysiotherapyTreatmentTypeSerializer

    def get_queryset(self):
        """Filter queryset based on active status for non-staff users."""
        qs = super().get_queryset()
        if not self.request.user.is_staff:
            qs = qs.filter(is_active=True)
        return qs


class PhysiotherapyOrderFilter(django_filters.FilterSet):
    """Filter for PhysiotherapyOrder."""

    patient = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    priority = django_filters.CharFilter(lookup_expr="iexact")
    assigned_therapist = django_filters.NumberFilter()
    treatment_type = django_filters.NumberFilter()
    ordered_from = django_filters.DateFilter(field_name="ordered_at", lookup_expr="date__gte")
    ordered_to = django_filters.DateFilter(field_name="ordered_at", lookup_expr="date__lte")
    is_paid = django_filters.BooleanFilter()

    class Meta:
        model = PhysiotherapyOrder
        fields = [
            "patient",
            "status",
            "priority",
            "assigned_therapist",
            "treatment_type",
            "is_paid",
        ]


class PhysiotherapyOrderViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing physiotherapy orders.

    Provides CRUD operations plus custom actions for:
    - Updating order status
    - Assigning therapist
    - Approving orders
    - Generating sessions
    """

    queryset = PhysiotherapyOrder.objects.select_related(
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
    filterset_class = PhysiotherapyOrderFilter
    search_fields = [
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_indication",
    ]
    ordering_fields = ["ordered_at", "status", "priority", "total_sessions"]
    ordering = ["-ordered_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return PhysiotherapyOrderListSerializer
        if self.action == "create":
            return PhysiotherapyOrderCreateSerializer
        if self.action == "update_status":
            return PhysiotherapyOrderUpdateStatusSerializer
        if self.action == "assign_therapist":
            return PhysiotherapyOrderAssignTherapistSerializer
        return PhysiotherapyOrderSerializer

    def perform_create(self, serializer):
        """Create order and log audit."""
        order = serializer.save(ordered_by=self.request.user)
        AuditLog.log(
            action="physiotherapy_order_create",
            user=self.request.user,
            resource_type="PhysiotherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "patient_id": order.patient_id,
                "treatment_type": order.treatment_type.name,
            },
        )
        # Store the created order for response serialization
        self._created_order = order

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_order"):
            response.data = PhysiotherapyOrderSerializer(self._created_order).data
        return response

    def perform_update(self, serializer):
        """Update order and log audit."""
        order = serializer.save()
        AuditLog.log(
            action="physiotherapy_order_update",
            user=self.request.user,
            resource_type="PhysiotherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number, "changes": serializer.validated_data},
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """
        Update order status with validation.

        POST /api/physiotherapy/orders/{id}/update_status/
        Body: {"status": "APPROVED", "notes": "Optional notes"}
        """
        order = self.get_object()
        serializer = self.get_serializer(order, data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        notes = serializer.validated_data.get("notes", "")

        old_status = order.status
        order.update_status(new_status, user=request.user)

        AuditLog.log(
            action="physiotherapy_order_status_change",
            user=request.user,
            resource_type="PhysiotherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "old_status": old_status,
                "new_status": new_status,
                "notes": notes,
            },
        )

        return Response(PhysiotherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def assign_therapist(self, request, pk=None):
        """
        Assign a physiotherapist to the order.

        POST /api/physiotherapy/orders/{id}/assign_therapist/
        Body: {"assigned_therapist": <user_id>}
        """
        order = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        therapist = serializer.validated_data["assigned_therapist"]
        old_therapist = order.assigned_therapist

        order.assigned_therapist = therapist
        order.save(update_fields=["assigned_therapist"])

        AuditLog.log(
            action="physiotherapy_order_assign_therapist",
            user=request.user,
            resource_type="PhysiotherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "old_therapist_id": old_therapist.id if old_therapist else None,
                "new_therapist_id": therapist.id,
                "therapist_name": f"{therapist.first_name} {therapist.last_name}",
            },
        )

        return Response(PhysiotherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve a pending order.

        POST /api/physiotherapy/orders/{id}/approve/
        """
        order = self.get_object()

        if order.status != "PENDING":
            return Response(
                {"error": f"Order must be in PENDING status. Current status: {order.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.update_status("APPROVED", user=request.user)

        AuditLog.log(
            action="physiotherapy_order_approve",
            user=request.user,
            resource_type="PhysiotherapyOrder",
            resource_id=order.id,
            details={"order_number": order.order_number},
        )

        return Response(PhysiotherapyOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def generate_sessions(self, request, pk=None):
        """
        Generate all scheduled sessions for an approved order.

        POST /api/physiotherapy/orders/{id}/generate_sessions/
        """
        from datetime import timedelta

        order = self.get_object()

        if order.status not in ["APPROVED", "IN_PROGRESS"]:
            return Response(
                {"error": "Order must be APPROVED or IN_PROGRESS to generate sessions"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_count = order.sessions.count()
        if existing_count >= order.total_sessions:
            return Response(
                {"error": f"All {order.total_sessions} sessions already exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate session dates based on frequency
        start_date = order.start_date or request.data.get("start_date")
        if not start_date:
            return Response(
                {"error": "start_date is required to generate sessions"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if isinstance(start_date, str):
            from datetime import datetime

            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()

        # Parse frequency to determine interval
        frequency = order.frequency.lower()
        if "daily" in frequency:
            interval_days = 1
        elif "3x" in frequency or "three" in frequency:
            interval_days = 2  # 3x per week = every 2-3 days
        elif "2x" in frequency or "twice" in frequency:
            interval_days = 3  # 2x per week = every 3-4 days
        elif "weekly" in frequency or "1x" in frequency:
            interval_days = 7
        else:
            interval_days = 3  # Default to twice weekly

        sessions_created = []
        current_date = start_date
        therapist = order.assigned_therapist

        for i in range(existing_count + 1, order.total_sessions + 1):
            session = PhysiotherapySession.objects.create(
                order=order,
                therapist=therapist or request.user,
                session_number=i,
                scheduled_date=current_date,
            )
            sessions_created.append(session)
            current_date += timedelta(days=interval_days)

        # Update order status to IN_PROGRESS
        if order.status == "APPROVED":
            order.status = "IN_PROGRESS"
            order.start_date = start_date
            order.expected_end_date = current_date - timedelta(days=interval_days)
            order.save(update_fields=["status", "start_date", "expected_end_date"])

        AuditLog.log(
            action="physiotherapy_sessions_generated",
            user=request.user,
            resource_type="PhysiotherapyOrder",
            resource_id=order.id,
            details={
                "order_number": order.order_number,
                "sessions_created": len(sessions_created),
                "start_date": str(start_date),
            },
        )

        return Response(
            {
                "message": f"Generated {len(sessions_created)} sessions",
                "sessions_created": len(sessions_created),
                "total_sessions": order.total_sessions,
                "order": PhysiotherapyOrderSerializer(order).data,
            }
        )

    @action(detail=False, methods=["get"])
    def my_assignments(self, request):
        """
        Get orders assigned to the current user (therapist view).

        GET /api/physiotherapy/orders/my_assignments/
        """
        orders = self.get_queryset().filter(
            assigned_therapist=request.user,
            status__in=["APPROVED", "IN_PROGRESS"],
        )
        serializer = PhysiotherapyOrderListSerializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def pending_approval(self, request):
        """
        Get orders pending approval.

        GET /api/physiotherapy/orders/pending_approval/
        """
        orders = self.get_queryset().filter(status="PENDING")
        serializer = PhysiotherapyOrderListSerializer(orders, many=True)
        return Response(serializer.data)


class PhysiotherapySessionFilter(django_filters.FilterSet):
    """Filter for PhysiotherapySession."""

    order = django_filters.NumberFilter()
    therapist = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    scheduled_from = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    scheduled_to = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")
    is_billed = django_filters.BooleanFilter()

    class Meta:
        model = PhysiotherapySession
        fields = ["order", "therapist", "status", "is_billed"]


class PhysiotherapySessionViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing physiotherapy sessions.

    Provides CRUD operations plus custom actions for:
    - Starting a session
    - Completing a session
    - Viewing today's schedule
    """

    tenant_facility_chain = "order__facility"
    tenant_org_chain = "order__organization"

    queryset = PhysiotherapySession.objects.select_related(
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
    filterset_class = PhysiotherapySessionFilter
    search_fields = [
        "order__order_number",
        "order__patient__first_name",
        "order__patient__last_name",
    ]
    ordering_fields = ["scheduled_date", "session_number", "status"]
    ordering = ["scheduled_date", "scheduled_time"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "create":
            return PhysiotherapySessionCreateSerializer
        if self.action == "complete":
            return PhysiotherapySessionCompleteSerializer
        return PhysiotherapySessionSerializer

    def perform_create(self, serializer):
        """Create session and log audit."""
        session = serializer.save()
        AuditLog.log(
            action="physiotherapy_session_create",
            user=self.request.user,
            resource_type="PhysiotherapySession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
                "scheduled_date": str(session.scheduled_date),
            },
        )
        # Store for response serialization
        self._created_session = session

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_session"):
            response.data = PhysiotherapySessionSerializer(self._created_session).data
        return response

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start a scheduled session.

        POST /api/physiotherapy/sessions/{id}/start/
        """
        session = self.get_object()

        if session.status != "SCHEDULED":
            return Response(
                {"error": f"Session must be SCHEDULED. Current status: {session.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "IN_PROGRESS"
        session.save(update_fields=["status"])

        AuditLog.log(
            action="physiotherapy_session_start",
            user=request.user,
            resource_type="PhysiotherapySession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
            },
        )

        return Response(PhysiotherapySessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete a session with documentation.

        POST /api/physiotherapy/sessions/{id}/complete/
        Body: {session completion data}
        """
        session = self.get_object()

        if session.status not in ["SCHEDULED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Session cannot be completed. Current status: {session.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(session, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        session.complete_session(user=request.user)

        AuditLog.log(
            action="physiotherapy_session_complete",
            user=request.user,
            resource_type="PhysiotherapySession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
                "outcome": session.outcome,
                "pain_improvement": session.pain_improvement,
            },
        )

        return Response(PhysiotherapySessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel a scheduled session.

        POST /api/physiotherapy/sessions/{id}/cancel/
        Body: {"reason": "Cancellation reason"}
        """
        session = self.get_object()

        if session.status not in ["SCHEDULED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Session cannot be cancelled. Current status: {session.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "")
        session.status = "CANCELLED"
        session.save(update_fields=["status"])

        AuditLog.log(
            action="physiotherapy_session_cancel",
            user=request.user,
            resource_type="PhysiotherapySession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
                "reason": reason,
            },
        )

        return Response(PhysiotherapySessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def no_show(self, request, pk=None):
        """
        Mark a session as no-show.

        POST /api/physiotherapy/sessions/{id}/no_show/
        """
        session = self.get_object()

        if session.status != "SCHEDULED":
            return Response(
                {"error": "Only scheduled sessions can be marked as no-show"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "NO_SHOW"
        session.save(update_fields=["status"])

        AuditLog.log(
            action="physiotherapy_session_no_show",
            user=request.user,
            resource_type="PhysiotherapySession",
            resource_id=session.id,
            details={
                "order_number": session.order.order_number,
                "session_number": session.session_number,
            },
        )

        return Response(PhysiotherapySessionSerializer(session).data)

    @action(detail=False, methods=["get"])
    def today(self, request):
        """
        Get today's scheduled sessions.

        GET /api/physiotherapy/sessions/today/
        """
        from datetime import date

        sessions = self.get_queryset().filter(
            scheduled_date=date.today(),
            status__in=["SCHEDULED", "IN_PROGRESS"],
        )

        # Optionally filter by therapist
        therapist_id = request.query_params.get("therapist")
        if therapist_id:
            sessions = sessions.filter(therapist_id=therapist_id)

        serializer = PhysiotherapySessionSerializer(sessions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def my_schedule(self, request):
        """
        Get current user's scheduled sessions.

        GET /api/physiotherapy/sessions/my_schedule/
        """
        from datetime import date, timedelta

        # Default to next 7 days
        start_date = date.today()
        end_date = start_date + timedelta(days=7)

        sessions = self.get_queryset().filter(
            therapist=request.user,
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date,
            status__in=["SCHEDULED", "IN_PROGRESS"],
        )
        serializer = PhysiotherapySessionSerializer(sessions, many=True)
        return Response(serializer.data)
