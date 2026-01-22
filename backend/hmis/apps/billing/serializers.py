"""
Serializers for the billing app.

Following TDD - implemented to pass API tests.
"""

from rest_framework import serializers

from hmis.apps.billing.models import (
    PaymentPoint,
    CreditNote,
    Invoice,
    InvoiceItem,
    Payment,
    Receipt,
    Service,
    ServiceCategory,
)
from hmis.apps.core.qr_utils import (
    generate_qr_data_uri,
    generate_receipt_qr_url,
    generate_invoice_qr_url,
)


class ServiceCategorySerializer(serializers.ModelSerializer):
    """Serializer for ServiceCategory model."""

    class Meta:
        model = ServiceCategory
        fields = [
            "id",
            "code",
            "name",
            "description",
            "display_order",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ServiceSerializer(serializers.ModelSerializer):
    """Serializer for Service model."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    is_available = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "code",
            "name",
            "description",
            "category",
            "category_name",
            "unit_price",
            "sha_code",
            "icd10_code",
            "is_taxable",
            "requires_quantity",
            "is_active",
            "is_available",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_by_username",
            "is_available",
            "created_at",
            "updated_at",
        ]

    def get_is_available(self, obj):
        """Return is_available status from method."""
        return obj.is_available()

    def create(self, validated_data):
        # Set created_by from request user
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Serializer for InvoiceItem model."""

    service_name = serializers.CharField(source="service.name", read_only=True, allow_null=True)

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "invoice",
            "service",
            "service_name",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "line_total",
            "is_covered_by_insurance",
            "insurance_approved_amount",
            "sha_code",
            "created_at",
        ]
        read_only_fields = ["id", "invoice", "line_total", "created_at"]


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer for Invoice model."""

    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    balance = serializers.SerializerMethodField()
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    
    # Proforma-specific fields
    is_valid = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    can_convert = serializers.BooleanField(read_only=True)
    
    # QR code for validation
    qr_code = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "invoice_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "invoice_date",
            "due_date",
            "status",
            "payment_type",
            "subtotal",
            "discount_amount",
            "discount_reason",
            "tax_amount",
            "total_amount",
            "amount_paid",
            "balance",
            "balance_due",
            "insurance_provider",
            "insurance_member_no",
            "sha_claim_number",
            "insurance_amount",
            "notes",
            "cancellation_reason",
            "cancelled_by",
            "cancelled_at",
            # Proforma fields
            "valid_until",
            "is_converted",
            "converted_at",
            "converted_from_proforma",
            "is_valid",
            "days_until_expiry",
            "can_convert",
            # Audit
            "created_by",
            "created_by_username",
            "items",
            "qr_code",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice_number",
            "subtotal",
            "tax_amount",
            "total_amount",
            "amount_paid",
            "balance",
            "balance_due",
            "cancelled_by",
            "cancelled_at",
            "is_converted",
            "converted_at",
            "converted_from_proforma",
            "is_valid",
            "days_until_expiry",
            "can_convert",
            "created_by",
            "created_by_username",
            "items",
            "qr_code",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {"due_date": {"required": False}, "invoice_date": {"required": False}}

    def get_balance(self, obj):
        """Calculate balance dynamically."""
        return obj.total_amount - obj.amount_paid

    def get_qr_code(self, obj) -> str:
        """Generate QR code data URI containing a verification URL."""
        verification_url = generate_invoice_qr_url(
            invoice_number=obj.invoice_number,
            total_amount=str(obj.total_amount),
            invoice_date=obj.invoice_date.isoformat() if obj.invoice_date else "",
        )
        return generate_qr_data_uri(verification_url)

    def create(self, validated_data):
        # Set created_by from request user
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


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
        payment = super().create(validated_data)
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
            "created_at",
        ]

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
