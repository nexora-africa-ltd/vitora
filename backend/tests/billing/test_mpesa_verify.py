"""
Tests for M-Pesa transaction verification feature.

Covers:
- MpesaService.verify_transaction() service method
- POST /api/billing/mpesa/verify/ API endpoint
    - Empty / missing transaction_id
    - Invalid format (too short, too long, non-alphanumeric)
    - Duplicate detection (code already used on another payment)
    - Successful Safaricom verification (ResponseCode == 0)
    - Failed Safaricom verification (non-zero ResponseCode)
    - Safaricom HTTP errors (4xx/5xx)
    - Network errors
- ReceiptSerializer M-Pesa fields
    - mpesa_phone_display (obscured)
    - mpesa_receipt_number
"""

from decimal import Decimal
from unittest.mock import Mock, patch

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import Invoice, Payment, PaymentPoint, Receipt
from hmis.apps.billing.serializers import ReceiptSerializer
from hmis.apps.billing.services.mpesa import MpesaService


# ============================================================================
# Service Tests — MpesaService.verify_transaction()
# ============================================================================


@pytest.mark.django_db
class TestMpesaVerifyTransactionService:
    """Tests for MpesaService.verify_transaction()."""

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch.object(MpesaService, "get_access_token", return_value="test-token")
    def test_verify_success_response_code_0(self, mock_token, mock_post):
        """Should return verified=True when Safaricom returns ResponseCode 0."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "ResponseCode": "0",
            "ResponseDescription": "Success",
            "ConversationID": "AG_123",
            "OriginatorConversationID": "OG_456",
        }
        mock_post.return_value = mock_response

        service = MpesaService()
        result = service.verify_transaction("SLK4H42RQO")

        assert result["verified"] is True
        assert result["receipt_number"] == "SLK4H42RQO"
        assert result["error"] is None
        assert result["conversation_id"] == "AG_123"

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch.object(MpesaService, "get_access_token", return_value="test-token")
    def test_verify_failure_non_zero_response_code(self, mock_token, mock_post):
        """Should return verified=False when Safaricom returns non-zero ResponseCode."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "ResponseCode": "1",
            "ResponseDescription": "Transaction not found",
        }
        mock_post.return_value = mock_response

        service = MpesaService()
        result = service.verify_transaction("FAKEXXXXXX")

        assert result["verified"] is False
        assert result["error"] == "Transaction not found"
        assert result["receipt_number"] == "FAKEXXXXXX"

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch.object(MpesaService, "get_access_token", return_value="test-token")
    def test_verify_http_error_returns_not_verified(self, mock_token, mock_post):
        """Should return verified=False with error message on HTTP error."""
        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "errorMessage": "Bad Request - Invalid TransactionID",
            "errorCode": "400.002.05",
        }
        mock_post.return_value = mock_response

        service = MpesaService()
        result = service.verify_transaction("BADCODE123")

        assert result["verified"] is False
        assert "Invalid TransactionID" in result["error"]

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch.object(MpesaService, "get_access_token", return_value="test-token")
    def test_verify_network_error_raises_validation_error(self, mock_token, mock_post):
        """Should raise ValidationError on network failure."""
        import requests as req

        mock_post.side_effect = req.ConnectionError("Connection refused")

        service = MpesaService()
        with pytest.raises(ValidationError, match="verification failed"):
            service.verify_transaction("SLK4H42RQO")

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch.object(MpesaService, "get_access_token", return_value="test-token")
    def test_verify_sends_correct_payload(self, mock_token, mock_post):
        """Should send TransactionID and correct CommandID to Safaricom."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ResponseCode": "0"}
        mock_post.return_value = mock_response

        service = MpesaService()
        service.verify_transaction("ABC1234567")

        call_args = mock_post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert payload["TransactionID"] == "ABC1234567"
        assert payload["CommandID"] == "TransactionStatusQuery"
        assert payload["IdentifierType"] == "4"

    @patch("hmis.apps.billing.services.mpesa.requests.post")
    @patch.object(MpesaService, "get_access_token", return_value="test-token")
    def test_verify_unparseable_json_response(self, mock_token, mock_post):
        """Should handle non-JSON response from Safaricom gracefully."""
        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 500
        mock_response.json.side_effect = ValueError("No JSON")
        mock_post.return_value = mock_response

        service = MpesaService()
        result = service.verify_transaction("SLK4H42RQO")

        assert result["verified"] is False
        assert "500 error" in result["error"]


# ============================================================================
# API Tests — POST /api/billing/mpesa/verify/
# ============================================================================


@pytest.mark.django_db
class TestMpesaVerifyAPI:
    """Tests for the M-Pesa verify endpoint."""

    def _url(self):
        return "/api/billing/mpesa/verify/"

    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(self._url(), {"transaction_id": "SLK4H42RQO"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_empty_transaction_id(self, authenticated_client):
        """Should return 400 for empty transaction_id."""
        response = authenticated_client.post(self._url(), {"transaction_id": ""})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required" in response.data["error"].lower()

    def test_missing_transaction_id(self, authenticated_client):
        """Should return 400 when transaction_id is not provided."""
        response = authenticated_client.post(self._url(), {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_too_short_code(self, authenticated_client):
        """Should reject codes shorter than 8 characters."""
        response = authenticated_client.post(self._url(), {"transaction_id": "ABC123"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified"] is False
        assert "format" in response.data["error"].lower()

    def test_too_long_code(self, authenticated_client):
        """Should reject codes longer than 12 characters."""
        response = authenticated_client.post(
            self._url(), {"transaction_id": "ABCDEFGHIJKLMNOP"}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified"] is False

    def test_non_alphanumeric_code(self, authenticated_client):
        """Should reject codes with special characters."""
        response = authenticated_client.post(self._url(), {"transaction_id": "SLK4-H42R"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified"] is False

    def test_code_uppercased(self, authenticated_client):
        """Should uppercase the transaction code before processing."""
        with patch(
            "hmis.apps.billing.services.MpesaService"
        ) as MockService:
            mock_instance = MockService.return_value
            mock_instance.verify_transaction.return_value = {
                "verified": True,
                "receipt_number": "SLK4H42RQO",
                "error": None,
            }

            response = authenticated_client.post(
                self._url(), {"transaction_id": "slk4h42rqo"}
            )

            assert response.status_code == status.HTTP_200_OK
            mock_instance.verify_transaction.assert_called_once_with("SLK4H42RQO")

    def test_duplicate_detection(
        self, authenticated_client, sample_invoice, sample_invoice_item, test_user
    ):
        """Should reject a transaction code already used on another payment."""
        sample_invoice.calculate_totals()
        sample_invoice.save()

        Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal("100.00"),
            mpesa_receipt_number="SLK4H42RQO",
            received_by=test_user,
        )

        response = authenticated_client.post(
            self._url(), {"transaction_id": "SLK4H42RQO"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified"] is False
        assert "already been used" in response.data["error"]

    @patch("hmis.apps.billing.services.MpesaService")
    def test_successful_verification(self, MockService, authenticated_client):
        """Should return verified=True from Safaricom."""
        mock_instance = MockService.return_value
        mock_instance.verify_transaction.return_value = {
            "verified": True,
            "amount": None,
            "phone": None,
            "receipt_number": "SLK4H42RQO",
            "transaction_date": None,
            "error": None,
        }

        response = authenticated_client.post(
            self._url(), {"transaction_id": "SLK4H42RQO"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified"] is True

    @patch("hmis.apps.billing.services.MpesaService")
    def test_failed_verification(self, MockService, authenticated_client):
        """Should return verified=False with error from Safaricom."""
        mock_instance = MockService.return_value
        mock_instance.verify_transaction.return_value = {
            "verified": False,
            "receipt_number": "FAKEXXXXXX",
            "error": "Transaction not found",
        }

        response = authenticated_client.post(
            self._url(), {"transaction_id": "FAKEXXXXXX"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified"] is False
        assert response.data["error"] == "Transaction not found"


# ============================================================================
# Receipt Serializer M-Pesa fields
# ============================================================================


@pytest.mark.django_db
class TestReceiptMpesaFields:
    """Tests for M-Pesa fields on ReceiptSerializer."""

    def test_mpesa_phone_display_254_format(
        self, sample_invoice, sample_invoice_item, test_user
    ):
        """Should obscure 254 phone as 0712**5678."""
        sample_invoice.calculate_totals()
        sample_invoice.save()

        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal("100.00"),
            mpesa_phone="254712345678",
            mpesa_receipt_number="SLK4H42RQO",
            received_by=test_user,
        )

        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=test_user,
        )

        serializer = ReceiptSerializer(receipt)
        assert serializer.data["mpesa_phone_display"] == "0712**5678"
        assert serializer.data["mpesa_receipt_number"] == "SLK4H42RQO"

    def test_mpesa_phone_display_07_format(
        self, sample_invoice, sample_invoice_item, test_user
    ):
        """Should obscure 07xx phone as 0712**5678."""
        sample_invoice.calculate_totals()
        sample_invoice.save()

        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal("100.00"),
            mpesa_phone="0712345678",
            received_by=test_user,
        )

        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=test_user,
        )

        serializer = ReceiptSerializer(receipt)
        assert serializer.data["mpesa_phone_display"] == "0712**5678"

    def test_non_mpesa_payment_has_null_fields(self, sample_receipt):
        """Should return null for non-M-Pesa payment."""
        serializer = ReceiptSerializer(sample_receipt)
        assert serializer.data["mpesa_phone_display"] is None
        assert serializer.data["mpesa_receipt_number"] is None

    def test_empty_phone_returns_null(
        self, sample_invoice, sample_invoice_item, test_user
    ):
        """Should return null when mpesa_phone is empty string."""
        sample_invoice.calculate_totals()
        sample_invoice.save()

        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal("100.00"),
            mpesa_phone="",
            received_by=test_user,
        )

        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=test_user,
        )

        serializer = ReceiptSerializer(receipt)
        assert serializer.data["mpesa_phone_display"] is None
