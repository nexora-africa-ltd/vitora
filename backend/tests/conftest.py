"""
Pytest configuration and fixtures for Vitora HMIS tests.

This file contains shared fixtures and configuration for all tests.
"""

import os
import tempfile
from collections.abc import Generator
from datetime import date

import django
import pytest  # type: ignore
from django.core.management import call_command

# Set Django settings module for tests
os.environ.setdefault("DJANGO_ENV", "test")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings")

# Setup Django
django.setup()


# ============================================================================
# Pytest Configuration
# ============================================================================


@pytest.fixture(autouse=True)
def system_user(db):
    """Ensure system user exists for billing signals."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user, _ = User.objects.get_or_create(
        username="system", defaults={"email": "system@vitora.local", "is_active": True}
    )
    return user


def pytest_configure(config):
    """Configure pytest with custom settings."""
    config.addinivalue_line("markers", "unit: Mark test as a unit test")
    config.addinivalue_line("markers", "integration: Mark test as an integration test")
    config.addinivalue_line("markers", "e2e: Mark test as an end-to-end test")
    config.addinivalue_line("markers", "slow: Mark test as slow running")


def pytest_pycollect_makeitem(collector, name, obj):
    """
    Filter out classes that should not be collected as tests.

    The laboratory.models.TestCatalog is a Django model, not a test class,
    but pytest tries to collect it because the name starts with 'Test'.
    This hook returns None to skip such classes.
    """
    # Skip TestCatalog model class (it's a Django model, not a test)
    if name == "TestCatalog" and hasattr(obj, "_meta"):
        return None
    # Return None to let pytest handle normally
    return None


# ============================================================================
# Django Database Fixtures
# ============================================================================


@pytest.fixture(scope="session")
def django_db_setup(django_db_blocker):
    """Set up test database with migrations."""
    with django_db_blocker.unblock():
        # The test settings use a file-backed SQLite DB at a stable path (for Channels tests).
        # If the file persists across runs, migrations are not re-executed, and data migrations
        # (like default clinic seeding) can silently be skipped, causing flaky/incorrect state.
        test_db_path = os.path.join(tempfile.gettempdir(), "vitora_test.db")
        for path in (test_db_path, f"{test_db_path}-wal", f"{test_db_path}-shm"):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                # Best-effort cleanup; migrate will surface real DB issues.
                pass
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
        code="CBC",
        name="Complete Blood Count",
        short_name="CBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
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
        order_type="IN_HOUSE",
        status="ORDERED",
        priority="ROUTINE",
    )

    # Create order item (this will trigger signal to auto-create LabQueue entry)
    LabOrderItem.objects.create(
        lab_order=order,
        test=sample_test_catalog,
        unit_cost=sample_test_catalog.cost,
    )

    # Note: LabQueue entry is auto-created by signal in hmis.apps.laboratory.signals
    # when the LabOrder is created with status='ORDERED' and order_type='IN_HOUSE'

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
        text_value="7.5",
        reference_range_text="4.0-11.0",
        reference_low=4.0,
        reference_high=11.0,
        result_flag="NORMAL",
        entered_by=test_user,
    )


@pytest.fixture
def sample_admission(
    db, sample_patient, sample_encounter, test_user, sample_inpatient_ward, sample_bed
):
    """Create a sample admission for testing."""
    from django.utils import timezone

    from hmis.apps.inpatient.models import Admission

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
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.inpatient.models import AdmissionRecommendation

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


# ============================================================================
# Clinical Template Sync Test Fixtures
# ============================================================================


@pytest.fixture
def sample_encounter_with_vitals(db, sample_patient):
    """Create an encounter with vitals populated for testing."""
    from decimal import Decimal

    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Fever and cough for 3 days",
        temperature=Decimal("37.8"),
        pulse=82,
        blood_pressure="120/80",
        respiratory_rate=18,
        spo2=Decimal("98.0"),
        weight=Decimal("70.5"),
        height=Decimal("175.0"),
    )


@pytest.fixture
def sample_template_with_vitals(db):
    """Create a clinical template with vitals fields."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Test Vitals Template",
        template_type="assessment",
        specialty="General",
        description="Template for testing vitals sync",
        content={
            "title": "Vitals Assessment",
            "version": "1.0",
            "sections": [
                {
                    "name": "Vital Signs",
                    "order": 1,
                    "fields": [
                        {
                            "name": "temperature",
                            "type": "number",
                            "label": "Temperature (°C)",
                            "required": True,
                            "syncable": True,
                        },
                        {
                            "name": "pulse",
                            "type": "number",
                            "label": "Pulse (bpm)",
                            "required": True,
                            "syncable": True,
                        },
                        {
                            "name": "blood_pressure",
                            "type": "text",
                            "label": "Blood Pressure",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "respiratory_rate",
                            "type": "number",
                            "label": "Respiratory Rate",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "spo2",
                            "type": "number",
                            "label": "SpO2 (%)",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "weight",
                            "type": "number",
                            "label": "Weight (kg)",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "height",
                            "type": "number",
                            "label": "Height (cm)",
                            "required": False,
                            "syncable": True,
                        },
                    ],
                },
                {
                    "name": "Notes",
                    "order": 2,
                    "fields": [
                        {
                            "name": "notes",
                            "type": "textarea",
                            "label": "Clinical Notes",
                            "required": False,
                        },
                    ],
                },
            ],
        },
        is_active=True,
        is_system=True,
    )


@pytest.fixture
def sample_template_with_history(db):
    """Create a clinical template with medical history fields."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Test History Template",
        template_type="assessment",
        specialty="General",
        description="Template for testing history sync",
        content={
            "title": "Medical History",
            "version": "1.0",
            "sections": [
                {
                    "name": "Medical History",
                    "order": 1,
                    "fields": [
                        {
                            "name": "allergies",
                            "type": "textarea",
                            "label": "Known Allergies",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "chronic_conditions",
                            "type": "textarea",
                            "label": "Chronic Conditions",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "current_medications",
                            "type": "textarea",
                            "label": "Current Medications",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "past_surgeries",
                            "type": "textarea",
                            "label": "Past Surgeries",
                            "required": False,
                            "syncable": True,
                        },
                        {
                            "name": "family_history",
                            "type": "textarea",
                            "label": "Family History",
                            "required": False,
                            "syncable": True,
                        },
                    ],
                },
            ],
        },
        is_active=True,
        is_system=True,
    )


@pytest.fixture
def sample_template_with_sections(db):
    """Create a clinical template with multiple sections for testing structure."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Test Multi-Section Template",
        template_type="assessment",
        specialty="General",
        description="Template with multiple sections",
        content={
            "title": "Comprehensive Assessment",
            "version": "1.0",
            "sections": [
                {
                    "name": "Vital Signs",
                    "order": 1,
                    "fields": [
                        {
                            "name": "temperature",
                            "type": "number",
                            "label": "Temperature",
                            "required": True,
                            "syncable": True,
                        },
                        {
                            "name": "pulse",
                            "type": "number",
                            "label": "Pulse",
                            "required": True,
                            "syncable": True,
                        },
                    ],
                },
                {
                    "name": "Assessment",
                    "order": 2,
                    "fields": [
                        {
                            "name": "notes",
                            "type": "textarea",
                            "label": "Assessment Notes",
                            "required": False,
                        },
                        {
                            "name": "diagnosis",
                            "type": "text",
                            "label": "Working Diagnosis",
                            "required": False,
                        },
                    ],
                },
                {
                    "name": "Plan",
                    "order": 3,
                    "fields": [
                        {
                            "name": "treatment_plan",
                            "type": "textarea",
                            "label": "Treatment Plan",
                            "required": False,
                        },
                        {
                            "name": "follow_up",
                            "type": "date",
                            "label": "Follow-up Date",
                            "required": False,
                        },
                    ],
                },
            ],
        },
        is_active=True,
        is_system=True,
    )


# ============================================================================
# Check-in Module Test Fixtures
# ============================================================================


@pytest.fixture
def sample_patient_with_phone(db, test_user, sample_county, sample_sub_county):
    """Create a sample patient with phone number for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth="1980-03-15",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        phone_number="0712345678",
    )


@pytest.fixture
def sample_patient_with_national_id(db, test_user, sample_county, sample_sub_county):
    """Create a sample patient with national ID for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Mary",
        last_name="Wanjiku",
        date_of_birth="1975-07-22",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        identification_type="national_id",
        identification_number="12345678",
    )


@pytest.fixture
def sample_patient_no_history(db, sample_county, sample_sub_county):
    """Create a sample patient with no encounter history."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="New",
        last_name="Patient",
        date_of_birth="2000-01-01",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def sample_patient_with_encounters(db, sample_county, sample_sub_county):
    """Create a sample patient with multiple encounters."""
    from datetime import timedelta

    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Alice",
        last_name="Kamau",
        date_of_birth="1990-06-15",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    # Create multiple encounters
    for i in range(3):
        Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint=f"Visit {i + 1}",
            encounter_date=date.today() - timedelta(days=(30 * (i + 1))),
        )

    return patient


@pytest.fixture
def sample_patient_with_recent_visit(db, sample_county, sample_sub_county):
    """Create a sample patient with a recent encounter."""
    from datetime import timedelta

    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Recent",
        last_name="Visitor",
        date_of_birth="1985-11-20",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Previous visit complaint",
        encounter_date=date.today() - timedelta(days=7),
    )

    return patient, encounter


@pytest.fixture
def sample_patient_with_allergies(db, sample_county, sample_sub_county):
    """Create a sample patient with known allergies."""
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Allergy",
        last_name="Patient",
        date_of_birth="1992-04-10",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    # Create encounter with allergy information
    Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Routine checkup",
        allergies="Penicillin (severe - anaphylaxis), Sulfa drugs (moderate - rash)",
    )

    return patient


@pytest.fixture
def sample_patient_with_chronic_conditions(db, sample_county, sample_sub_county):
    """Create a sample patient with chronic conditions."""
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Chronic",
        last_name="Care",
        date_of_birth="1965-02-28",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    # Create encounter with chronic conditions
    Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Routine follow-up",
        chronic_conditions="Type 2 Diabetes Mellitus, Hypertension",
        current_medications="Metformin 500mg BD, Lisinopril 10mg OD",
    )

    return patient


@pytest.fixture
def sample_patient_with_pending_labs(
    db, sample_county, sample_sub_county, test_user, sample_test_catalog
):
    """Create a sample patient with pending lab results."""
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.laboratory.models import LabOrder, LabOrderItem
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Pending",
        last_name="Labs",
        date_of_birth="1978-09-05",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Lab review",
    )

    # Create pending lab order
    lab_order = LabOrder.objects.create(
        patient=patient,
        encounter=encounter,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="COLLECTED",  # Collected but no results yet
        priority="ROUTINE",
    )

    LabOrderItem.objects.create(
        lab_order=lab_order,
        test=sample_test_catalog,
        unit_cost=sample_test_catalog.cost,
    )

    return patient


@pytest.fixture
def sample_clinic(db):
    """Create a sample clinic for testing."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="General OPD",
        clinic_type="GENERAL_OPD",
        code="GOPD-001",
        status="ACTIVE",
        accepts_walk_ins=True,
        triage_required=True,
    )


@pytest.fixture
def sample_pharmacy_clinic(db):
    """Create a pharmacy clinic for refill testing."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Pharmacy Refill",
        clinic_type="OTHER",
        code="PHARM-001",
        status="ACTIVE",
        accepts_walk_ins=True,
        triage_required=False,
    )


@pytest.fixture
def sample_lab_clinic(db):
    """Create a lab clinic for lab review testing."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Lab Review Clinic",
        clinic_type="OTHER",
        code="LAB-001",
        status="ACTIVE",
        accepts_walk_ins=True,
        triage_required=False,
    )


@pytest.fixture
def sample_patient_checked_in_today(db, sample_county, sample_sub_county, test_user):
    """Create a patient that's already checked in today."""
    from django.utils import timezone

    from hmis.apps.checkin.models import CheckIn
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Already",
        last_name="CheckedIn",
        date_of_birth="1988-12-01",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Earlier visit today",
    )

    CheckIn.objects.create(
        patient=patient,
        encounter=encounter,
        destination_type="TRIAGE",
        checked_in_by=test_user,
        checked_in_at=timezone.now(),
    )

    return patient


@pytest.fixture
def sample_checkins_today(db, sample_county, sample_sub_county, test_user, sample_clinic):
    """Create multiple check-ins for today."""
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.checkin.models import CheckIn
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    checkins = []
    now = timezone.now()

    for i in range(5):
        patient = Patient.objects.create(
            first_name=f"Patient{i}",
            last_name=f"Today{i}",
            date_of_birth=f"199{i}-01-01",
            gender="M" if i % 2 == 0 else "F",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint=f"Complaint {i}",
        )

        checkin = CheckIn.objects.create(
            patient=patient,
            encounter=encounter,
            destination_type="TRIAGE" if i % 2 == 0 else "CLINIC",
            destination_clinic=sample_clinic if i % 2 != 0 else None,
            checked_in_by=test_user,
            checked_in_at=now - timedelta(minutes=i * 15),
            visit_type="NEW" if i == 0 else "RETURN",
        )

        checkins.append(checkin)

    return checkins


@pytest.fixture
def sample_checkin_yesterday(db, sample_county, sample_sub_county, test_user):
    """Create a check-in from yesterday."""
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.checkin.models import CheckIn
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    patient = Patient.objects.create(
        first_name="Yesterday",
        last_name="Patient",
        date_of_birth="1970-05-15",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Yesterday's complaint",
        encounter_date=date.today() - timedelta(days=1),
    )

    checkin = CheckIn.objects.create(
        patient=patient,
        encounter=encounter,
        destination_type="TRIAGE",
        checked_in_by=test_user,
        checked_in_at=timezone.now() - timedelta(days=1),
    )

    return checkin


# ============================================================================
# Encounter Disposition Test Fixtures
# ============================================================================


@pytest.fixture
def sample_diagnosis(db, sample_encounter):
    """Create a sample diagnosis for testing."""
    from hmis.apps.encounters.models import Diagnosis

    return Diagnosis.objects.create(
        encounter=sample_encounter,
        diagnosis_type="PRIMARY",
        free_text_diagnosis="Acute upper respiratory infection",
        notes="Common cold symptoms",
        is_confirmed=True,
    )


@pytest.fixture
def sample_treatment_plan(db, sample_encounter):
    """Create a sample treatment plan for testing."""
    from hmis.apps.encounters.models import TreatmentPlan

    return TreatmentPlan.objects.create(
        encounter=sample_encounter,
        clinical_notes="Rest at home, drink plenty of fluids",
        follow_up_instructions="Return if symptoms worsen",
        status="ACTIVE",
    )


@pytest.fixture
def sample_prescription(db, sample_patient, sample_encounter, test_user):
    """Create a sample prescription for testing."""
    from datetime import timedelta

    from hmis.apps.pharmacy.models import Prescription

    return Prescription.objects.create(
        encounter=sample_encounter,
        patient=sample_patient,
        prescribed_by=test_user,
        valid_until=date.today() + timedelta(days=30),
        status="PENDING",
        clinical_notes="For URTI treatment",
    )
