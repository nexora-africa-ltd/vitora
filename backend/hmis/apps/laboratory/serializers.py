"""
Serializers for laboratory models.
"""


from typing import Optional

from rest_framework import serializers

from .models import (
    LabOrder,
    LabOrderItem,
    LabQueue,
    LabResult,
    LabResultAttachment,
    LOINCCode,
    ResultValidation,
    TestCatalog,
)


class LabResultAttachmentSerializer(serializers.ModelSerializer):
    """Serializer for lab result attachments (read)."""

    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LabResultAttachment
        fields = [
            "id",
            "lab_order",
            "file",
            "filename",
            "file_type",
            "file_size",
            "attachment_type",
            "description",
            "uploaded_by",
            "uploaded_by_name",
            "uploaded_at",
        ]
        read_only_fields = fields

    def get_uploaded_by_name(self, obj) -> Optional[str]:
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return None


class LabResultAttachmentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating lab result attachments."""

    class Meta:
        model = LabResultAttachment
        fields = [
            "file",
            "attachment_type",
            "description",
        ]

    def validate_file(self, value):
        from .validators import validate_lab_attachment

        validate_lab_attachment(value)
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        lab_order = self.context.get("lab_order")
        if request is None or lab_order is None:
            raise serializers.ValidationError("Missing request or lab_order context")

        return LabResultAttachment.objects.create(
            lab_order=lab_order,
            uploaded_by=request.user,
            **validated_data,
        )


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


class LabResultNestedSerializer(serializers.ModelSerializer):
    """Nested result serializer for LabOrderItem - returns all fields frontend expects."""

    entered_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    # Coerce numeric_value to float for frontend compatibility
    numeric_value = serializers.SerializerMethodField()
    # Ensure result_flag returns null instead of empty string
    result_flag = serializers.SerializerMethodField()
    # Use model's get_formatted_value method
    formatted_value = serializers.CharField(source="get_formatted_value", read_only=True)
    # Two-stage validation summary (Phase L2)
    validation_summary = serializers.SerializerMethodField()

    class Meta:
        model = LabResult
        fields = [
            "id",
            "order_item",
            "numeric_value",
            "text_value",
            "option_value",
            "formatted_value",
            "result_unit",
            "reference_low",
            "reference_high",
            "reference_range_text",
            "result_flag",
            "interpretation",
            "is_critical_result",
            "method",
            "equipment",
            "verification_status",
            "verified_by",
            "verified_by_name",
            "verified_at",
            "entered_by",
            "entered_by_name",
            "entered_at",
            "is_amended",
            "amendment_reason",
            "original_value",
            "is_external_result",
            "external_result_attachment",
            "external_result_date",
            "created_at",
            "updated_at",
            "validation_summary",
        ]
        read_only_fields = fields

    def get_numeric_value(self, obj) -> Optional[float]:
        if obj.numeric_value is not None:
            return float(obj.numeric_value)
        return None

    def get_result_flag(self, obj) -> Optional[str]:
        # Return null instead of empty string for frontend enum compatibility
        return obj.result_flag if obj.result_flag else None

    def get_entered_by_name(self, obj) -> Optional[str]:
        if obj.entered_by:
            return obj.entered_by.get_full_name() or obj.entered_by.username
        return None

    def get_verified_by_name(self, obj) -> Optional[str]:
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
        return None

    def get_validation_summary(self, obj) -> Optional[dict]:
        """Return two-stage validation summary for frontend display."""
        return obj.get_validation_summary()


class LabOrderItemSerializer(serializers.ModelSerializer):
    """Order item with test details."""

    lab_order = serializers.PrimaryKeyRelatedField(read_only=True)
    test = serializers.PrimaryKeyRelatedField(read_only=True)
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)
    has_result = serializers.SerializerMethodField()
    result = serializers.SerializerMethodField()
    # Coerce unit_cost to float for frontend compatibility
    unit_cost = serializers.SerializerMethodField()

    class Meta:
        model = LabOrderItem
        fields = [
            "id",
            "lab_order",
            "test",
            "test_name",
            "test_code",
            "status",
            "unit_cost",
            "special_instructions",
            "has_result",
            "result",
            "created_at",
        ]

    def get_has_result(self, obj) -> bool:
        return hasattr(obj, "result")

    def get_unit_cost(self, obj) -> float:
        return float(obj.unit_cost) if obj.unit_cost else 0.0

    def get_result(self, obj) -> Optional[dict]:
        if not hasattr(obj, "result"):
            return None
        return LabResultNestedSerializer(obj.result).data


class LabOrderSerializer(serializers.ModelSerializer):
    """Order with status and items."""

    items = LabOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    ordered_by_name = serializers.SerializerMethodField()
    # Coerce total_cost to float for frontend compatibility
    total_cost = serializers.SerializerMethodField()

    class Meta:
        model = LabOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "encounter",
            "admission",
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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["order_number", "ordered_at", "created_at", "updated_at"]

    def get_total_cost(self, obj) -> float:
        return float(obj.total_cost) if obj.total_cost else 0.0

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj) -> str:
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
            "admission",
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
    numeric_value = serializers.SerializerMethodField()
    # Two-stage validation summary (Phase L2)
    validation_summary = serializers.SerializerMethodField()

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
            "is_critical_result",
            "is_amended",
            "created_at",
            "updated_at",
            "validation_summary",
        ]
        read_only_fields = ["entered_by", "entered_at", "result_flag", "validation_summary"]

    def get_numeric_value(self, obj) -> float | None:
        """Return numeric_value as float for frontend compatibility."""
        if obj.numeric_value is not None:
            return float(obj.numeric_value)
        return None

    def get_validation_summary(self, obj) -> dict | None:
        """Return two-stage validation summary for frontend display."""
        return obj.get_validation_summary()


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

        if result.specimen is None:
            queue_entry = getattr(result.order_item.lab_order, "queue_entry", None)
            if queue_entry and queue_entry.specimen:
                result.specimen = queue_entry.specimen
                result.save(update_fields=["specimen"])

        # Auto-flag numeric results if not manually set
        if result.numeric_value is not None and not result.result_flag:
            result.auto_flag_result()

        return result


class LabResultVerifySerializer(serializers.Serializer):
    """Verify result action with two-stage validation support."""

    approved = serializers.BooleanField()
    comments = serializers.CharField(required=False, allow_blank=True, default="")
    validation_type = serializers.ChoiceField(
        choices=["TECHNICAL", "CLINICAL"],
        required=False,
        default="TECHNICAL",
        help_text="Type of validation: TECHNICAL (lab tech) or CLINICAL (pathologist)",
    )


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

    specimen_id = serializers.IntegerField(source="specimen.id", read_only=True)
    sample_type = serializers.SerializerMethodField()
    sample_id = serializers.SerializerMethodField()
    collected_by = serializers.SerializerMethodField()
    collected_at = serializers.SerializerMethodField()

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
            "specimen_id",
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
            "specimen_id",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        patient = obj.lab_order.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_tests(self, obj) -> list:
        return [
            {"code": item.test.code, "name": item.test.name} for item in obj.lab_order.items.all()
        ]

    def get_assigned_technician_name(self, obj) -> str:
        if obj.assigned_technician:
            return obj.assigned_technician.get_full_name() or obj.assigned_technician.username
        return None

    def get_collected_by_name(self, obj) -> Optional[str]:
        collected_by = obj.specimen.collected_by if obj.specimen else obj.collected_by
        if collected_by:
            return collected_by.get_full_name() or collected_by.username
        return None

    def get_sample_type(self, obj) -> Optional[str]:
        if obj.specimen:
            return obj.specimen.specimen_type
        return obj.sample_type or "BLOOD"

    def get_sample_id(self, obj) -> Optional[str]:
        if obj.specimen:
            return obj.specimen.barcode
        return obj.sample_id or None

    def get_collected_by(self, obj) -> Optional[int]:
        if obj.specimen and obj.specimen.collected_by:
            return obj.specimen.collected_by_id
        return obj.collected_by_id

    def get_collected_at(self, obj) -> Optional[str]:
        collected_at = obj.specimen.collected_at if obj.specimen else obj.collected_at
        return collected_at

    def get_reviewed_by_name(self, obj) -> Optional[str]:
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None

    def get_expected_tat_hours(self, obj) -> Optional[int]:
        """Get expected TAT from first test in order."""
        first_item = obj.lab_order.items.first()
        if first_item and first_item.test:
            return first_item.test.turnaround_hours
        return 24  # Default 24 hours

    def get_elapsed_hours(self, obj) -> int:
        """Calculate hours since queue entry was created."""
        from django.utils import timezone

        delta = timezone.now() - obj.created_at
        return round(delta.total_seconds() / 3600, 1)

    def get_actual_tat_hours(self, obj) -> int:
        """Calculate actual TAT for released samples."""
        if obj.released_at:
            delta = obj.released_at - obj.created_at
            return round(delta.total_seconds() / 3600, 1)
        return None

    def get_is_overdue(self, obj) -> bool:
        """Check if sample is overdue based on expected TAT."""
        if obj.queue_status == "RELEASED":
            return False
        expected = self.get_expected_tat_hours(obj)
        elapsed = self.get_elapsed_hours(obj)
        return elapsed > expected


class LabQueueCollectSerializer(serializers.Serializer):
    """Serializer for sample collection action."""

    barcode = serializers.CharField(required=False, allow_blank=True, default="")
    sample_id = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("barcode") and attrs.get("sample_id"):
            attrs["barcode"] = attrs["sample_id"]
        return attrs


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

    def get_full_name(self, obj) -> str:
        return obj.get_full_name() or obj.username


# ============================================================================
# Result Validation Serializers (Phase L2 — Two-Stage Validation)
# ============================================================================


class ResultValidationSerializer(serializers.ModelSerializer):
    """Serializer for result validation records."""

    validated_by_name = serializers.SerializerMethodField()
    validation_type_display = serializers.CharField(
        source="get_validation_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ResultValidation
        fields = [
            "id",
            "result",
            "validation_type",
            "validation_type_display",
            "status",
            "status_display",
            "validated_by",
            "validated_by_name",
            "validated_at",
            "comment",
        ]
        read_only_fields = fields

    def get_validated_by_name(self, obj) -> Optional[str]:
        if obj.validated_by:
            return obj.validated_by.get_full_name() or obj.validated_by.username
        return None


class ResultValidationCreateSerializer(serializers.Serializer):
    """Serializer for creating a validation record."""

    validation_type = serializers.ChoiceField(
        choices=["TECHNICAL", "CLINICAL"],
        help_text="Type of validation: TECHNICAL (lab tech) or CLINICAL (pathologist)",
    )
    status = serializers.ChoiceField(
        choices=["APPROVED", "REJECTED"],
        help_text="Validation decision",
    )
    comment = serializers.CharField(required=False, allow_blank=True, default="")
