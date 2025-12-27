"""
Serializers for the patients app.
"""

from rest_framework import serializers

from .models import Patient


class PatientSerializer(serializers.ModelSerializer):
    """Serializer for the Patient model."""

    age = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "mrn", "created_at", "updated_at", "age", "full_name"]
