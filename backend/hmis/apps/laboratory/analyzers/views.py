# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Views for Phase L3: Analyzer Interfacing.

Provides:
- InstrumentChannelViewSet: CRUD + apply template + health check
- AnalyzerMessageViewSet: List/detail + ingest endpoint
- AnalyzerDriverTemplateViewSet: List/detail (read-only for staff)
- AnalyzerDashboardView: Status overview for all channels
"""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.laboratory.management.commands.seed_analyzer_templates import TEMPLATES
from hmis.apps.laboratory.permissions import (
    LaboratoryModuleRequired,
    LISConfigPermission,
    LISIntegrationSettingsPermission,
)

from .models import AnalyzerDriverTemplate, AnalyzerMessage, InstrumentChannel
from .serializers import (
    AnalyzerDriverTemplateSerializer,
    AnalyzerMessageDetailSerializer,
    AnalyzerMessageListSerializer,
    ApplyDriverTemplateSerializer,
    ChannelHealthSerializer,
    ChannelStatusSummarySerializer,
    IngestMessageSerializer,
    InstrumentChannelCreateSerializer,
    InstrumentChannelDetailSerializer,
    InstrumentChannelListSerializer,
)
from .services import check_channel_health, process_inbound_message

# =============================================================================
# InstrumentChannel ViewSet
# =============================================================================


class InstrumentChannelFilter(filters.FilterSet):
    """Filters for instrument channels."""

    instrument = filters.NumberFilter(field_name="instrument_id")
    protocol = filters.ChoiceFilter(choices=InstrumentChannel.Protocol.choices)
    connection_status = filters.ChoiceFilter(choices=InstrumentChannel.ConnectionStatus.choices)
    is_active = filters.BooleanFilter()
    search = filters.CharFilter(method="filter_search")

    class Meta:
        model = InstrumentChannel
        fields = ["instrument", "protocol", "connection_status", "is_active"]

    def filter_search(self, queryset, name, value):
        from django.db.models import Q

        return queryset.filter(
            Q(name__icontains=value)
            | Q(instrument__code__icontains=value)
            | Q(instrument__name__icontains=value)
            | Q(host__icontains=value)
        )


class InstrumentChannelViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for analyzer communication channels.

    Each instrument can have one or more channels (protocols/connections).
    Provides:
    - Standard CRUD
    - apply_template: Apply a driver template to a channel
    - health: Get real-time connection health
    - test_connection: Ping test for connectivity (placeholder)
    """

    queryset = InstrumentChannel.objects.select_related("instrument").all()
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        LISConfigPermission,
        ReadRequiresModelPermission,
    ]
    filterset_class = InstrumentChannelFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return InstrumentChannelCreateSerializer
        if self.action in ["update", "partial_update"]:
            return InstrumentChannelCreateSerializer
        if self.action == "list":
            return InstrumentChannelListSerializer
        if self.action == "apply_template":
            return ApplyDriverTemplateSerializer
        return InstrumentChannelDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def apply_template(self, request, pk=None):
        """Apply a driver template to this channel."""
        channel = self.get_object()
        serializer = ApplyDriverTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        template = AnalyzerDriverTemplate.objects.get(id=serializer.validated_data["template_id"])
        template.apply_to_channel(channel)
        channel.refresh_from_db()

        return Response(InstrumentChannelDetailSerializer(channel).data)

    @action(detail=True, methods=["get"])
    def health(self, request, pk=None):
        """Get real-time connection health for this channel."""
        channel = self.get_object()
        health_data = check_channel_health(channel)
        return Response(ChannelHealthSerializer(health_data).data)

    @action(detail=True, methods=["post"])
    def test_connection(self, request, pk=None):
        """
        Test connectivity to the analyzer.

        TODO: [AFTER PILOT] Implement actual TCP connection test.
        Currently returns a placeholder response indicating the feature
        requires physical network access to the analyzer.
        """
        channel = self.get_object()
        return Response(
            {
                "channel_id": channel.id,
                "host": channel.host,
                "port": channel.port,
                "status": "not_implemented",
                "message": (
                    "Connection testing requires network access to the analyzer. "
                    "This feature will be enabled during pilot facility setup."
                ),
            }
        )

    @action(detail=True, methods=["post"])
    def disconnect(self, request, pk=None):
        """Mark channel as disconnected (manual override)."""
        channel = self.get_object()
        channel.update_status(InstrumentChannel.ConnectionStatus.DISCONNECTED)
        return Response(InstrumentChannelDetailSerializer(channel).data)


# =============================================================================
# AnalyzerMessage ViewSet
# =============================================================================


class AnalyzerMessageFilter(filters.FilterSet):
    """Filters for analyzer messages."""

    channel = filters.NumberFilter(field_name="channel_id")
    instrument = filters.NumberFilter(field_name="channel__instrument_id")
    direction = filters.ChoiceFilter(choices=AnalyzerMessage.Direction.choices)
    message_type = filters.ChoiceFilter(choices=AnalyzerMessage.MessageType.choices)
    status_filter = filters.ChoiceFilter(
        field_name="status", choices=AnalyzerMessage.Status.choices
    )
    sample_id = filters.CharFilter(lookup_expr="icontains")
    specimen = filters.NumberFilter(field_name="specimen_id")
    timestamp_after = filters.DateTimeFilter(field_name="timestamp", lookup_expr="gte")
    timestamp_before = filters.DateTimeFilter(field_name="timestamp", lookup_expr="lte")

    class Meta:
        model = AnalyzerMessage
        fields = [
            "channel",
            "instrument",
            "direction",
            "message_type",
            "status_filter",
            "sample_id",
            "specimen",
        ]


class AnalyzerMessageViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for analyzer messages (audit trail).

    Messages are created via the ingest endpoint or by Celery tasks,
    not directly by users.
    """

    queryset = AnalyzerMessage.objects.select_related(
        "channel", "channel__instrument", "specimen"
    ).all()
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        LISConfigPermission,
        ReadRequiresModelPermission,
    ]
    filterset_class = AnalyzerMessageFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "list":
            return AnalyzerMessageListSerializer
        return AnalyzerMessageDetailSerializer

    @action(detail=False, methods=["post"])
    def ingest(self, request):
        """
        Ingest a raw message from an analyzer.

        This endpoint is called when an analyzer pushes data to the host
        (vs. the host polling the analyzer). The message is parsed,
        specimen resolved, and results applied if applicable.
        """
        serializer = IngestMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility and not request.user.is_superuser:
            return Response(
                {"detail": "No facility context available for analyzer ingest."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        channel_qs = InstrumentChannel.objects.all()
        if facility and not request.user.is_superuser:
            channel_qs = channel_qs.filter(facility=facility)

        channel = channel_qs.filter(id=serializer.validated_data["channel_id"]).first()
        if channel is None:
            return Response(
                {"detail": "Instrument channel not found for this facility."},
                status=status.HTTP_404_NOT_FOUND,
            )
        raw_data = serializer.validated_data["raw_data"]

        # Process the message
        message = process_inbound_message(channel, raw_data)

        return Response(
            AnalyzerMessageDetailSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# AnalyzerDriverTemplate ViewSet
# =============================================================================


class AnalyzerDriverTemplateFilter(filters.FilterSet):
    """Filters for driver templates."""

    manufacturer = filters.CharFilter(lookup_expr="icontains")
    category = filters.ChoiceFilter(choices=AnalyzerDriverTemplate.AnalyzerCategory.choices)
    protocol = filters.ChoiceFilter(choices=InstrumentChannel.Protocol.choices)
    search = filters.CharFilter(method="filter_search")

    class Meta:
        model = AnalyzerDriverTemplate
        fields = ["manufacturer", "category", "protocol"]

    def filter_search(self, queryset, name, value):
        from django.db.models import Q

        return queryset.filter(
            Q(name__icontains=value)
            | Q(manufacturer__icontains=value)
            | Q(model_pattern__icontains=value)
        )


class AnalyzerDriverTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for analyzer driver templates.

    Templates are global (not facility-scoped) — they're reference data
    for all facilities.
    """

    queryset = AnalyzerDriverTemplate.objects.filter(is_active=True)
    serializer_class = AnalyzerDriverTemplateSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISConfigPermission,
        ReadRequiresModelPermission,
    ]
    filterset_class = AnalyzerDriverTemplateFilter

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """Seed built-in analyzer driver templates (idempotent)."""
        created_count = 0
        skipped_count = 0

        for template_data in TEMPLATES:
            name = template_data["name"]
            if AnalyzerDriverTemplate.objects.filter(name=name).exists():
                skipped_count += 1
                continue

            AnalyzerDriverTemplate.objects.create(**template_data)
            created_count += 1

        return Response(
            {
                "created": created_count,
                "skipped": skipped_count,
                "total": len(TEMPLATES),
            },
            status=status.HTTP_200_OK,
        )


# =============================================================================
# Dashboard View
# =============================================================================


class AnalyzerDashboardView(APIView):
    """
    Dashboard overview of all analyzer channels for a facility.

    Returns connection status summary and per-channel health info.
    """

    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        LISConfigPermission,
        ReadRequiresModelPermission,
    ]
    required_permission = "laboratory.view_instrumentchannel"
    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}

    def get(self, request):
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility and not request.user.is_superuser:
            return Response(
                {"detail": "No facility context available for analyzer dashboard."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        channels = InstrumentChannel.objects.filter(is_active=True).select_related("instrument")
        if facility and not request.user.is_superuser:
            channels = channels.filter(facility=facility)

        # Get health for each channel
        channel_health = []
        for channel in channels:
            health = check_channel_health(channel)
            channel_health.append(health)

        # Message stats for today
        from django.utils import timezone

        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_messages = AnalyzerMessage.objects.filter(timestamp__gte=today_start)
        if facility and not request.user.is_superuser:
            today_messages = today_messages.filter(facility=facility)

        # Aggregate status counts
        dashboard_data = {
            "total_channels": len(channel_health),
            "active_channels": sum(
                1
                for h in channel_health
                if h["connection_status"] != InstrumentChannel.ConnectionStatus.DISCONNECTED
            ),
            "connected_channels": sum(
                1
                for h in channel_health
                if h["connection_status"] == InstrumentChannel.ConnectionStatus.CONNECTED
            ),
            "error_channels": sum(
                1
                for h in channel_health
                if h["connection_status"] == InstrumentChannel.ConnectionStatus.ERROR
            ),
            "messages_today": today_messages.count(),
            "results_applied_today": today_messages.filter(
                status=AnalyzerMessage.Status.APPLIED
            ).count(),
            "failed_messages_today": today_messages.filter(
                status=AnalyzerMessage.Status.FAILED
            ).count(),
            "channel_statuses": channel_health,
        }

        serializer = ChannelStatusSummarySerializer(dashboard_data)
        return Response(serializer.data)
