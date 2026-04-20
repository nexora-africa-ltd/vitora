"""
Pytest fixtures for the Theatre module tests.
"""

from datetime import date, time, timedelta
from decimal import Decimal

import pytest  # type: ignore


@pytest.fixture
def grant_theatre_settings_permission(db, test_user):
    from django.contrib.auth.models import Permission

    permission = Permission.objects.get(
        content_type__app_label="theatre",
        codename="manage_theatre_settings",
    )
    test_user.user_permissions.add(permission)
    return permission


@pytest.fixture(autouse=True)
def grant_theatre_workflow_permissions(db, test_user):
    from django.contrib.auth.models import Permission

    permissions = Permission.objects.filter(
        content_type__app_label="theatre",
        codename__in=["manage_theatre", "document_surgery"],
    )
    test_user.user_permissions.add(*permissions)
    return permissions


@pytest.fixture
def theatre_permissionless_client(api_client, another_user, sample_organization, sample_facility):
    from tests.conftest import ensure_staff_profile

    ensure_staff_profile(another_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=another_user)
    return api_client


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


@pytest.fixture
def scheduled_staff_resource(
    db, test_user, test_staff_profile, sample_organization, sample_facility
):
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name=test_user.get_full_name() or test_user.username,
        resource_type="PERSON",
        code="STAFF-TEST-0001",
        is_active=True,
        staff_profile=test_staff_profile,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def theatre_shift(
    db,
    sample_surgery_case,
    sample_theatre,
    scheduled_staff_resource,
    sample_department,
    test_user,
    sample_organization,
    sample_facility,
):
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=scheduled_staff_resource,
        shift_date=sample_surgery_case.scheduled_date,
        start_time=time(8, 0),
        end_time=time(17, 0),
        shift_type="DAY",
        status="SCHEDULED",
        room=sample_theatre.scheduling_resource,
        department=sample_department,
        created_by=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def theatre_stock_drug(db):
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="THEATRE-DRUG-001",
        generic_name="Propofol",
        strength="200mg/20mL",
        form="INJECTION",
        category="CONTROLLED",
        schedule="POM",
        unit="vial",
        requires_prescription=True,
        reference_price=Decimal("1200.00"),
    )


@pytest.fixture
def theatre_stock_batch(
    db,
    theatre_stock_drug,
    test_user,
    sample_organization,
    sample_facility,
):
    from hmis.apps.pharmacy.models import StockBatch

    return StockBatch.objects.create(
        drug=theatre_stock_drug,
        batch_number="TH-BATCH-001",
        quantity_received=20,
        quantity_available=20,
        manufacture_date=date.today() - timedelta(days=60),
        expiry_date=date.today() + timedelta(days=365),
        received_date=date.today() - timedelta(days=10),
        cost_price=Decimal("950.00"),
        selling_price=Decimal("1200.00"),
        supplier="Theatre Supplier Ltd",
        received_by=test_user,
        status="AVAILABLE",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def theatre_billing_service_category(db):
    from hmis.apps.billing.models import ServiceCategory

    return ServiceCategory.objects.create(
        name="Procedures",
        code="PROC",
        description="Procedure and theatre billing",
        display_order=4,
    )


@pytest.fixture
def theatre_billing_service(db, theatre_billing_service_category, test_user):
    from hmis.apps.billing.models import Service

    return Service.objects.create(
        category=theatre_billing_service_category,
        code="GS-APP",
        name="Appendectomy Theatre Charge",
        unit_price=Decimal("25000.00"),
        created_by=test_user,
    )
