"""Serializers for Critical Value Management."""

from rest_framework import serializers

from .models import CriticalValueNotification, CriticalValueRange

# =============================================================================
# Critical Value Range
# =============================================================================


class CriticalValueRangeListSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)

    class Meta:
        model = CriticalValueRange
        fields = [
            "id",
            "test",
            "test_name",
            "test_code",
            "critical_low",
            "critical_high",
            "panic_low",
            "panic_high",
            "notification_deadline_minutes",
            "is_active",
            "created_at",
            "updated_at",
        ]


class CriticalValueRangeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CriticalValueRange
        fields = [
            "test",
            "critical_low",
            "critical_high",
            "panic_low",
            "panic_high",
            "notification_deadline_minutes",
        ]


# =============================================================================
# Critical Value Notification
# =============================================================================


class CriticalValueNotificationListSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    minutes_elapsed = serializers.FloatField(read_only=True)
    notification_time_minutes = serializers.FloatField(read_only=True)

    class Meta:
        model = CriticalValueNotification
        fields = [
            "id",
            "result",
            "status",
            "severity",
            "critical_value",
            "test_name",
            "patient_name",
            "notification_method",
            "notified_to_name",
            "notified_by",
            "detected_at",
            "notified_at",
            "acknowledged_at",
            "is_overdue",
            "minutes_elapsed",
            "notification_time_minutes",
            "read_back_verified",
            "created_at",
        ]


class CriticalValueNotificationDetailSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    minutes_elapsed = serializers.FloatField(read_only=True)
    notification_time_minutes = serializers.FloatField(read_only=True)

    class Meta:
        model = CriticalValueNotification
        fields = [
            "id",
            "result",
            "critical_range",
            "status",
            "severity",
            "critical_value",
            "test_name",
            "patient_name",
            "notification_method",
            "notified_to",
            "notified_to_name",
            "notified_by",
            "detected_at",
            "notified_at",
            "read_back_at",
            "acknowledged_at",
            "read_back_verified",
            "read_back_value",
            "escalation_notes",
            "escalated_to",
            "notes",
            "is_overdue",
            "minutes_elapsed",
            "notification_time_minutes",
            "created_at",
            "updated_at",
        ]


class NotifySerializer(serializers.Serializer):
    """Input for recording a notification."""

    notified_to = serializers.IntegerField(
        required=False, help_text="User ID of clinician notified"
    )
    notified_to_name = serializers.CharField(
        required=False,
        default="",
        help_text="Name if not a system user",
    )
    method = serializers.ChoiceField(
        choices=CriticalValueNotification.NotificationMethod.choices,
        default="PHONE_CALL",
    )


class ReadBackSerializer(serializers.Serializer):
    """Input for read-back verification."""

    read_back_value = serializers.CharField(help_text="Value read back by the clinician")


class EscalateSerializer(serializers.Serializer):
    """Input for escalation."""

    escalated_to = serializers.IntegerField(required=False)
    notes = serializers.CharField(required=False, default="")


class CriticalValueComplianceSerializer(serializers.Serializer):
    """Compliance report statistics."""

    total_notifications = serializers.IntegerField()
    notified_within_deadline = serializers.IntegerField()
    compliance_rate = serializers.FloatField()
    average_notification_minutes = serializers.FloatField()
    overdue_count = serializers.IntegerField()
    acknowledged_count = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    read_back_verified_count = serializers.IntegerField()
    read_back_rate = serializers.FloatField()
