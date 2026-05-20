"""
Views for the billing app.

Following TDD - implemented to pass API tests.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

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
)
from hmis.apps.billing.serializers import (
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
from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import RequiresActiveShiftPermission

logger = logging.getLogger(__name__)


class ServiceCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ServiceCategory model.

    Provides CRUD operations for service categories.
    """

    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["display_order", "name", "created_at"]
    ordering = ["display_order"]


class ServiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Service model.

    Provides CRUD operations for billable services with filtering.
    """

    queryset = Service.objects.select_related("category", "created_by").all()
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "is_active", "is_taxable", "sha_code"]
    search_fields = ["name", "code", "description", "sha_code"]
    ordering_fields = ["name", "unit_price", "created_at"]
    ordering = ["name"]

    def perform_destroy(self, instance):
        """Soft delete - mark service as unavailable instead of deleting."""
        instance.is_active = False
        instance.save()


class InvoiceViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
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
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
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


class PaymentViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for Payment model.

    Provides operations for recording and managing payments.
    """

    queryset = Payment.objects.select_related("invoice", "received_by").all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
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


class PaymentPointViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """ViewSet for managing payment points (cashier/till/bank accounts)."""

    queryset = PaymentPoint.objects.select_related("created_by").all()
    serializer_class = PaymentPointSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["method", "is_active"]
    search_fields = ["name", "code", "till_number", "paybill_number", "bank_account_number"]
    ordering_fields = ["name", "method", "created_at"]
    ordering = ["method", "name"]
    tenant_scope = "facility"


class CreditNoteViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for CreditNote model.

    Provides operations for credit notes with approval workflow.
    """

    queryset = CreditNote.objects.select_related(
        "invoice", "patient", "requested_by", "approved_by"
    ).all()
    serializer_class = CreditNoteSerializer
    permission_classes = [IsAuthenticated]
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


@extend_schema_view()
class MpesaViewSet(viewsets.ViewSet):
    """
    ViewSet for M-Pesa integration.

    Provides endpoints for:
    - STK Push initiation
    - Payment callback handling
    - Transaction status queries
    """

    permission_classes = [IsAuthenticated]
    serializer_class = None  # No model serializer - all actions use inline serializers

    @extend_schema(
        request=inline_serializer(
            name="MpesaInitiateRequest",
            fields={
                "invoice_id": serializers.IntegerField(),
                "phone_number": serializers.CharField(),
                "amount": serializers.DecimalField(max_digits=10, decimal_places=2),
                "payment_point": serializers.IntegerField(),
            },
        ),
        responses={
            200: inline_serializer(
                name="MpesaInitiateResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "checkout_request_id": serializers.CharField(required=False),
                    "merchant_request_id": serializers.CharField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    @action(detail=False, methods=["post"])
    def initiate(self, request):
        """
        Initiate M-Pesa STK Push payment.

        POST /api/billing/mpesa/initiate/

        Request body:
        {
            "invoice_id": 123,
            "phone_number": "254712345678",
            "amount": "500.00"
        }
        """
        from django.core.exceptions import ValidationError

        from hmis.apps.billing.services import MpesaService

        invoice_id = request.data.get("invoice_id")
        phone_number = request.data.get("phone_number")
        amount = request.data.get("amount")
        payment_point_id = request.data.get("payment_point")

        if not all([invoice_id, phone_number, amount, payment_point_id]):
            return Response(
                {"error": "invoice_id, phone_number, amount, and payment_point are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Get invoice
            invoice = get_object_or_404(Invoice, id=invoice_id)

            # Validate payment point
            payment_point = get_object_or_404(
                PaymentPoint,
                id=payment_point_id,
                is_active=True,
            )

            if payment_point.method != Payment.Method.MPESA:
                return Response(
                    {"error": "payment_point must be an active M-Pesa payment point"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Convert amount to Decimal
            amount_decimal = Decimal(str(amount))

            # Initiate STK Push (resolve credentials from invoice's facility)
            mpesa_service = MpesaService(facility=invoice.facility)
            normalized_phone = mpesa_service.format_phone(str(phone_number))

            stk_result = mpesa_service.initiate_stk_push(
                phone_number=normalized_phone,
                amount=amount_decimal,
                account_reference=invoice.invoice_number,
                transaction_desc=f"Payment for {invoice.invoice_number}",
            )

            # Persist pending payment so callbacks can be correlated
            payment = Payment.objects.create(
                invoice=invoice,
                payment_point=payment_point,
                method=Payment.Method.MPESA,
                amount=amount_decimal,
                mpesa_phone=normalized_phone,
                status=Payment.Status.PENDING,
                payment_details={
                    "merchant_request_id": stk_result.get("MerchantRequestID"),
                    "checkout_request_id": stk_result.get("CheckoutRequestID"),
                },
                received_by=request.user,
            )

            payment.mpesa_transaction_id = stk_result.get("CheckoutRequestID") or ""
            payment.save(update_fields=["mpesa_transaction_id", "updated_at"])

            return Response(
                {
                    "success": True,
                    "checkout_request_id": stk_result.get("CheckoutRequestID"),
                    "merchant_request_id": stk_result.get("MerchantRequestID"),
                    "response_code": stk_result.get("ResponseCode"),
                    "response_description": stk_result.get("ResponseDescription"),
                    "customer_message": stk_result.get("CustomerMessage"),
                    "payment_id": payment.id,
                    "payment_reference": payment.payment_reference,
                },
                status=status.HTTP_201_CREATED,
            )

        except ValidationError as e:
            # Django ValidationError wraps messages in a list; extract a
            # clean string so the frontend doesn't see ['...'] brackets.
            if hasattr(e, "message"):
                msg = e.message
            elif hasattr(e, "messages"):
                msg = "; ".join(e.messages)
            else:
                msg = str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Failed to initiate M-Pesa payment")
            return Response(
                {"error": "Failed to initiate M-Pesa payment. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="MpesaCallbackResponse",
                fields={
                    "ResultCode": serializers.IntegerField(),
                    "ResultDesc": serializers.CharField(),
                },
            )
        },
    )
    @action(detail=False, methods=["post"], permission_classes=[])
    def callback(self, request):
        """
        Handle M-Pesa payment callback.

        POST /api/billing/mpesa/callback/

        This endpoint receives callbacks from Safaricom M-Pesa API.
        No authentication required for M-Pesa callbacks.
        """
        from django.core.exceptions import ValidationError

        from hmis.apps.billing.services import MpesaService

        try:
            # Look up the pending payment first to resolve the facility
            # for credential loading (callback data contains the CheckoutRequestID)
            body = request.data.get("Body", {})
            stk_cb = body.get("stkCallback", {})
            cb_checkout_id = stk_cb.get("CheckoutRequestID")

            # Resolve facility from existing payment record
            facility = None
            pending_payment = None
            if cb_checkout_id:
                pending_payment = (
                    Payment.objects.filter(mpesa_transaction_id=cb_checkout_id)
                    .select_related("invoice__facility")
                    .first()
                )
                if pending_payment and pending_payment.invoice:
                    facility = pending_payment.invoice.facility

            # Process callback (facility used for credential context)
            mpesa_service = MpesaService(facility=facility)
            payment_data = mpesa_service.process_callback(request.data)

            checkout_request_id = payment_data.get("checkout_request_id")

            payment = pending_payment
            if not payment and checkout_request_id:
                payment = Payment.objects.filter(mpesa_transaction_id=checkout_request_id).first()

            # If payment successful, update the pending Payment record
            if payment and payment_data["success"]:
                if payment.status != Payment.Status.COMPLETED:
                    payment.mpesa_receipt_number = str(
                        payment_data.get("mpesa_receipt_number") or ""
                    )
                    if payment_data.get("phone_number"):
                        payment.mpesa_phone = str(payment_data.get("phone_number"))

                    details = dict(payment.payment_details or {})
                    details.update(
                        {
                            "result_code": payment_data.get("result_code"),
                            "result_description": payment_data.get("result_description"),
                            "merchant_request_id": payment_data.get("merchant_request_id"),
                            "checkout_request_id": payment_data.get("checkout_request_id"),
                            "transaction_date": payment_data.get("transaction_date"),
                        }
                    )
                    payment.payment_details = details
                    payment.save(
                        update_fields=[
                            "mpesa_receipt_number",
                            "mpesa_phone",
                            "payment_details",
                            "updated_at",
                        ]
                    )
                    payment.process()

            elif (
                payment and not payment_data["success"] and payment.status == Payment.Status.PENDING
            ):
                # Mark payment as failed/cancelled
                payment.status = Payment.Status.FAILED
                payment.failure_reason = str(payment_data.get("result_description") or "")
                details = dict(payment.payment_details or {})
                details.update(
                    {
                        "result_code": payment_data.get("result_code"),
                        "result_description": payment_data.get("result_description"),
                        "merchant_request_id": payment_data.get("merchant_request_id"),
                        "checkout_request_id": payment_data.get("checkout_request_id"),
                    }
                )
                payment.payment_details = details
                payment.save(
                    update_fields=["status", "failure_reason", "payment_details", "updated_at"]
                )

            return Response({"ResultCode": 0, "ResultDesc": "Success"}, status=status.HTTP_200_OK)

        except ValidationError as e:
            return Response({"ResultCode": 1, "ResultDesc": str(e)}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("M-Pesa callback processing failed")
            return Response(
                {"ResultCode": 1, "ResultDesc": "Callback processing failed"},
                status=status.HTTP_200_OK,
            )

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "checkout_request_id",
                OpenApiTypes.STR,
                location="path",
                description="M-Pesa checkout request ID",
            ),
        ],
        responses={
            200: inline_serializer(
                name="MpesaQueryResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "result_code": serializers.IntegerField(),
                    "result_description": serializers.CharField(),
                    "checkout_request_id": serializers.CharField(),
                    "amount": serializers.CharField(required=False),
                    "mpesa_receipt_number": serializers.CharField(required=False, allow_null=True),
                    "phone_number": serializers.CharField(required=False, allow_null=True),
                },
            )
        },
    )
    @action(detail=False, methods=["get"], url_path="query/(?P<checkout_request_id>[^/.]+)")
    def query(self, request, checkout_request_id=None):
        """
        Query M-Pesa transaction status.

        GET /api/billing/mpesa/query/{checkout_request_id}/
        """
        from django.core.exceptions import ValidationError

        from hmis.apps.billing.services import MpesaService

        if not checkout_request_id:
            return Response(
                {"error": "checkout_request_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            payment = (
                Payment.objects.filter(mpesa_transaction_id=checkout_request_id)
                .select_related("invoice__facility")
                .first()
            )
            if payment and payment.status == Payment.Status.COMPLETED:
                return Response(
                    {
                        "success": True,
                        "result_code": 0,
                        "result_description": "Success",
                        "checkout_request_id": checkout_request_id,
                        "amount": str(payment.amount),
                        "mpesa_receipt_number": payment.mpesa_receipt_number or None,
                        "phone_number": payment.mpesa_phone or None,
                    },
                    status=status.HTTP_200_OK,
                )

            if payment and payment.status == Payment.Status.FAILED:
                return Response(
                    {
                        "success": False,
                        "result_code": 1,
                        "result_description": payment.failure_reason or "Failed",
                        "checkout_request_id": checkout_request_id,
                    },
                    status=status.HTTP_200_OK,
                )

            # Resolve facility for credential loading
            facility = None
            if payment and payment.invoice:
                facility = payment.invoice.facility

            mpesa_service = MpesaService(facility=facility)
            result = mpesa_service.query_transaction_status(checkout_request_id)

            result_code_raw = result.get("ResultCode")
            result_desc = result.get("ResultDesc") or result.get("ResponseDescription") or ""

            # Safaricom signals "still processing" in two ways:
            # 1. ResultCode is absent/None
            # 2. ResultCode is non-zero BUT ResultDesc contains "being processed"
            #    or "still under processing" (observed in sandbox)
            still_processing = result_code_raw is None or (
                "processing" in result_desc.lower() or "being processed" in result_desc.lower()
            )

            if still_processing:
                return Response(
                    {
                        "success": False,
                        "result_code": None,
                        "result_description": result_desc or "Transaction is being processed",
                        "checkout_request_id": result.get("CheckoutRequestID")
                        or checkout_request_id,
                        "pending": True,
                    },
                    status=status.HTTP_200_OK,
                )

            try:
                result_code = int(result_code_raw)
            except (TypeError, ValueError):
                result_code = 1

            return Response(
                {
                    "success": result_code == 0,
                    "result_code": result_code,
                    "result_description": result_desc,
                    "checkout_request_id": result.get("CheckoutRequestID") or checkout_request_id,
                    "pending": False,
                },
                status=status.HTTP_200_OK,
            )

        except ValidationError as e:
            msg = (
                e.message
                if hasattr(e, "message")
                else "; ".join(e.messages)
                if hasattr(e, "messages")
                else str(e)
            )
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Failed to query M-Pesa transaction status")
            return Response(
                {"error": "Failed to query transaction status. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="MpesaVerifyRequest",
            fields={
                "transaction_id": serializers.CharField(
                    help_text="M-Pesa receipt number / transaction code to verify"
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name="MpesaVerifyResponse",
                fields={
                    "verified": serializers.BooleanField(),
                    "receipt_number": serializers.CharField(),
                    "error": serializers.CharField(allow_null=True),
                },
            )
        },
    )
    @action(detail=False, methods=["post"], url_path="verify")
    def verify(self, request):
        """
        Verify an M-Pesa transaction code before recording a manual payment.

        POST /api/billing/mpesa/verify/
        { "transaction_id": "SLK4H42RQO" }

        Returns whether the transaction ID is recognised by Safaricom,
        helping prevent fraud from fake M-Pesa SMS screenshots.
        """
        from django.core.exceptions import ValidationError as DjangoValidationError

        from hmis.apps.billing.services import MpesaService

        transaction_id = request.data.get("transaction_id", "").strip().upper()
        if not transaction_id:
            return Response(
                {"error": "transaction_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Basic format validation — M-Pesa codes are 10 alphanumeric chars
        if not transaction_id.isalnum() or len(transaction_id) < 8 or len(transaction_id) > 12:
            return Response(
                {
                    "verified": False,
                    "receipt_number": transaction_id,
                    "error": "Invalid M-Pesa transaction code format. Expected 8-12 alphanumeric characters.",
                },
                status=status.HTTP_200_OK,
            )

        # Check for duplicate — has this code already been recorded?
        existing = Payment.objects.filter(mpesa_receipt_number=transaction_id).first()
        if existing:
            return Response(
                {
                    "verified": False,
                    "receipt_number": transaction_id,
                    "error": (
                        f"This transaction code has already been used on payment "
                        f"{existing.payment_reference} for invoice "
                        f"{existing.invoice.invoice_number}."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        try:
            mpesa_service = MpesaService()
            result = mpesa_service.verify_transaction(transaction_id)
            return Response(result, status=status.HTTP_200_OK)

        except DjangoValidationError as e:
            msg = (
                e.message
                if hasattr(e, "message")
                else "; ".join(e.messages)
                if hasattr(e, "messages")
                else str(e)
            )
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("M-Pesa verification failed")
            return Response(
                {"error": "Verification failed. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@extend_schema_view()
class ReportViewSet(viewsets.ViewSet):
    """
    ViewSet for billing reports.

    Provides read-only endpoints for financial reports.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = None  # No model serializer - all actions return dict responses

    def _get_report_service(self, request):
        """Create BillingReportService scoped to the current tenant."""
        from hmis.apps.billing.reports import BillingReportService

        return BillingReportService(
            facility=getattr(request, "facility", None),
            organization=getattr(request, "organization", None),
        )

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "date", OpenApiTypes.DATE, description="Report date (YYYY-MM-DD)", required=True
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="daily-collection")
    def daily_collection(self, request):
        """Get daily collection report."""
        report_date = request.query_params.get("date")
        if not report_date:
            return Response(
                {"error": "date parameter is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            report_date = date.fromisoformat(report_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST
            )

        service = self._get_report_service(request)
        report = service.daily_collection_report(report_date)

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                description="Start date (YYYY-MM-DD)",
                required=True,
            ),
            OpenApiParameter(
                "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="revenue-summary")
    def revenue_summary(self, request):
        """Get revenue summary for date range."""
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        if not start_date or not end_date:
            return Response(
                {"error": "start_date and end_date parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_date)
            end_date = date.fromisoformat(end_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST
            )

        service = self._get_report_service(request)
        report = service.revenue_summary(start_date, end_date)

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="outstanding-balances")
    def outstanding_balances(self, request):
        """Get list of outstanding invoices."""
        service = self._get_report_service(request)
        report = service.outstanding_balances()

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                description="Start date (YYYY-MM-DD)",
                required=True,
            ),
            OpenApiParameter(
                "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="service-utilization")
    def service_utilization(self, request):
        """Get service utilization report."""
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        if not start_date or not end_date:
            return Response(
                {"error": "start_date and end_date parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_date)
            end_date = date.fromisoformat(end_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST
            )

        service = self._get_report_service(request)
        report = service.service_utilization(start_date, end_date)

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                description="Start date (YYYY-MM-DD)",
                required=True,
            ),
            OpenApiParameter(
                "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="payment-analysis")
    def payment_analysis(self, request):
        """Get payment method analysis."""
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        if not start_date or not end_date:
            return Response(
                {"error": "start_date and end_date parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_date)
            end_date = date.fromisoformat(end_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST
            )

        service = self._get_report_service(request)
        report = service.payment_method_analysis(start_date, end_date)

        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="daily-closure")
    def daily_closure(self, request):
        """Get end-of-day closure report."""
        report_date = request.query_params.get("date")
        if not report_date:
            return Response(
                {"error": "date parameter is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            report_date = date.fromisoformat(report_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST
            )

        service = self._get_report_service(request)
        report = service.daily_closure_report(report_date)

        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="discrepancies")
    def discrepancies(self, request):
        """Get billing discrepancies report."""
        service = self._get_report_service(request)
        report = service.billing_discrepancies()

        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="unbilled-services")
    def unbilled_services(self, request):
        """Get unbilled services by department."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService()
        report = service.unbilled_services()

        return Response(report, status=status.HTTP_200_OK)


# ============================================================================
# Facility Billing Config ViewSet
# ============================================================================


class FacilityBillingConfigViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for per-facility billing configuration.

    Provides CRUD for FacilityBillingConfig, plus:
    - SHA contract tracking across the organization
    - Facility-scoped daily collection report

    Permissions:
    - List/retrieve: any authenticated user
    - Create/update/delete: requires billing admin permissions
    """

    tenant_facility_chain = ""
    tenant_org_chain = "facility__organization"
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["facility", "sha_accreditation_status", "default_payment_type"]
    search_fields = ["facility__name", "facility__mfl_code", "sha_contract_number"]
    queryset = FacilityBillingConfig.objects.select_related("facility").all()

    def get_serializer_class(self):
        from hmis.apps.billing.serializers import (
            FacilityBillingConfigCreateSerializer,
            FacilityBillingConfigSerializer,
        )

        if self.action in ("create", "update", "partial_update"):
            return FacilityBillingConfigCreateSerializer
        return FacilityBillingConfigSerializer

    def create(self, request, *args, **kwargs):
        """Create config and return full read serializer response."""
        from hmis.apps.billing.serializers import FacilityBillingConfigSerializer

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read_serializer = FacilityBillingConfigSerializer(serializer.instance)
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Update config and return full read serializer response."""
        from hmis.apps.billing.serializers import FacilityBillingConfigSerializer

        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}
        read_serializer = FacilityBillingConfigSerializer(serializer.instance)
        return Response(read_serializer.data)

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
        parameters=[
            OpenApiParameter(
                "status",
                OpenApiTypes.STR,
                description="Filter by accreditation status",
            ),
        ],
    )
    @action(detail=False, methods=["get"], url_path="sha-contracts")
    def sha_contracts(self, request):
        """
        Get SHA contract tracking summary across all facilities.

        GET /api/billing/facility-configs/sha-contracts/
        GET /api/billing/facility-configs/sha-contracts/?status=accredited

        Returns list of facilities with their SHA accreditation
        and contract details for organization-level tracking.
        """
        from hmis.apps.billing.serializers import SHAContractSummarySerializer

        queryset = self.get_queryset().exclude(
            sha_accreditation_status="not_applied",
        )

        # Optional status filter
        accreditation_status = request.query_params.get("status")
        if accreditation_status:
            queryset = queryset.filter(sha_accreditation_status=accreditation_status)

        data = []
        for config in queryset:
            data.append(
                {
                    "facility_id": config.facility_id,
                    "facility_name": config.facility.name,
                    "facility_mfl_code": config.facility.mfl_code,
                    "sha_accreditation_status": config.sha_accreditation_status,
                    "sha_accreditation_expiry": config.sha_accreditation_expiry,
                    "sha_contract_number": config.sha_contract_number,
                    "sha_contract_start": config.sha_contract_start,
                    "sha_contract_end": config.sha_contract_end,
                    "sha_service_level": config.sha_service_level,
                    "is_sha_accredited": config.is_sha_accredited,
                    "is_sha_contract_active": config.is_sha_contract_active,
                    "sha_accreditation_days_remaining": config.sha_accreditation_days_remaining,
                    "sha_contract_days_remaining": config.sha_contract_days_remaining,
                }
            )

        serializer = SHAContractSummarySerializer(data, many=True)
        return Response(serializer.data)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "date",
                OpenApiTypes.DATE,
                description="Report date (YYYY-MM-DD)",
                required=True,
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=True, methods=["get"], url_path="daily-collection")
    def daily_collection(self, request, pk=None):
        """
        Facility-scoped daily collection report.

        GET /api/billing/facility-configs/{id}/daily-collection/?date=2026-03-26

        Generates a daily collection report for the specific facility
        referenced by this billing config.
        """
        from hmis.apps.billing.reports import BillingReportService

        config = self.get_object()
        report_date = request.query_params.get("date")
        if not report_date:
            return Response(
                {"error": "date parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            report_date = date.fromisoformat(report_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = BillingReportService(facility=config.facility)
        report = service.daily_collection_report(report_date)

        # Add facility context to the report
        report["facility_name"] = config.facility.name
        report["facility_mfl_code"] = config.facility.mfl_code

        return Response(report)


# ===========================================================================
# Accounts Payable: Supplier Bills & Payments
# ===========================================================================


class SupplierBillViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
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
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
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

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """Mark a DRAFT bill as RECEIVED."""
        bill = self.get_object()
        try:
            bill.receive()
        except ValidationError as e:
            return Response({"error": str(e.message)}, status=status.HTTP_400_BAD_REQUEST)
        from hmis.apps.billing.serializers import SupplierBillSerializer

        return Response(SupplierBillSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a RECEIVED bill for payment."""
        bill = self.get_object()
        try:
            bill.approve(user=request.user)
        except ValidationError as e:
            return Response({"error": str(e.message)}, status=status.HTTP_400_BAD_REQUEST)
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
            return Response({"error": str(e.message)}, status=status.HTTP_400_BAD_REQUEST)
        from hmis.apps.billing.serializers import SupplierBillSerializer

        return Response(SupplierBillSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a bill."""
        bill = self.get_object()
        try:
            bill.cancel()
        except ValidationError as e:
            return Response({"error": str(e.message)}, status=status.HTTP_400_BAD_REQUEST)
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


class SupplierPaymentViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for supplier payments (outflows to vendors).

    Supports creating payments against approved bills and reversals.
    """

    from hmis.apps.billing.models import SupplierPayment

    queryset = SupplierPayment.objects.select_related("bill", "supplier", "paid_by").all()
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
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

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        """Reverse a completed supplier payment."""
        payment = self.get_object()
        reason = request.data.get("reason", "")
        try:
            payment.reverse(reason=reason)
        except ValidationError as e:
            return Response({"error": str(e.message)}, status=status.HTTP_400_BAD_REQUEST)
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
