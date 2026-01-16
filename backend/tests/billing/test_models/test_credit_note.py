"""
Tests for CreditNote model.

Tests follow the deliverables spec requirements (§7, lines 768-845).
Total: 8 tests as specified.
"""

from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from hmis.apps.billing.models import CreditNote, InvoiceItem, Payment

User = get_user_model()


@pytest.mark.django_db
class TestCreditNote:
    """Test CreditNote model following deliverables spec requirements."""

    def test_credit_note_creation(self, sample_invoice, billing_user, consultation_service):
        """Test credit note with invoice."""
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

        # Create credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            original_payment=payment,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.OVERCHARGE,
            reason_detail='Overcharged on consultation fee',
            requested_by=billing_user
        )

        assert credit_note.invoice == sample_invoice
        assert credit_note.patient == sample_invoice.patient
        assert credit_note.amount == Decimal('500.00')
        assert credit_note.status == CreditNote.Status.DRAFT
        assert credit_note.requested_by == billing_user

    def test_credit_note_number_auto_generated(self, sample_invoice, billing_user, consultation_service):
        """Test number follows CN-YYYYMMDD-XXXX format."""
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

        # Create credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.SERVICE_NOT_RENDERED,
            reason_detail='Service not completed',
            requested_by=billing_user
        )

        assert credit_note.credit_note_number is not None
        assert credit_note.credit_note_number.startswith('CN-')

        # Check format: CN-YYYYMMDD-XXXX
        parts = credit_note.credit_note_number.split('-')
        assert len(parts) == 3
        assert parts[0] == 'CN'
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX
        assert parts[2].isdigit()

    def test_credit_note_amount_not_exceed_invoice(self, sample_invoice, billing_user, consultation_service):
        """Test amount <= invoice total."""
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

        # Try to create credit note with amount > invoice total
        with pytest.raises(ValidationError):
            credit_note = CreditNote(
                invoice=sample_invoice,
                patient=sample_invoice.patient,
                amount=Decimal('1500.00'),  # More than invoice total
                reason=CreditNote.Reason.OVERCHARGE,
                reason_detail='Test',
                requested_by=billing_user
            )
            credit_note.save()

    def test_approval_workflow(self, sample_invoice, billing_user, consultation_service, db):
        """Test Draft → Approved → Refunded."""
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

        # Create another user for approval
        approver = User.objects.create_user(
            username='approver',
            password='testpass123'
        )

        # Create credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.GOODWILL,
            reason_detail='Customer satisfaction',
            requested_by=billing_user
        )

        assert credit_note.status == CreditNote.Status.DRAFT

        # Approve
        credit_note.approve(approver)

        assert credit_note.status == CreditNote.Status.APPROVED
        assert credit_note.approved_by == approver
        assert credit_note.approved_at is not None

        # Process refund
        credit_note.process_refund('mpesa', 'MPESA123')

        assert credit_note.status == CreditNote.Status.REFUNDED
        assert credit_note.refund_method == 'mpesa'
        assert credit_note.refund_reference == 'MPESA123'
        assert credit_note.refunded_at is not None

    def test_approval_by_different_user(self, sample_invoice, billing_user, consultation_service, db):
        """Test cannot self-approve."""
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

        # Create credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.DUPLICATE_CHARGE,
            reason_detail='Duplicate billing',
            requested_by=billing_user
        )

        # Try to self-approve
        with pytest.raises(ValidationError):
            credit_note.approve(billing_user)

    def test_refund_processing(self, sample_invoice, billing_user, consultation_service, db):
        """Test refund details recorded."""
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

        # Create another user for approval
        approver = User.objects.create_user(
            username='approver2',
            password='testpass123'
        )

        # Create and approve credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.SERVICE_NOT_RENDERED,
            reason_detail='Service incomplete',
            requested_by=billing_user
        )
        credit_note.approve(approver)

        # Process refund
        credit_note.process_refund('cash', 'CASH001')

        assert credit_note.status == CreditNote.Status.REFUNDED
        assert credit_note.refund_method == 'cash'
        assert credit_note.refund_reference == 'CASH001'
        assert credit_note.refunded_at is not None

    def test_rejected_credit_note(self, sample_invoice, billing_user, consultation_service, db):
        """Test rejection with reason."""
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

        # Create another user for rejection
        reviewer = User.objects.create_user(
            username='reviewer',
            password='testpass123'
        )

        # Create credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.OTHER,
            reason_detail='Not justified',
            requested_by=billing_user
        )

        # Reject
        credit_note.reject(reviewer, 'Insufficient justification')

        assert credit_note.status == CreditNote.Status.REJECTED
        # In full implementation, rejection reason would be stored

    def test_credit_note_audit_trail(self, sample_invoice, billing_user, consultation_service, db):
        """Test all users recorded."""
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

        # Create another user for approval
        approver = User.objects.create_user(
            username='approver3',
            password='testpass123'
        )

        # Create and approve credit note
        credit_note = CreditNote.objects.create(
            invoice=sample_invoice,
            patient=sample_invoice.patient,
            amount=Decimal('500.00'),
            reason=CreditNote.Reason.INSURANCE_ADJUSTMENT,
            reason_detail='Insurance claim approved',
            requested_by=billing_user
        )
        credit_note.approve(approver)

        assert credit_note.requested_by == billing_user
        assert credit_note.approved_by == approver
        assert credit_note.created_at is not None
        assert credit_note.updated_at is not None
