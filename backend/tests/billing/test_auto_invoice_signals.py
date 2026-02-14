"""
TDD Tests for Auto-Create Invoice Items from Orders.

Tests that Dispensing and ImagingOrderItem auto-generate billing line items.

Patient Flow Recommendation #2: Auto-Create Invoice Items from Orders
- Dispensing → InvoiceItem (pharmacy billing)
- ImagingOrderItem → InvoiceItem (imaging billing)
- Note: LabOrder already handles billing in add_test() method, no signal needed

Following TDD approach: Write tests FIRST, then implement signals.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from hmis.apps.billing.models import Invoice, InvoiceItem
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_county(db):
    """Create a test county."""
    return County.objects.create(code=99, name="Test County")


@pytest.fixture
def sample_sub_county(db, sample_county):
    """Create a test sub-county."""
    return SubCounty.objects.create(county=sample_county, name="Test SubCounty")


@pytest.fixture
def sample_patient_for_billing(db, sample_county, sample_sub_county):
    """Create a patient for billing tests."""
    return Patient.objects.create(
        first_name="Billing",
        last_name="TestPatient",
        date_of_birth="1990-01-01",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def sample_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="billing_signal_user",
        email="billingtest@example.com",
        password="testpass123",
    )


@pytest.fixture
def sample_encounter_with_invoice(db, sample_patient_for_billing, sample_user):
    """Create an encounter that triggers auto-invoice creation via signal."""
    encounter = Encounter.objects.create(
        patient=sample_patient_for_billing,
        encounter_type="OPD",
        chief_complaint="Test for billing signals",
    )
    # Draft invoice should be auto-created by existing encounter signal
    return encounter


@pytest.fixture
def draft_invoice(db, sample_encounter_with_invoice):
    """Get the draft invoice created by the encounter signal."""
    # Invoice is auto-created by existing signal when encounter is created
    invoice = Invoice.objects.filter(
        patient=sample_encounter_with_invoice.patient,
        encounter=sample_encounter_with_invoice,
        status=Invoice.Status.DRAFT,
    ).first()
    assert invoice is not None, "Draft invoice should be auto-created for encounter"
    return invoice


@pytest.fixture
def sample_drug(db):
    """Create a test drug."""
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="AUTO-BILL-001",
        generic_name="Test Auto-Bill Drug",
        strength="500mg",
        form="TABLET",
        categories=["OTHER"],
        unit="tablet",
    )


@pytest.fixture
def sample_stock_batch(db, sample_drug, sample_user):
    """Create a stock batch for dispensing."""
    from hmis.apps.pharmacy.models import StockBatch

    return StockBatch.objects.create(
        drug=sample_drug,
        batch_number="AUTO-BATCH-001",
        quantity_received=1000,
        quantity_available=1000,
        expiry_date=date.today() + timedelta(days=365),
        received_date=date.today(),
        cost_price=Decimal("50.00"),
        selling_price=Decimal("100.00"),
        received_by=sample_user,
    )


@pytest.fixture
def sample_imaging_procedure(db):
    """Create a test imaging procedure."""
    from hmis.apps.imaging.models import ImagingProcedure

    return ImagingProcedure.objects.create(
        code="XRAY-AUTO-001",
        name="Test X-Ray for Auto-Billing",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
        sha_claimable=True,
    )


# ============================================================================
# DISPENSING BILLING SIGNAL TESTS
# ============================================================================


@pytest.mark.django_db
class TestDispensingAutoBilling:
    """Tests for auto-creating InvoiceItem when Dispensing is created."""

    def test_direct_dispensing_creates_invoice_item(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_drug,
        sample_stock_batch,
        sample_user,
    ):
        """Direct dispensing (OTC, without prescription) should auto-create InvoiceItem.

        Business rule: When drugs are dispensed directly without a prescription,
        the billing should happen at dispensing time.
        """
        from hmis.apps.pharmacy.models import Dispensing

        # Count existing invoice items
        initial_item_count = draft_invoice.items.count()

        # Create direct dispensing (no prescription_item)
        dispensing = Dispensing.objects.create(
            patient=sample_patient_for_billing,
            drug=sample_drug,
            batch=sample_stock_batch,
            quantity_dispensed=10,
            unit_price=Decimal("100.00"),
            total_price=Decimal("1000.00"),
            dispensed_by=sample_user,
        )

        # Refresh invoice
        draft_invoice.refresh_from_db()

        # Should have a new invoice item
        assert draft_invoice.items.count() == initial_item_count + 1

        # Verify the invoice item details
        invoice_item = draft_invoice.items.filter(dispensing=dispensing).first()
        assert invoice_item is not None
        assert invoice_item.item_type == InvoiceItem.ItemType.PHARMACY
        assert invoice_item.quantity == 10
        assert invoice_item.unit_price == Decimal("100.00")
        assert invoice_item.line_total == Decimal("1000.00")
        assert sample_drug.generic_name in invoice_item.description

    def test_dispensing_with_prescription_uses_existing_invoice_item(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_drug,
        sample_stock_batch,
        sample_user,
    ):
        """Dispensing from prescription should link to existing InvoiceItem (no duplicate).

        Business rule: Prescription items are billed at prescription time.
        When dispensing, we link the dispensing to the existing invoice item
        rather than creating a duplicate.
        """
        from hmis.apps.pharmacy.models import Dispensing, Prescription, PrescriptionItem

        # Create prescription - this triggers existing signal to create invoice item
        prescription = Prescription.objects.create(
            encounter=sample_encounter_with_invoice,
            patient=sample_patient_for_billing,
            prescribed_by=sample_user,
            valid_until=date.today() + timedelta(days=30),
        )

        prescription_item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=sample_drug,
            quantity=20,
            dosage="1 tablet",
            frequency="twice daily",
            duration="10 days",
        )

        # Invoice item was created by existing PrescriptionItem signal
        draft_invoice.refresh_from_db()
        initial_count = draft_invoice.items.count()
        assert initial_count == 1, "PrescriptionItem signal should have created invoice item"

        # Create dispensing from prescription
        dispensing = Dispensing.objects.create(
            prescription_item=prescription_item,
            patient=sample_patient_for_billing,
            drug=sample_drug,
            batch=sample_stock_batch,
            quantity_dispensed=20,
            unit_price=Decimal("100.00"),
            total_price=Decimal("2000.00"),
            dispensed_by=sample_user,
        )

        draft_invoice.refresh_from_db()

        # Should NOT create a duplicate - count should remain the same
        assert (
            draft_invoice.items.count() == initial_count
        ), "Should not duplicate billing for prescription-based dispensing"

        # The existing invoice item should now be linked to dispensing
        invoice_item = draft_invoice.items.filter(drug=sample_drug).first()
        assert invoice_item is not None
        assert (
            invoice_item.dispensing == dispensing
        ), "Existing invoice item should be linked to the dispensing"

    def test_direct_dispensing_no_duplicate_invoice_items(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_drug,
        sample_stock_batch,
        sample_user,
    ):
        """Re-saving direct dispensing should not create duplicate InvoiceItems."""
        from hmis.apps.pharmacy.models import Dispensing

        dispensing = Dispensing.objects.create(
            patient=sample_patient_for_billing,
            drug=sample_drug,
            batch=sample_stock_batch,
            quantity_dispensed=5,
            unit_price=Decimal("100.00"),
            total_price=Decimal("500.00"),
            dispensed_by=sample_user,
        )

        draft_invoice.refresh_from_db()
        item_count_after_create = draft_invoice.items.filter(dispensing=dispensing).count()
        assert (
            item_count_after_create == 1
        ), "Direct dispensing should create exactly 1 invoice item"

        # Save the dispensing again (simulating update)
        dispensing.notes = "Updated notes"
        dispensing.save()

        draft_invoice.refresh_from_db()
        item_count_after_update = draft_invoice.items.filter(dispensing=dispensing).count()
        assert item_count_after_update == 1, "Should not create duplicate invoice item on update"

    def test_dispensing_updates_invoice_totals(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_drug,
        sample_stock_batch,
        sample_user,
    ):
        """Creating dispensing should update invoice totals."""
        from hmis.apps.pharmacy.models import Dispensing

        initial_total = draft_invoice.total_amount or Decimal("0.00")

        Dispensing.objects.create(
            patient=sample_patient_for_billing,
            drug=sample_drug,
            batch=sample_stock_batch,
            quantity_dispensed=5,
            unit_price=Decimal("100.00"),
            total_price=Decimal("500.00"),
            dispensed_by=sample_user,
        )

        draft_invoice.refresh_from_db()
        assert draft_invoice.total_amount > initial_total


# ============================================================================
# IMAGING ORDER BILLING SIGNAL TESTS
# ============================================================================


@pytest.mark.django_db
class TestImagingOrderAutoBilling:
    """Tests for auto-creating InvoiceItem when ImagingOrderItem is created."""

    def test_imaging_order_item_creates_invoice_item(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_imaging_procedure,
        sample_user,
    ):
        """ImagingOrderItem should auto-create InvoiceItem linked to invoice."""
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

        # Create imaging order
        imaging_order = ImagingOrder.objects.create(
            patient=sample_patient_for_billing,
            encounter=sample_encounter_with_invoice,
            ordered_by=sample_user,
            clinical_indication="Test X-ray for billing",
            priority="ROUTINE",
            status="ORDERED",
        )

        initial_item_count = draft_invoice.items.count()

        # Add imaging order item
        imaging_order_item = ImagingOrderItem.objects.create(
            order=imaging_order,
            procedure=sample_imaging_procedure,
            laterality="NA",
            unit_cost=sample_imaging_procedure.cost,
        )

        # Refresh invoice
        draft_invoice.refresh_from_db()

        # Should have a new invoice item
        assert draft_invoice.items.count() == initial_item_count + 1

        # Verify the invoice item details
        invoice_item = draft_invoice.items.filter(imaging_order=imaging_order).first()
        assert invoice_item is not None
        assert invoice_item.item_type == InvoiceItem.ItemType.IMAGING
        assert invoice_item.unit_price == sample_imaging_procedure.cost
        assert sample_imaging_procedure.name in invoice_item.description

    def test_multiple_imaging_items_create_multiple_invoice_items(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_imaging_procedure,
        sample_user,
    ):
        """Multiple ImagingOrderItems should create separate InvoiceItems."""
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

        imaging_order = ImagingOrder.objects.create(
            patient=sample_patient_for_billing,
            encounter=sample_encounter_with_invoice,
            ordered_by=sample_user,
            clinical_indication="Multiple imaging tests",
            priority="ROUTINE",
            status="ORDERED",
        )

        # Create second procedure
        procedure_2 = ImagingProcedure.objects.create(
            code="US-AUTO-002",
            name="Test Ultrasound for Auto-Billing",
            modality="US",
            body_region="ABDOMEN",
            cost=Decimal("2000.00"),
            sha_claimable=True,
        )

        initial_count = draft_invoice.items.count()

        # Add two imaging items
        ImagingOrderItem.objects.create(
            order=imaging_order,
            procedure=sample_imaging_procedure,
            laterality="NA",
            unit_cost=sample_imaging_procedure.cost,
        )

        ImagingOrderItem.objects.create(
            order=imaging_order,
            procedure=procedure_2,
            laterality="NA",
            unit_cost=procedure_2.cost,
        )

        draft_invoice.refresh_from_db()

        # Should have 2 new invoice items
        imaging_items = draft_invoice.items.filter(imaging_order=imaging_order)
        assert imaging_items.count() == 2

    def test_imaging_order_item_no_duplicate_on_update(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_imaging_procedure,
        sample_user,
    ):
        """Re-saving ImagingOrderItem should not create duplicate InvoiceItems."""
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

        imaging_order = ImagingOrder.objects.create(
            patient=sample_patient_for_billing,
            encounter=sample_encounter_with_invoice,
            ordered_by=sample_user,
            clinical_indication="Test",
            priority="ROUTINE",
            status="ORDERED",
        )

        imaging_item = ImagingOrderItem.objects.create(
            order=imaging_order,
            procedure=sample_imaging_procedure,
            laterality="NA",
            unit_cost=sample_imaging_procedure.cost,
        )

        draft_invoice.refresh_from_db()
        count_after_create = draft_invoice.items.filter(imaging_order=imaging_order).count()

        # Update the imaging item
        imaging_item.specific_instructions = "Updated instructions"
        imaging_item.save()

        draft_invoice.refresh_from_db()
        count_after_update = draft_invoice.items.filter(imaging_order=imaging_order).count()

        assert count_after_update == count_after_create, "Should not duplicate on update"


# ============================================================================
# INVOICE ITEM MODEL TESTS (imaging_order FK)
# ============================================================================


@pytest.mark.django_db
class TestInvoiceItemImagingOrderField:
    """Tests for InvoiceItem imaging_order foreign key field."""

    def test_invoice_item_has_imaging_type(self):
        """InvoiceItem.ItemType should include IMAGING choice."""
        assert hasattr(InvoiceItem.ItemType, "IMAGING")
        assert InvoiceItem.ItemType.IMAGING == "imaging"

    def test_invoice_item_can_link_to_imaging_order(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_imaging_procedure,
        sample_user,
    ):
        """InvoiceItem should be able to link to ImagingOrder."""
        from hmis.apps.imaging.models import ImagingOrder

        imaging_order = ImagingOrder.objects.create(
            patient=sample_patient_for_billing,
            encounter=sample_encounter_with_invoice,
            ordered_by=sample_user,
            clinical_indication="Test",
            priority="ROUTINE",
            status="ORDERED",
        )

        # Create invoice item manually with imaging_order link
        invoice_item = InvoiceItem.objects.create(
            invoice=draft_invoice,
            item_type=InvoiceItem.ItemType.IMAGING,
            imaging_order=imaging_order,
            description="Test Imaging Item",
            quantity=1,
            unit_price=Decimal("1500.00"),
        )

        assert invoice_item.imaging_order == imaging_order
        assert invoice_item.item_type == InvoiceItem.ItemType.IMAGING


# ============================================================================
# EDGE CASES & ERROR HANDLING
# ============================================================================


@pytest.mark.django_db
class TestAutoBillingEdgeCases:
    """Tests for edge cases in auto-billing signals."""

    def test_dispensing_without_encounter_invoice_logs_warning(
        self, sample_patient_for_billing, sample_drug, sample_stock_batch, sample_user
    ):
        """Dispensing without linked encounter/invoice should not crash.

        The signal should handle gracefully when there's no invoice to attach to.
        """
        from hmis.apps.pharmacy.models import Dispensing

        # Create dispensing for patient without any encounter/invoice
        new_patient = Patient.objects.create(
            first_name="No",
            last_name="Invoice",
            date_of_birth="1995-01-01",
            gender="F",
            county=sample_patient_for_billing.county,
            sub_county=sample_patient_for_billing.sub_county,
        )

        # Should not raise exception, but log warning
        dispensing = Dispensing.objects.create(
            patient=new_patient,
            drug=sample_drug,
            batch=sample_stock_batch,
            quantity_dispensed=5,
            unit_price=Decimal("100.00"),
            total_price=Decimal("500.00"),
            dispensed_by=sample_user,
        )

        # Dispensing should be created successfully
        assert dispensing.pk is not None

        # No invoice items should be created (no invoice exists)
        assert InvoiceItem.objects.filter(dispensing=dispensing).count() == 0

    def test_imaging_order_in_non_draft_invoice_not_modified(
        self,
        sample_patient_for_billing,
        sample_encounter_with_invoice,
        draft_invoice,
        sample_imaging_procedure,
        sample_user,
    ):
        """Imaging items for finalized invoices should not auto-add.

        If invoice is already PENDING/PAID, don't auto-add items.
        """
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

        # Finalize the invoice
        draft_invoice.status = Invoice.Status.PENDING
        draft_invoice.save()

        imaging_order = ImagingOrder.objects.create(
            patient=sample_patient_for_billing,
            encounter=sample_encounter_with_invoice,
            ordered_by=sample_user,
            clinical_indication="Test",
            priority="ROUTINE",
            status="ORDERED",
        )

        initial_count = draft_invoice.items.count()

        # Add imaging item - should NOT add to non-draft invoice
        ImagingOrderItem.objects.create(
            order=imaging_order,
            procedure=sample_imaging_procedure,
            laterality="NA",
            unit_cost=sample_imaging_procedure.cost,
        )

        draft_invoice.refresh_from_db()

        # No new items should be added
        assert draft_invoice.items.count() == initial_count
