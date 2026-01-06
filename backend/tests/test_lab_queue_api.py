"""
Tests for Lab Queue API endpoints.

TDD: Sprint 1.5-1.6 Track B - Lab Queue Management
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.laboratory.models import (
    LabOrder,
    LabOrderItem,
    LabQueue,
    TestCatalog,
)
from hmis.apps.encounters.models import Encounter

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
    """Create a lab queue entry."""
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
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
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
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        assert len(data) >= 1
        assert all(item["queue_status"] == "PENDING" for item in data)

    def test_filter_by_priority(self, authenticated_client, sample_lab_queue):
        """Should filter queue by priority."""
        response = authenticated_client.get("/api/lab/queue/?priority=ROUTINE")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
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
        assert "review" in response.data
        assert "released" in response.data
