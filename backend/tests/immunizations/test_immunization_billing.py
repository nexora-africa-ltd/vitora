"""
Tests for immunization → billing integration.

Covers:
- Auto-billing on vaccine administration via signal
- VACCINATION item type on InvoiceItem
- Idempotency (no double-billing)
- Fallback behaviour when no billing Service exists
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.billing.agent import BillingAgentService
from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.immunizations.models import ImmunizationRecord, VaccineDefinition


@pytest.fixture
def bcg_vaccine(db):
    return VaccineDefinition.objects.create(
        code="BCG",
        name="Bacille Calmette-Guérin",
        disease_target="Tuberculosis",
        standard_age_days=0,
        route="ID",
        dose_number=1,
        target_population="INFANT",
        program="KEPI",
    )


@pytest.fixture
def child_patient(
    db,
    test_user,
    sample_county,
    sample_sub_county,
    sample_organization,
    sample_facility,
):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Baby",
        last_name="Wanjiku",
        date_of_birth=date.today() - timedelta(days=30),
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


@pytest.fixture
def imm_service_category(db):
    return ServiceCategory.objects.create(
        code="IMM",
        name="Immunization",
    )


@pytest.fixture
def bcg_billing_service(bcg_vaccine, imm_service_category, test_user):
    return Service.objects.create(
        code=bcg_vaccine.code,
        name=f"Vaccine: {bcg_vaccine.name}",
        unit_price=Decimal("150.00"),  # Administration fee
        category=imm_service_category,
        is_active=True,
        created_by=test_user,
    )


@pytest.fixture
def scheduled_record(child_patient, bcg_vaccine, sample_facility):
    return ImmunizationRecord.objects.create(
        patient=child_patient,
        vaccine=bcg_vaccine,
        dose_number=1,
        scheduled_date=child_patient.date_of_birth,
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.mark.django_db
class TestImmunizationBilling:
    """Tests for auto-billing vaccine administration."""

    def test_handler_creates_invoice_item(
        self,
        scheduled_record,
        bcg_billing_service,
    ):
        """Agent handler should create a VACCINATION line item."""
        # Simulate administration
        scheduled_record.status = "ADMINISTERED"
        scheduled_record.administered_date = date.today()
        scheduled_record.save()

        BillingAgentService.handle_immunization_administered(scheduled_record)

        # Verify invoice exists
        invoice = Invoice.objects.filter(patient=scheduled_record.patient).first()
        assert invoice is not None

        # Verify line item
        item = invoice.items.filter(
            immunization_record=scheduled_record,
        ).first()
        assert item is not None
        assert item.item_type == InvoiceItem.ItemType.VACCINATION
        assert item.service == bcg_billing_service
        assert "Bacille Calmette" in item.description
        assert "dose 1" in item.description

    def test_idempotency_no_double_billing(
        self,
        scheduled_record,
        bcg_billing_service,
    ):
        """Should not create duplicate line items for the same record."""
        scheduled_record.status = "ADMINISTERED"
        scheduled_record.save()

        BillingAgentService.handle_immunization_administered(scheduled_record)
        BillingAgentService.handle_immunization_administered(scheduled_record)

        invoice = Invoice.objects.filter(patient=scheduled_record.patient).first()
        items = invoice.items.filter(immunization_record=scheduled_record)
        assert items.count() == 1

    def test_no_billing_service_or_base_fee_logs_warning(
        self,
        scheduled_record,
        caplog,
    ):
        """Should log warning when no billing Service or base_fee is found for a vaccine."""
        scheduled_record.status = "ADMINISTERED"
        scheduled_record.save()

        import logging

        with caplog.at_level(logging.WARNING):
            BillingAgentService.handle_immunization_administered(scheduled_record)

        assert "no billing Service or base_fee found" in caplog.text

    def test_signal_triggers_on_administration(
        self,
        scheduled_record,
        bcg_billing_service,
    ):
        """post_save signal should trigger billing when status becomes ADMINISTERED."""
        # The signal in billing/apps.py connects to ImmunizationRecord post_save.
        # Saving with status=ADMINISTERED should auto-create billing.
        scheduled_record.status = "ADMINISTERED"
        scheduled_record.administered_date = date.today()
        scheduled_record.save()

        invoice = Invoice.objects.filter(patient=scheduled_record.patient).first()
        assert invoice is not None

        item = invoice.items.filter(
            immunization_record=scheduled_record,
        ).first()
        assert item is not None
        assert item.item_type == InvoiceItem.ItemType.VACCINATION

    def test_signal_does_not_trigger_for_scheduled(
        self,
        scheduled_record,
        bcg_billing_service,
    ):
        """Should not create billing for non-ADMINISTERED status."""
        # Record stays SCHEDULED — signal should skip
        scheduled_record.notes = "Updated notes"
        scheduled_record.save()

        invoice = Invoice.objects.filter(patient=scheduled_record.patient).first()
        assert invoice is None

    def test_vaccination_item_type_exists(self):
        """VACCINATION should be a valid InvoiceItem.ItemType choice."""
        assert hasattr(InvoiceItem.ItemType, "VACCINATION")
        assert InvoiceItem.ItemType.VACCINATION == "vaccination"

    def test_billing_service_fk_preferred_over_code_lookup(
        self,
        scheduled_record,
        bcg_billing_service,
        imm_service_category,
        test_user,
    ):
        """billing_service FK on VaccineDefinition should take priority over code lookup."""
        # Create a different Service and link it explicitly via FK
        explicit_service = Service.objects.create(
            code="IMM-BCG-SPECIAL",
            name="BCG Special Rate",
            unit_price=Decimal("200.00"),
            category=imm_service_category,
            is_active=True,
            created_by=test_user,
        )
        vaccine = scheduled_record.vaccine
        vaccine.billing_service = explicit_service
        vaccine.save()

        scheduled_record.status = "ADMINISTERED"
        scheduled_record.administered_date = date.today()
        scheduled_record.save()

        BillingAgentService.handle_immunization_administered(scheduled_record)

        invoice = Invoice.objects.filter(patient=scheduled_record.patient).first()
        item = invoice.items.get(immunization_record=scheduled_record)
        # Should use the explicitly linked service, not the code-matched one
        assert item.service == explicit_service
        assert item.unit_price == Decimal("200.00")

    def test_base_fee_fallback_when_no_service(
        self,
        scheduled_record,
    ):
        """Should use VaccineDefinition.base_fee when no billing Service is found."""
        vaccine = scheduled_record.vaccine
        vaccine.base_fee = Decimal("100.00")
        vaccine.save()

        scheduled_record.status = "ADMINISTERED"
        scheduled_record.administered_date = date.today()
        scheduled_record.save()

        BillingAgentService.handle_immunization_administered(scheduled_record)

        invoice = Invoice.objects.filter(patient=scheduled_record.patient).first()
        assert invoice is not None

        item = invoice.items.get(immunization_record=scheduled_record)
        assert item.service is None
        assert item.unit_price == Decimal("100.00")
        assert item.item_type == InvoiceItem.ItemType.VACCINATION


@pytest.mark.django_db
class TestVaccineDefinitionBilling:
    """Tests for VaccineDefinition billing fields and billing_price property."""

    def test_billing_price_from_billing_service(self, imm_service_category, test_user):
        """billing_price should return billing_service.unit_price when linked."""
        service = Service.objects.create(
            code="IMM-TEST",
            name="Test Vaccine Service",
            unit_price=Decimal("250.00"),
            category=imm_service_category,
            is_active=True,
            created_by=test_user,
        )
        vaccine = VaccineDefinition.objects.create(
            code="TEST-VAX",
            name="Test Vaccine",
            billing_service=service,
            base_fee=Decimal("100.00"),  # should be ignored
        )
        assert vaccine.billing_price == Decimal("250.00")

    def test_billing_price_falls_back_to_base_fee(self):
        """billing_price should return base_fee when no billing_service is set."""
        vaccine = VaccineDefinition.objects.create(
            code="TEST-VAX2",
            name="Test Vaccine 2",
            base_fee=Decimal("75.00"),
        )
        assert vaccine.billing_price == Decimal("75.00")

    def test_billing_price_returns_none_when_nothing_set(self):
        """billing_price should return None when neither billing_service nor base_fee is set."""
        vaccine = VaccineDefinition.objects.create(
            code="TEST-VAX3",
            name="Test Vaccine 3",
        )
        assert vaccine.billing_price is None
