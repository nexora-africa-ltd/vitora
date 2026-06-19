"""Tests for applying pulled cloud sync entries on a hub."""

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


class TestSyncMaterializer:
    """Tests for local application of cloud-to-hub entries."""

    def test_materialize_one_to_one_fk_from_cloud(self, sample_facility):
        """One-to-one relation values should materialize through *_id fields."""
        from hmis.apps.ai.models import TibaBotFacilityKey
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "ai.TibaBotFacilityKey",
                "operation": "CREATE",
                "record_id": 77,
                "data": {
                    "id": 77,
                    "facility": sample_facility.pk,
                    "api_key": "tb_test_full_pull",
                    "key_hash": "hash77",
                    "tibabot_facility_id": "facility-77",
                    "scopes": ["chat", "clinical"],
                },
            }
        )

        assert result == {"success": True}
        key = TibaBotFacilityKey.objects.get(pk=77)
        assert key.facility == sample_facility
        assert key.api_key == "tb_test_full_pull"

    def test_materialize_user_skips_duplicate_email_on_existing_local_user(self):
        """A cloud user update should not fail when another local row already owns the email."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        target = User.objects.create_user(
            username="target_user",
            email="target@example.com",
            password="old-password",
        )
        User.objects.create_user(
            username="duplicate_user",
            email="cloud@example.com",
            password="duplicate-password",
        )

        new_hash = "pbkdf2_sha256$600000$salt$newhash123abc"
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": target.pk,
                "data": {
                    "id": target.pk,
                    "username": "target_user",
                    "email": "cloud@example.com",
                    "password": new_hash,
                },
            }
        )

        assert result == {"success": True}
        target.refresh_from_db()
        assert target.email == "target@example.com"
        assert target.password == new_hash

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

    def test_reference_config_conflict_prefers_cloud(self, sample_facility, sample_organization):
        """Downward/config models should apply cloud changes over local pending edits."""
        from hmis.apps.core.models import SyncConflict, SyncQueue
        from hmis.apps.core.sync_materializer import materialize_entry

        sample_facility.has_laboratory = False
        sample_facility.save(update_fields=["has_laboratory"])
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="core.Facility",
            record_id=sample_facility.id,
            data={"id": sample_facility.id, "has_laboratory": False},
            status="PENDING",
            organization=sample_organization,
            facility=sample_facility,
        )

        result = materialize_entry(
            {
                "table": "core.Facility",
                "operation": "UPDATE",
                "record_id": sample_facility.id,
                "data": {"id": sample_facility.id, "has_laboratory": True},
            }
        )

        assert result == {"success": True, "conflict": True, "strategy": "REMOTE_WINS"}
        sample_facility.refresh_from_db()
        assert sample_facility.has_laboratory is True
        conflict = SyncConflict.objects.get(
            model_name="core.Facility", record_id=sample_facility.id
        )
        assert conflict.status == "RESOLVED"
        assert conflict.resolution_strategy == "REMOTE_WINS"
        assert conflict.local_data["has_laboratory"] is False
        assert conflict.remote_data["has_laboratory"] is True

    def test_clinical_conflict_prefers_hub(self, sample_patient):
        """Upward/clinical models should keep local hub changes when cloud sends same record."""
        from hmis.apps.core.models import SyncConflict, SyncQueue
        from hmis.apps.core.sync_materializer import materialize_entry

        sample_patient.last_name = "HubVersion"
        sample_patient.save(update_fields=["last_name"])
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="patients.Patient",
            record_id=sample_patient.id,
            data={"id": sample_patient.id, "last_name": "HubVersion"},
            status="PENDING",
            organization=sample_patient.organization,
            facility=sample_patient.registered_at_facility,
        )

        result = materialize_entry(
            {
                "table": "patients.Patient",
                "operation": "UPDATE",
                "record_id": sample_patient.id,
                "data": {"id": sample_patient.id, "last_name": "CloudVersion"},
            }
        )

        assert result == {"success": True, "conflict": True, "strategy": "LOCAL_WINS"}
        sample_patient.refresh_from_db()
        assert sample_patient.last_name == "HubVersion"
        conflict = SyncConflict.objects.get(
            model_name="patients.Patient", record_id=sample_patient.id
        )
        assert conflict.status == "RESOLVED"
        assert conflict.resolution_strategy == "LOCAL_WINS"
        assert conflict.local_data["last_name"] == "HubVersion"
        assert conflict.remote_data["last_name"] == "CloudVersion"
