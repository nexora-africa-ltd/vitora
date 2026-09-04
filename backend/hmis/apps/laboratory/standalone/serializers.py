# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Serializers for standalone LIS operations."""

from rest_framework import serializers

from hmis.apps.billing.models import Invoice
from hmis.apps.core.models import ExternalCodeMapping
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog

from .models import (
    ExternalOrderRequest,
    ExternalPatientIdentifierCrosswalk,
    InboundIngestionEvent,
    ResultDeliveryLog,
    WalkInPatient,
)


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
    enable_billing = serializers.BooleanField(required=False, default=True)
    payer_type = serializers.ChoiceField(
        choices=Invoice.PayerType.choices,
        required=False,
        default=Invoice.PayerType.CASH,
    )
    diagnostic_package = serializers.ChoiceField(
        choices=[
            ("", "None"),
            ("BASIC", "Basic"),
            ("COMPREHENSIVE", "Comprehensive"),
            ("EMPLOYMENT", "Employment"),
            ("REFERRAL", "Referral"),
        ],
        required=False,
        allow_blank=True,
        default="",
    )
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
        enable_billing = validated_data.pop("enable_billing", True)
        payer_type = validated_data.pop("payer_type", Invoice.PayerType.CASH)
        diagnostic_package = validated_data.pop("diagnostic_package", "")

        from .services import apply_diagnostic_billing_rules, ensure_walkin_has_billing_patient

        # Resolve patient
        patient = None
        billing_patient = None
        walkin_patient_name = ""
        walkin_patient_id_val = ""
        walkin_patient_phone = ""
        walkin_patient_dob = None
        walkin_patient_gender = ""
        walkin = None

        if validated_data.get("patient_id"):
            from hmis.apps.patients.models import Patient

            try:
                patient = Patient.objects.get(id=validated_data["patient_id"])
                billing_patient = patient
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
                    billing_patient = walkin.linked_patient
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
            walkin = WalkInPatient.objects.create(
                first_name=walkin_patient_name.split(" ")[0],
                last_name=" ".join(walkin_patient_name.split(" ")[1:]).strip(),
                date_of_birth=walkin_patient_dob,
                gender=walkin_patient_gender,
                phone_number=walkin_patient_phone,
                national_id=walkin_patient_id_val,
                registered_by=user,
                **self.context.get("tenant_kwargs", {}),
            )

        if enable_billing and billing_patient is None and walkin is not None:
            billing_patient = ensure_walkin_has_billing_patient(walkin, user)
            if patient is None:
                patient = billing_patient

        if enable_billing and billing_patient is None:
            raise serializers.ValidationError(
                {
                    "patient_id": (
                        "Billable standalone orders require an HMIS patient or walk-in details "
                        "that can be promoted to an HMIS patient."
                    )
                }
            )

        # Create the lab order
        order = LabOrder.objects.create(
            patient=patient,
            billing_patient=billing_patient,
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
            bill_patient=enable_billing,
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

        order.status = "ORDERED"
        order.calculate_total_cost()
        order.save(update_fields=["status", "total_cost", "updated_at"])

        if enable_billing:
            apply_diagnostic_billing_rules(
                lab_order=order,
                payer_type=payer_type,
                diagnostic_package=diagnostic_package,
            )
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
    enable_billing = serializers.BooleanField(default=True)
    payer_type = serializers.ChoiceField(
        choices=Invoice.PayerType.choices,
        required=False,
        default=Invoice.PayerType.CASH,
    )
    diagnostic_package = serializers.ChoiceField(
        choices=[
            ("", "None"),
            ("BASIC", "Basic"),
            ("COMPREHENSIVE", "Comprehensive"),
            ("EMPLOYMENT", "Employment"),
            ("REFERRAL", "Referral"),
        ],
        required=False,
        allow_blank=True,
        default="",
    )


class ExternalOrderRejectSerializer(serializers.Serializer):
    """Reject an external order request."""

    reason = serializers.CharField(help_text="Reason for rejection")


class InboundOrderIngestSerializer(serializers.Serializer):
    """Inbound order payload for standalone interop endpoint."""

    source_system = serializers.CharField(max_length=100)
    channel = serializers.ChoiceField(choices=["API", "HL7"], default="API")
    message_format = serializers.ChoiceField(choices=["HL7", "JSON"], default="HL7")
    hl7_message = serializers.CharField(required=False, allow_blank=False)
    payload = serializers.JSONField(required=False)

    def validate(self, attrs):
        message_format = attrs.get("message_format", "HL7")
        if message_format == "HL7" and not attrs.get("hl7_message"):
            raise serializers.ValidationError({"hl7_message": "This field is required for HL7."})
        if message_format == "JSON" and attrs.get("payload") is None:
            raise serializers.ValidationError({"payload": "This field is required for JSON."})
        return attrs


class InboundIngestionEventSerializer(serializers.ModelSerializer):
    """Read serializer for inbound ingestion events / dead-letter queue."""

    class Meta:
        model = InboundIngestionEvent
        fields = [
            "id",
            "trace_id",
            "source_system",
            "channel",
            "idempotency_key",
            "status",
            "error_message",
            "replay_count",
            "last_replayed_at",
            "processed_at",
            "external_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ExternalPatientIdentifierCrosswalkSerializer(serializers.ModelSerializer):
    """Read serializer for external patient identifier crosswalk entries."""

    class Meta:
        model = ExternalPatientIdentifierCrosswalk
        fields = [
            "id",
            "source_system",
            "external_patient_id",
            "external_member_id",
            "patient_name_snapshot",
            "walkin_patient",
            "patient",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ResultDeliveryRequestSerializer(serializers.Serializer):
    """Request payload for outbound result delivery actions."""

    channel = serializers.ChoiceField(choices=ResultDeliveryLog.Channel.choices)
    destination = serializers.CharField(required=False, allow_blank=True, default="")


class ResultDeliveryLogSerializer(serializers.ModelSerializer):
    """Read serializer for outbound result delivery logs."""

    class Meta:
        model = ResultDeliveryLog
        fields = [
            "id",
            "trace_id",
            "channel",
            "status",
            "destination",
            "external_order",
            "lab_order",
            "requested_by",
            "response_status_code",
            "response_body",
            "error_message",
            "attempt_count",
            "delivered_at",
            "pdf_filename",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class LISMessageMappingSerializer(serializers.ModelSerializer):
    """Serializer for standalone LIS message mapping configuration entries."""

    test_id = serializers.IntegerField(source="object_id", read_only=True)
    test_code = serializers.SerializerMethodField()
    test_name = serializers.SerializerMethodField()

    class Meta:
        model = ExternalCodeMapping
        fields = [
            "id",
            "code_system",
            "external_code",
            "external_display",
            "relationship",
            "is_active",
            "notes",
            "test_id",
            "test_code",
            "test_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "test_id", "test_code", "test_name", "created_at", "updated_at"]

    def get_test_code(self, obj):
        internal = getattr(obj, "internal_object", None)
        if isinstance(internal, TestCatalog):
            return internal.code
        return None

    def get_test_name(self, obj):
        internal = getattr(obj, "internal_object", None)
        if isinstance(internal, TestCatalog):
            return internal.name
        return None


class LISMessageMappingUpsertSerializer(serializers.Serializer):
    """Create/update payload for LIS message mapping entries."""

    code_system = serializers.CharField(max_length=100)
    external_code = serializers.CharField(max_length=100)
    external_display = serializers.CharField(required=False, allow_blank=True, default="")
    relationship = serializers.ChoiceField(choices=["EQUIVALENT", "BROADER", "NARROWER", "RELATED"])
    is_active = serializers.BooleanField(default=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    test_code = serializers.CharField(max_length=50)


class LISMessageMappingValidationSerializer(serializers.Serializer):
    """Validation payload for inbound message-to-test mapping preview."""

    source_system = serializers.CharField(max_length=100)
    message_format = serializers.ChoiceField(choices=["HL7", "JSON"])
    hl7_message = serializers.CharField(required=False)
    payload = serializers.JSONField(required=False)

    def validate(self, attrs):
        fmt = attrs.get("message_format")
        if fmt == "HL7" and not attrs.get("hl7_message"):
            raise serializers.ValidationError({"hl7_message": "This field is required for HL7."})
        if fmt == "JSON" and attrs.get("payload") is None:
            raise serializers.ValidationError({"payload": "This field is required for JSON."})
        return attrs
