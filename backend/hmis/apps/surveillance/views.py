"""
Views for Disease Surveillance module.

Provides API endpoints for notifiable diseases, cases, alerts,
reporting to county health offices, and dashboard statistics.
"""

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.models import AuditLog

from .models import (
    IHRNotification,
    IHRNotificationStatus,
    NotifiableCase,
    NotifiableDisease,
    NotificationStatus,
    OutbreakThreshold,
    SurveillanceAlert,
)
from .serializers import (
    IHRCloseSerializer,
    IHREscalateToNationalSerializer,
    IHRNotificationCreateSerializer,
    IHRNotificationListSerializer,
    IHRNotificationSerializer,
    IHRNotifyWHOSerializer,
    IHRRejectSerializer,
    IHRSubmitToCountySerializer,
    NotifiableCaseCreateSerializer,
    NotifiableCaseListSerializer,
    NotifiableCaseSerializer,
    NotifiableDiseaseListSerializer,
    NotifiableDiseaseSerializer,
    NotifyCountySerializer,
    OutbreakThresholdSerializer,
    SurveillanceAlertListSerializer,
    SurveillanceAlertSerializer,
    SurveillanceDashboardSerializer,
)


class NotifiableCaseFilter(filters.FilterSet):
    """Filter for NotifiableCase list endpoint."""

    disease = filters.NumberFilter(field_name="disease__id")
    category = filters.ChoiceFilter(
        field_name="disease__category",
        choices=[("IMMEDIATE", "Immediate"), ("WEEKLY", "Weekly"), ("MONTHLY", "Monthly")],
    )
    notification_status = filters.ChoiceFilter(choices=NotificationStatus.choices)
    county = filters.NumberFilter(field_name="county__id")
    is_overdue = filters.BooleanFilter(method="filter_is_overdue")
    detected_after = filters.DateTimeFilter(field_name="detected_at", lookup_expr="gte")
    detected_before = filters.DateTimeFilter(field_name="detected_at", lookup_expr="lte")
    patient = filters.NumberFilter(field_name="patient__id")
    laboratory_confirmed = filters.BooleanFilter()

    class Meta:
        model = NotifiableCase
        fields = [
            "disease",
            "category",
            "notification_status",
            "county",
            "is_overdue",
            "detected_after",
            "detected_before",
            "patient",
            "laboratory_confirmed",
        ]

    def filter_is_overdue(self, queryset, name, value):
        """Filter by overdue status."""
        now = timezone.now()
        if value:
            return queryset.filter(
                notification_deadline__lt=now,
                notification_status=NotificationStatus.PENDING,
            )
        return queryset.exclude(
            notification_deadline__lt=now,
            notification_status=NotificationStatus.PENDING,
        )


class NotifiableDiseaseViewSet(viewsets.ModelViewSet):
    """
    API endpoint for NotifiableDisease reference data.

    Provides CRUD operations for the list of notifiable diseases.
    Read-only for most users; write access requires admin permissions.
    """

    queryset = NotifiableDisease.objects.all()
    serializer_class = NotifiableDiseaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["category", "is_active", "is_ihr_notifiable"]
    search_fields = ["name", "icd10_codes", "description"]
    ordering_fields = ["name", "category", "reporting_hours"]
    ordering = ["category", "name"]

    def get_serializer_class(self):
        """Use list serializer for list action."""
        if self.action == "list":
            return NotifiableDiseaseListSerializer
        return NotifiableDiseaseSerializer

    def get_permissions(self):
        """Require admin for create/update/delete."""
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def immediate(self, request):
        """Return only immediate reportable diseases."""
        immediate_diseases = self.get_queryset().filter(
            category="IMMEDIATE", is_active=True
        )
        serializer = NotifiableDiseaseListSerializer(immediate_diseases, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def matching_codes(self, request, pk=None):
        """Return all ICD-10 codes that match this disease."""
        disease = self.get_object()
        return Response(
            {
                "disease": disease.name,
                "icd10_codes": disease.get_icd10_code_list(),
            }
        )


class NotifiableCaseViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    API endpoint for NotifiableCase management.

    Provides CRUD operations for disease cases and notification workflow.
    """

    tenant_scope = "facility"

    queryset = NotifiableCase.objects.select_related(
        "disease", "patient", "encounter", "county", "sub_county", "reported_by", "notified_by"
    ).all()
    serializer_class = NotifiableCaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = NotifiableCaseFilter
    search_fields = ["patient__first_name", "patient__last_name", "patient__mrn", "disease__name"]
    ordering_fields = ["detected_at", "notification_deadline", "notification_status"]
    ordering = ["-detected_at"]

    def get_serializer_class(self):
        """Use appropriate serializer based on action."""
        if self.action == "list":
            return NotifiableCaseListSerializer
        if self.action == "create":
            return NotifiableCaseCreateSerializer
        return NotifiableCaseSerializer

    def perform_create(self, serializer):
        """Set reported_by to current user."""
        case = serializer.save(reported_by=self.request.user)
        # Log audit
        AuditLog.log(
            action="notifiable_case_create",
            user=self.request.user,
            resource_type="NotifiableCase",
            resource_id=case.id,
            details={
                "disease": case.disease.name,
                "patient_mrn": case.patient.mrn,
                "category": case.disease.category,
            },
        )
        # Trigger alert for immediate cases
        if case.is_immediate:
            from .services import SurveillanceService

            SurveillanceService.create_alert(
                case=case,
                alert_type=SurveillanceAlert.AlertType.NEW_CASE,
            )

    @action(detail=True, methods=["post"])
    def notify_county(self, request, pk=None):
        """
        Mark case as notified to county health office.

        POST /api/surveillance/cases/{id}/notify_county/
        """
        case = self.get_object()

        if case.notification_status != NotificationStatus.PENDING:
            return Response(
                {"error": f"Case already has status: {case.get_notification_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = NotifyCountySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Update case status
        case.mark_notified(user=request.user)

        # Add notes if provided
        notes = serializer.validated_data.get("notification_notes", "")
        if notes:
            case.investigation_notes = f"{case.investigation_notes}\n[Notification] {notes}".strip()
            case.save(update_fields=["investigation_notes"])

        # Audit log
        AuditLog.log(
            action="notifiable_case_notify",
            user=request.user,
            resource_type="NotifiableCase",
            resource_id=case.id,
            details={
                "disease": case.disease.name,
                "county": case.county.name if case.county else None,
            },
        )

        return Response(NotifiableCaseSerializer(case).data)

    @action(detail=False, methods=["get"])
    def pending(self, request):
        """Return cases pending notification."""
        pending_cases = self.get_queryset().filter(
            notification_status=NotificationStatus.PENDING
        )
        serializer = NotifiableCaseListSerializer(pending_cases, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def overdue(self, request):
        """Return overdue cases."""
        now = timezone.now()
        overdue_cases = self.get_queryset().filter(
            notification_deadline__lt=now,
            notification_status=NotificationStatus.PENDING,
        )
        serializer = NotifiableCaseListSerializer(overdue_cases, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def immediate(self, request):
        """Return immediate reportable cases."""
        immediate_cases = self.get_queryset().filter(
            disease__category="IMMEDIATE",
            notification_status=NotificationStatus.PENDING,
        )
        serializer = NotifiableCaseListSerializer(immediate_cases, many=True)
        return Response(serializer.data)


class SurveillanceAlertViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    API endpoint for SurveillanceAlert management.

    Provides listing and acknowledgment of surveillance alerts.
    """

    tenant_scope = "facility"

    queryset = SurveillanceAlert.objects.select_related(
        "case", "case__disease", "case__patient", "case__county", "acknowledged_by"
    ).all()
    serializer_class = SurveillanceAlertSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["alert_type", "is_acknowledged", "case__disease"]
    search_fields = ["case__disease__name", "case__patient__mrn", "message"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "head", "options"]  # No PUT/PATCH/DELETE

    def get_serializer_class(self):
        """Use list serializer for list action."""
        if self.action == "list":
            return SurveillanceAlertListSerializer
        return SurveillanceAlertSerializer

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge an alert."""
        alert = self.get_object()

        if alert.is_acknowledged:
            return Response(
                {"error": "Alert already acknowledged"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        alert.acknowledge(request.user)

        AuditLog.log(
            action="surveillance_alert_acknowledge",
            user=request.user,
            resource_type="SurveillanceAlert",
            resource_id=alert.id,
            details={"case_id": alert.case.id, "alert_type": alert.alert_type},
        )

        return Response(SurveillanceAlertSerializer(alert).data)

    @action(detail=False, methods=["get"])
    def unacknowledged(self, request):
        """Return unacknowledged alerts."""
        alerts = self.get_queryset().filter(is_acknowledged=False)
        serializer = SurveillanceAlertListSerializer(alerts, many=True)
        return Response(serializer.data)


class OutbreakThresholdViewSet(viewsets.ModelViewSet):
    """
    API endpoint for OutbreakThreshold configuration.

    Admin-only endpoint for configuring outbreak detection thresholds.
    """

    queryset = OutbreakThreshold.objects.select_related("disease", "county").all()
    serializer_class = OutbreakThresholdSerializer
    permission_classes = [permissions.IsAdminUser]
    filterset_fields = ["disease", "county", "is_active"]
    ordering = ["disease__name"]

    @action(detail=True, methods=["get"])
    def check(self, request, pk=None):
        """Check if threshold is exceeded."""
        threshold = self.get_object()
        exceeded, count = threshold.check_threshold()
        return Response(
            {
                "disease": threshold.disease.name,
                "county": threshold.county.name if threshold.county else "National",
                "threshold": threshold.case_threshold,
                "period_days": threshold.period_days,
                "current_count": count,
                "is_exceeded": exceeded,
            }
        )

    @action(detail=False, methods=["get"])
    def exceeded(self, request):
        """Return all thresholds that are currently exceeded."""
        active_thresholds = self.get_queryset().filter(is_active=True)
        exceeded = []
        for threshold in active_thresholds:
            is_exceeded, count = threshold.check_threshold()
            if is_exceeded:
                exceeded.append(
                    {
                        "id": threshold.id,
                        "disease": threshold.disease.name,
                        "county": threshold.county.name if threshold.county else "National",
                        "threshold": threshold.case_threshold,
                        "current_count": count,
                        "period_days": threshold.period_days,
                    }
                )
        return Response(exceeded)


class SurveillanceDashboardView(APIView):
    """
    Dashboard statistics for disease surveillance.

    GET /api/surveillance/dashboard/
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Return dashboard statistics."""
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())

        # Base queryset – scoped to facility/org from TenantMiddleware
        cases = NotifiableCase.objects.all()
        facility = getattr(request, "facility", None)
        organization = getattr(request, "organization", None)
        if facility:
            cases = cases.filter(encounter__facility=facility)
        elif organization:
            cases = cases.filter(encounter__facility__organization=organization)

        # Active cases (not closed or lost)
        active_cases = cases.exclude(
            outcome__in=["RECOVERED", "DECEASED", "LOST_TO_FOLLOWUP"]
        ).count()

        # Immediate cases pending
        immediate_pending = cases.filter(
            disease__category="IMMEDIATE",
            notification_status=NotificationStatus.PENDING,
        ).count()

        # Overdue notifications
        overdue = cases.filter(
            notification_deadline__lt=now,
            notification_status=NotificationStatus.PENDING,
        ).count()

        # Cases today
        cases_today = cases.filter(detected_at__gte=today_start).count()

        # Cases this week
        cases_week = cases.filter(detected_at__gte=week_start).count()

        # Outbreak alerts (unacknowledged) – scope similarly
        alerts_qs = SurveillanceAlert.objects.filter(
            alert_type=SurveillanceAlert.AlertType.OUTBREAK,
            is_acknowledged=False,
        )
        if facility:
            alerts_qs = alerts_qs.filter(case__encounter__facility=facility)
        elif organization:
            alerts_qs = alerts_qs.filter(case__encounter__facility__organization=organization)
        outbreak_alerts = alerts_qs.count()

        # Top diseases this week
        top_diseases = (
            cases.filter(detected_at__gte=week_start)
            .values("disease__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        # Cases by county this week
        cases_by_county = (
            cases.filter(detected_at__gte=week_start, county__isnull=False)
            .values("county__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )

        data = {
            "total_active_cases": active_cases,
            "immediate_cases_pending": immediate_pending,
            "overdue_notifications": overdue,
            "cases_today": cases_today,
            "cases_this_week": cases_week,
            "outbreak_alerts": outbreak_alerts,
            "top_diseases": [
                {"name": d["disease__name"], "count": d["count"]} for d in top_diseases
            ],
            "cases_by_county": [
                {"county": c["county__name"], "count": c["count"]} for c in cases_by_county
            ],
        }

        serializer = SurveillanceDashboardSerializer(data)
        return Response(serializer.data)


class CountyReportView(APIView):
    """
    Generate disease report for county health offices.

    GET /api/surveillance/reports/county/{county_id}/
    Query params: start_date, end_date
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, county_id):
        """Generate county report."""
        from hmis.apps.core.models import County

        try:
            county = County.objects.get(id=county_id)
        except County.DoesNotExist:
            return Response(
                {"error": "County not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Parse date range (default to last 7 days)
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        start_param = request.query_params.get("start_date")
        end_param = request.query_params.get("end_date")

        if start_param:
            from django.utils.dateparse import parse_datetime

            parsed = parse_datetime(start_param)
            if parsed:
                start_date = parsed

        if end_param:
            from django.utils.dateparse import parse_datetime

            parsed = parse_datetime(end_param)
            if parsed:
                end_date = parsed

        # Query cases
        cases = NotifiableCase.objects.filter(
            county=county,
            detected_at__gte=start_date,
            detected_at__lte=end_date,
        )

        # Cases by disease
        cases_by_disease = (
            cases.values("disease__name", "disease__category")
            .annotate(
                count=Count("id"),
                confirmed=Count("id", filter=Q(laboratory_confirmed=True)),
            )
            .order_by("-count")
        )

        # Pending and overdue
        pending = cases.filter(notification_status=NotificationStatus.PENDING).count()
        overdue = cases.filter(
            notification_deadline__lt=timezone.now(),
            notification_status=NotificationStatus.PENDING,
        ).count()

        data = {
            "county_id": county.id,
            "county_name": county.name,
            "period_start": start_date,
            "period_end": end_date,
            "cases_by_disease": [
                {
                    "disease": d["disease__name"],
                    "category": d["disease__category"],
                    "total": d["count"],
                    "lab_confirmed": d["confirmed"],
                }
                for d in cases_by_disease
            ],
            "total_cases": cases.count(),
            "pending_notifications": pending,
            "overdue_notifications": overdue,
        }

        # Audit the report generation
        AuditLog.log(
            action="surveillance_county_report",
            user=request.user,
            resource_type="County",
            resource_id=county.id,
            details={
                "county_name": county.name,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "total_cases": cases.count(),
            },
        )

        return Response(data)


# ============================================================================
# IDSR Weekly Reporting Views
# ============================================================================


class IDSRWeeklyReportFilter(filters.FilterSet):
    """Filter for IDSRWeeklyReport list endpoint."""

    epi_year = filters.NumberFilter()
    epi_week = filters.NumberFilter()
    status = filters.ChoiceFilter(choices=[
        ("DRAFT", "Draft"),
        ("PENDING_REVIEW", "Pending Review"),
        ("APPROVED", "Approved"),
        ("SUBMITTED", "Submitted"),
        ("FAILED", "Failed"),
    ])
    county = filters.NumberFilter(field_name="county__id")
    outbreak = filters.BooleanFilter(field_name="outbreak_declared")
    start_date = filters.DateFilter(field_name="week_start_date", lookup_expr="gte")
    end_date = filters.DateFilter(field_name="week_end_date", lookup_expr="lte")

    class Meta:
        from .models import IDSRWeeklyReport

        model = IDSRWeeklyReport
        fields = ["epi_year", "epi_week", "status", "county", "outbreak", "start_date", "end_date"]


class IDSRWeeklyReportViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    API endpoint for IDSR Weekly Reports.

    Provides CRUD operations and workflow actions for IDSR reports.

    Actions:
    - generate: Create a new weekly report (or regenerate existing)
    - approve: Approve a report for submission
    - submit_to_dhis2: Submit approved report to DHIS2
    - dashboard: Get IDSR summary statistics
    """

    # IDSRWeeklyReport uses 'facility_ref' not 'facility' for the FK
    tenant_scope = "facility"
    tenant_facility_field = "facility_ref"

    queryset = None  # Set in get_queryset
    serializer_class = None  # Set dynamically
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = IDSRWeeklyReportFilter
    search_fields = ["facility_name", "facility_code"]
    ordering_fields = ["epi_year", "epi_week", "generated_at", "total_cases"]
    ordering = ["-epi_year", "-epi_week"]

    def get_queryset(self):
        """Return queryset with related objects."""
        from .models import IDSRWeeklyReport

        return IDSRWeeklyReport.objects.select_related(
            "county", "sub_county", "generated_by", "reviewed_by", "approved_by"
        ).prefetch_related("disease_summaries", "disease_summaries__disease")

    def get_serializer_class(self):
        """Use appropriate serializer based on action."""
        from .serializers import (
            IDSRReportApproveSerializer,
            IDSRReportGenerateSerializer,
            IDSRWeeklyReportListSerializer,
            IDSRWeeklyReportSerializer,
        )

        if self.action == "list":
            return IDSRWeeklyReportListSerializer
        if self.action == "generate":
            return IDSRReportGenerateSerializer
        if self.action == "approve":
            return IDSRReportApproveSerializer
        return IDSRWeeklyReportSerializer

    def perform_create(self, serializer):
        """Set generated_by to current user."""
        serializer.save(generated_by=self.request.user)

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """
        Generate a new IDSR weekly report.

        POST /api/surveillance/idsr/generate/

        Body (optional):
        {
            "epi_year": 2026,
            "epi_week": 8
        }

        If not provided, generates for previous week.
        """
        from .serializers import IDSRReportGenerateSerializer, IDSRWeeklyReportSerializer
        from .services import IDSRReportingService

        serializer = IDSRReportGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        epi_year = serializer.validated_data.get("epi_year")
        epi_week = serializer.validated_data.get("epi_week")

        if epi_year and epi_week:
            # Calculate week dates for the specified week
            # This is a simplified calculation - for production, use a proper
            # ISO week date calculation
            from datetime import date as date_type

            # Find the Monday of the specified week
            jan_4 = date_type(epi_year, 1, 4)  # Jan 4 is always in week 1
            days_to_monday = jan_4.weekday()  # 0=Monday
            week_1_monday = jan_4 - timedelta(days=days_to_monday)
            week_start = week_1_monday + timedelta(weeks=epi_week - 1)
            week_end = week_start + timedelta(days=6)

            report = IDSRReportingService.generate_weekly_report(
                epi_year=epi_year,
                epi_week=epi_week,
                week_start=week_start,
                week_end=week_end,
                generated_by=request.user,
            )
        else:
            report = IDSRReportingService.generate_previous_week_report(
                generated_by=request.user
            )

        AuditLog.log(
            action="idsr_report_generate",
            user=request.user,
            resource_type="IDSRWeeklyReport",
            resource_id=report.id,
            details={
                "epi_year": report.epi_year,
                "epi_week": report.epi_week,
                "total_cases": report.total_cases,
            },
        )

        return Response(
            IDSRWeeklyReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve an IDSR report for submission.

        POST /api/surveillance/idsr/{id}/approve/
        """
        from .models import IDSRReportStatus
        from .serializers import IDSRReportApproveSerializer, IDSRWeeklyReportSerializer

        report = self.get_object()

        if report.status not in [IDSRReportStatus.DRAFT, IDSRReportStatus.PENDING_REVIEW]:
            return Response(
                {"error": f"Cannot approve report with status: {report.get_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IDSRReportApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data.get("notes", "")
        if notes:
            report.notes = f"{report.notes}\n[Approval] {notes}".strip()

        report.approve(request.user)

        AuditLog.log(
            action="idsr_report_approve",
            user=request.user,
            resource_type="IDSRWeeklyReport",
            resource_id=report.id,
            details={
                "epi_year": report.epi_year,
                "epi_week": report.epi_week,
            },
        )

        return Response(IDSRWeeklyReportSerializer(report).data)

    @action(detail=True, methods=["post"])
    def submit_to_dhis2(self, request, pk=None):
        """
        Submit approved IDSR report to DHIS2.

        POST /api/surveillance/idsr/{id}/submit_to_dhis2/
        """
        from .models import IDSRReportStatus
        from .serializers import IDSRWeeklyReportSerializer
        from .services import IDSRReportingService

        report = self.get_object()

        if report.status != IDSRReportStatus.APPROVED:
            return Response(
                {"error": f"Report must be approved before submission (current: {report.get_status_display()})"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = IDSRReportingService.submit_to_dhis2(report)

        AuditLog.log(
            action="idsr_report_submit_dhis2",
            user=request.user,
            resource_type="IDSRWeeklyReport",
            resource_id=report.id,
            details={
                "epi_year": report.epi_year,
                "epi_week": report.epi_week,
                "success": report.status == IDSRReportStatus.SUBMITTED,
            },
        )

        # Refresh from DB to get updated status
        report.refresh_from_db()

        return Response({
            "report": IDSRWeeklyReportSerializer(report).data,
            "dhis2_response": result,
        })

    @action(detail=True, methods=["get"], url_path="export-sdmx")
    def export_sdmx(self, request, pk=None):
        """
        Export IDSR weekly report as SDMX-ML.

        GET /api/surveillance/idsr/{id}/export-sdmx/
        """
        from django.http import HttpResponse as DjangoHttpResponse

        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = self.get_object()
        service = SDMXExportService()
        xml_content = service.export_idsr_to_sdmx(report)
        response = DjangoHttpResponse(xml_content, content_type="application/xml")
        response["Content-Disposition"] = (
            f'attachment; filename="idsr_{report.epi_year}_W{report.epi_week:02d}.sdmx.xml"'
        )
        return response

    @action(detail=True, methods=["get"], url_path="export-adx")
    def export_adx(self, request, pk=None):
        """
        Export IDSR weekly report as ADX XML for DHIS2.

        GET /api/surveillance/idsr/{id}/export-adx/
        """
        from django.http import HttpResponse as DjangoHttpResponse

        from hmis.apps.surveillance.adx_service import ADXExportService

        report = self.get_object()
        service = ADXExportService()
        xml_content = service.export_idsr_to_adx(report)
        response = DjangoHttpResponse(xml_content, content_type="application/xml")
        response["Content-Disposition"] = (
            f'attachment; filename="idsr_{report.epi_year}_W{report.epi_week:02d}.adx.xml"'
        )
        return response

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """
        Get IDSR dashboard statistics.

        GET /api/surveillance/idsr/dashboard/
        """
        from .models import IDSRReportStatus, IDSRWeeklyReport
        from .services import IDSRReportingService

        # Current week info
        epi_year, epi_week, week_start, week_end = IDSRReportingService.get_epi_week()

        # Get current week's report if exists
        current_report = IDSRWeeklyReport.objects.filter(
            epi_year=epi_year, epi_week=epi_week
        ).first()

        current_week_data = {
            "epi_year": epi_year,
            "epi_week": epi_week,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "has_report": current_report is not None,
            "report_id": current_report.id if current_report else None,
            "total_cases": current_report.total_cases if current_report else 0,
            "status": current_report.status if current_report else None,
        }

        # Previous 4 weeks
        previous_weeks = []
        for i in range(1, 5):
            prev_year, prev_week, prev_start, prev_end = IDSRReportingService.get_epi_week(
                week_start - timedelta(weeks=i)
            )
            prev_report = IDSRWeeklyReport.objects.filter(
                epi_year=prev_year, epi_week=prev_week
            ).first()
            previous_weeks.append({
                "epi_year": prev_year,
                "epi_week": prev_week,
                "week_start": prev_start.isoformat(),
                "has_report": prev_report is not None,
                "total_cases": prev_report.total_cases if prev_report else 0,
                "status": prev_report.status if prev_report else None,
            })

        # Statistics
        total_this_year = IDSRWeeklyReport.objects.filter(epi_year=epi_year).count()
        pending = IDSRWeeklyReport.objects.filter(
            status__in=[IDSRReportStatus.DRAFT, IDSRReportStatus.PENDING_REVIEW, IDSRReportStatus.APPROVED]
        ).count()

        # Submitted this month
        from datetime import date as date_type

        today = timezone.localdate()
        month_start = date_type(today.year, today.month, 1)
        submitted_this_month = IDSRWeeklyReport.objects.filter(
            status=IDSRReportStatus.SUBMITTED,
            dhis2_submitted_at__date__gte=month_start,
        ).count()

        # Outbreak weeks this year
        outbreak_weeks = IDSRWeeklyReport.objects.filter(
            epi_year=epi_year, outbreak_declared=True
        ).count()

        return Response({
            "current_week": current_week_data,
            "previous_weeks": previous_weeks,
            "total_reports_this_year": total_this_year,
            "pending_submission": pending,
            "submitted_this_month": submitted_this_month,
            "outbreak_weeks": outbreak_weeks,
        })

    @action(detail=True, methods=["get"])
    def dhis2_preview(self, request, pk=None):
        """
        Preview DHIS2 payload without submitting.

        GET /api/surveillance/idsr/{id}/dhis2_preview/
        """
        from .services import IDSRReportingService

        report = self.get_object()
        payload = IDSRReportingService.prepare_dhis2_payload(report)

        return Response({
            "report_id": report.id,
            "week_label": report.week_label,
            "payload": payload,
        })


# ============================================================================
# IHR Notification Views
# ============================================================================


class IHRNotificationFilter(filters.FilterSet):
    """Filter for IHRNotification list endpoint."""

    disease = filters.NumberFilter(field_name="disease__id")
    status = filters.ChoiceFilter(choices=IHRNotificationStatus.choices)
    urgency = filters.ChoiceFilter(
        choices=[
            ("EMERGENCY", "Emergency"),
            ("URGENT", "Urgent"),
            ("ROUTINE", "Routine"),
        ]
    )
    county = filters.NumberFilter(field_name="county__id")
    reported_after = filters.DateTimeFilter(field_name="report_date", lookup_expr="gte")
    reported_before = filters.DateTimeFilter(field_name="report_date", lookup_expr="lte")
    is_annex2_positive = filters.BooleanFilter()

    class Meta:
        model = IHRNotification
        fields = [
            "disease",
            "status",
            "urgency",
            "county",
            "reported_after",
            "reported_before",
            "is_annex2_positive",
        ]


class IHRNotificationViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    API endpoint for IHR Notification management.

    Provides CRUD operations and escalation workflow actions for
    International Health Regulations notifications.

    Escalation pipeline:
    DRAFT → PENDING_REVIEW → SUBMITTED_COUNTY → ESCALATED_NATIONAL → NOTIFIED_WHO → ACKNOWLEDGED → CLOSED

    Actions:
    - submit_to_county: Submit to County Disease Surveillance Coordinator
    - escalate_to_national: Escalate to MOH National IHR Focal Point
    - notify_who: Mark as notified to WHO
    - acknowledge_who: Record WHO acknowledgement
    - close: Close the notification
    - reject: Reject (not IHR-reportable)
    - overdue: List overdue notifications
    - dashboard: IHR notification statistics
    """

    queryset = IHRNotification.objects.select_related(
        "disease",
        "case",
        "patient",
        "county",
        "sub_county",
        "reported_by",
        "county_reviewed_by",
        "national_reviewed_by",
    ).all()
    serializer_class = IHRNotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = IHRNotificationFilter
    search_fields = [
        "disease__name",
        "event_description",
        "who_reference_number",
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
    ]
    ordering_fields = ["report_date", "urgency", "status", "event_date"]
    ordering = ["-report_date"]

    def get_serializer_class(self):
        """Use appropriate serializer based on action."""
        if self.action == "list":
            return IHRNotificationListSerializer
        if self.action == "create":
            return IHRNotificationCreateSerializer
        if self.action == "submit_to_county":
            return IHRSubmitToCountySerializer
        if self.action == "escalate_to_national":
            return IHREscalateToNationalSerializer
        if self.action == "notify_who":
            return IHRNotifyWHOSerializer
        if self.action == "reject":
            return IHRRejectSerializer
        if self.action == "close":
            return IHRCloseSerializer
        return IHRNotificationSerializer

    def perform_create(self, serializer):
        """Set reported_by to current user and audit log."""
        notification = serializer.save(reported_by=self.request.user)
        AuditLog.log(
            action="ihr_notification_create",
            user=self.request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={
                "disease": notification.disease.name,
                "urgency": notification.urgency,
                "event_date": str(notification.event_date),
            },
        )

    @action(detail=True, methods=["post"])
    def submit_to_county(self, request, pk=None):
        """
        Submit IHR notification to County Disease Surveillance Coordinator.

        POST /api/surveillance/ihr/{id}/submit_to_county/
        """
        notification = self.get_object()

        if notification.status not in [
            IHRNotificationStatus.DRAFT,
            IHRNotificationStatus.PENDING_REVIEW,
        ]:
            return Response(
                {"error": f"Cannot submit from status: {notification.get_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IHRSubmitToCountySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data.get("notes", "")
        notification.submit_to_county(user=request.user, notes=notes)

        AuditLog.log(
            action="ihr_submit_county",
            user=request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={
                "disease": notification.disease.name,
                "county": notification.county.name if notification.county else None,
            },
        )

        return Response(IHRNotificationSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def escalate_to_national(self, request, pk=None):
        """
        Escalate IHR notification to MOH National IHR Focal Point.

        POST /api/surveillance/ihr/{id}/escalate_to_national/
        """
        notification = self.get_object()

        if notification.status != IHRNotificationStatus.SUBMITTED_COUNTY:
            return Response(
                {
                    "error": (
                        "Notification must be at county level before national escalation. "
                        f"Current status: {notification.get_status_display()}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IHREscalateToNationalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data.get("notes", "")
        notification.escalate_to_national(user=request.user, notes=notes)

        AuditLog.log(
            action="ihr_escalate_national",
            user=request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={"disease": notification.disease.name},
        )

        return Response(IHRNotificationSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def notify_who(self, request, pk=None):
        """
        Mark IHR notification as sent to WHO IHR Contact Point.

        POST /api/surveillance/ihr/{id}/notify_who/
        """
        notification = self.get_object()

        if notification.status != IHRNotificationStatus.ESCALATED_NATIONAL:
            return Response(
                {
                    "error": (
                        "Notification must be at national level before WHO notification. "
                        f"Current status: {notification.get_status_display()}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IHRNotifyWHOSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ref = serializer.validated_data.get("reference_number", "")
        notification.notify_who(reference_number=ref)

        AuditLog.log(
            action="ihr_notify_who",
            user=request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={
                "disease": notification.disease.name,
                "who_reference": ref,
            },
        )

        return Response(IHRNotificationSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def acknowledge_who(self, request, pk=None):
        """
        Record WHO acknowledgement of notification.

        POST /api/surveillance/ihr/{id}/acknowledge_who/
        """
        notification = self.get_object()

        if notification.status != IHRNotificationStatus.NOTIFIED_WHO:
            return Response(
                {"error": f"Cannot acknowledge from status: {notification.get_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notification.acknowledge_who()

        AuditLog.log(
            action="ihr_who_acknowledge",
            user=request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={"disease": notification.disease.name},
        )

        return Response(IHRNotificationSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """
        Close an IHR notification.

        POST /api/surveillance/ihr/{id}/close/
        """
        notification = self.get_object()

        if notification.status in [
            IHRNotificationStatus.CLOSED,
            IHRNotificationStatus.REJECTED,
        ]:
            return Response(
                {"error": f"Notification already {notification.get_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IHRCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data.get("notes", "")
        notification.close(notes=notes)

        AuditLog.log(
            action="ihr_notification_close",
            user=request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={"disease": notification.disease.name},
        )

        return Response(IHRNotificationSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """
        Reject an IHR notification (not IHR-reportable upon review).

        POST /api/surveillance/ihr/{id}/reject/
        """
        notification = self.get_object()

        if notification.status in [
            IHRNotificationStatus.CLOSED,
            IHRNotificationStatus.REJECTED,
            IHRNotificationStatus.NOTIFIED_WHO,
            IHRNotificationStatus.ACKNOWLEDGED,
        ]:
            return Response(
                {"error": f"Cannot reject notification with status: {notification.get_status_display()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IHRRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data.get("notes", "")
        notification.reject(user=request.user, notes=notes)

        AuditLog.log(
            action="ihr_notification_reject",
            user=request.user,
            resource_type="IHRNotification",
            resource_id=notification.id,
            details={
                "disease": notification.disease.name,
                "reason": notes,
            },
        )

        return Response(IHRNotificationSerializer(notification).data)

    @action(detail=False, methods=["get"])
    def overdue(self, request):
        """
        Return IHR notifications that are overdue (>24h without WHO notification).

        GET /api/surveillance/ihr/overdue/
        """
        from datetime import timedelta as td

        cutoff = timezone.now() - td(hours=24)
        overdue = self.get_queryset().filter(
            report_date__lt=cutoff,
        ).exclude(
            status__in=[
                IHRNotificationStatus.NOTIFIED_WHO,
                IHRNotificationStatus.ACKNOWLEDGED,
                IHRNotificationStatus.CLOSED,
                IHRNotificationStatus.REJECTED,
            ]
        )
        serializer = IHRNotificationListSerializer(overdue, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """
        IHR notification statistics dashboard.

        GET /api/surveillance/ihr/dashboard/
        """
        notifications = IHRNotification.objects.all()

        total = notifications.count()
        pending = notifications.filter(
            status__in=[
                IHRNotificationStatus.DRAFT,
                IHRNotificationStatus.PENDING_REVIEW,
            ]
        ).count()
        at_county = notifications.filter(
            status=IHRNotificationStatus.SUBMITTED_COUNTY
        ).count()
        at_national = notifications.filter(
            status=IHRNotificationStatus.ESCALATED_NATIONAL
        ).count()
        notified_who = notifications.filter(
            status__in=[
                IHRNotificationStatus.NOTIFIED_WHO,
                IHRNotificationStatus.ACKNOWLEDGED,
            ]
        ).count()
        closed = notifications.filter(
            status=IHRNotificationStatus.CLOSED
        ).count()
        rejected = notifications.filter(
            status=IHRNotificationStatus.REJECTED
        ).count()

        # Overdue count (>24h without WHO notification)
        cutoff = timezone.now() - timedelta(hours=24)
        overdue = notifications.filter(
            report_date__lt=cutoff,
        ).exclude(
            status__in=[
                IHRNotificationStatus.NOTIFIED_WHO,
                IHRNotificationStatus.ACKNOWLEDGED,
                IHRNotificationStatus.CLOSED,
                IHRNotificationStatus.REJECTED,
            ]
        ).count()

        # By urgency
        by_urgency = list(
            notifications.exclude(
                status__in=[IHRNotificationStatus.CLOSED, IHRNotificationStatus.REJECTED]
            )
            .values("urgency")
            .annotate(count=Count("id"))
            .order_by("urgency")
        )

        # By disease
        by_disease = list(
            notifications.values("disease__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )

        data = {
            "total": total,
            "pending": pending,
            "at_county": at_county,
            "at_national": at_national,
            "notified_who": notified_who,
            "closed": closed,
            "rejected": rejected,
            "overdue": overdue,
            "by_urgency": [
                {"urgency": u["urgency"], "count": u["count"]} for u in by_urgency
            ],
            "by_disease": [
                {"disease": d["disease__name"], "count": d["count"]} for d in by_disease
            ],
        }

        return Response(data)

