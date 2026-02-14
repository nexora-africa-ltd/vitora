"""
Serializers for imaging models.
"""

from rest_framework import serializers

from .models import (
    DICOMInstance,
    DICOMSeries,
    DICOMStudy,
    ImagingOrder,
    ImagingOrderItem,
    ImagingProcedure,
    RadiologyReport,
    ReportAmendment,
)


class ImagingProcedureSerializer(serializers.ModelSerializer):
    """Serializer for imaging procedure catalog listing."""

    class Meta:
        model = ImagingProcedure
        fields = [
            "id",
            "code",
            "name",
            "modality",
            "body_region",
            "cost",
            "sha_claimable",
            "available_in_house",
            "is_active",
        ]


class ImagingProcedureDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer with all procedure fields."""

    class Meta:
        model = ImagingProcedure
        fields = [
            "id",
            "code",
            "name",
            "modality",
            "body_region",
            "radlex_code",
            "loinc_code",
            "requires_contrast",
            "requires_sedation",
            "special_preparation",
            "turnaround_hours",
            "cost",
            "sha_claimable",
            "sha_intervention_code",
            "is_active",
            "available_in_house",
            "created_at",
            "updated_at",
        ]


class ImagingOrderItemSerializer(serializers.ModelSerializer):
    """Order item with procedure details."""

    procedure_name = serializers.CharField(source="procedure.name", read_only=True)
    procedure_code = serializers.CharField(source="procedure.code", read_only=True)
    modality = serializers.CharField(source="procedure.modality", read_only=True)

    class Meta:
        model = ImagingOrderItem
        fields = [
            "id",
            "procedure",
            "procedure_name",
            "procedure_code",
            "modality",
            "laterality",
            "specific_instructions",
            "is_completed",
            "completed_at",
            "unit_cost",
        ]


class ImagingOrderSerializer(serializers.ModelSerializer):
    """Order with status and items."""

    items = ImagingOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ImagingOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "encounter",
            "admission",
            "ordered_by",
            "ordered_by_name",
            "priority",
            "clinical_indication",
            "relevant_clinical_history",
            "status",
            "scheduled_datetime",
            "scheduled_room",
            "accession_number",
            "study_instance_uid",
            "total_cost",
            "is_paid",
            "items",
            "ordered_at",
            "completed_at",
        ]
        read_only_fields = ["order_number", "ordered_at", "ordered_by"]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj) -> str:
        return obj.ordered_by.get_full_name() or obj.ordered_by.username


class ImagingOrderItemCreateSerializer(serializers.Serializer):
    """Serializer for creating order items."""

    procedure_code = serializers.CharField()
    laterality = serializers.ChoiceField(choices=ImagingOrderItem.LATERALITY_CHOICES, default="NA")
    specific_instructions = serializers.CharField(required=False, allow_blank=True)


class ImagingOrderCreateSerializer(serializers.ModelSerializer):
    """Create order with items."""

    items = ImagingOrderItemCreateSerializer(many=True, write_only=True)

    class Meta:
        model = ImagingOrder
        fields = [
            "patient",
            "encounter",
            "admission",
            "priority",
            "clinical_indication",
            "relevant_clinical_history",
            "items",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        ordered_by = self.context["request"].user
        order = ImagingOrder.objects.create(ordered_by=ordered_by, **validated_data)

        for item_data in items_data:
            procedure_code = item_data["procedure_code"]
            try:
                procedure = ImagingProcedure.objects.get(code=procedure_code)
            except ImagingProcedure.DoesNotExist as e:
                # Rollback by deleting the order
                order.delete()
                raise serializers.ValidationError(
                    {"items": f"Procedure with code '{procedure_code}' not found in catalog."}
                ) from e

            laterality = item_data.get("laterality", "NA")
            specific_instructions = item_data.get("specific_instructions", "")
            ImagingOrderItem.objects.create(
                order=order,
                procedure=procedure,
                laterality=laterality,
                specific_instructions=specific_instructions,
                unit_cost=procedure.cost,
            )

        order.calculate_total_cost()
        return order


class ScheduleOrderSerializer(serializers.Serializer):
    """Serializer for scheduling an imaging order."""

    scheduled_datetime = serializers.DateTimeField()
    scheduled_room = serializers.CharField(required=False, allow_blank=True)
    resource_id = serializers.IntegerField(required=False, help_text="Scheduling resource ID")


class ScheduleOrderWithResourceSerializer(serializers.Serializer):
    """Serializer for scheduling with resource integration."""

    resource_id = serializers.IntegerField(help_text="Scheduling resource ID")
    scheduled_datetime = serializers.DateTimeField()


class CancelOrderSerializer(serializers.Serializer):
    """Serializer for cancelling an imaging order."""

    reason = serializers.CharField(required=False, allow_blank=True, default="No reason provided")


class ImagingResourceSerializer(serializers.Serializer):
    """Serializer for imaging resources."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField()
    resource_type = serializers.CharField()
    is_active = serializers.BooleanField()
    metadata = serializers.JSONField()


class ImagingSlotSerializer(serializers.Serializer):
    """Serializer for imaging time slots."""

    date = serializers.CharField()
    start_time = serializers.CharField()
    end_time = serializers.CharField()
    is_available = serializers.BooleanField()
    appointment = serializers.DictField(allow_null=True)


class ImagingResourceAvailabilitySerializer(serializers.Serializer):
    """Serializer for resource availability response."""

    resource = ImagingResourceSerializer()
    slots = ImagingSlotSerializer(many=True)
    total_slots = serializers.IntegerField()
    available_slots = serializers.IntegerField()


class ImagingCalendarSerializer(serializers.Serializer):
    """Serializer for department calendar response."""

    resources = ImagingResourceAvailabilitySerializer(many=True)


class AppointmentSummarySerializer(serializers.Serializer):
    """Summary serializer for linked appointment."""

    id = serializers.IntegerField()
    appointment_number = serializers.CharField()
    status = serializers.CharField()
    scheduled_start = serializers.DateTimeField()
    scheduled_end = serializers.DateTimeField()
    resource = ImagingResourceSerializer()


# ============================================================================
# DICOM Serializers (Phase C)
# ============================================================================


class DICOMInstanceSerializer(serializers.ModelSerializer):
    """Serializer for a single DICOM instance."""

    class Meta:
        model = DICOMInstance
        fields = [
            "id",
            "sop_instance_uid",
            "sop_class_uid",
            "instance_number",
            "file_path",
            "file_size",
            "transfer_syntax_uid",
            "rows",
            "columns",
            "bits_allocated",
            "photometric_interpretation",
            "thumbnail_path",
            "created_at",
        ]
        read_only_fields = fields


class DICOMSeriesSerializer(serializers.ModelSerializer):
    """Serializer for a DICOM series with nested instances."""

    instances = DICOMInstanceSerializer(many=True, read_only=True)

    class Meta:
        model = DICOMSeries
        fields = [
            "id",
            "series_instance_uid",
            "series_number",
            "series_description",
            "modality",
            "body_part_examined",
            "number_of_instances",
            "total_file_size",
            "thumbnail_path",
            "instances",
            "created_at",
        ]
        read_only_fields = fields


class DICOMSeriesListSerializer(serializers.ModelSerializer):
    """Compact series serializer without instances (for listing)."""

    class Meta:
        model = DICOMSeries
        fields = [
            "id",
            "series_instance_uid",
            "series_number",
            "series_description",
            "modality",
            "body_part_examined",
            "number_of_instances",
            "total_file_size",
            "thumbnail_path",
            "created_at",
        ]
        read_only_fields = fields


class DICOMStudySerializer(serializers.ModelSerializer):
    """Serializer for a DICOM study (list view)."""

    patient_name = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DICOMStudy
        fields = [
            "id",
            "study_instance_uid",
            "patient",
            "patient_name",
            "imaging_order",
            "study_date",
            "study_time",
            "study_description",
            "accession_number",
            "referring_physician_name",
            "modality",
            "institution_name",
            "number_of_series",
            "number_of_instances",
            "total_file_size",
            "thumbnail_path",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_uploaded_by_name(self, obj) -> str:
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username


class DICOMStudyDetailSerializer(DICOMStudySerializer):
    """Detailed study serializer with nested series."""

    series = DICOMSeriesListSerializer(many=True, read_only=True, source="series_set")

    class Meta(DICOMStudySerializer.Meta):
        fields = DICOMStudySerializer.Meta.fields + ["series"]


# ============================================================================
# Radiology Report Serializers (Phase D)
# ============================================================================


class ReportAmendmentSerializer(serializers.ModelSerializer):
    """Serializer for report amendment history."""

    amended_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ReportAmendment
        fields = [
            "id",
            "amendment_number",
            "reason",
            "previous_findings",
            "previous_impression",
            "new_findings",
            "new_impression",
            "amended_by",
            "amended_by_name",
            "amended_at",
        ]
        read_only_fields = fields

    def get_amended_by_name(self, obj) -> str:
        return obj.amended_by.get_full_name() or obj.amended_by.username


class RadiologyReportSerializer(serializers.ModelSerializer):
    """Full serializer for radiology reports."""

    reported_by_name = serializers.SerializerMethodField()
    last_amended_by_name = serializers.SerializerMethodField()
    critical_communicated_by_name = serializers.SerializerMethodField()
    order_number = serializers.CharField(source="imaging_order.order_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    modality = serializers.SerializerMethodField()
    study_description = serializers.SerializerMethodField()
    amendments = ReportAmendmentSerializer(many=True, read_only=True)
    can_edit = serializers.BooleanField(read_only=True)
    can_sign = serializers.BooleanField(read_only=True)
    can_amend = serializers.BooleanField(read_only=True)

    class Meta:
        model = RadiologyReport
        fields = [
            "id",
            "report_number",
            "imaging_order",
            "order_number",
            "study",
            "patient_name",
            "patient_mrn",
            "modality",
            "study_description",
            # Content
            "technique",
            "comparison",
            "findings",
            "impression",
            "recommendations",
            # Critical findings
            "is_critical",
            "critical_finding_description",
            "critical_communicated",
            "critical_communicated_to",
            "critical_communicated_method",
            "critical_communicated_at",
            "critical_communicated_by",
            "critical_communicated_by_name",
            # Status
            "status",
            "reported_by",
            "reported_by_name",
            "signed_at",
            # Amendments
            "amendment_count",
            "last_amendment_reason",
            "last_amended_at",
            "last_amended_by",
            "last_amended_by_name",
            "amendments",
            # Computed
            "can_edit",
            "can_sign",
            "can_amend",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "report_number",
            "reported_by",
            "signed_at",
            "amendment_count",
            "last_amendment_reason",
            "last_amended_at",
            "last_amended_by",
            "critical_communicated",
            "critical_communicated_at",
            "critical_communicated_by",
            "created_at",
            "updated_at",
        ]

    def get_reported_by_name(self, obj) -> str:
        return obj.reported_by.get_full_name() or obj.reported_by.username

    def get_last_amended_by_name(self, obj) -> str:
        if obj.last_amended_by:
            return obj.last_amended_by.get_full_name() or obj.last_amended_by.username
        return ""

    def get_critical_communicated_by_name(self, obj) -> str:
        if obj.critical_communicated_by:
            return (
                obj.critical_communicated_by.get_full_name()
                or obj.critical_communicated_by.username
            )
        return ""

    def get_patient_name(self, obj) -> str:
        patient = obj.imaging_order.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_patient_mrn(self, obj) -> str:
        return obj.imaging_order.patient.mrn

    def get_modality(self, obj) -> str:
        # Get primary modality from order items
        items = obj.imaging_order.items.all()
        if items.exists():
            return items.first().procedure.modality
        return ""

    def get_study_description(self, obj) -> str:
        if obj.study:
            return obj.study.study_description
        # Fall back to first procedure name
        items = obj.imaging_order.items.all()
        if items.exists():
            return items.first().procedure.name
        return ""


class RadiologyReportCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new radiology report draft."""

    class Meta:
        model = RadiologyReport
        fields = [
            "imaging_order",
            "study",
            "technique",
            "comparison",
            "findings",
            "impression",
            "recommendations",
            "is_critical",
            "critical_finding_description",
        ]

    def validate_imaging_order(self, value):
        """Ensure order is COMPLETED and doesn't already have a report."""
        if value.status not in ("COMPLETED", "REPORTED"):
            raise serializers.ValidationError(
                "Cannot create report for an order that is not completed."
            )
        # Check if report already exists
        if RadiologyReport.objects.filter(imaging_order=value).exists():
            raise serializers.ValidationError("A report already exists for this imaging order.")
        return value

    def create(self, validated_data):
        reported_by = self.context["request"].user
        return RadiologyReport.objects.create(reported_by=reported_by, **validated_data)


class RadiologyReportUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating a draft report."""

    class Meta:
        model = RadiologyReport
        fields = [
            "technique",
            "comparison",
            "findings",
            "impression",
            "recommendations",
            "is_critical",
            "critical_finding_description",
        ]

    def validate(self, attrs):
        if not self.instance.can_edit():
            raise serializers.ValidationError(
                "Cannot edit a signed/finalized report. Use amendment instead."
            )
        return attrs


class SignReportSerializer(serializers.Serializer):
    """Serializer for signing/finalizing a report."""

    pass  # No additional fields required, user comes from request


class AmendReportSerializer(serializers.Serializer):
    """Serializer for amending a finalized report."""

    reason = serializers.CharField(required=True, help_text="Reason for the amendment")
    findings = serializers.CharField(required=False, allow_blank=True)
    impression = serializers.CharField(required=False, allow_blank=True)


class CommunicateCriticalSerializer(serializers.Serializer):
    """Serializer for recording critical finding communication."""

    communicated_to = serializers.CharField(
        required=True, help_text="Name/identifier of person notified"
    )
    method = serializers.ChoiceField(
        choices=[
            ("phone", "Phone"),
            ("in_person", "In Person"),
            ("secure_message", "Secure Message"),
            ("pager", "Pager"),
            ("other", "Other"),
        ],
        default="phone",
    )
