"""
Tests for billing admin interface.

Tests admin model registration, customization, inline editors, and admin actions.
"""

import pytest  # type: ignore
from django.contrib import admin
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from hmis.apps.billing.admin import (
    CreditNoteAdmin,
    InvoiceAdmin,
    InvoiceItemInline,
    PaymentAdmin,
    PaymentPointAdmin,
    ReceiptAdmin,
    ServiceAdmin,
    ServiceCategoryAdmin,
)
from hmis.apps.billing.models import (
    CreditNote,
    Invoice,
    Payment,
    PaymentPoint,
    Receipt,
    Service,
    ServiceCategory,
)

User = get_user_model()


@pytest.fixture
def admin_site():
    """Create admin site for testing."""
    return AdminSite()


@pytest.fixture
def admin_user(db):
    """Create admin user for testing."""
    return User.objects.create_superuser(
        username="admin", email="admin@test.com", password="voXOQkM4Tn6qCNQTy"
    )


@pytest.fixture
def request_factory():
    """Create request factory for testing."""
    return RequestFactory()


@pytest.mark.django_db
class TestBillingAdminRegistration:
    """Test billing models are properly registered in admin."""

    def test_service_category_registered_in_admin(self):
        """ServiceCategory should be registered in admin."""
        assert ServiceCategory in admin.site._registry
        assert isinstance(admin.site._registry[ServiceCategory], ServiceCategoryAdmin)

    def test_service_registered_in_admin(self):
        """Service should be registered in admin."""
        assert Service in admin.site._registry
        assert isinstance(admin.site._registry[Service], ServiceAdmin)

    def test_invoice_registered_in_admin(self):
        """Invoice should be registered in admin."""
        assert Invoice in admin.site._registry
        assert isinstance(admin.site._registry[Invoice], InvoiceAdmin)

    def test_payment_registered_in_admin(self):
        """Payment should be registered in admin."""
        assert Payment in admin.site._registry
        assert isinstance(admin.site._registry[Payment], PaymentAdmin)

    def test_receipt_registered_in_admin(self):
        """Receipt should be registered in admin."""
        assert Receipt in admin.site._registry
        assert isinstance(admin.site._registry[Receipt], ReceiptAdmin)

    def test_payment_point_registered_in_admin(self):
        """PaymentPoint should be registered in admin."""
        assert PaymentPoint in admin.site._registry
        assert isinstance(admin.site._registry[PaymentPoint], PaymentPointAdmin)

    def test_credit_note_registered_in_admin(self):
        """CreditNote should be registered in admin."""
        assert CreditNote in admin.site._registry
        assert isinstance(admin.site._registry[CreditNote], CreditNoteAdmin)


@pytest.mark.django_db
class TestInvoiceAdminCustomization:
    """Test Invoice admin customization with inline items."""

    def test_invoice_admin_has_inline_items(self, admin_site):
        """Invoice admin should have InvoiceItem inline."""
        invoice_admin = InvoiceAdmin(Invoice, admin_site)
        assert InvoiceItemInline in invoice_admin.inlines

    def test_invoice_admin_list_display(self, admin_site):
        """Invoice admin should have proper list display fields."""
        invoice_admin = InvoiceAdmin(Invoice, admin_site)
        assert "invoice_number" in invoice_admin.list_display
        assert "patient" in invoice_admin.list_display
        assert "status" in invoice_admin.list_display
        assert "subtotal" in invoice_admin.list_display

    def test_invoice_admin_search_fields(self, admin_site):
        """Invoice admin should have search functionality."""
        invoice_admin = InvoiceAdmin(Invoice, admin_site)
        assert len(invoice_admin.search_fields) > 0
        assert any("invoice_number" in field for field in invoice_admin.search_fields)

    def test_invoice_admin_readonly_fields(self, admin_site):
        """Invoice admin should have readonly fields."""
        invoice_admin = InvoiceAdmin(Invoice, admin_site)
        assert "invoice_number" in invoice_admin.readonly_fields
        assert "balance_due" in invoice_admin.readonly_fields
