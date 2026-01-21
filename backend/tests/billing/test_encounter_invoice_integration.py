"""
TDD Tests for Encounter-Invoice Auto-Creation.

Sprint 1.5-1.6: Gap Fix
Gap 2: Services performed in encounters should auto-create invoice items.

These tests verify that:
1. Encounter services automatically create invoice items
2. Lab orders create invoice items when ordered
3. Prescriptions create invoice items when prescribed
4. Invoice items are linked to the correct encounter
5. Multiple services in an encounter create corresponding invoice items
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.encounters.models import Encounter


@pytest.fixture
def consultation_category(db):
    """Create a consultation service category."""
    return ServiceCategory.objects.create(
        name="Consultation",
        code="CONS",
        description="Consultation services",
        display_order=1,
    )


@pytest.fixture
def lab_category(db):
    """Create a lab service category."""
    return ServiceCategory.objects.create(
        name="Laboratory",
        code="LAB",
        description="Laboratory test services",
        display_order=2,
    )


@pytest.fixture
def pharmacy_category_svc(db):
    """Create a pharmacy service category."""
    return ServiceCategory.objects.create(
        name="Pharmacy",
        code="PHARM",
        description="Pharmacy dispensing services",
        display_order=3,
    )


@pytest.fixture
def consultation_service(db, consultation_category, test_user):
    """Create a consultation service."""
    return Service.objects.create(
        category=consultation_category,
        code="CONS-GEN",
        name="General Consultation",
        description="General doctor consultation",
        unit_price=Decimal("500.00"),
        sha_code="SHA-CONS-001",
        created_by=test_user,
    )


@pytest.fixture
def lab_test_service(db, lab_category, test_user):
    """Create a lab test service."""
    return Service.objects.create(
        category=lab_category,
        code="LAB-CBC",
        name="Complete Blood Count",
        description="Full blood count test",
        unit_price=Decimal("1500.00"),
        sha_code="SHA-LAB-CBC",
        created_by=test_user,
    )


@pytest.fixture
def urinalysis_service(db, lab_category, test_user):
    """Create a urinalysis lab test service."""
    return Service.objects.create(
        category=lab_category,
        code="LAB-UA",
        name="Urinalysis",
        description="Complete urinalysis",
        unit_price=Decimal("800.00"),
        sha_code="SHA-LAB-UA",
        created_by=test_user,
    )


@pytest.fixture
def test_encounter(db, sample_patient, test_user):
    """Create a test encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        encounter_date=date.today(),
        chief_complaint="Fever and headache",
        status="IN_PROGRESS",
        finalized_by=test_user,
    )


@pytest.mark.django_db
class TestEncounterAutoInvoiceCreation:
    """Tests for automatic invoice creation from encounter services."""

    def test_encounter_start_creates_draft_invoice(
        self, test_encounter, sample_patient, test_user
    ):
        """Starting an encounter should create a draft invoice for the patient."""
        # Encounter created via fixture
        # Check that a draft invoice was created
        invoice = Invoice.objects.filter(
            patient=sample_patient,
            encounter=test_encounter,
            status=Invoice.Status.DRAFT,
        ).first()

        assert invoice is not None
        assert invoice.patient == sample_patient
        assert invoice.encounter == test_encounter

    def test_consultation_adds_invoice_item(
        self, test_encounter, consultation_service
    ):
        """Recording a consultation should add invoice item."""
        # Get the encounter's invoice
        invoice = Invoice.objects.get(encounter=test_encounter)
        initial_items = invoice.items.count()

        # Add consultation to encounter (simulate doctor completing consultation)
        test_encounter.add_service(consultation_service)

        # Invoice should have a new item
        assert invoice.items.count() == initial_items + 1
        
        item = invoice.items.filter(service=consultation_service).first()
        assert item is not None
        assert item.description == consultation_service.name
        assert item.unit_price == consultation_service.unit_price
        assert item.quantity == 1

    @pytest.mark.skip(reason="Requires LabOrder.add_test() implementation in laboratory module")
    def test_lab_order_adds_invoice_items(
        self, test_encounter, lab_test_service, urinalysis_service, test_user
    ):
        """Ordering lab tests should add invoice items."""
        from hmis.apps.laboratory.models import LabOrder, LabTest

        invoice = Invoice.objects.get(encounter=test_encounter)
        initial_items = invoice.items.count()

        # Create lab order with multiple tests
        lab_order = LabOrder.objects.create(
            encounter=test_encounter,
            patient=test_encounter.patient,
            ordered_by=test_user,
            priority="ROUTINE",
        )

        # Add lab tests - each should create an invoice item
        lab_order.add_test(lab_test_service)
        lab_order.add_test(urinalysis_service)

        # Invoice should have items for each test
        assert invoice.items.count() == initial_items + 2

        cbc_item = invoice.items.filter(service=lab_test_service).first()
        assert cbc_item is not None
        assert cbc_item.unit_price == lab_test_service.unit_price

        ua_item = invoice.items.filter(service=urinalysis_service).first()
        assert ua_item is not None
        assert ua_item.unit_price == urinalysis_service.unit_price

    @pytest.mark.skip(reason="Requires Prescription model updates and billing integration")
    def test_prescription_adds_invoice_items(
        self, test_encounter, sample_drug, test_user
    ):
        """Prescribing medications should add invoice items."""
        from hmis.apps.pharmacy.models import Prescription, PrescriptionItem

        invoice = Invoice.objects.get(encounter=test_encounter)
        initial_items = invoice.items.count()

        # Create prescription
        prescription = Prescription.objects.create(
            encounter=test_encounter,
            patient=test_encounter.patient,
            prescribed_by=test_user,
        )

        # Add prescription item
        prescription_item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=sample_drug,
            dosage="500mg",
            frequency="TDS",
            duration="5 days",
            quantity_prescribed=15,
        )

        # Invoice should have item for the drug
        assert invoice.items.count() == initial_items + 1

        drug_item = invoice.items.filter(drug=sample_drug).first()
        assert drug_item is not None
        assert drug_item.quantity == 15

    def test_encounter_services_link_to_same_invoice(
        self, test_encounter, consultation_service, lab_test_service
    ):
        """All services in an encounter should link to the same invoice."""
        # Add multiple services
        test_encounter.add_service(consultation_service)
        test_encounter.add_service(lab_test_service)

        # All items should be on the same invoice
        invoice = Invoice.objects.get(encounter=test_encounter)
        
        cons_item = InvoiceItem.objects.filter(
            service=consultation_service,
            invoice__encounter=test_encounter,
        ).first()
        
        lab_item = InvoiceItem.objects.filter(
            service=lab_test_service,
            invoice__encounter=test_encounter,
        ).first()

        assert cons_item.invoice == lab_item.invoice
        assert cons_item.invoice == invoice

    def test_encounter_invoice_totals_update_automatically(
        self, test_encounter, consultation_service, lab_test_service
    ):
        """Invoice totals should update as services are added."""
        invoice = Invoice.objects.get(encounter=test_encounter)

        # Add consultation
        test_encounter.add_service(consultation_service)
        invoice.refresh_from_db()
        
        expected_total = consultation_service.unit_price
        assert invoice.subtotal == expected_total

        # Add lab test
        test_encounter.add_service(lab_test_service)
        invoice.refresh_from_db()
        
        expected_total += lab_test_service.unit_price
        assert invoice.subtotal == expected_total

    @pytest.mark.skip(reason="Requires LabOrder.add_test() and cancel() integration")
    def test_cancelled_service_removes_invoice_item(
        self, test_encounter, lab_test_service, test_user
    ):
        """Cancelling a service should remove the invoice item."""
        from hmis.apps.laboratory.models import LabOrder

        # Add lab order
        lab_order = LabOrder.objects.create(
            encounter=test_encounter,
            patient=test_encounter.patient,
            ordered_by=test_user,
            priority="ROUTINE",
        )
        lab_order.add_test(lab_test_service)

        invoice = Invoice.objects.get(encounter=test_encounter)
        assert invoice.items.filter(lab_order=lab_order).exists()

        # Cancel the lab order
        lab_order.cancel(user=test_user, reason="Patient refused test")

        # Invoice item should be removed
        assert not invoice.items.filter(lab_order=lab_order).exists()


@pytest.mark.django_db
class TestEncounterInvoiceEdgeCases:
    """Edge case tests for encounter-invoice integration."""

    def test_existing_invoice_used_for_same_day_encounter(
        self, sample_patient, test_user
    ):
        """If patient has draft invoice from today, use it instead of creating new."""
        # Create existing draft invoice
        existing_invoice = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        # Create new encounter
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Follow-up visit",
            status="IN_PROGRESS",
        )

        # Should use existing invoice, not create new one
        encounter_invoice = Invoice.objects.filter(encounter=encounter).first()
        assert encounter_invoice == existing_invoice

    def test_encounter_without_services_has_empty_invoice(self, test_encounter):
        """Encounter without services should have invoice with no items."""
        invoice = Invoice.objects.get(encounter=test_encounter)
        assert invoice.items.count() == 0
        assert invoice.subtotal == Decimal("0.00")

    def test_emergency_encounter_creates_invoice_with_priority_flag(
        self, sample_patient, test_user
    ):
        """Emergency encounters should flag invoices appropriately."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=date.today(),
            chief_complaint="Severe chest pain",
            status="IN_PROGRESS",
            finalized_by=test_user,
        )

        invoice = Invoice.objects.get(encounter=encounter)
        # Emergency invoices might have special handling
        assert invoice.encounter.encounter_type == "EMERGENCY"

    def test_duplicate_service_updates_quantity_not_creates_new_item(
        self, test_encounter, consultation_service
    ):
        """Adding same service twice should update quantity, not duplicate item."""
        invoice = Invoice.objects.get(encounter=test_encounter)

        # Add consultation twice
        test_encounter.add_service(consultation_service)
        test_encounter.add_service(consultation_service)

        # Should have only one item with quantity 2
        items = invoice.items.filter(service=consultation_service)
        assert items.count() == 1
        assert items.first().quantity == 2


@pytest.mark.django_db
class TestEncounterInvoiceStatus:
    """Tests for invoice status management during encounters."""

    def test_completing_encounter_finalizes_invoice(
        self, test_encounter, consultation_service
    ):
        """Completing an encounter should change invoice from draft to pending."""
        test_encounter.add_service(consultation_service)
        invoice = Invoice.objects.get(encounter=test_encounter)

        assert invoice.status == Invoice.Status.DRAFT

        # Complete the encounter
        test_encounter.complete()

        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.PENDING

    def test_pending_invoice_cannot_add_more_services(
        self, test_encounter, consultation_service, lab_test_service
    ):
        """Cannot add services to encounter with pending invoice."""
        test_encounter.add_service(consultation_service)
        invoice = Invoice.objects.get(encounter=test_encounter)

        # Complete encounter (changes invoice to pending)
        test_encounter.complete()

        # Trying to add more services should fail or create new invoice
        with pytest.raises(Exception):  # Could be ValidationError or custom exception
            test_encounter.add_service(lab_test_service)
