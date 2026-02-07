"""
Serializers for the encounters app.
"""

from rest_framework import serializers

from .models import (
    Diagnosis,
    Encounter,
    ICD10Code,
    Medication,
    TreatmentPlan,
    TreatmentPlanTemplate,
)


class ICD10CodeSerializer(serializers.ModelSerializer):
    """Serializer for ICD-10 codes."""

    class Meta:
        model = ICD10Code
        fields = [
            "id",
            "code",
            "short_description",
            "description",
            "long_description",
            "category",
            "chapter",
            "is_billable",
            "is_active",
        ]
        read_only_fields = ["id"]


class DiagnosisSerializer(serializers.ModelSerializer):
    """Serializer for diagnoses."""

    icd10_code_display = serializers.CharField(source="icd10_code.code", read_only=True)
    icd10_description = serializers.CharField(source="icd10_code.description", read_only=True)
    diagnosed_by_name = serializers.CharField(source="diagnosed_by.get_full_name", read_only=True)

    class Meta:
        model = Diagnosis
        fields = [
            "id",
            "encounter",
            "icd10_code",
            "icd10_code_display",
            "icd10_description",
            "icd11_code",
            "icd11_display",
            "diagnosis_type",
            "free_text_diagnosis",
            "notes",
            "is_confirmed",
            "certainty",
            "diagnosed_by",
            "diagnosed_by_name",
            "diagnosed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "diagnosed_at", "created_at", "updated_at"]

    def validate(self, data):
        """Validate that either ICD-10 code, ICD-11 code, or free text is provided."""
        instance = getattr(self, "instance", None)

        # For partial updates, use instance values as defaults
        if instance:
            icd10_code = data.get("icd10_code", instance.icd10_code)
            icd11_code = data.get("icd11_code", instance.icd11_code)
            free_text = data.get("free_text_diagnosis", instance.free_text_diagnosis)
            encounter = data.get("encounter", instance.encounter)
        else:
            icd10_code = data.get("icd10_code")
            icd11_code = data.get("icd11_code", "")
            free_text = data.get("free_text_diagnosis", "")
            encounter = data.get("encounter")

        if not icd10_code and not icd11_code and not free_text:
            raise serializers.ValidationError(
                "Either ICD-10 code, ICD-11 code, or free-text diagnosis must be provided."
            )

        # Check for existing primary diagnosis when adding a new primary
        if data.get("diagnosis_type") == "PRIMARY":
            existing_primary = Diagnosis.objects.filter(
                encounter=encounter,
                diagnosis_type="PRIMARY",
            )
            if instance:
                existing_primary = existing_primary.exclude(pk=instance.pk)
            if existing_primary.exists():
                raise serializers.ValidationError(
                    {"diagnosis_type": "This encounter already has a primary diagnosis."}
                )

        return data


class DiagnosisNestedSerializer(serializers.ModelSerializer):
    """Nested serializer for diagnoses (used in Encounter serializer)."""

    icd10_code_display = serializers.CharField(source="icd10_code.code", read_only=True)
    icd10_description = serializers.CharField(source="icd10_code.description", read_only=True)
    diagnosed_by_name = serializers.CharField(source="diagnosed_by.get_full_name", read_only=True)

    class Meta:
        model = Diagnosis
        fields = [
            "id",
            "icd10_code",
            "icd10_code_display",
            "icd10_description",
            "icd11_code",
            "icd11_display",
            "diagnosis_type",
            "free_text_diagnosis",
            "is_confirmed",
            "certainty",
            "diagnosed_by",
            "diagnosed_by_name",
        ]


class MedicationSerializer(serializers.ModelSerializer):
    """Serializer for Medication."""

    is_active = serializers.ReadOnlyField()

    class Meta:
        model = Medication
        fields = [
            "id",
            "treatment_plan",
            "name",
            "dosage",
            "frequency",
            "duration",
            "route",
            "quantity",
            "instructions",
            "start_date",
            "end_date",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]


class MedicationNestedSerializer(serializers.ModelSerializer):
    """Nested serializer for medications in treatment plan."""

    is_active = serializers.ReadOnlyField()

    class Meta:
        model = Medication
        fields = [
            "id",
            "name",
            "dosage",
            "frequency",
            "duration",
            "route",
            "quantity",
            "instructions",
            "is_active",
        ]


class TreatmentPlanTemplateSerializer(serializers.ModelSerializer):
    """Serializer for TreatmentPlanTemplate."""

    diagnosis_codes_display = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)

    class Meta:
        model = TreatmentPlanTemplate
        fields = [
            "id",
            "name",
            "description",
            "diagnosis_codes",
            "diagnosis_codes_display",
            "default_medications",
            "default_procedures",
            "default_instructions",
            "follow_up_days",
            "department",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_diagnosis_codes_display(self, obj) -> str:
        """Return diagnosis codes as list of code strings."""
        return [code.code for code in obj.diagnosis_codes.all()]


class TreatmentPlanSerializer(serializers.ModelSerializer):
    """Serializer for TreatmentPlan."""

    medications = MedicationNestedSerializer(many=True, read_only=True)
    has_follow_up = serializers.ReadOnlyField()
    has_referral = serializers.ReadOnlyField()
    template_name = serializers.CharField(source="template.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.get_full_name", read_only=True)

    class Meta:
        model = TreatmentPlan
        fields = [
            "id",
            "encounter",
            "template",
            "template_name",
            "clinical_notes",
            "medications_json",
            "procedures_json",
            "follow_up_instructions",
            "follow_up_date",
            "diet_recommendations",
            "activity_restrictions",
            "referral_needed",
            "referral_specialty",
            "referral_notes",
            "status",
            "has_follow_up",
            "has_referral",
            "medications",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "has_follow_up",
            "has_referral",
            "medications",
            "created_at",
            "updated_at",
        ]


class EncounterSerializer(serializers.ModelSerializer):
    """
    Serializer for the Encounter model.

    Provides CRUD operations for encounters with validation
    and computed fields.
    """

    # Read-only computed fields
    has_critical_vitals = serializers.ReadOnlyField()
    alerts = serializers.SerializerMethodField()
    bmi = serializers.SerializerMethodField()
    bmi_classification = serializers.SerializerMethodField()
    systolic_bp = serializers.SerializerMethodField()
    diastolic_bp = serializers.SerializerMethodField()
    vitals_summary = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    patient_date_of_birth = serializers.DateField(source="patient.date_of_birth", read_only=True)

    # Status-related fields
    finalized_by = serializers.PrimaryKeyRelatedField(read_only=True)
    finalized_by_username = serializers.CharField(
        source="finalized_by.username", read_only=True, allow_null=True
    )

    # Triage & Consultation fields (Phase 2 - Consultation Queue)
    can_enter_consultation = serializers.SerializerMethodField()
    triage_bypassed_by_username = serializers.CharField(
        source="triage_bypassed_by.username", read_only=True, allow_null=True
    )
    wait_time_minutes = serializers.SerializerMethodField()

    # Chief complaint edit tracking
    chief_complaint_edited_by_username = serializers.CharField(
        source="chief_complaint_edited_by.username", read_only=True, allow_null=True
    )

    # Clinician claim fields (Sprint 1.7 - Data Integrity)
    assigned_clinician = serializers.PrimaryKeyRelatedField(read_only=True)
    assigned_clinician_username = serializers.CharField(
        source="assigned_clinician.username", read_only=True, allow_null=True
    )
    assigned_clinician_name = serializers.SerializerMethodField()
    claimed_at = serializers.DateTimeField(read_only=True)

    # Clinic Visit Integration (Sprint 2.5 - Clinic Integration)
    clinic_visit_id = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()
    clinic_type = serializers.SerializerMethodField()

    class Meta:
        model = Encounter
        fields = [
            "id",
            "patient",
            "patient_mrn",
            "patient_name",
            "patient_gender",
            "patient_date_of_birth",
            "encounter_type",
            "encounter_date",
            "chief_complaint",
            "temperature",
            "pulse",
            "blood_pressure",
            "systolic_bp",
            "diastolic_bp",
            "respiratory_rate",
            "spo2",
            "weight",
            "height",
            "bmi",
            "bmi_classification",
            "vitals_summary",
            # Medical History
            "allergies",
            "chronic_conditions",
            "current_medications",
            "past_surgeries",
            "family_history",
            "social_history",
            # Notes and metadata
            "notes",
            # SOAP Note Fields (Sprint 1.5-1.6)
            "history_of_present_illness",
            "physical_examination",
            "assessment",
            # Note: SOAP 'P' (Plan) uses TreatmentPlan.clinical_notes
            # Clinical Template Data
            "clinical_template",
            "clinical_template_data",
            "has_critical_vitals",
            "alerts",
            # Status workflow (Sprint 1.1-1.2)
            "status",
            "finalized_by",
            "finalized_by_username",
            "finalized_at",
            "cancellation_reason",
            # Triage fields (Phase 2 - Consultation Queue)
            "triage_requirement",
            "triage_status",
            "triage_bypass_reason",
            "triage_bypassed_by",
            "triage_bypassed_by_username",
            "triage_bypassed_at",
            # Consultation fields (Phase 2 - Consultation Queue)
            "consultation_status",
            "called_at",
            "consultation_started_at",
            "can_enter_consultation",
            "wait_time_minutes",
            # Chief complaint edit tracking
            "chief_complaint_original",
            "chief_complaint_edited",
            "chief_complaint_edit_reason",
            "chief_complaint_edit_reason_other",
            "chief_complaint_edited_by",
            "chief_complaint_edited_by_username",
            "chief_complaint_edited_at",
            # Clinician claim fields (Sprint 1.7 - Data Integrity)
            "assigned_clinician",
            "assigned_clinician_username",
            "assigned_clinician_name",
            "claimed_at",
            # Clinic Visit Integration (Sprint 2.5 - Clinic Integration)
            "clinic_visit_id",
            "clinic_name",
            "clinic_type",
            # Encounter Linking (Sprint 2 - Phase 2B)
            "linked_encounter",
            # Visit Reason (Sprint 2 - Phase 2D)
            "visit_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_mrn",
            "patient_name",
            "patient_gender",
            "patient_date_of_birth",
            "has_critical_vitals",
            "alerts",
            "bmi",
            "bmi_classification",
            "systolic_bp",
            "diastolic_bp",
            "vitals_summary",
            # Status fields are read-only - use actions to change status
            "status",
            "finalized_by",
            "finalized_by_username",
            "finalized_at",
            "cancellation_reason",
            # Triage fields are read-only - use actions to change
            "triage_requirement",
            "triage_status",
            "triage_bypass_reason",
            "triage_bypassed_by",
            "triage_bypassed_by_username",
            "triage_bypassed_at",
            # Consultation fields are read-only - use actions to change
            "consultation_status",
            "called_at",
            "consultation_started_at",
            "can_enter_consultation",
            "wait_time_minutes",
            # Chief complaint edit fields - read-only except via action
            "chief_complaint_original",
            "chief_complaint_edited",
            "chief_complaint_edit_reason",
            "chief_complaint_edit_reason_other",
            "chief_complaint_edited_by",
            "chief_complaint_edited_by_username",
            "chief_complaint_edited_at",
            # Clinician claim fields (Sprint 1.7 - Data Integrity)
            "assigned_clinician",
            "assigned_clinician_username",
            "assigned_clinician_name",
            "claimed_at",
            # Clinic Visit fields are read-only (Sprint 2.5)
            "clinic_visit_id",
            "clinic_name",
            "clinic_type",
            "created_at",
            "updated_at",
        ]

    def get_assigned_clinician_name(self, obj: Encounter) -> str | None:
        """Get the full name of the assigned clinician."""
        if obj.assigned_clinician:
            return obj.assigned_clinician.get_full_name() or obj.assigned_clinician.username
        return None

    def get_clinic_visit_id(self, obj: Encounter) -> int | None:
        """Get the clinic visit ID from the linked clinic visit."""
        return obj.clinic_visit_id

    def get_clinic_name(self, obj: Encounter) -> str | None:
        """Get the clinic name from the linked clinic visit."""
        if not obj.clinic_visit:
            return None
        if not obj.clinic_visit.session:
            return None
        return obj.clinic_visit.session.clinic.name

    def get_clinic_type(self, obj: Encounter) -> str | None:
        """Get the clinic type from the linked clinic visit."""
        if not obj.clinic_visit:
            return None
        if not obj.clinic_visit.session:
            return None
        return obj.clinic_visit.session.clinic.clinic_type

    def get_alerts(self, obj: Encounter) -> str:
        """Get alerts for critical vital signs."""
        return obj.get_alerts()

    def get_bmi_classification(self, obj: Encounter) -> str | None:
        """Get BMI classification."""
        return obj.get_bmi_classification()

    def get_systolic_bp(self, obj: Encounter) -> int | None:
        """Get systolic blood pressure."""
        return obj.get_systolic_bp()

    def get_diastolic_bp(self, obj: Encounter) -> int | None:
        """Get diastolic blood pressure."""
        return obj.get_diastolic_bp()

    def get_vitals_summary(self, obj: Encounter) -> str:
        """Get formatted vitals summary."""
        return obj.get_vitals_summary()

    def get_bmi(self, obj: Encounter) -> float | None:
        """
        Calculate BMI from weight and height.

        BMI = weight (kg) / height (m)^2
        """
        if obj.weight and obj.height:
            height_m = float(obj.height) / 100  # Convert cm to m
            bmi = float(obj.weight) / (height_m**2)
            return round(bmi, 1)
        return None

    def get_can_enter_consultation(self, obj: Encounter) -> bool:
        """Check if encounter can enter consultation queue."""
        return obj.can_enter_consultation()

    def get_wait_time_minutes(self, obj: Encounter) -> int | None:
        """Calculate wait time in minutes since encounter creation."""
        from django.utils import timezone

        if obj.consultation_status in ["IN_PROGRESS", "COMPLETED"]:
            return None
        now = timezone.now()
        delta = now - obj.created_at
        return int(delta.total_seconds() / 60)

    def validate_blood_pressure(self, value: str) -> str:
        """Validate blood pressure format."""
        import re

        if value and not re.match(r"^\d{2,3}/\d{2,3}$", value):
            raise serializers.ValidationError(
                "Blood pressure must be in format 'systolic/diastolic' (e.g., 120/80)."
            )
        return value

    def validate_temperature(self, value: float | None) -> float | None:
        """Validate temperature range."""
        if value is not None and (value < 35.0 or value > 45.0):
            raise serializers.ValidationError("Temperature must be between 35°C and 45°C.")
        return value

    def validate_pulse(self, value: int | None) -> int | None:
        """Validate pulse range."""
        if value is not None and (value < 30 or value > 200):
            raise serializers.ValidationError("Pulse must be between 30 and 200 beats per minute.")
        return value

    def validate_respiratory_rate(self, value: int | None) -> int | None:
        """Validate respiratory rate range."""
        if value is not None and (value < 8 or value > 40):
            raise serializers.ValidationError(
                "Respiratory rate must be between 8 and 40 breaths per minute."
            )
        return value

    def validate_weight(self, value: float | None) -> float | None:
        """Validate weight range."""
        if value is not None and (value <= 0 or value > 300):
            raise serializers.ValidationError("Weight must be between 0.5 and 300 kg.")
        return value

    def validate_height(self, value: float | None) -> float | None:
        """Validate height range."""
        if value is not None and (value <= 0 or value > 250):
            raise serializers.ValidationError("Height must be between 20 and 250 cm.")
        return value

    def validate_spo2(self, value: float | None) -> float | None:
        """Validate SpO2 range."""
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError("SpO2 must be between 0 and 100%.")
        return value


class EncounterListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing encounters.

    Used for list views where less data is needed.
    """

    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    has_critical_vitals = serializers.ReadOnlyField()

    # Clinic Visit Integration (Sprint 2.5 - Clinic Integration)
    clinic_visit_id = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()
    clinic_type = serializers.SerializerMethodField()

    class Meta:
        model = Encounter
        fields = [
            "id",
            "patient",
            "patient_mrn",
            "patient_name",
            "encounter_type",
            "encounter_date",
            "chief_complaint",
            "has_critical_vitals",
            # Status workflow (Sprint 1.1-1.2)
            "status",
            "finalized_at",
            # Clinic Visit Integration (Sprint 2.5)
            "clinic_visit_id",
            "clinic_name",
            "clinic_type",
            # Visit Reason (Sprint 2 - Phase 2D)
            "visit_reason",
            "created_at",
        ]
        read_only_fields = fields

    def get_clinic_visit_id(self, obj: Encounter) -> int | None:
        """Get the clinic visit ID from the linked clinic visit."""
        return obj.clinic_visit_id

    def get_clinic_name(self, obj: Encounter) -> str | None:
        """Get the clinic name from the linked clinic visit."""
        if not obj.clinic_visit:
            return None
        if not obj.clinic_visit.session:
            return None
        return obj.clinic_visit.session.clinic.name

    def get_clinic_type(self, obj: Encounter) -> str | None:
        """Get the clinic type from the linked clinic visit."""
        if not obj.clinic_visit:
            return None
        if not obj.clinic_visit.session:
            return None
        return obj.clinic_visit.session.clinic.clinic_type
