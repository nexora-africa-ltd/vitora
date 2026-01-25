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
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Clinic,
    ClinicEnrollment,
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

    status = filters.CharFilter(field_name="status")
    clinic = filters.NumberFilter(field_name="session__clinic__id")
    date = filters.DateFilter(field_name="session__session_date")
    patient = filters.NumberFilter(field_name="patient__id")

    class Meta:
        """Meta options for ClinicVisitFilter."""

        model = ClinicVisit
        fields = ["status", "clinic", "date", "patient"]


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


class ClinicViewSet(viewsets.ModelViewSet):
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

    queryset = Clinic.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    filterset_class = ClinicFilter

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

    @action(detail=True, methods=["get"], url_path="reports/monthly")
    def monthly_reports(self, request, pk=None):
        """List monthly reports for a clinic."""
        clinic = self.get_object()
        reports = MonthlyClinicReport.objects.filter(clinic=clinic).order_by("-year", "-month")
        serializer = MonthlyClinicReportSerializer(reports, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

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


class ClinicSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ClinicSession operations nested under clinic.

    Endpoints:
    - GET /api/clinics/{clinic_pk}/sessions/ - List clinic sessions
    - POST /api/clinics/{clinic_pk}/sessions/ - Create session
    - GET /api/clinics/{clinic_pk}/sessions/today/ - Get today's session
    - POST /api/clinics/{clinic_pk}/sessions/today/open/ - Open today's session
    - POST /api/clinics/{clinic_pk}/sessions/today/close/ - Close today's session
    """

    serializer_class = ClinicSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter sessions by clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        return ClinicSession.objects.filter(clinic_id=clinic_pk)

    def get_clinic(self):
        """Get the parent clinic."""
        clinic_pk = self.kwargs.get("clinic_pk")
        return Clinic.objects.get(pk=clinic_pk)

    def perform_create(self, serializer):
        """Create session for the clinic."""
        clinic = self.get_clinic()
        serializer.save(clinic=clinic)

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


# =============================================================================
# ClinicVisitViewSet
# =============================================================================


class ClinicVisitViewSet(viewsets.ModelViewSet):
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

    queryset = ClinicVisit.objects.select_related(
        "session__clinic",
        "patient",
        "assigned_clinician",
        "encounter",
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
        visit = serializer.save()
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
