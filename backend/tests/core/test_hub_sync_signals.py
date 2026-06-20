"""Tests for hub-mode automatic SyncQueue creation."""

from datetime import date

import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.core.models import SyncQueue
from hmis.apps.patients.models import Patient

pytestmark = pytest.mark.django_db


class TestHubSyncRegistry:
    """Tests for the declarative upward sync registry."""

    def test_all_registered_sync_models_resolve(self):
        """Every registry label should resolve to a real Django model."""
        from django.apps import apps

        from hmis.apps.core.sync_registry import SYNC_REGISTRY

        missing = []
        for model_label in SYNC_REGISTRY:
            app_label, model_name = model_label.split(".", 1)
            try:
                apps.get_model(app_label, model_name)
            except LookupError:
                missing.append(model_label)

        assert missing == []

    def test_patient_is_registered_for_bidirectional_sync(self):
        """Patients should sync hub-to-cloud and cloud-to-hub."""
        from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection

        entry = SYNC_REGISTRY["patients.Patient"]
        assert entry.direction == SyncDirection.BOTH
        assert entry.priority == 3

    def test_last_login_excluded_for_user_sync(self):
        """User sync should exclude ephemeral last_login field."""
        from hmis.apps.core.sync_registry import SYNC_REGISTRY

        entry = SYNC_REGISTRY["auth.User"]
        assert "last_login" in entry.exclude_fields

    def test_user_password_hash_is_synced(self):
        """User sync should include the password hash for offline auth."""
        from hmis.apps.core.sync_registry import SYNC_REGISTRY

        entry = SYNC_REGISTRY["auth.User"]
        assert "password" not in entry.exclude_fields


class TestHubSyncSignals:
    """Tests for automatic SyncQueue creation from model saves/deletes."""

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_patient_create_is_queued_in_hub_mode(
        self, sample_county, sample_sub_county, sample_organization, sample_facility
    ):
        """Creating a registered upward-sync model in hub mode should queue CREATE."""
        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        patient = Patient.objects.create(
            first_name="Mary",
            last_name="Wanjiku",
            date_of_birth=date(1992, 7, 14),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )

        entry = SyncQueue.objects.get(model_name="patients.Patient", record_id=patient.pk)
        assert entry.operation == "CREATE"
        assert entry.status == "PENDING"
        assert entry.organization == sample_organization
        assert entry.facility == sample_facility
        assert entry.data["id"] == patient.pk
        assert entry.data["first_name"] == "Mary"
        assert entry.data["organization"] == sample_organization.id
        assert entry.data["registered_at_facility"] == sample_facility.id
        assert entry.data["sync_meta"]["priority"] == 3
        assert entry.data["sync_meta"]["direction"] == "both"

    @override_settings(ENVIRONMENT="test", SYNC_ENABLED=False)
    def test_patient_create_is_not_queued_outside_hub_mode(
        self, sample_county, sample_sub_county, sample_organization, sample_facility
    ):
        """Automatic hub sync should stay dormant outside hub mode."""
        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        Patient.objects.create(
            first_name="Not",
            last_name="Queued",
            date_of_birth=date(1994, 1, 1),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )

        assert SyncQueue.objects.count() == 0

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_patient_update_and_delete_are_queued_in_hub_mode(self, sample_patient):
        """Updates and deletes should queue UPDATE and DELETE entries."""
        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        sample_patient.last_name = "Updated"
        sample_patient.save(update_fields=["last_name"])
        patient_id = sample_patient.id
        sample_patient.delete()

        entries = list(
            SyncQueue.objects.filter(model_name="patients.Patient", record_id=patient_id).order_by(
                "created_at"
            )
        )
        assert [entry.operation for entry in entries] == ["UPDATE", "DELETE"]
        assert entries[0].data["last_name"] == "Updated"
        assert entries[1].data == {
            "id": patient_id,
            "sync_meta": {"priority": 3, "direction": "both"},
        }

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_materialized_patient_update_does_not_queue_pending_entry(self, sample_patient):
        """Pulled cloud changes must not be re-queued as hub-originated changes."""
        import hmis.apps.core.sync_signals  # noqa: F401
        from hmis.apps.core.sync_materializer import materialize_entry

        SyncQueue.objects.all().delete()

        result = materialize_entry(
            {
                "table": "patients.Patient",
                "operation": "UPDATE",
                "record_id": sample_patient.id,
                "data": {"id": sample_patient.id, "last_name": "CloudUpdated"},
            }
        )

        assert result == {"success": True}
        sample_patient.refresh_from_db()
        assert sample_patient.last_name == "CloudUpdated"
        assert SyncQueue.objects.filter(status="PENDING").count() == 0

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_materialized_patient_delete_does_not_queue_pending_entry(self, sample_patient):
        """Pulled cloud deletes must not be pushed back to cloud as local deletes."""
        import hmis.apps.core.sync_signals  # noqa: F401
        from hmis.apps.core.sync_materializer import materialize_entry

        patient_id = sample_patient.id
        SyncQueue.objects.all().delete()

        result = materialize_entry(
            {
                "table": "patients.Patient",
                "operation": "DELETE",
                "record_id": patient_id,
                "data": {"id": patient_id},
            }
        )

        assert result == {"success": True}
        assert Patient.objects.filter(id=patient_id).exists() is False
        assert SyncQueue.objects.filter(status="PENDING").count() == 0

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_organization_with_imagefield_serializes_without_typeerror(self, sample_organization):
        """Saving a model with an ImageField/FileField must not break the sync signal.

        Regression: TypeError("Object of type ImageFieldFile is not JSON serializable")
        on Windows hub install during seed_from_activation (Organization.logo).
        """
        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        # Touch the org to fire post_save without setting a file
        sample_organization.name = sample_organization.name + " (resaved)"
        sample_organization.save(update_fields=["name"])

        entry = SyncQueue.objects.get(
            model_name="core.Organization", record_id=sample_organization.id
        )
        # logo is empty → None in the payload, not a FieldFile
        assert entry.data["logo"] is None
        assert entry.operation == "UPDATE"
