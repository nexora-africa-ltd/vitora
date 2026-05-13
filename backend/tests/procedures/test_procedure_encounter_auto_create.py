"""
Tests for ProcedureOrder encounter auto-creation.

Covers:
1. Creating a procedure order without encounter → auto-creates PROCEDURE encounter
2. Creating a procedure order with explicit encounter → uses provided encounter
3. Auto-created encounter has correct fields (type, chief_complaint, visit_reason, tenant)
4. Encounter is required at model level (DB integrity)
"""

from datetime import date

import pytest  # type: ignore
from django.db import IntegrityError
from rest_framework import status

from hmis.apps.encounters.models import Encounter
from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def procedure_catalog(db, sample_facility, sample_organization):
    """Create a procedure catalog entry for testing."""
    return ProcedureCatalog.objects.create(
        code="PROC-ENC-001",
        name="Wound Suturing",
        category="WOUND_CARE",
        typical_duration_minutes=30,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def order_data(procedure_catalog, sample_patient):
    """Minimal valid data for creating a procedure order via API."""
    return {
        "procedure": procedure_catalog.id,
        "patient": sample_patient.id,
        "indication": "3cm laceration on left forearm requiring closure",
        "priority": "ROUTINE",
    }


# =============================================================================
# API Tests – Auto-Create Encounter
# =============================================================================


@pytest.mark.django_db
class TestProcedureOrderAutoCreatesEncounter:
    """Creating a procedure order without an encounter should auto-create one."""

    def test_order_without_encounter_creates_procedure_encounter(
        self, authenticated_client, order_data
    ):
        """POST without encounter should auto-create a PROCEDURE encounter."""
        encounters_before = Encounter.objects.count()

        response = authenticated_client.post("/api/procedures/orders/", order_data)

        assert response.status_code == status.HTTP_201_CREATED
        assert Encounter.objects.count() == encounters_before + 1

        order = ProcedureOrder.objects.get(id=response.data["id"])
        assert order.encounter is not None
        assert order.encounter.encounter_type == "PROCEDURE"

    def test_auto_created_encounter_has_correct_fields(
        self, authenticated_client, order_data, sample_patient, procedure_catalog
    ):
        """Auto-created encounter should have correct chief_complaint, visit_reason, patient."""
        response = authenticated_client.post("/api/procedures/orders/", order_data)

        order = ProcedureOrder.objects.get(id=response.data["id"])
        encounter = order.encounter

        assert encounter.patient == sample_patient
        assert encounter.encounter_type == "PROCEDURE"
        assert encounter.visit_reason == "SCHEDULED_PROCEDURE"
        assert procedure_catalog.name in encounter.chief_complaint

    def test_auto_created_encounter_inherits_tenant(
        self,
        authenticated_client,
        order_data,
        sample_organization,
        sample_facility,
    ):
        """Auto-created encounter should inherit organization and facility from request."""
        response = authenticated_client.post("/api/procedures/orders/", order_data)

        order = ProcedureOrder.objects.get(id=response.data["id"])
        encounter = order.encounter

        assert encounter.organization == sample_organization
        assert encounter.facility == sample_facility

    def test_response_includes_encounter_id(self, authenticated_client, order_data):
        """Response should include the encounter ID (auto-created or provided)."""
        response = authenticated_client.post("/api/procedures/orders/", order_data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["encounter"] is not None

    def test_auto_created_encounter_sets_created_by(
        self, authenticated_client, order_data, test_user
    ):
        """Auto-created encounter should set created_by to the requesting user."""
        response = authenticated_client.post("/api/procedures/orders/", order_data)

        order = ProcedureOrder.objects.get(id=response.data["id"])
        assert order.encounter.created_by == test_user


# =============================================================================
# API Tests – Explicit Encounter
# =============================================================================


@pytest.mark.django_db
class TestProcedureOrderWithExplicitEncounter:
    """Creating a procedure order with an explicit encounter should use it."""

    def test_order_with_encounter_uses_provided(
        self, authenticated_client, order_data, sample_encounter
    ):
        """POST with encounter should use the provided encounter, not create a new one."""
        encounters_before = Encounter.objects.count()
        order_data["encounter"] = sample_encounter.id

        response = authenticated_client.post("/api/procedures/orders/", order_data)

        assert response.status_code == status.HTTP_201_CREATED
        # No new encounter created
        assert Encounter.objects.count() == encounters_before

        order = ProcedureOrder.objects.get(id=response.data["id"])
        assert order.encounter == sample_encounter

    def test_order_with_encounter_preserves_encounter_type(
        self, authenticated_client, order_data, sample_encounter
    ):
        """Provided encounter should keep its original type (e.g., OPD)."""
        order_data["encounter"] = sample_encounter.id

        response = authenticated_client.post("/api/procedures/orders/", order_data)

        order = ProcedureOrder.objects.get(id=response.data["id"])
        assert order.encounter.encounter_type == "OPD"  # sample_encounter is OPD


# =============================================================================
# Model-Level Integrity Tests
# =============================================================================


@pytest.mark.django_db
class TestProcedureOrderEncounterRequired:
    """Encounter FK is non-nullable at the database level."""

    def test_model_requires_encounter(
        self, procedure_catalog, sample_patient, test_user, sample_facility, sample_organization
    ):
        """Creating a ProcedureOrder without encounter at model level should fail."""
        with pytest.raises(IntegrityError):
            ProcedureOrder.objects.create(
                procedure=procedure_catalog,
                patient=sample_patient,
                indication="Test indication",
                ordered_by=test_user,
                facility=sample_facility,
                organization=sample_organization,
            )

    def test_model_with_encounter_succeeds(
        self,
        procedure_catalog,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Creating a ProcedureOrder with encounter at model level should succeed."""
        order = ProcedureOrder.objects.create(
            procedure=procedure_catalog,
            patient=sample_patient,
            encounter=sample_encounter,
            indication="Test indication",
            ordered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert order.encounter == sample_encounter
        assert order.order_number.startswith("PROC-")


# =============================================================================
# Cascade Delete Tests
# =============================================================================


@pytest.mark.django_db
class TestEncounterCascadeDelete:
    """Deleting an encounter should cascade-delete its procedure orders."""

    def test_deleting_encounter_deletes_procedure_orders(
        self,
        procedure_catalog,
        sample_patient,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Procedure orders should be deleted when their encounter is deleted."""
        # Create a fresh encounter with no other references (e.g., invoices)
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Procedure: test",
            organization=sample_organization,
            facility=sample_facility,
        )
        order = ProcedureOrder.objects.create(
            procedure=procedure_catalog,
            patient=sample_patient,
            encounter=encounter,
            indication="Test indication",
            ordered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        order_id = order.id

        # Remove auto-created invoice (billing signal creates one with PROTECT FK)
        encounter.invoices.all().delete()

        encounter.delete()

        assert not ProcedureOrder.objects.filter(id=order_id).exists()
