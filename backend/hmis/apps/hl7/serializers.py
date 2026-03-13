"""HL7 message serializers for read-only API access."""

from rest_framework import serializers

from .models import HL7Message


class HL7MessageSerializer(serializers.ModelSerializer):
    """Read-only serializer for HL7 messages."""

    is_retryable = serializers.BooleanField(read_only=True)

    class Meta:
        model = HL7Message
        fields = [
            "id",
            "message_type",
            "direction",
            "raw_message",
            "message_control_id",
            "status",
            "retry_count",
            "max_retries",
            "last_error",
            "ack_code",
            "resource_type",
            "resource_id",
            "destination_host",
            "destination_port",
            "next_retry_at",
            "sent_at",
            "acknowledged_at",
            "created_at",
            "updated_at",
            "is_retryable",
        ]
        read_only_fields = fields


class HL7MessageListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for HL7 message list view."""

    is_retryable = serializers.BooleanField(read_only=True)

    class Meta:
        model = HL7Message
        fields = [
            "id",
            "message_type",
            "direction",
            "message_control_id",
            "status",
            "retry_count",
            "last_error",
            "ack_code",
            "resource_type",
            "resource_id",
            "sent_at",
            "acknowledged_at",
            "created_at",
            "is_retryable",
        ]
        read_only_fields = fields
