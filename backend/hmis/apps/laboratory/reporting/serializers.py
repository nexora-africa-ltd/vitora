"""Serializers for L5 reporting models."""

from rest_framework import serializers

from .models import TATSLATarget, TATSnapshot, WorkloadSnapshot


class TATSLATargetSerializer(serializers.ModelSerializer):
    test_code = serializers.CharField(source="test.code", read_only=True)
    test_name = serializers.CharField(source="test.name", read_only=True)

    class Meta:
        model = TATSLATarget
        fields = [
            "id",
            "test",
            "test_code",
            "test_name",
            "priority",
            "target_order_to_collect_minutes",
            "target_collect_to_receive_minutes",
            "target_receive_to_result_minutes",
            "target_result_to_verify_minutes",
            "target_total_minutes",
            "breach_escalation_email",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "test_code", "test_name"]


class TATSLATargetCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TATSLATarget
        fields = [
            "test",
            "priority",
            "target_order_to_collect_minutes",
            "target_collect_to_receive_minutes",
            "target_receive_to_result_minutes",
            "target_result_to_verify_minutes",
            "target_total_minutes",
            "breach_escalation_email",
            "is_active",
        ]


class TATSnapshotSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="lab_order.order_number", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True, default=None)
    test_name = serializers.CharField(source="test.name", read_only=True, default=None)
    resulted_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    sla_target_minutes = serializers.IntegerField(
        source="sla_target.target_total_minutes", read_only=True, default=None
    )

    class Meta:
        model = TATSnapshot
        fields = [
            "id",
            "order_number",
            "test_code",
            "test_name",
            "priority",
            "ordered_at",
            "collected_at",
            "received_at",
            "resulted_at",
            "verified_at",
            "released_at",
            "tat_order_to_collect",
            "tat_collect_to_receive",
            "tat_receive_to_result",
            "tat_result_to_verify",
            "tat_total",
            "is_breach",
            "breach_minutes",
            "sla_target_minutes",
            "resulted_by_name",
            "verified_by_name",
            "snapshot_created_at",
        ]

    def get_resulted_by_name(self, obj):
        if obj.resulted_by:
            return obj.resulted_by.get_full_name() or obj.resulted_by.username
        return None

    def get_verified_by_name(self, obj):
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
        return None


class WorkloadSnapshotSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()
    rejection_rate = serializers.FloatField(read_only=True)
    critical_compliance_rate = serializers.FloatField(read_only=True)

    class Meta:
        model = WorkloadSnapshot
        fields = [
            "id",
            "date",
            "technician",
            "technician_name",
            "tests_entered",
            "tests_verified",
            "specimens_collected",
            "specimens_rejected",
            "avg_entry_time_minutes",
            "avg_verify_time_minutes",
            "critical_results_count",
            "critical_notified_within_30min",
            "rejection_rate",
            "critical_compliance_rate",
            "created_at",
        ]

    def get_technician_name(self, obj):
        return obj.technician.get_full_name() or obj.technician.username
