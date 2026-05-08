"""Views for Critical Value Management."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISConfigPermission

from .models import CriticalValueNotification, CriticalValueRange
from .serializers import (
    CriticalValueComplianceSerializer,
    CriticalValueNotificationDetailSerializer,
    CriticalValueNotificationListSerializer,
    CriticalValueRangeCreateSerializer,
    CriticalValueRangeListSerializer,
    EscalateSerializer,
    NotifySerializer,
    ReadBackSerializer,
)

# =============================================================================
# Critical Value Range ViewSet
# =============================================================================


class CriticalValueRangeFilter(filters.FilterSet):
    test = filters.NumberFilter(field_name="test_id")
    is_active = filters.BooleanFilter()

    class Meta:
        model = CriticalValueRange
        fields = ["test", "is_active"]


class CriticalValueRangeViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for critical value ranges."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    filterset_class = CriticalValueRangeFilter
    tenant_scope = "facility"
    queryset = CriticalValueRange.objects.select_related("test")

    def get_serializer_class(self):
        if self.action == "create":
            return CriticalValueRangeCreateSerializer
        return CriticalValueRangeListSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """Seed common critical value ranges for Kenya facilities."""
        self._resolve_tenant_context()
        facility = request.facility

        from hmis.apps.laboratory.models import TestCatalog

        defaults = [
            {
                "code": "HGB",
                "critical_low": 5.0,
                "critical_high": 20.0,
                "panic_low": 3.0,
                "panic_high": 25.0,
            },
            {
                "code": "WBC",
                "critical_low": 2.0,
                "critical_high": 30.0,
                "panic_low": 1.0,
                "panic_high": 50.0,
            },
            {
                "code": "PLT",
                "critical_low": 20.0,
                "critical_high": 1000.0,
                "panic_low": 10.0,
                "panic_high": None,
            },
            {
                "code": "K",
                "critical_low": 2.5,
                "critical_high": 6.5,
                "panic_low": 2.0,
                "panic_high": 7.0,
            },
            {
                "code": "NA",
                "critical_low": 120.0,
                "critical_high": 160.0,
                "panic_low": 115.0,
                "panic_high": 165.0,
            },
            {
                "code": "GLU",
                "critical_low": 2.5,
                "critical_high": 25.0,
                "panic_low": 1.5,
                "panic_high": 33.0,
            },
            {
                "code": "CR",
                "critical_low": None,
                "critical_high": 10.0,
                "panic_low": None,
                "panic_high": 15.0,
            },
            {
                "code": "CA",
                "critical_low": 1.5,
                "critical_high": 3.5,
                "panic_low": 1.0,
                "panic_high": 4.0,
            },
            {
                "code": "BIL_T",
                "critical_low": None,
                "critical_high": 300.0,
                "panic_low": None,
                "panic_high": None,
            },
            {
                "code": "TROP",
                "critical_low": None,
                "critical_high": 0.4,
                "panic_low": None,
                "panic_high": 2.0,
            },
        ]

        created_count = 0
        for d in defaults:
            test = TestCatalog.objects.filter(code=d["code"]).first()
            if not test:
                continue

            _, created = CriticalValueRange.objects.get_or_create(
                facility=facility,
                test=test,
                defaults={
                    "critical_low": d.get("critical_low"),
                    "critical_high": d.get("critical_high"),
                    "panic_low": d.get("panic_low"),
                    "panic_high": d.get("panic_high"),
                    "organization": facility.organization,
                },
            )
            if created:
                created_count += 1

        return Response(
            {"created": created_count, "message": f"Seeded {created_count} critical value ranges."},
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# Critical Value Notification ViewSet
# =============================================================================


class CriticalValueNotificationFilter(filters.FilterSet):
    status = filters.ChoiceFilter(choices=CriticalValueNotification.Status.choices)
    severity = filters.ChoiceFilter(choices=CriticalValueNotification.Severity.choices)
    date_from = filters.DateFilter(field_name="detected_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="detected_at", lookup_expr="date__lte")
    overdue = filters.BooleanFilter(method="filter_overdue")

    class Meta:
        model = CriticalValueNotification
        fields = ["status", "severity", "date_from", "date_to"]

    def filter_overdue(self, queryset, name, value):
        if value:
            return queryset.filter(
                status__in=["PENDING", "NOTIFIED"],
            )
        return queryset


class CriticalValueNotificationViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """View and manage critical value notifications."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    filterset_class = CriticalValueNotificationFilter
    tenant_scope = "facility"
    queryset = CriticalValueNotification.objects.select_related(
        "result__order_item__test",
        "result__order_item__lab_order__patient",
        "critical_range",
        "notified_to",
        "notified_by",
    )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CriticalValueNotificationDetailSerializer
        return CriticalValueNotificationListSerializer

    @action(detail=True, methods=["post"])
    def notify(self, request, pk=None):
        """Record that a clinician has been notified."""
        notification = self.get_object()
        if notification.status != CriticalValueNotification.Status.PENDING:
            return Response(
                {"error": "Already notified"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = NotifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from django.contrib.auth import get_user_model

        User = get_user_model()

        notified_to = None
        notified_to_id = serializer.validated_data.get("notified_to")
        if notified_to_id:
            notified_to = User.objects.filter(pk=notified_to_id).first()

        notification.notify(
            notified_by=request.user,
            notified_to=notified_to,
            notified_to_name=serializer.validated_data.get("notified_to_name", ""),
            method=serializer.validated_data.get("method", "PHONE_CALL"),
        )

        return Response(CriticalValueNotificationDetailSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def read_back(self, request, pk=None):
        """Record read-back verification."""
        notification = self.get_object()
        if notification.status != CriticalValueNotification.Status.NOTIFIED:
            return Response(
                {"error": "Must be in NOTIFIED status for read-back"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReadBackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notification.verify_read_back(serializer.validated_data["read_back_value"])
        return Response(CriticalValueNotificationDetailSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge a notification (final step)."""
        notification = self.get_object()
        if notification.status not in (
            CriticalValueNotification.Status.NOTIFIED,
            CriticalValueNotification.Status.READ_BACK,
        ):
            return Response(
                {"error": "Must be notified or read-back verified to acknowledge"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notification.acknowledge()
        return Response(CriticalValueNotificationDetailSerializer(notification).data)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        """Escalate an overdue notification."""
        notification = self.get_object()

        serializer = EscalateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from django.contrib.auth import get_user_model

        User = get_user_model()

        escalated_to = None
        escalated_to_id = serializer.validated_data.get("escalated_to")
        if escalated_to_id:
            escalated_to = User.objects.filter(pk=escalated_to_id).first()

        notification.escalate(
            escalated_to=escalated_to,
            notes=serializer.validated_data.get("notes", ""),
        )
        return Response(CriticalValueNotificationDetailSerializer(notification).data)

    @action(detail=False, methods=["get"])
    def compliance(self, request):
        """Get critical value notification compliance statistics."""
        self._resolve_tenant_context()
        facility = request.facility

        qs = CriticalValueNotification.objects.filter(facility=facility)

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(detected_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(detected_at__date__lte=date_to)

        total = qs.count()
        acknowledged = qs.filter(status=CriticalValueNotification.Status.ACKNOWLEDGED).count()
        pending = qs.filter(status=CriticalValueNotification.Status.PENDING).count()
        read_back_verified = qs.filter(read_back_verified=True).count()

        # Notifications made within deadline
        notified_qs = qs.filter(notified_at__isnull=False)
        within_deadline = 0
        total_notification_minutes = 0.0
        notified_count = 0

        for n in notified_qs.select_related("critical_range"):
            if n.notification_time_minutes is not None:
                notified_count += 1
                total_notification_minutes += n.notification_time_minutes
                deadline = (
                    n.critical_range.notification_deadline_minutes if n.critical_range else 30
                )
                if n.notification_time_minutes <= deadline:
                    within_deadline += 1

        # Overdue (still pending/notified past deadline)
        overdue_count = sum(
            1
            for n in qs.filter(status__in=["PENDING", "NOTIFIED"]).select_related("critical_range")
            if n.is_overdue
        )

        data = {
            "total_notifications": total,
            "notified_within_deadline": within_deadline,
            "compliance_rate": (within_deadline / notified_count * 100)
            if notified_count > 0
            else 0.0,
            "average_notification_minutes": (
                total_notification_minutes / notified_count if notified_count > 0 else 0.0
            ),
            "overdue_count": overdue_count,
            "acknowledged_count": acknowledged,
            "pending_count": pending,
            "read_back_verified_count": read_back_verified,
            "read_back_rate": (read_back_verified / total * 100) if total > 0 else 0.0,
        }

        serializer = CriticalValueComplianceSerializer(data)
        return Response(serializer.data)
