"""
Tests for imaging API endpoints.

Following TDD methodology - these tests define the expected behavior
before implementation.

Sprint A.2: API Endpoints & SHA Integration
"""

from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

# ============================================================================
# Imaging Procedure (Catalog) API Tests (20 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingProcedureAPI:
    """Tests for ImagingProcedure (catalog) API endpoints."""

    @pytest.fixture
    def procedures(self, db):
        """Create sample procedures for testing."""
        return [
            ImagingProcedure.objects.create(
                code="XR-CHEST-PA",
                name="Chest X-Ray PA View",
                modality="XR",
                body_region="CHEST",
                cost=Decimal("1500.00"),
                sha_claimable=True,
            ),
            ImagingProcedure.objects.create(
                code="CT-HEAD-NC",
                name="CT Head without Contrast",
                modality="CT",
                body_region="HEAD",
                cost=Decimal("8000.00"),
                sha_claimable=True,
            ),
            ImagingProcedure.objects.create(
                code="US-ABDOMEN",
                name="Abdominal Ultrasound",
                modality="US",
                body_region="ABDOMEN",
                cost=Decimal("3000.00"),
                sha_claimable=True,
            ),
            ImagingProcedure.objects.create(
                code="MRI-BRAIN",
                name="MRI Brain without Contrast",
                modality="MRI",
                body_region="HEAD",
                cost=Decimal("15000.00"),
                sha_claimable=False,
            ),
        ]

    def test_list_procedures_requires_auth(self, api_client):
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/imaging/procedures/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_procedures(self, authenticated_client, procedures):
        """Should list all active imaging procedures."""
        response = authenticated_client.get("/api/imaging/procedures/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 4

    def test_list_procedures_pagination(self, authenticated_client, procedures):
        """Should paginate procedure list."""
        response = authenticated_client.get("/api/imaging/procedures/")
        assert response.status_code == status.HTTP_200_OK
        assert "count" in response.data
        assert "results" in response.data

    def test_retrieve_procedure(self, authenticated_client, procedures):
        """Should retrieve procedure by code."""
        response = authenticated_client.get("/api/imaging/procedures/XR-CHEST-PA/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "XR-CHEST-PA"
        assert response.data["name"] == "Chest X-Ray PA View"

    def test_filter_procedures_by_modality(self, authenticated_client, procedures):
        """Should filter procedures by modality."""
        response = authenticated_client.get("/api/imaging/procedures/?modality=XR")
        assert response.status_code == status.HTTP_200_OK
        assert all(p["modality"] == "XR" for p in response.data["results"])

    def test_filter_procedures_by_body_region(self, authenticated_client, procedures):
        """Should filter procedures by body region."""
        response = authenticated_client.get("/api/imaging/procedures/?body_region=HEAD")
        assert response.status_code == status.HTTP_200_OK
        assert all(p["body_region"] == "HEAD" for p in response.data["results"])

    def test_search_procedures_by_name(self, authenticated_client, procedures):
        """Should search procedures by name."""
        response = authenticated_client.get("/api/imaging/procedures/?search=chest")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1
        assert any("Chest" in p["name"] for p in response.data["results"])

    def test_search_procedures_by_code(self, authenticated_client, procedures):
        """Should search procedures by code."""
        response = authenticated_client.get("/api/imaging/procedures/?search=CT-HEAD")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_filter_active_only(self, authenticated_client, db):
        """Should only list active procedures."""
        active = ImagingProcedure.objects.create(
            code="ACTIVE-PROC",
            name="Active Procedure",
            modality="XR",
            body_region="CHEST",
            is_active=True,
        )
        inactive = ImagingProcedure.objects.create(
            code="INACTIVE-PROC",
            name="Inactive Procedure",
            modality="XR",
            body_region="CHEST",
            is_active=False,
        )
        response = authenticated_client.get("/api/imaging/procedures/")
        codes = [p["code"] for p in response.data["results"]]
        assert "ACTIVE-PROC" in codes
        assert "INACTIVE-PROC" not in codes

    def test_procedure_detail_includes_all_fields(self, authenticated_client, procedures):
        """Detail view should include all procedure fields."""
        response = authenticated_client.get("/api/imaging/procedures/XR-CHEST-PA/")
        assert response.status_code == status.HTTP_200_OK
        expected_fields = [
            "code",
            "name",
            "modality",
            "body_region",
            "cost",
            "sha_claimable",
            "requires_contrast",
            "requires_sedation",
            "special_preparation",
            "turnaround_hours",
        ]
        for field in expected_fields:
            assert field in response.data


# ============================================================================
# Imaging Order API Tests (30 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingOrderAPI:
    """Tests for ImagingOrder API endpoints."""

    @pytest.fixture
    def procedure(self, db):
        """Create a sample procedure."""
        return ImagingProcedure.objects.create(
            code="XR-CHEST-API",
            name="Chest X-Ray API Test",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1500.00"),
        )

    @pytest.fixture
    def order_data(self, sample_patient, sample_encounter, procedure):
        """Sample order data for creation."""
        return {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "priority": "ROUTINE",
            "clinical_indication": "Suspected pneumonia",
            "items": [{"procedure_code": procedure.code, "laterality": "NA"}],
        }

    @pytest.fixture
    def sample_imaging_order(self, sample_patient, sample_encounter, test_user, procedure):
        """Create a sample imaging order."""
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test indication",
            status="DRAFT",
        )
        ImagingOrderItem.objects.create(
            order=order,
            procedure=procedure,
            unit_cost=procedure.cost,
        )
        return order

    # --- Authentication Tests ---

    def test_list_orders_requires_auth(self, api_client):
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/imaging/orders/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_order_requires_auth(self, api_client, order_data):
        """Creating order requires authentication."""
        response = api_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # --- List Orders Tests ---

    def test_list_orders(self, authenticated_client, sample_imaging_order):
        """Should list imaging orders."""
        response = authenticated_client.get("/api/imaging/orders/")
        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data

    def test_list_orders_pagination(self, authenticated_client, sample_imaging_order):
        """Should paginate order list."""
        response = authenticated_client.get("/api/imaging/orders/")
        assert response.status_code == status.HTTP_200_OK
        assert "count" in response.data
        assert "next" in response.data
        assert "previous" in response.data

    def test_filter_orders_by_patient(
        self, authenticated_client, sample_imaging_order, sample_patient
    ):
        """Should filter orders by patient."""
        response = authenticated_client.get(f"/api/imaging/orders/?patient={sample_patient.id}")
        assert response.status_code == status.HTTP_200_OK
        for order in response.data["results"]:
            assert order["patient"] == sample_patient.id

    def test_filter_orders_by_status(self, authenticated_client, sample_imaging_order):
        """Should filter orders by status."""
        response = authenticated_client.get("/api/imaging/orders/?status=DRAFT")
        assert response.status_code == status.HTTP_200_OK
        for order in response.data["results"]:
            assert order["status"] == "DRAFT"

    def test_filter_orders_by_priority(self, authenticated_client, sample_imaging_order):
        """Should filter orders by priority."""
        response = authenticated_client.get("/api/imaging/orders/?priority=ROUTINE")
        assert response.status_code == status.HTTP_200_OK

    def test_filter_orders_by_date_range(self, authenticated_client, sample_imaging_order):
        """Should filter orders by date range."""
        today = timezone.now().date().isoformat()
        response = authenticated_client.get(f"/api/imaging/orders/?date_from={today}")
        assert response.status_code == status.HTTP_200_OK

    # --- Create Order Tests ---

    def test_create_order(self, authenticated_client, order_data):
        """Should create imaging order."""
        response = authenticated_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["order_number"].startswith("RAD-")
        assert response.data["status"] == "DRAFT"
        assert len(response.data["items"]) == 1

    def test_create_order_sets_ordered_by(self, authenticated_client, order_data, test_user):
        """Should set ordered_by to authenticated user."""
        response = authenticated_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["ordered_by"] == test_user.id

    def test_create_order_calculates_total_cost(self, authenticated_client, order_data):
        """Should calculate total cost from items."""
        response = authenticated_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert Decimal(response.data["total_cost"]) == Decimal("1500.00")

    def test_create_order_with_multiple_items(
        self, authenticated_client, sample_patient, sample_encounter, db
    ):
        """Should create order with multiple items."""
        proc1 = ImagingProcedure.objects.create(
            code="MULTI-1",
            name="Multi 1",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1000.00"),
        )
        proc2 = ImagingProcedure.objects.create(
            code="MULTI-2",
            name="Multi 2",
            modality="CT",
            body_region="HEAD",
            cost=Decimal("5000.00"),
        )
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "clinical_indication": "Multiple procedures",
            "items": [
                {"procedure_code": proc1.code, "laterality": "NA"},
                {"procedure_code": proc2.code, "laterality": "NA"},
            ],
        }
        response = authenticated_client.post("/api/imaging/orders/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data["items"]) == 2
        assert Decimal(response.data["total_cost"]) == Decimal("6000.00")

    def test_create_order_with_laterality(
        self, authenticated_client, sample_patient, sample_encounter, db
    ):
        """Should create order with laterality specified."""
        proc = ImagingProcedure.objects.create(
            code="XR-KNEE", name="Knee X-Ray", modality="XR", body_region="LOWER_EXTREMITY"
        )
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "clinical_indication": "Knee pain",
            "items": [{"procedure_code": proc.code, "laterality": "LEFT"}],
        }
        response = authenticated_client.post("/api/imaging/orders/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["items"][0]["laterality"] == "LEFT"

    def test_create_order_invalid_procedure_code(
        self, authenticated_client, sample_patient, sample_encounter
    ):
        """Should reject invalid procedure code."""
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "clinical_indication": "Test",
            "items": [{"procedure_code": "INVALID-CODE", "laterality": "NA"}],
        }
        response = authenticated_client.post("/api/imaging/orders/", data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_order_missing_required_fields(self, authenticated_client):
        """Should reject order missing required fields."""
        response = authenticated_client.post(
            "/api/imaging/orders/", {"clinical_indication": "Test"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # --- Retrieve Order Tests ---

    def test_retrieve_order(self, authenticated_client, sample_imaging_order):
        """Should retrieve order by order number."""
        response = authenticated_client.get(
            f"/api/imaging/orders/{sample_imaging_order.order_number}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_number"] == sample_imaging_order.order_number

    def test_retrieve_order_includes_items(self, authenticated_client, sample_imaging_order):
        """Order detail should include items."""
        response = authenticated_client.get(
            f"/api/imaging/orders/{sample_imaging_order.order_number}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.data
        assert len(response.data["items"]) >= 1

    def test_retrieve_order_includes_patient_name(self, authenticated_client, sample_imaging_order):
        """Order detail should include patient name."""
        response = authenticated_client.get(
            f"/api/imaging/orders/{sample_imaging_order.order_number}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "patient_name" in response.data

    # --- Update Order Tests ---

    def test_update_order(self, authenticated_client, sample_imaging_order):
        """Should update order details."""
        response = authenticated_client.patch(
            f"/api/imaging/orders/{sample_imaging_order.order_number}/",
            {"clinical_indication": "Updated indication"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["clinical_indication"] == "Updated indication"

    def test_update_order_priority(self, authenticated_client, sample_imaging_order):
        """Should update order priority."""
        response = authenticated_client.patch(
            f"/api/imaging/orders/{sample_imaging_order.order_number}/",
            {"priority": "STAT"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["priority"] == "STAT"

    # --- Delete Order Tests ---

    def test_delete_draft_order(self, authenticated_client, test_user, sample_imaging_order):
        """Should allow deleting draft orders with delete permission."""
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Permission

        User = get_user_model()
        perm = Permission.objects.get(codename="delete_imagingorder")
        test_user.user_permissions.add(perm)
        test_user = User.objects.get(pk=test_user.pk)
        authenticated_client.force_authenticate(user=test_user)

        response = authenticated_client.delete(
            f"/api/imaging/orders/{sample_imaging_order.order_number}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT


# ============================================================================
# Imaging Order Workflow Action Tests (15 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingOrderWorkflow:
    """Tests for order workflow actions."""

    @pytest.fixture
    def procedure(self, db):
        """Create a sample procedure."""
        return ImagingProcedure.objects.create(
            code="XR-WF-TEST",
            name="Workflow Test Procedure",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1500.00"),
        )

    @pytest.fixture
    def draft_order(self, sample_patient, sample_encounter, test_user, procedure):
        """Create a draft imaging order."""
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Workflow test",
            status="DRAFT",
        )
        ImagingOrderItem.objects.create(order=order, procedure=procedure, unit_cost=procedure.cost)
        return order

    # --- Submit Order Tests ---

    def test_submit_order(self, authenticated_client, draft_order):
        """Should submit draft order."""
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/submit/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ORDERED"

    def test_submit_order_already_ordered_fails(self, authenticated_client, draft_order, test_user):
        """Should not allow re-submitting ordered order."""
        draft_order.update_status("ORDERED", test_user)
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/submit/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # --- Schedule Order Tests ---

    def test_schedule_order(self, authenticated_client, draft_order, test_user):
        """Should schedule ordered order."""
        draft_order.update_status("ORDERED", test_user)
        scheduled_time = (timezone.now() + timedelta(hours=2)).isoformat()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/schedule/",
            {"scheduled_datetime": scheduled_time, "scheduled_room": "Radiology Room 1"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SCHEDULED"
        assert response.data["scheduled_room"] == "Radiology Room 1"

    def test_schedule_draft_order_fails(self, authenticated_client, draft_order):
        """Should not allow scheduling draft order."""
        scheduled_time = (timezone.now() + timedelta(hours=2)).isoformat()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/schedule/",
            {"scheduled_datetime": scheduled_time},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # --- Start Order Tests ---

    def test_start_order(self, authenticated_client, draft_order, test_user):
        """Should start imaging process."""
        draft_order.update_status("ORDERED", test_user)
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_start_scheduled_order(self, authenticated_client, draft_order, test_user):
        """Should start scheduled order."""
        draft_order.status = "SCHEDULED"
        draft_order.save()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    # --- Complete Order Tests ---

    def test_complete_order(self, authenticated_client, draft_order, test_user):
        """Should complete in-progress order."""
        draft_order.status = "IN_PROGRESS"
        draft_order.save()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/complete/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["completed_at"] is not None

    def test_complete_draft_order_fails(self, authenticated_client, draft_order):
        """Should not allow completing draft order."""
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/complete/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # --- Cancel Order Tests ---

    def test_cancel_draft_order(self, authenticated_client, draft_order):
        """Should cancel draft order."""
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/cancel/",
            {"reason": "Patient declined"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_ordered_order(self, authenticated_client, draft_order, test_user):
        """Should cancel ordered order."""
        draft_order.update_status("ORDERED", test_user)
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/cancel/",
            {"reason": "Duplicate order"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_scheduled_order(self, authenticated_client, draft_order, test_user):
        """Should cancel scheduled order."""
        draft_order.status = "SCHEDULED"
        draft_order.save()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/cancel/",
            {"reason": "Patient no-show"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_in_progress_order_fails(self, authenticated_client, draft_order, test_user):
        """Should not allow cancelling in-progress order."""
        draft_order.status = "IN_PROGRESS"
        draft_order.save()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/cancel/",
            {"reason": "Test"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_completed_order_fails(self, authenticated_client, draft_order, test_user):
        """Should not allow cancelling completed order."""
        draft_order.status = "COMPLETED"
        draft_order.save()
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/cancel/",
            {"reason": "Test"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_without_reason(self, authenticated_client, draft_order):
        """Should allow cancel without reason (default reason used)."""
        response = authenticated_client.post(
            f"/api/imaging/orders/{draft_order.order_number}/cancel/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"


# ============================================================================
# Audit Logging Tests (8 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingAuditLogging:
    """Tests for audit logging on imaging operations."""

    @pytest.fixture
    def procedure(self, db):
        """Create a sample procedure."""
        return ImagingProcedure.objects.create(
            code="XR-AUDIT-TEST",
            name="Audit Test Procedure",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1500.00"),
        )

    @pytest.fixture
    def order_data(self, sample_patient, sample_encounter, procedure):
        """Sample order data for creation."""
        return {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "clinical_indication": "Audit test",
            "items": [{"procedure_code": procedure.code, "laterality": "NA"}],
        }

    def test_create_order_audit_log(self, authenticated_client, order_data):
        """Creating order should create audit log entry."""
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.filter(action="imaging_order_create").count()
        response = authenticated_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        new_count = AuditLog.objects.filter(action="imaging_order_create").count()
        assert new_count == initial_count + 1

    def test_view_order_audit_log(
        self, authenticated_client, sample_patient, sample_encounter, test_user, procedure
    ):
        """Viewing order should create audit log entry."""
        from hmis.apps.core.models import AuditLog

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        initial_count = AuditLog.objects.filter(action="imaging_order_view").count()
        authenticated_client.get(f"/api/imaging/orders/{order.order_number}/")
        new_count = AuditLog.objects.filter(action="imaging_order_view").count()
        assert new_count == initial_count + 1

    def test_update_order_audit_log(
        self, authenticated_client, sample_patient, sample_encounter, test_user, procedure
    ):
        """Updating order should create audit log entry."""
        from hmis.apps.core.models import AuditLog

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        initial_count = AuditLog.objects.filter(action="imaging_order_update").count()
        authenticated_client.patch(
            f"/api/imaging/orders/{order.order_number}/",
            {"clinical_indication": "Updated"},
            format="json",
        )
        new_count = AuditLog.objects.filter(action="imaging_order_update").count()
        assert new_count == initial_count + 1

    def test_delete_order_audit_log(
        self, authenticated_client, sample_patient, sample_encounter, test_user, procedure
    ):
        """Deleting order should create audit log entry."""
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Permission

        from hmis.apps.core.models import AuditLog

        User = get_user_model()
        perm = Permission.objects.get(codename="delete_imagingorder")
        test_user.user_permissions.add(perm)
        test_user = User.objects.get(pk=test_user.pk)
        authenticated_client.force_authenticate(user=test_user)

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        initial_count = AuditLog.objects.filter(action="imaging_order_delete").count()
        authenticated_client.delete(f"/api/imaging/orders/{order.order_number}/")
        new_count = AuditLog.objects.filter(action="imaging_order_delete").count()
        assert new_count == initial_count + 1

    def test_submit_order_audit_log(
        self, authenticated_client, sample_patient, sample_encounter, test_user, procedure
    ):
        """Submitting order should create audit log entry."""
        from hmis.apps.core.models import AuditLog

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        ImagingOrderItem.objects.create(order=order, procedure=procedure, unit_cost=procedure.cost)
        initial_count = AuditLog.objects.filter(action="imaging_order_submit").count()
        authenticated_client.post(f"/api/imaging/orders/{order.order_number}/submit/")
        new_count = AuditLog.objects.filter(action="imaging_order_submit").count()
        assert new_count == initial_count + 1

    def test_cancel_order_audit_log(
        self, authenticated_client, sample_patient, sample_encounter, test_user, procedure
    ):
        """Cancelling order should create audit log entry."""
        from hmis.apps.core.models import AuditLog

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        initial_count = AuditLog.objects.filter(action="imaging_order_cancel").count()
        authenticated_client.post(
            f"/api/imaging/orders/{order.order_number}/cancel/",
            {"reason": "Test"},
            format="json",
        )
        new_count = AuditLog.objects.filter(action="imaging_order_cancel").count()
        assert new_count == initial_count + 1

    def test_audit_log_includes_user(self, authenticated_client, order_data, test_user):
        """Audit log should include user who performed action."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        log = AuditLog.objects.filter(action="imaging_order_create").last()
        assert log is not None
        assert log.user == test_user

    def test_audit_log_includes_resource_id(self, authenticated_client, order_data):
        """Audit log should include resource ID."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post("/api/imaging/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        log = AuditLog.objects.filter(action="imaging_order_create").last()
        assert log is not None
        assert log.resource_id is not None
