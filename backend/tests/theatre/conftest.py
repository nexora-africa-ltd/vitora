"""
Pytest fixtures for the Theatre module tests.
"""

from datetime import date, time

import pytest  # type: ignore


@pytest.fixture
def sample_procedure_catalog(db, sample_organization, sample_facility):
    """Create a SURGICAL ProcedureCatalog entry for theatre tests."""
    from hmis.apps.procedures.models import ProcedureCatalog

    return ProcedureCatalog.objects.create(
        code="GS-APP",
        name="Appendectomy",
        category="SURGICAL",
        body_system="DIGESTIVE",
        risk_level="MEDIUM",
        typical_duration_minutes=60,
        consent_required=True,
        requires_anesthesia=True,
        anesthesia_type="GENERAL",
        base_fee=25000,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_theatre(db, sample_organization, sample_facility):
    """Create an OperatingTheatre for testing."""
    from hmis.apps.theatre.models import OperatingTheatre

    return OperatingTheatre.objects.create(
        code="OT-01",
        name="Operating Theatre 1",
        theatre_type="GENERAL",
        location="Block A, 2nd Floor",
        operating_hours_start=time(8, 0),
        operating_hours_end=time(18, 0),
        slot_duration_minutes=30,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_theatre_2(db, sample_organization, sample_facility):
    """Create a second OperatingTheatre for conflict testing."""
    from hmis.apps.theatre.models import OperatingTheatre

    return OperatingTheatre.objects.create(
        code="OT-02",
        name="Operating Theatre 2",
        theatre_type="ORTHO",
        operating_hours_start=time(8, 0),
        operating_hours_end=time(18, 0),
        slot_duration_minutes=30,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def surgery_case_data(sample_patient, sample_procedure_catalog, sample_theatre):
    """Valid payload for creating a SurgeryCase via API."""
    return {
        "patient": sample_patient.id,
        "primary_procedure": sample_procedure_catalog.id,
        "theatre": sample_theatre.id,
        "scheduled_date": str(date.today()),
        "scheduled_start_time": "09:00",
        "estimated_duration_minutes": 60,
        "priority": "ELECTIVE",
        "diagnosis": "Acute appendicitis",
    }


@pytest.fixture
def sample_surgery_case(
    db,
    sample_patient,
    sample_encounter,
    sample_procedure_catalog,
    sample_theatre,
    test_user,
    sample_organization,
    sample_facility,
):
    """Create a SurgeryCase in REQUESTED status."""
    from hmis.apps.theatre.models import SurgeryCase

    return SurgeryCase.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        primary_procedure=sample_procedure_catalog,
        theatre=sample_theatre,
        scheduled_date=date.today(),
        scheduled_start_time=time(9, 0),
        estimated_duration_minutes=60,
        priority="ELECTIVE",
        diagnosis="Acute appendicitis",
        requesting_doctor=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def scheduled_surgery_case(sample_surgery_case, test_user):
    """A SurgeryCase in SCHEDULED status."""
    sample_surgery_case.schedule(user=test_user)
    return sample_surgery_case


@pytest.fixture
def pre_op_surgery_case(scheduled_surgery_case, test_user):
    """A SurgeryCase in PRE_OP status."""
    scheduled_surgery_case.start_pre_op(user=test_user)
    return scheduled_surgery_case


@pytest.fixture
def in_theatre_surgery_case(pre_op_surgery_case, test_user):
    """A SurgeryCase in IN_THEATRE status."""
    pre_op_surgery_case.enter_theatre(user=test_user)
    return pre_op_surgery_case


@pytest.fixture
def in_surgery_case(in_theatre_surgery_case, test_user):
    """A SurgeryCase in IN_SURGERY status."""
    in_theatre_surgery_case.start_surgery(user=test_user)
    return in_theatre_surgery_case


@pytest.fixture
def in_pacu_surgery_case(in_surgery_case, test_user):
    """A SurgeryCase in IN_PACU status."""
    in_surgery_case.end_surgery(user=test_user)
    return in_surgery_case
