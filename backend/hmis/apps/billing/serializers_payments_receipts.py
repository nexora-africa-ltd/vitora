# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing serializers payments receipts for Vitora HMIS.

What this file is for:
- Implement serializers payments receipts logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from hmis.apps.billing.models import CreditNote, Payment, PaymentPoint, Receipt
from hmis.apps.core.qr_utils import generate_qr_data_uri, generate_receipt_qr_url


class PaymentPointSerializer(serializers.ModelSerializer):
    """Serializer for PaymentPoint model."""

    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = PaymentPoint
        fields = [
            "id",
            "name",
            "code",
            "method",
            "till_number",
            "paybill_number",
            "paybill_account_number",
            "bank_name",
            "bank_account_name",
            "bank_account_number",
            "bank_branch",
            "is_active",
            "notes",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)

    def validate_code(self, value):
        """Ensure code is unique within the facility."""
        request = self.context.get("request")
        facility = getattr(request, "facility", None) if request else None
        qs = PaymentPoint.objects.filter(code=value, facility=facility)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("payment point with this code already exists.")
        return value


class PaymentReverseSerializer(serializers.Serializer):
    """Serializer for the payment reverse action."""

    reason = serializers.CharField(
        required=True,
        min_length=3,
        max_length=500,
        help_text="Reason for reversing this payment",
    )


class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for Payment model."""

    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    received_by_username = serializers.CharField(source="received_by.username", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "payment_reference",
            "invoice",
            "invoice_number",
            "method",
            "payment_point",
            "payment_details",
            "amount",
            "status",
            "mpesa_receipt_number",
            "mpesa_transaction_id",
            "mpesa_phone",
            "notes",
            "received_by",
            "received_by_username",
            "payment_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "payment_reference",
            "status",
            "received_by",
            "received_by_username",
            "payment_date",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        method = attrs.get("method")
        payment_point = attrs.get("payment_point")

        if method in [Payment.Method.MPESA, Payment.Method.BANK_TRANSFER] and not payment_point:
            raise serializers.ValidationError(
                {"payment_point": "Payment point is required for M-Pesa and bank transfers."}
            )

        if payment_point and method and payment_point.method != method:
            raise serializers.ValidationError(
                {"payment_point": "Payment point method must match payment method."}
            )

        return attrs

    def create(self, validated_data):
        # Set received_by from request user
        validated_data["received_by"] = self.context["request"].user
        # Create payment and process it
        try:
            payment = super().create(validated_data)
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise serializers.ValidationError(exc.message_dict) from exc
            raise serializers.ValidationError(exc.messages) from exc
        payment.process()
        return payment


class ReceiptLineItemSerializer(serializers.Serializer):
    """Serializer for receipt line items (from invoice items)."""

    description = serializers.CharField()
    quantity = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2)


class ReceiptSerializer(serializers.ModelSerializer):
    """Serializer for Receipt model."""

    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    issued_by_username = serializers.CharField(source="issued_by.username", read_only=True)
    # Fields from related Payment
    received_by_username = serializers.SerializerMethodField()
    payment_point_name = serializers.SerializerMethodField()
    payment_point_code = serializers.SerializerMethodField()
    receipt_date = serializers.DateTimeField(read_only=True)
    # Line items from invoice
    line_items = serializers.SerializerMethodField()
    # QR code for validation
    qr_code = serializers.SerializerMethodField()
    # M-Pesa details (phone obscured for privacy)
    mpesa_phone_display = serializers.SerializerMethodField()
    mpesa_receipt_number = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = [
            "id",
            "receipt_number",
            "receipt_date",
            "payment",
            "invoice",
            "patient",
            "patient_name",
            "patient_mrn",
            "amount",
            "amount_in_words",
            "payment_method",
            "facility_name",
            "facility_address",
            "facility_phone",
            "facility_kra_pin",
            "is_voided",
            "voided_at",
            "void_reason",
            "issued_by",
            "issued_by_username",
            "received_by_username",
            "payment_point_name",
            "payment_point_code",
            "line_items",
            "qr_code",
            "mpesa_phone_display",
            "mpesa_receipt_number",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "receipt_number",
            "receipt_date",
            "amount_in_words",
            "is_voided",
            "voided_at",
            "void_reason",
            "issued_by",
            "issued_by_username",
            "received_by_username",
            "payment_point_name",
            "payment_point_code",
            "line_items",
            "qr_code",
            "mpesa_phone_display",
            "mpesa_receipt_number",
            "created_at",
        ]

    def get_mpesa_phone_display(self, obj) -> str | None:
        """Return obscured M-Pesa phone number, e.g. 0712****5678."""
        if not obj.payment or not obj.payment.mpesa_phone:
            return None
        phone = obj.payment.mpesa_phone
        # Normalise to 07XX format for display
        if phone.startswith("254") and len(phone) == 12:
            phone = "0" + phone[3:]
        if len(phone) >= 8:
            # Show first 4 and last 4, mask the middle
            visible = 4
            return phone[:visible] + "*" * (len(phone) - visible * 2) + phone[-visible:]
        return phone

    def get_mpesa_receipt_number(self, obj) -> str | None:
        """Return M-Pesa receipt/transaction number from the payment."""
        if not obj.payment:
            return None
        return obj.payment.mpesa_receipt_number or None

    def get_qr_code(self, obj) -> str:
        """Generate QR code data URI containing a verification URL."""
        verification_url = generate_receipt_qr_url(
            receipt_number=obj.receipt_number,
            amount=str(obj.amount),
            receipt_date=obj.receipt_date.isoformat() if obj.receipt_date else "",
        )
        return generate_qr_data_uri(verification_url)

    def get_line_items(self, obj) -> list[dict]:
        """Get line items from the related invoice."""
        if obj.invoice:
            items = obj.invoice.items.all()
            return ReceiptLineItemSerializer(items, many=True).data
        return []

    def get_received_by_username(self, obj) -> str | None:
        """Get username of the person who received the payment."""
        if obj.payment and obj.payment.received_by:
            return obj.payment.received_by.username
        return None

    def get_payment_point_name(self, obj) -> str | None:
        """Get payment point name (e.g., 'Main Cashier', 'M-Pesa Till 1')."""
        if obj.payment and obj.payment.payment_point:
            return obj.payment.payment_point.name
        return None

    def get_payment_point_code(self, obj) -> str | None:
        """Get payment point code (e.g., 'CASH-01', 'MPESA-02')."""
        if obj.payment and obj.payment.payment_point:
            return obj.payment.payment_point.code
        return None


class CreditNoteSerializer(serializers.ModelSerializer):
    """Serializer for CreditNote model."""

    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    approved_by_username = serializers.CharField(
        source="approved_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = CreditNote
        fields = [
            "id",
            "credit_note_number",
            "invoice",
            "invoice_number",
            "patient",
            "patient_name",
            "amount",
            "reason",
            "reason_detail",
            "status",
            "refund_method",
            "refund_reference",
            "requested_by",
            "requested_by_username",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "refunded_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "credit_note_number",
            "status",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "refunded_at",
            "requested_by",
            "requested_by_username",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        # Set requested_by from request user
        validated_data["requested_by"] = self.context["request"].user
        return super().create(validated_data)


# ============================================================================
# Facility Billing Config Serializers
# ============================================================================
