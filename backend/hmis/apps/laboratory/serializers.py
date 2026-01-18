"""
Serializers for laboratory models.
"""

from rest_framework import serializers

from .models import LabOrder, LabOrderItem, LabQueue, LabResult, LOINCCode, TestCatalog


class TestCatalogSerializer(serializers.ModelSerializer):
    """Serializer for test catalog listing."""

    class Meta:
        model = TestCatalog
        fields = [
            "id",
            "code",
            "name",
            "short_name",
            "category",
            "specimen_type",
            "cost",
            "sha_claimable",
            "available_in_house",
            "is_active",
        ]


class TestCatalogDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer with normal ranges and panel info."""

    panel_components = TestCatalogSerializer(many=True, read_only=True)

    class Meta:
        model = TestCatalog
        fields = "__all__"


class LabOrderItemSerializer(serializers.ModelSerializer):
    """Order item with test details."""

    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)
    test = serializers.PrimaryKeyRelatedField(
        queryset=TestCatalog.objects.all(), write_only=True, required=False
    )
    has_result = serializers.SerializerMethodField()
    result = serializers.SerializerMethodField()

    class Meta:
        model = LabOrderItem
        fields = [
            "id",
            "test",
            "test_name",
            "test_code",
            "status",
            "unit_cost",
            "special_instructions",
            "has_result",
            "result",
        ]

    def get_has_result(self, obj):
        return hasattr(obj, "result")

    def get_result(self, obj):
        if not hasattr(obj, "result"):
            return None
        result = obj.result
        return {
            "id": result.id,
            "numeric_value": (
                str(result.numeric_value) if result.numeric_value is not None else None
            ),
            "text_value": result.text_value,
            "option_value": result.option_value,
            "result_unit": result.result_unit,
            "result_flag": result.result_flag,
            "interpretation": result.interpretation,
            "verification_status": result.verification_status,
            "is_critical_result": result.is_critical_result,
            "reference_range_text": result.reference_range_text,
            "entered_at": result.entered_at.isoformat() if result.entered_at else None,
        }


class LabOrderSerializer(serializers.ModelSerializer):
    """Order with status and items."""

    items = LabOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LabOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "encounter",
            "ordered_by",
            "ordered_by_name",
            "order_type",
            "external_lab",
            "priority",
            "clinical_notes",
            "status",
            "specimen_collected",
            "total_cost",
            "items",
            "ordered_at",
            "completed_at",
        ]
        read_only_fields = ["order_number", "ordered_at"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj):
        return obj.ordered_by.get_full_name() or obj.ordered_by.username


class LabOrderItemCreateSerializer(serializers.Serializer):
    """Serializer for creating order items."""

    test_code = serializers.CharField()
    special_instructions = serializers.CharField(required=False, allow_blank=True)


class LabOrderCreateSerializer(serializers.ModelSerializer):
    """Create order with items."""

    items = LabOrderItemCreateSerializer(many=True, write_only=True)

    class Meta:
        model = LabOrder
        fields = [
            "patient",
            "encounter",
            "order_type",
            "external_lab",
            "priority",
            "clinical_notes",
            "items",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        ordered_by = self.context["request"].user
        order = LabOrder.objects.create(ordered_by=ordered_by, **validated_data)

        for item_data in items_data:
            test_code = item_data["test_code"]
            try:
                test = TestCatalog.objects.get(code=test_code)
            except TestCatalog.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"items": f"Test with code '{test_code}' not found in catalog."}
                ) from e

            special_instructions = item_data.get("special_instructions", "")
            LabOrderItem.objects.create(
                lab_order=order,
                test=test,
                unit_cost=test.cost,
                special_instructions=special_instructions,
            )

        order.calculate_total_cost()
        return order


class LabResultSerializer(serializers.ModelSerializer):
    """Result with test info and flags."""

    test_name = serializers.CharField(source="order_item.test.name", read_only=True)
    test_code = serializers.CharField(source="order_item.test.code", read_only=True)
    formatted_value = serializers.CharField(source="get_formatted_value", read_only=True)
    numeric_value = serializers.DecimalField(
        max_digits=15, decimal_places=4, required=False, allow_null=True, coerce_to_string=True
    )

    class Meta:
        model = LabResult
        fields = [
            "id",
            "order_item",
            "test_name",
            "test_code",
            "numeric_value",
            "text_value",
            "option_value",
            "result_flag",
            "formatted_value",
            "interpretation",
            "verification_status",
            "verified_by",
            "verified_at",
            "entered_by",
            "entered_at",
            "is_external_result",
        ]
        read_only_fields = ["entered_by", "entered_at", "result_flag"]


class LabResultCreateSerializer(serializers.ModelSerializer):
    """Create/update result."""

    class Meta:
        model = LabResult
        fields = [
            "order_item",
            "numeric_value",
            "text_value",
            "option_value",
            "result_unit",
            "reference_low",
            "reference_high",
            "reference_range_text",
            "result_flag",
            "interpretation",
            "is_critical_result",
            "method",
            "equipment",
            "is_external_result",
            "external_result_date",
        ]

    def create(self, validated_data):
        entered_by = self.context["request"].user
        result = LabResult.objects.create(entered_by=entered_by, **validated_data)

        # Auto-flag numeric results if not manually set
        if result.numeric_value is not None and not result.result_flag:
            result.auto_flag_result()

        return result


class LabResultVerifySerializer(serializers.Serializer):
    """Verify result action."""

    approved = serializers.BooleanField()
    comments = serializers.CharField(required=False, allow_blank=True)


class LOINCCodeSerializer(serializers.ModelSerializer):
    """LOINC code serializer."""

    class Meta:
        model = LOINCCode
        fields = "__all__"


# ============================================================================
# Lab Queue Serializers
# ============================================================================


class LabQueueSerializer(serializers.ModelSerializer):
    """Serializer for lab queue listing and detail."""

    # Order info
    order_number = serializers.CharField(source="lab_order.order_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="lab_order.patient.mrn", read_only=True)

    # Test info
    tests = serializers.SerializerMethodField()

    # User info
    assigned_technician_name = serializers.SerializerMethodField()
    collected_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    # TAT fields
    expected_tat_hours = serializers.SerializerMethodField()
    elapsed_hours = serializers.SerializerMethodField()
    actual_tat_hours = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = LabQueue
        fields = [
            "id",
            "queue_number",
            "order_number",
            "patient_name",
            "patient_mrn",
            "tests",
            "priority",
            "queue_status",
            "sample_type",
            "sample_id",
            "assigned_technician",
            "assigned_technician_name",
            "collected_by",
            "collected_by_name",
            "collected_at",
            "processing_started_at",
            "processing_completed_at",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "released_at",
            "technician_notes",
            "rejection_reason",
            "created_at",
            "updated_at",
            # TAT fields
            "expected_tat_hours",
            "elapsed_hours",
            "actual_tat_hours",
            "is_overdue",
        ]
        read_only_fields = [
            "queue_number",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        patient = obj.lab_order.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_tests(self, obj):
        return [
            {"code": item.test.code, "name": item.test.name} for item in obj.lab_order.items.all()
        ]

    def get_assigned_technician_name(self, obj):
        if obj.assigned_technician:
            return obj.assigned_technician.get_full_name() or obj.assigned_technician.username
        return None

    def get_collected_by_name(self, obj):
        if obj.collected_by:
            return obj.collected_by.get_full_name() or obj.collected_by.username
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None

    def get_expected_tat_hours(self, obj):
        """Get expected TAT from first test in order."""
        first_item = obj.lab_order.items.first()
        if first_item and first_item.test:
            return first_item.test.turnaround_hours
        return 24  # Default 24 hours

    def get_elapsed_hours(self, obj):
        """Calculate hours since queue entry was created."""
        from django.utils import timezone

        delta = timezone.now() - obj.created_at
        return round(delta.total_seconds() / 3600, 1)

    def get_actual_tat_hours(self, obj):
        """Calculate actual TAT for released samples."""
        if obj.released_at:
            delta = obj.released_at - obj.created_at
            return round(delta.total_seconds() / 3600, 1)
        return None

    def get_is_overdue(self, obj):
        """Check if sample is overdue based on expected TAT."""
        if obj.queue_status == "RELEASED":
            return False
        expected = self.get_expected_tat_hours(obj)
        elapsed = self.get_elapsed_hours(obj)
        return elapsed > expected


class LabQueueCollectSerializer(serializers.Serializer):
    """Serializer for sample collection action."""

    sample_id = serializers.CharField(required=False, allow_blank=True, default="")


class LabQueueAssignSerializer(serializers.Serializer):
    """Serializer for technician assignment action."""

    technician_id = serializers.IntegerField(required=False, allow_null=True)


class LabQueueRejectSerializer(serializers.Serializer):
    """Serializer for sample rejection action."""

    reason = serializers.CharField(required=True, min_length=5)


class LabQueueNotesSerializer(serializers.Serializer):
    """Serializer for adding technician notes."""

    notes = serializers.CharField(required=True)
    append = serializers.BooleanField(required=False, default=False)


class TechnicianSerializer(serializers.Serializer):
    """Serializer for listing available technicians."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username
