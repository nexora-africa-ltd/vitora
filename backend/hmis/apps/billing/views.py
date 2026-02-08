"""
Views for the billing app.

Following TDD - implemented to pass API tests.
"""

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.filters import CreditNoteFilter, InvoiceFilter, PaymentFilter
from hmis.apps.billing.models import (
    CreditNote,
    Invoice,
    InvoiceItem,
    Payment,
    PaymentPoint,
    Receipt,
    Service,
    ServiceCategory,
)
from hmis.apps.billing.serializers import (
    CreditNoteSerializer,
    InvoiceItemSerializer,
    InvoiceSerializer,
    PaymentPointSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    ServiceCategorySerializer,
    ServiceSerializer,
)


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


class InvoiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Invoice model.

    Provides CRUD operations for invoices with custom actions.
    """

    queryset = (
        Invoice.objects.select_related("patient", "encounter", "created_by", "cancelled_by")
        .prefetch_related("items")
        .all()
    )
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
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
            OpenApiParameter("item_id", OpenApiTypes.INT, location="path", description="Invoice item ID to remove"),
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


class PaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Payment model.

    Provides operations for recording and managing payments.
    """

    queryset = Payment.objects.select_related("invoice", "received_by").all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PaymentFilter
    search_fields = ["reference", "mpesa_receipt_number", "transaction_reference"]
    ordering_fields = ["payment_date", "amount", "created_at"]
    ordering = ["-payment_date"]

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


class PaymentPointViewSet(viewsets.ModelViewSet):
    """ViewSet for managing payment points (cashier/till/bank accounts)."""

    queryset = PaymentPoint.objects.select_related("created_by").all()
    serializer_class = PaymentPointSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["method", "is_active"]
    search_fields = ["name", "code", "till_number", "paybill_number", "bank_account_number"]
    ordering_fields = ["name", "method", "created_at"]
    ordering = ["method", "name"]


class CreditNoteViewSet(viewsets.ModelViewSet):
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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve credit note."""
        credit_note = self.get_object()

        try:
            credit_note.approve(request.user)
            serializer = self.get_serializer(credit_note)
            return Response(serializer.data)
        except ValueError as e:
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

            # Initiate STK Push
            mpesa_service = MpesaService()
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
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"Failed to initiate M-Pesa payment: {str(e)}"},
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
            # Process callback
            mpesa_service = MpesaService()
            payment_data = mpesa_service.process_callback(request.data)

            checkout_request_id = payment_data.get("checkout_request_id")

            payment = None
            if checkout_request_id:
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
        except Exception as e:
            return Response(
                {"ResultCode": 1, "ResultDesc": f"Callback processing failed: {str(e)}"},
                status=status.HTTP_200_OK,
            )

    @extend_schema(
        parameters=[
            OpenApiParameter("checkout_request_id", OpenApiTypes.STR, location="path", description="M-Pesa checkout request ID"),
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
            payment = Payment.objects.filter(mpesa_transaction_id=checkout_request_id).first()
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

            mpesa_service = MpesaService()
            result = mpesa_service.query_transaction_status(checkout_request_id)

            try:
                result_code_raw = result.get("ResultCode")
                result_code = int(result_code_raw) if result_code_raw is not None else 1
            except (TypeError, ValueError):
                result_code = 1

            result_desc = result.get("ResultDesc") or result.get("ResponseDescription") or ""

            return Response(
                {
                    "success": result_code == 0,
                    "result_code": result_code,
                    "result_description": result_desc,
                    "checkout_request_id": result.get("CheckoutRequestID") or checkout_request_id,
                },
                status=status.HTTP_200_OK,
            )

        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"Failed to query transaction status: {str(e)}"},
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

    @extend_schema(
        parameters=[
            OpenApiParameter("date", OpenApiTypes.DATE, description="Report date (YYYY-MM-DD)", required=True),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="daily-collection")
    def daily_collection(self, request):
        """Get daily collection report."""
        from hmis.apps.billing.reports import BillingReportService

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

        service = BillingReportService()
        report = service.daily_collection_report(report_date)

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter("start_date", OpenApiTypes.DATE, description="Start date (YYYY-MM-DD)", required=True),
            OpenApiParameter("end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="revenue-summary")
    def revenue_summary(self, request):
        """Get revenue summary for date range."""
        from hmis.apps.billing.reports import BillingReportService

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

        service = BillingReportService()
        report = service.revenue_summary(start_date, end_date)

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="outstanding-balances")
    def outstanding_balances(self, request):
        """Get list of outstanding invoices."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService()
        report = service.outstanding_balances()

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter("start_date", OpenApiTypes.DATE, description="Start date (YYYY-MM-DD)", required=True),
            OpenApiParameter("end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="service-utilization")
    def service_utilization(self, request):
        """Get service utilization report."""
        from hmis.apps.billing.reports import BillingReportService

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

        service = BillingReportService()
        report = service.service_utilization(start_date, end_date)

        return Response(report, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[
            OpenApiParameter("start_date", OpenApiTypes.DATE, description="Start date (YYYY-MM-DD)", required=True),
            OpenApiParameter("end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="payment-analysis")
    def payment_analysis(self, request):
        """Get payment method analysis."""
        from hmis.apps.billing.reports import BillingReportService

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

        service = BillingReportService()
        report = service.payment_method_analysis(start_date, end_date)

        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="daily-closure")
    def daily_closure(self, request):
        """Get end-of-day closure report."""
        from hmis.apps.billing.reports import BillingReportService

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

        service = BillingReportService()
        report = service.daily_closure_report(report_date)

        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="discrepancies")
    def discrepancies(self, request):
        """Get billing discrepancies report."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService()
        report = service.billing_discrepancies()

        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="unbilled-services")
    def unbilled_services(self, request):
        """Get unbilled services by department."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService()
        report = service.unbilled_services()

        return Response(report, status=status.HTTP_200_OK)
