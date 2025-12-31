"""
Serializers for laboratory models.
"""

from rest_framework import serializers
from .models import TestCatalog, LabOrder, LabOrderItem, LabResult, LOINCCode


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
        ]


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


class LabOrderCreateSerializer(serializers.ModelSerializer):
    """Create order with items."""

    items = LabOrderItemSerializer(many=True, write_only=True)

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
            test = item_data["test"]
            LabOrderItem.objects.create(
                lab_order=order, test=test, unit_cost=test.cost, **item_data
            )

        order.calculate_total_cost()
        return order


class LabResultSerializer(serializers.ModelSerializer):
    """Result with test info and flags."""

    test_name = serializers.CharField(source="order_item.test.name", read_only=True)
    test_code = serializers.CharField(source="order_item.test.code", read_only=True)
    formatted_value = serializers.CharField(source="get_formatted_value", read_only=True)

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
            "interpretation",
            "is_external_result",
            "external_result_date",
        ]

    def create(self, validated_data):
        entered_by = self.context["request"].user
        result = LabResult.objects.create(entered_by=entered_by, **validated_data)
        
        # Auto-flag numeric results
        if result.numeric_value is not None:
            result.auto_flag_result()
        
        return result


class LOINCCodeSerializer(serializers.ModelSerializer):
    """LOINC code serializer."""

    class Meta:
        model = LOINCCode
        fields = "__all__"
