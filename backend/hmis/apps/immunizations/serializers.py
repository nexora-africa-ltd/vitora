"""Serializers for the immunizations app."""

from datetime import date as date_module

from rest_framework import serializers

from hmis.apps.immunizations.models import (
    AEFI,
    AdministrationSite,
    AEFIEventType,
    AEFIReportType,
    ColdChainEquipment,
    ImmunizationRecord,
    StockTransaction,
    TemperatureLog,
    VaccineCampaign,
    VaccineDefinition,
    VaccineIncident,
    VaccineStock,
)

# =============================================================================
# VaccineDefinition Serializers
# =============================================================================


class VaccineDefinitionSerializer(serializers.ModelSerializer):
    """Full serializer for vaccine definition reference data."""

    billing_service_name = serializers.CharField(
        source="billing_service.name", read_only=True, default=None
    )
    billing_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = VaccineDefinition
        fields = [
            "id",
            "code",
            "name",
            "description",
            "disease_target",
            "standard_age_days",
            "route",
            "dose_number",
            "total_doses",
            "series_name",
            "interval_days",
            "target_population",
            "program",
            "min_age_days",
            "max_age_days",
            "is_active",
            "billing_service",
            "billing_service_name",
            "billing_price",
            "base_fee",
            "sha_tariff_code",
        ]


# =============================================================================
# ImmunizationRecord Serializers
# =============================================================================


class ImmunizationRecordSerializer(serializers.ModelSerializer):
    """Full serializer for immunization record."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    vaccine_program = serializers.CharField(source="vaccine.program", read_only=True)
    administered_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)

    class Meta:
        model = ImmunizationRecord
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "vaccine_program",
            "scheduled_date",
            "administered_date",
            "status",
            "dose_number",
            "batch_number",
            "lot_number",
            "expiry_date",
            "site",
            "vaccine_manufacturer",
            "diluent_batch_number",
            "diluent_manufacturer",
            "diluent_expiry_date",
            "vaccination_service_type",
            "administered_by",
            "administered_by_name",
            "next_dose_date",
            "encounter",
            "campaign",
            "is_overdue",
            "days_overdue",
            "notes",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_administered_by_name(self, obj):
        if obj.administered_by:
            name = f"{obj.administered_by.first_name} {obj.administered_by.last_name}".strip()
            return name or obj.administered_by.username
        return None


class ImmunizationRecordListSerializer(serializers.ModelSerializer):
    """Lean serializer for immunization record list."""

    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    vaccine_program = serializers.CharField(source="vaccine.program", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ImmunizationRecord
        fields = [
            "id",
            "patient",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "vaccine_program",
            "scheduled_date",
            "administered_date",
            "status",
            "dose_number",
            "is_overdue",
            "created_at",
        ]


class AdministerVaccineSerializer(serializers.Serializer):
    """Action serializer for administering a vaccine."""

    administered_date = serializers.DateField(default=date_module.today)
    batch_number = serializers.CharField(required=False, default="")
    lot_number = serializers.CharField(required=False, default="")
    expiry_date = serializers.DateField(required=False, allow_null=True)
    site = serializers.ChoiceField(
        choices=AdministrationSite.choices,
        required=False,
        default="",
    )
    notes = serializers.CharField(required=False, default="")


class GenerateAdultScheduleSerializer(serializers.Serializer):
    """Action serializer for generating an adult vaccine schedule."""

    patient = serializers.IntegerField()
    vaccine = serializers.IntegerField()
    start_date = serializers.DateField(default=date_module.today)


# =============================================================================
# VaccineCampaign Serializers
# =============================================================================


class VaccineCampaignSerializer(serializers.ModelSerializer):
    """Full serializer for vaccine campaign."""

    is_running = serializers.BooleanField(read_only=True)
    vaccine_names = serializers.SerializerMethodField()

    class Meta:
        model = VaccineCampaign
        fields = [
            "id",
            "name",
            "description",
            "start_date",
            "end_date",
            "target_population",
            "vaccines",
            "status",
            "target_count",
            "is_running",
            "vaccine_names",
            "created_at",
            "updated_at",
        ]

    def get_vaccine_names(self, obj):
        return list(obj.vaccines.values_list("name", flat=True))


class VaccineCampaignListSerializer(serializers.ModelSerializer):
    """Lean serializer for campaign list."""

    is_running = serializers.BooleanField(read_only=True)

    class Meta:
        model = VaccineCampaign
        fields = [
            "id",
            "name",
            "start_date",
            "end_date",
            "target_population",
            "status",
            "target_count",
            "is_running",
            "created_at",
        ]


# =============================================================================
# AEFI Serializers
# =============================================================================


class AEFISerializer(serializers.ModelSerializer):
    """Full serializer for AEFI report — aligned with MOH AEFI Reporting Form."""

    # Vaccine context
    vaccine_code = serializers.CharField(
        source="immunization_record.vaccine.code", read_only=True
    )
    vaccine_name = serializers.CharField(
        source="immunization_record.vaccine.name", read_only=True
    )

    # Patient context
    patient_name = serializers.SerializerMethodField()
    patient_id = serializers.IntegerField(
        source="immunization_record.patient_id", read_only=True
    )
    patient_mrn = serializers.CharField(
        source="immunization_record.patient.mrn", read_only=True
    )
    patient_gender = serializers.CharField(
        source="immunization_record.patient.gender", read_only=True
    )
    patient_date_of_birth = serializers.DateField(
        source="immunization_record.patient.date_of_birth", read_only=True
    )

    # Vaccination details (auto-populated from record)
    vaccination_details = serializers.SerializerMethodField()

    # Reporter/investigator names
    reported_by_name = serializers.SerializerMethodField()
    investigated_by_name = serializers.SerializerMethodField()

    # Follow-up chain
    follow_up_count = serializers.SerializerMethodField()

    class Meta:
        model = AEFI
        fields = [
            "id",
            "immunization_record",
            # Report metadata
            "report_type",
            "parent_report",
            # Vaccine context
            "vaccine_code",
            "vaccine_name",
            # Patient context
            "patient_id",
            "patient_name",
            "patient_mrn",
            "patient_gender",
            "patient_date_of_birth",
            "guardian_name",
            # Vaccination centre
            "vaccination_centre_name",
            "vaccination_centre_county",
            "institution_mfl_code",
            "vaccination_service_type",
            # Event details
            "event_date",
            "onset_time",
            "event_types",
            "other_event_type_detail",
            "severity",
            "description",
            # Vaccination details (from immunization record)
            "vaccination_details",
            # Outcome
            "outcome",
            # Past medical history
            "past_medical_history_notes",
            # Action taken
            "treatment_given",
            "treatment_details",
            "specimen_collected",
            "specimen_type",
            # Reporter
            "reported_by",
            "reported_by_name",
            "reported_by_designation",
            # Reporting to authorities
            "reported_to_authorities",
            "report_date",
            # Investigation
            "investigated_by",
            "investigated_by_name",
            "investigation_notes",
            # National classification
            "national_classification",
            # DHIS2
            "dhis2_submitted_at",
            "dhis2_response",
            # Follow-ups
            "follow_up_count",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "dhis2_submitted_at",
            "dhis2_response",
            "national_classification",
        ]

    def get_patient_name(self, obj):
        patient = obj.immunization_record.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            name = f"{obj.reported_by.first_name} {obj.reported_by.last_name}".strip()
            return name or obj.reported_by.username
        return None

    def get_investigated_by_name(self, obj):
        if obj.investigated_by:
            name = f"{obj.investigated_by.first_name} {obj.investigated_by.last_name}".strip()
            return name or obj.investigated_by.username
        return None

    def get_vaccination_details(self, obj):
        """Return vaccine administration details from the immunization record."""
        record = obj.immunization_record
        return {
            "dose_number": record.dose_number,
            "administered_date": record.administered_date,
            "batch_number": record.batch_number,
            "lot_number": record.lot_number,
            "expiry_date": record.expiry_date,
            "vaccine_manufacturer": record.vaccine_manufacturer,
            "route": record.vaccine.route if record.vaccine else "",
            "site": record.site,
            "diluent_batch_number": record.diluent_batch_number,
            "diluent_manufacturer": record.diluent_manufacturer,
            "diluent_expiry_date": record.diluent_expiry_date,
        }

    def get_follow_up_count(self, obj):
        return obj.follow_ups.count()


class AEFICreateSerializer(serializers.ModelSerializer):
    """Serializer for creating an AEFI report (initial or follow-up)."""

    VALID_EVENT_TYPES = {choice.value for choice in AEFIEventType}

    class Meta:
        model = AEFI
        fields = [
            "immunization_record",
            "report_type",
            "parent_report",
            "guardian_name",
            "vaccination_service_type",
            "event_date",
            "onset_time",
            "event_types",
            "other_event_type_detail",
            "severity",
            "description",
            "outcome",
            "past_medical_history_notes",
            "treatment_given",
            "treatment_details",
            "specimen_collected",
            "specimen_type",
            "reported_by_designation",
        ]

    def validate_event_types(self, value):
        if not isinstance(value, list) or len(value) == 0:
            raise serializers.ValidationError(
                "At least one event type must be selected."
            )
        invalid = set(value) - self.VALID_EVENT_TYPES
        if invalid:
            raise serializers.ValidationError(
                f"Invalid event type(s): {', '.join(sorted(invalid))}. "
                f"Valid choices: {', '.join(sorted(self.VALID_EVENT_TYPES))}"
            )
        return value

    def validate(self, attrs):
        # Follow-up must reference a parent
        report_type = attrs.get("report_type", AEFIReportType.INITIAL)
        parent = attrs.get("parent_report")
        if report_type == AEFIReportType.FOLLOW_UP and not parent:
            raise serializers.ValidationError(
                {"parent_report": "Follow-up reports must reference a parent report."}
            )
        if report_type == AEFIReportType.INITIAL and parent:
            raise serializers.ValidationError(
                {"parent_report": "Initial reports must not have a parent report."}
            )
        # If OTHER is selected, detail is required
        event_types = attrs.get("event_types", [])
        if AEFIEventType.OTHER in event_types and not attrs.get(
            "other_event_type_detail", ""
        ):
            raise serializers.ValidationError(
                {
                    "other_event_type_detail": "Specify the event type when 'Other' is selected."
                }
            )
        return attrs


class AEFIListSerializer(serializers.ModelSerializer):
    """Lean serializer for AEFI list."""

    vaccine_code = serializers.CharField(
        source="immunization_record.vaccine.code", read_only=True
    )
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = AEFI
        fields = [
            "id",
            "immunization_record",
            "vaccine_code",
            "patient_name",
            "report_type",
            "event_date",
            "event_types",
            "severity",
            "outcome",
            "reported_to_authorities",
            "created_at",
        ]

    def get_patient_name(self, obj):
        patient = obj.immunization_record.patient
        return f"{patient.first_name} {patient.last_name}"


class AEFISubmitToAuthoritiesSerializer(serializers.Serializer):
    """Action serializer for submitting AEFI to national authorities."""

    notes = serializers.CharField(required=False, default="")


# =============================================================================
# Vaccine Stock Serializers
# =============================================================================


class VaccineStockSerializer(serializers.ModelSerializer):
    """Full serializer for vaccine stock batch."""

    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    received_by_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_near_expiry = serializers.BooleanField(read_only=True)

    class Meta:
        model = VaccineStock
        fields = [
            "id",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "batch_number",
            "quantity_received",
            "quantity_on_hand",
            "expiry_date",
            "manufacturer",
            "supplier",
            "received_date",
            "received_by",
            "received_by_name",
            "storage_location",
            "vvm_status",
            "min_stock_level",
            "is_expired",
            "is_low_stock",
            "is_near_expiry",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["quantity_on_hand"]

    def get_received_by_name(self, obj):
        if obj.received_by:
            name = f"{obj.received_by.first_name} {obj.received_by.last_name}".strip()
            return name or obj.received_by.username
        return None


class VaccineStockListSerializer(serializers.ModelSerializer):
    """Lean serializer for stock list."""

    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_near_expiry = serializers.BooleanField(read_only=True)

    class Meta:
        model = VaccineStock
        fields = [
            "id",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "batch_number",
            "quantity_on_hand",
            "expiry_date",
            "storage_location",
            "is_expired",
            "is_low_stock",
            "is_near_expiry",
            "created_at",
        ]


class StockTransactionSerializer(serializers.ModelSerializer):
    """Serializer for stock transactions."""

    performed_by_name = serializers.SerializerMethodField()
    vaccine_code = serializers.CharField(source="stock.vaccine.code", read_only=True)
    batch_number = serializers.CharField(source="stock.batch_number", read_only=True)

    class Meta:
        model = StockTransaction
        fields = [
            "id",
            "stock",
            "vaccine_code",
            "batch_number",
            "transaction_type",
            "quantity",
            "balance_after",
            "reference",
            "immunization_record",
            "performed_by",
            "performed_by_name",
            "reason",
            "notes",
            "created_at",
        ]

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            name = f"{obj.performed_by.first_name} {obj.performed_by.last_name}".strip()
            return name or obj.performed_by.username
        return None


class StockReceiveSerializer(serializers.Serializer):
    """Action serializer for receiving stock."""

    vaccine = serializers.IntegerField()
    batch_number = serializers.CharField(max_length=50)
    quantity = serializers.IntegerField(min_value=1)
    expiry_date = serializers.DateField()
    manufacturer = serializers.CharField(required=False, default="")
    supplier = serializers.CharField(required=False, default="")
    received_date = serializers.DateField(default=date_module.today)
    storage_location = serializers.CharField(required=False, default="")
    vvm_status = serializers.CharField(required=False, default="")
    min_stock_level = serializers.IntegerField(required=False, default=10)
    notes = serializers.CharField(required=False, default="")


class StockIssueSerializer(serializers.Serializer):
    """Action serializer for issuing stock (wastage, adjustment, etc.)."""

    quantity = serializers.IntegerField(min_value=1)
    transaction_type = serializers.ChoiceField(
        choices=["WASTAGE", "ADJUSTMENT", "TRANSFER_OUT", "EXPIRED"],
    )
    reason = serializers.CharField(required=False, default="")
    notes = serializers.CharField(required=False, default="")


# =============================================================================
# Cold Chain Serializers
# =============================================================================


class ColdChainEquipmentSerializer(serializers.ModelSerializer):
    """Full serializer for cold chain equipment."""

    class Meta:
        model = ColdChainEquipment
        fields = [
            "id",
            "name",
            "equipment_type",
            "model_number",
            "serial_number",
            "manufacturer",
            "location",
            "capacity_litres",
            "min_temp",
            "max_temp",
            "status",
            "installation_date",
            "last_maintenance_date",
            "next_maintenance_date",
            "power_source",
            "has_backup_power",
            "notes",
            "created_at",
            "updated_at",
        ]


class ColdChainEquipmentListSerializer(serializers.ModelSerializer):
    """Lean serializer for equipment list."""

    class Meta:
        model = ColdChainEquipment
        fields = [
            "id",
            "name",
            "equipment_type",
            "serial_number",
            "location",
            "status",
            "min_temp",
            "max_temp",
            "created_at",
        ]


class TemperatureLogSerializer(serializers.ModelSerializer):
    """Serializer for temperature readings."""

    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TemperatureLog
        fields = [
            "id",
            "equipment",
            "equipment_name",
            "temperature",
            "recorded_at",
            "recorded_by",
            "recorded_by_name",
            "is_excursion",
            "action_taken",
            "created_at",
        ]

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            name = f"{obj.recorded_by.first_name} {obj.recorded_by.last_name}".strip()
            return name or obj.recorded_by.username
        return None


# =============================================================================
# Vaccine Incident Serializers
# =============================================================================


class VaccineIncidentSerializer(serializers.ModelSerializer):
    """Full serializer for vaccine incidents."""

    reported_by_name = serializers.SerializerMethodField()
    investigated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VaccineIncident
        fields = [
            "id",
            "title",
            "incident_type",
            "severity",
            "status",
            "description",
            "occurred_at",
            "resolved_at",
            "duration_minutes",
            "affected_equipment",
            "affected_batches",
            "doses_affected",
            "doses_lost",
            "corrective_actions",
            "preventive_actions",
            "reported_by",
            "reported_by_name",
            "investigated_by",
            "investigated_by_name",
            "reported_to_county",
            "created_at",
            "updated_at",
        ]

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            name = f"{obj.reported_by.first_name} {obj.reported_by.last_name}".strip()
            return name or obj.reported_by.username
        return None

    def get_investigated_by_name(self, obj):
        if obj.investigated_by:
            name = f"{obj.investigated_by.first_name} {obj.investigated_by.last_name}".strip()
            return name or obj.investigated_by.username
        return None


class VaccineIncidentListSerializer(serializers.ModelSerializer):
    """Lean serializer for incident list."""

    class Meta:
        model = VaccineIncident
        fields = [
            "id",
            "title",
            "incident_type",
            "severity",
            "status",
            "occurred_at",
            "doses_affected",
            "doses_lost",
            "reported_to_county",
            "created_at",
        ]
