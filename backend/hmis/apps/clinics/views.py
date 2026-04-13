"""
Views and ViewSets for Clinic API endpoints.

This module provides DRF views for:
- Clinic CRUD operations
- ClinicSession management (nested under clinics)
- ClinicVisit queue operations
- ClinicStaff assignments (nested under clinics)
- ClinicSchedule management (nested under clinics)
- ClinicEnrollment chronic care tracking
"""

from django.db import models
from django.db.models import Avg, Q
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.mixins import TenantScopedViewMixin

from .models import (
    Clinic,
    ClinicEnrollment,
    ClinicRoom,
    ClinicSchedule,
    ClinicSession,
    ClinicStaff,
    ClinicVisit,
    MonthlyClinicReport,
)
from .serializers import (
    ClinicEnrollmentListSerializer,
    ClinicEnrollmentSerializer,
    ClinicListSerializer,
    ClinicRoomCreateSerializer,
    ClinicRoomSerializer,
    ClinicScheduleSerializer,
    ClinicSerializer,
    ClinicSessionSerializer,
    ClinicStaffSerializer,
    ClinicVisitCreateSerializer,
    ClinicVisitReferSerializer,
    ClinicVisitSerializer,
    MonthlyClinicReportSerializer,
    QueueStatsSerializer,
)
from .services.reporting import generate_monthly_report

# =============================================================================
# Permissions
# =============================================================================


class IsAdminOrReadOnly(permissions.BasePermission):
    """Allow write operations only for admin/staff users."""

    def has_permission(self, request, view):
        """Check if user has permission."""
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class CanManageClinicStaff(permissions.BasePermission):
    """Permission for managing clinic staff assignments."""

    def has_permission(self, request, view):
        """Check if user can manage clinic staff."""
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and (
            request.user.is_staff or request.user.has_perm("clinics.manage_clinic_staff")
        )


class CanManageClinicSchedule(permissions.BasePermission):
    """Permission for managing clinic schedules."""

    def has_permission(self, request, view):
        """Check if user can manage schedules."""
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and (
            request.user.is_staff or request.user.has_perm("clinics.manage_clinic_schedule")
        )


# =============================================================================
# Filters
# =============================================================================


class ClinicFilter(filters.FilterSet):
    """Filter for Clinic queryset."""

    clinic_type = filters.CharFilter(field_name="clinic_type")
    status = filters.CharFilter(field_name="status")

    class Meta:
        """Meta options for ClinicFilter."""

        model = Clinic
        fields = ["clinic_type", "status"]


class ClinicVisitFilter(filters.FilterSet):
    """Filter for ClinicVisit queryset."""

    status = filters.CharFilter(method="filter_status")
    clinic = filters.NumberFilter(field_name="session__clinic__id")
    clinic_type = filters.CharFilter(method="filter_clinic_type")
    session = filters.NumberFilter(field_name="session__id")
    date = filters.DateFilter(field_name="session__session_date")
    patient = filters.NumberFilter(field_name="patient__id")

    class Meta:
        """Meta options for ClinicVisitFilter."""

        model = ClinicVisit
        fields = ["status", "clinic", "clinic_type", "session", "date", "patient"]

    def filter_status(self, queryset, name, value):
        """Filter by status, supporting comma-separated values."""
        if not value:
            return queryset
        statuses = [s.strip() for s in value.split(",") if s.strip()]
        if len(statuses) == 1:
            return queryset.filter(status=statuses[0])
        return queryset.filter(status__in=statuses)

    def filter_clinic_type(self, queryset, name, value):
        """Filter by clinic type, supporting comma-separated values."""
        if not value:
            return queryset
        clinic_types = [ct.strip() for ct in value.split(",") if ct.strip()]
        if len(clinic_types) == 1:
            return queryset.filter(session__clinic__clinic_type=clinic_types[0])
        return queryset.filter(session__clinic__clinic_type__in=clinic_types)


class ClinicEnrollmentFilter(filters.FilterSet):
    """Filter for ClinicEnrollment queryset."""

    clinic = filters.NumberFilter(field_name="clinic__id")
    clinic_type = filters.CharFilter(field_name="clinic__clinic_type")
    status = filters.CharFilter(field_name="status")
    patient = filters.NumberFilter(field_name="patient__id")
    is_overdue = filters.BooleanFilter(method="filter_is_overdue")
    is_defaulter = filters.BooleanFilter(method="filter_is_defaulter")
    enrollment_type = filters.CharFilter(method="filter_enrollment_type")

    class Meta:
        """Meta options for ClinicEnrollmentFilter."""

        model = ClinicEnrollment
        fields = ["clinic", "clinic_type", "status", "patient", "is_overdue", "is_defaulter"]

    def filter_is_overdue(self, queryset, name, value):
        """Filter enrollments by overdue status."""
        today = timezone.localdate()
        if value:
            return queryset.filter(
                status="ACTIVE",
                next_appointment__lt=today,
            )
        return queryset.filter(
            models.Q(next_appointment__gte=today) | models.Q(next_appointment__isnull=True)
        )

    def filter_is_defaulter(self, queryset, name, value):
        """
        Filter enrollments by defaulter status.

        A defaulter is overdue by 2+ appointment cycles.
        """
        today = timezone.localdate()
        if not value:
            return queryset

        # Get active enrollments with appointments
        active = queryset.filter(
            status="ACTIVE",
            next_appointment__isnull=False,
        )

        # Filter to those overdue by 2+ appointment cycles
        defaulter_ids = []
        for enrollment in active:
            if enrollment.next_appointment:
                days_overdue = (today - enrollment.next_appointment).days
                if days_overdue >= (enrollment.appointment_interval_days * 2):
                    defaulter_ids.append(enrollment.id)

        return queryset.filter(id__in=defaulter_ids)

    def filter_enrollment_type(self, queryset, name, value):
        """Filter by enrollment type (CCC, ANC, DIABETIC, etc.)."""
        type_to_clinic_mapping = {
            "CCC": ["CCC"],
            "ANC": ["ANC", "PNC"],
            "DIABETIC": ["DIABETIC"],
            "HYPERTENSION": ["HYPERTENSION"],
            "TB": ["TB"],
        }
        clinic_types = type_to_clinic_mapping.get(value.upper(), [])
        if clinic_types:
            return queryset.filter(clinic__clinic_type__in=clinic_types)
        return queryset


# =============================================================================
# ClinicViewSet
# =============================================================================


class ClinicViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Clinic CRUD operations.

    Endpoints:
    - GET /api/clinics/ - List all clinics
    - POST /api/clinics/ - Create clinic (admin only)
    - GET /api/clinics/{id}/ - Get clinic details
    - PATCH /api/clinics/{id}/ - Update clinic (admin only)
    - DELETE /api/clinics/{id}/ - Delete clinic (admin only)

    Custom actions:
    - GET /api/clinics/{id}/queue/ - Get clinic queue
    - POST /api/clinics/{id}/queue/ - Add patient to queue
    - GET /api/clinics/{id}/queue/stats/ - Get queue statistics
    """

    tenant_scope = "facility"  # Clinics are facility-scoped

    queryset = Clinic.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    filterset_class = ClinicFilter
    search_fields = ["name", "code", "clinic_type", "description"]

    def get_permissions(self):
        """Return appropriate permissions for each action."""
        if self.action in ["queue", "queue_stats", "regenerate_monthly_report"]:
            # Allow authenticated users to access queue endpoints
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        """Return appropriate serializer class."""
        if self.action == "list":
            return ClinicListSerializer
        return ClinicSerializer

    def get_queryset(self):
        """Filter out sensitive clinics for users without permission."""
        queryset = super().get_queryset()
        user = self.request.user

        # Filter sensitive clinics
        if not user.is_staff:
            sensitive_clinics = queryset.filter(is_sensitive=True)
            allowed_ids = []
            for clinic in sensitive_clinics:
                if clinic.required_permission:
                    if user.has_perm(clinic.required_permission):
                        allowed_ids.append(clinic.id)
                else:
                    allowed_ids.append(clinic.id)

            queryset = queryset.filter(Q(is_sensitive=False) | Q(id__in=allowed_ids))

        return queryset

    @action(detail=False, methods=["get"], url_path="my-assignments")
    def my_assignments(self, request):
        """Return clinics the current user is assigned to via ClinicStaff."""
        assignments = (
            ClinicStaff.objects.filter(user=request.user, is_active=True)
            .select_related("clinic")
            .order_by("-is_primary", "clinic__name")
        )
        serializer = ClinicStaffSerializer(assignments, many=True)
        return Response({"results": serializer.data})

    @action(detail=True, methods=["get", "post"])
    def queue(self, request, pk=None):
        """Get or add to clinic queue."""
        clinic = self.get_object()

        if request.method == "GET":
            # Get or create today's session
            session, _ = clinic.get_or_create_session(timezone.localdate())

            # Get waiting visits ordered by priority and queue number
            visits = ClinicVisit.objects.filter(
                session=session,
                status__in=["REGISTERED", "WAITING", "CALLED"],
            ).order_by("priority", "queue_number")

            serializer = ClinicVisitSerializer(visits, many=True)
            return Response({"results": serializer.data})

        elif request.method == "POST":
            # Get or create today's session
            session, _ = clinic.get_or_create_session(timezone.localdate())

            # Create visit
            data = request.data.copy()
            data["session"] = session.pk

            serializer = ClinicVisitCreateSerializer(data=data, context={"request": request})
            serializer.is_valid(raise_exception=True)
            visit = serializer.save()

            # Return full visit data including queue_number
            return Response(
                ClinicVisitSerializer(visit).data,
                status=status.HTTP_201_CREATED,
            )

    @action(detail=True, methods=["get"], url_path="queue/stats")
    def queue_stats(self, request, pk=None):
        """Get queue statistics for today's session."""
        clinic = self.get_object()
        session, _ = clinic.get_or_create_session(timezone.localdate())

        visits = ClinicVisit.objects.filter(session=session)

        # Calculate wait times for completed visits
        completed_visits = visits.filter(
            status="COMPLETED",
            consultation_started_at__isnull=False,
            registered_at__isnull=False,
        )
        avg_wait = (
            completed_visits.annotate(
                wait=models.ExpressionWrapper(
                    models.F("consultation_started_at") - models.F("registered_at"),
                    output_field=models.DurationField(),
                )
            )
            .aggregate(avg_wait=Avg("wait"))
            .get("avg_wait")
        )
        avg_wait_minutes = avg_wait.total_seconds() / 60 if avg_wait else 0

        stats = {
            "waiting": visits.filter(status__in=["REGISTERED", "WAITING"]).count(),
            "called": visits.filter(status="CALLED").count(),
            "in_consultation": visits.filter(status="IN_CONSULTATION").count(),
            "completed": visits.filter(status="COMPLETED").count(),
            "referred": visits.filter(status="REFERRED").count(),
            "no_show": visits.filter(status="NO_SHOW").count(),
            "total": visits.count(),
            "average_wait_time": round(avg_wait_minutes, 1),
        }

        serializer = QueueStatsSerializer(stats)
        return Response(serializer.data)

    @extend_schema(operation_id="clinic_monthly_reports_list")
    @action(detail=True, methods=["get"], url_path="reports/monthly")
    def monthly_reports(self, request, pk=None):
        """List monthly reports for a clinic."""
        clinic = self.get_object()
        reports = MonthlyClinicReport.objects.filter(clinic=clinic).order_by("-year", "-month")
        serializer = MonthlyClinicReportSerializer(reports, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(operation_id="clinic_monthly_report_detail")
    @action(
        detail=True,
        methods=["get"],
        url_path=r"reports/monthly/(?P<year>\d{4})/(?P<month>\d{1,2})",
    )
    def monthly_report_detail(self, request, pk=None, year=None, month=None):
        """Get (or generate) a clinic report for a specific month."""
        clinic = self.get_object()
        report = generate_monthly_report(clinic, year=int(year), month=int(month))
        serializer = MonthlyClinicReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"reports/monthly/(?P<year>\d{4})/(?P<month>\d{1,2})/regenerate",
    )
    def regenerate_monthly_report(self, request, pk=None, year=None, month=None):
        """Regenerate a clinic monthly report for a specific month."""
        clinic = self.get_object()
        report = generate_monthly_report(clinic, year=int(year), month=int(month))
        serializer = MonthlyClinicReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)


# =============================================================================
# ClinicSessionViewSet (Nested under Clinic)
# =============================================================================


class ClinicSessionFilter(filters.FilterSet):
    """Filter for ClinicSession queryset."""

    date_from = filters.DateFilter(field_name="session_date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="session_date", lookup_expr="lte")
    status = filters.CharFilter(field_name="status")

    class Meta:
        """Meta options for ClinicSessionFilter."""

        model = ClinicSession
        fields = ["date_from", "date_to", "status"]


class ClinicSessionViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for ClinicSession operations nested under clinic.

    Endpoints:
    - GET /api/clinics/{clinic_pk}/sessions/ - List clinic sessions
    - POST /api/clinics/{clinic_pk}/sessions/ - Create session
    - GET /api/clinics/{clinic_pk}/sessions/today/ - Get today's session
    - POST /api/clinics/{clinic_pk}/sessions/today/open/ - Open today's session
    - POST /api/clinics/{clinic_pk}/sessions/today/close/ - Close today's session
    """

    tenant_scope = "facility"  # Sessions are facility-scoped

    queryset = ClinicSession.objects.select_related("clinic").order_by("-session_date").all()
    serializer_class = ClinicSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ClinicSessionFilter

    def get_queryset(self):
        """Filter sessions by clinic, scoped by tenant."""
        clinic_pk = self.kwargs.get("clinic_pk")
        return super().get_queryset().filter(clinic_id=clinic_pk)

    def get_clinic(self):
        """Get the parent clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        return Clinic.objects.get(pk=clinic_pk)

    def perform_create(self, serializer):
        """Create session for the clinic with tenant context."""
        clinic = self.get_clinic()
        serializer.save(clinic=clinic, **self.get_tenant_save_kwargs())

    @action(detail=False, methods=["get"])
    def today(self, request, clinic_pk=None):
        """Get or create today's session."""
        clinic = Clinic.objects.get(pk=clinic_pk)
        session, _ = clinic.get_or_create_session(timezone.localdate())
        serializer = self.get_serializer(session)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="today/open")
    def open(self, request, clinic_pk=None):
        """Open today's session."""
        clinic = Clinic.objects.get(pk=clinic_pk)
        session, _ = clinic.get_or_create_session(timezone.localdate())
        session.open_session(request.user)
        serializer = self.get_serializer(session)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="today/close")
    def close(self, request, clinic_pk=None):
        """Close today's session."""
        clinic = Clinic.objects.get(pk=clinic_pk)
        session, _ = clinic.get_or_create_session(timezone.localdate())
        session.close_session(request.user)
        serializer = self.get_serializer(session)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="scheduled-orders")
    def scheduled_orders(self, request, clinic_pk=None, pk=None):
        """
        Return procedure orders scheduled for this session's clinic + date.

        These are patients who have procedures scheduled at this clinic on
        the session date but haven't checked in yet (no ClinicVisit).
        """
        from hmis.apps.procedures.models import ProcedureOrder
        from hmis.apps.procedures.serializers import ProcedureOrderListSerializer

        session = self.get_object()
        orders = ProcedureOrder.objects.filter(
            scheduled_clinic=session.clinic,
            scheduled_date=session.session_date,
        ).exclude(
            status__in=["COMPLETED", "CANCELLED"],
        ).select_related("procedure", "patient", "scheduled_clinic").order_by("scheduled_time")

        serializer = ProcedureOrderListSerializer(orders, many=True)
        return Response(serializer.data)


# =============================================================================
# ClinicVisitViewSet
# =============================================================================


class ClinicVisitViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for ClinicVisit CRUD and workflow actions.

    Endpoints:
    - GET /api/clinic-visits/ - List all visits (filtered)
    - POST /api/clinic-visits/ - Create visit
    - GET /api/clinic-visits/{id}/ - Get visit details
    - PATCH /api/clinic-visits/{id}/ - Update visit
    - POST /api/clinic-visits/{id}/call/ - Call patient
    - POST /api/clinic-visits/{id}/start/ - Start consultation
    - POST /api/clinic-visits/{id}/complete/ - Complete visit
    - POST /api/clinic-visits/{id}/refer/ - Refer to another clinic
    """

    tenant_scope = "facility"  # Visits are facility-scoped

    queryset = ClinicVisit.objects.select_related(
        "session__clinic",
        "patient",
        "assigned_clinician",
        "encounter",
        "anc_visit__registration",
        "pnc_visit__registration",
    ).all()
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ClinicVisitFilter

    def get_serializer_class(self):
        """Return appropriate serializer class."""
        if self.action == "create":
            return ClinicVisitCreateSerializer
        if self.action == "refer":
            return ClinicVisitReferSerializer
        return ClinicVisitSerializer

    def get_serializer_context(self):
        """Add request to serializer context."""
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def create(self, request, *args, **kwargs):
        """Create a clinic visit and return full serialized data."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = serializer.save(**self.get_tenant_save_kwargs())
        # Return full serializer data with queue_number
        return Response(
            ClinicVisitSerializer(visit).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def call(self, request, pk=None):
        """Call a patient for consultation."""
        visit = self.get_object()

        if visit.status not in ["REGISTERED", "WAITING"]:
            return Response(
                {"error": "Patient cannot be called from current status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        visit.call_patient(request.user)
        serializer = ClinicVisitSerializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start consultation for a visit."""
        visit = self.get_object()

        if visit.status not in ["CALLED", "WAITING", "REGISTERED"]:
            return Response(
                {"error": "Cannot start consultation from current status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        visit.start_consultation()
        serializer = ClinicVisitSerializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete a visit."""
        visit = self.get_object()

        if visit.status not in ["IN_CONSULTATION", "CALLED"]:
            return Response(
                {"error": "Cannot complete visit from current status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        visit.complete_visit()
        serializer = ClinicVisitSerializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def refer(self, request, pk=None):
        """Refer patient to another clinic."""
        visit = self.get_object()
        serializer = ClinicVisitReferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_clinic = serializer.validated_data["target_clinic"]
        reason = serializer.validated_data["reason"]

        new_visit = visit.refer_to_clinic(target_clinic, reason, request.user)

        response_data = ClinicVisitSerializer(visit).data
        response_data["new_visit_id"] = new_visit.id if new_visit else None

        return Response(response_data)


# =============================================================================
# ClinicStaffViewSet (Nested under Clinic)
# =============================================================================


class ClinicStaffViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ClinicStaff operations nested under clinic.

    Endpoints:
    - GET /api/clinics/{clinic_pk}/staff/ - List clinic staff
    - POST /api/clinics/{clinic_pk}/staff/ - Assign staff
    - DELETE /api/clinics/{clinic_pk}/staff/{pk}/ - Remove staff
    """

    serializer_class = ClinicStaffSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageClinicStaff]

    def get_queryset(self):
        """Filter staff by clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        return ClinicStaff.objects.filter(clinic_id=clinic_pk).select_related("user", "clinic")

    def perform_create(self, serializer):
        """Create staff assignment for the clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        clinic = Clinic.objects.get(pk=clinic_pk)
        serializer.save(clinic=clinic)


# =============================================================================
# ClinicScheduleViewSet (Nested under Clinic)
# =============================================================================


class ClinicScheduleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ClinicSchedule operations nested under clinic.

    Endpoints:
    - GET /api/clinics/{clinic_pk}/schedule/ - Get clinic schedule
    - POST /api/clinics/{clinic_pk}/schedule/ - Add schedule entry
    - PATCH /api/clinics/{clinic_pk}/schedule/{pk}/ - Update schedule
    - DELETE /api/clinics/{clinic_pk}/schedule/{pk}/ - Delete schedule
    """

    serializer_class = ClinicScheduleSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageClinicSchedule]

    def get_queryset(self):
        """Filter schedules by clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        return ClinicSchedule.objects.filter(clinic_id=clinic_pk).select_related("clinic")

    def perform_create(self, serializer):
        """Create schedule for the clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        clinic = Clinic.objects.get(pk=clinic_pk)
        serializer.save(clinic=clinic)


# =============================================================================
# ClinicEnrollmentViewSet
# =============================================================================


class ClinicEnrollmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ClinicEnrollment CRUD and query operations.

    Endpoints:
    - GET /api/clinic-enrollments/ - List enrollments
    - POST /api/clinic-enrollments/ - Create enrollment
    - GET /api/clinic-enrollments/{id}/ - Get enrollment
    - PATCH /api/clinic-enrollments/{id}/ - Update enrollment
    - GET /api/clinic-enrollments/overdue/ - Get overdue patients
    - GET /api/clinic-enrollments/defaulters/ - Get defaulters
    - POST /api/clinic-enrollments/{id}/record-visit/ - Record visit
    """

    queryset = ClinicEnrollment.objects.select_related("clinic", "patient", "enrolled_by").all()
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ClinicEnrollmentFilter

    def get_serializer_class(self):
        """Return appropriate serializer class."""
        if self.action == "list":
            return ClinicEnrollmentListSerializer
        return ClinicEnrollmentSerializer

    def get_serializer_context(self):
        """Add request to serializer context."""
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    @action(detail=False, methods=["get"])
    def overdue(self, request):
        """Get overdue patients (past next_appointment)."""
        today = timezone.localdate()
        queryset = self.get_queryset().filter(
            status="ACTIVE",
            next_appointment__lt=today,
        )

        # Apply filters
        clinic_id = request.query_params.get("clinic")
        if clinic_id:
            queryset = queryset.filter(clinic_id=clinic_id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ClinicEnrollmentListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ClinicEnrollmentListSerializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"])
    def defaulters(self, request):
        """Get defaulters (significantly overdue - 2+ missed appointments)."""
        today = timezone.localdate()

        # Get enrollments with overdue by more than 2x appointment interval
        queryset = self.get_queryset().filter(
            status="ACTIVE",
            next_appointment__isnull=False,
        )

        # Filter to those overdue by 2+ appointment cycles
        defaulter_ids = []
        for enrollment in queryset:
            if enrollment.next_appointment:
                days_overdue = (today - enrollment.next_appointment).days
                if days_overdue >= (enrollment.appointment_interval_days * 2):
                    defaulter_ids.append(enrollment.id)

        queryset = queryset.filter(id__in=defaulter_ids)

        # Apply additional filters
        clinic_id = request.query_params.get("clinic")
        if clinic_id:
            queryset = queryset.filter(clinic_id=clinic_id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ClinicEnrollmentListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ClinicEnrollmentListSerializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=True, methods=["post"], url_path="record-visit")
    def record_visit(self, request, pk=None):
        """Record a visit for an enrollment."""
        enrollment = self.get_object()
        enrollment.record_visit()
        serializer = ClinicEnrollmentSerializer(enrollment)
        return Response(serializer.data)


# =============================================================================
# ClinicRoomViewSet (Nested under Clinic)
# =============================================================================


class ClinicRoomViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ClinicRoom operations nested under clinic.

    Endpoints:
    - GET    /api/clinics/{clinic_pk}/rooms/       - List rooms for clinic
    - POST   /api/clinics/{clinic_pk}/rooms/       - Link room to clinic
    - DELETE /api/clinics/{clinic_pk}/rooms/{pk}/   - Unlink room from clinic
    """

    serializer_class = ClinicRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter rooms to the parent clinic."""
        return ClinicRoom.objects.filter(
            clinic_id=self.kwargs["clinic_pk"]
        ).select_related("room")

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "create":
            return ClinicRoomCreateSerializer
        return ClinicRoomSerializer

    def create(self, request, *args, **kwargs):
        """Create clinic room association, or return existing if already linked."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        clinic = Clinic.objects.get(pk=self.kwargs["clinic_pk"])
        room = serializer.validated_data["room"]
        room_id = room.pk if hasattr(room, "pk") else room
        existing = ClinicRoom.objects.filter(clinic=clinic, room_id=room_id).first()
        if existing:
            return Response(
                ClinicRoomSerializer(existing).data, status=status.HTTP_200_OK
            )
        serializer.save(clinic=clinic)
        read_serializer = ClinicRoomSerializer(serializer.instance)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request, clinic_pk=None):
        """List rooms linked to this clinic that have no active shift right now.

        Useful for showing which rooms are free for the clock-in room picker.
        """
        from datetime import date as date_type

        from hmis.apps.scheduling.models import Shift

        today = date_type.today()
        occupied_room_ids = (
            Shift.objects.filter(
                shift_date=today,
                status__in=["ACTIVE", "ON_BREAK"],
                room__isnull=False,
            )
            .values_list("room_id", flat=True)
        )
        qs = (
            ClinicRoom.objects.filter(clinic_id=clinic_pk)
            .exclude(room_id__in=occupied_room_ids)
            .select_related("room")
        )
        serializer = ClinicRoomSerializer(qs, many=True)
        return Response(serializer.data)


# =============================================================================
# Public Queue Display (Unauthenticated)
# =============================================================================


class PublicQueueView(viewsets.ViewSet):
    """
    Public, unauthenticated queue display for TV/tablet screens.

    Returns only non-PII fields: queue number, status, room name, called_at.
    No patient names, MRNs, or any identifying information.

    GET /api/clinics/{clinic_id}/public-queue/
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def list(self, request, clinic_id=None):
        """Get today's queue for the specified clinic."""
        from datetime import date as date_type

        from .serializers import PublicQueueItemSerializer

        today = date_type.today()

        try:
            clinic = Clinic.objects.get(pk=clinic_id)
        except Clinic.DoesNotExist:
            return Response(
                {"error": "Clinic not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        session = (
            ClinicSession.objects.filter(clinic=clinic, session_date=today)
            .order_by("-created_at")
            .first()
        )

        visits = []
        if session:
            visits = (
                ClinicVisit.objects.filter(
                    session=session,
                    status__in=["WAITING", "CALLED", "IN_CONSULTATION"],
                )
                .select_related("room")
                .order_by("queue_number")
            )

        serializer = PublicQueueItemSerializer(visits, many=True)

        return Response(
            {
                "clinic_name": clinic.name,
                "session_date": str(today),
                "session_status": session.status if session else None,
                "updated_at": timezone.now().isoformat(),
                "queue": serializer.data,
            }
        )
