"""
Tests for Shift Type Configuration API.

Tests:
- ShiftTypeConfig CRUD (create, list, retrieve, update, delete)
- Unique constraint (facility + shift_type)
- Overnight shift type validation
- Defaults endpoint (active configs mapping)
- Bulk upsert endpoint
- Filtering by is_active
"""

from datetime import time

import pytest  # type: ignore
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def shift_type_config(db, sample_facility):
    """Create a sample shift type config."""
    from hmis.apps.scheduling.models import ShiftTypeConfig

    return ShiftTypeConfig.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        shift_type="DAY",
        label="Day Shift",
        start_time=time(7, 0),
        end_time=time(15, 0),
        color="#4CAF50",
        is_active=True,
    )


@pytest.fixture
def night_shift_config(db, sample_facility):
    """Create a night shift config (overnight)."""
    from hmis.apps.scheduling.models import ShiftTypeConfig

    return ShiftTypeConfig.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        shift_type="NIGHT",
        label="Night Shift",
        start_time=time(19, 0),
        end_time=time(7, 0),
        color="#9C27B0",
        is_active=True,
    )


# =============================================================================
# ShiftTypeConfig CRUD Tests
# =============================================================================


class TestShiftTypeConfigCRUD:
    """Tests for shift type configuration CRUD."""

    def test_create_shift_type_config(self, authenticated_client, sample_facility):
        """POST should create a shift type config."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/",
            {
                "shift_type": "MORNING",
                "label": "Early Morning",
                "start_time": "06:00",
                "end_time": "14:00",
                "color": "#FF9800",
                "is_active": True,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["shift_type"] == "MORNING"
        assert response.data["label"] == "Early Morning"
        assert response.data["display_label"] == "Early Morning"
        assert response.data["start_time"] == "06:00:00"
        assert response.data["end_time"] == "14:00:00"
        assert response.data["color"] == "#FF9800"
        assert response.data["is_active"] is True

    def test_create_without_label_uses_shift_type_display(
        self, authenticated_client, sample_facility
    ):
        """POST without label should use shift type display as display_label."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/",
            {
                "shift_type": "AFTERNOON",
                "start_time": "14:00",
                "end_time": "22:00",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["label"] == ""
        assert response.data["display_label"] == "Afternoon Shift"

    def test_list_shift_type_configs(self, authenticated_client, shift_type_config):
        """GET should list configs for the facility."""
        response = authenticated_client.get("/api/scheduling/shift-type-configs/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert results[0]["shift_type"] == "DAY"

    def test_retrieve_shift_type_config(self, authenticated_client, shift_type_config):
        """GET /{id}/ should retrieve a specific config."""
        response = authenticated_client.get(
            f"/api/scheduling/shift-type-configs/{shift_type_config.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["shift_type"] == "DAY"
        assert response.data["start_time"] == "07:00:00"
        assert response.data["end_time"] == "15:00:00"

    def test_update_shift_type_config(self, authenticated_client, shift_type_config):
        """PATCH should update shift type config fields."""
        response = authenticated_client.patch(
            f"/api/scheduling/shift-type-configs/{shift_type_config.id}/",
            {"start_time": "08:00", "end_time": "16:00", "label": "Standard Day"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["start_time"] == "08:00:00"
        assert response.data["end_time"] == "16:00:00"
        assert response.data["label"] == "Standard Day"

    def test_delete_shift_type_config(self, authenticated_client, shift_type_config):
        """DELETE should remove a shift type config."""
        response = authenticated_client.delete(
            f"/api/scheduling/shift-type-configs/{shift_type_config.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_deactivate_shift_type_config(self, authenticated_client, shift_type_config):
        """PATCH is_active=False should deactivate the config."""
        response = authenticated_client.patch(
            f"/api/scheduling/shift-type-configs/{shift_type_config.id}/",
            {"is_active": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is False


# =============================================================================
# Validation Tests
# =============================================================================


class TestShiftTypeConfigValidation:
    """Tests for shift type configuration validation."""

    def test_duplicate_shift_type_same_facility_rejected(
        self, authenticated_client, shift_type_config
    ):
        """POST duplicate shift_type for same facility should fail."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/",
            {
                "shift_type": "DAY",
                "start_time": "09:00",
                "end_time": "17:00",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_end_time_before_start_time_rejected_for_day_shift(
        self, authenticated_client, sample_facility
    ):
        """Non-overnight shift types should reject end_time < start_time."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/",
            {
                "shift_type": "DAY",
                "start_time": "15:00",
                "end_time": "07:00",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "end_time" in str(response.data)

    def test_overnight_shift_allows_end_before_start(self, authenticated_client, sample_facility):
        """NIGHT shift type should allow end_time < start_time (crosses midnight)."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/",
            {
                "shift_type": "NIGHT",
                "start_time": "19:00",
                "end_time": "07:00",
                "label": "Night Duty",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["start_time"] == "19:00:00"
        assert response.data["end_time"] == "07:00:00"

    def test_night_off_allows_end_before_start(self, authenticated_client, sample_facility):
        """NIGHT_OFF should also allow end_time < start_time."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/",
            {
                "shift_type": "NIGHT_OFF",
                "start_time": "20:00",
                "end_time": "06:00",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED


# =============================================================================
# Defaults Endpoint Tests
# =============================================================================


class TestShiftTypeConfigDefaults:
    """Tests for the defaults endpoint."""

    def test_defaults_returns_active_configs(
        self, authenticated_client, shift_type_config, night_shift_config
    ):
        """GET /defaults/ should return mapping of shift_type -> times."""
        response = authenticated_client.get("/api/scheduling/shift-type-configs/defaults/")
        assert response.status_code == status.HTTP_200_OK
        assert "DAY" in response.data
        assert response.data["DAY"]["start_time"] == "07:00"
        assert response.data["DAY"]["end_time"] == "15:00"
        assert response.data["DAY"]["label"] == "Day Shift"
        assert response.data["DAY"]["color"] == "#4CAF50"
        assert "NIGHT" in response.data
        assert response.data["NIGHT"]["start_time"] == "19:00"
        assert response.data["NIGHT"]["end_time"] == "07:00"

    def test_defaults_excludes_inactive(
        self, authenticated_client, shift_type_config, sample_facility
    ):
        """GET /defaults/ should exclude inactive configs."""
        from hmis.apps.scheduling.models import ShiftTypeConfig

        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="ON_CALL",
            start_time=time(0, 0),
            end_time=time(23, 59),
            is_active=False,
        )
        response = authenticated_client.get("/api/scheduling/shift-type-configs/defaults/")
        assert response.status_code == status.HTTP_200_OK
        assert "ON_CALL" not in response.data
        assert "DAY" in response.data

    def test_defaults_empty_when_no_configs(self, authenticated_client, sample_facility):
        """GET /defaults/ should return empty dict when no configs exist."""
        response = authenticated_client.get("/api/scheduling/shift-type-configs/defaults/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {}


# =============================================================================
# Bulk Upsert Tests
# =============================================================================


class TestShiftTypeConfigBulkUpsert:
    """Tests for bulk upsert endpoint."""

    def test_bulk_create_multiple_configs(self, authenticated_client, sample_facility):
        """POST /bulk_upsert/ should create multiple configs at once."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/bulk_upsert/",
            [
                {"shift_type": "MORNING", "start_time": "06:00", "end_time": "14:00"},
                {"shift_type": "AFTERNOON", "start_time": "14:00", "end_time": "22:00"},
                {"shift_type": "NIGHT", "start_time": "22:00", "end_time": "06:00"},
            ],
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created_or_updated"] == 3
        assert len(response.data["results"]) == 3

    def test_bulk_upsert_updates_existing(self, authenticated_client, shift_type_config):
        """POST /bulk_upsert/ should update existing config matched by shift_type."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/bulk_upsert/",
            [
                {"shift_type": "DAY", "start_time": "08:00", "end_time": "16:00"},
            ],
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created_or_updated"] == 1
        assert response.data["results"][0]["start_time"] == "08:00:00"

    def test_bulk_upsert_rejects_non_list(self, authenticated_client, sample_facility):
        """POST /bulk_upsert/ should reject non-list body."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/bulk_upsert/",
            {"shift_type": "DAY", "start_time": "08:00", "end_time": "16:00"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_upsert_rejects_missing_shift_type(self, authenticated_client, sample_facility):
        """POST /bulk_upsert/ should report error for items missing shift_type."""
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/bulk_upsert/",
            [
                {"start_time": "06:00", "end_time": "14:00"},
            ],
            format="json",
        )
        # Returns 207 with errors
        assert response.status_code == status.HTTP_207_MULTI_STATUS
        assert len(response.data["errors"]) == 1

    def test_bulk_upsert_max_20_limit(self, authenticated_client, sample_facility):
        """POST /bulk_upsert/ should reject more than 20 items."""
        items = [{"shift_type": "DAY", "start_time": "08:00", "end_time": "16:00"}] * 21
        response = authenticated_client.post(
            "/api/scheduling/shift-type-configs/bulk_upsert/",
            items,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
