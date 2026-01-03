"""
Pytest configuration and fixtures for Vitora HMIS tests.

This file contains shared fixtures and configuration for all tests.
"""

import os
from collections.abc import Generator

import django
import pytest
from django.core.management import call_command

# Set Django settings module for tests
os.environ.setdefault("DJANGO_ENV", "test")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings")

# Setup Django
django.setup()


# ============================================================================
# Pytest Configuration
# ============================================================================


def pytest_configure(config):
    """Configure pytest with custom settings."""
    config.addinivalue_line("markers", "unit: Mark test as a unit test")
    config.addinivalue_line("markers", "integration: Mark test as an integration test")
    config.addinivalue_line("markers", "e2e: Mark test as an end-to-end test")
    config.addinivalue_line("markers", "slow: Mark test as slow running")


# ============================================================================
# Django Database Fixtures
# ============================================================================


@pytest.fixture(scope="session")
def django_db_setup(django_db_blocker):
    """Set up test database with migrations."""
    with django_db_blocker.unblock():
        call_command("migrate", "--run-syncdb", verbosity=0)


@pytest.fixture(autouse=True)
def enable_db_access_for_all_tests(db):
    """Enable database access for all tests."""
    pass


# ============================================================================
# Common Fixtures
# ============================================================================


@pytest.fixture
def sample_data() -> dict:
    """
    Provide sample data for tests.

    Returns:
        dict: Sample data dictionary
    """
    return {"name": "Test User", "email": "test@example.com", "age": 30}


@pytest.fixture
def mock_settings(monkeypatch) -> Generator[None, None, None]:
    """
    Mock Django settings for testing.

    Args:
        monkeypatch: Pytest monkeypatch fixture

    Yields:
        None
    """
    # This will be used once Django is set up
    # monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "hmis.settings.test")
    yield


# ============================================================================
# API Client Fixtures
# ============================================================================


@pytest.fixture
def api_client():
    """Provide Django REST framework API client."""
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def test_user(db):
    """Create and return a test user."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(
        username="testuser",
        email="test@example.com",
        password="testpassword123",
    )
    return user


@pytest.fixture
def another_user(db):
    """Create and return another test user."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(
        username="anotheruser",
        email="another@example.com",
        password="testpassword123",
    )
    return user


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Provide authenticated API client."""
    api_client.force_authenticate(user=test_user)
    return api_client


# ============================================================================
# Patient Test Fixtures
# ============================================================================


@pytest.fixture
def sample_county(db):
    """Create a sample county for testing."""
    from hmis.apps.core.models import County

    return County.objects.create(code=1, name="Mombasa")


@pytest.fixture
def sample_sub_county(db, sample_county):
    """Create a sample sub-county for testing."""
    from hmis.apps.core.models import SubCounty

    return SubCounty.objects.create(county=sample_county, name="Changamwe")


@pytest.fixture
def sample_ward(db, sample_sub_county):
    """Create a sample ward for testing."""
    from hmis.apps.core.models import Ward

    return Ward.objects.create(sub_county=sample_sub_county, name="Port Reitz")


@pytest.fixture
def patient_data(sample_county, sample_sub_county):
    """Sample patient data for tests."""
    return {
        "first_name": "John",
        "last_name": "Doe",
        "date_of_birth": "1990-01-15",
        "gender": "M",
        "county": sample_county.id,
        "sub_county": sample_sub_county.id,
    }


@pytest.fixture
def sample_patient(db, test_user, sample_county, sample_sub_county):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Jane",
        last_name="Smith",
        date_of_birth="1985-05-20",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )


# ============================================================================
# Encounter Test Fixtures
# ============================================================================


@pytest.fixture
def encounter_data(sample_patient):
    """Sample encounter data for tests."""
    return {
        "patient": sample_patient.id,
        "encounter_type": "OPD",
        "chief_complaint": "Test complaint",
    }


@pytest.fixture
def sample_encounter(db, sample_patient):
    """Create a sample encounter for testing."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Headache for 2 days",
    )


# =========================================================================
# Inpatient (IPD) Test Fixtures
# =========================================================================


@pytest.fixture
def sample_inpatient_ward(db):
    """Create a sample inpatient ward for testing."""
    from decimal import Decimal
    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Medical Ward 1",
        code="MED-01",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
        is_active=True,
    )


@pytest.fixture
def sample_bed(db, sample_inpatient_ward):
    """Create a sample bed in the inpatient ward for testing."""
    from hmis.apps.inpatient.models import Bed

    return Bed.objects.create(
        ward=sample_inpatient_ward,
        bed_number="B-101",
        bed_type="STANDARD",
        status="AVAILABLE",
    )


# ============================================================================
# Database Fixtures (will be activated when Django is set up)
# ============================================================================

# @pytest.fixture
# def db_patient(db):
#     """Create a test patient in the database."""
#     from hmis.apps.patients.models import Patient
#     return Patient.objects.create(
#         first_name="John",
#         last_name="Doe",
#         date_of_birth="1990-01-01",
#         gender="M"
#     )


# @pytest.fixture
# def db_encounter(db, db_patient):
#     """Create a test encounter in the database."""
#     from hmis.apps.encounters.models import Encounter
#     return Encounter.objects.create(
#         patient=db_patient,
#         encounter_type="OPD",
#         chief_complaint="Headache"
#     )


# ============================================================================
# Factory Fixtures (will be activated when models are created)
# ============================================================================

# @pytest.fixture
# def patient_factory():
#     """Provide patient factory for creating test patients."""
#     from tests.factories import PatientFactory
#     return PatientFactory


# @pytest.fixture
# def encounter_factory():
#     """Provide encounter factory for creating test encounters."""
#     from tests.factories import EncounterFactory
#     return EncounterFactory


# ============================================================================
# Pharmacy Fixtures - Import from conftest_pharmacy
# ============================================================================

# Import pharmacy fixtures
pytest_plugins = ["tests.conftest_pharmacy"]


# ============================================================================
# Laboratory Test Fixtures
# ============================================================================


@pytest.fixture
def sample_test_catalog(db):
    """Create a sample test catalog entry."""
    from hmis.apps.laboratory.models import TestCatalog
    
    return TestCatalog.objects.create(
        code='CBC',
        name='Complete Blood Count',
        short_name='CBC',
        category='HEMATOLOGY',
        specimen_type='BLOOD',
        result_type='PANEL',
        cost=500.00,
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def sample_lab_order(db, sample_patient, sample_encounter, test_user, sample_test_catalog):
    """Create a sample lab order for testing."""
    from hmis.apps.laboratory.models import LabOrder, LabOrderItem
    
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        order_type='IN_HOUSE',
        status='ORDERED',
        priority='ROUTINE',
    )
    
    # Create order item
    LabOrderItem.objects.create(
        lab_order=order,
        test=sample_test_catalog,
        unit_cost=sample_test_catalog.cost,
    )
    
    # Create associated queue entry
    from hmis.apps.laboratory.models import LabQueue
    LabQueue.objects.create(
        lab_order=order,
        sample_type='blood',
        priority='ROUTINE',
    )
    
    return order


@pytest.fixture
def sample_lab_result(db, sample_lab_order, test_user):
    """Create a sample lab result for testing."""
    from hmis.apps.laboratory.models import LabResult
    
    # Get the first order item from the lab order
    order_item = sample_lab_order.items.first()
    
    return LabResult.objects.create(
        order_item=order_item,
        numeric_value=7.5,
        text_value='7.5',
        reference_range_text='4.0-11.0',
        reference_low=4.0,
        reference_high=11.0,
        result_flag='NORMAL',
        entered_by=test_user,
    )


@pytest.fixture
def sample_admission(db, sample_patient, sample_encounter, test_user, sample_inpatient_ward, sample_bed):
    """Create a sample admission for testing."""
    from hmis.apps.inpatient.models import Admission
    from django.utils import timezone
    
    ward = sample_inpatient_ward
    bed = sample_bed
    
    # Create IPD encounter
    ipd_encounter = sample_patient.encounters.create(
        encounter_type="IPD",
        chief_complaint="Admitted for further management",
    )
    
    # Create admission
    admission = Admission.objects.create(
        patient=sample_patient,
        opd_encounter=sample_encounter,
        ipd_encounter=ipd_encounter,
        admission_date=timezone.now(),
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia, unspecified",
        admitting_officer=test_user,
        attending_doctor=test_user,
        ward=ward,
        bed=bed,
        payer_type="CASH",
    )
    
    return admission


@pytest.fixture
def sample_admission_recommendation(db, sample_encounter, test_user):
    """Create a sample admission recommendation for testing."""
    from hmis.apps.inpatient.models import AdmissionRecommendation
    from django.utils import timezone
    from datetime import timedelta
    
    recommendation = AdmissionRecommendation.objects.create(
        encounter=sample_encounter,
        recommended_by=test_user,
        reason="Suspected pneumonia requiring hospitalization",
        provisional_diagnosis="J18.9",
        provisional_diagnosis_text="Pneumonia, unspecified",
        urgency="URGENT",
        preferred_ward_type="MEDICAL",
        expires_at=timezone.now() + timedelta(hours=24),
    )
    
    return recommendation
