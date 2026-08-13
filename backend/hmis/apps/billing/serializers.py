# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Serializers for the billing app.

Following TDD - implemented to pass API tests.
"""

from decimal import Decimal

from rest_framework import serializers

from hmis.apps.billing.models import (
    BillingAutomationRule,
    CreditNote,
    Invoice,
    InvoiceItem,
    InvoicePayer,
    Payment,
    PaymentPoint,
    Receipt,
    Service,
    ServiceCategory,
)
from hmis.apps.billing.services.price_resolver import (
    BillingPriceResolver,
    CatalogItemInactive,
    CatalogItemNotFound,
    PriceNotConfigured,
    ResolvePriceRequest,
)
from hmis.apps.core.qr_utils import (
    generate_invoice_qr_url,
    generate_qr_data_uri,
    generate_receipt_qr_url,
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
            "currency",
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

    def get_is_available(self, obj) -> bool:
        """Return is_available status from method."""
        return obj.is_available()

    def create(self, validated_data):
        # Set created_by from request user
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class BillingCatalogItemSerializer(serializers.Serializer):
    """Unified billable-catalog row for invoice item creation UX."""

    kind = serializers.ChoiceField(
        choices=["service", "procedure_catalog", "lab_test_catalog", "imaging_procedure"]
    )
    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=True)
    sha_code = serializers.CharField(allow_blank=True)
    item_type = serializers.CharField()
    service_id = serializers.IntegerField(allow_null=True)


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Serializer for InvoiceItem model."""

    service_name = serializers.CharField(source="service.name", read_only=True, allow_null=True)
    drug_name = serializers.CharField(source="drug.name", read_only=True, allow_null=True)
    lab_order_name = serializers.SerializerMethodField()
    surgery_case_number = serializers.CharField(
        source="surgery_case.case_number", read_only=True, allow_null=True
    )
    # Alias discount_amount as discount_percentage for frontend compatibility
    discount_percentage = serializers.DecimalField(
        source="discount_amount", max_digits=10, decimal_places=2, read_only=True
    )
    catalog_ref = serializers.JSONField(write_only=True, required=False)
    price_mode = serializers.ChoiceField(
        choices=["catalog", "override"],
        write_only=True,
        required=False,
        default="catalog",
    )
    unit_price_override = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        write_only=True,
        required=False,
        allow_null=True,
    )
    override_reason = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=200,
    )

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "invoice",
            "service",
            "service_name",
            "drug",
            "drug_name",
            "lab_order",
            "lab_order_name",
            "surgery_case",
            "surgery_case_number",
            "theatre_consumable",
            "inpatient_consumable_usage",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "discount_percentage",
            "line_total",
            "is_covered_by_insurance",
            "insurance_approved_amount",
            "sha_code",
            "catalog_ref",
            "price_mode",
            "unit_price_override",
            "override_reason",
            "is_converted",
            "converted_at",
            "converted_from_item",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "description": {"required": False},
            "unit_price": {"required": False},
        }
        read_only_fields = [
            "id",
            "invoice",
            "line_total",
            "discount_percentage",
            "surgery_case_number",
            "is_converted",
            "converted_at",
            "converted_from_item",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        catalog_ref = attrs.get("catalog_ref")

        if catalog_ref is not None:
            if not isinstance(catalog_ref, dict):
                raise serializers.ValidationError(
                    {"catalog_ref": "catalog_ref must be an object with kind and id."}
                )

            kind = str(catalog_ref.get("kind") or "").strip()
            if kind not in {
                "service",
                "procedure_catalog",
                "lab_test_catalog",
                "imaging_procedure",
            }:
                raise serializers.ValidationError(
                    {
                        "catalog_ref": "catalog_ref.kind must be one of: service, procedure_catalog, lab_test_catalog, imaging_procedure."
                    }
                )

            try:
                catalog_id = int(catalog_ref.get("id"))
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    {"catalog_ref": "catalog_ref.id must be an integer."}
                ) from exc

            if catalog_id <= 0:
                raise serializers.ValidationError(
                    {"catalog_ref": "catalog_ref.id must be greater than 0."}
                )

            attrs["catalog_ref"] = {"kind": kind, "id": catalog_id}

            if attrs.get("price_mode") == "override":
                unit_price_override = attrs.get("unit_price_override")
                if unit_price_override is None:
                    raise serializers.ValidationError(
                        {
                            "unit_price_override": "unit_price_override is required when price_mode is override."
                        }
                    )
                if unit_price_override <= 0:
                    raise serializers.ValidationError(
                        {"unit_price_override": "unit_price_override must be greater than zero."}
                    )

            if attrs.get("unit_price") is not None:
                raise serializers.ValidationError(
                    {
                        "unit_price": "Do not send unit_price with catalog_ref. Use price_mode=override and unit_price_override."
                    }
                )
        else:
            service = attrs.get("service")
            if service is None and attrs.get("unit_price") is None:
                raise serializers.ValidationError(
                    {
                        "unit_price": "unit_price is required when no service or catalog_ref is provided."
                    }
                )
            if not attrs.get("description") and service is None:
                raise serializers.ValidationError(
                    {
                        "description": "description is required when no service or catalog_ref is provided."
                    }
                )

        return attrs

    def create(self, validated_data):
        catalog_ref = validated_data.pop("catalog_ref", None)
        price_mode = validated_data.pop("price_mode", "catalog")
        unit_price_override = validated_data.pop("unit_price_override", None)
        validated_data.pop("override_reason", None)
        invoice = validated_data.get("invoice")

        if catalog_ref is not None and invoice is not None:
            resolver = BillingPriceResolver()
            quantity = validated_data.get("quantity") or Decimal("1.00")

            try:
                resolution = resolver.resolve(
                    ResolvePriceRequest(
                        facility_id=getattr(invoice, "facility_id", None),
                        catalog_kind=catalog_ref["kind"],
                        catalog_id=catalog_ref["id"],
                        quantity=quantity,
                        price_mode=price_mode,
                        unit_price_override=unit_price_override,
                        invoice_id=invoice.id,
                        encounter_id=getattr(invoice, "encounter_id", None),
                        user_id=getattr(
                            getattr(self.context.get("request"), "user", None), "id", None
                        ),
                    )
                )
            except CatalogItemNotFound as exc:
                raise serializers.ValidationError({"catalog_ref": str(exc)}) from exc
            except CatalogItemInactive as exc:
                raise serializers.ValidationError({"catalog_ref": str(exc)}) from exc
            except PriceNotConfigured as exc:
                raise serializers.ValidationError({"catalog_ref": str(exc)}) from exc
            except ValueError as exc:
                raise serializers.ValidationError({"catalog_ref": str(exc)}) from exc

            validated_data["item_type"] = resolution.item_type
            validated_data["unit_price"] = resolution.unit_price
            if not validated_data.get("description"):
                validated_data["description"] = resolution.description
            if not validated_data.get("sha_code"):
                validated_data["sha_code"] = resolution.sha_code
            if resolution.service_id and not validated_data.get("service"):
                validated_data["service_id"] = resolution.service_id

        service = validated_data.get("service")
        if service is not None:
            validated_data.setdefault("description", service.name)
            if validated_data.get("unit_price") is None:
                validated_data["unit_price"] = service.unit_price

        return super().create(validated_data)

    def get_lab_order_name(self, obj) -> str | None:
        """Return lab order test name if available."""
        if obj.lab_order:
            return (
                obj.lab_order.test_name
                if hasattr(obj.lab_order, "test_name")
                else str(obj.lab_order)
            )
        return None


class InvoicePayerSerializer(serializers.ModelSerializer):
    """Serializer for InvoicePayer model."""

    balance = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, coerce_to_string=True
    )
    payer_type_display = serializers.CharField(source="get_payer_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = InvoicePayer
        fields = [
            "id",
            "invoice",
            "payer_type",
            "payer_type_display",
            "patient_insurance",
            "insurance_claim",
            "sha_claim",
            "provider_name",
            "member_number",
            "priority",
            "allocation_percent",
            "allocated_amount",
            "approved_amount",
            "paid_amount",
            "balance",
            "status",
            "status_display",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice",
            "balance",
            "payer_type_display",
            "status_display",
            "created_at",
            "updated_at",
        ]


class InvoicePayerCreateSerializer(serializers.ModelSerializer):
    """Write serializer for InvoicePayer."""

    class Meta:
        model = InvoicePayer
        fields = [
            "payer_type",
            "patient_insurance",
            "insurance_claim",
            "sha_claim",
            "provider_name",
            "member_number",
            "priority",
            "allocation_percent",
            "allocated_amount",
            "approved_amount",
            "paid_amount",
            "status",
            "notes",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer for Invoice model."""

    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    payers = InvoicePayerSerializer(many=True, read_only=True)
    balance = serializers.SerializerMethodField()
    balance_due = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, coerce_to_string=True
    )

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
            "public_id",
            "invoice_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "invoice_date",
            "due_date",
            "status",
            "payment_type",
            "payer_type",
            "subtotal",
            "discount_type",
            "discount_value",
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
            "insurance_coverage",
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
            "payers",
            "qr_code",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "public_id",
            "invoice_number",
            "subtotal",
            "discount_amount",
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
            "payers",
            "qr_code",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {"due_date": {"required": False}, "invoice_date": {"required": False}}

    def get_balance(self, obj) -> str:
        """Calculate balance dynamically and return as string for consistency."""
        balance = obj.total_amount - obj.amount_paid
        return str(balance)

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


class FacilityBillingConfigSerializer(serializers.ModelSerializer):
    """Serializer for FacilityBillingConfig model.

    M-Pesa API secrets (consumer_key, consumer_secret, passkey) are
    intentionally EXCLUDED — they are KMS-encrypted and never returned
    in API responses.
    """

    facility_name = serializers.CharField(source="facility.name", read_only=True)
    facility_mfl_code = serializers.CharField(source="facility.mfl_code", read_only=True)

    # Computed properties
    is_sha_accredited = serializers.BooleanField(read_only=True)
    is_sha_contract_active = serializers.BooleanField(read_only=True)
    sha_accreditation_days_remaining = serializers.IntegerField(read_only=True)
    sha_contract_days_remaining = serializers.IntegerField(read_only=True)
    has_mpesa_credentials = serializers.BooleanField(read_only=True)
    has_sha_credentials = serializers.BooleanField(read_only=True)
    automation_rules = serializers.SerializerMethodField()

    def get_automation_rules(self, obj):
        rules = obj.automation_rules.all().order_by("name")
        return BillingAutomationRuleSerializer(rules, many=True).data

    class Meta:
        from hmis.apps.billing.models import FacilityBillingConfig

        model = FacilityBillingConfig
        fields = [
            "id",
            "facility",
            "facility_name",
            "facility_mfl_code",
            # Billing defaults
            "default_payment_type",
            "default_due_days",
            "auto_finalize_on_checkout",
            "tax_rate",
            # SHA accreditation
            "sha_accreditation_status",
            "sha_accreditation_date",
            "sha_accreditation_expiry",
            "is_sha_accredited",
            "sha_accreditation_days_remaining",
            # SHA contract
            "sha_contract_number",
            "sha_contract_start",
            "sha_contract_end",
            "sha_service_level",
            "sha_max_claim_amount",
            "hide_capitation_interventions",
            "is_sha_contract_active",
            "sha_contract_days_remaining",
            # Fee schedule
            "fee_schedule_name",
            "fee_schedule_override",
            # Collection accounts
            "mpesa_paybill",
            "mpesa_account_ref",
            "bank_name",
            "bank_account_number",
            "bank_branch",
            # M-Pesa (non-secret only — secrets are write-only)
            "mpesa_shortcode",
            "mpesa_callback_url",
            "mpesa_environment",
            "has_mpesa_credentials",
            # SHA/DHA ILM (non-secret only — secrets are write-only)
            "sha_agent_code",
            "sha_facility_fr_code",
            "sha_api_environment",
            "sha_encrypted_pin",
            "has_sha_credentials",
            "automation_rules",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "has_mpesa_credentials",
            "has_sha_credentials",
        ]


class FacilityBillingConfigCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating FacilityBillingConfig.

    M-Pesa secrets are accepted as write-only fields and stored via
    KMS-encrypted property setters on the model.
    """

    # Write-only secret fields — accepted on POST/PATCH, never returned
    mpesa_consumer_key = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    mpesa_consumer_secret = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    mpesa_passkey = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    # SHA/DHA ILM write-only secret fields
    sha_consumer_key = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_client_id = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_client_secret = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_username = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    automation_rules = serializers.ListSerializer(
        child=serializers.DictField(), required=False, write_only=True
    )

    class Meta:
        from hmis.apps.billing.models import FacilityBillingConfig

        model = FacilityBillingConfig
        fields = [
            "facility",
            "default_payment_type",
            "default_due_days",
            "auto_finalize_on_checkout",
            "tax_rate",
            "sha_accreditation_status",
            "sha_accreditation_date",
            "sha_accreditation_expiry",
            "sha_contract_number",
            "sha_contract_start",
            "sha_contract_end",
            "sha_service_level",
            "sha_max_claim_amount",
            "hide_capitation_interventions",
            "fee_schedule_name",
            "fee_schedule_override",
            "mpesa_paybill",
            "mpesa_account_ref",
            "bank_name",
            "bank_account_number",
            "bank_branch",
            # M-Pesa API credentials (write-only — goes through KMS)
            "mpesa_consumer_key",
            "mpesa_consumer_secret",
            "mpesa_passkey",
            "mpesa_shortcode",
            "mpesa_callback_url",
            "mpesa_environment",
            # SHA/DHA ILM API credentials (write-only — goes through KMS)
            "sha_consumer_key",
            "sha_client_id",
            "sha_client_secret",
            "sha_username",
            "sha_password",
            "sha_agent_code",
            "sha_facility_fr_code",
            "sha_encrypted_pin",
            "sha_api_environment",
            "automation_rules",
        ]

    def _upsert_automation_rules(self, instance, rules_data: list[dict]) -> None:
        keep_ids: set[int] = set()
        for raw in rules_data:
            rule_id = raw.get("id")
            payload = {
                "name": raw.get("name", "").strip(),
                "is_active": bool(raw.get("is_active", True)),
                "trigger": raw.get("trigger", BillingAutomationRule.Trigger.ENCOUNTER_CREATED),
                "recurrence": raw.get("recurrence", BillingAutomationRule.Recurrence.ONCE),
                "repeat_every_days": int(raw.get("repeat_every_days", 1) or 1),
                "service_id": raw.get("service"),
                "item_type": raw.get("item_type", "service"),
                "quantity": raw.get("quantity", "1.00"),
                "unit_price_override": raw.get("unit_price_override"),
                "description_template": raw.get("description_template", ""),
                "encounter_types": raw.get("encounter_types", []),
            }

            if rule_id:
                rule = instance.automation_rules.filter(pk=rule_id).first()
                if not rule:
                    continue
                for field, value in payload.items():
                    setattr(rule, field, value)
                rule.full_clean()
                rule.save()
                keep_ids.add(rule.id)
                continue

            rule = BillingAutomationRule.objects.create(
                billing_config=instance,
                **payload,
            )
            keep_ids.add(rule.id)

        if rules_data is not None:
            instance.automation_rules.exclude(id__in=keep_ids).delete()

    def create(self, validated_data):
        automation_rules = validated_data.pop("automation_rules", [])
        # Pop secrets and set via KMS property setters
        mpesa_secrets = {
            k: validated_data.pop(k, "")
            for k in ("mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_passkey")
        }
        sha_secrets = {
            k: validated_data.pop(k, "")
            for k in (
                "sha_consumer_key",
                "sha_client_id",
                "sha_client_secret",
                "sha_username",
                "sha_password",
            )
        }
        instance = super().create(validated_data)

        update_fields = []
        for attr, value in mpesa_secrets.items():
            if value:
                setattr(instance, attr, value)
                update_fields.append(f"{attr}_encrypted")
        for attr, value in sha_secrets.items():
            if value:
                setattr(instance, attr, value)
                update_fields.append(f"{attr}_encrypted")
        if update_fields:
            instance.save(update_fields=update_fields)
        if automation_rules:
            self._upsert_automation_rules(instance, automation_rules)
        return instance

    def update(self, instance, validated_data):
        automation_rules = validated_data.pop("automation_rules", None)
        # Pop secrets and set via KMS property setters
        mpesa_secrets = {
            k: validated_data.pop(k, "")
            for k in ("mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_passkey")
        }
        sha_secrets = {
            k: validated_data.pop(k, "")
            for k in (
                "sha_consumer_key",
                "sha_client_id",
                "sha_client_secret",
                "sha_username",
                "sha_password",
            )
        }
        instance = super().update(instance, validated_data)
        changed = []
        for attr, value in mpesa_secrets.items():
            if value:
                setattr(instance, attr, value)
                changed.append(f"{attr}_encrypted")
        for attr, value in sha_secrets.items():
            if value:
                setattr(instance, attr, value)
                changed.append(f"{attr}_encrypted")
        if changed:
            instance.save(update_fields=changed)
        if automation_rules is not None:
            self._upsert_automation_rules(instance, automation_rules)
        return instance


class BillingAutomationRuleSerializer(serializers.ModelSerializer):
    service_code = serializers.CharField(source="service.code", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = BillingAutomationRule
        fields = [
            "id",
            "name",
            "is_active",
            "trigger",
            "recurrence",
            "repeat_every_days",
            "service",
            "service_code",
            "service_name",
            "item_type",
            "quantity",
            "unit_price_override",
            "description_template",
            "encounter_types",
            "created_at",
            "updated_at",
        ]


class SHAContractSummarySerializer(serializers.Serializer):
    """Read-only serializer for SHA contract tracking across facilities."""

    facility_id = serializers.IntegerField()
    facility_name = serializers.CharField()
    facility_mfl_code = serializers.CharField()
    sha_accreditation_status = serializers.CharField()
    sha_accreditation_expiry = serializers.DateField(allow_null=True)
    sha_contract_number = serializers.CharField()
    sha_contract_start = serializers.DateField(allow_null=True)
    sha_contract_end = serializers.DateField(allow_null=True)
    sha_service_level = serializers.CharField()
    is_sha_accredited = serializers.BooleanField()
    is_sha_contract_active = serializers.BooleanField()
    sha_accreditation_days_remaining = serializers.IntegerField(allow_null=True)
    sha_contract_days_remaining = serializers.IntegerField(allow_null=True)


# ===========================================================================
# Accounts Payable: Supplier Bills & Payments
# ===========================================================================


class SupplierBillItemSerializer(serializers.ModelSerializer):
    """Serializer for SupplierBillItem."""

    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        from hmis.apps.billing.models import SupplierBillItem

        model = SupplierBillItem
        fields = [
            "id",
            "description",
            "quantity",
            "unit_cost",
            "line_total",
            "grn_item",
        ]


class SupplierBillSerializer(serializers.ModelSerializer):
    """Read serializer for SupplierBill."""

    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    grn_number = serializers.CharField(source="grn.grn_number", read_only=True, default=None)
    po_number = serializers.CharField(
        source="purchase_order.po_number", read_only=True, default=None
    )
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    aging_bucket = serializers.CharField(read_only=True)
    items = SupplierBillItemSerializer(many=True, read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    approved_by_username = serializers.CharField(
        source="approved_by.username", read_only=True, default=None
    )

    class Meta:
        from hmis.apps.billing.models import SupplierBill

        model = SupplierBill
        fields = [
            "id",
            "bill_number",
            "supplier_invoice_number",
            "supplier",
            "supplier_name",
            "grn",
            "grn_number",
            "purchase_order",
            "po_number",
            "amount_invoiced",
            "tax_amount",
            "amount_paid",
            "total_amount",
            "balance",
            "status",
            "bill_date",
            "due_date",
            "received_date",
            "po_amount",
            "grn_amount",
            "is_matched",
            "match_variance",
            "match_notes",
            "is_overdue",
            "days_overdue",
            "aging_bucket",
            "items",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "created_by",
            "created_by_username",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "bill_number",
            "amount_paid",
            "status",
            "po_amount",
            "grn_amount",
            "is_matched",
            "match_variance",
            "approved_by",
            "approved_at",
            "created_by",
            "created_at",
            "updated_at",
        ]


class SupplierBillCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating a SupplierBill."""

    items = SupplierBillItemSerializer(many=True, required=False)

    class Meta:
        from hmis.apps.billing.models import SupplierBill

        model = SupplierBill
        fields = [
            "supplier",
            "grn",
            "purchase_order",
            "supplier_invoice_number",
            "amount_invoiced",
            "tax_amount",
            "bill_date",
            "due_date",
            "notes",
            "items",
        ]

    def validate(self, attrs):
        # If GRN provided, supplier must match
        grn = attrs.get("grn")
        supplier = attrs.get("supplier")
        if grn and supplier and grn.supplier_id != supplier.id:
            raise serializers.ValidationError(
                {"grn": "GRN supplier does not match the selected supplier."}
            )
        # If PO provided, supplier must match
        po = attrs.get("purchase_order")
        if po and supplier and po.supplier_id != supplier.id:
            raise serializers.ValidationError(
                {"purchase_order": "PO supplier does not match the selected supplier."}
            )
        return attrs

    def create(self, validated_data):
        from hmis.apps.billing.models import SupplierBill, SupplierBillItem

        items_data = validated_data.pop("items", [])
        bill = SupplierBill.objects.create(**validated_data)
        for item_data in items_data:
            SupplierBillItem.objects.create(bill=bill, **item_data)
        # Auto-compute due date from supplier terms
        bill.compute_due_date()
        # Auto-run 3-way match if PO or GRN linked
        if bill.purchase_order or bill.grn:
            bill.perform_three_way_match()
        return bill


class SupplierPaymentSerializer(serializers.ModelSerializer):
    """Read serializer for SupplierPayment."""

    bill_number = serializers.CharField(source="bill.bill_number", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    paid_by_username = serializers.CharField(source="paid_by.username", read_only=True)

    class Meta:
        from hmis.apps.billing.models import SupplierPayment

        model = SupplierPayment
        fields = [
            "id",
            "payment_reference",
            "bill",
            "bill_number",
            "supplier",
            "supplier_name",
            "method",
            "amount",
            "currency",
            "status",
            "transaction_reference",
            "payment_details",
            "payment_date",
            "processed_at",
            "notes",
            "failure_reason",
            "paid_by",
            "paid_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "payment_reference",
            "status",
            "processed_at",
            "paid_by",
            "created_at",
            "updated_at",
        ]


class SupplierPaymentCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating a SupplierPayment."""

    class Meta:
        from hmis.apps.billing.models import SupplierPayment

        model = SupplierPayment
        fields = [
            "bill",
            "supplier",
            "method",
            "amount",
            "transaction_reference",
            "payment_details",
            "payment_date",
            "notes",
        ]

    def validate(self, attrs):
        from hmis.apps.billing.models import SupplierBillStatus

        bill = attrs.get("bill")
        if bill:
            # Must be approved or partially paid
            payable_statuses = {
                SupplierBillStatus.APPROVED,
                SupplierBillStatus.PARTIALLY_PAID,
            }
            if bill.status not in payable_statuses:
                raise serializers.ValidationError(
                    {"bill": "Bill must be APPROVED or PARTIALLY_PAID to accept payment."}
                )
            # Amount cannot exceed balance
            amount = attrs.get("amount", Decimal("0"))
            if amount > bill.balance:
                raise serializers.ValidationError(
                    {"amount": f"Amount ({amount}) exceeds bill balance ({bill.balance})."}
                )
            # Supplier must match
            supplier = attrs.get("supplier")
            if supplier and bill.supplier_id != supplier.id:
                raise serializers.ValidationError(
                    {"supplier": "Supplier does not match the bill's supplier."}
                )
        return attrs

    def create(self, validated_data):
        from hmis.apps.billing.models import SupplierPayment

        payment = SupplierPayment.objects.create(**validated_data)
        payment.process()
        return payment
