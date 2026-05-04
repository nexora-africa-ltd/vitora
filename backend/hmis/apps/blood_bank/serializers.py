"""Blood Bank serializers."""

from rest_framework import serializers

from .models import BloodDonor, BloodIssue, BloodRequest, BloodUnit, CrossMatch

# =============================================================================
# BloodDonor
# =============================================================================


class BloodDonorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BloodDonor
        fields = [
            "patient",
            "first_name",
            "last_name",
            "date_of_birth",
            "gender",
            "blood_group",
            "phone_number",
            "national_id",
            "notes",
        ]


class BloodDonorListSerializer(serializers.ModelSerializer):
    eligible_to_donate = serializers.BooleanField(read_only=True)

    class Meta:
        model = BloodDonor
        fields = [
            "id",
            "donor_number",
            "first_name",
            "last_name",
            "blood_group",
            "gender",
            "is_active",
            "last_donation_date",
            "total_donations",
            "eligible_to_donate",
            "created_at",
        ]


class BloodDonorDetailSerializer(serializers.ModelSerializer):
    eligible_to_donate = serializers.BooleanField(read_only=True)

    class Meta:
        model = BloodDonor
        fields = [
            "id",
            "donor_number",
            "patient",
            "first_name",
            "last_name",
            "date_of_birth",
            "gender",
            "blood_group",
            "phone_number",
            "national_id",
            "is_active",
            "last_donation_date",
            "total_donations",
            "eligible_to_donate",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["donor_number", "total_donations", "created_at", "updated_at"]


# =============================================================================
# BloodUnit
# =============================================================================


class BloodUnitCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BloodUnit
        fields = [
            "donor",
            "blood_group",
            "component",
            "collection_date",
            "expiry_date",
            "volume_ml",
            "storage_location",
            "notes",
        ]


class BloodUnitListSerializer(serializers.ModelSerializer):
    donor_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = BloodUnit
        fields = [
            "id",
            "unit_number",
            "donor",
            "donor_name",
            "blood_group",
            "component",
            "status",
            "collection_date",
            "expiry_date",
            "volume_ml",
            "is_expired",
            "is_available",
            "all_screens_negative",
            "created_at",
        ]

    def get_donor_name(self, obj):
        return f"{obj.donor.first_name} {obj.donor.last_name}"


class BloodUnitDetailSerializer(serializers.ModelSerializer):
    donor_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = BloodUnit
        fields = [
            "id",
            "unit_number",
            "donor",
            "donor_name",
            "blood_group",
            "component",
            "status",
            "collection_date",
            "expiry_date",
            "volume_ml",
            "storage_location",
            "hiv_screened",
            "hbv_screened",
            "hcv_screened",
            "syphilis_screened",
            "malaria_screened",
            "all_screens_negative",
            "is_expired",
            "is_available",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["unit_number", "created_at", "updated_at"]

    def get_donor_name(self, obj):
        return f"{obj.donor.first_name} {obj.donor.last_name}"


# =============================================================================
# BloodRequest
# =============================================================================


class BloodRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BloodRequest
        fields = [
            "patient",
            "encounter",
            "blood_group",
            "component",
            "units_requested",
            "urgency",
            "clinical_indication",
            "patient_hemoglobin",
            "notes",
        ]


class BloodRequestListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = [
            "id",
            "request_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "blood_group",
            "component",
            "units_requested",
            "urgency",
            "status",
            "requested_by_name",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username


class BloodRequestDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = [
            "id",
            "request_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "requested_by",
            "requested_by_name",
            "blood_group",
            "component",
            "units_requested",
            "urgency",
            "status",
            "clinical_indication",
            "patient_hemoglobin",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["request_number", "created_at", "updated_at"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username


# =============================================================================
# CrossMatch
# =============================================================================


class CrossMatchCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CrossMatch
        fields = ["blood_request", "blood_unit", "method", "notes"]


class CrossMatchSerializer(serializers.ModelSerializer):
    unit_number = serializers.CharField(source="blood_unit.unit_number", read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CrossMatch
        fields = [
            "id",
            "blood_request",
            "blood_unit",
            "unit_number",
            "performed_by",
            "performed_by_name",
            "result",
            "performed_at",
            "method",
            "notes",
        ]
        read_only_fields = ["performed_at"]

    def get_performed_by_name(self, obj):
        return obj.performed_by.get_full_name() or obj.performed_by.username


# =============================================================================
# BloodIssue
# =============================================================================


class BloodIssueCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BloodIssue
        fields = ["blood_request", "blood_unit", "crossmatch", "notes"]


class BloodIssueSerializer(serializers.ModelSerializer):
    unit_number = serializers.CharField(source="blood_unit.unit_number", read_only=True)
    issued_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BloodIssue
        fields = [
            "id",
            "blood_request",
            "blood_unit",
            "unit_number",
            "crossmatch",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "transfusion_started_at",
            "transfusion_completed_at",
            "transfusion_reaction",
            "reaction_details",
            "vital_signs_pre",
            "vital_signs_post",
            "notes",
        ]
        read_only_fields = ["issued_at"]

    def get_issued_by_name(self, obj):
        return obj.issued_by.get_full_name() or obj.issued_by.username


class BloodIssueCompleteSerializer(serializers.Serializer):
    """Serializer for completing a transfusion."""

    reaction = serializers.ChoiceField(
        choices=[
            ("NONE", "None"),
            ("FEBRILE", "Febrile"),
            ("ALLERGIC", "Allergic"),
            ("HEMOLYTIC_ACUTE", "Acute Hemolytic"),
            ("HEMOLYTIC_DELAYED", "Delayed Hemolytic"),
            ("ANAPHYLACTIC", "Anaphylactic"),
            ("TACO", "TACO"),
            ("TRALI", "TRALI"),
        ],
        default="NONE",
    )
    details = serializers.CharField(required=False, allow_blank=True)
