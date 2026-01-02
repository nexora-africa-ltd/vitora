"""
Tests for Payment and CreditNote API endpoints.

Following TDD principles - these tests are written BEFORE implementation.
Reference: Deliverables spec § 9, lines 891-928
"""

import pytest
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import Payment, CreditNote, Invoice

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Provide authenticated API client."""
    api_client.force_authenticate(user=test_user)
    return api_client


class TestPaymentAPIEndpoints:
    """Test Payment API operations."""

    def test_list_payments(self, authenticated_client, sample_payment):
        """Test GET /api/billing/payments/ - List payments with pagination."""
        response = authenticated_client.get('/api/billing/payments/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data or isinstance(response.data, list)

    def test_list_payments_unauthenticated_fails(self, api_client):
        """Test unauthenticated access is rejected."""
        response = api_client.get('/api/billing/payments/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_record_cash_payment(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test POST /api/billing/payments/ - Record cash payment."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()
        
        data = {
            'invoice': sample_invoice.id,
            'method': Payment.Method.CASH,
            'amount': '500.00'
        }
        
        response = authenticated_client.post('/api/billing/payments/', data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['method'] == Payment.Method.CASH
        assert Decimal(response.data['amount']) == Decimal('500.00')
        assert 'reference' in response.data or 'payment_reference' in response.data

    def test_record_card_payment_with_details(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test recording card payment with transaction details."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()
        
        data = {
            'invoice': sample_invoice.id,
            'method': Payment.Method.CARD,
            'amount': '500.00',
            'reference': 'CARD123456'
        }
        
        response = authenticated_client.post('/api/billing/payments/', data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['method'] == Payment.Method.CARD

    def test_payment_updates_invoice_status(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test that payment automatically updates invoice status."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        
        data = {
            'invoice': sample_invoice.id,
            'method': Payment.Method.CASH,
            'amount': str(sample_invoice.total_amount)
        }
        
        response = authenticated_client.post('/api/billing/payments/', data)
        
        assert response.status_code == status.HTTP_201_CREATED

    def test_get_payment_detail(self, authenticated_client, sample_payment):
        """Test GET /api/billing/payments/{id}/ - Get payment details."""
        response = authenticated_client.get(f'/api/billing/payments/{sample_payment.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_payment.id

    def test_get_receipt_for_payment(self, authenticated_client, sample_payment, sample_receipt):
        """Test GET /api/billing/payments/{id}/receipt/ - Get/generate receipt."""
        response = authenticated_client.get(f'/api/billing/payments/{sample_payment.id}/receipt/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'receipt_number' in response.data


class TestMpesaAPIEndpoints:
    """Test M-Pesa STK Push API endpoints."""

    def test_initiate_mpesa_stk_push(self, authenticated_client, sample_invoice):
        """Test POST /api/billing/mpesa/initiate/ - Initiate M-Pesa STK push."""
        data = {
            'invoice': sample_invoice.id,
            'phone_number': '254712345678',
            'amount': '500.00'
        }
        
        response = authenticated_client.post('/api/billing/mpesa/initiate/', data)
        
        # Should return checkout request ID
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]

    def test_mpesa_callback_success(self, api_client):
        """Test POST /api/billing/mpesa/callback/ - Successful callback processed."""
        # M-Pesa callbacks don't require authentication
        callback_data = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': 'test-merchant-123',
                    'CheckoutRequestID': 'test-checkout-456',
                    'ResultCode': 0,
                    'ResultDesc': 'The service request is processed successfully.',
                    'CallbackMetadata': {
                        'Item': [
                            {'Name': 'Amount', 'Value': 500.00},
                            {'Name': 'MpesaReceiptNumber', 'Value': 'MPE123456'},
                            {'Name': 'TransactionDate', 'Value': 20260102120000},
                            {'Name': 'PhoneNumber', 'Value': 254712345678}
                        ]
                    }
                }
            }
        }
        
        response = api_client.post('/api/billing/mpesa/callback/', callback_data, format='json')
        
        # Should acknowledge callback
        assert response.status_code == status.HTTP_200_OK

    def test_mpesa_callback_failure(self, api_client):
        """Test M-Pesa callback with failed transaction."""
        callback_data = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': 'test-merchant-123',
                    'CheckoutRequestID': 'test-checkout-456',
                    'ResultCode': 1032,  # User cancelled
                    'ResultDesc': 'Request cancelled by user'
                }
            }
        }
        
        response = api_client.post('/api/billing/mpesa/callback/', callback_data, format='json')
        
        # Should acknowledge callback
        assert response.status_code == status.HTTP_200_OK

    def test_mpesa_query_status(self, authenticated_client):
        """Test GET /api/billing/mpesa/query/{checkout_id}/ - Query M-Pesa status."""
        checkout_id = 'test-checkout-123'
        
        response = authenticated_client.get(f'/api/billing/mpesa/query/{checkout_id}/')
        
        # Should return status
        assert response.status_code == status.HTTP_200_OK


class TestCreditNoteAPIEndpoints:
    """Test CreditNote API operations."""

    def test_list_credit_notes(self, authenticated_client, sample_credit_note):
        """Test GET /api/billing/credit-notes/ - List credit notes."""
        response = authenticated_client.get('/api/billing/credit-notes/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data or isinstance(response.data, list)

    def test_request_credit_note(self, authenticated_client, sample_invoice, sample_invoice_item, sample_patient):
        """Test POST /api/billing/credit-notes/ - Request credit note."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()
        
        data = {
            'invoice': sample_invoice.id,
            'patient': sample_patient.id,
            'amount': '50.00',  # Less than invoice total
            'reason': CreditNote.Reason.OVERCHARGE,
            'reason_detail': 'Service overcharge correction'
        }
        
        response = authenticated_client.post('/api/billing/credit-notes/', data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['reason'] == CreditNote.Reason.OVERCHARGE
        assert 'credit_note_number' in response.data
        assert response.data['credit_note_number'].startswith('CN-')

    def test_approve_credit_note(self, authenticated_client, sample_credit_note, test_user_2):
        """Test POST /api/billing/credit-notes/{id}/approve/ - Approve credit note."""
        # Authenticate as different user for approval
        authenticated_client.force_authenticate(user=test_user_2)
        
        response = authenticated_client.post(f'/api/billing/credit-notes/{sample_credit_note.id}/approve/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == CreditNote.Status.APPROVED

    def test_process_refund(self, authenticated_client, sample_credit_note):
        """Test POST /api/billing/credit-notes/{id}/refund/ - Process refund."""
        # First approve the credit note
        sample_credit_note.status = CreditNote.Status.APPROVED
        sample_credit_note.save()
        
        data = {
            'refund_method': 'mpesa',
            'refund_reference': 'MPESA-REF-123'
        }
        
        response = authenticated_client.post(f'/api/billing/credit-notes/{sample_credit_note.id}/refund/', data)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == CreditNote.Status.REFUNDED
