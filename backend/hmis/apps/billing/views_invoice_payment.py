# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: invoice lifecycle, payments, payment points, and credit note viewsets.
How to use: imported by `hmis.apps.billing.views` compatibility shim.
Supported inputs/args: DRF viewsets/actions for invoicing and payment workflows.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Views for the billing app.

Following TDD - implemented to pass API tests.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.filters import CreditNoteFilter, InvoiceFilter, PaymentFilter
from hmis.apps.billing.models import (
    CreditNote,
    FacilityBillingConfig,
    Invoice,
    InvoiceItem,
    InvoicePayer,
    Payment,
    PaymentPoint,
    Receipt,
    Service,
    ServiceCategory,
    SHAClaim,
    SHAClaimItem,
)
from hmis.apps.billing.serializers import (
    BillingCatalogItemSerializer,
    CreditNoteSerializer,
    InvoiceItemSerializer,
    InvoicePayerCreateSerializer,
    InvoicePayerSerializer,
    InvoiceSerializer,
    PaymentPointSerializer,
    PaymentReverseSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    ServiceCategorySerializer,
    ServiceSerializer,
)
from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    PublicIdLookupMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
)
from hmis.apps.core.models import AuditLog, Facility
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    WriteRequiresRolePermission,
)

logger = logging.getLogger(__name__)


@extend_schema_view(
    remove_item=extend_schema(
        parameters=[
            OpenApiParameter(
                name="item_id",
                location=OpenApiParameter.PATH,
                required=True,
                type=OpenApiTypes.INT,
            )
        ]
    ),
    update_item_allocation=extend_schema(
        parameters=[
            OpenApiParameter(
                name="item_id",
                location=OpenApiParameter.PATH,
                required=True,
                type=OpenApiTypes.INT,
            )
        ]
    ),
    payer_detail=extend_schema(
        parameters=[
            OpenApiParameter(
                name="payer_id",
                location=OpenApiParameter.PATH,
                required=True,
                type=OpenApiTypes.INT,
            )
        ]
    ),
)
class InvoiceViewSet(
    AuditedMutationMixin,
    PublicIdLookupMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """
    ViewSet for Invoice model.

    Provides CRUD operations for invoices with custom actions.
    """

    tenant_scope = "facility"  # Invoices are facility-scoped

    queryset = (
        Invoice.objects.select_related("patient", "encounter", "created_by", "cancelled_by")
        .prefetch_related("items__service", "items__drug", "items__lab_order", "payers")
        .all()
    )
    audit_resource_type = "Invoice"
    audit_action_prefix = "billing.invoice"
    audit_source = "billing_api"
    audit_excluded_actions = {"create_copay_proforma", "finalize_and_apply_copay"}
    serializer_class = InvoiceSerializer
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = InvoiceFilter
    search_fields = ["invoice_number", "patient__first_name", "patient__last_name", "patient__mrn"]
    ordering_fields = ["invoice_date", "due_date", "total_amount", "created_at"]
    ordering = ["-invoice_date"]

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by date range if provided
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if start_date:
            queryset = queryset.filter(invoice_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(invoice_date__lte=end_date)

        # Clinic reporting filters
        clinic_id = self.request.query_params.get("clinic")
        if clinic_id:
            queryset = queryset.filter(
                Q(clinic_visit__session__clinic_id=clinic_id)
                | Q(encounter__clinic_visit__session__clinic_id=clinic_id)
            ).distinct()

        clinic_type = self.request.query_params.get("clinic_type")
        if clinic_type:
            queryset = queryset.filter(
                Q(clinic_visit__session__clinic__clinic_type=clinic_type)
                | Q(encounter__clinic_visit__session__clinic__clinic_type=clinic_type)
            ).distinct()

        return queryset

    @staticmethod
    def _resolve_interim_copay_amount(invoice: Invoice) -> Decimal:
        """Resolve interim copay amount from linked SHA/insurance claims."""
        total = Decimal("0.00")

        for claim in invoice.sha_claims.all():
            total += Decimal(str(getattr(claim, "patient_copay", 0) or 0))

        for claim in invoice.insurance_claims.all():
            total += Decimal(str(getattr(claim, "copay_amount", 0) or 0))

        if total > 0:
            return total.quantize(Decimal("0.01"))

        fallback = (invoice.total_amount - invoice.amount_paid).quantize(Decimal("0.01"))
        return max(Decimal("0.00"), fallback)

    @action(detail=False, methods=["get"], url_path="dha")
    def dha(self, request):
        """List DHA invoice references derived from SHA claims."""
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        organization = getattr(request, "organization", None)

        queryset = (
            SHAClaim.objects.select_related("patient", "invoice")
            .filter(dha_invoice_number__isnull=False)
            .exclude(dha_invoice_number="")
        )
        if facility is not None:
            queryset = queryset.filter(facility=facility)
        elif organization is not None:
            queryset = queryset.filter(organization=organization)
        elif not getattr(request.user, "is_superuser", False):
            queryset = queryset.none()

        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(dha_invoice_number__icontains=search)
                | Q(claim_number__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__mrn__icontains=search)
            )

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if start_date:
            queryset = queryset.filter(service_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(service_date__lte=end_date)

        queryset = queryset.order_by("-last_dha_payload_at", "-updated_at")

        page = self.paginate_queryset(queryset)
        rows = page if page is not None else queryset

        results = []
        for claim in rows:
            patient_name = f"{getattr(claim.patient, 'first_name', '')} {getattr(claim.patient, 'last_name', '')}".strip()
            local_invoice = getattr(claim, "invoice", None)
            results.append(
                {
                    "id": claim.id,
                    "source": "dha",
                    "invoice_number": claim.dha_invoice_number,
                    "claim_id": claim.id,
                    "claim_number": claim.claim_number,
                    "claim_status": claim.status,
                    "patient_id": claim.patient_id,
                    "patient_name": patient_name,
                    "patient_mrn": getattr(claim.patient, "mrn", "") or "",
                    "invoice_date": claim.service_date,
                    "total_amount": str(claim.claimed_amount),
                    "local_invoice_id": claim.invoice_id,
                    "local_invoice_number": getattr(local_invoice, "invoice_number", "")
                    if local_invoice
                    else "",
                }
            )

        if page is not None:
            return self.get_paginated_response(results)
        return Response({"count": len(results), "next": None, "previous": None, "results": results})

    def update(self, request, *args, **kwargs):
        """Only allow updates to draft invoices."""
        instance = self.get_object()

        if instance.status != Invoice.Status.DRAFT:
            return Response(
                {"error": "Only draft invoices can be modified"}, status=status.HTTP_400_BAD_REQUEST
            )

        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        """Finalize invoice (draft → pending)."""
        invoice = self.get_object()

        if invoice.status != Invoice.Status.DRAFT:
            return Response(
                {"error": "Only draft invoices can be finalized"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if invoice has items
        if not invoice.items.exists():
            return Response(
                {"error": "Invoice must have at least one item"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Change status to pending
        invoice.status = Invoice.Status.PENDING
        invoice.save()

        serializer = self.get_serializer(invoice)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="create-copay-proforma")
    def create_copay_proforma(self, request, pk=None):
        """Create an interim proforma invoice to collect copay during active treatment."""
        source_invoice = self.get_object()
        if source_invoice.status != Invoice.Status.DRAFT:
            return Response(
                {"error": "Copay proforma can only be created from a draft invoice."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_raw = request.data.get("amount")
        reason = str(request.data.get("reason") or "").strip()

        if amount_raw in (None, ""):
            amount = self._resolve_interim_copay_amount(source_invoice)
        else:
            try:
                amount = Decimal(str(amount_raw))
            except (InvalidOperation, ValueError, TypeError):
                return Response(
                    {"error": "amount must be a valid decimal."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if amount <= 0:
            return Response(
                {"error": "Resolved copay amount is zero. Nothing to collect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        proforma = Invoice.objects.create(
            patient=source_invoice.patient,
            encounter=source_invoice.encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=7),
            status=Invoice.Status.PROFORMA,
            payment_type=source_invoice.payment_type,
            payer_type=source_invoice.payer_type,
            notes=(
                f"Interim copay collection for draft invoice {source_invoice.invoice_number}."
                + (f" Reason: {reason}." if reason else "")
            ),
            created_by=request.user,
            facility=source_invoice.facility,
            organization=source_invoice.organization,
        )

        InvoiceItem.objects.create(
            invoice=proforma,
            description=f"Interim patient copay for {source_invoice.invoice_number}",
            quantity=Decimal("1.00"),
            unit_price=amount,
            line_total=amount,
        )
        proforma.calculate_totals()

        AuditLog.log(
            action="copay_proforma_created",
            user=request.user,
            resource_type="Invoice",
            resource_id=proforma.id,
            details={
                "source_invoice_id": source_invoice.id,
                "source_invoice_number": source_invoice.invoice_number,
                "proforma_id": proforma.id,
                "proforma_number": proforma.invoice_number,
                "amount": str(amount),
                "reason": reason,
            },
            facility=source_invoice.facility,
            organization=source_invoice.organization,
        )

        return Response(self.get_serializer(proforma).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="finalize-and-apply-copay")
    def finalize_and_apply_copay(self, request, pk=None):
        """Finalize invoice and apply completed interim-copay proforma payments."""
        invoice = self.get_object()

        if invoice.status in {
            Invoice.Status.CANCELLED,
            Invoice.Status.PAID,
            Invoice.Status.WRITTEN_OFF,
        }:
            return Response(
                {"error": f"Cannot finalize/apply copay for invoice in {invoice.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if invoice.status == Invoice.Status.DRAFT:
            if not invoice.items.exists():
                return Response(
                    {"error": "Invoice must have at least one item"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invoice.status = Invoice.Status.PENDING
            invoice.save(update_fields=["status", "updated_at"])

        invoice.refresh_from_db(fields=["amount_paid", "balance_due", "status", "updated_at"])

        interim_qs = Payment.objects.select_related("invoice", "payment_point").filter(
            status=Payment.Status.COMPLETED,
            invoice__status=Invoice.Status.PROFORMA,
            invoice__patient=invoice.patient,
            invoice__facility=invoice.facility,
            payment_details__interim_copay=True,
        )
        if invoice.encounter_id:
            interim_qs = interim_qs.filter(invoice__encounter_id=invoice.encounter_id)

        remaining = Decimal(str(invoice.balance_due or "0.00"))
        applied_total = Decimal("0.00")

        for interim in interim_qs.order_by("payment_date"):
            if remaining <= 0:
                break

            details = dict(interim.payment_details or {})
            reconciliation = dict(details.get("reconciliation") or {})
            already_applied = Decimal(str(reconciliation.get("applied_total") or "0.00"))
            available = Decimal(str(interim.amount or "0.00")) - already_applied
            if available <= 0:
                continue

            apply_amount = min(available, remaining)
            if apply_amount <= 0:
                continue

            allocation_payment = Payment.objects.create(
                invoice=invoice,
                payment_point=interim.payment_point,
                method=interim.method,
                amount=apply_amount,
                payment_details={
                    "allocation_only": True,
                    "applied_from_payment_id": interim.id,
                    "applied_from_proforma_invoice_id": interim.invoice_id,
                    "interim_copay_reconciliation": True,
                },
                notes=f"Auto-applied interim copay from {interim.payment_reference}",
                received_by=request.user,
            )
            allocation_payment.process()

            already_applied += apply_amount
            reconciliation["applied_total"] = str(already_applied.quantize(Decimal("0.01")))
            reconciliation["last_applied_invoice_id"] = invoice.id
            reconciliation["last_applied_invoice_number"] = invoice.invoice_number
            details["reconciliation"] = reconciliation
            interim.payment_details = details
            interim.save(update_fields=["payment_details", "updated_at"])

            applied_total += apply_amount
            remaining -= apply_amount

        invoice.refresh_from_db()

        AuditLog.log(
            action="copay_payment_applied_to_invoice",
            user=request.user,
            resource_type="Invoice",
            resource_id=invoice.id,
            details={
                "invoice_number": invoice.invoice_number,
                "applied_total": str(applied_total.quantize(Decimal("0.01"))),
                "remaining_balance": str(
                    Decimal(str(invoice.balance_due or "0.00")).quantize(Decimal("0.01"))
                ),
                "workflow": "finalize_and_apply_copay",
            },
            facility=invoice.facility,
            organization=invoice.organization,
        )

        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel invoice with reason."""
        invoice = self.get_object()
        reason = request.data.get("reason")

        if not reason:
            return Response(
                {"error": "Cancellation reason is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        invoice.cancel(request.user, reason)

        serializer = self.get_serializer(invoice)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="apply-discount")
    def apply_discount(self, request, pk=None):
        """Apply discount to invoice."""
        invoice = self.get_object()

        discount_amount = request.data.get("discount_amount")
        discount_reason = request.data.get("discount_reason", "")

        if not discount_amount:
            return Response(
                {"error": "Discount amount is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            discount_amount = Decimal(str(discount_amount))
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid discount amount"}, status=status.HTTP_400_BAD_REQUEST
            )

        invoice.apply_discount(discount_amount, discount_reason)

        serializer = self.get_serializer(invoice)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def overdue(self, request):
        """List overdue invoices."""
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset.filter(status=Invoice.Status.PENDING, due_date__lt=date.today())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        """
        Convert a proforma invoice to a regular invoice.

        POST /api/billing/invoices/{id}/convert/

        Request body (optional):
            item_ids: List of specific item IDs to convert (for partial conversion)

        Returns:
            The newly created invoice
        """
        proforma = self.get_object()
        item_ids = request.data.get("item_ids")

        try:
            new_invoice = proforma.convert_to_invoice(
                converted_by=request.user,
                item_ids=item_ids,
            )
            serializer = self.get_serializer(new_invoice)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        """
        Renew an expired proforma invoice.

        POST /api/billing/invoices/{id}/renew/

        Request body (optional):
            validity_days: Custom validity period in days (default: 30)

        Returns:
            The newly created proforma invoice
        """
        proforma = self.get_object()
        validity_days = request.data.get("validity_days")

        try:
            new_proforma = proforma.renew(
                renewed_by=request.user,
                validity_days=validity_days,
            )
            serializer = self.get_serializer(new_proforma)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get", "post"])
    def items(self, request, pk=None):
        """List or add invoice items."""
        invoice = self.get_object()

        if request.method == "GET":
            items = invoice.items.all()
            serializer = InvoiceItemSerializer(items, many=True)
            return Response(serializer.data)

        # POST - Add item
        serializer = InvoiceItemSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            serializer.save(invoice=invoice)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "item_id",
                OpenApiTypes.INT,
                location="path",
                description="Invoice item ID to remove",
            ),
        ],
        responses={204: None},
    )
    @action(detail=True, methods=["delete"], url_path="items/(?P<item_id>[^/.]+)")
    def remove_item(self, request, pk=None, item_id=None):
        """Remove an invoice item."""
        invoice = self.get_object()
        item = get_object_or_404(InvoiceItem, id=item_id, invoice=invoice)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["patch"], url_path="items/(?P<item_id>[^/.]+)/allocation")
    def update_item_allocation(self, request, pk=None, item_id=None):
        """Update allocation for unlinked invoice items only.

        Allowed modes:
        - patient: mark line as fully patient-payable
        - discount: mark line as discounted/waived (requires reason)
        """
        invoice = self.get_object()
        item = get_object_or_404(InvoiceItem, id=item_id, invoice=invoice)

        linked_claim_item = SHAClaimItem.objects.filter(invoice_item=item).first()
        if linked_claim_item is not None:
            return Response(
                {
                    "error": (
                        "Allocation for linked SHA claim lines is read-only here. "
                        "Only unlinked invoice items can be updated from invoice detail."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        mode = str(request.data.get("mode") or "").strip().lower()
        if mode not in {"patient", "discount"}:
            return Response(
                {"error": "mode must be either 'patient' or 'discount'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.is_covered_by_insurance = False
        item.insurance_approved_amount = Decimal("0.00")

        if mode == "patient":
            item.discount_amount = Decimal("0.00")
            item.discount_reason = ""
        else:
            try:
                discount_amount = Decimal(str(request.data.get("discount_amount") or "0"))
            except (InvalidOperation, ValueError, TypeError):
                return Response(
                    {"error": "discount_amount must be a valid number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if discount_amount < 0:
                return Response(
                    {"error": "discount_amount cannot be negative."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            line_total = Decimal(str(item.line_total or "0.00"))
            if discount_amount > line_total:
                return Response(
                    {"error": "discount_amount cannot exceed line total."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            discount_reason = str(request.data.get("discount_reason") or "").strip()
            if discount_amount > 0 and not discount_reason:
                return Response(
                    {"error": "discount_reason is required when discount_amount > 0."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            item.discount_amount = discount_amount
            item.discount_reason = discount_reason

        item.save(
            update_fields=[
                "is_covered_by_insurance",
                "insurance_approved_amount",
                "discount_amount",
                "discount_reason",
                "line_total",
                "updated_at",
            ]
        )
        return Response(InvoiceItemSerializer(item).data)

    # ------ Payers (nested) ------ #

    @action(detail=True, methods=["get", "post"], url_path="payers")
    def payers(self, request, pk=None):
        """List or add payers for an invoice."""
        invoice = self.get_object()
        if request.method == "GET":
            payers = invoice.payers.all()
            serializer = InvoicePayerSerializer(payers, many=True)
            return Response(serializer.data)
        # POST
        serializer = InvoicePayerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(invoice=invoice)
        return Response(
            InvoicePayerSerializer(serializer.instance).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path="payers/(?P<payer_id>[^/.]+)",
    )
    def payer_detail(self, request, pk=None, payer_id=None):
        """Update or remove a payer from an invoice."""
        invoice = self.get_object()
        payer = get_object_or_404(InvoicePayer, id=payer_id, invoice=invoice)
        if request.method == "DELETE":
            payer.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        # PATCH
        serializer = InvoicePayerCreateSerializer(payer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(InvoicePayerSerializer(payer).data)


class PaymentViewSet(AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for Payment model.

    Provides operations for recording and managing payments.
    """

    queryset = Payment.objects.select_related("invoice", "received_by").all()
    audit_resource_type = "Payment"
    audit_action_prefix = "billing.payment"
    audit_source = "billing_api"
    audit_excluded_actions = {"create", "reverse"}
    serializer_class = PaymentSerializer
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PaymentFilter
    search_fields = ["reference", "mpesa_receipt_number", "transaction_reference"]
    ordering_fields = ["payment_date", "amount", "created_at"]
    ordering = ["-payment_date"]
    tenant_facility_chain = "invoice__facility"
    tenant_org_chain = "invoice__organization"

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """Get or generate receipt for payment."""
        payment = self.get_object()

        # Try to get existing receipt
        try:
            receipt = Receipt.objects.get(payment=payment)
        except Receipt.DoesNotExist:
            # Generate receipt
            receipt = Receipt.objects.create(
                payment=payment,
                invoice=payment.invoice,
                patient=payment.invoice.patient,
                amount=payment.amount,
                payment_method=payment.method,
                issued_by=request.user,
            )

        serializer = ReceiptSerializer(receipt)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="receipt/pdf")
    def receipt_pdf(self, request, pk=None):
        """Download receipt as PDF for a payment."""
        payment = self.get_object()

        try:
            receipt = Receipt.objects.get(payment=payment)
        except Receipt.DoesNotExist:
            return Response(
                {"detail": "No receipt found for this payment."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_bytes = receipt.generate_pdf()
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="receipt-{receipt.receipt_number}.pdf"'
        )
        return response

    def perform_create(self, serializer):
        """Create payment and audit log the event."""
        payment = serializer.save()
        AuditLog.log(
            action="payment_create",
            user=self.request.user,
            resource_type="Payment",
            resource_id=payment.id,
            details={
                "payment_reference": payment.payment_reference,
                "invoice_id": payment.invoice_id,
                "invoice_number": payment.invoice.invoice_number,
                "amount": str(payment.amount),
                "method": payment.method,
                "mpesa_receipt_number": payment.mpesa_receipt_number or "",
            },
        )

    @extend_schema(request=PaymentReverseSerializer)
    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        """Reverse a completed payment."""
        payment = self.get_object()

        serializer = PaymentReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]

        try:
            payment.reverse(reason)
        except ValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="payment_reverse",
            user=request.user,
            resource_type="Payment",
            resource_id=payment.id,
            details={
                "payment_reference": payment.payment_reference,
                "invoice_id": payment.invoice_id,
                "invoice_number": payment.invoice.invoice_number,
                "amount": str(payment.amount),
                "reason": reason,
            },
        )

        return Response(PaymentSerializer(payment).data)


class PaymentPointViewSet(AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for managing payment points (cashier/till/bank accounts)."""

    queryset = PaymentPoint.objects.select_related("created_by").all()
    audit_resource_type = "PaymentPoint"
    audit_action_prefix = "billing.payment_point"
    audit_source = "billing_api"
    serializer_class = PaymentPointSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["method", "is_active"]
    search_fields = ["name", "code", "till_number", "paybill_number", "bank_account_number"]
    ordering_fields = ["name", "method", "created_at"]
    ordering = ["method", "name"]
    tenant_scope = "facility"


class CreditNoteViewSet(AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for CreditNote model.

    Provides operations for credit notes with approval workflow.
    """

    queryset = CreditNote.objects.select_related(
        "invoice", "patient", "requested_by", "approved_by"
    ).all()
    audit_resource_type = "CreditNote"
    audit_action_prefix = "billing.credit_note"
    audit_source = "billing_api"
    serializer_class = CreditNoteSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = CreditNoteFilter
    search_fields = ["credit_note_number", "reason_detail"]
    ordering_fields = ["created_at", "approved_at"]
    ordering = ["-created_at"]
    tenant_facility_chain = "invoice__facility"
    tenant_org_chain = "invoice__organization"

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve credit note."""
        credit_note = self.get_object()

        try:
            credit_note.approve(request.user)
            serializer = self.get_serializer(credit_note)
            return Response(serializer.data)
        except (ValueError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject credit note."""
        credit_note = self.get_object()
        reason = request.data.get("reason", "")
        if not reason:
            return Response(
                {"error": "Rejection reason is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            credit_note.reject(request.user, reason)
            serializer = self.get_serializer(credit_note)
            return Response(serializer.data)
        except (ValueError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        """Process refund for approved credit note."""
        credit_note = self.get_object()

        refund_method = request.data.get("refund_method")
        refund_reference = request.data.get("refund_reference", "")

        if not refund_method:
            return Response(
                {"error": "Refund method is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            credit_note.process_refund(refund_method, refund_reference)
            serializer = self.get_serializer(credit_note)
            return Response(serializer.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
