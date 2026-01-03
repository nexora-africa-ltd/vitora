"""
Pytest fixtures for billing tests.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from hmis.apps.billing.models import (
    CreditNote,
    Invoice,
    InvoiceItem,
    Payment,
    Receipt,
    Service,
    ServiceCategory,
)

User = get_user_model()


@pytest.fixture
def billing_user(db):
    """Create a user for billing tests."""
    return User.objects.create_user(
        username='billinguser',
        password='testpass123',
        email='billing@test.com'
    )


@pytest.fixture
def service_category(db):
    """Create a service category."""
    return ServiceCategory.objects.create(
        name='Consultation',
        code='CONS',
        description='Doctor consultation services',
        display_order=1
    )


@pytest.fixture
def consultation_service(db, service_category, billing_user):
    """Create a consultation service."""
    return Service.objects.create(
        category=service_category,
        code='CONS-GEN',
        name='General Consultation',
        description='General doctor consultation',
        unit_price=Decimal('500.00'),
        sha_code='SHA-CONS-001',
        created_by=billing_user
    )


@pytest.fixture
def sample_invoice_data(sample_patient, billing_user):
    """Sample invoice data for tests."""
    return {
        'patient': sample_patient,
        'invoice_date': date.today(),
        'due_date': date.today() + timedelta(days=30),
        'status': 'draft',
        'payment_type': 'cash',
        'created_by': billing_user,
    }


@pytest.fixture
def sample_invoice(db, sample_patient, billing_user):
    """Create a sample invoice."""
    return Invoice.objects.create(
        patient=sample_patient,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status=Invoice.Status.DRAFT,
        payment_type=Invoice.PaymentType.CASH,
        created_by=billing_user,
    )


@pytest.fixture
def sample_category(db):
    """Alias for service_category for consistency."""
    return ServiceCategory.objects.create(
        name='Consultation',
        code='CONS',
        description='Doctor consultation services',
        display_order=1
    )


@pytest.fixture
def sample_service(db, sample_category, test_user):
    """Create a sample service."""
    return Service.objects.create(
        category=sample_category,
        code='CONS-GEN',
        name='General Consultation',
        description='General doctor consultation',
        unit_price=Decimal('500.00'),
        sha_code='SHA-CONS-001',
        created_by=test_user
    )


@pytest.fixture
def sample_invoice_item(db, sample_invoice, sample_service):
    """Create a sample invoice item."""
    return InvoiceItem.objects.create(
        invoice=sample_invoice,
        service=sample_service,
        description=sample_service.name,
        quantity=1,
        unit_price=sample_service.unit_price
    )


@pytest.fixture
def sample_payment(db, sample_invoice, sample_invoice_item, test_user):
    """Create a sample payment."""
    # Ensure invoice has items and totals calculated
    sample_invoice.calculate_totals()
    sample_invoice.save()

    payment = Payment.objects.create(
        invoice=sample_invoice,
        method=Payment.Method.CASH,
        amount=Decimal('500.00'),
        received_by=test_user
    )
    payment.process()
    return payment


@pytest.fixture
def sample_receipt(db, sample_payment, sample_invoice, test_user):
    """Create a sample receipt."""
    return Receipt.objects.create(
        payment=sample_payment,
        invoice=sample_invoice,
        patient=sample_invoice.patient,
        amount=sample_payment.amount,
        payment_method=sample_payment.method,
        issued_by=test_user
    )


@pytest.fixture
def sample_credit_note(db, sample_invoice, sample_invoice_item, test_user):
    """Create a sample credit note."""
    # Ensure invoice has items and totals calculated
    sample_invoice.calculate_totals()
    sample_invoice.save()

    return CreditNote.objects.create(
        invoice=sample_invoice,
        patient=sample_invoice.patient,
        amount=Decimal('50.00'),  # Less than invoice total
        reason=CreditNote.Reason.OVERCHARGE,
        reason_detail='Test overcharge',
        requested_by=test_user
    )


@pytest.fixture
def test_user_2(db):
    """Create a second test user for approval workflows."""
    return User.objects.create_user(
        username='approver',
        password='approver123',
        email='approver@test.com'
    )
