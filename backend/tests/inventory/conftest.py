"""
Pytest fixtures for inventory module tests.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore


@pytest.fixture
def sample_drug(db):
    """Create a sample drug for inventory testing."""
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="INV-AMOX500",
        generic_name="Amoxicillin",
        strength="500mg",
        form="CAPSULE",
        category="ANTIBIOTIC",
        schedule="POM",
        unit="capsule",
        is_essential=True,
        requires_prescription=True,
        default_reorder_level=100,
        default_reorder_quantity=500,
        reference_price=Decimal("5.00"),
    )


@pytest.fixture
def second_drug(db):
    """Create a second drug for testing POs with multiple items."""
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="INV-PARA500",
        generic_name="Paracetamol",
        strength="500mg",
        form="TABLET",
        category="ANALGESIC",
        schedule="OTC",
        unit="tablet",
        is_essential=True,
        requires_prescription=False,
        default_reorder_level=200,
        default_reorder_quantity=1000,
        reference_price=Decimal("2.00"),
    )


@pytest.fixture
def sample_supplier(db, sample_organization):
    """Create a sample supplier."""
    from hmis.apps.inventory.models import Supplier

    return Supplier.objects.create(
        code="SUP-001",
        name="Kenya Medical Supplies Authority",
        supplier_type="GOVERNMENT",
        contact_person="John Mwangi",
        email="procurement@kemsa.go.ke",
        phone="+254700000001",
        address="Commercial Street, Nairobi",
        tax_pin="P000000001A",
        payment_terms="Net 60",
        lead_time_days=14,
        rating=Decimal("4.50"),
        is_active=True,
        organization=sample_organization,
    )


@pytest.fixture
def second_supplier(db, sample_organization):
    """Create a second supplier."""
    from hmis.apps.inventory.models import Supplier

    return Supplier.objects.create(
        code="SUP-002",
        name="Nairobi Pharma Distributors",
        supplier_type="DISTRIBUTOR",
        contact_person="Jane Wanjiku",
        email="orders@nairobipharma.co.ke",
        phone="+254700000002",
        payment_terms="Net 30",
        lead_time_days=7,
        rating=Decimal("3.80"),
        is_active=True,
        organization=sample_organization,
    )


@pytest.fixture
def sample_purchase_order(
    db, sample_supplier, sample_facility, sample_organization, test_user, sample_drug
):
    """Create a sample PO with one item."""
    from hmis.apps.inventory.models import PurchaseOrder, PurchaseOrderItem

    po = PurchaseOrder.objects.create(
        supplier=sample_supplier,
        ordered_by=test_user,
        order_date=date.today(),
        expected_delivery_date=date.today() + timedelta(days=14),
        notes="Standard monthly order",
        facility=sample_facility,
        organization=sample_organization,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        drug=sample_drug,
        quantity_ordered=500,
        unit_cost=Decimal("4.50"),
    )
    return po


@pytest.fixture
def submitted_purchase_order(sample_purchase_order):
    """A PO in SUBMITTED status."""
    sample_purchase_order.submit()
    return sample_purchase_order


@pytest.fixture
def approved_purchase_order(submitted_purchase_order, test_user):
    """A PO in APPROVED status."""
    submitted_purchase_order.approve(test_user)
    return submitted_purchase_order


@pytest.fixture
def sample_grn(
    db,
    sample_supplier,
    sample_facility,
    sample_organization,
    test_user,
    approved_purchase_order,
    sample_drug,
):
    """Create a sample GRN linked to an approved PO."""
    from hmis.apps.inventory.models import GoodsReceiptNote, GRNItem

    po_item = approved_purchase_order.items.first()

    grn = GoodsReceiptNote.objects.create(
        purchase_order=approved_purchase_order,
        supplier=sample_supplier,
        received_by=test_user,
        received_date=date.today(),
        delivery_note_number="DN-2026-001",
        invoice_number="INV-2026-001",
        notes="Received in good condition",
        facility=sample_facility,
        organization=sample_organization,
    )
    GRNItem.objects.create(
        grn=grn,
        drug=sample_drug,
        po_item=po_item,
        batch_number="BATCH-AMOX-2026-04",
        expiry_date=date.today() + timedelta(days=730),
        manufacture_date=date.today() - timedelta(days=30),
        quantity_received=500,
        cost_price=Decimal("4.50"),
        selling_price=Decimal("8.00"),
        location="Shelf A-3",
    )
    return grn


@pytest.fixture
def supplier_data(sample_organization):
    """Valid supplier creation payload."""
    return {
        "code": "SUP-NEW",
        "name": "New Pharmaceutical Supplier",
        "supplier_type": "WHOLESALER",
        "contact_person": "Alice Njeri",
        "email": "alice@newpharma.co.ke",
        "phone": "+254712345678",
        "payment_terms": "Net 30",
        "lead_time_days": 10,
    }


@pytest.fixture
def po_data(sample_supplier, sample_drug):
    """Valid PO creation payload with nested items."""
    return {
        "supplier": sample_supplier.id,
        "order_date": str(date.today()),
        "expected_delivery_date": str(date.today() + timedelta(days=14)),
        "notes": "Test purchase order",
        "items": [
            {
                "drug": sample_drug.id,
                "quantity_ordered": 1000,
                "unit_cost": "4.00",
            },
        ],
    }


@pytest.fixture
def grn_data(sample_supplier, approved_purchase_order, sample_drug):
    """Valid GRN creation payload with nested items."""
    po_item = approved_purchase_order.items.first()
    return {
        "purchase_order": approved_purchase_order.id,
        "supplier": sample_supplier.id,
        "received_date": str(date.today()),
        "delivery_note_number": "DN-TEST-001",
        "invoice_number": "INV-TEST-001",
        "notes": "Test goods receipt",
        "items": [
            {
                "drug": sample_drug.id,
                "po_item": po_item.id,
                "batch_number": "BATCH-TEST-001",
                "expiry_date": str(date.today() + timedelta(days=365)),
                "quantity_received": 500,
                "cost_price": "4.50",
                "selling_price": "8.00",
                "location": "Shelf B-1",
            },
        ],
    }


# ===========================================================================
# Phase 2: Multi-Store Stock Transfers
# ===========================================================================


@pytest.fixture
def second_facility(db, sample_organization, sample_county, sample_sub_county):
    """Create a second facility for cross-facility transfer tests."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Branch Health Centre",
        mfl_code="88888",
        level="2",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def main_store(db, sample_facility, sample_organization):
    """Create a main store location at the sample facility."""
    from hmis.apps.inventory.models import StoreLocation

    return StoreLocation.objects.create(
        code="STORE-MAIN",
        name="Main Pharmacy Store",
        location_type="MAIN_STORE",
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def ward_store(db, sample_facility, sample_organization):
    """Create a ward store location at the sample facility."""
    from hmis.apps.inventory.models import StoreLocation

    return StoreLocation.objects.create(
        code="STORE-WARD-A",
        name="Ward A Store",
        location_type="WARD_STORE",
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def destination_store(db, second_facility, sample_organization):
    """Create a store at the second facility."""
    from hmis.apps.inventory.models import StoreLocation

    return StoreLocation.objects.create(
        code="STORE-MAIN",
        name="Branch Main Store",
        location_type="MAIN_STORE",
        is_active=True,
        facility=second_facility,
        organization=sample_organization,
    )


@pytest.fixture
def source_stock_batch(db, sample_drug, sample_facility, sample_organization, test_user):
    """Create a stock batch at the source facility for transfer testing."""
    from hmis.apps.pharmacy.models import StockBatch

    return StockBatch.objects.create(
        drug=sample_drug,
        batch_number="SRC-BATCH-001",
        quantity_received=1000,
        quantity_available=1000,
        expiry_date=date.today() + timedelta(days=365),
        manufacture_date=date.today() - timedelta(days=30),
        received_date=date.today(),
        cost_price=Decimal("4.50"),
        selling_price=Decimal("8.00"),
        supplier="KEMSA",
        received_by=test_user,
        location="Shelf A-1",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_transfer(
    db,
    sample_facility,
    second_facility,
    sample_organization,
    test_user,
    sample_drug,
    source_stock_batch,
    main_store,
    destination_store,
):
    """Create a sample stock transfer with one item."""
    from hmis.apps.inventory.models import StockTransfer, TransferItem

    transfer = StockTransfer.objects.create(
        source_facility=sample_facility,
        destination_facility=second_facility,
        source_store=main_store,
        destination_store=destination_store,
        requested_by=test_user,
        request_date=date.today(),
        notes="Monthly supply replenishment",
        organization=sample_organization,
    )
    TransferItem.objects.create(
        transfer=transfer,
        drug=sample_drug,
        source_batch=source_stock_batch,
        quantity_requested=200,
    )
    return transfer


@pytest.fixture
def submitted_transfer(sample_transfer):
    """A transfer in REQUESTED status."""
    sample_transfer.submit()
    return sample_transfer


@pytest.fixture
def approved_transfer(submitted_transfer, test_user):
    """A transfer in APPROVED status."""
    submitted_transfer.approve(test_user)
    return submitted_transfer


@pytest.fixture
def dispatched_transfer(approved_transfer, test_user):
    """A transfer in IN_TRANSIT status (stock deducted from source)."""
    approved_transfer.dispatch(test_user)
    return approved_transfer


@pytest.fixture
def store_location_data():
    """Valid store location creation payload."""
    return {
        "code": "STORE-NEW",
        "name": "New Satellite Pharmacy",
        "location_type": "SATELLITE_PHARMACY",
        "is_active": True,
        "notes": "Located in wing B",
    }


@pytest.fixture
def transfer_data(
    sample_facility, second_facility, main_store, destination_store, sample_drug, source_stock_batch
):
    """Valid stock transfer creation payload with nested items."""
    return {
        "source_facility": sample_facility.id,
        "destination_facility": second_facility.id,
        "source_store": main_store.id,
        "destination_store": destination_store.id,
        "request_date": str(date.today()),
        "notes": "Test transfer",
        "items": [
            {
                "drug": sample_drug.id,
                "source_batch": source_stock_batch.id,
                "quantity_requested": 100,
            },
        ],
    }
