"""
Tests for admission orders endpoints.

Sprint 1.7: Medical Orders Feature
Tests the /api/inpatient/admissions/{id}/orders/ endpoints.
"""

import pytest
from rest_framework import status

from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure
from hmis.apps.inpatient.models import Admission
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog
from hmis.apps.pharmacy.models import Prescription, PrescriptionItem

# Note: sample_admission fixture is already defined in conftest.py


@pytest.fixture
def sample_lab_test(db):
    """Create a sample lab test catalog entry."""
    return TestCatalog.objects.create(
        code="CBC-001",
        name="Complete Blood Count",
        short_name="CBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
        cost=500.00,
    )


@pytest.fixture
def sample_imaging_procedure(db):
    """Create a sample imaging procedure."""
    from decimal import Decimal

    return ImagingProcedure.objects.create(
        code="XR-CHEST-001",
        name="Chest X-Ray",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
    )


@pytest.fixture
def admission_lab_order(db, sample_admission, sample_lab_test, test_user):
    """Create a lab order linked to an admission."""
    order = LabOrder.objects.create(
        patient=sample_admission.patient,
        encounter=sample_admission.ipd_encounter,
        admission=sample_admission,
        ordered_by=test_user,
        priority="ROUTINE",
        clinical_notes="Test lab order for admission",
    )
    LabOrderItem.objects.create(
        lab_order=order,
        test=sample_lab_test,
        unit_cost=sample_lab_test.cost,
    )
    return order


@pytest.fixture
def admission_imaging_order(db, sample_admission, sample_imaging_procedure, test_user):
    """Create an imaging order linked to an admission."""
    order = ImagingOrder.objects.create(
        patient=sample_admission.patient,
        encounter=sample_admission.ipd_encounter,
        admission=sample_admission,
        ordered_by=test_user,
        priority="ROUTINE",
        clinical_indication="Test imaging order for admission",
    )
    ImagingOrderItem.objects.create(
        order=order,
        procedure=sample_imaging_procedure,
        unit_cost=sample_imaging_procedure.cost,  # Should be Decimal from the fixture
    )
    order.calculate_total_cost()
    return order


@pytest.fixture
def admission_prescription(db, sample_admission, sample_drug, test_user):
    """Create a prescription linked to an admission."""
    from datetime import date, timedelta

    prescription = Prescription.objects.create(
        patient=sample_admission.patient,
        encounter=sample_admission.ipd_encounter,
        admission=sample_admission,
        prescribed_by=test_user,
        valid_until=date.today() + timedelta(days=30),
    )
    PrescriptionItem.objects.create(
        prescription=prescription,
        drug=sample_drug,
        quantity=10,
        dosage="1 tablet twice daily",
        frequency="BID",
        duration="5 days",
        route="PO",
        instructions="Take with food",
    )
    return prescription


class TestAdmissionOrdersEndpoints:
    """Tests for admission orders endpoints."""

    def test_get_admission_orders_empty(self, authenticated_client, sample_admission):
        """Test getting orders for an admission with no orders."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["lab_orders"] == []
        assert response.data["imaging_orders"] == []
        assert response.data["prescriptions"] == []

    def test_get_admission_orders_with_lab_order(
        self, authenticated_client, sample_admission, admission_lab_order
    ):
        """Test getting orders for an admission with a lab order."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["lab_orders"]) == 1
        assert response.data["lab_orders"][0]["id"] == admission_lab_order.id
        assert response.data["lab_orders"][0]["admission"] == sample_admission.id
        assert response.data["imaging_orders"] == []
        assert response.data["prescriptions"] == []

    def test_get_admission_orders_with_imaging_order(
        self, authenticated_client, sample_admission, admission_imaging_order
    ):
        """Test getting orders for an admission with an imaging order."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["lab_orders"] == []
        assert len(response.data["imaging_orders"]) == 1
        assert response.data["imaging_orders"][0]["id"] == admission_imaging_order.id
        assert response.data["imaging_orders"][0]["admission"] == sample_admission.id
        assert response.data["prescriptions"] == []

    def test_get_admission_orders_with_prescription(
        self, authenticated_client, sample_admission, admission_prescription
    ):
        """Test getting orders for an admission with a prescription."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["lab_orders"] == []
        assert response.data["imaging_orders"] == []
        assert len(response.data["prescriptions"]) == 1
        assert response.data["prescriptions"][0]["id"] == admission_prescription.id
        assert response.data["prescriptions"][0]["admission"] == sample_admission.id

    def test_get_admission_orders_combined(
        self,
        authenticated_client,
        sample_admission,
        admission_lab_order,
        admission_imaging_order,
        admission_prescription,
    ):
        """Test getting all orders for an admission."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["lab_orders"]) == 1
        assert len(response.data["imaging_orders"]) == 1
        assert len(response.data["prescriptions"]) == 1

    def test_get_admission_lab_orders_endpoint(
        self, authenticated_client, sample_admission, admission_lab_order
    ):
        """Test the dedicated lab orders endpoint."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/lab-orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["id"] == admission_lab_order.id

    def test_get_admission_imaging_orders_endpoint(
        self, authenticated_client, sample_admission, admission_imaging_order
    ):
        """Test the dedicated imaging orders endpoint."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/imaging-orders/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["id"] == admission_imaging_order.id

    def test_get_admission_prescriptions_endpoint(
        self, authenticated_client, sample_admission, admission_prescription
    ):
        """Test the dedicated prescriptions endpoint."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/prescriptions/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["id"] == admission_prescription.id

    def test_get_admission_orders_unauthorized(self, api_client, sample_admission):
        """Test that unauthenticated requests are rejected."""
        response = api_client.get(f"/api/inpatient/admissions/{sample_admission.id}/orders/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_admission_orders_not_found(self, authenticated_client):
        """Test 404 for non-existent admission."""
        response = authenticated_client.get("/api/inpatient/admissions/99999/orders/")

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestAdmissionFKOnOrders:
    """Tests for admission FK field on order models."""

    def test_lab_order_admission_field_optional(
        self, db, sample_patient, sample_encounter, sample_lab_test, test_user
    ):
        """Test that admission field is optional on lab orders."""
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            admission=None,  # No admission
            ordered_by=test_user,
            priority="ROUTINE",
        )
        assert order.admission is None

    def test_imaging_order_admission_field_optional(
        self, db, sample_patient, sample_encounter, sample_imaging_procedure, test_user
    ):
        """Test that admission field is optional on imaging orders."""
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            admission=None,  # No admission
            ordered_by=test_user,
            priority="ROUTINE",
            clinical_indication="Test",
        )
        assert order.admission is None

    def test_prescription_admission_field_optional(
        self, db, sample_patient, sample_encounter, test_user
    ):
        """Test that admission field is optional on prescriptions."""
        from datetime import date, timedelta

        prescription = Prescription.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            admission=None,  # No admission
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )
        assert prescription.admission is None

    def test_lab_order_with_admission(self, db, sample_lab_test, sample_admission, test_user):
        """Test lab order with admission FK."""
        order = LabOrder.objects.create(
            patient=sample_admission.patient,
            encounter=sample_admission.ipd_encounter,
            admission=sample_admission,
            ordered_by=test_user,
            priority="ROUTINE",
        )
        assert order.admission == sample_admission
        assert order in sample_admission.lab_orders.all()
