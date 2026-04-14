"""
Tests for Shift / Duty Roster API and model.

Tests:
- Shift model lifecycle (create, start, complete, cancel)
- Shift API CRUD
- Shift lifecycle API actions (start, complete, cancel)
- Staff workload aggregation endpoint
- Domain event publishing for shifts
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_shift(db, sample_person_resource, sample_facility, sample_department):
    """Create a sample shift scoped to a facility.

    Uses tomorrow's date so the shift end-time is always in the future,
    preventing the end-time guard from blocking clock-in during tests.
    """
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=sample_person_resource,
        shift_date=date.today() + timedelta(days=1),
        start_time=time(8, 0),
        end_time=time(16, 0),
        shift_type="DAY",
        department=sample_department,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def shift_data(sample_person_resource, sample_department):
    """Valid shift creation data for API."""
    return {
        "staff_resource": sample_person_resource.id,
        "shift_date": str(date.today()),
        "start_time": "08:00",
        "end_time": "16:00",
        "shift_type": "DAY",
        "department": sample_department.id,
        "notes": "Regular shift",
    }


# =============================================================================
# Shift Model Tests
# =============================================================================


class TestShiftModel:
    """Tests for Shift model."""

    def test_shift_created_with_scheduled_status(self, sample_shift):
        """New shift should default to SCHEDULED status."""
        assert sample_shift.status == "SCHEDULED"

    def test_shift_duration_hours(self, sample_shift):
        """Should calculate correct duration in hours."""
        assert sample_shift.duration_hours == 8.0

    def test_start_shift(self, sample_shift):
        """Should transition from SCHEDULED to ACTIVE."""
        sample_shift.start_shift()

        assert sample_shift.status == "ACTIVE"
        assert sample_shift.started_at is not None

    def test_complete_shift(self, sample_shift):
        """Should transition from ACTIVE to COMPLETED."""
        sample_shift.start_shift()
        sample_shift.complete_shift()

        assert sample_shift.status == "COMPLETED"
        assert sample_shift.completed_at is not None

    def test_cancel_shift(self, sample_shift, test_user):
        """Should transition from SCHEDULED to CANCELLED."""
        sample_shift.cancel(user=test_user, reason="Staff unavailable")

        assert sample_shift.status == "CANCELLED"
        assert sample_shift.cancellation_reason == "Staff unavailable"
        assert sample_shift.cancelled_by == test_user

    def test_cannot_start_completed_shift(self, sample_shift):
        """Should not allow starting a completed shift."""
        sample_shift.start_shift()
        sample_shift.complete_shift()

        with pytest.raises(ValueError, match="Cannot transition"):
            sample_shift.start_shift()

    def test_cannot_cancel_active_shift(self, sample_shift, test_user):
        """Should not allow cancelling an active shift."""
        sample_shift.start_shift()

        with pytest.raises(ValueError, match="Cannot transition"):
            sample_shift.cancel(user=test_user, reason="Too late")

    def test_shift_str_representation(self, sample_shift):
        """Should have readable string representation."""
        result = str(sample_shift)
        assert "Dr. Test Doctor" in result
        assert "Day Shift" in result


# =============================================================================
# Shift API Tests
# =============================================================================


class TestShiftAPI:
    """Tests for Shift CRUD endpoints."""

    def test_list_shifts(self, authenticated_client, sample_shift):
        """Should list shifts."""
        response = authenticated_client.get("/api/scheduling/shifts/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_shifts_filter_by_type(self, authenticated_client, sample_shift):
        """Should filter shifts by type."""
        response = authenticated_client.get("/api/scheduling/shifts/?shift_type=DAY")

        assert response.status_code == status.HTTP_200_OK
        for shift in response.data["results"]:
            assert shift["shift_type"] == "DAY"

    def test_list_shifts_filter_by_status(self, authenticated_client, sample_shift):
        """Should filter shifts by status."""
        response = authenticated_client.get("/api/scheduling/shifts/?status=SCHEDULED")

        assert response.status_code == status.HTTP_200_OK
        for shift in response.data["results"]:
            assert shift["status"] == "SCHEDULED"

    def test_list_shifts_filter_by_date_range(self, authenticated_client, sample_shift):
        """Should filter shifts by date range."""
        target = str(sample_shift.shift_date)
        response = authenticated_client.get(
            f"/api/scheduling/shifts/?from_date={target}&to_date={target}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_shift(self, authenticated_client, shift_data, sample_department):
        """Should create a new shift."""
        response = authenticated_client.post("/api/scheduling/shifts/", shift_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "SCHEDULED"
        assert response.data["shift_type"] == "DAY"
        assert response.data["department"] == sample_department.id
        assert response.data["department_name"] == "General Outpatient"

    def test_create_shift_unauthenticated(self, api_client, shift_data):
        """Should reject unauthenticated request."""
        response = api_client.post("/api/scheduling/shifts/", shift_data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_shift(self, authenticated_client, sample_shift):
        """Should get shift detail."""
        response = authenticated_client.get(f"/api/scheduling/shifts/{sample_shift.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_shift.id
        assert response.data["shift_type_display"] == "Day Shift"
        assert response.data["status_display"] == "Scheduled"
        assert response.data["duration_hours"] is not None

    def test_update_shift(self, authenticated_client, sample_shift):
        """Should update shift details."""
        from hmis.apps.core.models import Department

        emergency_dept = Department.objects.create(name="Emergency", code="EMERG", is_active=True)
        response = authenticated_client.patch(
            f"/api/scheduling/shifts/{sample_shift.id}/",
            {"department": emergency_dept.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["department"] == emergency_dept.id
        assert response.data["department_name"] == "Emergency"

    def test_delete_shift(self, authenticated_client, sample_shift):
        """Should delete a shift."""
        response = authenticated_client.delete(f"/api/scheduling/shifts/{sample_shift.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT


# =============================================================================
# Shift Lifecycle API Tests
# =============================================================================


class TestShiftLifecycleAPI:
    """Tests for shift lifecycle actions (start, complete, cancel)."""

    def test_start_shift_api(self, authenticated_client, sample_shift):
        """Should start a scheduled shift via API."""
        response = authenticated_client.post(f"/api/scheduling/shifts/{sample_shift.id}/start/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"
        assert response.data["started_at"] is not None

    def test_complete_shift_api(self, authenticated_client, sample_shift):
        """Should complete an active shift via API."""
        sample_shift.start_shift()

        response = authenticated_client.post(f"/api/scheduling/shifts/{sample_shift.id}/complete/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["completed_at"] is not None

    def test_cancel_shift_api(self, authenticated_client, sample_shift):
        """Should cancel a scheduled shift via API."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{sample_shift.id}/cancel/",
            {"reason": "Staff called in sick"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"
        assert response.data["cancellation_reason"] == "Staff called in sick"

    def test_start_completed_shift_fails(self, authenticated_client, sample_shift):
        """Should fail to start a completed shift."""
        sample_shift.start_shift()
        sample_shift.complete_shift()

        response = authenticated_client.post(f"/api/scheduling/shifts/{sample_shift.id}/start/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_with_empty_body_succeeds(self, authenticated_client, sample_shift):
        """Should cancel with empty body (reason is optional)."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{sample_shift.id}/cancel/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"


# =============================================================================
# Staff Workload Aggregation Tests
# =============================================================================


class TestStaffWorkloadAPI:
    """Tests for staff workload aggregation endpoint."""

    def test_staff_workload_returns_data(self, authenticated_client, sample_shift):
        """Should return workload data for staff with shifts."""
        today = str(date.today())
        response = authenticated_client.get(
            f"/api/scheduling/shifts/staff-workload/?from_date={today}&to_date={today}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) >= 1

        workload = response.data[0]
        assert "resource_id" in workload
        assert "resource_name" in workload
        assert "shift_count" in workload
        assert "total_hours" in workload
        assert "appointment_count" in workload

    def test_staff_workload_correct_counts(
        self, authenticated_client, sample_shift, sample_person_resource, sample_facility
    ):
        """Should return correct shift counts."""
        from hmis.apps.scheduling.models import Shift

        tomorrow = sample_shift.shift_date  # sample_shift uses tomorrow

        # Create a second shift on the same day
        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=tomorrow,
            start_time=time(17, 0),
            end_time=time(23, 0),
            shift_type="NIGHT",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        target = str(tomorrow)
        response = authenticated_client.get(
            f"/api/scheduling/shifts/staff-workload/?from_date={target}&to_date={target}"
        )

        assert response.status_code == status.HTTP_200_OK
        # Find our resource
        our_entry = None
        for entry in response.data:
            if entry["resource_id"] == sample_person_resource.id:
                our_entry = entry
                break

        assert our_entry is not None
        assert our_entry["shift_count"] == 2
        assert our_entry["total_hours"] == 14.0  # 8 + 6 hours

    def test_staff_workload_empty_range(self, authenticated_client, sample_shift):
        """Should return staff with zero counts for date range with no shifts."""
        far_future = str(date.today() + timedelta(days=365))
        response = authenticated_client.get(
            f"/api/scheduling/shifts/staff-workload/?from_date={far_future}&to_date={far_future}"
        )

        assert response.status_code == status.HTTP_200_OK
        # Returns PERSON resources but with 0 counts
        for entry in response.data:
            assert entry["shift_count"] == 0
            assert entry["total_hours"] == 0.0


# =============================================================================
# Domain Event Tests
# =============================================================================


class TestShiftDomainEvents:
    """Tests for shift domain event publishing."""

    def test_shift_creation_publishes_event(
        self, db, mocker, sample_person_resource, sample_facility
    ):
        """Should publish SHIFT_CREATED event on creation."""
        from hmis.apps.scheduling.models import Shift

        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")

        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=date.today(),
            start_time=time(8, 0),
            end_time=time(16, 0),
            shift_type="DAY",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert (
            call_args[1]["event_type"] == "scheduling.shift.created"
            or call_args[0][0] == "scheduling.shift.created"
        )

    def test_shift_start_publishes_event(self, db, mocker, sample_shift):
        """Should publish SHIFT_STARTED event when started."""
        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")

        sample_shift.start_shift()

        mock_publish.assert_called()
        # Get the last call (the status change event)
        last_call = mock_publish.call_args
        event_type = last_call[1].get("event_type") or last_call[0][0]
        assert event_type == "scheduling.shift.started"

    def test_shift_completion_publishes_event(self, db, mocker, sample_shift):
        """Should publish SHIFT_COMPLETED event when completed."""
        sample_shift.start_shift()

        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")
        sample_shift.complete_shift()

        mock_publish.assert_called()
        last_call = mock_publish.call_args
        event_type = last_call[1].get("event_type") or last_call[0][0]
        assert event_type == "scheduling.shift.completed"


# =============================================================================
# Sync from Staff Tests
# =============================================================================


class TestSyncFromStaff:
    """Tests for POST /api/scheduling/resources/sync-from-staff/."""

    def test_sync_creates_resources_from_staff_profiles(
        self, authenticated_client, test_staff_profile, sample_facility
    ):
        """Should create PERSON resources for staff profiles without one."""
        from hmis.apps.scheduling.models import Resource

        # Ensure no resource exists yet for this staff
        assert not Resource.objects.filter(staff_profile=test_staff_profile).exists()

        response = authenticated_client.post("/api/scheduling/resources/sync-from-staff/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] >= 1

        # Verify resource was created and linked
        resource = Resource.objects.get(staff_profile=test_staff_profile)
        assert resource.resource_type == "PERSON"
        assert resource.is_active is True
        assert resource.facility == sample_facility
        assert resource.code.startswith("STAFF-")

    def test_sync_skips_staff_with_existing_resource(
        self, authenticated_client, test_staff_profile, sample_person_resource, sample_facility
    ):
        """Should not create duplicate resources for staff who already have one."""
        from hmis.apps.scheduling.models import Resource

        # Link the existing resource to the staff profile
        sample_person_resource.staff_profile = test_staff_profile
        sample_person_resource.save()

        response = authenticated_client.post("/api/scheduling/resources/sync-from-staff/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0

    def test_sync_idempotent(self, authenticated_client, test_staff_profile, sample_facility):
        """Calling sync twice should not create duplicate resources."""
        from hmis.apps.scheduling.models import Resource

        # First sync
        response1 = authenticated_client.post("/api/scheduling/resources/sync-from-staff/")
        assert response1.status_code == status.HTTP_200_OK
        count1 = response1.data["created"]

        # Second sync
        response2 = authenticated_client.post("/api/scheduling/resources/sync-from-staff/")
        assert response2.status_code == status.HTTP_200_OK
        assert response2.data["created"] == 0

        # Only one resource exists
        assert Resource.objects.filter(staff_profile=test_staff_profile).count() == 1

    def test_sync_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/scheduling/resources/sync-from-staff/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_sync_sets_metadata(self, authenticated_client, test_staff_profile, sample_facility):
        """Should populate metadata from staff profile."""
        from hmis.apps.scheduling.models import Resource

        response = authenticated_client.post("/api/scheduling/resources/sync-from-staff/")

        assert response.status_code == status.HTTP_200_OK
        resource = Resource.objects.get(staff_profile=test_staff_profile)
        assert resource.metadata.get("synced_from_staff") is True
        assert resource.metadata.get("employee_id") == test_staff_profile.employee_id


# =============================================================================
# Bulk Create Tests
# =============================================================================


class TestBulkCreateShifts:
    """Tests for POST /api/scheduling/shifts/bulk-create/."""

    def test_bulk_create_multiple_shifts(
        self, authenticated_client, sample_person_resource, sample_department
    ):
        """Should create multiple shifts in one request."""
        today = str(date.today())
        tomorrow = str(date.today() + timedelta(days=1))

        payload = {
            "shifts": [
                {
                    "staff_resource": sample_person_resource.id,
                    "shift_date": today,
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "shift_type": "DAY",
                    "department": sample_department.id,
                },
                {
                    "staff_resource": sample_person_resource.id,
                    "shift_date": tomorrow,
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "shift_type": "DAY",
                    "department": sample_department.id,
                },
            ]
        }

        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-create/", payload, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created"] == 2
        assert response.data["skipped"] == 0
        assert response.data["errors"] == 0
        assert len(response.data["created_ids"]) == 2

    def test_bulk_create_skips_duplicates(
        self, authenticated_client, sample_shift, sample_person_resource
    ):
        """Should skip shifts that already exist for same staff+date+type."""
        target = str(sample_shift.shift_date)
        payload = {
            "shifts": [
                {
                    "staff_resource": sample_person_resource.id,
                    "shift_date": target,
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "shift_type": "DAY",
                },
            ]
        }

        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-create/", payload, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0
        assert response.data["skipped"] == 1

    def test_bulk_create_reports_validation_errors(
        self, authenticated_client, sample_person_resource
    ):
        """Should report validation errors per item."""
        payload = {
            "shifts": [
                {
                    "staff_resource": sample_person_resource.id,
                    "shift_date": str(date.today()),
                    "start_time": "16:00",
                    "end_time": "08:00",  # Invalid: end before start
                    "shift_type": "DAY",
                },
            ]
        }

        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-create/", payload, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0
        assert response.data["errors"] == 1

    def test_bulk_create_empty_array_rejected(self, authenticated_client):
        """Should reject empty shifts array."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-create/", {"shifts": []}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_create_requires_auth(self, api_client, sample_person_resource):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/scheduling/shifts/bulk-create/",
            {"shifts": [{"staff_resource": sample_person_resource.id}]},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_bulk_create_max_200(self, authenticated_client, sample_person_resource):
        """Should reject requests with more than 200 shifts."""
        shifts = [
            {
                "staff_resource": sample_person_resource.id,
                "shift_date": str(date.today() + timedelta(days=i % 365)),
                "start_time": "08:00",
                "end_time": "16:00",
                "shift_type": "DAY",
            }
            for i in range(201)
        ]

        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-create/", {"shifts": shifts}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
