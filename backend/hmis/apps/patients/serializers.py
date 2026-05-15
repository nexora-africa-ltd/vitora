"""
Serializers for the patients app.
"""

from datetime import date

from rest_framework import serializers

from .models import Allergy, DeathRecord, EmergencyContact, Patient


class EmergencyContactSerializer(serializers.ModelSerializer):
    """Serializer for the EmergencyContact model."""

    # Explicit declarations — these are property descriptors, not model fields
    phone_number = serializers.CharField(required=True, allow_blank=False)
    alternative_phone = serializers.CharField(required=False, allow_blank=True, default="")

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

    # Explicit declarations for PII property descriptors (not model fields)
    identification_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    phone_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    email = serializers.CharField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    principal_national_id = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )

    household_members = serializers.SerializerMethodField()

    age = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()
    registered_by_username = serializers.CharField(source="registered_by.username", read_only=True)
    # Tenant context (read-only)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, allow_null=True
    )
    registered_at_facility_name = serializers.CharField(
        source="registered_at_facility.name", read_only=True, allow_null=True
    )
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
            "household_number",
            "principal_national_id",
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
            "household_members",
            # Deceased status
            "is_deceased",
            "date_of_death",
            # Other fields
            "referral_source",
            "referred_from_facility",
            "registered_by",
            "registered_by_username",
            # Tenant context
            "organization",
            "organization_name",
            "registered_at_facility",
            "registered_at_facility_name",
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
            "organization",
            "organization_name",
            "registered_at_facility",
            "registered_at_facility_name",
            "county_name",
            "sub_county_name",
            "ward_name",
            "emergency_contacts",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relationship",
            "allergy_summary",
            "chronic_conditions_summary",
            "household_members",
            "is_deceased",
            "date_of_death",
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
        return list(obj.allergies.filter(status="active").values_list("substance", flat=True))

    def get_chronic_conditions_summary(self, obj) -> str:
        """Return chronic conditions from structured records, falling back to legacy text."""
        from hmis.apps.encounters.models import ChronicCondition

        # Primary: structured ChronicCondition records
        structured = list(
            ChronicCondition.objects.filter(
                patient=obj, status=ChronicCondition.ConditionStatus.ACTIVE
            ).values_list("condition_name", flat=True)
        )
        if structured:
            return ", ".join(structured)

        # Fallback: legacy free-text from most recent encounter
        latest = (
            obj.encounters.order_by("-created_at")
            .values_list("chronic_conditions", flat=True)
            .first()
        )
        return latest if latest is not None else ""

    def get_household_members(self, obj) -> list[dict[str, object]]:
        """Return other locally registered patients linked by household number."""
        if not obj.household_number:
            return []

        queryset = (
            Patient.objects.filter(
                organization=obj.organization,
                household_number=obj.household_number,
            )
            .exclude(pk=obj.pk)
            .order_by("last_name", "first_name")[:10]
        )

        return [
            {
                "id": patient.id,
                "mrn": patient.mrn,
                "full_name": patient.full_name,
                "date_of_birth": patient.date_of_birth,
                "gender": patient.gender,
                "cr_number": patient.cr_number,
                "sha_number": patient.sha_number,
            }
            for patient in queryset
        ]

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
        if not self.instance:
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


class PatientHouseholdMemberSerializer(serializers.ModelSerializer):
    """Lightweight serializer for household member suggestions."""

    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "mrn",
            "full_name",
            "date_of_birth",
            "gender",
            "cr_number",
            "sha_number",
            "household_number",
            "principal_national_id",
        ]
        read_only_fields = fields

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
    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True, allow_null=True
    )

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
    criticality_display = serializers.CharField(source="get_criticality_display", read_only=True)

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


# =============================================================================
# DEATH RECORD SERIALIZERS (Last Office / Morgue)
# =============================================================================


class DeathRecordCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a death record."""

    class Meta:
        model = DeathRecord
        fields = [
            "patient",
            "date_of_death",
            "time_of_death",
            "manner_of_death",
            "place_of_death",
            "place_of_death_detail",
            "notification_source",
            "primary_cause",
            "primary_cause_icd10",
            "antecedent_cause",
            "antecedent_cause_icd10",
            "underlying_cause",
            "underlying_cause_icd10",
            "contributing_conditions",
            "admission",
            "encounter",
            "morgue_compartment",
            "notes",
        ]

    def validate_date_of_death(self, value):
        if value and value > date.today():
            raise serializers.ValidationError("Date of death cannot be in the future.")
        return value

    def validate_patient(self, value):
        if value.is_deceased:
            raise serializers.ValidationError("This patient already has a death record.")
        return value

    def validate(self, data):
        patient = data.get("patient")
        dod = data.get("date_of_death")
        if patient and dod and patient.date_of_birth and dod < patient.date_of_birth:
            raise serializers.ValidationError(
                {"date_of_death": "Date of death cannot be before date of birth."}
            )
        return data


class DeathRecordListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for death record listing."""

    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    body_status_display = serializers.CharField(source="get_body_status_display", read_only=True)
    manner_of_death_display = serializers.CharField(
        source="get_manner_of_death_display", read_only=True
    )
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    is_voided = serializers.ReadOnlyField()
    is_certified = serializers.ReadOnlyField()

    class Meta:
        model = DeathRecord
        fields = [
            "id",
            "patient",
            "patient_mrn",
            "patient_name",
            "date_of_death",
            "time_of_death",
            "manner_of_death",
            "manner_of_death_display",
            "place_of_death",
            "status",
            "status_display",
            "body_status",
            "body_status_display",
            "is_voided",
            "is_certified",
            "recorded_by_username",
            "created_at",
        ]


class DeathRecordDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for a death record."""

    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_date_of_birth = serializers.DateField(source="patient.date_of_birth", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    body_status_display = serializers.CharField(source="get_body_status_display", read_only=True)
    manner_of_death_display = serializers.CharField(
        source="get_manner_of_death_display", read_only=True
    )
    place_of_death_display = serializers.CharField(
        source="get_place_of_death_display", read_only=True
    )
    notification_source_display = serializers.CharField(
        source="get_notification_source_display", read_only=True
    )
    primary_cause_icd10_code = serializers.CharField(
        source="primary_cause_icd10.code", read_only=True, allow_null=True
    )
    primary_cause_icd10_description = serializers.CharField(
        source="primary_cause_icd10.description", read_only=True, allow_null=True
    )
    antecedent_cause_icd10_code = serializers.CharField(
        source="antecedent_cause_icd10.code", read_only=True, allow_null=True
    )
    antecedent_cause_icd10_description = serializers.CharField(
        source="antecedent_cause_icd10.description", read_only=True, allow_null=True
    )
    underlying_cause_icd10_code = serializers.CharField(
        source="underlying_cause_icd10.code", read_only=True, allow_null=True
    )
    underlying_cause_icd10_description = serializers.CharField(
        source="underlying_cause_icd10.description", read_only=True, allow_null=True
    )
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    certified_by_username = serializers.CharField(
        source="certified_by.username", read_only=True, allow_null=True
    )
    voided_by_username = serializers.CharField(
        source="voided_by.username", read_only=True, allow_null=True
    )
    is_voided = serializers.ReadOnlyField()
    is_certified = serializers.ReadOnlyField()
    is_released = serializers.ReadOnlyField()

    class Meta:
        model = DeathRecord
        fields = [
            "id",
            # Patient
            "patient",
            "patient_mrn",
            "patient_name",
            "patient_date_of_birth",
            "patient_gender",
            # Status
            "status",
            "status_display",
            # Death details
            "date_of_death",
            "time_of_death",
            "manner_of_death",
            "manner_of_death_display",
            "place_of_death",
            "place_of_death_display",
            "place_of_death_detail",
            "notification_source",
            "notification_source_display",
            # Cause of death
            "primary_cause",
            "primary_cause_icd10",
            "primary_cause_icd10_code",
            "primary_cause_icd10_description",
            "antecedent_cause",
            "antecedent_cause_icd10",
            "antecedent_cause_icd10_code",
            "antecedent_cause_icd10_description",
            "underlying_cause",
            "underlying_cause_icd10",
            "underlying_cause_icd10_code",
            "underlying_cause_icd10_description",
            "contributing_conditions",
            # Certification
            "certified_by",
            "certified_by_username",
            "certified_at",
            "death_certificate_number",
            # Morgue / Last Office
            "body_status",
            "body_status_display",
            "morgue_admission_date",
            "morgue_compartment",
            "released_to",
            "released_to_id_number",
            "released_to_relationship",
            "release_date",
            "burial_permit_number",
            # Linked records
            "admission",
            "encounter",
            # Audit
            "recorded_by",
            "recorded_by_username",
            "notes",
            "voided_by",
            "voided_by_username",
            "voided_at",
            "void_reason",
            # Computed
            "is_voided",
            "is_certified",
            "is_released",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class DeathRecordCertifySerializer(serializers.Serializer):
    """Serializer for the certify action."""

    certificate_number = serializers.CharField(required=False, default="", allow_blank=True)


class DeathRecordReleaseBodySerializer(serializers.Serializer):
    """Serializer for the release_body action."""

    released_to = serializers.CharField(max_length=200)
    id_number = serializers.CharField(required=False, default="", allow_blank=True, max_length=50)
    relationship = serializers.CharField(
        required=False, default="", allow_blank=True, max_length=100
    )
    burial_permit_number = serializers.CharField(
        required=False, default="", allow_blank=True, max_length=50
    )


class DeathRecordVoidSerializer(serializers.Serializer):
    """Serializer for the void action."""

    reason = serializers.CharField(min_length=10)


class VitalsDataPointSerializer(serializers.Serializer):
    """Serializer for a single vitals data point in the aggregate history."""

    timestamp = serializers.CharField()
    source = serializers.CharField(allow_null=True, required=False)
    temperature = serializers.FloatField(allow_null=True, required=False)
    heart_rate = serializers.IntegerField(allow_null=True, required=False)
    spo2 = serializers.FloatField(allow_null=True, required=False)
    respiratory_rate = serializers.IntegerField(allow_null=True, required=False)
    systolic_bp = serializers.IntegerField(allow_null=True, required=False)
    diastolic_bp = serializers.IntegerField(allow_null=True, required=False)
    weight = serializers.FloatField(allow_null=True, required=False)
    height = serializers.FloatField(allow_null=True, required=False)
