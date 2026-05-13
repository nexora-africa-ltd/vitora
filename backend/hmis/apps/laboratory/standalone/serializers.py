"""Serializers for standalone LIS operations."""

from rest_framework import serializers

from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog

from .models import ExternalOrderRequest, WalkInPatient


class WalkInPatientSerializer(serializers.ModelSerializer):
    """Read serializer for walk-in patients."""

    # PII property fields (encrypted at rest)
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(required=False, allow_blank=True, default="")

    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = WalkInPatient
        fields = [
            "id",
            "registration_number",
            "first_name",
            "last_name",
            "full_name",
            "date_of_birth",
            "gender",
            "phone_number",
            "email",
            "national_id",
            "id_type",
            "referring_facility",
            "referring_clinician",
            "linked_patient",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "registration_number", "created_at", "updated_at"]


class WalkInPatientCreateSerializer(serializers.ModelSerializer):
    """Create serializer for walk-in patient registration."""

    # PII property fields (encrypted at rest)
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = WalkInPatient
        fields = [
            "first_name",
            "last_name",
            "date_of_birth",
            "gender",
            "phone_number",
            "email",
            "national_id",
            "id_type",
            "referring_facility",
            "referring_clinician",
        ]

    def validate_date_of_birth(self, value):
        if value:
            from datetime import date

            if value > date.today():
                raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value


class StandaloneOrderItemSerializer(serializers.Serializer):
    """Item within a standalone lab order."""

    test_code = serializers.CharField()
    special_instructions = serializers.CharField(required=False, default="")


class StandaloneOrderCreateSerializer(serializers.Serializer):
    """
    Create a standalone lab order (no encounter required).

    Accepts either a walk-in patient ID or inline patient details.
    """

    # Patient reference (one of these is required)
    walkin_patient_id = serializers.IntegerField(
        required=False, help_text="Existing walk-in patient"
    )
    patient_id = serializers.IntegerField(
        required=False, help_text="Existing HMIS patient (optional)"
    )

    # Inline walk-in details (used if neither walkin_patient_id nor patient_id provided)
    walkin_name = serializers.CharField(required=False, help_text="Walk-in patient full name")
    walkin_phone = serializers.CharField(required=False, default="")
    walkin_national_id = serializers.CharField(required=False, default="")
    walkin_dob = serializers.DateField(required=False, allow_null=True)
    walkin_gender = serializers.ChoiceField(
        choices=[("M", "Male"), ("F", "Female"), ("O", "Other")],
        required=False,
        default="",
    )

    # Order details
    priority = serializers.ChoiceField(choices=["ROUTINE", "URGENT", "STAT"], default="ROUTINE")
    clinical_notes = serializers.CharField(required=False, default="")
    referring_clinician = serializers.CharField(required=False, default="")
    items = StandaloneOrderItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one test item is required.")
        return value

    def validate(self, data):
        has_walkin_id = "walkin_patient_id" in data and data["walkin_patient_id"]
        has_patient_id = "patient_id" in data and data["patient_id"]
        has_inline = "walkin_name" in data and data["walkin_name"]

        if not has_walkin_id and not has_patient_id and not has_inline:
            raise serializers.ValidationError(
                "Provide walkin_patient_id, patient_id, or inline patient details (walkin_name)."
            )
        return data

    def create(self, validated_data):
        """Create standalone lab order with walk-in patient resolution."""
        items_data = validated_data.pop("items")
        request = self.context["request"]
        user = request.user

        # Resolve patient
        patient = None
        walkin_patient_name = ""
        walkin_patient_id_val = ""
        walkin_patient_phone = ""
        walkin_patient_dob = None
        walkin_patient_gender = ""

        if validated_data.get("patient_id"):
            from hmis.apps.patients.models import Patient

            try:
                patient = Patient.objects.get(id=validated_data["patient_id"])
            except Patient.DoesNotExist as e:
                raise serializers.ValidationError({"patient_id": "Patient not found."}) from e
        elif validated_data.get("walkin_patient_id"):
            try:
                walkin = WalkInPatient.objects.get(id=validated_data["walkin_patient_id"])
                walkin_patient_name = walkin.full_name
                walkin_patient_id_val = walkin.national_id
                walkin_patient_phone = walkin.phone_number
                walkin_patient_dob = walkin.date_of_birth
                walkin_patient_gender = walkin.gender
                # If the walk-in is linked to a full patient, use that
                if walkin.linked_patient:
                    patient = walkin.linked_patient
            except WalkInPatient.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"walkin_patient_id": "Walk-in patient not found."}
                ) from e
        else:
            # Inline walk-in
            walkin_patient_name = validated_data.get("walkin_name", "")
            walkin_patient_phone = validated_data.get("walkin_phone", "")
            walkin_patient_id_val = validated_data.get("walkin_national_id", "")
            walkin_patient_dob = validated_data.get("walkin_dob")
            walkin_patient_gender = validated_data.get("walkin_gender", "")

        # Create the lab order
        order = LabOrder.objects.create(
            patient=patient,
            encounter=None,
            ordered_by=user,
            order_type="IN_HOUSE",
            priority=validated_data.get("priority", "ROUTINE"),
            clinical_notes=validated_data.get("clinical_notes", ""),
            is_walkin=True,
            walkin_patient_name=walkin_patient_name,
            walkin_patient_id=walkin_patient_id_val,
            walkin_patient_phone=walkin_patient_phone,
            walkin_patient_dob=walkin_patient_dob,
            walkin_patient_gender=walkin_patient_gender,
            bill_patient=False,  # Standalone orders don't auto-bill
            **self.context.get("tenant_kwargs", {}),
        )

        # Create order items
        for item_data in items_data:
            test_code = item_data["test_code"]
            try:
                test = TestCatalog.objects.get(code=test_code)
            except TestCatalog.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"items": f"Test with code '{test_code}' not found in catalog."}
                ) from e

            LabOrderItem.objects.create(
                lab_order=order,
                test=test,
                unit_cost=test.cost,
                special_instructions=item_data.get("special_instructions", ""),
            )

        order.calculate_total_cost()
        return order


class ExternalOrderRequestSerializer(serializers.ModelSerializer):
    """Read serializer for external order requests."""

    class Meta:
        model = ExternalOrderRequest
        fields = [
            "id",
            "message_control_id",
            "sending_application",
            "sending_facility",
            "external_patient_id",
            "patient_name",
            "patient_dob",
            "patient_gender",
            "patient_id_number",
            "placer_order_number",
            "order_priority",
            "clinical_info",
            "requested_tests",
            "status",
            "rejection_reason",
            "walkin_patient",
            "lab_order",
            "processed_by",
            "processed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ExternalOrderAcceptSerializer(serializers.Serializer):
    """Accept an external order request and create a lab order."""

    auto_create_walkin = serializers.BooleanField(
        default=True, help_text="Auto-create walk-in patient from external patient data"
    )


class ExternalOrderRejectSerializer(serializers.Serializer):
    """Reject an external order request."""

    reason = serializers.CharField(help_text="Reason for rejection")
