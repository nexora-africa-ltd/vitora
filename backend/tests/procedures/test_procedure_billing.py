"""Tests for procedure → billing integration."""

import pytest  # type: ignore
from decimal import Decimal

from django.utils import timezone

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.procedures.models import (
    ProcedureCatalog,
    ProcedureConsent,
    ProcedureLog,
    ProcedureOrder,
)


@pytest.mark.django_db
class TestProcedureBillingIntegration:
    """Test auto-billing when a procedure is completed."""

    @pytest.fixture
    def proc_service_category(self, db):
        return ServiceCategory.objects.create(
            code="PROC",
            name="Procedures",
            description="Medical procedures",
        )

    @pytest.fixture
    def proc_billing_service(self, proc_service_category, test_user):
        return Service.objects.create(
            category=proc_service_category,
            code="PROC-WC-TEST",
            name="Wound Dressing (Test)",
            unit_price=Decimal("750.00"),
            created_by=test_user,
        )

    @pytest.fixture
    def linked_catalog_entry(self, proc_billing_service):
        """Procedure catalog entry linked to a billing service."""
        return ProcedureCatalog.objects.create(
            code="PROC-WC-TEST",
            name="Wound Dressing (Test)",
            category=ProcedureCatalog.Category.WOUND_CARE,
            body_system=ProcedureCatalog.BodySystem.INTEGUMENTARY,
            base_fee=Decimal("500.00"),
            billing_service=proc_billing_service,
        )

    @pytest.fixture
    def unlinked_catalog_entry(self):
        """Procedure catalog entry WITHOUT billing service (base_fee fallback)."""
        return ProcedureCatalog.objects.create(
            code="PROC-FB-001",
            name="Fallback Procedure",
            category=ProcedureCatalog.Category.MINOR,
            base_fee=Decimal("3000.00"),
        )

    def test_complete_creates_invoice_item_via_billing_service(
        self, linked_catalog_entry, sample_patient, test_user
    ):
        """Completing a procedure with billing_service should create InvoiceItem using service price."""
        order = ProcedureOrder.objects.create(
            procedure=linked_catalog_entry,
            patient=sample_patient,
            ordered_by=test_user,
            indication="Test wound",
            priority=ProcedureOrder.Priority.ROUTINE,
        )
        order.status = ProcedureOrder.Status.IN_PROGRESS
        order.save(update_fields=["status"])

        log = ProcedureLog.objects.create(
            order=order,
            started_at=timezone.now(),
            performed_by=test_user,
            location="Procedure Room 1",
        )

        log.complete(status="COMPLETED", outcome="Healed well")

        order.refresh_from_db()
        assert order.status == ProcedureOrder.Status.COMPLETED

        # Invoice should exist
        invoice = Invoice.objects.filter(patient=sample_patient).first()
        assert invoice is not None

        # InvoiceItem should use billing service price (750), not base_fee (500)
        item = InvoiceItem.objects.filter(invoice=invoice).first()
        assert item is not None
        assert item.unit_price == Decimal("750.00")
        assert "Wound Dressing" in item.description

    def test_complete_creates_invoice_item_via_base_fee_fallback(
        self, unlinked_catalog_entry, sample_patient, test_user
    ):
        """Completing a procedure without billing_service uses base_fee."""
        order = ProcedureOrder.objects.create(
            procedure=unlinked_catalog_entry,
            patient=sample_patient,
            ordered_by=test_user,
            indication="Test procedure",
            priority=ProcedureOrder.Priority.ROUTINE,
        )
        order.status = ProcedureOrder.Status.IN_PROGRESS
        order.save(update_fields=["status"])

        log = ProcedureLog.objects.create(
            order=order,
            started_at=timezone.now(),
            performed_by=test_user,
            location="Procedure Room 1",
        )

        log.complete(status="COMPLETED")

        item = InvoiceItem.objects.filter(
            invoice__patient=sample_patient,
            description__icontains="Fallback Procedure",
        ).first()
        assert item is not None
        assert item.unit_price == Decimal("3000.00")

    def test_billing_price_property_uses_service(self, linked_catalog_entry):
        """billing_price should prefer billing_service.unit_price."""
        assert linked_catalog_entry.billing_price == Decimal("750.00")

    def test_billing_price_property_falls_back_to_base_fee(self, unlinked_catalog_entry):
        """billing_price should fall back to base_fee when no service."""
        assert unlinked_catalog_entry.billing_price == Decimal("3000.00")

    def test_billing_price_property_none_when_both_missing(self, db):
        """billing_price should be None when neither service nor base_fee."""
        entry = ProcedureCatalog.objects.create(
            code="PROC-NO-PRICE",
            name="No Price Procedure",
            category=ProcedureCatalog.Category.OTHER,
        )
        assert entry.billing_price is None
