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
