"""
Pytest fixtures for billing tests.
"""

import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.contrib.auth import get_user_model

from hmis.apps.billing.models import ServiceCategory, Service, Invoice, InvoiceItem


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
        status=Invoice.Status.DRAFT,
        payment_type=Invoice.PaymentType.CASH,
        created_by=billing_user,
    )
