# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002
"""Billing views supplier for Vitora HMIS.

What this file is for:
- Implement views supplier logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission, RequiresActiveShiftPermission

logger = logging.getLogger(__name__)


class SupplierBillViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """
    ViewSet for supplier bills (accounts payable).

    Supports:
    - CRUD for bills
    - 3-way matching (PO vs GRN vs invoice)
    - Status transitions: receive, approve, dispute, cancel
    - Aging summary report
    """

    from hmis.apps.billing.models import SupplierBill

    queryset = SupplierBill.objects.select_related(
        "supplier", "grn", "purchase_order", "created_by", "approved_by"
    ).prefetch_related("items", "payments")
    audit_resource_type = "SupplierBill"
    audit_action_prefix = "billing.supplier_bill"
    audit_source = "billing_api"
    audit_excluded_actions = {"create", "destroy", "approve"}
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["bill_number", "supplier_invoice_number", "supplier__name"]
    ordering_fields = ["bill_date", "due_date", "amount_invoiced", "status", "created_at"]
    ordering = ["-bill_date"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        from hmis.apps.billing.serializers import (
            SupplierBillCreateSerializer,
            SupplierBillSerializer,
        )

        if self.action == "create":
            return SupplierBillCreateSerializer
        return SupplierBillSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Filter by status
        bill_status = self.request.query_params.get("status")
        if bill_status:
            qs = qs.filter(status=bill_status)
        # Filter by supplier
        supplier_id = self.request.query_params.get("supplier")
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        # Filter by overdue
        overdue = self.request.query_params.get("overdue")
        if overdue and overdue.lower() == "true":
            from hmis.apps.billing.models import SupplierBillStatus

            qs = qs.filter(due_date__lt=date.today()).exclude(
                status__in=[SupplierBillStatus.PAID, SupplierBillStatus.CANCELLED]
            )
        return qs

    def perform_create(self, serializer):
        if not self.request.user.has_perm("billing.add_supplierbill"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to create supplier bills.")
        instance = serializer.save(
            created_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="supplier_bill_create",
            user=self.request.user,
            resource_type="SupplierBill",
            resource_id=instance.id,
            details={
                "bill_number": instance.bill_number,
                "supplier": instance.supplier.name,
                "amount": str(instance.amount_invoiced),
            },
        )

    def destroy(self, request, *args, **kwargs):
        """Delete with permission check and audit logging."""
        if not request.user.has_perm("billing.delete_supplierbill"):
            return Response(
                {"detail": "You do not have permission to delete supplier bills."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        AuditLog.log(
            action="supplier_bill_delete",
            user=request.user,
            resource_type="SupplierBill",
            resource_id=instance.id,
            details={"bill_number": instance.bill_number},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """Mark a DRAFT bill as RECEIVED."""
        bill = self.get_object()
        try:
            bill.receive()
        except ValidationError as e:
            message = getattr(e, "message", None) or "Unable to receive supplier bill."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        from hmis.apps.billing.serializers import SupplierBillSerializer

        return Response(SupplierBillSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a RECEIVED bill for payment."""
        if not request.user.has_perm("billing.approve_supplierbill"):
            return Response(
                {"detail": "You do not have permission to approve supplier bills."},
                status=status.HTTP_403_FORBIDDEN,
            )
        bill = self.get_object()
        try:
            bill.approve(user=request.user)
        except ValidationError as e:
            message = getattr(e, "message", None) or "Unable to approve supplier bill."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.log(
            action="supplier_bill_approve",
            user=request.user,
            resource_type="SupplierBill",
            resource_id=bill.id,
            details={"bill_number": bill.bill_number},
        )
        from hmis.apps.billing.serializers import SupplierBillSerializer

        return Response(SupplierBillSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def dispute(self, request, pk=None):
        """Dispute a bill (discrepancy in matching)."""
        bill = self.get_object()
        notes = request.data.get("notes", "")
        try:
            bill.dispute(notes=notes)
        except ValidationError as e:
            message = getattr(e, "message", None) or "Unable to dispute supplier bill."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        from hmis.apps.billing.serializers import SupplierBillSerializer

        return Response(SupplierBillSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a bill."""
        bill = self.get_object()
        try:
            bill.cancel()
        except ValidationError as e:
            message = getattr(e, "message", None) or "Unable to cancel supplier bill."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        from hmis.apps.billing.serializers import SupplierBillSerializer

        return Response(SupplierBillSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def match(self, request, pk=None):
        """Run 3-way matching on a bill."""
        bill = self.get_object()
        tolerance = Decimal(request.data.get("tolerance", "0.01"))
        matched = bill.perform_three_way_match(tolerance=tolerance)
        from hmis.apps.billing.serializers import SupplierBillSerializer

        data = SupplierBillSerializer(bill).data
        data["match_result"] = "matched" if matched else "variance_detected"
        return Response(data)

    @action(detail=False, methods=["get"])
    def aging_summary(self, request):
        """Return aging summary for all unpaid bills."""
        from django.db.models import Count, Sum

        from hmis.apps.billing.models import SupplierBillStatus

        qs = self.get_queryset().exclude(
            status__in=[SupplierBillStatus.PAID, SupplierBillStatus.CANCELLED]
        )
        today = date.today()
        buckets = {
            "current": qs.filter(Q(due_date__gte=today) | Q(due_date__isnull=True)),
            "1_30": qs.filter(due_date__lt=today, due_date__gte=today - timedelta(days=30)),
            "31_60": qs.filter(
                due_date__lt=today - timedelta(days=30),
                due_date__gte=today - timedelta(days=60),
            ),
            "61_90": qs.filter(
                due_date__lt=today - timedelta(days=60),
                due_date__gte=today - timedelta(days=90),
            ),
            "over_90": qs.filter(due_date__lt=today - timedelta(days=90)),
        }
        summary = {}
        for bucket_name, bucket_qs in buckets.items():
            agg = bucket_qs.aggregate(
                count=Count("id"),
                total_invoiced=Sum("amount_invoiced"),
                total_paid=Sum("amount_paid"),
            )
            summary[bucket_name] = {
                "count": agg["count"],
                "total_invoiced": str(agg["total_invoiced"] or 0),
                "total_paid": str(agg["total_paid"] or 0),
                "balance": str((agg["total_invoiced"] or 0) - (agg["total_paid"] or 0)),
            }
        return Response(summary)


class SupplierPaymentViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """
    ViewSet for supplier payments (outflows to vendors).

    Supports creating payments against approved bills and reversals.
    """

    from hmis.apps.billing.models import SupplierPayment

    queryset = SupplierPayment.objects.select_related("bill", "supplier", "paid_by").all()
    audit_resource_type = "SupplierPayment"
    audit_action_prefix = "billing.supplier_payment"
    audit_source = "billing_api"
    audit_excluded_actions = {"create", "destroy", "reverse"}
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["payment_reference", "transaction_reference", "supplier__name"]
    ordering_fields = ["payment_date", "amount", "created_at"]
    ordering = ["-payment_date"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        from hmis.apps.billing.serializers import (
            SupplierPaymentCreateSerializer,
            SupplierPaymentSerializer,
        )

        if self.action == "create":
            return SupplierPaymentCreateSerializer
        return SupplierPaymentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        bill_id = self.request.query_params.get("bill")
        if bill_id:
            qs = qs.filter(bill_id=bill_id)
        supplier_id = self.request.query_params.get("supplier")
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return qs

    def perform_create(self, serializer):
        if not self.request.user.has_perm("billing.add_supplierpayment"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to record supplier payments.")
        instance = serializer.save(
            paid_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="supplier_payment_create",
            user=self.request.user,
            resource_type="SupplierPayment",
            resource_id=instance.id,
            details={
                "payment_reference": instance.payment_reference,
                "bill": instance.bill.bill_number,
                "amount": str(instance.amount),
                "method": instance.method,
            },
        )

    def destroy(self, request, *args, **kwargs):
        """Delete with permission check and audit logging."""
        if not request.user.has_perm("billing.delete_supplierpayment"):
            return Response(
                {"detail": "You do not have permission to delete supplier payments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        AuditLog.log(
            action="supplier_payment_delete",
            user=request.user,
            resource_type="SupplierPayment",
            resource_id=instance.id,
            details={"payment_reference": instance.payment_reference},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        """Reverse a completed supplier payment."""
        payment = self.get_object()
        reason = request.data.get("reason", "")
        try:
            payment.reverse(reason=reason)
        except ValidationError as e:
            message = getattr(e, "message", None) or "Unable to reverse supplier payment."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.log(
            action="supplier_payment_reverse",
            user=request.user,
            resource_type="SupplierPayment",
            resource_id=payment.id,
            details={
                "payment_reference": payment.payment_reference,
                "reason": reason,
            },
        )
        from hmis.apps.billing.serializers import SupplierPaymentSerializer

        return Response(SupplierPaymentSerializer(payment).data)
