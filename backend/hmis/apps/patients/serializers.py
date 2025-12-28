"""
Serializers for the patients app.
"""

from datetime import date

from rest_framework import serializers

from .models import EmergencyContact, Patient


class EmergencyContactSerializer(serializers.ModelSerializer):
    """Serializer for the EmergencyContact model."""

    class Meta:
        model = EmergencyContact
        fields = [
            "id",
            "full_name",
            "relationship",
            "phone_number",
            "alternative_phone",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PatientSerializer(serializers.ModelSerializer):
    """Serializer for the Patient model."""

    age = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()
    registered_by_username = serializers.CharField(
        source="registered_by.username", read_only=True
    )

    class Meta:
        model = Patient
        fields = [
            "id",
            "mrn",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "date_of_birth",
            "age",
            "gender",
            "phone_number",
            "email",
            "address",
            "national_id",
            "registered_by",
            "registered_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "mrn",
            "created_at",
            "updated_at",
            "age",
            "full_name",
            "registered_by",
            "registered_by_username",
        ]

    def validate_date_of_birth(self, value):
        """Validate date of birth is not in the future."""
        if value and value > date.today():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value
