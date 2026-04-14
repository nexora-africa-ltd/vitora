"""
Tests for laboratory specimen API endpoints.

Following TDD methodology - these tests validate the specimen API behavior.

Phase L0-L1: Specimen model and API endpoints
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.models import (
    LabOrder,
    LabOrderItem,
    Specimen,
    TestCatalog,
)
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def api_client():
    """Provide unauthenticated API client."""
    return APIClient()


@pytest.fixture
def authenticated_user(db):
    """Create and return authenticated user."""
    return User.objects.create_user(
        username="testlabuser", email="lab@test.com", password="testpass123"
    )


@pytest.fixture
def auth_client(
    api_client,
    authenticated_user,
    sample_organization,
    sample_facility,
    sample_department,
    sample_role,
):
    """Provide API client with authentication and multitenancy context."""
    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=authenticated_user,
        defaults={
            "employee_id": "LABSPEC-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date.today(),
        },
    )
    api_client.force_authenticate(user=authenticated_user)
    return api_client


@pytest.fixture
def sample_patient(db, sample_organization):
    """Create a sample patient."""
    return Patient.objects.create(
        first_name="Specimen",
        last_name="TestPatient",
        date_of_birth=date(1985, 5, 20),
        gender="F",
        organization=sample_organization,
    )


@pytest.fixture
def sample_encounter(sample_patient, authenticated_user, sample_facility):
    """Create a sample encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Specimen test",
        facility=sample_facility,
    )


@pytest.fixture
def sample_test_catalog(db):
    """Create sample test catalog entry."""
    return TestCatalog.objects.create(
        code="SPEC-TEST",
        name="Specimen Test",
        short_name="SPECT",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=Decimal("300.00"),
    )


@pytest.fixture
def sample_order(
    sample_patient,
    sample_encounter,
    authenticated_user,
    sample_test_catalog,
    sample_facility,
    sample_organization,
):
    """Create a sample lab order with order item."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=authenticated_user,
        order_type="IN_HOUSE",
        status="ORDERED",
        priority="ROUTINE",
        facility=sample_facility,
        organization=sample_organization,
    )

    LabOrderItem.objects.create(
        lab_order=order,
        test=sample_test_catalog,
        unit_cost=sample_test_catalog.cost,
    )

    return order


@pytest.fixture
def sample_specimen(sample_order, authenticated_user):
    """Create a sample specimen for testing."""
    specimen = Specimen.objects.create(
        barcode="SPEC-API-001",
        specimen_type="BLOOD",
        lab_order=sample_order,
        collected_by=authenticated_user,
        status="COLLECTED",
    )
    specimen.order_items.add(*sample_order.items.all())
    return specimen


@pytest.mark.django_db
class TestSpecimenListAPI:
    """Tests for GET /api/lab/specimens/ endpoint."""

    def test_list_specimens_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/lab/specimens/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_specimens_empty(self, auth_client):
        """Should return empty list when no specimens exist."""
        response = auth_client.get("/api/lab/specimens/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"] == []

    def test_list_specimens_returns_specimens(self, auth_client, sample_specimen):
        """Should return list of specimens."""
        response = auth_client.get("/api/lab/specimens/")
        assert response.status_code == status.HTTP_200_OK
        # There may be auto-created specimens from signals, so check >= 1
        assert len(response.data["results"]) >= 1
        # Find our specific specimen
        specimen_data = next(
            (s for s in response.data["results"] if s["barcode"] == "SPEC-API-001"),
            None,
        )
        assert specimen_data is not None
        assert specimen_data["specimen_type"] == "BLOOD"
        assert specimen_data["status"] == "COLLECTED"

    def test_list_specimens_includes_patient_info(self, auth_client, sample_specimen):
        """Should include patient name and MRN in response."""
        response = auth_client.get("/api/lab/specimens/")
        assert response.status_code == status.HTTP_200_OK
        specimen_data = response.data["results"][0]
        assert "patient_name" in specimen_data
        assert specimen_data["patient_name"] == "Specimen TestPatient"
        assert "patient_mrn" in specimen_data

    def test_list_specimens_includes_order_info(self, auth_client, sample_specimen):
        """Should include order number in response."""
        response = auth_client.get("/api/lab/specimens/")
        assert response.status_code == status.HTTP_200_OK
        specimen_data = response.data["results"][0]
        assert "order_number" in specimen_data
        assert specimen_data["order_number"] is not None

    def test_list_specimens_filter_by_status(self, auth_client, sample_specimen):
        """Should filter specimens by status."""
        response = auth_client.get("/api/lab/specimens/?status=COLLECTED")
        assert response.status_code == status.HTTP_200_OK
        # Our fixture specimen should appear
        assert len(response.data["results"]) >= 1
        assert all(s["status"] == "COLLECTED" for s in response.data["results"])

        # DISPOSED should have none (not used in tests)
        response = auth_client.get("/api/lab/specimens/?status=DISPOSED")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0

    def test_list_specimens_filter_by_specimen_type(self, auth_client, sample_specimen):
        """Should filter specimens by specimen type."""
        response = auth_client.get("/api/lab/specimens/?specimen_type=BLOOD")
        assert response.status_code == status.HTTP_200_OK
        # At least our fixture specimen should appear
        assert len(response.data["results"]) >= 1
        assert all(s["specimen_type"] == "BLOOD" for s in response.data["results"])

        response = auth_client.get("/api/lab/specimens/?specimen_type=URINE")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0

    def test_list_specimens_search_by_barcode(self, auth_client, sample_specimen):
        """Should search specimens by barcode prefix."""
        response = auth_client.get("/api/lab/specimens/?barcode=SPEC-API")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

        response = auth_client.get("/api/lab/specimens/?barcode=UNKNOWN")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0


@pytest.mark.django_db
class TestSpecimenDetailAPI:
    """Tests for GET /api/lab/specimens/{barcode}/ endpoint."""

    def test_get_specimen_by_barcode(self, auth_client, sample_specimen):
        """Should retrieve specimen by barcode."""
        response = auth_client.get(f"/api/lab/specimens/{sample_specimen.barcode}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["barcode"] == "SPEC-API-001"
        assert response.data["specimen_type"] == "BLOOD"
        assert response.data["status"] == "COLLECTED"

    def test_get_specimen_includes_full_details(self, auth_client, sample_specimen):
        """Should include all specimen fields."""
        response = auth_client.get(f"/api/lab/specimens/{sample_specimen.barcode}/")
        assert response.status_code == status.HTTP_200_OK

        expected_fields = [
            "id",
            "barcode",
            "specimen_type",
            "specimen_type_display",
            "container_type",
            "lab_order",
            "order_number",
            "patient_name",
            "patient_mrn",
            "order_item_ids",
            "collected_by",
            "collected_by_name",
            "collected_at",
            "collection_site",
            "received_by",
            "received_by_name",
            "received_at",
            "status",
            "status_display",
            "rejection_reason",
            "storage_location",
            "storage_temperature",
            "created_at",
            "updated_at",
        ]
        for field in expected_fields:
            assert field in response.data, f"Missing field: {field}"

    def test_get_specimen_not_found(self, auth_client):
        """Should return 404 for non-existent barcode."""
        response = auth_client.get("/api/lab/specimens/NONEXISTENT/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_specimen_requires_auth(self, api_client, sample_specimen):
        """Should reject unauthenticated requests."""
        response = api_client.get(f"/api/lab/specimens/{sample_specimen.barcode}/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestOrderSpecimensNestedAPI:
    """Tests for GET /api/lab/orders/{order_number}/specimens/ endpoint."""

    def test_list_order_specimens_requires_auth(self, api_client, sample_order):
        """Should reject unauthenticated requests."""
        response = api_client.get(f"/api/lab/orders/{sample_order.order_number}/specimens/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_order_specimens_empty(self, auth_client, sample_order):
        """Should return empty list when order has no specimens."""
        # Clear any auto-created specimens (from signals)
        sample_order.specimens.all().delete()

        response = auth_client.get(f"/api/lab/orders/{sample_order.order_number}/specimens/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_list_order_specimens_returns_specimens(
        self, auth_client, sample_order, sample_specimen
    ):
        """Should return list of specimens for the order."""
        response = auth_client.get(f"/api/lab/orders/{sample_order.order_number}/specimens/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

        barcodes = [s["barcode"] for s in response.data]
        assert sample_specimen.barcode in barcodes

    def test_list_order_specimens_not_found(self, auth_client):
        """Should return 404 for non-existent order."""
        response = auth_client.get("/api/lab/orders/NONEXISTENT-ORDER/specimens/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_list_order_specimens_only_returns_own_specimens(
        self,
        auth_client,
        sample_order,
        sample_specimen,
        sample_patient,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should only return specimens for the specific order."""
        # Create another order with its own specimen
        other_test = TestCatalog.objects.create(
            code="OTHER-TEST",
            name="Other Test",
            short_name="OT",
            category="CHEMISTRY",
            specimen_type="URINE",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        other_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            order_type="IN_HOUSE",
            status="ORDERED",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        LabOrderItem.objects.create(
            lab_order=other_order,
            test=other_test,
            unit_cost=other_test.cost,
        )
        other_specimen = Specimen.objects.create(
            barcode="OTHER-SPEC-001",
            specimen_type="URINE",
            lab_order=other_order,
        )

        # Check original order
        response = auth_client.get(f"/api/lab/orders/{sample_order.order_number}/specimens/")
        assert response.status_code == status.HTTP_200_OK
        barcodes = [s["barcode"] for s in response.data]
        assert other_specimen.barcode not in barcodes


@pytest.mark.django_db
class TestSpecimenAPIReadOnly:
    """Tests to verify specimen API is read-only."""

    def test_create_specimen_not_allowed(self, auth_client, sample_order):
        """Should not allow POST to create specimens directly."""
        response = auth_client.post(
            "/api/lab/specimens/",
            {
                "barcode": "NEW-SPEC-001",
                "specimen_type": "BLOOD",
                "lab_order": sample_order.id,
            },
        )
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_update_specimen_not_allowed(self, auth_client, sample_specimen):
        """Should not allow PUT/PATCH to update specimens."""
        response = auth_client.put(
            f"/api/lab/specimens/{sample_specimen.barcode}/",
            {"status": "PROCESSING"},
        )
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        response = auth_client.patch(
            f"/api/lab/specimens/{sample_specimen.barcode}/",
            {"status": "PROCESSING"},
        )
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_delete_specimen_not_allowed(self, auth_client, sample_specimen):
        """Should not allow DELETE to remove specimens."""
        response = auth_client.delete(f"/api/lab/specimens/{sample_specimen.barcode}/")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
