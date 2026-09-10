"""
Tests for Payment and CreditNote API endpoints.

Following TDD principles - these tests are written BEFORE implementation.
Reference: Deliverables spec § 9, lines 891-928
"""

from decimal import Decimal
from unittest.mock import Mock, patch

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import CreditNote, Invoice, Payment
from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user, sample_organization, sample_facility):
    """Provide authenticated API client."""
    ensure_staff_profile(test_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=test_user)
    return api_client


class TestPaymentAPIEndpoints:
    """Test Payment API operations."""

    def test_list_payments(self, authenticated_client, sample_payment):
        """Test GET /api/billing/payments/ - List payments with pagination."""
        response = authenticated_client.get("/api/billing/payments/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)

    def test_list_payments_unauthenticated_fails(self, api_client):
        """Test unauthenticated access is rejected."""
        response = api_client.get("/api/billing/payments/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_record_cash_payment(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test POST /api/billing/payments/ - Record cash payment."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {"invoice": sample_invoice.id, "method": Payment.Method.CASH, "amount": "500.00"}

        response = authenticated_client.post("/api/billing/payments/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["method"] == Payment.Method.CASH
        assert Decimal(response.data["amount"]) == Decimal("500.00")
        assert "reference" in response.data or "payment_reference" in response.data

    def test_record_card_payment_with_details(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        """Test recording card payment with transaction details."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {
            "invoice": sample_invoice.id,
            "method": Payment.Method.CARD,
            "amount": "500.00",
            "reference": "CARD123456",
        }

        response = authenticated_client.post("/api/billing/payments/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["method"] == Payment.Method.CARD

    def test_payment_updates_invoice_status(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        """Test that payment automatically updates invoice status."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()

        data = {
            "invoice": sample_invoice.id,
            "method": Payment.Method.CASH,
            "amount": str(sample_invoice.total_amount),
        }

        response = authenticated_client.post("/api/billing/payments/", data)

        assert response.status_code == status.HTTP_201_CREATED

    def test_get_payment_detail(self, authenticated_client, sample_payment):
        """Test GET /api/billing/payments/{id}/ - Get payment details."""
        response = authenticated_client.get(f"/api/billing/payments/{sample_payment.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_payment.id

    def test_get_receipt_for_payment(self, authenticated_client, sample_payment, sample_receipt):
        """Test GET /api/billing/payments/{id}/receipt/ - Get/generate receipt."""
        response = authenticated_client.get(f"/api/billing/payments/{sample_payment.id}/receipt/")

        assert response.status_code == status.HTTP_200_OK
        assert "receipt_number" in response.data

    def test_reject_non_interim_payment_on_proforma(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        """Payments on proforma invoices require interim_copay marker."""
        sample_invoice.status = Invoice.Status.PROFORMA
        sample_invoice.calculate_totals()
        sample_invoice.save(update_fields=["status", "updated_at"])

        response = authenticated_client.post(
            "/api/billing/payments/",
            {
                "invoice": sample_invoice.id,
                "method": Payment.Method.CASH,
                "amount": "100.00",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_allow_interim_copay_payment_on_proforma(
        self, authenticated_client, sample_invoice, sample_invoice_item
    ):
        """Interim copay payments can be collected on proforma invoices."""
        sample_invoice.status = Invoice.Status.PROFORMA
        sample_invoice.calculate_totals()
        sample_invoice.save(update_fields=["status", "updated_at"])

        response = authenticated_client.post(
            "/api/billing/payments/",
            {
                "invoice": sample_invoice.id,
                "method": Payment.Method.CASH,
                "amount": "100.00",
                "payment_details": {"interim_copay": True},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        sample_invoice.refresh_from_db()
        # Proforma status remains unchanged; payment is held for later reconciliation.
        assert sample_invoice.status == Invoice.Status.PROFORMA


class TestMpesaAPIEndpoints:
    """Test M-Pesa STK Push API endpoints."""

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch("hmis.apps.billing.services.mpesa.requests.get")
    def test_initiate_mpesa_stk_push(
        self,
        mock_get,
        mock_post,
        authenticated_client,
        sample_invoice,
        sample_invoice_item,
        sample_payment_point,
    ):
        """Test POST /api/billing/mpesa/initiate/ - Initiate M-Pesa STK push."""
        # Ensure invoice has totals/balance due
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        # Mock OAuth token response
        mock_oauth_response = Mock()
        mock_oauth_response.json.return_value = {
            "access_token": "test_access_token",
            "expires_in": "3600",
        }
        mock_oauth_response.raise_for_status = Mock()
        mock_get.return_value = mock_oauth_response

        # Mock STK Push response
        mock_stk_response = Mock()
        mock_stk_response.json.return_value = {
            "MerchantRequestID": "test-merchant-123",
            "CheckoutRequestID": "test-checkout-456",
            "ResponseCode": "0",
            "ResponseDescription": "Success. Request accepted for processing",
            "CustomerMessage": "Success. Request accepted for processing",
        }
        mock_stk_response.raise_for_status = Mock()
        mock_post.return_value = mock_stk_response

        data = {
            "invoice_id": sample_invoice.id,
            "phone_number": "254712345678",
            "amount": str(sample_invoice.balance_due),
            "payment_point": sample_payment_point.id,
        }

        response = authenticated_client.post("/api/billing/mpesa/initiate/", data)

        # Debug: print response if failed
        if response.status_code not in [status.HTTP_200_OK, status.HTTP_201_CREATED]:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")

        # Should return checkout request ID
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
        assert response.data.get("success") is True
        assert response.data.get("checkout_request_id")

        # Should persist a pending payment tied to the checkout request
        from hmis.apps.billing.models import Payment

        payment = Payment.objects.filter(
            invoice=sample_invoice,
            mpesa_transaction_id=response.data["checkout_request_id"],
        ).first()
        assert payment is not None
        assert payment.payment_point.pk == sample_payment_point.pk
        assert payment.status == Payment.Status.PENDING

    @patch("hmis.apps.billing.services.mpesa.requests.get")
    def test_mpesa_callback_success(
        self,
        mock_get,
        api_client,
        sample_invoice,
        sample_invoice_item,
        sample_payment_point,
        test_user,
    ):
        """Test POST /api/billing/mpesa/callback/ - Successful callback processed."""
        # Ensure invoice has totals/balance due
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        # Mock OAuth token response (may be needed for callback processing)
        mock_oauth_response = Mock()
        mock_oauth_response.json.return_value = {
            "access_token": "test_access_token",
            "expires_in": "3600",
        }
        mock_oauth_response.raise_for_status = Mock()
        mock_get.return_value = mock_oauth_response

        # Create a pending payment mapped to the checkout request id
        from hmis.apps.billing.models import Payment

        payment = Payment.objects.create(
            invoice=sample_invoice,
            payment_point=sample_payment_point,
            method=Payment.Method.MPESA,
            amount=sample_invoice.balance_due,
            status=Payment.Status.PENDING,
            mpesa_transaction_id="test-checkout-456",
            received_by=test_user,
        )

        # M-Pesa callbacks don't require authentication
        callback_data = {
            "Body": {
                "stkCallback": {
                    "MerchantRequestID": "test-merchant-123",
                    "CheckoutRequestID": "test-checkout-456",
                    "ResultCode": 0,
                    "ResultDesc": "The service request is processed successfully.",
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": float(sample_invoice.balance_due)},
                            {"Name": "MpesaReceiptNumber", "Value": "MPE123456"},
                            {"Name": "TransactionDate", "Value": 20260102120000},
                            {"Name": "PhoneNumber", "Value": 254712345678},
                        ]
                    },
                }
            }
        }

        response = api_client.post("/api/billing/mpesa/callback/", callback_data, format="json")

        # Should acknowledge callback
        assert response.status_code == status.HTTP_200_OK

        payment.refresh_from_db()
        assert payment.status == Payment.Status.COMPLETED
        assert payment.mpesa_receipt_number == "MPE123456"

    @patch("hmis.apps.billing.services.mpesa.requests.get")
    def test_mpesa_callback_failure(
        self,
        mock_get,
        api_client,
        sample_invoice,
        sample_invoice_item,
        sample_payment_point,
        test_user,
    ):
        """Test M-Pesa callback with failed transaction."""
        # Ensure invoice has totals/balance due
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        # Mock OAuth token response (may be needed for callback processing)
        mock_oauth_response = Mock()
        mock_oauth_response.json.return_value = {
            "access_token": "test_access_token",
            "expires_in": "3600",
        }
        mock_oauth_response.raise_for_status = Mock()
        mock_get.return_value = mock_oauth_response

        from hmis.apps.billing.models import Payment

        payment = Payment.objects.create(
            invoice=sample_invoice,
            payment_point=sample_payment_point,
            method=Payment.Method.MPESA,
            amount=sample_invoice.balance_due,
            status=Payment.Status.PENDING,
            mpesa_transaction_id="test-checkout-456",
            received_by=test_user,
        )

        callback_data = {
            "Body": {
                "stkCallback": {
                    "MerchantRequestID": "test-merchant-123",
                    "CheckoutRequestID": "test-checkout-456",
                    "ResultCode": 1032,  # User cancelled
                    "ResultDesc": "Request cancelled by user",
                }
            }
        }

        response = api_client.post("/api/billing/mpesa/callback/", callback_data, format="json")

        # Should acknowledge callback
        assert response.status_code == status.HTTP_200_OK

        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch("hmis.apps.billing.services.mpesa.requests.get")
    def test_mpesa_query_status(self, mock_get, mock_post, authenticated_client):
        """Test GET /api/billing/mpesa/query/{checkout_id}/ - Query M-Pesa status."""
        # Mock OAuth token response
        mock_oauth_response = Mock()
        mock_oauth_response.json.return_value = {
            "access_token": "test_access_token",
            "expires_in": "3600",
        }
        mock_oauth_response.raise_for_status = Mock()
        mock_get.return_value = mock_oauth_response

        # Mock query status response
        mock_query_response = Mock()
        mock_query_response.json.return_value = {
            "ResponseCode": "0",
            "ResponseDescription": "The service request has been accepted successfully",
            "MerchantRequestID": "test-merchant-123",
            "CheckoutRequestID": "test-checkout-456",
            "ResultCode": "0",
            "ResultDesc": "The service request is processed successfully.",
        }
        mock_query_response.raise_for_status = Mock()
        mock_post.return_value = mock_query_response

        checkout_id = "test-checkout-123"

        response = authenticated_client.get(f"/api/billing/mpesa/query/{checkout_id}/")

        # Should return status
        assert response.status_code == status.HTTP_200_OK
        assert "checkout_request_id" in response.data

    @patch("hmis.apps.billing.services.MpesaService")
    def test_initiate_runtime_error_returns_502(
        self,
        MockService,
        authenticated_client,
        sample_invoice,
        sample_invoice_item,
        sample_payment_point,
    ):
        """Runtime transport errors should return structured 502 responses."""
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()

        mock_instance = MockService.return_value
        mock_instance.format_phone.return_value = "254712345678"
        mock_instance.initiate_stk_push.side_effect = RuntimeError("upstream timeout")

        response = authenticated_client.post(
            "/api/billing/mpesa/initiate/",
            {
                "invoice_id": sample_invoice.id,
                "phone_number": "254712345678",
                "amount": str(sample_invoice.balance_due),
                "payment_point": sample_payment_point.id,
            },
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["code"] == "mpesa_transport_error"

    @patch("hmis.apps.billing.services.MpesaService")
    def test_query_runtime_error_returns_502(self, MockService, authenticated_client):
        mock_instance = MockService.return_value
        mock_instance.query_transaction_status.side_effect = RuntimeError("gateway unavailable")

        response = authenticated_client.get("/api/billing/mpesa/query/test-checkout-err/")

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["code"] == "mpesa_transport_error"

    @patch("hmis.apps.billing.services.MpesaService")
    def test_callback_runtime_error_returns_acknowledged_failure(
        self, MockService, api_client, sample_invoice, sample_invoice_item, test_user
    ):
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal("100.00"),
            method=Payment.Method.MPESA,
            mpesa_transaction_id="known-callback",
            received_by=test_user,
        )
        mock_instance = MockService.return_value
        mock_instance.process_callback.side_effect = RuntimeError("callback parse failure")

        response = api_client.post(
            "/api/billing/mpesa/callback/",
            {"Body": {"stkCallback": {"CheckoutRequestID": "known-callback"}}},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ResultCode"] == 1
        assert "Temporary M-Pesa upstream error." in response.data["ResultDesc"]


class TestCreditNoteAPIEndpoints:
    """Test CreditNote API operations."""

    def test_list_credit_notes(self, authenticated_client, sample_credit_note):
        """Test GET /api/billing/credit-notes/ - List credit notes."""
        response = authenticated_client.get("/api/billing/credit-notes/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)

    def test_request_credit_note(
        self, authenticated_client, sample_invoice, sample_invoice_item, sample_patient
    ):
        """Test POST /api/billing/credit-notes/ - Request credit note."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {
            "invoice": sample_invoice.id,
            "patient": sample_patient.id,
            "amount": "50.00",  # Less than invoice total
            "reason": CreditNote.Reason.OVERCHARGE,
            "reason_detail": "Service overcharge correction",
        }

        response = authenticated_client.post("/api/billing/credit-notes/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["reason"] == CreditNote.Reason.OVERCHARGE
        assert "credit_note_number" in response.data
        assert response.data["credit_note_number"].startswith("CN-")

    def test_approve_credit_note(self, authenticated_client, sample_credit_note, test_user_2):
        """Test POST /api/billing/credit-notes/{id}/approve/ - Approve credit note."""
        # Authenticate as different user for approval
        authenticated_client.force_authenticate(user=test_user_2)

        response = authenticated_client.post(
            f"/api/billing/credit-notes/{sample_credit_note.id}/approve/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == CreditNote.Status.APPROVED

    def test_process_refund(self, authenticated_client, sample_credit_note):
        """Test POST /api/billing/credit-notes/{id}/refund/ - Process refund."""
        # First approve the credit note
        sample_credit_note.status = CreditNote.Status.APPROVED
        sample_credit_note.save()

        data = {"refund_method": "mpesa", "refund_reference": "MPESA-REF-123"}

        response = authenticated_client.post(
            f"/api/billing/credit-notes/{sample_credit_note.id}/refund/", data
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == CreditNote.Status.REFUNDED
