"""HL7 message and endpoint serializers."""

from rest_framework import serializers

from .models import HL7Endpoint, HL7Message


class HL7EndpointSerializer(serializers.ModelSerializer):
    """Full serializer for HL7 endpoint CRUD."""

    message_count = serializers.SerializerMethodField()

    class Meta:
        model = HL7Endpoint
        fields = [
            "id",
            "name",
            "endpoint_type",
            "mllp_host",
            "mllp_port",
            "receiving_application",
            "receiving_facility",
            "sending_application",
            "sending_facility",
            "lis_code_system",
            "is_active",
            "use_ssl",
            "timeout",
            "max_retries",
            "notes",
            "created_at",
            "updated_at",
            "message_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "message_count"]

    def get_message_count(self, obj) -> int:
        return obj.messages.count() if hasattr(obj, "messages") else 0


class HL7EndpointListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for endpoint list view."""

    message_count = serializers.SerializerMethodField()

    class Meta:
        model = HL7Endpoint
        fields = [
            "id",
            "name",
            "endpoint_type",
            "mllp_host",
            "mllp_port",
            "receiving_facility",
            "is_active",
            "created_at",
            "message_count",
        ]
        read_only_fields = fields

    def get_message_count(self, obj) -> int:
        return obj.messages.count() if hasattr(obj, "messages") else 0


class HL7EndpointCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating HL7 endpoints."""

    class Meta:
        model = HL7Endpoint
        fields = [
            "name",
            "endpoint_type",
            "mllp_host",
            "mllp_port",
            "receiving_application",
            "receiving_facility",
            "sending_application",
            "sending_facility",
            "lis_code_system",
            "is_active",
            "use_ssl",
            "timeout",
            "max_retries",
            "notes",
        ]


class HL7EndpointTestSerializer(serializers.Serializer):
    """Serializer for testing endpoint connectivity."""

    success = serializers.BooleanField(read_only=True)
    latency_ms = serializers.FloatField(read_only=True)
    error = serializers.CharField(read_only=True, allow_blank=True)


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
