"""Tests for applying pulled cloud sync entries on a hub."""

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


class TestSyncMaterializer:
    """Tests for local application of cloud-to-hub entries."""

    def test_materialize_facility_update(self, sample_facility):
        """A downward Facility update should change the local hub copy."""
        from hmis.apps.core.sync_materializer import materialize_entry

        sample_facility.has_laboratory = False
        sample_facility.save(update_fields=["has_laboratory"])

        result = materialize_entry(
            {
                "table": "core.Facility",
                "operation": "UPDATE",
                "record_id": sample_facility.id,
                "data": {"id": sample_facility.id, "has_laboratory": True},
            }
        )

        assert result == {"success": True}
        sample_facility.refresh_from_db()
        assert sample_facility.has_laboratory is True

    def test_materialize_rejects_unregistered_model(self):
        """Unknown models should be rejected without applying anything."""
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "unknown.Model",
                "operation": "UPDATE",
                "record_id": 1,
                "data": {"id": 1},
            }
        )

        assert result["success"] is False
        assert "Unknown table" in result["error"]
