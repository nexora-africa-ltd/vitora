"""
Tests for Scheduling Settings and Staff Constraints API.

Tests:
- SchedulingSettings get-or-create via /current/ endpoint
- SchedulingSettings update (PATCH)
- StaffConstraint CRUD (create, list, update, delete)
- StaffConstraint filtering by staff_resource and is_active
- New off/leave shift types accepted by the Shift model
"""

from datetime import date, time

import pytest  # type: ignore
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def scheduling_settings(db, sample_facility):
    """Create sample scheduling settings."""
    from hmis.apps.scheduling.models import SchedulingSettings

    return SchedulingSettings.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        max_hours_per_week=48,
        max_consecutive_days=6,
        min_rest_hours=11,
        max_night_shifts_per_week=4,
        overtime_threshold_hours=40.0,
        enforce_constraints=True,
    )


@pytest.fixture
def staff_constraint(db, sample_person_resource, sample_facility):
    """Create a sample staff constraint."""
    from hmis.apps.scheduling.models import StaffConstraint

    return StaffConstraint.objects.create(
        staff_resource=sample_person_resource,
        constraint_type="NO_NIGHTS",
        reason="Medical restriction",
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# =============================================================================
# Scheduling Settings Tests
# =============================================================================


class TestSchedulingSettings:
    """Tests for the scheduling settings API."""

    def test_get_current_creates_default(self, authenticated_client, sample_facility):
        """GET /current/ should create settings if none exist."""
        response = authenticated_client.get("/api/scheduling/settings/current/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["max_hours_per_week"] == 48
        assert response.data["enforce_constraints"] is True

    def test_get_current_returns_existing(self, authenticated_client, scheduling_settings):
        """GET /current/ should return existing settings."""
        response = authenticated_client.get("/api/scheduling/settings/current/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == scheduling_settings.id
        assert response.data["max_hours_per_week"] == 48

    def test_update_settings(self, authenticated_client, scheduling_settings):
        """PATCH should update settings fields."""
        response = authenticated_client.patch(
            f"/api/scheduling/settings/{scheduling_settings.id}/",
            {"max_hours_per_week": 36, "max_night_shifts_per_week": 3},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["max_hours_per_week"] == 36
        assert response.data["max_night_shifts_per_week"] == 3

    def test_update_enforce_constraints(self, authenticated_client, scheduling_settings):
        """PATCH should toggle enforce_constraints."""
        response = authenticated_client.patch(
            f"/api/scheduling/settings/{scheduling_settings.id}/",
            {"enforce_constraints": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["enforce_constraints"] is False

    def test_default_active_shift_types_empty(self, authenticated_client, sample_facility):
        """GET /current/ should return empty active_shift_types by default."""
        response = authenticated_client.get("/api/scheduling/settings/current/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["active_shift_types"] == []

    def test_update_active_shift_types(self, authenticated_client, scheduling_settings):
        """PATCH should update active_shift_types."""
        response = authenticated_client.patch(
            f"/api/scheduling/settings/{scheduling_settings.id}/",
            {"active_shift_types": ["MORNING", "AFTERNOON", "NIGHT"]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["active_shift_types"] == ["MORNING", "AFTERNOON", "NIGHT"]

    def test_active_shift_types_persists(self, authenticated_client, scheduling_settings):
        """active_shift_types should persist after update and retrieval."""
        types = ["DAY", "NIGHT"]
        authenticated_client.patch(
            f"/api/scheduling/settings/{scheduling_settings.id}/",
            {"active_shift_types": types},
            format="json",
        )
        response = authenticated_client.get("/api/scheduling/settings/current/")
        assert response.data["active_shift_types"] == types

    def test_unauthenticated_rejected(self, api_client):
        """Unauthenticated request should be rejected."""
        response = api_client.get("/api/scheduling/settings/current/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Staff Constraint Tests
# =============================================================================


class TestStaffConstraints:
    """Tests for the staff constraints API."""

    def test_create_constraint(self, authenticated_client, sample_person_resource, sample_facility):
        """POST should create a staff constraint."""
        response = authenticated_client.post(
            "/api/scheduling/constraints/",
            {
                "staff_resource": sample_person_resource.id,
                "constraint_type": "NO_NIGHTS",
                "reason": "Cannot work nights",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["constraint_type"] == "NO_NIGHTS"
        assert response.data["staff_resource_name"] == sample_person_resource.name

    def test_list_constraints(self, authenticated_client, staff_constraint):
        """GET should list constraints."""
        response = authenticated_client.get("/api/scheduling/constraints/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_filter_by_staff_resource(self, authenticated_client, staff_constraint, sample_person_resource):
        """GET ?staff_resource=X should filter by staff."""
        response = authenticated_client.get(
            f"/api/scheduling/constraints/?staff_resource={sample_person_resource.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert all(
            c["staff_resource"] == sample_person_resource.id
            for c in response.data["results"]
        )

    def test_filter_by_is_active(self, authenticated_client, staff_constraint):
        """GET ?is_active=true should filter active constraints."""
        response = authenticated_client.get("/api/scheduling/constraints/?is_active=true")
        assert response.status_code == status.HTTP_200_OK
        assert all(c["is_active"] for c in response.data["results"])

    def test_update_constraint(self, authenticated_client, staff_constraint):
        """PATCH should update constraint fields."""
        response = authenticated_client.patch(
            f"/api/scheduling/constraints/{staff_constraint.id}/",
            {"is_active": False, "reason": "No longer needed"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is False
        assert response.data["reason"] == "No longer needed"

    def test_delete_constraint(self, authenticated_client, staff_constraint):
        """DELETE should remove constraint."""
        response = authenticated_client.delete(
            f"/api/scheduling/constraints/{staff_constraint.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_create_max_hours_constraint_with_value(
        self, authenticated_client, sample_person_resource, sample_facility
    ):
        """MAX_HOURS constraint should accept a value dict."""
        response = authenticated_client.post(
            "/api/scheduling/constraints/",
            {
                "staff_resource": sample_person_resource.id,
                "constraint_type": "MAX_HOURS",
                "value": {"max_hours": 36},
                "reason": "Part-time staff",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["value"] == {"max_hours": 36}

    def test_unauthenticated_rejected(self, api_client):
        """Unauthenticated request should be rejected."""
        response = api_client.get("/api/scheduling/constraints/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# New Shift Type Tests
# =============================================================================


class TestOffLeaveShiftTypes:
    """Tests that new off/leave shift types are accepted."""

    @pytest.mark.parametrize(
        "shift_type",
        ["DAY_OFF", "NIGHT_OFF", "OFF", "AFTERNOON_OFF", "LEAVE", "SICK_LEAVE", "REST"],
    )
    def test_create_off_shift_via_api(
        self, authenticated_client, sample_person_resource, shift_type
    ):
        """POST should accept new off/leave shift types."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/",
            {
                "staff_resource": sample_person_resource.id,
                "shift_date": str(date.today()),
                "start_time": "00:00",
                "end_time": "23:59",
                "shift_type": shift_type,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["shift_type"] == shift_type

    def test_create_off_shift_model(self, db, sample_person_resource, sample_facility):
        """Shift model should accept off/leave types."""
        from hmis.apps.scheduling.models import Shift

        shift = Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=date.today(),
            start_time=time(0, 0),
            end_time=time(23, 59),
            shift_type="LEAVE",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert shift.get_shift_type_display() == "Leave"
