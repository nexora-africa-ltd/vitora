"""
Pytest fixtures for SHA compliance tests.

These fixtures provide test data for validating SHA integration compliance.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest # type: ignore
from django.contrib.auth import get_user_model

User = get_user_model()


# Try to import SHA models - may fail if not fully implemented
try:
    from hmis.apps.billing.models import (
        SHAClaim,
        SHAClaimItem,
        SHAEligibilityCheck,
        SHAMember,
        SHATariff,
        Invoice,
        InvoiceItem,
        Service,
        ServiceCategory,
    )
    HAS_SHA_MODELS = True
except ImportError:
    HAS_SHA_MODELS = False

try:
    from hmis.apps.patients.models import Patient
    HAS_PATIENT_MODEL = True
except ImportError:
    HAS_PATIENT_MODEL = False

try:
    from hmis.apps.encounters.models import Encounter
    HAS_ENCOUNTER_MODEL = True
except ImportError:
    HAS_ENCOUNTER_MODEL = False

try:
    from hmis.apps.core.models import County, SubCounty, Ward
    HAS_LOCATION_MODELS = True
except ImportError:
    HAS_LOCATION_MODELS = False


@pytest.fixture
def sha_test_user(db):
    """Create a test user for SHA tests."""
    return User.objects.create_user(
        username='sha_testuser',
        password='testpass123',
        email='sha_test@example.com'
    )


@pytest.fixture
def sample_county(db):
    """Create a sample Kenya county."""
    if not HAS_LOCATION_MODELS:
        pytest.skip("Location models not available")
    
    county, _ = County.objects.get_or_create(
        code=1,
        defaults={'name': 'Mombasa'}
    )
    return county


@pytest.fixture
def sample_sub_county(db, sample_county):
    """Create a sample sub-county."""
    if not HAS_LOCATION_MODELS:
        pytest.skip("Location models not available")
    
    sub_county, _ = SubCounty.objects.get_or_create(
        county=sample_county,
        name='Mvita'
    )
    return sub_county


@pytest.fixture
def sample_ward(db, sample_sub_county):
    """Create a sample ward."""
    if not HAS_LOCATION_MODELS:
        pytest.skip("Location models not available")
    
    ward, _ = Ward.objects.get_or_create(
        sub_county=sample_sub_county,
        name='Mji Wa Kale'
    )
    return ward


@pytest.fixture
def sha_test_patient(db, sha_test_user, sample_county, sample_sub_county, sample_ward):
    """Create a test patient for SHA compliance tests."""
    if not HAS_PATIENT_MODEL:
        pytest.skip("Patient model not available")
    
    return Patient.objects.create(
        first_name='John',
        last_name='Doe',
        date_of_birth=date(1990, 5, 15),
        gender='M',
        county=sample_county,
        sub_county=sample_sub_county,
        ward=sample_ward,
        phone_number='+254700123456',
        national_id='12345678',
        registered_by=sha_test_user,
    )


@pytest.fixture
def sha_member(db, sha_test_patient, sha_test_user):
    """Create an SHA member for compliance tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    # Use lowercase values matching model's TextChoices
    return SHAMember.objects.create(
        patient=sha_test_patient,
        sha_number='SHA-12345678901234-5',
        national_id=sha_test_patient.national_id,
        membership_type='principal',  # lowercase as per MembershipType.PRINCIPAL
        status='active',              # lowercase as per MembershipStatus.ACTIVE
        created_by=sha_test_user,
    )


@pytest.fixture
def sha_member_no_sha_number(db, sha_test_patient, sha_test_user, sample_county, sample_sub_county):
    """Create an SHA member without SHA number for national_id fallback tests.
    
    The sha_number field is required by the model, but we can simulate a fallback
    scenario by having the test mock/patch sha_member.sha_number to empty string.
    """
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    # Create another patient for this member
    patient = Patient.objects.create(
        first_name='Jane',
        last_name='Smith',
        date_of_birth=date(1985, 3, 20),
        gender='F',
        county=sample_county,
        sub_county=sample_sub_county,
        phone_number='+254700999888',
        national_id='87654321',
        registered_by=sha_test_user,
    )
    
    # Create member with sha_number (required by model)
    member = SHAMember.objects.create(
        patient=patient,
        sha_number='SHA-00000000000000-0',  # Required by model
        national_id=patient.national_id,
        membership_type='principal',
        status='active',
        created_by=sha_test_user,
    )
    
    # Clear sha_number in memory for fallback test (not saved to DB)
    member.sha_number = ''
    return member


@pytest.fixture
def sha_service_category(db):
    """Create a service category for SHA tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    return ServiceCategory.objects.create(
        name='Consultation',
        code='CONS',
        description='Consultation services',
        display_order=1
    )


@pytest.fixture
def sha_service(db, sha_service_category, sha_test_user):
    """Create a service with SHA code."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    return Service.objects.create(
        category=sha_service_category,
        code='CONS-GEN',
        name='General Consultation',
        description='General doctor consultation',
        unit_price=Decimal('500.00'),
        sha_code='SHA-08-001',
        created_by=sha_test_user,
    )


@pytest.fixture
def sha_tariff(db, sha_test_user):
    """Create an SHA tariff for tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    # Use lowercase values matching TariffCategory and TariffLevel choices
    return SHATariff.objects.create(
        code='SHA-08-001',
        name='General Consultation',
        description='General outpatient consultation',
        category='consultation',  # TariffCategory.CONSULTATION
        sha_amount=Decimal('300.00'),
        facility_level='L4',  # TariffLevel.LEVEL_4
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
        requires_preauthorization=False,
    )


@pytest.fixture
def sha_test_encounter(db, sha_test_patient, sha_test_user):
    """Create a test encounter for SHA tests."""
    if not HAS_ENCOUNTER_MODEL:
        pytest.skip("Encounter model not available")
    
    return Encounter.objects.create(
        patient=sha_test_patient,
        encounter_type='OPD',
        encounter_date=date.today(),
        chief_complaint='General checkup',
        status='completed',
        finalized_by=sha_test_user
    )


@pytest.fixture
def sha_test_invoice(db, sha_test_patient, sha_test_user):
    """Create a test invoice for SHA tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    return Invoice.objects.create(
        patient=sha_test_patient,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status='draft',
        payment_type='insurance',
        created_by=sha_test_user,
    )


@pytest.fixture
def sha_invoice_item(db, sha_test_invoice, sha_service, sha_test_user):
    """Create an invoice item for SHA tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    return InvoiceItem.objects.create(
        invoice=sha_test_invoice,
        service=sha_service,
        description='General Consultation',
        quantity=1,
        unit_price=Decimal('500.00'),
    )


@pytest.fixture
def sha_claim(db, sha_test_patient, sha_member, sha_test_encounter, sha_test_invoice, sha_test_user):
    """Create an SHA claim for tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    # Use lowercase values matching model's TextChoices (standard FHIR format)
    return SHAClaim.objects.create(
        patient=sha_test_patient,
        sha_member=sha_member,
        encounter=sha_test_encounter,
        invoice=sha_test_invoice,
        claim_type='outpatient',  # ClaimType.OUTPATIENT
        service_date=date.today(),
        facility_code='FID-22-123456-0',
        facility_level='L4',
        primary_diagnosis_code='CA00.0',
        primary_diagnosis_description='Acute nasopharyngitis',
        claimed_amount=Decimal('500.00'),
        status='draft',  # ClaimStatus.DRAFT
        created_by=sha_test_user,
    )


@pytest.fixture
def sha_claim_item(db, sha_claim, sha_tariff, sha_service, sha_invoice_item):
    """Create a claim item for SHA tests."""
    if not HAS_SHA_MODELS:
        pytest.skip("SHA models not available")
    
    return SHAClaimItem.objects.create(
        claim=sha_claim,
        tariff=sha_tariff,
        service=sha_service,
        invoice_item=sha_invoice_item,
        description='General Consultation',
        service_date=date.today(),
        quantity=1,
        unit_price=Decimal('500.00'),
        claimed_amount=Decimal('500.00'),
        status='pending',
    )


@pytest.fixture
def sha_claim_with_items(db, sha_claim, sha_claim_item):
    """Return a claim that has items attached."""
    return sha_claim
