"""
Serializers for the REST sync API (offline-first Tauri/Hub clients).

These serializers handle:
- Batch push of changes from clients to the server
- Incremental pull of changes from the server to clients
- Conflict resolution
- Sync status reporting
"""

from rest_framework import serializers

from hmis.apps.core.models import SyncConflict


class SyncChangeSerializer(serializers.Serializer):
    """A single change entry pushed from a client."""

    table = serializers.CharField(max_length=100)
    operation = serializers.ChoiceField(choices=["CREATE", "UPDATE", "DELETE"])
    record_id = serializers.CharField(max_length=255, allow_null=True, required=False)
    data = serializers.JSONField(default=dict)
    timestamp = serializers.DateTimeField()
    client_id = serializers.CharField(max_length=255, help_text="Unique client device identifier")


class SyncPushRequestSerializer(serializers.Serializer):
    """Batch push request from a client."""

    changes = SyncChangeSerializer(many=True)
    client_id = serializers.CharField(max_length=255, help_text="Unique client device identifier")


class SyncPushRejectionSerializer(serializers.Serializer):
    """Details about a rejected change."""

    index = serializers.IntegerField(help_text="Index in the submitted changes array")
    table = serializers.CharField()
    record_id = serializers.CharField(allow_null=True)
    reason = serializers.CharField()


class SyncPushConflictSerializer(serializers.Serializer):
    """Details about a detected conflict during push."""

    index = serializers.IntegerField()
    table = serializers.CharField()
    record_id = serializers.CharField(allow_null=True)
    conflict_id = serializers.IntegerField(help_text="SyncConflict record ID")
    local_data = serializers.JSONField()
    remote_data = serializers.JSONField()


class SyncPushResponseSerializer(serializers.Serializer):
    """Response to a batch push request."""

    accepted = serializers.IntegerField()
    rejected = serializers.IntegerField()
    conflicts = SyncPushConflictSerializer(many=True)
    rejections = SyncPushRejectionSerializer(many=True)
    server_timestamp = serializers.DateTimeField()


class SyncPullChangeSerializer(serializers.Serializer):
    """A single change returned to the client during pull."""

    table = serializers.CharField()
    operation = serializers.CharField()
    record_id = serializers.CharField(allow_null=True)
    data = serializers.JSONField()
    timestamp = serializers.DateTimeField()
    server_sequence = serializers.IntegerField(help_text="Monotonic sequence number")


class SyncPullResponseSerializer(serializers.Serializer):
    """Response to a pull request."""

    changes = SyncPullChangeSerializer(many=True)
    server_timestamp = serializers.DateTimeField()
    has_more = serializers.BooleanField()
    next_cursor = serializers.CharField(allow_null=True, required=False)


class SyncStatusResponseSerializer(serializers.Serializer):
    """Sync health/status response."""

    last_sync = serializers.DateTimeField(allow_null=True)
    pending_changes = serializers.IntegerField()
    failed_changes = serializers.IntegerField()
    conflicts = serializers.IntegerField()
    server_timestamp = serializers.DateTimeField()


class SyncConflictDetailSerializer(serializers.ModelSerializer):
    """Read serializer for SyncConflict."""

    class Meta:
        model = SyncConflict
        fields = [
            "id",
            "model_name",
            "record_id",
            "field_name",
            "local_data",
            "remote_data",
            "resolved_data",
            "resolution_strategy",
            "status",
            "detected_at",
            "resolved_at",
            "resolved_by",
        ]
        read_only_fields = fields


class SyncConflictResolveSerializer(serializers.Serializer):
    """Request to resolve a sync conflict."""

    conflict_id = serializers.IntegerField()
    resolution = serializers.ChoiceField(choices=["local_wins", "remote_wins", "merge"])
    merged_data = serializers.JSONField(required=False, default=dict)
