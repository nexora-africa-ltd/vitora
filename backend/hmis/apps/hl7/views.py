"""HL7 endpoint and message ViewSets."""

import time

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin

from .models import HL7Endpoint, HL7EndpointType, HL7Message, HL7MessageStatus
from .serializers import (
    HL7EndpointCreateSerializer,
    HL7EndpointListSerializer,
    HL7EndpointSerializer,
    HL7EndpointTestSerializer,
    HL7MessageListSerializer,
    HL7MessageSerializer,
)

# ─── HL7 Endpoint ViewSet ────────────────────────────────────────────────────


class HL7EndpointFilter(filters.FilterSet):
    """Filter for HL7 endpoints."""

    endpoint_type = filters.ChoiceFilter(choices=HL7EndpointType.choices)
    is_active = filters.BooleanFilter()

    class Meta:
        model = HL7Endpoint
        fields = ["endpoint_type", "is_active"]


class HL7EndpointViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD ViewSet for facility-scoped HL7 endpoints.

    Allows facility admins to configure external LIS/RIS/PAS connections.
    Includes a test_connection action to verify reachability.
    """

    queryset = HL7Endpoint.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = HL7EndpointFilter
    search_fields = ["name", "mllp_host", "receiving_facility"]
    ordering_fields = ["name", "created_at", "is_active"]
    ordering = ["name"]
    tenant_scope = "facility"

    def get_serializer_class(self):  # type: ignore[override]
        if self.action == "list":
            return HL7EndpointListSerializer
        if self.action in ("create", "update", "partial_update"):
            return HL7EndpointCreateSerializer
        if self.action == "test_connection":
            return HL7EndpointTestSerializer
        return HL7EndpointSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def test_connection(self, request, pk=None):
        """
        Test MLLP connectivity to this endpoint.

        Attempts a TCP connection and measures latency.
        Does NOT send an HL7 message.
        """
        endpoint = self.get_object()
        start = time.time()
        error = ""
        success = False

        try:
            import socket

            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(endpoint.timeout)
            sock.connect((endpoint.mllp_host, endpoint.mllp_port))
            sock.close()
            success = True
        except Exception as exc:
            error = str(exc)

        latency_ms = (time.time() - start) * 1000

        return Response({"success": success, "latency_ms": round(latency_ms, 2), "error": error})

    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        """Toggle endpoint active/inactive status."""
        endpoint = self.get_object()
        endpoint.is_active = not endpoint.is_active
        endpoint.save(update_fields=["is_active", "updated_at"])
        return Response(HL7EndpointSerializer(endpoint).data)


# ─── HL7 Message ViewSet ─────────────────────────────────────────────────────


class HL7MessageFilter(filters.FilterSet):
    """Filter for HL7 messages."""

    message_type = filters.CharFilter(lookup_expr="icontains")
    direction = filters.ChoiceFilter(choices=[("IN", "Inbound"), ("OUT", "Outbound")])
    status = filters.ChoiceFilter(
        choices=HL7MessageStatus.choices,
    )
    resource_type = filters.CharFilter(lookup_expr="iexact")
    created_after = filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = HL7Message
        fields = [
            "message_type",
            "direction",
            "status",
            "resource_type",
        ]


class HL7MessageViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for HL7 message monitoring.

    Provides list and detail views for HL7 messages plus
    a retry action for failed messages (admin only).
    """

    queryset = HL7Message.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = HL7MessageFilter
    search_fields = ["message_control_id", "resource_type", "message_type"]
    ordering_fields = ["created_at", "status", "message_type", "retry_count"]
    ordering = ["-created_at"]
    tenant_scope = "facility"

    def get_serializer_class(self):  # type: ignore[override]
        if self.action == "list":
            return HL7MessageListSerializer
        return HL7MessageSerializer

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def retry(self, request, pk=None):  # type: ignore[no-untyped-def]
        """Retry sending a failed HL7 message."""
        message = self.get_object()
        if not message.is_retryable:
            return Response(
                {"error": "Message is not retryable (not FAILED or max retries exceeded)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        message.status = HL7MessageStatus.PENDING
        message.save(update_fields=["status", "updated_at"])
        return Response(HL7MessageSerializer(message).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):  # type: ignore[no-untyped-def]
        """Get HL7 message statistics."""
        qs = self.filter_queryset(self.get_queryset())
        stats_data = {
            "total": qs.count(),
            "pending": qs.filter(status=HL7MessageStatus.PENDING).count(),
            "sent": qs.filter(status=HL7MessageStatus.SENT).count(),
            "acknowledged": qs.filter(status=HL7MessageStatus.ACKNOWLEDGED).count(),
            "failed": qs.filter(status=HL7MessageStatus.FAILED).count(),
            "dead_letter": qs.filter(status=HL7MessageStatus.DEAD_LETTER).count(),
        }
        return Response(stats_data)
