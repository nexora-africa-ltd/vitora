# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing serializers supplier for Vitora HMIS.

What this file is for:
- Implement serializers supplier logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from decimal import Decimal

from rest_framework import serializers


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
