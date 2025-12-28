"""
Serializers for the encounters app.
"""

from rest_framework import serializers

from .models import Encounter


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
            "respiratory_rate",
            "spo2",
            "weight",
            "height",
            "bmi",
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
            "created_at",
            "updated_at",
        ]

    def get_alerts(self, obj: Encounter) -> str:
        """Get alerts for critical vital signs."""
        return obj.get_alerts()

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
