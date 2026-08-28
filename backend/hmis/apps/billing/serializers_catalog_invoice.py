# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing serializers catalog invoice for Vitora HMIS.

What this file is for:
- Implement serializers catalog invoice logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from decimal import Decimal

from rest_framework import serializers

from hmis.apps.billing.models import Invoice, InvoiceItem, InvoicePayer, Service, ServiceCategory
from hmis.apps.billing.services.price_resolver import (
    BillingPriceResolver,
    CatalogItemInactive,
    CatalogItemNotFound,
    PriceNotConfigured,
    ResolvePriceRequest,
)
from hmis.apps.core.qr_utils import generate_invoice_qr_url, generate_qr_data_uri


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
    gross_total = serializers.SerializerMethodField()
    sha_credit_amount = serializers.SerializerMethodField()
    insurance_credit_amount = serializers.SerializerMethodField()
    payer_credit_total = serializers.SerializerMethodField()
    patient_copay_amount = serializers.SerializerMethodField()
    patient_net_due = serializers.SerializerMethodField()
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
            "gross_total",
            "total_amount",
            "amount_paid",
            "balance",
            "balance_due",
            "sha_credit_amount",
            "insurance_credit_amount",
            "payer_credit_total",
            "patient_copay_amount",
            "patient_net_due",
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
            "gross_total",
            "total_amount",
            "amount_paid",
            "balance",
            "balance_due",
            "sha_credit_amount",
            "insurance_credit_amount",
            "payer_credit_total",
            "patient_copay_amount",
            "patient_net_due",
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

    @staticmethod
    def _money(value) -> Decimal:
        try:
            return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            return Decimal("0.00")

    def _insurance_reservation_credit(self, payer) -> Decimal:
        claim = getattr(payer, "insurance_claim", None)
        if claim is None:
            return Decimal("0.00")

        reservations = getattr(claim, "balance_reservations", None)
        if reservations is None:
            return Decimal("0.00")

        active_statuses = {
            "reserved",
            "partially_released",
        }
        total = Decimal("0.00")
        for reservation in reservations.all():
            if getattr(reservation, "status", "") not in active_statuses:
                continue
            reserved_amount = self._money(getattr(reservation, "amount", None))
            released_amount = self._money(getattr(reservation, "amount_released", None))
            outstanding = reserved_amount - released_amount
            if outstanding > 0:
                total += outstanding

        if total > 0:
            return total.quantize(Decimal("0.01"))

        approved = self._money(getattr(claim, "approved_amount", None))
        if approved > 0:
            return approved

        return self._money(getattr(claim, "total_amount", None))

    def _resolve_payer_credit(self, payer) -> Decimal:
        approved = self._money(getattr(payer, "approved_amount", None))
        if approved > 0:
            return approved

        allocated = self._money(getattr(payer, "allocated_amount", None))
        if allocated > 0:
            return allocated

        if payer.payer_type == payer.PayerType.PRIVATE_INSURANCE:
            reserve_credit = self._insurance_reservation_credit(payer)
            if reserve_credit > 0:
                return reserve_credit

        return Decimal("0.00")

    def _credit_breakdown(self, obj) -> tuple[Decimal, Decimal]:
        payers = getattr(obj, "payers", None)
        if payers is None:
            return Decimal("0.00"), Decimal("0.00")

        sha_total = Decimal("0.00")
        insurance_total = Decimal("0.00")
        for payer in payers.all():
            credit = self._resolve_payer_credit(payer)
            if credit <= 0:
                continue
            if payer.payer_type == payer.PayerType.SHA:
                sha_total += credit
            elif payer.payer_type == payer.PayerType.PRIVATE_INSURANCE:
                insurance_total += credit

        return (
            sha_total.quantize(Decimal("0.01")),
            insurance_total.quantize(Decimal("0.01")),
        )

    def get_gross_total(self, obj) -> str:
        return str(self._money(obj.total_amount))

    def get_sha_credit_amount(self, obj) -> str:
        sha_total, _ = self._credit_breakdown(obj)
        return str(sha_total)

    def get_insurance_credit_amount(self, obj) -> str:
        _, insurance_total = self._credit_breakdown(obj)
        return str(insurance_total)

    def get_payer_credit_total(self, obj) -> str:
        sha_total, insurance_total = self._credit_breakdown(obj)
        return str((sha_total + insurance_total).quantize(Decimal("0.01")))

    def _patient_copay_total(self, obj) -> Decimal:
        total_copay = Decimal("0.00")

        sha_claims = getattr(obj, "sha_claims", None)
        if sha_claims is not None:
            for claim in sha_claims.all():
                total_copay += self._money(getattr(claim, "patient_copay", None))

        # Private insurance claims may carry patient copay on the claim itself.
        # Aggregate from both invoice.insurance_claims and payer-linked insurance_claim,
        # de-duplicating by claim id when both relations point to the same claim.
        insurance_claim_ids: set[int] = set()

        insurance_claims = getattr(obj, "insurance_claims", None)
        if insurance_claims is not None:
            for claim in insurance_claims.all():
                claim_id = getattr(claim, "id", None)
                if claim_id in insurance_claim_ids:
                    continue
                if claim_id is not None:
                    insurance_claim_ids.add(claim_id)
                total_copay += self._money(getattr(claim, "copay_amount", None))

        payers = getattr(obj, "payers", None)
        if payers is not None:
            for payer in payers.all():
                claim = getattr(payer, "insurance_claim", None)
                if claim is None:
                    continue
                claim_id = getattr(claim, "id", None)
                if claim_id in insurance_claim_ids:
                    continue
                if claim_id is not None:
                    insurance_claim_ids.add(claim_id)
                total_copay += self._money(getattr(claim, "copay_amount", None))

        return total_copay.quantize(Decimal("0.01"))

    def get_patient_copay_amount(self, obj) -> str:
        return str(self._patient_copay_total(obj))

    def get_patient_net_due(self, obj) -> str:
        gross = self._money(obj.total_amount)
        sha_total, insurance_total = self._credit_breakdown(obj)
        copay = self._patient_copay_total(obj)
        net = gross - sha_total - insurance_total
        if net < 0:
            net = Decimal("0.00")
        if copay > net:
            net = copay
        return str(net.quantize(Decimal("0.01")))

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
