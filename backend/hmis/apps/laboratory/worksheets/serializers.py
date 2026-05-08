"""Serializers for Worksheets & Label Generation."""

from rest_framework import serializers

from .models import (
    LabelPrintJob,
    LabelPrintJobItem,
    LabelTemplate,
    Worksheet,
    WorksheetItem,
    WorksheetTemplate,
)

# =============================================================================
# Worksheet Template
# =============================================================================


class WorksheetTemplateListSerializer(serializers.ModelSerializer):
    instrument_name = serializers.CharField(source="instrument.name", read_only=True, default="")

    class Meta:
        model = WorksheetTemplate
        fields = [
            "id",
            "name",
            "description",
            "group_by",
            "section_filter",
            "instrument",
            "instrument_name",
            "include_qc_slots",
            "max_specimens_per_page",
            "default_export_format",
            "columns",
            "is_active",
            "created_at",
            "updated_at",
        ]


class WorksheetTemplateCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorksheetTemplate
        fields = [
            "name",
            "description",
            "group_by",
            "section_filter",
            "instrument",
            "include_qc_slots",
            "max_specimens_per_page",
            "default_export_format",
            "columns",
        ]


class WorksheetTemplateDetailSerializer(serializers.ModelSerializer):
    instrument_name = serializers.CharField(source="instrument.name", read_only=True, default="")

    class Meta:
        model = WorksheetTemplate
        fields = [
            "id",
            "name",
            "description",
            "group_by",
            "section_filter",
            "instrument",
            "instrument_name",
            "include_qc_slots",
            "max_specimens_per_page",
            "default_export_format",
            "columns",
            "is_active",
            "created_at",
            "updated_at",
        ]


# =============================================================================
# Worksheet
# =============================================================================


class WorksheetItemSerializer(serializers.ModelSerializer):
    specimen_barcode = serializers.CharField(source="specimen.barcode", read_only=True, default="")
    patient_name = serializers.SerializerMethodField()
    test_name = serializers.CharField(source="order_item.test.name", read_only=True, default="")

    class Meta:
        model = WorksheetItem
        fields = [
            "id",
            "order_item",
            "specimen",
            "specimen_barcode",
            "patient_name",
            "test_name",
            "position",
            "is_qc_slot",
        ]

    def get_patient_name(self, obj):
        try:
            patient = obj.order_item.lab_order.patient
            return f"{patient.first_name} {patient.last_name}"
        except Exception:
            return ""


class WorksheetListSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True, default="")
    generated_by_name = serializers.CharField(
        source="generated_by.get_full_name", read_only=True, default=""
    )

    class Meta:
        model = Worksheet
        fields = [
            "id",
            "worksheet_number",
            "title",
            "status",
            "template",
            "template_name",
            "specimen_count",
            "export_format",
            "generated_by",
            "generated_by_name",
            "generated_at",
            "printed_at",
            "created_at",
        ]


class WorksheetDetailSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True, default="")
    generated_by_name = serializers.CharField(
        source="generated_by.get_full_name", read_only=True, default=""
    )
    items = WorksheetItemSerializer(many=True, read_only=True)

    class Meta:
        model = Worksheet
        fields = [
            "id",
            "worksheet_number",
            "title",
            "status",
            "template",
            "template_name",
            "specimen_count",
            "export_format",
            "notes",
            "generated_by",
            "generated_by_name",
            "generated_at",
            "printed_at",
            "items",
            "created_at",
            "updated_at",
        ]


class WorksheetGenerateSerializer(serializers.Serializer):
    """Input serializer for worksheet generation."""

    template_id = serializers.IntegerField(required=False, help_text="Template to use")
    title = serializers.CharField(max_length=200, required=False)
    section_filter = serializers.CharField(max_length=30, required=False)
    instrument_id = serializers.IntegerField(required=False)
    priority_filter = serializers.ChoiceField(choices=["ROUTINE", "URGENT", "STAT"], required=False)
    export_format = serializers.ChoiceField(choices=["PDF", "CSV", "ZPL"], default="PDF")
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


# =============================================================================
# Label Template
# =============================================================================


class LabelTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabelTemplate
        fields = [
            "id",
            "name",
            "label_type",
            "label_format",
            "width_mm",
            "height_mm",
            "zpl_template",
            "include_fields",
            "barcode_format",
            "is_default",
            "is_active",
            "created_at",
            "updated_at",
        ]


class LabelTemplateCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabelTemplate
        fields = [
            "name",
            "label_type",
            "label_format",
            "width_mm",
            "height_mm",
            "zpl_template",
            "include_fields",
            "barcode_format",
            "is_default",
        ]


# =============================================================================
# Label Print Job
# =============================================================================


class LabelPrintJobItemSerializer(serializers.ModelSerializer):
    specimen_barcode = serializers.CharField(source="specimen.barcode", read_only=True, default="")

    class Meta:
        model = LabelPrintJobItem
        fields = ["id", "specimen", "specimen_barcode", "order_item", "copies", "label_data"]


class LabelPrintJobListSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True, default="")

    class Meta:
        model = LabelPrintJob
        fields = [
            "id",
            "template",
            "template_name",
            "status",
            "label_count",
            "generated_by",
            "generated_at",
            "printed_at",
            "created_at",
        ]


class LabelPrintJobDetailSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True, default="")
    items = LabelPrintJobItemSerializer(many=True, read_only=True)

    class Meta:
        model = LabelPrintJob
        fields = [
            "id",
            "template",
            "template_name",
            "status",
            "label_count",
            "output_data",
            "error_message",
            "generated_by",
            "generated_at",
            "printed_at",
            "items",
            "created_at",
            "updated_at",
        ]


class LabelGenerateSerializer(serializers.Serializer):
    """Input serializer for batch label generation."""

    template_id = serializers.IntegerField()
    specimen_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of specimen IDs to generate labels for",
    )
    copies = serializers.IntegerField(default=1, min_value=1, max_value=10)
