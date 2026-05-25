"""Serializers for standalone Pharmacy operations."""

from datetime import date, timedelta

from rest_framework import serializers

from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

from .models import ExternalPrescriptionRequest, WalkInCustomer


class WalkInCustomerSerializer(serializers.ModelSerializer):
    """Read serializer for walk-in pharmacy customers."""

    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(required=False, allow_blank=True, default="")

    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = WalkInCustomer
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


class WalkInCustomerCreateSerializer(serializers.ModelSerializer):
    """Create serializer for walk-in pharmacy customer registration."""

    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = WalkInCustomer
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
        if value and value > date.today():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value


class StandalonePrescriptionItemSerializer(serializers.Serializer):
    """Item within a standalone prescription."""

    drug_id = serializers.IntegerField(required=False)
    drug_code = serializers.CharField(required=False)
    dosage = serializers.CharField(help_text="e.g., '1 tablet'")
    frequency = serializers.CharField(help_text="e.g., '3 times daily'")
    duration = serializers.CharField(help_text="e.g., '7 days'")
    quantity = serializers.IntegerField(min_value=1)
    route = serializers.CharField(required=False, default="")
    instructions = serializers.CharField(required=False, default="")

    def validate(self, data):
        if not data.get("drug_id") and not data.get("drug_code"):
            raise serializers.ValidationError("Provide drug_id or drug_code.")
        return data


class StandalonePrescriptionCreateSerializer(serializers.Serializer):
    """
    Create a standalone pharmacy prescription (no encounter required).

    Accepts either a walk-in customer ID or inline customer details.
    """

    walkin_customer_id = serializers.IntegerField(
        required=False, help_text="Existing walk-in customer"
    )
    patient_id = serializers.IntegerField(
        required=False, help_text="Existing HMIS patient (optional)"
    )

    # Inline walk-in details
    walkin_name = serializers.CharField(required=False)
    walkin_phone = serializers.CharField(required=False, default="")
    walkin_national_id = serializers.CharField(required=False, default="")
    walkin_dob = serializers.DateField(required=False, allow_null=True)
    walkin_gender = serializers.ChoiceField(
        choices=[("M", "Male"), ("F", "Female"), ("O", "Other")],
        required=False,
        default="",
    )

    external_prescription_number = serializers.CharField(required=False, default="")
    prescriber_name = serializers.CharField(required=False, default="")
    clinical_notes = serializers.CharField(required=False, default="")
    valid_days = serializers.IntegerField(required=False, default=30, min_value=1)

    items = StandalonePrescriptionItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one prescription item is required.")
        return value

    def validate(self, data):
        has_walkin = data.get("walkin_customer_id")
        has_patient = data.get("patient_id")
        has_inline = data.get("walkin_name")
        if not (has_walkin or has_patient or has_inline):
            raise serializers.ValidationError(
                "Provide walkin_customer_id, patient_id, or inline walk-in details (walkin_name)."
            )
        return data

    def _resolve_drug(self, item):
        if item.get("drug_id"):
            try:
                return Drug.objects.get(id=item["drug_id"])
            except Drug.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"items": f"Drug with id {item['drug_id']} not found."}
                ) from e
        if item.get("drug_code"):
            try:
                return Drug.objects.get(code=item["drug_code"])
            except Drug.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"items": f"Drug with code '{item['drug_code']}' not found."}
                ) from e
        return None

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        request = self.context["request"]
        user = request.user

        patient = None
        walkin_name = ""
        walkin_id_val = ""
        walkin_phone = ""
        walkin_dob = None
        walkin_gender = ""

        if validated_data.get("patient_id"):
            from hmis.apps.patients.models import Patient

            try:
                patient = Patient.objects.get(id=validated_data["patient_id"])
            except Patient.DoesNotExist as e:
                raise serializers.ValidationError({"patient_id": "Patient not found."}) from e
        elif validated_data.get("walkin_customer_id"):
            try:
                walkin = WalkInCustomer.objects.get(id=validated_data["walkin_customer_id"])
            except WalkInCustomer.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"walkin_customer_id": "Walk-in customer not found."}
                ) from e
            walkin_name = walkin.full_name
            walkin_id_val = walkin.national_id
            walkin_phone = walkin.phone_number
            walkin_dob = walkin.date_of_birth
            walkin_gender = walkin.gender
            if walkin.linked_patient:
                patient = walkin.linked_patient
        else:
            walkin_name = validated_data.get("walkin_name", "")
            walkin_phone = validated_data.get("walkin_phone", "")
            walkin_id_val = validated_data.get("walkin_national_id", "")
            walkin_dob = validated_data.get("walkin_dob")
            walkin_gender = validated_data.get("walkin_gender", "")

        valid_days = validated_data.get("valid_days", 30)

        prescription = Prescription.objects.create(
            patient=patient,
            encounter=None,
            prescribed_by=user,
            valid_until=date.today() + timedelta(days=valid_days),
            clinical_notes=validated_data.get("clinical_notes", ""),
            is_walkin=True,
            walkin_customer_name=walkin_name,
            walkin_customer_id=walkin_id_val,
            walkin_customer_phone=walkin_phone,
            walkin_customer_dob=walkin_dob,
            walkin_customer_gender=walkin_gender,
            external_prescription_number=validated_data.get("external_prescription_number", ""),
            bill_patient=False,
            **self.context.get("tenant_kwargs", {}),
        )

        for item in items_data:
            drug = self._resolve_drug(item)
            if drug is None:
                continue
            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=drug,
                dosage=item["dosage"],
                frequency=item["frequency"],
                duration=item["duration"],
                quantity=item["quantity"],
                route=item.get("route", ""),
                instructions=item.get("instructions", ""),
            )

        return prescription


class ExternalPrescriptionRequestSerializer(serializers.ModelSerializer):
    """Read serializer for external prescription requests."""

    class Meta:
        model = ExternalPrescriptionRequest
        fields = [
            "id",
            "message_control_id",
            "sending_application",
            "sending_facility",
            "prescriber_name",
            "prescriber_license",
            "external_patient_id",
            "patient_name",
            "patient_dob",
            "patient_gender",
            "patient_phone",
            "patient_id_number",
            "external_prescription_number",
            "priority",
            "clinical_info",
            "requested_items",
            "status",
            "rejection_reason",
            "walkin_customer",
            "prescription",
            "processed_by",
            "processed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ExternalPrescriptionAcceptSerializer(serializers.Serializer):
    """Accept an external prescription request and create a Prescription."""

    auto_create_walkin = serializers.BooleanField(
        default=True, help_text="Auto-create walk-in customer from external patient data"
    )


class ExternalPrescriptionRejectSerializer(serializers.Serializer):
    """Reject an external prescription request."""

    reason = serializers.CharField(help_text="Reason for rejection")
