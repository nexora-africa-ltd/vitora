# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002
"""Billing views mpesa reports for Vitora HMIS.

What this file is for:
- Implement views mpesa reports logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
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

from hmis.apps.billing.models import FacilityBillingConfig, Invoice, Payment, PaymentPoint, Service
from hmis.apps.billing.services.mpesa import MpesaConfigurationError
from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import NestedTenantScopeMixin, resolve_request_tenant
from hmis.apps.core.models import Facility
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


@extend_schema_view()
class MpesaViewSet(viewsets.ViewSet):
    """
    ViewSet for M-Pesa integration.

    Provides endpoints for:
    - STK Push initiation
    - Payment callback handling
    - Transaction status queries
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    serializer_class = None  # No model serializer - all actions use inline serializers

    def _request_facility(self, request):
        """Resolve an authorized active facility, never an unscoped merchant."""
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility is None:
            raise MpesaConfigurationError("Select an authorized facility for M-Pesa payments.")
        return facility

    @staticmethod
    def _mpesa_error_map() -> tuple[tuple[type[Exception], int, str, str], ...]:
        return (
            (
                MpesaConfigurationError,
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "mpesa_configuration_error",
                "Facility M-Pesa configuration is incomplete.",
            ),
            (
                ValidationError,
                status.HTTP_400_BAD_REQUEST,
                "validation_error",
                "Request validation failed.",
            ),
            (
                ValueError,
                status.HTTP_400_BAD_REQUEST,
                "invalid_request",
                "Invalid input for M-Pesa request.",
            ),
            (
                RuntimeError,
                status.HTTP_502_BAD_GATEWAY,
                "mpesa_transport_error",
                "Temporary M-Pesa upstream error.",
            ),
            (
                TypeError,
                status.HTTP_502_BAD_GATEWAY,
                "mpesa_transport_error",
                "Temporary M-Pesa upstream error.",
            ),
        )

    def _handle_mpesa_error(
        self,
        *,
        action: str,
        exc: Exception,
        callback_mode: bool = False,
    ) -> Response:
        for error_cls, http_status, code, message in self._mpesa_error_map():
            if isinstance(exc, error_cls):
                logger.warning(
                    "M-Pesa action failed",
                    extra={
                        "action": action,
                        "error_class": exc.__class__.__name__,
                        "error": str(exc),
                    },
                )
                if callback_mode:
                    return Response(
                        {
                            "ResultCode": 1,
                            "ResultDesc": str(exc) if code == "validation_error" else message,
                        },
                        status=status.HTTP_200_OK,
                    )
                if code in {"validation_error", "mpesa_configuration_error"}:
                    return Response({"error": str(exc), "code": code}, status=http_status)
                return Response({"error": message, "code": code}, status=http_status)

        logger.exception("Unhandled M-Pesa action error", extra={"action": action})
        if callback_mode:
            return Response(
                {"ResultCode": 1, "ResultDesc": "Callback processing failed"},
                status=status.HTTP_200_OK,
            )
        return Response(
            {"error": "Unexpected M-Pesa processing error.", "code": "internal_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

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
            facility = self._request_facility(request)
            invoice = get_object_or_404(Invoice, id=invoice_id, facility=facility)

            # Validate payment point
            payment_point = get_object_or_404(
                PaymentPoint,
                id=payment_point_id,
                is_active=True,
                facility=facility,
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

        except (ValidationError, ValueError, TypeError, RuntimeError) as exc:
            return self._handle_mpesa_error(action="initiate", exc=exc)

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
            if pending_payment is None or facility is None:
                return Response(
                    {"ResultCode": 1, "ResultDesc": "Unknown facility payment reference."}
                )
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

        except (ValidationError, ValueError, TypeError, RuntimeError) as exc:
            return self._handle_mpesa_error(action="callback", exc=exc, callback_mode=True)

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
            facility = self._request_facility(request)
            # Check ownership before returning even locally cached payment data.
            if (
                Payment.objects.filter(mpesa_transaction_id=checkout_request_id)
                .exclude(invoice__facility=facility)
                .exists()
            ):
                return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)
            payment = (
                Payment.objects.filter(
                    mpesa_transaction_id=checkout_request_id, invoice__facility=facility
                )
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

        except (ValidationError, ValueError, TypeError, RuntimeError) as exc:
            return self._handle_mpesa_error(action="query", exc=exc)

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

        try:
            facility = self._request_facility(request)
        except MpesaConfigurationError as exc:
            return self._handle_mpesa_error(action="verify", exc=exc)

        # Check for duplicate — has this code already been recorded?
        existing = Payment.objects.filter(mpesa_receipt_number=transaction_id).first()
        if existing:
            return Response(
                {
                    "verified": False,
                    "receipt_number": transaction_id,
                    "error": ("This transaction code has already been used."),
                },
                status=status.HTTP_200_OK,
            )

        try:
            mpesa_service = MpesaService(facility=facility)
            result = mpesa_service.verify_transaction(transaction_id)
            return Response(result, status=status.HTTP_200_OK)

        except (DjangoValidationError, ValueError, TypeError, RuntimeError) as exc:
            return self._handle_mpesa_error(action="verify", exc=exc)


@extend_schema_view()
class ReportViewSet(viewsets.ViewSet):
    """
    ViewSet for billing reports.

    Provides read-only endpoints for financial reports.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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


class FacilityBillingConfigViewSet(
    AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet
):
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
    audit_resource_type = "FacilityBillingConfig"
    audit_action_prefix = "billing.facility_config"
    audit_source = "billing_api"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["facility", "sha_accreditation_status", "default_payment_type"]
    search_fields = ["facility__name", "facility__mfl_code", "sha_contract_number"]
    queryset = FacilityBillingConfig.objects.select_related("facility").order_by(
        "facility__name", "id"
    )

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

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "facility",
                OpenApiTypes.INT,
                description="Facility ID (defaults to active facility context when omitted)",
                required=False,
            )
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="guards/admission-services")
    def admission_service_guard(self, request):
        """Flag missing inpatient billing service codes needed for admission billing."""
        facility_id = request.query_params.get("facility")

        if facility_id:
            try:
                facility = Facility.objects.get(pk=int(facility_id))
            except (ValueError, Facility.DoesNotExist):
                return Response(
                    {"detail": "Facility not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            facility = getattr(request, "facility", None)
            if facility is None:
                return Response(
                    {
                        "detail": "Provide ?facility=<id> or use an active facility context.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        required_codes = ["ADM-FEE"]
        services = Service.objects.filter(
            code__in=required_codes,
            is_active=True,
        ).select_related("category")

        by_code = {service.code: service for service in services}
        missing_codes = [code for code in required_codes if code not in by_code]

        if missing_codes:
            guard_status = "warning"
            message = (
                f"Required admission billing services are missing: {', '.join(missing_codes)}."
            )
        else:
            guard_status = "ok"
            message = "Required admission billing services are configured."

        return Response(
            {
                "facility": {
                    "id": facility.id,
                    "name": facility.name,
                    "mfl_code": facility.mfl_code,
                    "has_inpatient": bool(getattr(facility, "has_inpatient", True)),
                },
                "required_codes": required_codes,
                "present_services": [
                    {
                        "code": svc.code,
                        "name": svc.name,
                        "category_code": getattr(svc.category, "code", ""),
                    }
                    for svc in by_code.values()
                ],
                "missing_codes": missing_codes,
                "status": guard_status,
                "message": message,
            }
        )


# ===========================================================================
# Accounts Payable: Supplier Bills & Payments
# ===========================================================================
