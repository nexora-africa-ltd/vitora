"""
Serializers for Phase L3: Analyzer Interfacing.
"""

from rest_framework import serializers

from .models import AnalyzerDriverTemplate, AnalyzerMessage, InstrumentChannel

# =============================================================================
# InstrumentChannel Serializers
# =============================================================================


class InstrumentChannelListSerializer(serializers.ModelSerializer):
    """List serializer for instrument channels — compact view."""

    instrument_code = serializers.CharField(source="instrument.code", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True)
    protocol_display = serializers.CharField(source="get_protocol_display", read_only=True)
    direction_display = serializers.CharField(source="get_direction_display", read_only=True)
    connection_status_display = serializers.CharField(
        source="get_connection_status_display", read_only=True
    )

    class Meta:
        model = InstrumentChannel
        fields = [
            "id",
            "instrument",
            "instrument_code",
            "instrument_name",
            "name",
            "protocol",
            "protocol_display",
            "direction",
            "direction_display",
            "host",
            "port",
            "is_active",
            "connection_status",
            "connection_status_display",
            "last_activity_at",
            "last_error",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "connection_status",
            "connection_status_display",
            "last_activity_at",
            "last_error",
            "created_at",
        ]


class InstrumentChannelDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for instrument channels — full view with config."""

    instrument_code = serializers.CharField(source="instrument.code", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True)
    protocol_display = serializers.CharField(source="get_protocol_display", read_only=True)
    direction_display = serializers.CharField(source="get_direction_display", read_only=True)
    connection_status_display = serializers.CharField(
        source="get_connection_status_display", read_only=True
    )
    connection_url = serializers.CharField(read_only=True)

    class Meta:
        model = InstrumentChannel
        fields = [
            "id",
            "instrument",
            "instrument_code",
            "instrument_name",
            "name",
            "protocol",
            "protocol_display",
            "direction",
            "direction_display",
            "host",
            "port",
            "encoding",
            "config",
            "field_mapping",
            "is_active",
            "connection_status",
            "connection_status_display",
            "connection_url",
            "last_activity_at",
            "last_error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "connection_status",
            "connection_status_display",
            "connection_url",
            "last_activity_at",
            "last_error",
            "created_at",
            "updated_at",
        ]


class InstrumentChannelCreateSerializer(serializers.ModelSerializer):
    """Create/update serializer for instrument channels."""

    class Meta:
        model = InstrumentChannel
        fields = [
            "instrument",
            "name",
            "protocol",
            "direction",
            "host",
            "port",
            "encoding",
            "config",
            "field_mapping",
            "is_active",
        ]

    def validate_instrument(self, value):
        """Ensure instrument belongs to the same facility."""
        request = self.context.get("request")
        if (
            request
            and hasattr(request, "facility")
            and request.facility
            and value.facility_id != request.facility.id
        ):
            raise serializers.ValidationError("Instrument must belong to the same facility.")
        return value

    def validate_port(self, value):
        """Validate port range."""
        if value < 1 or value > 65535:
            raise serializers.ValidationError("Port must be between 1 and 65535.")
        return value

    def validate(self, data):
        """Validate unique channel name per instrument."""
        instrument = data.get("instrument")
        name = data.get("name")

        if instrument and name:
            qs = InstrumentChannel.objects.filter(instrument=instrument, name=name)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"name": "A channel with this name already exists for this instrument."}
                )
        return data


class ApplyDriverTemplateSerializer(serializers.Serializer):
    """Serializer for applying a driver template to a channel."""

    template_id = serializers.IntegerField()

    def validate_template_id(self, value):
        """Ensure template exists and is active."""
        if not AnalyzerDriverTemplate.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Driver template not found or inactive.")
        return value


# =============================================================================
# AnalyzerMessage Serializers
# =============================================================================


class AnalyzerMessageListSerializer(serializers.ModelSerializer):
    """List serializer for analyzer messages — compact view."""

    channel_name = serializers.CharField(source="channel.name", read_only=True)
    instrument_code = serializers.CharField(source="channel.instrument.code", read_only=True)
    direction_display = serializers.CharField(source="get_direction_display", read_only=True)
    message_type_display = serializers.CharField(source="get_message_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    specimen_barcode = serializers.CharField(source="specimen.barcode", read_only=True, default="")

    class Meta:
        model = AnalyzerMessage
        fields = [
            "id",
            "channel",
            "channel_name",
            "instrument_code",
            "direction",
            "direction_display",
            "message_type",
            "message_type_display",
            "status",
            "status_display",
            "sample_id",
            "test_code",
            "result_value",
            "result_unit",
            "specimen",
            "specimen_barcode",
            "error_message",
            "retry_count",
            "timestamp",
            "processed_at",
        ]
        read_only_fields = fields


class AnalyzerMessageDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for analyzer messages — includes raw data."""

    channel_name = serializers.CharField(source="channel.name", read_only=True)
    instrument_code = serializers.CharField(source="channel.instrument.code", read_only=True)
    instrument_name = serializers.CharField(source="channel.instrument.name", read_only=True)
    direction_display = serializers.CharField(source="get_direction_display", read_only=True)
    message_type_display = serializers.CharField(source="get_message_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    specimen_barcode = serializers.CharField(source="specimen.barcode", read_only=True, default="")

    class Meta:
        model = AnalyzerMessage
        fields = [
            "id",
            "channel",
            "channel_name",
            "instrument_code",
            "instrument_name",
            "direction",
            "direction_display",
            "message_type",
            "message_type_display",
            "status",
            "status_display",
            "raw_data",
            "parsed_data",
            "sample_id",
            "test_code",
            "result_value",
            "result_unit",
            "specimen",
            "specimen_barcode",
            "lab_order_item",
            "error_message",
            "retry_count",
            "timestamp",
            "processed_at",
            "created_at",
        ]
        read_only_fields = fields


class IngestMessageSerializer(serializers.Serializer):
    """
    Serializer for ingesting a raw analyzer message via REST API.

    Used when analyzers push data to the host (vs. host polling).
    """

    channel_id = serializers.IntegerField()
    raw_data = serializers.CharField()
    timestamp = serializers.DateTimeField(required=False)

    def validate_channel_id(self, value):
        """Ensure channel exists and is active."""
        if not InstrumentChannel.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Channel not found or inactive.")
        return value


# =============================================================================
# AnalyzerDriverTemplate Serializers
# =============================================================================


class AnalyzerDriverTemplateSerializer(serializers.ModelSerializer):
    """Serializer for driver templates."""

    protocol_display = serializers.CharField(source="get_protocol_display", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = AnalyzerDriverTemplate
        fields = [
            "id",
            "name",
            "manufacturer",
            "model_pattern",
            "category",
            "category_display",
            "description",
            "protocol",
            "protocol_display",
            "default_port",
            "default_encoding",
            "default_config",
            "default_field_mapping",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# =============================================================================
# Channel Health / Status Serializers
# =============================================================================


class ChannelHealthSerializer(serializers.Serializer):
    """Read-only serializer for channel health status."""

    channel_id = serializers.IntegerField()
    instrument_code = serializers.CharField()
    channel_name = serializers.CharField()
    connection_status = serializers.CharField()
    last_activity_at = serializers.CharField(allow_null=True)
    last_error = serializers.CharField(allow_blank=True)
    messages_last_hour = serializers.IntegerField()
    errors_last_hour = serializers.IntegerField()
    is_healthy = serializers.BooleanField()


class ChannelStatusSummarySerializer(serializers.Serializer):
    """Summary of all channel statuses for the dashboard."""

    total_channels = serializers.IntegerField()
    active_channels = serializers.IntegerField()
    connected_channels = serializers.IntegerField()
    error_channels = serializers.IntegerField()
    messages_today = serializers.IntegerField()
    results_applied_today = serializers.IntegerField()
    failed_messages_today = serializers.IntegerField()
    channel_statuses = ChannelHealthSerializer(many=True)
