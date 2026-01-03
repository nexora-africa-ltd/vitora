"""
Tests for Receipt model.

Tests follow the deliverables spec requirements (§6, lines 685-766).
Total: 10 tests as specified.
"""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from hmis.apps.billing.models import InvoiceItem, Payment, Receipt


@pytest.mark.django_db
class TestReceipt:
    """Test Receipt model following deliverables spec requirements."""

    def test_receipt_creation_with_payment(self, sample_invoice, billing_user, consultation_service):
        """Test receipt linked to payment."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        assert receipt.payment == payment
        assert receipt.invoice == sample_invoice
        assert receipt.patient == sample_invoice.patient
        assert receipt.amount == Decimal('1000.00')
        assert receipt.issued_by == billing_user

    def test_receipt_number_auto_generated(self, sample_invoice, billing_user, consultation_service):
        """Test number follows RCP-YYYYMMDD-XXXX format."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        assert receipt.receipt_number is not None
        assert receipt.receipt_number.startswith('RCP-')

        # Check format: RCP-YYYYMMDD-XXXX
        parts = receipt.receipt_number.split('-')
        assert len(parts) == 3
        assert parts[0] == 'RCP'
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX
        assert parts[2].isdigit()

    def test_receipt_number_uniqueness(self, sample_invoice, billing_user, consultation_service):
        """Test duplicate numbers rejected."""
        # Add items to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1000.00'),
            line_total=Decimal('1000.00')
        )
        sample_invoice.refresh_from_db()

        # Create two payments
        payment1 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('500.00'),
            received_by=billing_user
        )
        payment1.process()

        payment2 = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('500.00'),
            received_by=billing_user
        )
        payment2.process()

        # Create two receipts
        receipt1 = Receipt.objects.create(
            payment=payment1,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment1.amount,
            payment_method=payment1.method,
            issued_by=billing_user
        )

        receipt2 = Receipt.objects.create(
            payment=payment2,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment2.amount,
            payment_method=payment2.method,
            issued_by=billing_user
        )

        # Receipt numbers should be unique
        assert receipt1.receipt_number != receipt2.receipt_number

    def test_amount_in_words_conversion(self, sample_invoice, billing_user, consultation_service):
        """Test correct text conversion."""
        # Add item to invoice
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description='Consultation',
            quantity=Decimal('1.00'),
            unit_price=Decimal('1200.00'),
            line_total=Decimal('1200.00')
        )
        sample_invoice.refresh_from_db()

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1200.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        assert receipt.amount_in_words is not None
        assert 'thousand' in receipt.amount_in_words.lower()
        assert 'two hundred' in receipt.amount_in_words.lower() or 'twelve hundred' in receipt.amount_in_words.lower()

    def test_receipt_patient_denormalization(self, sample_invoice, billing_user, consultation_service):
        """Test patient details copied."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt with denormalization
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            patient_name=f"{sample_invoice.patient.first_name} {sample_invoice.patient.last_name}",
            patient_mrn=sample_invoice.patient.mrn,
            issued_by=billing_user
        )

        assert receipt.patient_name is not None
        assert receipt.patient_mrn is not None
        assert receipt.patient_mrn == sample_invoice.patient.mrn

    def test_receipt_facility_denormalization(self, sample_invoice, billing_user, consultation_service):
        """Test facility details copied."""
        from django.conf import settings

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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt with facility details
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            facility_name=settings.FACILITY_NAME,
            facility_address=settings.FACILITY_ADDRESS,
            facility_phone=settings.FACILITY_PHONE,
            facility_kra_pin=settings.FACILITY_KRA_PIN,
            issued_by=billing_user
        )

        assert receipt.facility_name is not None
        assert receipt.facility_kra_pin is not None

    def test_receipt_void(self, sample_invoice, billing_user, consultation_service):
        """Test void with reason."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        # Void receipt
        receipt.void(billing_user, 'Receipt error')

        assert receipt.is_voided is True
        assert receipt.voided_by == billing_user
        assert receipt.voided_at is not None
        assert receipt.void_reason == 'Receipt error'

    def test_voided_receipt_cannot_be_voided_again(self, sample_invoice, billing_user, consultation_service):
        """Test double void prevented."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        # Void receipt
        receipt.void(billing_user, 'First void')

        # Try to void again
        with pytest.raises(ValidationError):
            receipt.void(billing_user, 'Second void')

    def test_receipt_pdf_generation(self, sample_invoice, billing_user, consultation_service):
        """Test PDF created successfully."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        # Generate PDF (method to be implemented)
        pdf_data = receipt.generate_pdf()

        assert pdf_data is not None
        # In real implementation, check PDF validity

    def test_receipt_audit_trail(self, sample_invoice, billing_user, consultation_service):
        """Test issued_by recorded."""
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

        # Create payment
        payment = Payment.objects.create(
            invoice=sample_invoice,
            method=Payment.Method.CASH,
            amount=Decimal('1000.00'),
            received_by=billing_user
        )
        payment.process()

        # Create receipt
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=payment.amount,
            payment_method=payment.method,
            issued_by=billing_user
        )

        assert receipt.issued_by == billing_user
        assert receipt.created_at is not None
        assert receipt.receipt_date is not None
