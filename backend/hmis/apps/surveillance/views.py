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

from hmis.apps.core.models import AuditLog

from .models import (
    NotifiableCase,
    NotifiableDisease,
    NotificationStatus,
    OutbreakThreshold,
    SurveillanceAlert,
)
from .serializers import (
    CountyReportSerializer,
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


class NotifiableCaseViewSet(viewsets.ModelViewSet):
    """
    API endpoint for NotifiableCase management.

    Provides CRUD operations for disease cases and notification workflow.
    """

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


class SurveillanceAlertViewSet(viewsets.ModelViewSet):
    """
    API endpoint for SurveillanceAlert management.

    Provides listing and acknowledgment of surveillance alerts.
    """

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

        # Base queryset
        cases = NotifiableCase.objects.all()

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

        # Outbreak alerts (unacknowledged)
        outbreak_alerts = SurveillanceAlert.objects.filter(
            alert_type=SurveillanceAlert.AlertType.OUTBREAK,
            is_acknowledged=False,
        ).count()

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
