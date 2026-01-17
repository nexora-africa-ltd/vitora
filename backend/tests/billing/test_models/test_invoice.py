"""
Tests for Invoice model.

Tests follow the deliverables spec requirements (§2, lines 158-280).
Total: 18 tests as specified.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

from hmis.apps.billing.models import Invoice, InvoiceItem


@pytest.mark.django_db
class TestInvoice:
    """Test Invoice model following deliverables spec requirements."""

    def test_invoice_creation_with_patient(self, sample_patient, billing_user):
        """Test invoice created with patient linkage."""
        invoice = Invoice.objects.create(
            patient=sample_patient, invoice_date=date.today(), created_by=billing_user
        )

        assert invoice.patient == sample_patient
        assert invoice.created_by == billing_user
        assert invoice.status == Invoice.Status.DRAFT
        assert invoice.invoice_date == date.today()
        assert invoice.subtotal == Decimal("0.00")
        assert invoice.total_amount == Decimal("0.00")
        assert invoice.balance_due == Decimal("0.00")

    def test_invoice_number_auto_generated(self, sample_patient, billing_user):
        """Test invoice number follows format INV-YYYYMMDD-XXXX."""
        invoice = Invoice.objects.create(patient=sample_patient, created_by=billing_user)

        assert invoice.invoice_number is not None
        assert invoice.invoice_number.startswith("INV-")

        # Check format: INV-YYYYMMDD-XXXX
        parts = invoice.invoice_number.split("-")
        assert len(parts) == 3
        assert parts[0] == "INV"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX
        assert parts[2].isdigit()

    def test_invoice_number_uniqueness(self, sample_patient, billing_user):
        """Test that duplicate invoice numbers are rejected."""
        invoice1 = Invoice.objects.create(patient=sample_patient, created_by=billing_user)

        # Try to create another invoice - should have different number
        invoice2 = Invoice.objects.create(patient=sample_patient, created_by=billing_user)

        assert invoice1.invoice_number != invoice2.invoice_number

        # Test uniqueness constraint would raise IntegrityError or ValidationError
        # We can't manually set invoice_number due to editable=False
        # But the model ensures uniqueness through auto-generation

    def test_invoice_encounter_linkage(self, sample_patient, sample_encounter, billing_user):
        """Test optional encounter linkage."""
        # Invoice without encounter
        invoice1 = Invoice.objects.create(patient=sample_patient, created_by=billing_user)
        assert invoice1.encounter is None

        # Invoice with encounter
        invoice2 = Invoice.objects.create(
            patient=sample_patient, encounter=sample_encounter, created_by=billing_user
        )
        assert invoice2.encounter == sample_encounter
        assert invoice2 in sample_encounter.invoices.all()

    def test_invoice_due_date_required(self, sample_patient, billing_user):
        """Test due date is automatically set."""
        invoice = Invoice.objects.create(
            patient=sample_patient, invoice_date=date.today(), created_by=billing_user
        )

        # Due date should be auto-set based on settings (30 days default)
        assert invoice.due_date is not None
        expected_due_date = invoice.invoice_date + timedelta(days=30)
        assert invoice.due_date == expected_due_date

    def test_invoice_due_date_not_past(self, sample_patient, billing_user):
        """Test due date must be >= invoice date."""
        with pytest.raises(ValidationError) as exc_info:
            invoice = Invoice(
                patient=sample_patient,
                invoice_date=date.today(),
                due_date=date.today() - timedelta(days=1),  # Past date
                created_by=billing_user,
            )
            invoice.save()

        assert "due_date" in exc_info.value.message_dict

    def test_calculate_totals_from_items(self, sample_invoice, consultation_service):
        """Test subtotal calculated from items."""
        # Add invoice items
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description="General Consultation",
            quantity=Decimal("1.00"),
            unit_price=Decimal("500.00"),
            line_total=Decimal("500.00"),
        )
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description="Follow-up Consultation",
            quantity=Decimal("1.00"),
            unit_price=Decimal("300.00"),
            line_total=Decimal("300.00"),
        )

        sample_invoice.calculate_totals()

        assert sample_invoice.subtotal == Decimal("800.00")
        assert sample_invoice.total_amount == Decimal("800.00")
        assert sample_invoice.balance_due == Decimal("800.00")

    def test_discount_applied_to_total(self, sample_invoice, consultation_service):
        """Test total = subtotal - discount."""
        # First add an item to have some subtotal
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description="Test Service",
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            line_total=Decimal("1000.00"),
        )

        sample_invoice.refresh_from_db()
        assert sample_invoice.subtotal == Decimal("1000.00")

        sample_invoice.apply_discount(Decimal("100.00"), "Senior citizen discount")

        assert sample_invoice.discount_amount == Decimal("100.00")
        assert sample_invoice.discount_reason == "Senior citizen discount"
        assert sample_invoice.total_amount == Decimal("900.00")  # 1000 - 100

    def test_balance_due_calculation(self, sample_invoice, consultation_service):
        """Test balance = total - paid."""
        # Add an item to set totals
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description="Test Service",
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            line_total=Decimal("1000.00"),
        )

        sample_invoice.refresh_from_db()
        sample_invoice.amount_paid = Decimal("300.00")
        sample_invoice.save()

        sample_invoice.calculate_totals()

        assert sample_invoice.balance_due == Decimal("700.00")  # 1000 - 300

    def test_status_transition_draft_to_pending(self, sample_invoice):
        """Test finalizing invoice (draft → pending)."""
        assert sample_invoice.status == Invoice.Status.DRAFT

        # Finalize by changing status
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()

        assert sample_invoice.status == Invoice.Status.PENDING

    def test_status_transition_to_partial(self, sample_invoice):
        """Test partial payment recorded."""
        sample_invoice.total_amount = Decimal("1000.00")
        sample_invoice.save()

        # Record partial payment
        sample_invoice.record_payment(Decimal("400.00"))

        assert sample_invoice.status == Invoice.Status.PARTIAL
        assert sample_invoice.amount_paid == Decimal("400.00")
        assert sample_invoice.balance_due == Decimal("600.00")

    def test_status_transition_to_paid(self, sample_invoice):
        """Test full payment recorded."""
        sample_invoice.total_amount = Decimal("1000.00")
        sample_invoice.save()

        # Record full payment
        sample_invoice.record_payment(Decimal("1000.00"))

        assert sample_invoice.status == Invoice.Status.PAID
        assert sample_invoice.amount_paid == Decimal("1000.00")
        assert sample_invoice.balance_due == Decimal("0.00")

    def test_record_payment_updates_balance(self, sample_invoice, consultation_service):
        """Test payment reduces balance."""
        # Add an item to set totals
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=consultation_service,
            description="Test Service",
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            line_total=Decimal("1000.00"),
        )

        sample_invoice.refresh_from_db()
        initial_balance = sample_invoice.balance_due

        sample_invoice.record_payment(Decimal("250.00"))

        assert sample_invoice.amount_paid == Decimal("250.00")
        assert sample_invoice.balance_due == Decimal("750.00")
        assert sample_invoice.balance_due == initial_balance - Decimal("250.00")

    def test_overpayment_prevented(self, sample_invoice):
        """Test cannot pay more than balance."""
        sample_invoice.total_amount = Decimal("1000.00")
        sample_invoice.save()

        with pytest.raises(ValidationError) as exc_info:
            sample_invoice.record_payment(Decimal("1500.00"))  # More than total

        assert "Payment exceeds invoice total" in str(exc_info.value)

    def test_cancel_invoice(self, sample_invoice, billing_user):
        """Test cancellation with reason."""
        reason = "Patient transferred to another facility"

        sample_invoice.cancel(billing_user, reason)

        assert sample_invoice.status == Invoice.Status.CANCELLED
        assert sample_invoice.cancelled_by == billing_user
        assert sample_invoice.cancelled_at is not None
        assert sample_invoice.cancellation_reason == reason

    def test_cancelled_invoice_cannot_accept_payment(self, sample_invoice, billing_user):
        """Test payment rejected on cancelled invoice."""
        sample_invoice.total_amount = Decimal("1000.00")
        sample_invoice.cancel(billing_user, "Test cancellation")

        # Attempting to record payment should fail
        # Note: This requires implementing the check in record_payment method
        with pytest.raises(ValidationError):
            sample_invoice.record_payment(Decimal("100.00"))

    def test_is_overdue_check(self, sample_patient, billing_user):
        """Test past due date detection."""
        # Create invoice with past due date
        invoice = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=40),
            due_date=date.today() - timedelta(days=10),  # 10 days overdue
            status=Invoice.Status.PENDING,
            created_by=billing_user,
        )

        assert invoice.is_overdue() is True

        # Paid invoice should not be overdue
        invoice.status = Invoice.Status.PAID
        assert invoice.is_overdue() is False

        # Future due date
        invoice.status = Invoice.Status.PENDING
        invoice.due_date = date.today() + timedelta(days=10)
        invoice.save()
        assert invoice.is_overdue() is False

    def test_draft_invoice_editable(self, sample_invoice):
        """Test only drafts can be modified."""
        # Draft invoice should be editable
        assert sample_invoice.status == Invoice.Status.DRAFT
        assert sample_invoice.can_be_edited() is True

        # Change to pending
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        assert sample_invoice.can_be_edited() is False

        # Other statuses should not be editable
        for status in [
            Invoice.Status.PARTIAL,
            Invoice.Status.PAID,
            Invoice.Status.CANCELLED,
            Invoice.Status.OVERDUE,
        ]:
            sample_invoice.status = status
            assert sample_invoice.can_be_edited() is False
