"""Serializers for standalone Imaging operations."""

from datetime import date

from rest_framework import serializers

from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

from .models import ExternalImagingOrderRequest, WalkInImagingPatient


class WalkInImagingPatientSerializer(serializers.ModelSerializer):
    """Read serializer for walk-in imaging patients."""

    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(required=False, allow_blank=True, default="")

    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = WalkInImagingPatient
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


class WalkInImagingPatientCreateSerializer(serializers.ModelSerializer):
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    national_id = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = WalkInImagingPatient
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


class StandaloneImagingOrderItemSerializer(serializers.Serializer):
    """Item within a standalone imaging order."""

    procedure_code = serializers.CharField()
    laterality = serializers.ChoiceField(choices=["NA", "LEFT", "RIGHT", "BILATERAL"], default="NA")
    specific_instructions = serializers.CharField(required=False, default="")


class StandaloneImagingOrderCreateSerializer(serializers.Serializer):
    """
    Create a standalone imaging order (no encounter required).

    Accepts either a walk-in patient ID or inline patient details.
    """

    walkin_patient_id = serializers.IntegerField(
        required=False, help_text="Existing walk-in imaging patient"
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

    priority = serializers.ChoiceField(choices=["ROUTINE", "URGENT", "STAT"], default="ROUTINE")
    clinical_indication = serializers.CharField()
    relevant_clinical_history = serializers.CharField(required=False, default="")
    external_referring_facility = serializers.CharField(required=False, default="")
    external_referring_clinician = serializers.CharField(required=False, default="")
    items = StandaloneImagingOrderItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one imaging item is required.")
        return value

    def validate(self, data):
        if not (data.get("walkin_patient_id") or data.get("patient_id") or data.get("walkin_name")):
            raise serializers.ValidationError(
                "Provide walkin_patient_id, patient_id, or inline walk-in details (walkin_name)."
            )
        return data

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
        elif validated_data.get("walkin_patient_id"):
            try:
                walkin = WalkInImagingPatient.objects.get(id=validated_data["walkin_patient_id"])
            except WalkInImagingPatient.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"walkin_patient_id": "Walk-in patient not found."}
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

        order = ImagingOrder.objects.create(
            patient=patient,
            encounter=None,
            ordered_by=user,
            priority=validated_data.get("priority", "ROUTINE"),
            clinical_indication=validated_data["clinical_indication"],
            relevant_clinical_history=validated_data.get("relevant_clinical_history", ""),
            status="ORDERED",
            is_walkin=True,
            walkin_patient_name=walkin_name,
            walkin_patient_id=walkin_id_val,
            walkin_patient_phone=walkin_phone,
            walkin_patient_dob=walkin_dob,
            walkin_patient_gender=walkin_gender,
            external_referring_facility=validated_data.get("external_referring_facility", ""),
            external_referring_clinician=validated_data.get("external_referring_clinician", ""),
            bill_patient=False,
        )

        for item in items_data:
            try:
                procedure = ImagingProcedure.objects.get(code=item["procedure_code"])
            except ImagingProcedure.DoesNotExist as e:
                raise serializers.ValidationError(
                    {"items": f"Procedure with code '{item['procedure_code']}' not found."}
                ) from e

            ImagingOrderItem.objects.create(
                order=order,
                procedure=procedure,
                laterality=item.get("laterality", "NA"),
                specific_instructions=item.get("specific_instructions", ""),
                unit_cost=procedure.cost,
            )

        order.calculate_total_cost()
        return order


class ExternalImagingOrderRequestSerializer(serializers.ModelSerializer):
    """Read serializer for external imaging order requests."""

    class Meta:
        model = ExternalImagingOrderRequest
        fields = [
            "id",
            "message_control_id",
            "sending_application",
            "sending_facility",
            "referring_clinician",
            "referring_clinician_license",
            "external_patient_id",
            "patient_name",
            "patient_dob",
            "patient_gender",
            "patient_phone",
            "patient_id_number",
            "placer_order_number",
            "priority",
            "clinical_indication",
            "relevant_clinical_history",
            "requested_procedures",
            "status",
            "rejection_reason",
            "walkin_patient",
            "imaging_order",
            "processed_by",
            "processed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ExternalImagingOrderAcceptSerializer(serializers.Serializer):
    auto_create_walkin = serializers.BooleanField(
        default=True, help_text="Auto-create walk-in patient from external patient data"
    )


class ExternalImagingOrderRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(help_text="Reason for rejection")
