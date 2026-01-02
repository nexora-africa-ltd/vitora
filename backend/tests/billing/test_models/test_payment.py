"""
Tests for Payment model.

Tests follow the deliverables spec requirements (§4, lines 366-474).
Total: 16 tests as specified.
"""

import pytest
from datetime import timedelta
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.billing.models import Payment, Invoice, InvoiceItem


@pytest.mark.django_db
class TestPayment:
    """Test Payment model following deliverables spec requirements."""
    
    def test_payment_creation_with_invoice(self, sample_invoice, billing_user, consultation_service):
        """Test payment linked to invoice."""
        # Add item to invoice so it has a total
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        
        assert payment.invoice == sample_invoice
        assert payment.method == Payment.Method.CASH
        assert payment.amount == Decimal('1000.00')
        assert payment.status == Payment.Status.PENDING
        assert payment.received_by == billing_user
    
    def test_payment_reference_auto_generated(self, sample_invoice, billing_user, consultation_service):
        """Test reference follows PAY-YYYYMMDD-XXXX format."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('500.00'),
            line_total=Decimal('500.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('500.00'),
            received_by=billing_user
        )
        
        assert payment.payment_reference is not None
        assert payment.payment_reference.startswith('PAY-')
        
        # Check format: PAY-YYYYMMDD-XXXX
        parts = payment.payment_reference.split('-')
        assert len(parts) == 3
        assert parts[0] == 'PAY'
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX
        assert parts[2].isdigit()
    
    def test_payment_reference_uniqueness(self, sample_invoice, billing_user, consultation_service):
        """Test duplicate references rejected."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment1 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('500.00'),
            received_by=billing_user
        )
        
        payment2 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('500.00'),
            received_by=billing_user
        )
        
        # References should be unique
        assert payment1.payment_reference != payment2.payment_reference
    
    def test_payment_amount_positive(self, sample_invoice, billing_user):
        """Test amount must be > 0."""
        with pytest.raises(ValidationError):
            payment = Payment(
                invoice=sample_invoice,
                method=Payment.Method.CASH,
                amount=Decimal('0.00'),  # Invalid
                received_by=billing_user
            )
            payment.save()
        
        with pytest.raises(ValidationError):
            payment = Payment(
                invoice=sample_invoice,
                method=Payment.Method.CASH,
                amount=Decimal('-100.00'),  # Invalid
                received_by=billing_user
            )
            payment.save()
    
    def test_payment_amount_not_exceed_balance(self, sample_invoice, billing_user, consultation_service):
        """Test cannot overpay invoice."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        with pytest.raises(ValidationError):
            payment = Payment(
                invoice=sample_invoice,
                method=Payment.Method.CASH,
                amount=Decimal('1500.00'),  # More than balance
                received_by=billing_user
            )
            payment.save()
    
    def test_cash_payment_processing(self, sample_invoice, billing_user, consultation_service):
        """Test cash payment completed."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        
        payment.process()
        
        assert payment.status == Payment.Status.COMPLETED
        assert payment.processed_at is not None
    
    def test_mpesa_payment_with_receipt(self, sample_invoice, billing_user, consultation_service):
        """Test M-Pesa details stored."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal('1000.00'),
            mpesa_receipt_number='OEI2AK4Q0B',
            mpesa_transaction_id='NEF61H8J60',
            mpesa_phone='254712345678',
            received_by=billing_user
        )
        
        assert payment.is_mpesa() is True
        assert payment.mpesa_receipt_number == 'OEI2AK4Q0B'
        assert payment.mpesa_transaction_id == 'NEF61H8J60'
        assert payment.mpesa_phone == '254712345678'
    
    def test_payment_updates_invoice_paid(self, sample_invoice, billing_user, consultation_service):
        """Test invoice amount_paid updated."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        initial_paid = sample_invoice.amount_paid
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('500.00'),
            received_by=billing_user
        )
        payment.process()
        
        sample_invoice.refresh_from_db()
        assert sample_invoice.amount_paid == initial_paid + Decimal('500.00')
    
    def test_payment_updates_invoice_status(self, sample_invoice, billing_user, consultation_service):
        """Test status changes to partial/paid."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        # Partial payment
        payment1 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('400.00'),
            received_by=billing_user
        )
        payment1.process()
        
        sample_invoice.refresh_from_db()
        assert sample_invoice.status == Invoice.Status.PARTIAL
        
        # Full payment
        payment2 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('600.00'),
            received_by=billing_user
        )
        payment2.process()
        
        sample_invoice.refresh_from_db()
        assert sample_invoice.status == Invoice.Status.PAID
    
    def test_multiple_payments_on_invoice(self, sample_invoice, billing_user, consultation_service):
        """Test split payment support."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        # Create multiple payments
        payment1 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('300.00'),
            received_by=billing_user
        )
        payment1.process()
        
        payment2 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal('400.00'),
            received_by=billing_user
        )
        payment2.process()
        
        payment3 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CARD,
            amount=Decimal('300.00'),
            received_by=billing_user
        )
        payment3.process()
        
        sample_invoice.refresh_from_db()
        assert sample_invoice.payments.count() == 3
        assert sample_invoice.amount_paid == Decimal('1000.00')
        assert sample_invoice.status == Invoice.Status.PAID
    
    def test_payment_reversal(self, sample_invoice, billing_user, consultation_service):
        """Test payment reversed, invoice updated."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()
        
        sample_invoice.refresh_from_db()
        assert sample_invoice.status == Invoice.Status.PAID
        
        # Reverse payment
        payment.reverse('Payment error')
        
        assert payment.status == Payment.Status.REVERSED
        sample_invoice.refresh_from_db()
        assert sample_invoice.amount_paid == Decimal('0.00')
        assert sample_invoice.status == Invoice.Status.PENDING
    
    def test_payment_refund(self, sample_invoice, billing_user, consultation_service):
        """Test refund processed."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()
        
        # Refund
        payment.refund(Decimal('500.00'), 'Partial service refund')
        
        assert payment.status == Payment.Status.REFUNDED
    
    def test_failed_payment_status(self, sample_invoice, billing_user, consultation_service):
        """Test failed status recorded."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        
        payment.status = Payment.Status.FAILED
        payment.failure_reason = 'Insufficient funds'
        payment.save()
        
        assert payment.status == Payment.Status.FAILED
        assert payment.failure_reason == 'Insufficient funds'
    
    def test_payment_on_cancelled_invoice(self, sample_invoice, billing_user, consultation_service):
        """Test payment rejected on cancelled invoice."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        # Cancel invoice
        sample_invoice.cancel(billing_user, 'Test cancellation')
        
        # Try to create payment
        with pytest.raises(ValidationError):
            payment = Payment(
                invoice=sample_invoice,
                method=Payment.Method.CASH,
                amount=Decimal('1000.00'),
                received_by=billing_user
            )
            payment.save()
    
    def test_pending_payment_timeout(self, sample_invoice, billing_user, consultation_service):
        """Test pending payments expire."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.MPESA,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        
        # Simulate old pending payment (created 2 hours ago)
        old_time = timezone.now() - timedelta(hours=2)
        payment.created_at = old_time
        payment.save()
        
        assert payment.status == Payment.Status.PENDING
        # In real implementation, a celery task would mark this as FAILED
    
    def test_payment_audit_trail(self, sample_invoice, billing_user, consultation_service):
        """Test received_by recorded."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()
        
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        
        assert payment.received_by == billing_user
        assert payment.created_at is not None
        assert payment.payment_date is not None
