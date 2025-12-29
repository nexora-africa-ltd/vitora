"""
Serializers for the encounters app.
"""

from rest_framework import serializers

from .models import Diagnosis, Encounter, ICD10Code, Medication, TreatmentPlan


class ICD10CodeSerializer(serializers.ModelSerializer):
    """Serializer for ICD-10 codes."""

    class Meta:
        model = ICD10Code
        fields = ["id", "code", "description", "category", "chapter", "is_active"]
        read_only_fields = ["id"]


class DiagnosisSerializer(serializers.ModelSerializer):
    """Serializer for diagnoses."""

    icd10_code_display = serializers.CharField(source="icd10_code.code", read_only=True)
    icd10_description = serializers.CharField(source="icd10_code.description", read_only=True)

    class Meta:
        model = Diagnosis
        fields = [
            "id",
            "encounter",
            "icd10_code",
            "icd10_code_display",
            "icd10_description",
            "diagnosis_type",
            "free_text_diagnosis",
            "notes",
            "is_confirmed",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, data):
        """Validate that either ICD-10 code or free text is provided."""
        icd10_code = data.get("icd10_code")
        free_text = data.get("free_text_diagnosis", "")

        if not icd10_code and not free_text:
            raise serializers.ValidationError(
                "Either ICD-10 code or free-text diagnosis must be provided."
            )

        # Check for existing primary diagnosis when adding a new primary
        if data.get("diagnosis_type") == "PRIMARY":
            encounter = data.get("encounter")
            instance = getattr(self, "instance", None)
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

    class Meta:
        model = Diagnosis
        fields = [
            "id",
            "icd10_code",
            "icd10_code_display",
            "icd10_description",
            "diagnosis_type",
            "free_text_diagnosis",
            "is_confirmed",
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


class TreatmentPlanSerializer(serializers.ModelSerializer):
    """Serializer for TreatmentPlan."""

    medications = MedicationNestedSerializer(many=True, read_only=True)
    has_follow_up = serializers.ReadOnlyField()

    class Meta:
        model = TreatmentPlan
        fields = [
            "id",
            "encounter",
            "clinical_notes",
            "follow_up_instructions",
            "follow_up_date",
            "status",
            "has_follow_up",
            "medications",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "has_follow_up", "medications", "created_at", "updated_at"]


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
            "has_critical_vitals",
            "alerts",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_mrn",
            "patient_name",
            "has_critical_vitals",
            "alerts",
            "bmi",
            "bmi_classification",
            "systolic_bp",
            "diastolic_bp",
            "vitals_summary",
            "created_at",
            "updated_at",
        ]

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
            "created_at",
        ]
        read_only_fields = fields
