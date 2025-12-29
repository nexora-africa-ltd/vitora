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
    # Location display names (read-only)
    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    ward_name = serializers.CharField(source="ward.name", read_only=True, allow_null=True)

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
            # Location fields
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "ward",
            "ward_name",
            "village",
            # Other fields
            "referral_source",
            "referred_from_facility",
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
            "county_name",
            "sub_county_name",
            "ward_name",
        ]

    def validate_date_of_birth(self, value):
        """Validate date of birth is not in the future."""
        if value and value > date.today():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate(self, data):
        """Cross-field validation."""
        referral_source = data.get("referral_source", self.instance.referral_source if self.instance else "self")
        referred_from_facility = data.get("referred_from_facility", "")

        if referral_source == "other_facility" and not referred_from_facility:
            raise serializers.ValidationError(
                {"referred_from_facility": "Facility name is required when referral source is 'Other Facility'."}
            )

        # Validate county and sub_county are provided
        county = data.get("county")
        sub_county = data.get("sub_county")
        
        # For new patients (no instance), both are required
        if not self.instance:
            if not county:
                raise serializers.ValidationError({"county": "County is required."})
            if not sub_county:
                raise serializers.ValidationError({"sub_county": "Sub-county is required."})

        return data
