"""
Serializers for imaging models.
"""

import logging

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


class ImagingProcedureCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating/updating imaging procedures."""

    class Meta:
        model = ImagingProcedure
        fields = [
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
    report_summary = serializers.SerializerMethodField()
    contrast_egfr_warnings = serializers.SerializerMethodField()

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
            "is_walkin",
            "walkin_patient_name",
            "bill_patient",
            "scheduled_datetime",
            "scheduled_room",
            "accession_number",
            "study_instance_uid",
            "total_cost",
            "is_paid",
            "items",
            "ordered_at",
            "completed_at",
            "report_summary",
            "contrast_egfr_warnings",
        ]
        read_only_fields = ["order_number", "ordered_at", "ordered_by"]

    def get_patient_name(self, obj) -> str:
        if obj.patient_id:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return obj.walkin_patient_name or ""

    def get_ordered_by_name(self, obj) -> str:
        return obj.ordered_by.get_full_name() or obj.ordered_by.username

    def get_report_summary(self, obj) -> dict | None:
        """Return report findings/impression if a report exists."""
        try:
            report = obj.report
        except self.Meta.model.report.RelatedObjectDoesNotExist:
            return None
        if report is None:
            return None
        return {
            "findings": report.findings or "",
            "impression": report.impression or "",
        }

    def get_contrast_egfr_warnings(self, obj) -> list[dict]:
        """Return contrast/eGFR warnings attached during creation."""
        return getattr(obj, "_contrast_egfr_warnings", [])


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

        facility = order.encounter.facility

        # Check eGFR for contrast procedures
        contrast_warnings = self._check_contrast_egfr(order.patient, items_data)

        for item_data in items_data:
            procedure_code = item_data["procedure_code"]
            try:
                procedure = ImagingProcedure.objects.get(code=procedure_code, facility=facility)
            except ImagingProcedure.DoesNotExist as e:
                # Rollback by deleting the order
                order.delete()
                raise serializers.ValidationError(
                    {"items": f"Procedure with code '{procedure_code}' not found in catalog."}
                ) from e
            except ImagingProcedure.MultipleObjectsReturned:
                # Fallback: pick the active one
                procedure = ImagingProcedure.objects.filter(
                    code=procedure_code, facility=facility, is_active=True
                ).first()
                if procedure is None:
                    order.delete()
                    raise serializers.ValidationError(
                        {"items": f"Procedure with code '{procedure_code}' not found in catalog."}
                    ) from None

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

        # Attach contrast warnings to the order instance for serialization
        if contrast_warnings:
            order._contrast_egfr_warnings = contrast_warnings

        return order

    def _check_contrast_egfr(self, patient, items_data) -> list[dict]:
        """Check if any contrast procedures pose renal risk given patient's eGFR."""
        warnings = []
        try:
            from hmis.apps.ai.models import AIEGFRResult

            latest_egfr = (
                AIEGFRResult.objects.filter(patient=patient)
                .order_by("-created_at")
                .values("ckd_stage", "egfr_ckd_epi")
                .first()
            )
            if not latest_egfr or not latest_egfr["egfr_ckd_epi"]:
                return []

            egfr = latest_egfr["egfr_ckd_epi"]
            ckd_stage = latest_egfr["ckd_stage"]

            # Check each procedure code (resolve later, just flag contrast)
            facility = self.context["request"].user.staff_profile.primary_facility
            for item_data in items_data:
                procedure_code = item_data["procedure_code"]
                try:
                    procedure = ImagingProcedure.objects.get(code=procedure_code, facility=facility)
                except ImagingProcedure.DoesNotExist:
                    continue
                if not getattr(procedure, "requires_contrast", False):
                    continue

                if egfr < 30:
                    warnings.append(
                        {
                            "level": "critical",
                            "procedure": procedure.name,
                            "message": (
                                f"HIGH RISK: eGFR {egfr:.0f} mL/min (CKD {ckd_stage}) — "
                                f"contrast-induced nephropathy risk is very high. "
                                f"Consider alternative non-contrast imaging."
                            ),
                        }
                    )
                elif egfr < 45:
                    warnings.append(
                        {
                            "level": "warning",
                            "procedure": procedure.name,
                            "message": (
                                f"CAUTION: eGFR {egfr:.0f} mL/min (CKD {ckd_stage}) — "
                                f"moderate CIN risk. Pre/post hydration protocol recommended. "
                                f"Hold metformin 48h post-contrast."
                            ),
                        }
                    )
        except Exception:
            logging.getLogger(__name__).debug("eGFR check failed for contrast guard", exc_info=True)
        return warnings


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
    equipment_name = serializers.SerializerMethodField()

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
            "station_name",
            "manufacturer",
            "manufacturer_model_name",
            "device_serial_number",
            "source",
            "calling_ae_title",
            "equipment",
            "equipment_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_uploaded_by_name(self, obj) -> str:
        if not obj.uploaded_by:
            return obj.calling_ae_title or "C-STORE"
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username

    def get_equipment_name(self, obj) -> str | None:
        return obj.equipment.name if obj.equipment_id else None


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


# ============================================================================
# Equipment Serializers (Phase E)
# ============================================================================


class ImagingEquipmentSerializer(serializers.ModelSerializer):
    """Serializer for ImagingEquipment list/detail."""

    modality_display = serializers.CharField(source="get_modality_display", read_only=True)
    is_calibration_overdue = serializers.BooleanField(read_only=True)
    studies_count = serializers.SerializerMethodField()

    class Meta:
        from hmis.apps.imaging.models import ImagingEquipment as _Equip

        model = _Equip
        fields = [
            "id",
            "name",
            "modality",
            "modality_display",
            "ae_title",
            "station_name",
            "manufacturer",
            "model_name",
            "serial_number",
            "software_versions",
            "room",
            "scheduling_resource",
            "is_active",
            "installed_date",
            "last_calibration_date",
            "next_calibration_due",
            "is_calibration_overdue",
            "notes",
            "auto_registered",
            "studies_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "auto_registered",
            "is_calibration_overdue",
            "studies_count",
            "created_at",
            "updated_at",
        ]

    def get_studies_count(self, obj) -> int:
        return obj.studies.count()
