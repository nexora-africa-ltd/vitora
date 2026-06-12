"""Tests for hub-mode automatic SyncQueue creation."""

from datetime import date

import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.core.models import SyncQueue
from hmis.apps.patients.models import Patient

pytestmark = pytest.mark.django_db


class TestHubSyncRegistry:
    """Tests for the declarative upward sync registry."""

    def test_patient_is_registered_for_upward_sync(self):
        """Patient should be part of the hub-to-cloud upward sync registry."""
        from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection

        entry = SYNC_REGISTRY["patients.Patient"]
        assert entry.direction == SyncDirection.UP
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

        entry = SyncQueue.objects.get(model_name="patients.Patient", record_id=patient.id)
        assert entry.operation == "CREATE"
        assert entry.status == "PENDING"
        assert entry.organization == sample_organization
        assert entry.facility == sample_facility
        assert entry.data["id"] == patient.id
        assert entry.data["first_name"] == "Mary"
        assert entry.data["organization"] == sample_organization.id
        assert entry.data["registered_at_facility"] == sample_facility.id
        assert entry.data["sync_meta"]["priority"] == 3
        assert entry.data["sync_meta"]["direction"] == "up"

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
            "sync_meta": {"priority": 3, "direction": "up"},
        }
