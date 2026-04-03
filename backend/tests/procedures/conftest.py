import pytest  # type: ignore

from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder


@pytest.fixture
def procedure_catalog_entry(db, sample_facility, sample_organization):
    """Create a sample procedure catalog entry."""
    return ProcedureCatalog.objects.create(
        code="PROC-WC-001",
        name="Wound Dressing (Simple)",
        category=ProcedureCatalog.Category.WOUND_CARE,
        body_system=ProcedureCatalog.BodySystem.INTEGUMENTARY,
        risk_level=ProcedureCatalog.RiskLevel.LOW,
        typical_duration_minutes=15,
        consent_required=True,
        base_fee=500,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def no_consent_procedure(db, sample_facility, sample_organization):
    """Create a procedure that does not require consent."""
    return ProcedureCatalog.objects.create(
        code="PROC-INJ-001",
        name="IM Injection",
        category=ProcedureCatalog.Category.INJECTION,
        body_system=ProcedureCatalog.BodySystem.GENERAL,
        risk_level=ProcedureCatalog.RiskLevel.LOW,
        typical_duration_minutes=5,
        consent_required=False,
        base_fee=200,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def procedure_order(db, procedure_catalog_entry, sample_patient, sample_encounter, test_user, sample_facility, sample_organization):
    """Create a sample procedure order."""
    return ProcedureOrder.objects.create(
        procedure=procedure_catalog_entry,
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        indication="Wound on right forearm",
        priority=ProcedureOrder.Priority.ROUTINE,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def procedure_order_data(procedure_catalog_entry, sample_patient):
    """Valid data dict for creating a procedure order via API."""
    return {
        "procedure": procedure_catalog_entry.id,
        "patient": sample_patient.id,
        "indication": "Wound on right forearm needs dressing",
        "priority": "ROUTINE",
    }
