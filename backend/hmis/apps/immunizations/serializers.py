"""Serializers for the immunizations app."""

from datetime import date as date_module

from rest_framework import serializers

from hmis.apps.immunizations.models import (
    AEFI,
    AdministrationSite,
    ImmunizationRecord,
    VaccineCampaign,
    VaccineDefinition,
)

# =============================================================================
# VaccineDefinition Serializers
# =============================================================================


class VaccineDefinitionSerializer(serializers.ModelSerializer):
    """Full serializer for vaccine definition reference data."""

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
    """Full serializer for AEFI report."""

    vaccine_code = serializers.CharField(
        source="immunization_record.vaccine.code", read_only=True
    )
    vaccine_name = serializers.CharField(
        source="immunization_record.vaccine.name", read_only=True
    )
    patient_name = serializers.SerializerMethodField()
    investigated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AEFI
        fields = [
            "id",
            "immunization_record",
            "vaccine_code",
            "vaccine_name",
            "patient_name",
            "event_date",
            "event_type",
            "severity",
            "description",
            "outcome",
            "reported_to_authorities",
            "report_date",
            "investigated_by",
            "investigated_by_name",
            "investigation_notes",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        patient = obj.immunization_record.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_investigated_by_name(self, obj):
        if obj.investigated_by:
            name = f"{obj.investigated_by.first_name} {obj.investigated_by.last_name}".strip()
            return name or obj.investigated_by.username
        return None


class AEFIListSerializer(serializers.ModelSerializer):
    """Lean serializer for AEFI list."""

    vaccine_code = serializers.CharField(
        source="immunization_record.vaccine.code", read_only=True
    )

    class Meta:
        model = AEFI
        fields = [
            "id",
            "immunization_record",
            "vaccine_code",
            "event_date",
            "event_type",
            "severity",
            "outcome",
            "reported_to_authorities",
            "created_at",
        ]
