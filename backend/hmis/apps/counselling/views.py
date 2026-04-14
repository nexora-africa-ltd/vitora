"""
Views for the counselling module.

Provides REST API endpoints for:
- CounsellingType (catalog management)
- CounsellingReferral (referral orders)
- CounsellingSession (counselling sessions)
"""

from datetime import date, timedelta

from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.counselling.models import (
    CounsellingReferral,
    CounsellingSession,
    CounsellingType,
)
from hmis.apps.counselling.serializers import (
    CounsellingReferralAssignCounsellorSerializer,
    CounsellingReferralCreateSerializer,
    CounsellingReferralGenerateSessionsSerializer,
    CounsellingReferralListSerializer,
    CounsellingReferralSerializer,
    CounsellingReferralUpdateStatusSerializer,
    CounsellingSessionCompleteSerializer,
    CounsellingSessionCreateSerializer,
    CounsellingSessionListSerializer,
    CounsellingSessionSerializer,
    CounsellingTypeListSerializer,
    CounsellingTypeSerializer,
)


class CounsellingTypeFilter(django_filters.FilterSet):
    """Filter for CounsellingType."""

    category = django_filters.CharFilter(lookup_expr="iexact")
    sha_claimable = django_filters.BooleanFilter()
    is_active = django_filters.BooleanFilter()
    requires_privacy = django_filters.BooleanFilter()

    class Meta:
        model = CounsellingType
        fields = ["category", "sha_claimable", "is_active", "requires_privacy"]


class CounsellingTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing counselling types (catalog).

    Provides CRUD operations for the counselling type catalog.
    """

    queryset = CounsellingType.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = CounsellingTypeFilter
    search_fields = ["code", "name", "description"]
    ordering_fields = ["name", "category", "cost_per_session", "created_at"]
    ordering = ["category", "name"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return CounsellingTypeListSerializer
        return CounsellingTypeSerializer

    def get_queryset(self):
        """Filter queryset based on active status for non-staff users."""
        qs = super().get_queryset()
        if not self.request.user.is_staff:
            qs = qs.filter(is_active=True)
        return qs


class CounsellingReferralFilter(django_filters.FilterSet):
    """Filter for CounsellingReferral."""

    patient = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    urgency = django_filters.CharFilter(lookup_expr="iexact")
    reason = django_filters.CharFilter(lookup_expr="iexact")
    assigned_counsellor = django_filters.NumberFilter()
    counselling_type = django_filters.NumberFilter()
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    is_paid = django_filters.BooleanFilter()
    is_sensitive = django_filters.BooleanFilter()

    class Meta:
        model = CounsellingReferral
        fields = [
            "patient",
            "status",
            "urgency",
            "reason",
            "assigned_counsellor",
            "counselling_type",
            "is_paid",
            "is_sensitive",
        ]


class CounsellingReferralViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing counselling referrals.

    Provides CRUD operations plus custom actions for:
    - Accepting referrals
    - Assigning counsellors
    - Updating status
    - Generating sessions
    - Starting, completing, and cancelling referrals
    """

    queryset = CounsellingReferral.objects.select_related(
        "patient",
        "encounter",
        "counselling_type",
        "referred_by",
        "assigned_counsellor",
    ).prefetch_related("sessions")
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = CounsellingReferralFilter
    search_fields = [
        "referral_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_summary",
        "presenting_issues",
    ]
    ordering_fields = ["created_at", "status", "urgency", "total_sessions"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return CounsellingReferralListSerializer
        if self.action == "create":
            return CounsellingReferralCreateSerializer
        if self.action == "update_status":
            return CounsellingReferralUpdateStatusSerializer
        if self.action == "assign_counsellor":
            return CounsellingReferralAssignCounsellorSerializer
        if self.action == "generate_sessions":
            return CounsellingReferralGenerateSessionsSerializer
        return CounsellingReferralSerializer

    def get_queryset(self):
        """Filter sensitive referrals based on user permissions."""
        qs = super().get_queryset()

        # Filter out sensitive referrals if user doesn't have permission
        if not self.request.user.has_perm("counselling.view_sensitive_counselling_referral"):
            qs = qs.filter(is_sensitive=False)

        return qs

    def perform_create(self, serializer):
        """Create referral and log audit."""
        referral = serializer.save(referred_by=self.request.user)
        AuditLog.log(
            action="counselling_referral_create",
            user=self.request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "patient_id": referral.patient_id,
                "reason": referral.reason,
                "urgency": referral.urgency,
            },
        )
        self._created_referral = referral

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_referral"):
            response.data = CounsellingReferralSerializer(self._created_referral).data
        return response

    def perform_update(self, serializer):
        """Update referral and log audit."""
        referral = serializer.save()
        AuditLog.log(
            action="counselling_referral_update",
            user=self.request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "changes": serializer.validated_data,
            },
        )

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """
        Accept a pending referral.

        POST /api/counselling/referrals/{id}/accept/
        """
        referral = self.get_object()

        if referral.status != "PENDING":
            return Response(
                {"error": f"Cannot accept referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = referral.update_status("ACCEPTED", user=request.user)

        AuditLog.log(
            action="counselling_referral_accept",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def assign_counsellor(self, request, pk=None):
        """
        Assign a counsellor to the referral.

        POST /api/counselling/referrals/{id}/assign_counsellor/
        Body: {"assigned_counsellor": <user_id>}
        """
        referral = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        counsellor = serializer.validated_data["assigned_counsellor"]
        old_counsellor = referral.assigned_counsellor

        referral.assigned_counsellor = counsellor
        referral.save(update_fields=["assigned_counsellor"])

        AuditLog.log(
            action="counselling_referral_assign_counsellor",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_counsellor_id": old_counsellor.id if old_counsellor else None,
                "new_counsellor_id": counsellor.id,
                "counsellor_name": f"{counsellor.first_name} {counsellor.last_name}",
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """
        Update referral status with validation.

        POST /api/counselling/referrals/{id}/update_status/
        Body: {"status": "IN_PROGRESS", "notes": "Optional notes"}
        """
        referral = self.get_object()
        serializer = self.get_serializer(referral, data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        notes = serializer.validated_data.get("notes", "")

        old_status = referral.update_status(new_status, user=request.user)

        AuditLog.log(
            action="counselling_referral_status_change",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
                "new_status": new_status,
                "notes": notes,
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start counselling (move to IN_PROGRESS).

        POST /api/counselling/referrals/{id}/start/
        """
        referral = self.get_object()

        if referral.status != "ACCEPTED":
            return Response(
                {"error": f"Cannot start referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = referral.update_status("IN_PROGRESS", user=request.user)

        AuditLog.log(
            action="counselling_referral_start",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete the counselling referral.

        POST /api/counselling/referrals/{id}/complete/
        Body: {"completion_notes": "Optional summary notes"}
        """
        referral = self.get_object()

        if referral.status != "IN_PROGRESS":
            return Response(
                {"error": f"Cannot complete referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        completion_notes = request.data.get("completion_notes", "")
        if completion_notes:
            referral.completion_notes = completion_notes

        old_status = referral.update_status("COMPLETED", user=request.user)

        AuditLog.log(
            action="counselling_referral_complete",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
                "sessions_completed": referral.sessions_completed,
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel the counselling referral.

        POST /api/counselling/referrals/{id}/cancel/
        Body: {"cancellation_reason": "Reason for cancellation"}
        """
        referral = self.get_object()

        if referral.status in ["COMPLETED", "CANCELLED"]:
            return Response(
                {"error": f"Cannot cancel referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cancellation_reason = request.data.get("cancellation_reason", "")
        if not cancellation_reason:
            return Response(
                {"error": "Cancellation reason is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        referral.cancellation_reason = cancellation_reason
        old_status = referral.status
        referral.status = "CANCELLED"
        referral.save()

        AuditLog.log(
            action="counselling_referral_cancel",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
                "cancellation_reason": cancellation_reason,
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def generate_sessions(self, request, pk=None):
        """
        Generate scheduled sessions for this referral.

        POST /api/counselling/referrals/{id}/generate_sessions/
        Body: {"num_sessions": 4, "start_date": "2026-03-01", "frequency_days": 7}
        """
        referral = self.get_object()

        if referral.status not in ["ACCEPTED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot generate sessions for referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        num_sessions = serializer.validated_data.get("num_sessions", referral.total_sessions)
        start_date = serializer.validated_data.get("start_date", date.today())
        frequency_days = serializer.validated_data.get("frequency_days", 7)

        # Get existing session count
        existing_count = referral.sessions.count()

        # Determine counsellor
        counsellor = referral.assigned_counsellor or request.user

        # Generate sessions
        sessions_created = []
        for i in range(num_sessions):
            session_date = start_date + timedelta(days=i * frequency_days)
            session = CounsellingSession.objects.create(
                referral=referral,
                counsellor=counsellor,
                session_sequence=existing_count + i + 1,
                scheduled_date=session_date,
                status="SCHEDULED",
            )
            sessions_created.append(session)

        # Update total sessions if needed
        if referral.total_sessions < existing_count + num_sessions:
            referral.total_sessions = existing_count + num_sessions
            referral.save(update_fields=["total_sessions"])

        AuditLog.log(
            action="counselling_sessions_generate",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "sessions_created": len(sessions_created),
                "start_date": str(start_date),
                "frequency_days": frequency_days,
            },
        )

        return Response({
            "message": f"Generated {len(sessions_created)} session(s)",
            "sessions": CounsellingSessionListSerializer(sessions_created, many=True).data,
            "referral": CounsellingReferralSerializer(referral).data,
        })

    @action(detail=True, methods=["post"])
    def no_show(self, request, pk=None):
        """
        Mark referral as no-show (patient didn't attend).

        POST /api/counselling/referrals/{id}/no_show/
        """
        referral = self.get_object()

        if referral.status not in ["ACCEPTED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot mark no-show for referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = referral.status
        referral.status = "NO_SHOW"
        referral.save()

        AuditLog.log(
            action="counselling_referral_no_show",
            user=request.user,
            resource_type="CounsellingReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
            },
        )

        return Response(CounsellingReferralSerializer(referral).data)


class CounsellingSessionFilter(django_filters.FilterSet):
    """Filter for CounsellingSession."""

    referral = django_filters.NumberFilter()
    counsellor = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    scheduled_date = django_filters.DateFilter()
    scheduled_from = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    scheduled_to = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")
    is_billed = django_filters.BooleanFilter()
    is_sensitive = django_filters.BooleanFilter()
    risk_level = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = CounsellingSession
        fields = [
            "referral",
            "counsellor",
            "status",
            "is_billed",
            "is_sensitive",
            "risk_level",
        ]


class CounsellingSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing counselling sessions.

    Provides CRUD operations plus custom actions for:
    - Starting sessions
    - Completing sessions
    - Cancelling sessions
    - Recording no-shows
    - Rescheduling sessions
    """

    queryset = CounsellingSession.objects.select_related(
        "referral",
        "referral__patient",
        "counsellor",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = CounsellingSessionFilter
    search_fields = [
        "session_number",
        "referral__referral_number",
        "referral__patient__first_name",
        "referral__patient__last_name",
        "referral__patient__mrn",
        "topics_discussed",
    ]
    ordering_fields = ["scheduled_date", "session_sequence", "status", "created_at"]
    ordering = ["scheduled_date", "session_sequence"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return CounsellingSessionListSerializer
        if self.action == "create":
            return CounsellingSessionCreateSerializer
        if self.action == "complete":
            return CounsellingSessionCompleteSerializer
        return CounsellingSessionSerializer

    def get_queryset(self):
        """Filter sensitive sessions based on user permissions."""
        qs = super().get_queryset()

        # Filter out sensitive sessions if user doesn't have permission
        if not self.request.user.has_perm("counselling.view_sensitive_counselling_session"):
            qs = qs.filter(is_sensitive=False)

        return qs

    def perform_create(self, serializer):
        """Create session and log audit."""
        session = serializer.save()
        AuditLog.log(
            action="counselling_session_create",
            user=self.request.user,
            resource_type="CounsellingSession",
            resource_id=session.id,
            details={
                "session_number": session.session_number,
                "referral_number": session.referral.referral_number,
                "scheduled_date": str(session.scheduled_date),
            },
        )
        self._created_session = session

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_session"):
            response.data = CounsellingSessionSerializer(self._created_session).data
        return response

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start the counselling session.

        POST /api/counselling/sessions/{id}/start/
        """
        session = self.get_object()

        if session.status != "SCHEDULED":
            return Response(
                {"error": f"Cannot start session with status '{session.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "IN_PROGRESS"
        session.actual_date = date.today()
        from datetime import datetime as dt
        session.actual_start_time = dt.now().time()
        session.save()

        # Update referral status if needed
        if session.referral.status == "ACCEPTED":
            session.referral.update_status("IN_PROGRESS", user=request.user)

        AuditLog.log(
            action="counselling_session_start",
            user=request.user,
            resource_type="CounsellingSession",
            resource_id=session.id,
            details={
                "session_number": session.session_number,
                "referral_number": session.referral.referral_number,
            },
        )

        return Response(CounsellingSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete the counselling session.

        POST /api/counselling/sessions/{id}/complete/
        Body: {"progress_notes": "Session notes", "outcome": "GOOD_PROGRESS", ...}
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

        # Mark session as completed
        session.complete(user=request.user)

        AuditLog.log(
            action="counselling_session_complete",
            user=request.user,
            resource_type="CounsellingSession",
            resource_id=session.id,
            details={
                "session_number": session.session_number,
                "referral_number": session.referral.referral_number,
                "outcome": session.outcome,
                "risk_level": session.risk_level,
            },
        )

        return Response(CounsellingSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel the counselling session.

        POST /api/counselling/sessions/{id}/cancel/
        """
        session = self.get_object()

        if session.status in ["COMPLETED", "CANCELLED"]:
            return Response(
                {"error": f"Cannot cancel session with status '{session.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "CANCELLED"
        session.save()

        AuditLog.log(
            action="counselling_session_cancel",
            user=request.user,
            resource_type="CounsellingSession",
            resource_id=session.id,
            details={
                "session_number": session.session_number,
                "referral_number": session.referral.referral_number,
            },
        )

        return Response(CounsellingSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def no_show(self, request, pk=None):
        """
        Mark session as no-show (patient didn't attend).

        POST /api/counselling/sessions/{id}/no_show/
        """
        session = self.get_object()

        if session.status not in ["SCHEDULED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot mark no-show for session with status '{session.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.status = "NO_SHOW"
        session.save()

        AuditLog.log(
            action="counselling_session_no_show",
            user=request.user,
            resource_type="CounsellingSession",
            resource_id=session.id,
            details={
                "session_number": session.session_number,
                "referral_number": session.referral.referral_number,
            },
        )

        return Response(CounsellingSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        """
        Reschedule the counselling session.

        POST /api/counselling/sessions/{id}/reschedule/
        Body: {"scheduled_date": "2026-03-15", "scheduled_time": "10:00"}
        """
        from datetime import datetime as dt

        session = self.get_object()

        if session.status in ["COMPLETED"]:
            return Response(
                {"error": "Cannot reschedule a completed session"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_date = request.data.get("scheduled_date")
        new_time = request.data.get("scheduled_time")

        if not new_date:
            return Response(
                {"error": "New scheduled date is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Parse date string to date object
        if isinstance(new_date, str):
            new_date = dt.strptime(new_date, "%Y-%m-%d").date()

        old_date = session.scheduled_date
        old_time = session.scheduled_time

        session.status = "RESCHEDULED"
        session.save(update_fields=["status"])

        # Create new scheduled session
        new_session = CounsellingSession.objects.create(
            referral=session.referral,
            counsellor=session.counsellor,
            session_sequence=session.session_sequence,
            scheduled_date=new_date,
            scheduled_time=new_time if new_time else None,
            status="SCHEDULED",
        )

        AuditLog.log(
            action="counselling_session_reschedule",
            user=request.user,
            resource_type="CounsellingSession",
            resource_id=session.id,
            details={
                "session_number": session.session_number,
                "old_date": str(old_date),
                "old_time": str(old_time) if old_time else None,
                "new_date": str(new_date),
                "new_time": str(new_time) if new_time else None,
                "new_session_id": new_session.id,
            },
        )

        return Response({
            "message": "Session rescheduled successfully",
            "old_session": CounsellingSessionSerializer(session).data,
            "new_session": CounsellingSessionSerializer(new_session).data,
        })
