"""
Pytest fixtures for pharmacy module tests.

This file contains shared fixtures specific to pharmacy testing.
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal


@pytest.fixture
def sample_drug(db):
    """Create a sample drug for testing."""
    from hmis.apps.pharmacy.models import Drug
    
    return Drug.objects.create(
        code="PARA500",
        generic_name="Paracetamol",
        strength="500mg",
        form="TABLET",
        category="ANALGESIC",
        schedule="OTC",
        unit="tablet",
        keml_code="02.01",
        is_essential=True,
        requires_prescription=False,
        default_reorder_level=50,
        default_reorder_quantity=100,
        reference_price=Decimal("10.00"),
    )


@pytest.fixture
def controlled_drug(db):
    """Create a controlled drug for testing."""
    from hmis.apps.pharmacy.models import Drug
    
    return Drug.objects.create(
        code="MORPH10",
        generic_name="Morphine",
        strength="10mg",
        form="INJECTION",
        category="CONTROLLED",
        schedule="CD",
        unit="vial",
        is_controlled=True,
        is_narcotic=True,
        requires_prescription=True,
        default_reorder_level=20,
        default_reorder_quantity=50,
        reference_price=Decimal("150.00"),
    )


@pytest.fixture
def antibiotic_drug(db):
    """Create an antibiotic drug for testing."""
    from hmis.apps.pharmacy.models import Drug
    
    return Drug.objects.create(
        code="AMOX500",
        generic_name="Amoxicillin",
        brand_names=["Amoxil", "Trimox"],
        strength="500mg",
        form="CAPSULE",
        category="ANTIBIOTIC",
        schedule="POM",
        unit="capsule",
        keml_code="06.02.01",
        is_essential=True,
        requires_prescription=True,
        default_reorder_level=100,
        default_reorder_quantity=200,
        reference_price=Decimal("25.00"),
    )


@pytest.fixture
def stock_batch(db, sample_drug, test_user):
    """Create a sample stock batch for testing."""
    from hmis.apps.pharmacy.models import StockBatch
    
    return StockBatch.objects.create(
        drug=sample_drug,
        batch_number="BATCH001",
        quantity_received=1000,
        quantity_available=1000,
        manufacture_date=date.today() - timedelta(days=90),
        expiry_date=date.today() + timedelta(days=365),
        received_date=date.today() - timedelta(days=10),
        cost_price=Decimal("5.00"),
        selling_price=Decimal("10.00"),
        supplier="Test Supplier Ltd",
        received_by=test_user,
        status="AVAILABLE",
    )


@pytest.fixture
def expiring_batch(db, sample_drug, test_user):
    """Create a batch that's expiring soon for testing."""
    from hmis.apps.pharmacy.models import StockBatch
    
    return StockBatch.objects.create(
        drug=sample_drug,
        batch_number="BATCH002",
        quantity_received=500,
        quantity_available=500,
        manufacture_date=date.today() - timedelta(days=730),
        expiry_date=date.today() + timedelta(days=60),  # Expiring in 60 days
        received_date=date.today() - timedelta(days=720),
        cost_price=Decimal("5.00"),
        selling_price=Decimal("10.00"),
        supplier="Test Supplier Ltd",
        received_by=test_user,
        status="AVAILABLE",
    )


@pytest.fixture
def expired_batch(db, sample_drug, test_user):
    """Create an expired batch for testing."""
    from hmis.apps.pharmacy.models import StockBatch
    
    return StockBatch.objects.create(
        drug=sample_drug,
        batch_number="BATCH003",
        quantity_received=300,
        quantity_available=300,
        manufacture_date=date.today() - timedelta(days=1095),
        expiry_date=date.today() - timedelta(days=10),  # Already expired
        received_date=date.today() - timedelta(days=1080),
        cost_price=Decimal("5.00"),
        selling_price=Decimal("10.00"),
        supplier="Test Supplier Ltd",
        received_by=test_user,
        status="EXPIRED",
    )


@pytest.fixture
def prescription(db, sample_encounter, sample_patient, test_user):
    """Create a sample prescription for testing."""
    from hmis.apps.pharmacy.models import Prescription
    
    return Prescription.objects.create(
        encounter=sample_encounter,
        patient=sample_patient,
        prescribed_by=test_user,
        valid_until=date.today() + timedelta(days=30),
        clinical_notes="Take as prescribed",
    )


@pytest.fixture
def prescription_item(db, prescription, sample_drug):
    """Create a sample prescription item for testing."""
    from hmis.apps.pharmacy.models import PrescriptionItem
    
    return PrescriptionItem.objects.create(
        prescription=prescription,
        drug=sample_drug,
        quantity=30,
        dosage="1 tablet",
        frequency="3 times daily",
        duration="10 days",
        route="Oral",
        instructions="Take after meals",
    )


@pytest.fixture
def sample_stock_batch(db, sample_drug, test_user):
    """Alias for stock_batch fixture."""
    from hmis.apps.pharmacy.models import StockBatch
    
    return StockBatch.objects.create(
        drug=sample_drug,
        batch_number="BATCH001",
        quantity_received=1000,
        quantity_available=1000,
        manufacture_date=date.today() - timedelta(days=90),
        expiry_date=date.today() + timedelta(days=365),
        received_date=date.today() - timedelta(days=10),
        cost_price=Decimal("5.00"),
        selling_price=Decimal("10.00"),
        supplier="Test Supplier Ltd",
        received_by=test_user,
        status="AVAILABLE",
    )


@pytest.fixture
def sample_dispensing(db, sample_patient, sample_drug, sample_stock_batch, test_user):
    """Create a sample dispensing for testing."""
    from hmis.apps.pharmacy.models import Dispensing
    
    return Dispensing.objects.create(
        patient=sample_patient,
        drug=sample_drug,
        batch=sample_stock_batch,
        quantity_dispensed=10,
        unit_price=Decimal("10.00"),
        total_price=Decimal("100.00"),
        discount=Decimal("0.00"),
        dispensed_by=test_user,
        patient_counseled=True,
        instructions_given="Take as directed",
    )
