"""
Serializers for laboratory models.
"""

from rest_framework import serializers

from .models import (
    AnalyzerRun,
    DiagnosticReport,
    Instrument,
    LabOrder,
    LabOrderItem,
    LabQueue,
    LabResult,
    LabResultAttachment,
    LOINCCode,
    ResultValidation,
    Specimen,
    TestCatalog,
)


class LabResultAttachmentSerializer(serializers.ModelSerializer):
    """Serializer for lab result attachments (read)."""

    uploaded_by_name = serializers.SerializerMethodField()
    filename = serializers.CharField(read_only=True)

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

    def get_uploaded_by_name(self, obj) -> str | None:
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
            "result_type",
            "result_unit",
            "cost",
            "sha_claimable",
            "available_in_house",
            "turnaround_hours",
            "requires_fasting",
            "requires_clinical_signoff",
            "is_active",
        ]


class TestCatalogDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer with normal ranges and panel info."""

    panel_components = TestCatalogSerializer(many=True, read_only=True)

    class Meta:
        model = TestCatalog
        fields = "__all__"


class TestCatalogCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating test catalog entries."""

    class Meta:
        model = TestCatalog
        fields = [
            "code",
            "name",
            "short_name",
            "loinc_code",
            "category",
            "specimen_type",
            "requires_fasting",
            "special_instructions",
            "turnaround_hours",
            "requires_clinical_signoff",
            "available_in_house",
            "external_lab_partner",
            "cost",
            "sha_claimable",
            "result_type",
            "result_unit",
            "normal_range_male",
            "normal_range_female",
            "normal_range_child",
            "result_options",
            "is_panel",
            "is_active",
        ]

    def validate_code(self):
        """Ensure code is unique (case-insensitive)."""
        code = self.initial_data.get("code", "")
        if isinstance(code, str):
            code = code.strip().upper()
        qs = TestCatalog.objects.filter(code__iexact=code)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A test with this code already exists.")
        return code

    def validate_result_options(self, value):
        """Ensure result_options is a list of strings for OPTIONS type."""
        result_type = self.initial_data.get("result_type", "")
        if result_type == "OPTIONS":
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                raise serializers.ValidationError(
                    "result_options must be a list of strings for OPTIONS result type."
                )
        return value


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

    def get_numeric_value(self, obj) -> float | None:
        if obj.numeric_value is not None:
            return float(obj.numeric_value)
        return None

    def get_result_flag(self, obj) -> str | None:
        # Return null instead of empty string for frontend enum compatibility
        return obj.result_flag if obj.result_flag else None

    def get_entered_by_name(self, obj) -> str | None:
        if obj.entered_by:
            return obj.entered_by.get_full_name() or obj.entered_by.username
        return None

    def get_verified_by_name(self, obj) -> str | None:
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
        return None

    def get_validation_summary(self, obj) -> dict | None:
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

    def get_result(self, obj) -> dict | None:
        if not hasattr(obj, "result"):
            return None
        return LabResultNestedSerializer(obj.result).data


class LabOrderSerializer(serializers.ModelSerializer):
    """Order with status and items."""

    items = LabOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
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
            "patient_mrn",
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
            "specimen_collected_at",
            "specimen_collected_by",
            "total_cost",
            "bill_patient",
            "items",
            "ordered_at",
            "completed_at",
            "cancellation_reason",
            "cancelled_by",
            "cancelled_at",
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
    bill_patient = serializers.BooleanField(required=False)

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
            "bill_patient",
            "items",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        # Default bill_patient based on order_type when not explicitly provided
        if "bill_patient" not in validated_data:
            validated_data["bill_patient"] = (
                validated_data.get("order_type", "IN_HOUSE") != "EXTERNAL"
            )
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
    """Result with test info and flags — full fields matching frontend LabResult type."""

    test_name = serializers.CharField(source="order_item.test.name", read_only=True)
    test_code = serializers.CharField(source="order_item.test.code", read_only=True)
    formatted_value = serializers.CharField(source="get_formatted_value", read_only=True)
    numeric_value = serializers.SerializerMethodField()
    result_flag = serializers.SerializerMethodField()
    entered_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    # Two-stage validation summary (Phase L2)
    validation_summary = serializers.SerializerMethodField()
    # Patient demographics for AI lab interpretation
    patient_gender = serializers.CharField(
        source="order_item.lab_order.patient.gender", read_only=True
    )
    patient_date_of_birth = serializers.DateField(
        source="order_item.lab_order.patient.date_of_birth", read_only=True
    )
    encounter_id = serializers.IntegerField(
        source="order_item.lab_order.encounter_id", read_only=True
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
            "patient_gender",
            "patient_date_of_birth",
            "encounter_id",
        ]
        read_only_fields = [
            "entered_by",
            "entered_at",
            "result_flag",
            "entered_by_name",
            "verified_by_name",
            "validation_summary",
            "patient_gender",
            "patient_date_of_birth",
            "encounter_id",
        ]

    def get_numeric_value(self, obj) -> float | None:
        """Return numeric_value as float for frontend compatibility."""
        if obj.numeric_value is not None:
            return float(obj.numeric_value)
        return None

    def get_result_flag(self, obj) -> str | None:
        """Return null instead of empty string for frontend enum compatibility."""
        return obj.result_flag if obj.result_flag else None

    def get_entered_by_name(self, obj) -> str | None:
        if obj.entered_by:
            return obj.entered_by.get_full_name() or obj.entered_by.username
        return None

    def get_verified_by_name(self, obj) -> str | None:
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
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

        # Cascade status: item → IN_PROGRESS, order → IN_PROGRESS
        result.order_item.update_status_from_result()

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


class LabQueueSpecimenSerializer(serializers.ModelSerializer):
    """Lightweight specimen serializer for LabQueue nesting."""

    collected_by_name = serializers.SerializerMethodField()
    order_items = serializers.SerializerMethodField()

    class Meta:
        model = Specimen
        fields = [
            "id",
            "barcode",
            "specimen_type",
            "container_type",
            "lab_order",
            "order_items",
            "collected_by",
            "collected_by_name",
            "collected_at",
            "collection_site",
            "received_by",
            "received_at",
            "status",
            "rejection_reason",
            "storage_location",
            "storage_temperature",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_collected_by_name(self, obj) -> str | None:
        if obj.collected_by:
            return obj.collected_by.get_full_name() or obj.collected_by.username
        return None

    def get_order_items(self, obj) -> list[int]:
        return list(obj.order_items.values_list("id", flat=True))


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

    specimen = LabQueueSpecimenSerializer(read_only=True)
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
            "specimen",
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
            "specimen",
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

    def get_collected_by_name(self, obj) -> str | None:
        collected_by = obj.specimen.collected_by if obj.specimen else obj.collected_by
        if collected_by:
            return collected_by.get_full_name() or collected_by.username
        return None

    def get_sample_type(self, obj) -> str | None:
        if obj.specimen:
            return obj.specimen.specimen_type
        return obj.sample_type or "BLOOD"

    def get_sample_id(self, obj) -> str | None:
        if obj.specimen:
            return obj.specimen.barcode
        return obj.sample_id or None

    def get_collected_by(self, obj) -> int | None:
        if obj.specimen and obj.specimen.collected_by:
            return obj.specimen.collected_by_id
        return obj.collected_by_id

    def get_collected_at(self, obj) -> str | None:
        collected_at = obj.specimen.collected_at if obj.specimen else obj.collected_at
        return collected_at

    def get_reviewed_by_name(self, obj) -> str | None:
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None

    def get_expected_tat_hours(self, obj) -> int | None:
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

    def get_validated_by_name(self, obj) -> str | None:
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


# ============================================================================
# Phase L3 — Analyzer Integration Support
# ============================================================================


class InstrumentSerializer(serializers.ModelSerializer):
    """Serializer for laboratory instruments."""

    interface_type_display = serializers.CharField(
        source="get_interface_type_display", read_only=True
    )

    class Meta:
        model = Instrument
        fields = [
            "id",
            "code",
            "name",
            "manufacturer",
            "model",
            "serial_number",
            "department",
            "is_active",
            "interface_type",
            "interface_type_display",
            "integration_config",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "interface_type_display"]


class InstrumentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating instruments."""

    class Meta:
        model = Instrument
        fields = [
            "code",
            "name",
            "manufacturer",
            "model",
            "serial_number",
            "department",
            "is_active",
            "interface_type",
            "integration_config",
        ]

    def validate_code(self, value: str) -> str:
        """Ensure code is uppercase."""
        return value.upper()


class AnalyzerRunSerializer(serializers.ModelSerializer):
    """Serializer for analyzer runs."""

    specimen_barcode = serializers.CharField(source="specimen.barcode", read_only=True)
    instrument_code = serializers.CharField(source="instrument.code", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True)
    operator_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = AnalyzerRun
        fields = [
            "id",
            "specimen",
            "specimen_barcode",
            "instrument",
            "instrument_code",
            "instrument_name",
            "operator",
            "operator_name",
            "run_datetime",
            "raw_message",
            "raw_payload",
            "status",
            "status_display",
            "error_message",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "specimen_barcode",
            "instrument_code",
            "instrument_name",
            "operator_name",
            "status_display",
            "created_at",
        ]

    def get_operator_name(self, obj) -> str | None:
        if obj.operator:
            return obj.operator.get_full_name() or obj.operator.username
        return None


class AnalyzerRunCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating analyzer runs."""

    class Meta:
        model = AnalyzerRun
        fields = [
            "specimen",
            "instrument",
            "operator",
            "run_datetime",
            "raw_message",
            "raw_payload",
            "status",
        ]

    def validate(self, attrs):
        """Validate that specimen belongs to an active lab order."""
        specimen = attrs.get("specimen")
        if specimen and specimen.status == "DISPOSED":
            raise serializers.ValidationError(
                {"specimen": "Cannot add analyzer run to disposed specimen."}
            )
        return attrs


class AnalyzerRunMarkErrorSerializer(serializers.Serializer):
    """Serializer for marking an analyzer run as error."""

    error_message = serializers.CharField(required=True, help_text="Error details")


# ============================================================================
# Phase L4 — Diagnostic Report Serializers
# ============================================================================


class DiagnosticReportSerializer(serializers.ModelSerializer):
    """Serializer for reading diagnostic reports."""

    lab_order_number = serializers.CharField(source="lab_order.order_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()
    amended_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_finalized = serializers.BooleanField(read_only=True)
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = DiagnosticReport
        fields = [
            "id",
            "report_number",
            "lab_order",
            "lab_order_number",
            "patient_name",
            "status",
            "status_display",
            "is_finalized",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "conclusion",
            "clinical_info",
            "amended_by",
            "amended_by_name",
            "amended_at",
            "cancellation_reason",
            "pdf_file",
            "pdf_url",
            "fhir_resource_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "report_number",
            "lab_order_number",
            "patient_name",
            "status_display",
            "is_finalized",
            "issued_by_name",
            "amended_by_name",
            "pdf_url",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name from lab order."""
        return str(obj.lab_order.patient)

    def get_issued_by_name(self, obj) -> str:
        """Get name of user who issued the report."""
        if obj.issued_by:
            return obj.issued_by.get_full_name() or obj.issued_by.username
        return ""

    def get_amended_by_name(self, obj) -> str | None:
        """Get name of user who amended the report."""
        if obj.amended_by:
            return obj.amended_by.get_full_name() or obj.amended_by.username
        return None

    def get_pdf_url(self, obj) -> str | None:
        """Get URL for the PDF file if it exists."""
        if obj.pdf_file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.pdf_file.url)
            return obj.pdf_file.url
        return None


class DiagnosticReportCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diagnostic reports."""

    class Meta:
        model = DiagnosticReport
        fields = [
            "lab_order",
            "conclusion",
            "clinical_info",
            "fhir_resource_id",
        ]

    def create(self, validated_data):
        """Create report with issued_by set to current user."""
        validated_data["issued_by"] = self.context["request"].user
        return super().create(validated_data)


class DiagnosticReportUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating diagnostic reports (draft only)."""

    class Meta:
        model = DiagnosticReport
        fields = [
            "conclusion",
            "clinical_info",
            "fhir_resource_id",
            "status",
        ]

    def validate_status(self, value):
        """Prevent direct status changes on finalized reports."""
        instance = self.instance
        if instance and instance.is_finalized:
            if value != instance.status:
                raise serializers.ValidationError(
                    "Cannot change status of finalized report. Use amend or cancel actions."
                )
        return value


class DiagnosticReportAmendSerializer(serializers.Serializer):
    """Serializer for amending a diagnostic report."""

    conclusion = serializers.CharField(required=True, help_text="Updated conclusion text")


class DiagnosticReportCancelSerializer(serializers.Serializer):
    """Serializer for cancelling a diagnostic report."""

    reason = serializers.CharField(required=True, help_text="Reason for cancellation")


# ============================================================================
# Specimen Serializers
# ============================================================================


class SpecimenSerializer(serializers.ModelSerializer):
    """Serializer for specimen listing and detail."""

    order_number = serializers.CharField(source="lab_order.order_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="lab_order.patient.mrn", read_only=True)
    collected_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    specimen_type_display = serializers.CharField(
        source="get_specimen_type_display", read_only=True
    )
    order_item_ids = serializers.SerializerMethodField()

    class Meta:
        model = Specimen
        fields = [
            "id",
            "barcode",
            "specimen_type",
            "specimen_type_display",
            "container_type",
            "lab_order",
            "order_number",
            "patient_name",
            "patient_mrn",
            "order_item_ids",
            "collected_by",
            "collected_by_name",
            "collected_at",
            "collection_site",
            "received_by",
            "received_by_name",
            "received_at",
            "status",
            "status_display",
            "rejection_reason",
            "storage_location",
            "storage_temperature",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "barcode",
            "order_number",
            "patient_name",
            "patient_mrn",
            "status_display",
            "specimen_type_display",
            "collected_by_name",
            "received_by_name",
            "order_item_ids",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.lab_order.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_collected_by_name(self, obj) -> str | None:
        """Get name of user who collected the specimen."""
        if obj.collected_by:
            return obj.collected_by.get_full_name() or obj.collected_by.username
        return None

    def get_received_by_name(self, obj) -> str | None:
        """Get name of user who received the specimen."""
        if obj.received_by:
            return obj.received_by.get_full_name() or obj.received_by.username
        return None

    def get_order_item_ids(self, obj) -> list[int]:
        """Get list of linked order item IDs."""
        return list(obj.order_items.values_list("id", flat=True))
