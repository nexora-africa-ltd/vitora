"""
Serializers for the patients app.
"""

from datetime import date

from rest_framework import serializers

from .models import Allergy, EmergencyContact, Patient


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
    registered_by_username = serializers.CharField(source="registered_by.username", read_only=True)
    # Location display names (read-only)
    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    ward_name = serializers.CharField(source="ward.name", read_only=True, allow_null=True)

    # Emergency contacts - nested serializer (read-only for list view)
    emergency_contacts = EmergencyContactSerializer(many=True, read_only=True)

    # Convenience fields for primary emergency contact (first one)
    emergency_contact_name = serializers.SerializerMethodField()
    emergency_contact_phone = serializers.SerializerMethodField()
    emergency_contact_relationship = serializers.SerializerMethodField()

    # Clinical summary fields (read-only, aggregated from related models)
    allergy_summary = serializers.SerializerMethodField()
    chronic_conditions_summary = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "mrn",
            # Client Registry
            "cr_number",
            # SHA Integration
            "sha_number",
            # Personal Information
            "title",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "date_of_birth",
            "place_of_birth",
            "age",
            "gender",
            "citizenship",
            "is_person_with_disability",
            # Identification
            "identification_type",
            "identification_number",
            "national_id",  # Legacy, kept for backward compatibility
            # Contact Information
            "phone_number",
            "email",
            "address",
            # Location fields
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "ward",
            "ward_name",
            "village",
            # Consent fields (Kenya DPA compliance)
            "consent_given",
            "consent_date",
            "consent_deferred",
            "is_sensitive",
            # Emergency contacts (nested)
            "emergency_contacts",
            # Primary emergency contact convenience fields
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relationship",
            # Clinical summary (read-only, computed)
            "allergy_summary",
            "chronic_conditions_summary",
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
            "emergency_contacts",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relationship",
            "allergy_summary",
            "chronic_conditions_summary",
        ]

    def get_emergency_contact_name(self, obj) -> str:
        """Get the primary emergency contact's name."""
        contact = obj.emergency_contacts.first()
        return contact.full_name if contact else None

    def get_emergency_contact_phone(self, obj) -> str:
        """Get the primary emergency contact's phone number."""
        contact = obj.emergency_contacts.first()
        return contact.phone_number if contact else None

    def get_emergency_contact_relationship(self, obj) -> str:
        """Get the primary emergency contact's relationship."""
        contact = obj.emergency_contacts.first()
        return contact.relationship if contact else None

    def get_allergy_summary(self, obj) -> list[str]:
        """Return list of active allergy substance names from the structured Allergy model."""
        return list(
            obj.allergies.filter(status="active").values_list("substance", flat=True)
        )

    def get_chronic_conditions_summary(self, obj) -> str:
        """Return chronic conditions text from the patient's most recent encounter."""
        latest = (
            obj.encounters.order_by("-created_at").values_list("chronic_conditions", flat=True).first()
        )
        return latest if latest is not None else ""

    def validate_date_of_birth(self, value):
        """Validate date of birth is not in the future."""
        if value and value > date.today():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate(self, data):
        """Cross-field validation including duplicate detection."""
        referral_source = data.get(
            "referral_source", self.instance.referral_source if self.instance else "self"
        )
        referred_from_facility = data.get("referred_from_facility", "")

        if referral_source == "other_facility" and not referred_from_facility:
            raise serializers.ValidationError(
                {
                    "referred_from_facility": "Facility name is required when referral source is 'Other Facility'."
                }
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

        # Check for potential duplicate patients (same name + DOB + gender)
        # This provides a warning for demographic duplicates
        if not self.instance:  # Only check for new patient creation
            first_name = data.get("first_name", "")
            last_name = data.get("last_name", "")
            dob = data.get("date_of_birth")
            gender = data.get("gender", "")

            if first_name and last_name and dob and gender:
                duplicate_qs = Patient.objects.filter(
                    first_name__iexact=first_name,
                    last_name__iexact=last_name,
                    date_of_birth=dob,
                    gender=gender,
                )
                if duplicate_qs.exists():
                    existing = duplicate_qs.first()
                    raise serializers.ValidationError(
                        {
                            "non_field_errors": [
                                f"A patient with similar demographics already exists. "
                                f"Possible duplicate: {existing.full_name} (MRN: {existing.mrn}). "
                                f"If this is a different person, please add an identification number to distinguish them."
                            ]
                        }
                    )

        return data

class AllergySerializer(serializers.ModelSerializer):
    """Serializer for the Allergy model."""

    # Read-only display fields
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    drug_name = serializers.CharField(source="drug.generic_name", read_only=True, allow_null=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    # Make patient optional for nested routes (will be set in view)
    patient = serializers.PrimaryKeyRelatedField(
        queryset=Patient.objects.all(),
        required=False,
        allow_null=True,
    )

    # Display values for choice fields
    substance_type_display = serializers.CharField(
        source="get_substance_type_display", read_only=True
    )
    reaction_type_display = serializers.CharField(
        source="get_reaction_type_display", read_only=True
    )
    severity_display = serializers.CharField(source="get_severity_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    verification_status_display = serializers.CharField(
        source="get_verification_status_display", read_only=True
    )
    criticality_display = serializers.CharField(
        source="get_criticality_display", read_only=True
    )

    # Computed fields
    is_high_risk = serializers.ReadOnlyField()
    is_active = serializers.ReadOnlyField()

    class Meta:
        model = Allergy
        fields = [
            "id",
            # Patient info
            "patient",
            "patient_mrn",
            "patient_name",
            # Substance
            "substance",
            "substance_code",
            "substance_code_system",
            "substance_type",
            "substance_type_display",
            # Drug link
            "drug",
            "drug_name",
            # Reaction
            "reaction_type",
            "reaction_type_display",
            "reaction_description",
            "severity",
            "severity_display",
            "criticality",
            "criticality_display",
            # Dates
            "onset_date",
            "last_occurrence",
            # Status
            "status",
            "status_display",
            "verification_status",
            "verification_status_display",
            # Computed
            "is_high_risk",
            "is_active",
            # Notes and source
            "notes",
            "source_encounter",
            "recorded_by",
            "recorded_by_username",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_mrn",
            "patient_name",
            "drug_name",
            "recorded_by",
            "recorded_by_username",
            "substance_type_display",
            "reaction_type_display",
            "severity_display",
            "status_display",
            "verification_status_display",
            "criticality_display",
            "is_high_risk",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def validate_onset_date(self, value):
        """Validate onset_date is not in the future."""
        if value and value > date.today():
            raise serializers.ValidationError("Onset date cannot be in the future.")
        return value

    def validate_last_occurrence(self, value):
        """Validate last_occurrence is not in the future."""
        if value and value > date.today():
            raise serializers.ValidationError("Last occurrence date cannot be in the future.")
        return value

    def validate(self, data):
        """Cross-field validation."""
        onset_date = data.get("onset_date")
        last_occurrence = data.get("last_occurrence")

        # If updating, get existing values if not provided
        if self.instance:
            onset_date = onset_date or self.instance.onset_date
            last_occurrence = last_occurrence or self.instance.last_occurrence

        # Validate last_occurrence is after onset_date
        if onset_date and last_occurrence and last_occurrence < onset_date:
            raise serializers.ValidationError(
                {"last_occurrence": "Last occurrence cannot be before onset date."}
            )

        return data


class AllergyListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for Allergy listing (embedded in patient views)."""

    severity_display = serializers.CharField(source="get_severity_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_high_risk = serializers.ReadOnlyField()

    class Meta:
        model = Allergy
        fields = [
            "id",
            "substance",
            "substance_type",
            "reaction_type",
            "severity",
            "severity_display",
            "status",
            "status_display",
            "is_high_risk",
            "onset_date",
        ]
