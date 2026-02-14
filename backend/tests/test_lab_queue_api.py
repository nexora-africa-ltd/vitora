"""
Tests for Lab Queue API endpoints.

TDD: Sprint 1.5-1.6 Track B - Lab Queue Management
"""

from datetime import timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabQueue, TestCatalog

User = get_user_model()


@pytest.fixture
def test_catalog(db):
    """Create a test catalog entry."""
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
        turnaround_hours=24,
    )


@pytest.fixture
def lab_technician(db):
    """Create a lab technician user."""
    return User.objects.create_user(
        username="labtechnician",
        email="labtech@example.com",
        password="testpass123",
        first_name="Lab",
        last_name="Technician",
    )


@pytest.fixture
def sample_lab_order(db, sample_patient, sample_encounter, test_user, test_catalog):
    """Create a lab order for testing."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        priority="ROUTINE",
        status="ORDERED",
    )
    LabOrderItem.objects.create(
        lab_order=order,
        test=test_catalog,
        unit_cost=test_catalog.cost,
    )
    return order


@pytest.fixture
def sample_lab_queue(db, sample_lab_order):
    """Get or create a lab queue entry for the lab order."""
    # Signal auto-creates the queue, so just fetch it
    # If not created (e.g., signal not triggered), create manually
    queue = LabQueue.objects.filter(lab_order=sample_lab_order).first()
    if queue:
        return queue
    return LabQueue.objects.create(
        lab_order=sample_lab_order,
        priority="ROUTINE",
        queue_status="PENDING",
        sample_type="BLOOD",
    )


class TestLabQueueList:
    """Tests for listing lab queue entries."""

    def test_list_lab_queue_authenticated(self, authenticated_client, sample_lab_queue):
        """Should list lab queue entries for authenticated users."""
        response = authenticated_client.get("/api/lab/queue/")

        assert response.status_code == status.HTTP_200_OK
        # Handle paginated or non-paginated response
        data = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        assert len(data) >= 1
        assert data[0]["queue_number"] == sample_lab_queue.queue_number

    def test_list_lab_queue_unauthenticated(self, api_client, sample_lab_queue):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/lab/queue/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_status(self, authenticated_client, sample_lab_queue):
        """Should filter queue by status."""
        response = authenticated_client.get("/api/lab/queue/?queue_status=PENDING")

        assert response.status_code == status.HTTP_200_OK
        data = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        assert len(data) >= 1
        assert all(item["queue_status"] == "PENDING" for item in data)

    def test_filter_by_priority(self, authenticated_client, sample_lab_queue):
        """Should filter queue by priority."""
        response = authenticated_client.get("/api/lab/queue/?priority=ROUTINE")

        assert response.status_code == status.HTTP_200_OK
        data = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        assert len(data) >= 1
        assert all(item["priority"] == "ROUTINE" for item in data)


class TestLabQueueDetail:
    """Tests for retrieving a single lab queue entry."""

    def test_get_lab_queue_detail(self, authenticated_client, sample_lab_queue):
        """Should retrieve lab queue entry by queue number."""
        response = authenticated_client.get(f"/api/lab/queue/{sample_lab_queue.queue_number}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_number"] == sample_lab_queue.queue_number
        assert response.data["queue_status"] == "PENDING"
        assert response.data["priority"] == "ROUTINE"

    def test_get_nonexistent_queue(self, authenticated_client):
        """Should return 404 for nonexistent queue entry."""
        response = authenticated_client.get("/api/lab/queue/QUE-99999999-0001/")

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestLabQueueCollectSample:
    """Tests for sample collection action."""

    def test_collect_sample_success(self, authenticated_client, sample_lab_queue):
        """Should mark sample as collected."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/collect/",
            {"sample_id": "TUBE-001"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_status"] == "COLLECTED"
        assert response.data["sample_id"] == "TUBE-001"

        # Verify database
        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.queue_status == "COLLECTED"
        assert sample_lab_queue.sample_id == "TUBE-001"
        assert sample_lab_queue.specimen is not None
        assert sample_lab_queue.specimen.barcode == "TUBE-001"

    def test_collect_sample_already_collected(self, authenticated_client, sample_lab_queue):
        """Should handle already collected samples."""
        sample_lab_queue.queue_status = "COLLECTED"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/collect/",
            {"sample_id": "TUBE-002"},
        )

        # Should still work (idempotent) or return appropriate error
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]


class TestLabQueueAssign:
    """Tests for technician assignment action."""

    def test_assign_technician(self, authenticated_client, sample_lab_queue, test_user):
        """Should assign technician to queue entry."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/assign/",
            {"technician_id": test_user.id},
        )

        assert response.status_code == status.HTTP_200_OK

        # Verify database
        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.assigned_technician == test_user


class TestLabQueueStartProcessing:
    """Tests for starting processing action."""

    def test_start_processing(self, authenticated_client, sample_lab_queue):
        """Should mark queue entry as processing."""
        # First collect the sample
        sample_lab_queue.queue_status = "COLLECTED"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/start-processing/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_status"] == "PROCESSING"

        # Verify database
        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.queue_status == "PROCESSING"
        assert sample_lab_queue.processing_started_at is not None


class TestLabQueueSubmitForReview:
    """Tests for submitting results for review."""

    def test_submit_for_review(self, authenticated_client, sample_lab_queue):
        """Should submit results for review."""
        # First set to processing
        sample_lab_queue.queue_status = "PROCESSING"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/submit-review/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_status"] == "REVIEW"

        # Verify database
        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.queue_status == "REVIEW"


class TestLabQueueReleaseResults:
    """Tests for releasing results."""

    def test_release_results(self, authenticated_client, sample_lab_queue):
        """Should release results after review."""
        # First set to review
        sample_lab_queue.queue_status = "REVIEW"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/release/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_status"] == "RELEASED"

        # Verify database
        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.queue_status == "RELEASED"
        assert sample_lab_queue.released_at is not None


class TestLabQueueStatistics:
    """Tests for queue statistics endpoint."""

    def test_get_queue_stats(self, authenticated_client, sample_lab_queue):
        """Should return queue statistics."""
        response = authenticated_client.get("/api/lab/queue/stats/")

        assert response.status_code == status.HTTP_200_OK
        assert "pending" in response.data
        assert "collected" in response.data
        assert "processing" in response.data


# ============================================================================
# NEW TESTS: Sample Collection with ID
# ============================================================================


class TestLabQueueSampleIdCollection:
    """Tests for sample ID collection functionality."""

    def test_collect_sample_with_barcode(self, authenticated_client, sample_lab_queue):
        """Should collect sample with barcode ID."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/collect/",
            {"sample_id": "BAR-20260106-001"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["sample_id"] == "BAR-20260106-001"
        assert response.data["collected_by_name"] is not None
        assert response.data["collected_at"] is not None

    def test_collect_sample_without_id(self, authenticated_client, sample_lab_queue):
        """Should allow collection without sample ID (optional)."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/collect/",
            {},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_status"] == "COLLECTED"

    def test_collect_sample_records_collector(
        self, authenticated_client, sample_lab_queue, test_user
    ):
        """Should record who collected the sample."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/collect/",
            {"sample_id": "TUBE-001"},
        )

        assert response.status_code == status.HTTP_200_OK

        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.collected_by == test_user


# ============================================================================
# NEW TESTS: Sample Rejection
# ============================================================================


class TestLabQueueRejectSample:
    """Tests for sample rejection functionality."""

    def test_reject_sample_with_reason(self, authenticated_client, sample_lab_queue):
        """Should reject sample with reason."""
        sample_lab_queue.queue_status = "COLLECTED"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/reject/",
            {"reason": "Hemolyzed sample - cannot process"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["rejection_reason"] == "Hemolyzed sample - cannot process"

        sample_lab_queue.refresh_from_db()
        assert sample_lab_queue.rejection_reason == "Hemolyzed sample - cannot process"

    def test_reject_sample_requires_reason(self, authenticated_client, sample_lab_queue):
        """Should require rejection reason."""
        sample_lab_queue.queue_status = "COLLECTED"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/reject/",
            {},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reject_sample_from_pending(self, authenticated_client, sample_lab_queue):
        """Should allow rejecting from PENDING status."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/reject/",
            {"reason": "Patient refused blood draw"},
        )

        assert response.status_code == status.HTTP_200_OK

    def test_reject_sample_from_processing(self, authenticated_client, sample_lab_queue):
        """Should allow rejecting from PROCESSING status."""
        sample_lab_queue.queue_status = "PROCESSING"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/reject/",
            {"reason": "Equipment malfunction - sample contaminated"},
        )

        assert response.status_code == status.HTTP_200_OK

    def test_cannot_reject_released_sample(self, authenticated_client, sample_lab_queue):
        """Should not allow rejecting released samples."""
        sample_lab_queue.queue_status = "RELEASED"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/reject/",
            {"reason": "Late rejection attempt"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# NEW TESTS: Technician Notes
# ============================================================================


class TestLabQueueTechnicianNotes:
    """Tests for technician notes functionality."""

    def test_add_technician_notes(self, authenticated_client, sample_lab_queue):
        """Should add technician notes."""
        sample_lab_queue.queue_status = "PROCESSING"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/notes/",
            {"notes": "Sample appears slightly lipemic. Ran centrifuge at 3000 RPM for 10 min."},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "lipemic" in response.data["technician_notes"]

    def test_update_technician_notes(self, authenticated_client, sample_lab_queue):
        """Should update existing notes."""
        sample_lab_queue.queue_status = "PROCESSING"
        sample_lab_queue.technician_notes = "Initial note"
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/notes/",
            {"notes": "Updated note with more details"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["technician_notes"] == "Updated note with more details"

    def test_append_technician_notes(self, authenticated_client, sample_lab_queue):
        """Should append to existing notes."""
        sample_lab_queue.queue_status = "PROCESSING"
        sample_lab_queue.technician_notes = "First observation."
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/notes/",
            {"notes": "Second observation.", "append": True},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "First observation." in response.data["technician_notes"]
        assert "Second observation." in response.data["technician_notes"]


# ============================================================================
# NEW TESTS: Turnaround Time (TAT)
# ============================================================================


class TestLabQueueTurnaroundTime:
    """Tests for turnaround time calculations."""

    def test_tat_included_in_response(self, authenticated_client, sample_lab_queue):
        """Should include TAT info in queue response."""
        response = authenticated_client.get(f"/api/lab/queue/{sample_lab_queue.queue_number}/")

        assert response.status_code == status.HTTP_200_OK
        assert "expected_tat_hours" in response.data
        assert "elapsed_hours" in response.data

    def test_tat_calculation_for_released(self, authenticated_client, sample_lab_queue):
        """Should calculate actual TAT for released samples."""
        # Simulate released sample
        sample_lab_queue.queue_status = "RELEASED"
        sample_lab_queue.released_at = timezone.now()
        sample_lab_queue.save()

        response = authenticated_client.get(f"/api/lab/queue/{sample_lab_queue.queue_number}/")

        assert response.status_code == status.HTTP_200_OK
        assert "actual_tat_hours" in response.data

    def test_tat_overdue_flag(self, authenticated_client, sample_lab_queue, test_catalog):
        """Should flag overdue samples."""
        # Set created_at to 48 hours ago (overdue for 24-hour TAT)
        sample_lab_queue.created_at = timezone.now() - timedelta(hours=48)
        sample_lab_queue.save(update_fields=["created_at"])

        response = authenticated_client.get(f"/api/lab/queue/{sample_lab_queue.queue_number}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_overdue"] is True


# ============================================================================
# NEW TESTS: Barcode Lookup
# ============================================================================


class TestLabQueueBarcodeLookup:
    """Tests for barcode lookup functionality."""

    def test_lookup_by_sample_id(self, authenticated_client, sample_lab_queue):
        """Should find queue entry by sample barcode."""
        sample_lab_queue.sample_id = "BAR-20260106-001"
        sample_lab_queue.queue_status = "COLLECTED"
        sample_lab_queue.save()

        response = authenticated_client.get("/api/lab/queue/lookup/?barcode=BAR-20260106-001")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_number"] == sample_lab_queue.queue_number

    def test_lookup_by_queue_number(self, authenticated_client, sample_lab_queue):
        """Should find queue entry by queue number barcode."""
        response = authenticated_client.get(
            f"/api/lab/queue/lookup/?barcode={sample_lab_queue.queue_number}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queue_number"] == sample_lab_queue.queue_number

    def test_lookup_not_found(self, authenticated_client):
        """Should return 404 for unknown barcode."""
        response = authenticated_client.get("/api/lab/queue/lookup/?barcode=UNKNOWN-123")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_lookup_requires_barcode_param(self, authenticated_client):
        """Should require barcode parameter."""
        response = authenticated_client.get("/api/lab/queue/lookup/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# NEW TESTS: Technician Assignment
# ============================================================================


class TestLabQueueTechnicianAssignment:
    """Tests for technician assignment functionality."""

    def test_assign_technician_success(
        self, authenticated_client, sample_lab_queue, lab_technician
    ):
        """Should assign technician to queue entry."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/assign/",
            {"technician_id": lab_technician.id},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_technician"] == lab_technician.id
        assert response.data["assigned_technician_name"] == "Lab Technician"

    def test_reassign_technician(
        self, authenticated_client, sample_lab_queue, lab_technician, test_user
    ):
        """Should allow reassigning to different technician."""
        sample_lab_queue.assigned_technician = test_user
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/assign/",
            {"technician_id": lab_technician.id},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_technician"] == lab_technician.id

    def test_unassign_technician(self, authenticated_client, sample_lab_queue, lab_technician):
        """Should allow unassigning technician."""
        sample_lab_queue.assigned_technician = lab_technician
        sample_lab_queue.save()

        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/assign/",
            {"technician_id": None},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_technician"] is None

    def test_assign_invalid_technician(self, authenticated_client, sample_lab_queue):
        """Should reject invalid technician ID."""
        response = authenticated_client.post(
            f"/api/lab/queue/{sample_lab_queue.queue_number}/assign/",
            {"technician_id": 99999},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_list_available_technicians(self, authenticated_client, lab_technician):
        """Should list available lab technicians."""
        response = authenticated_client.get("/api/lab/queue/technicians/")

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) >= 1
        # Check structure has expected fields
        assert "id" in response.data[0]
        assert "username" in response.data[0]
        assert "full_name" in response.data[0]


class TestLabQueueAutoCreation:
    """Tests for automatic LabQueue creation via signals."""

    def test_queue_created_for_in_house_order(
        self, db, sample_patient, sample_encounter, test_user, test_catalog
    ):
        """Should auto-create LabQueue when in-house order is created."""
        # Create a lab order - queue should be auto-created
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            priority="ROUTINE",
            status="ORDERED",
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog,
            unit_cost=test_catalog.cost,
        )

        # Refresh to trigger signal and check queue exists
        order.refresh_from_db()

        assert hasattr(order, "queue_entry")
        queue = order.queue_entry
        assert queue.queue_status == "PENDING"
        assert queue.priority == "ROUTINE"
        assert queue.sample_type == test_catalog.specimen_type

    def test_no_queue_for_external_order(
        self, db, sample_patient, sample_encounter, test_user, test_catalog
    ):
        """Should NOT create LabQueue for external lab orders."""
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="EXTERNAL",
            external_lab="Lancet Labs",
            priority="ROUTINE",
            status="ORDERED",
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog,
            unit_cost=test_catalog.cost,
        )

        # Queue should NOT exist for external orders
        assert not LabQueue.objects.filter(lab_order=order).exists()


class TestLabOrderQueueSync:
    """Tests for LabOrder and LabQueue synchronization."""

    def test_order_collect_specimen_updates_queue(
        self, db, sample_patient, sample_encounter, test_user, test_catalog
    ):
        """When collecting specimen via LabOrder, LabQueue should also be updated."""
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            priority="ROUTINE",
            status="ORDERED",
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog,
            unit_cost=test_catalog.cost,
        )

        # Get the auto-created queue
        queue = LabQueue.objects.get(lab_order=order)
        assert queue.queue_status == "PENDING"

        # Collect specimen via LabOrder
        order.mark_specimen_collected(test_user)

        # LabQueue should also be updated (SSOT)
        queue.refresh_from_db()
        assert queue.queue_status == "COLLECTED"
        assert queue.collected_by == test_user
        assert queue.collected_at is not None
