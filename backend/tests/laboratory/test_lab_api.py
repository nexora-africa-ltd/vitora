"""
Tests for laboratory API endpoints.

Following TDD methodology - these tests define the expected API behavior
before implementation.

Sprint 1.3-1.4 Track B: Lab/Investigations Foundation
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
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
        username="testdoctor", email="doctor@test.com", password="testpass123"
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
            "employee_id": "LAB-0001",
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
        first_name="Test",
        last_name="Patient",
        date_of_birth=date(1990, 1, 1),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def sample_encounter(sample_patient, authenticated_user, sample_facility):
    """Create a sample encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Test complaint",
        facility=sample_facility,
    )


@pytest.fixture
def sample_test_catalog(db):
    """Create sample test catalog entries."""
    tests = []
    tests.append(
        TestCatalog.objects.create(
            code="CBC",
            name="Complete Blood Count",
            short_name="CBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="PANEL",
            cost=Decimal("500.00"),
        )
    )
    tests.append(
        TestCatalog.objects.create(
            code="RBS",
            name="Random Blood Sugar",
            short_name="RBS",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            result_unit="mmol/L",
            normal_range_male="3.9-7.8",
            cost=Decimal("150.00"),
        )
    )
    return tests


@pytest.mark.django_db
class TestTestCatalogAPI:
    """Tests for Test Catalog API endpoints."""

    def test_list_tests_requires_authentication(self, api_client):
        """Should require authentication to list tests."""
        response = api_client.get("/api/lab/tests/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_tests_authenticated(self, auth_client, sample_test_catalog):
        """Authenticated user can list tests."""
        response = auth_client.get("/api/lab/tests/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_search_tests_by_name(self, auth_client, sample_test_catalog):
        """Should search tests by name."""
        response = auth_client.get("/api/lab/tests/?search=Blood")

        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert len(results) >= 1
        assert any("Blood" in test["name"] for test in results)

    def test_filter_tests_by_category(self, auth_client, sample_test_catalog):
        """Should filter tests by category."""
        response = auth_client.get("/api/lab/tests/?category=HEMATOLOGY")

        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert all(test["category"] == "HEMATOLOGY" for test in results)

    def test_get_test_detail(self, auth_client, sample_test_catalog):
        """Should retrieve test details by code."""
        test = sample_test_catalog[0]
        response = auth_client.get(f"/api/lab/tests/{test.code}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == test.code
        assert response.data["name"] == test.name


@pytest.mark.django_db
class TestLabOrderAPI:
    """Tests for Lab Order API endpoints."""

    def test_create_lab_order_requires_authentication(self, api_client, sample_encounter):
        """Should require authentication to create order."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [],
        }
        response = api_client.post("/api/lab/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_lab_order_with_items(self, auth_client, sample_encounter, sample_test_catalog):
        """Should create lab order with test items."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "priority": "ROUTINE",
            "clinical_notes": "Patient reports fever",
            "items": [
                {"test_code": "CBC"},
                {"test_code": "RBS"},
            ],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert "order_number" in response.data
        assert response.data["order_number"].startswith("LAB-")
        assert len(response.data["items"]) == 2

    def test_order_number_auto_generated(self, auth_client, sample_encounter, sample_test_catalog):
        """Order number should be auto-generated."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["order_number"]
        assert len(response.data["order_number"]) == 17

    def test_list_lab_orders(self, auth_client, sample_encounter, sample_test_catalog):
        """Should list lab orders."""
        # Create an order first
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC"}],
        }
        auth_client.post("/api/lab/orders/", order_data, format="json")

        # List orders
        response = auth_client.get("/api/lab/orders/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_get_order_detail(self, auth_client, sample_encounter, sample_test_catalog):
        """Should retrieve order details."""
        # Create order
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC"}],
        }
        create_response = auth_client.post("/api/lab/orders/", order_data, format="json")
        order_number = create_response.data["order_number"]

        # Get detail
        response = auth_client.get(f"/api/lab/orders/{order_number}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_number"] == order_number
        assert "items" in response.data

    def test_filter_orders_by_patient(self, auth_client, sample_encounter, sample_test_catalog):
        """Should filter orders by patient."""
        # Create order
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC"}],
        }
        auth_client.post("/api/lab/orders/", order_data, format="json")

        # Filter by patient
        response = auth_client.get(f"/api/lab/orders/?patient={sample_encounter.patient.id}")

        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert all(order["patient"] == sample_encounter.patient.id for order in results)

    def test_filter_orders_by_status(self, auth_client, sample_encounter, sample_test_catalog):
        """Should filter orders by status."""
        # Create order
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC"}],
        }
        auth_client.post("/api/lab/orders/", order_data, format="json")

        # Filter by status
        response = auth_client.get("/api/lab/orders/?status=DRAFT")

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestLabOrderWorkflowAPI:
    """Tests for lab order workflow actions."""

    @pytest.fixture
    def sample_order(
        self,
        sample_encounter,
        sample_test_catalog,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Create a sample lab order."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            order_type="EXTERNAL",
            facility=sample_facility,
            organization=sample_organization,
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=sample_test_catalog[0],
            unit_cost=sample_test_catalog[0].cost,
        )
        return order

    def test_submit_order(self, auth_client, sample_order):
        """Should submit order for processing."""
        response = auth_client.post(f"/api/lab/orders/{sample_order.order_number}/submit/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ORDERED"

    def test_collect_specimen(self, auth_client, sample_order):
        """Should record specimen collection."""
        # First submit the order
        sample_order.status = "ORDERED"
        sample_order.save()

        response = auth_client.post(
            f"/api/lab/orders/{sample_order.order_number}/collect-specimen/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["specimen_collected"] is True

    def test_cancel_order(self, auth_client, sample_order):
        """Should cancel order."""
        response = auth_client.post(
            f"/api/lab/orders/{sample_order.order_number}/cancel/",
            {"reason": "Patient discharged"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_generate_requisition_pdf(self, auth_client, sample_order):
        """Should generate PDF requisition."""
        response = auth_client.get(f"/api/lab/orders/{sample_order.order_number}/requisition/")

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"


@pytest.mark.django_db
class TestLabResultAPI:
    """Tests for lab result API endpoints."""

    @pytest.fixture
    def sample_order_item(
        self,
        sample_encounter,
        sample_test_catalog,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Create a sample order item ready for results."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            status="IN_PROGRESS",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=sample_test_catalog[1],  # RBS test
            unit_cost=sample_test_catalog[1].cost,
        )
        return item

    def test_enter_numeric_result(self, auth_client, sample_order_item):
        """Should enter numeric result."""
        result_data = {
            "order_item": sample_order_item.id,
            "numeric_value": "5.5",
        }

        response = auth_client.post(
            f"/api/lab/orders/{sample_order_item.lab_order.order_number}/results/",
            result_data,
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Decimal may be returned with trailing zeros
        assert Decimal(response.data["numeric_value"]) == Decimal("5.5")

    def test_auto_flag_on_entry(self, auth_client, sample_order_item):
        """Should auto-flag abnormal results."""
        result_data = {
            "order_item": sample_order_item.id,
            "numeric_value": "10.0",  # High value
        }

        response = auth_client.post(
            f"/api/lab/orders/{sample_order_item.lab_order.order_number}/results/",
            result_data,
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["result_flag"] in ["HIGH", "CRITICAL_HIGH"]

    def test_update_result(self, auth_client, sample_order_item, authenticated_user):
        """Should update existing result."""
        # Create result first
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        # Update it
        update_data = {
            "numeric_value": "6.0",
            "interpretation": "Slightly elevated",
        }

        response = auth_client.patch(f"/api/lab/results/{result.id}/", update_data, format="json")

        assert response.status_code == status.HTTP_200_OK
        # Decimal may be returned with trailing zeros
        assert Decimal(response.data["numeric_value"]) == Decimal("6.0")

    def test_verify_result(self, auth_client, sample_order_item, authenticated_user):
        """Should verify result."""
        # Create result first
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        # Verify it
        response = auth_client.post(
            f"/api/lab/results/{result.id}/verify/",
            {"approved": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verification_status"] == "VERIFIED"

    def test_list_results_for_order(self, auth_client, sample_order_item):
        """Should list all results for an order."""
        response = auth_client.get(
            f"/api/lab/orders/{sample_order_item.lab_order.order_number}/results/"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_list_results_for_patient(self, auth_client, sample_order_item):
        """Should list all results for a patient."""
        response = auth_client.get(
            f"/api/patients/{sample_order_item.lab_order.patient.id}/lab-results/"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_pending_verification_list(self, auth_client, sample_order_item, authenticated_user):
        """Should list results pending verification."""
        # Create unverified result
        LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        response = auth_client.get("/api/lab/results/pending-verification/")

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestLabAPIPagination:
    """Tests for API pagination."""

    def test_tests_list_pagination(self, auth_client, db):
        """Should paginate test catalog list."""
        # Create multiple tests
        for i in range(35):
            TestCatalog.objects.create(
                code=f"TEST{i}",
                name=f"Test {i}",
                short_name=f"T{i}",
                category="CHEMISTRY",
                specimen_type="BLOOD",
                result_type="NUMERIC",
            )

        response = auth_client.get("/api/lab/tests/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert "count" in response.data
        assert "next" in response.data
        assert "previous" in response.data

    def test_orders_list_pagination(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should paginate orders list."""
        # Create multiple orders
        for i in range(35):
            LabOrder.objects.create(
                patient=sample_encounter.patient,
                encounter=sample_encounter,
                ordered_by=authenticated_user,
                facility=sample_facility,
                organization=sample_organization,
            )

        response = auth_client.get("/api/lab/orders/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert "count" in response.data


@pytest.mark.django_db
class TestNestedLabRoutes:
    """Tests for nested lab routes under patients and encounters."""

    def test_patient_lab_orders_list(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should list lab orders for a specific patient."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/patients/{sample_encounter.patient.id}/lab-orders/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_patient_lab_results_list(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should list lab results for a specific patient."""
        test = TestCatalog.objects.create(
            code="PAT_TEST",
            name="Patient Test",
            short_name="PT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        response = auth_client.get(f"/api/patients/{sample_encounter.patient.id}/lab-results/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_encounter_lab_orders_list(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should list lab orders for a specific encounter."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/encounters/{sample_encounter.id}/lab-orders/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1


@pytest.mark.django_db
class TestLabOrderItemManagement:
    """Tests for order item management (add/remove items)."""

    def test_add_item_to_order(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should add a test item to an existing order."""
        test = TestCatalog.objects.create(
            code="ADD_TEST",
            name="Add Test",
            short_name="AT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = auth_client.post(
            f"/api/lab/orders/{order.order_number}/items/",
            {"test_code": test.code},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert order.items.count() == 1

    def test_add_duplicate_item_fails(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should prevent adding duplicate test to order."""
        test = TestCatalog.objects.create(
            code="DUP_TEST",
            name="Duplicate Test",
            short_name="DT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )

        response = auth_client.post(
            f"/api/lab/orders/{order.order_number}/items/",
            {"test_code": test.code},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already in this order" in response.data["error"]

    def test_delete_item_from_draft_order(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should delete item from draft order."""
        test = TestCatalog.objects.create(
            code="DEL_TEST",
            name="Delete Test",
            short_name="DT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            status="DRAFT",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )

        response = auth_client.delete(f"/api/lab/orders/{order.order_number}/items/{item.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert order.items.count() == 0

    def test_delete_item_from_submitted_order_fails(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should not allow deleting items from submitted order."""
        test = TestCatalog.objects.create(
            code="SUB_TEST",
            name="Submitted Test",
            short_name="ST",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            status="ORDERED",  # Already submitted,
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )

        response = auth_client.delete(f"/api/lab/orders/{order.order_number}/items/{item.id}/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestResultVerifyReject:
    """Tests for result verification and rejection workflow."""

    def test_verify_result_approved(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should verify (approve) a result."""
        test = TestCatalog.objects.create(
            code="VER_TEST",
            name="Verify Test",
            short_name="VT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        response = auth_client.post(
            f"/api/lab/results/{result.id}/verify/",
            {"approved": True, "comments": "Looks good"},
        )

        assert response.status_code == status.HTTP_200_OK
        result.refresh_from_db()
        assert result.verification_status == "VERIFIED"

    def test_verify_result_rejected(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should reject a result."""
        test = TestCatalog.objects.create(
            code="REJ_TEST",
            name="Reject Test",
            short_name="RT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        response = auth_client.post(
            f"/api/lab/results/{result.id}/verify/",
            {"approved": False, "comments": "Sample hemolyzed, rerun required"},
        )

        assert response.status_code == status.HTTP_200_OK
        result.refresh_from_db()
        assert result.verification_status == "REJECTED"
        assert "Rejection reason" in result.interpretation


@pytest.mark.django_db
class TestResultAttachmentUpload:
    """Tests for result attachment upload."""

    def test_upload_attachment_success(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should upload attachment to result."""
        test = TestCatalog.objects.create(
            code="ATT_TEST",
            name="Attachment Test",
            short_name="AT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        # Create a fake PDF file
        pdf_content = b"%PDF-1.4 fake pdf content"
        from django.core.files.uploadedfile import SimpleUploadedFile

        pdf_file = SimpleUploadedFile(
            "external_result.pdf", pdf_content, content_type="application/pdf"
        )

        response = auth_client.post(
            f"/api/lab/results/{result.id}/attachment/",
            {"file": pdf_file},
            format="multipart",
        )

        assert response.status_code == status.HTTP_200_OK
        result.refresh_from_db()
        assert result.is_external_result is True
        assert result.external_result_attachment is not None

    def test_upload_invalid_file_type_fails(
        self,
        auth_client,
        sample_encounter,
        authenticated_user,
        sample_facility,
        sample_organization,
    ):
        """Should reject invalid file types."""
        test = TestCatalog.objects.create(
            code="INV_TEST",
            name="Invalid Test",
            short_name="IT",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=authenticated_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=authenticated_user,
        )

        # Create a fake executable file
        from django.core.files.uploadedfile import SimpleUploadedFile

        exe_file = SimpleUploadedFile(
            "malware.exe", b"fake exe content", content_type="application/x-msdownload"
        )

        response = auth_client.post(
            f"/api/lab/results/{result.id}/attachment/",
            {"file": exe_file},
            format="multipart",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "File type not allowed" in str(response.data)
