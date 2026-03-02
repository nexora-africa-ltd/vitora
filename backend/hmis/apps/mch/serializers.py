"""
Serializers for the MCH (Maternal & Child Health) module.
"""

from datetime import date as date_module

from rest_framework import serializers

from hmis.apps.mch.models import (
    AEFI,
    ANCVisit,
    Delivery,
    GrowthMeasurement,
    HEIFollowUp,
    HEIPCRTest,
    ImmunizationRecord,
    MCHRegistration,
    PNCVisit,
    Vaccine,
    VitaminASupplement,
)

# =============================================================================
# MCH Registration Serializers
# =============================================================================


class MCHRegistrationListSerializer(serializers.ModelSerializer):
    """Lean serializer for MCH registration list."""

    mother_name = serializers.SerializerMethodField()
    mother_mrn = serializers.CharField(source="mother.mrn", read_only=True)
    edd = serializers.SerializerMethodField()
    gestation_display = serializers.SerializerMethodField()
    trimester = serializers.SerializerMethodField()
    anc_visit_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = MCHRegistration
        fields = [
            "id",
            "mch_number",
            "mother",
            "mother_name",
            "mother_mrn",
            "registration_date",
            "status",
            "is_high_risk",
            "linda_jamii_beneficiary",
            "edd",
            "gestation_display",
            "trimester",
            "anc_visit_count",
            "created_at",
        ]

    def get_mother_name(self, obj):
        return f"{obj.mother.first_name} {obj.mother.last_name}"

    def get_edd(self, obj):
        return obj.edd

    def get_gestation_display(self, obj):
        return obj.gestation_display

    def get_trimester(self, obj):
        return obj.trimester


class MCHRegistrationSerializer(serializers.ModelSerializer):
    """Full serializer for MCH registration detail."""

    mother_name = serializers.SerializerMethodField()
    mother_mrn = serializers.CharField(source="mother.mrn", read_only=True)
    baby_name = serializers.SerializerMethodField()
    baby_mrn = serializers.SerializerMethodField()
    edd = serializers.SerializerMethodField()
    gestation_display = serializers.SerializerMethodField()
    trimester = serializers.SerializerMethodField()
    anc_visit_count = serializers.IntegerField(read_only=True)
    pnc_visit_count = serializers.IntegerField(read_only=True)
    registered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MCHRegistration
        fields = [
            "id",
            "mch_number",
            "mother",
            "mother_name",
            "mother_mrn",
            "anc_enrollment",
            "baby",
            "baby_name",
            "baby_mrn",
            "registration_date",
            "status",
            "is_high_risk",
            "risk_factors",
            "sha_claimable",
            "linda_jamii_beneficiary",
            "gbv_related",
            "is_sensitive",
            "registered_by",
            "registered_by_name",
            "notes",
            "completed_at",
            "edd",
            "gestation_display",
            "trimester",
            "anc_visit_count",
            "pnc_visit_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mch_number",
            "is_sensitive",
            "registered_by",
            "completed_at",
        ]

    def get_mother_name(self, obj):
        return f"{obj.mother.first_name} {obj.mother.last_name}"

    def get_baby_name(self, obj):
        if obj.baby:
            return f"{obj.baby.first_name} {obj.baby.last_name}"
        return None

    def get_baby_mrn(self, obj):
        if obj.baby:
            return obj.baby.mrn
        return None

    def get_edd(self, obj):
        return obj.edd

    def get_gestation_display(self, obj):
        return obj.gestation_display

    def get_trimester(self, obj):
        return obj.trimester

    def get_registered_by_name(self, obj):
        if obj.registered_by:
            return f"{obj.registered_by.first_name} {obj.registered_by.last_name}".strip() or obj.registered_by.username
        return None


class MCHRegistrationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating MCH registrations."""

    class Meta:
        model = MCHRegistration
        fields = [
            "mother",
            "anc_enrollment",
            "registration_date",
            "is_high_risk",
            "risk_factors",
            "sha_claimable",
            "linda_jamii_beneficiary",
            "gbv_related",
            "notes",
        ]


# =============================================================================
# ANC Visit Serializers
# =============================================================================


class ANCVisitSerializer(serializers.ModelSerializer):
    """Full serializer for ANC visit."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    conducted_by_name = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()
    is_fetal_heart_rate_normal = serializers.BooleanField(read_only=True)

    class Meta:
        model = ANCVisit
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "encounter",
            "visit_number",
            "visit_date",
            "gestation_weeks",
            "weight",
            "blood_pressure",
            "fundal_height",
            "fetal_heart_rate",
            "presentation",
            "lie",
            "fetal_movements",
            "urine_protein",
            "urine_glucose",
            "hb_level",
            "blood_sugar",
            "hiv_test_done",
            "syphilis_test_done",
            "iron_folate_given",
            "calcium_given",
            "deworming_given",
            "tetanus_toxoid_dose",
            "next_visit_date",
            "notes",
            "conducted_by",
            "conducted_by_name",
            "alerts",
            "is_fetal_heart_rate_normal",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["gestation_weeks"]

    def get_conducted_by_name(self, obj):
        if obj.conducted_by:
            return f"{obj.conducted_by.first_name} {obj.conducted_by.last_name}".strip() or obj.conducted_by.username
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class ANCVisitListSerializer(serializers.ModelSerializer):
    """Lean serializer for ANC visit list."""

    alerts = serializers.SerializerMethodField()

    class Meta:
        model = ANCVisit
        fields = [
            "id",
            "registration",
            "visit_number",
            "visit_date",
            "gestation_weeks",
            "weight",
            "blood_pressure",
            "fetal_heart_rate",
            "next_visit_date",
            "alerts",
            "created_at",
        ]

    def get_alerts(self, obj):
        return obj.get_alerts()


# =============================================================================
# Delivery Serializers
# =============================================================================


class DeliverySerializer(serializers.ModelSerializer):
    """Full serializer for delivery record."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    delivered_by_name = serializers.SerializerMethodField()
    baby_patient_mrn = serializers.SerializerMethodField()
    is_low_birth_weight = serializers.BooleanField(read_only=True)
    is_macrosomia = serializers.BooleanField(read_only=True)
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "delivery_date",
            "delivery_time",
            "delivery_type",
            "delivery_outcome",
            "place_of_delivery",
            "status",
            "delivered_by",
            "delivered_by_name",
            "baby_gender",
            "birth_weight",
            "apgar_score_1min",
            "apgar_score_5min",
            "apgar_score_10min",
            "resuscitation_done",
            "baby_patient",
            "baby_patient_mrn",
            "maternal_complications",
            "neonatal_complications",
            "blood_loss_ml",
            "placenta_complete",
            "is_low_birth_weight",
            "is_macrosomia",
            "alerts",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["baby_patient"]
        extra_kwargs = {
            "status": {"default": "COMPLETED"},
        }

    def get_delivered_by_name(self, obj):
        if obj.delivered_by:
            return f"{obj.delivered_by.first_name} {obj.delivered_by.last_name}".strip() or obj.delivered_by.username
        return None

    def get_baby_patient_mrn(self, obj):
        if obj.baby_patient:
            return obj.baby_patient.mrn
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class DeliveryListSerializer(serializers.ModelSerializer):
    """Lean serializer for delivery list."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "delivery_date",
            "delivery_type",
            "delivery_outcome",
            "status",
            "baby_gender",
            "birth_weight",
            "alerts",
            "created_at",
        ]

    def get_alerts(self, obj):
        return obj.get_alerts()


# =============================================================================
# PNC Visit Serializers
# =============================================================================


class PNCVisitSerializer(serializers.ModelSerializer):
    """Full serializer for PNC visit."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    conducted_by_name = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = PNCVisit
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "encounter",
            "visit_number",
            "visit_date",
            "days_postpartum",
            "blood_pressure",
            "temperature",
            "uterine_involution",
            "lochia",
            "breast_condition",
            "mood_assessment",
            "baby_weight",
            "baby_temperature",
            "cord_status",
            "breastfeeding_status",
            "family_planning_counselling",
            "contraceptive_given",
            "conducted_by",
            "conducted_by_name",
            "alerts",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["days_postpartum"]

    def get_conducted_by_name(self, obj):
        if obj.conducted_by:
            return f"{obj.conducted_by.first_name} {obj.conducted_by.last_name}".strip() or obj.conducted_by.username
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class PNCVisitListSerializer(serializers.ModelSerializer):
    """Lean serializer for PNC visit list."""

    alerts = serializers.SerializerMethodField()

    class Meta:
        model = PNCVisit
        fields = [
            "id",
            "registration",
            "visit_number",
            "visit_date",
            "days_postpartum",
            "breastfeeding_status",
            "alerts",
            "created_at",
        ]

    def get_alerts(self, obj):
        return obj.get_alerts()


# =============================================================================
# Growth Measurement Serializers
# =============================================================================


class GrowthMeasurementSerializer(serializers.ModelSerializer):
    """Full serializer for growth measurement."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    patient_dob = serializers.DateField(source="patient.date_of_birth", read_only=True)
    measured_by_name = serializers.SerializerMethodField()
    has_critical_flag = serializers.BooleanField(read_only=True)
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = GrowthMeasurement
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "patient_gender",
            "patient_dob",
            "encounter",
            "measured_by",
            "measured_by_name",
            "measurement_date",
            "age_in_days",
            "weight",
            "height",
            "head_circumference",
            "muac",
            "weight_for_age_z",
            "height_for_age_z",
            "weight_for_height_z",
            "bmi_for_age_z",
            "head_circumference_for_age_z",
            "muac_classification",
            "nutritional_status",
            "has_critical_flag",
            "alerts",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "age_in_days",
            "weight_for_age_z",
            "height_for_age_z",
            "weight_for_height_z",
            "bmi_for_age_z",
            "head_circumference_for_age_z",
            "muac_classification",
            "nutritional_status",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_measured_by_name(self, obj):
        if obj.measured_by:
            return f"{obj.measured_by.first_name} {obj.measured_by.last_name}".strip() or obj.measured_by.username
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class GrowthMeasurementListSerializer(serializers.ModelSerializer):
    """Lean serializer for growth measurement list."""

    patient_name = serializers.SerializerMethodField()
    has_critical_flag = serializers.BooleanField(read_only=True)

    class Meta:
        model = GrowthMeasurement
        fields = [
            "id",
            "patient",
            "patient_name",
            "measurement_date",
            "age_in_days",
            "weight",
            "height",
            "muac",
            "muac_classification",
            "nutritional_status",
            "has_critical_flag",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class GrowthChartDataSerializer(serializers.Serializer):
    """Serializer for growth chart data response."""

    measurements = GrowthMeasurementListSerializer(many=True)
    percentile_lines = serializers.DictField()
    chart_type = serializers.CharField()
    sex = serializers.CharField()


# =============================================================================
# Vaccine Serializers
# =============================================================================


class VaccineSerializer(serializers.ModelSerializer):
    """Serializer for vaccine reference data."""

    class Meta:
        model = Vaccine
        fields = [
            "id",
            "code",
            "name",
            "description",
            "disease_target",
            "standard_age_days",
            "route",
            "dose_number",
            "series_name",
            "is_active",
        ]


# =============================================================================
# Immunization Record Serializers
# =============================================================================


class ImmunizationRecordSerializer(serializers.ModelSerializer):
    """Full serializer for immunization record."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
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
            return f"{obj.administered_by.first_name} {obj.administered_by.last_name}".strip() or obj.administered_by.username
        return None


class ImmunizationRecordListSerializer(serializers.ModelSerializer):
    """Lean serializer for immunization record list."""

    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ImmunizationRecord
        fields = [
            "id",
            "patient",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "scheduled_date",
            "administered_date",
            "status",
            "dose_number",
            "is_overdue",
            "created_at",
        ]


class AdministerVaccineSerializer(serializers.Serializer):
    """Serializer for administering a vaccine."""

    administered_date = serializers.DateField(default=date_module.today)
    batch_number = serializers.CharField(required=False, default="")
    lot_number = serializers.CharField(required=False, default="")
    expiry_date = serializers.DateField(required=False, allow_null=True)
    site = serializers.ChoiceField(
        choices=ImmunizationRecord.SITE_CHOICES,
        required=False,
        default="",
    )
    notes = serializers.CharField(required=False, default="")


# =============================================================================
# Vitamin A Supplement Serializer
# =============================================================================


class VitaminASupplementSerializer(serializers.ModelSerializer):
    """Serializer for Vitamin A supplement records."""

    patient_name = serializers.SerializerMethodField()
    administered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VitaminASupplement
        fields = [
            "id",
            "patient",
            "patient_name",
            "administered_date",
            "dose",
            "administered_by",
            "administered_by_name",
            "notes",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_administered_by_name(self, obj):
        if obj.administered_by:
            return f"{obj.administered_by.first_name} {obj.administered_by.last_name}".strip() or obj.administered_by.username
        return None


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
            return f"{obj.investigated_by.first_name} {obj.investigated_by.last_name}".strip() or obj.investigated_by.username
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


# =============================================================================
# HEI Follow-Up Serializers
# =============================================================================


class HEIPCRTestSerializer(serializers.ModelSerializer):
    """Serializer for HEI PCR test records."""

    class Meta:
        model = HEIPCRTest
        fields = [
            "id",
            "hei_followup",
            "test_number",
            "scheduled_date",
            "actual_date",
            "result",
            "lab_reference",
            "notes",
            "created_at",
        ]


class HEIPCRTestReadSerializer(serializers.ModelSerializer):
    """Read-only serializer for nested HEI PCR test records."""

    class Meta:
        model = HEIPCRTest
        fields = [
            "id",
            "hei_followup",
            "test_number",
            "scheduled_date",
            "actual_date",
            "result",
            "lab_reference",
            "notes",
            "created_at",
        ]
        read_only_fields = ["hei_followup"]


class HEIFollowUpSerializer(serializers.ModelSerializer):
    """Full serializer for HEI follow-up."""

    infant_name = serializers.SerializerMethodField()
    infant_mrn = serializers.CharField(source="infant.mrn", read_only=True)
    mother_name = serializers.SerializerMethodField()
    pcr_tests = HEIPCRTestReadSerializer(many=True, read_only=True)
    enrolled_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HEIFollowUp
        fields = [
            "id",
            "hei_number",
            "infant",
            "infant_name",
            "infant_mrn",
            "mch_registration",
            "mother_name",
            "enrollment_date",
            "status",
            "mother_art_status",
            "infant_arv_prophylaxis",
            "arv_start_date",
            "arv_end_date",
            "breastfeeding_status",
            "cotrimoxazole_prophylaxis",
            "cotrimoxazole_start_date",
            "enrolled_by",
            "enrolled_by_name",
            "pcr_tests",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["hei_number", "enrolled_by", "is_sensitive"]

    def get_infant_name(self, obj):
        return f"{obj.infant.first_name} {obj.infant.last_name}"

    def get_mother_name(self, obj):
        if obj.mch_registration:
            mother = obj.mch_registration.mother
            return f"{mother.first_name} {mother.last_name}"
        return None

    def get_enrolled_by_name(self, obj):
        if obj.enrolled_by:
            return f"{obj.enrolled_by.first_name} {obj.enrolled_by.last_name}".strip() or obj.enrolled_by.username
        return None


class HEIFollowUpListSerializer(serializers.ModelSerializer):
    """Lean serializer for HEI follow-up list."""

    infant_name = serializers.SerializerMethodField()
    infant_mrn = serializers.CharField(source="infant.mrn", read_only=True)

    class Meta:
        model = HEIFollowUp
        fields = [
            "id",
            "hei_number",
            "infant",
            "infant_name",
            "infant_mrn",
            "enrollment_date",
            "status",
            "mother_art_status",
            "infant_arv_prophylaxis",
            "breastfeeding_status",
            "created_at",
        ]

    def get_infant_name(self, obj):
        return f"{obj.infant.first_name} {obj.infant.last_name}"
