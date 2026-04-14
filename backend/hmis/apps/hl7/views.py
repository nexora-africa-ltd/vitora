"""HL7 message read-only ViewSet."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from .models import HL7Message, HL7MessageStatus
from .serializers import HL7MessageListSerializer, HL7MessageSerializer


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


class HL7MessageViewSet(viewsets.ReadOnlyModelViewSet):
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
