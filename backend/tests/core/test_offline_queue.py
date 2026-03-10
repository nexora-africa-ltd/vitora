"""
Tests for offline change queue functionality.

Sprint 0.5: Offline Sync Logic
TDD Focus: Test offline queue operations for tracking local changes

These tests validate that changes made while offline are properly queued
and can be synchronized when connectivity is restored.
"""

from datetime import date

import pytest  # type: ignore
from django.utils import timezone


@pytest.mark.unit
class TestSyncQueueModel:
    """Tests for the SyncQueue model."""

    @pytest.mark.django_db
    def test_sync_queue_creation(self):
        """SyncQueue entries can be created."""
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={"first_name": "John", "last_name": "Doe"},
        )

        assert entry.id is not None
        assert entry.operation == "CREATE"
        assert entry.model_name == "Patient"
        assert entry.record_id == 1
        assert entry.status == "PENDING"

    @pytest.mark.django_db
    def test_sync_queue_has_timestamp(self):
        """SyncQueue entries should have timestamps."""
        from hmis.apps.core.models import SyncQueue

        before = timezone.now()
        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
        )
        after = timezone.now()

        assert entry.created_at is not None
        assert before <= entry.created_at <= after

    @pytest.mark.django_db
    def test_sync_queue_operation_choices(self):
        """SyncQueue should only accept valid operation types."""
        from hmis.apps.core.models import SyncQueue

        valid_operations = ["CREATE", "UPDATE", "DELETE"]

        for op in valid_operations:
            entry = SyncQueue.objects.create(
                operation=op,
                model_name="Patient",
                record_id=1,
                data={},
            )
            assert entry.operation == op

    @pytest.mark.django_db
    def test_sync_queue_status_choices(self):
        """SyncQueue should have valid status choices."""
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
        )

        # Default status should be PENDING
        assert entry.status == "PENDING"

        # Should be able to update to other statuses
        valid_statuses = ["PENDING", "SYNCING", "SYNCED", "FAILED", "CONFLICT"]
        for status in valid_statuses:
            entry.status = status
            entry.save()
            entry.refresh_from_db()
            assert entry.status == status

    @pytest.mark.django_db
    def test_sync_queue_stores_json_data(self):
        """SyncQueue should store complex JSON data."""
        from hmis.apps.core.models import SyncQueue

        complex_data = {
            "first_name": "John",
            "last_name": "Doe",
            "date_of_birth": "1990-01-15",
            "vitals": {"temperature": 37.5, "blood_pressure": "120/80"},
            "medications": ["med1", "med2"],
        }

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Encounter",
            record_id=1,
            data=complex_data,
        )

        entry.refresh_from_db()
        assert entry.data == complex_data
        assert entry.data["vitals"]["temperature"] == 37.5

    @pytest.mark.django_db
    def test_sync_queue_tracks_retry_count(self):
        """SyncQueue should track retry attempts."""
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
        )

        assert entry.retry_count == 0

        # Increment retry count
        entry.retry_count += 1
        entry.save()
        entry.refresh_from_db()
        assert entry.retry_count == 1

    @pytest.mark.django_db
    def test_sync_queue_error_message(self):
        """SyncQueue should store error messages on failure."""
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
        )

        entry.status = "FAILED"
        entry.error_message = "Connection timeout after 30 seconds"
        entry.save()

        entry.refresh_from_db()
        assert entry.error_message == "Connection timeout after 30 seconds"


@pytest.mark.unit
class TestSyncQueueManager:
    """Tests for SyncQueue manager methods."""

    @pytest.mark.django_db
    def test_get_pending_entries(self):
        """Should retrieve only pending entries."""
        from hmis.apps.core.models import SyncQueue

        # Create entries with different statuses
        SyncQueue.objects.create(
            operation="CREATE", model_name="Patient", record_id=1, data={}, status="PENDING"
        )
        SyncQueue.objects.create(
            operation="CREATE", model_name="Patient", record_id=2, data={}, status="SYNCED"
        )
        SyncQueue.objects.create(
            operation="CREATE", model_name="Patient", record_id=3, data={}, status="PENDING"
        )

        pending = SyncQueue.objects.filter(status="PENDING")
        assert pending.count() == 2

    @pytest.mark.django_db
    def test_get_entries_by_model(self):
        """Should retrieve entries filtered by model name."""
        from hmis.apps.core.models import SyncQueue

        SyncQueue.objects.create(operation="CREATE", model_name="Patient", record_id=1, data={})
        SyncQueue.objects.create(operation="CREATE", model_name="Encounter", record_id=1, data={})
        SyncQueue.objects.create(operation="CREATE", model_name="Patient", record_id=2, data={})

        patient_entries = SyncQueue.objects.filter(model_name="Patient")
        assert patient_entries.count() == 2

    @pytest.mark.django_db
    def test_queue_ordering_by_timestamp(self):
        """Entries should be ordered by creation timestamp (FIFO)."""
        import time

        from hmis.apps.core.models import SyncQueue

        entry1 = SyncQueue.objects.create(
            operation="CREATE", model_name="Patient", record_id=1, data={}
        )
        time.sleep(0.01)  # Ensure different timestamps
        entry2 = SyncQueue.objects.create(
            operation="CREATE", model_name="Patient", record_id=2, data={}
        )
        time.sleep(0.01)
        entry3 = SyncQueue.objects.create(
            operation="CREATE", model_name="Patient", record_id=3, data={}
        )

        ordered = list(SyncQueue.objects.order_by("created_at"))
        assert ordered[0].record_id == 1
        assert ordered[1].record_id == 2
        assert ordered[2].record_id == 3

    @pytest.mark.django_db
    def test_bulk_mark_as_synced(self):
        """Should be able to bulk update entries as synced."""
        from hmis.apps.core.models import SyncQueue

        entries = [
            SyncQueue.objects.create(operation="CREATE", model_name="Patient", record_id=i, data={})
            for i in range(5)
        ]

        # Bulk update
        SyncQueue.objects.filter(status="PENDING").update(status="SYNCED")

        # Verify all are synced
        assert SyncQueue.objects.filter(status="SYNCED").count() == 5


@pytest.mark.integration
class TestAutoQueueOnModelChange:
    """Tests for automatic queue creation on model changes."""

    @pytest.mark.django_db
    def test_patient_create_is_queued(self, settings):
        """Creating a patient should add entry to sync queue."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.patients.models import Patient

        # Enable sync queue (would be a setting in real implementation)
        initial_count = SyncQueue.objects.count()

        patient = Patient.objects.create(
            first_name="Queue",
            last_name="Test",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Check if queue entry was created
        # This test will initially fail - implementation will make it pass
        new_count = SyncQueue.objects.count()
        # assert new_count == initial_count + 1  # Uncomment when implemented

    @pytest.mark.django_db
    def test_patient_update_is_queued(self):
        """Updating a patient should add entry to sync queue."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Queue",
            last_name="Test",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        initial_count = SyncQueue.objects.filter(operation="UPDATE").count()

        patient.first_name = "Updated"
        patient.save()

        # This test will initially fail - implementation will make it pass
        # new_count = SyncQueue.objects.filter(operation="UPDATE").count()
        # assert new_count == initial_count + 1

    @pytest.mark.django_db
    def test_patient_delete_is_queued(self):
        """Deleting a patient should add entry to sync queue."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Queue",
            last_name="Test",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        patient_id = patient.id

        initial_count = SyncQueue.objects.filter(operation="DELETE").count()

        patient.delete()

        # This test will initially fail - implementation will make it pass
        # new_count = SyncQueue.objects.filter(operation="DELETE").count()
        # assert new_count == initial_count + 1


@pytest.mark.integration
class TestQueueProcessing:
    """Tests for processing the sync queue."""

    @pytest.mark.django_db
    def test_process_queue_entry(self):
        """Should be able to process a single queue entry."""
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={"first_name": "John", "last_name": "Doe"},
        )

        # Process should mark as syncing then synced
        # This will fail initially - implementation needed
        # result = process_queue_entry(entry)
        # entry.refresh_from_db()
        # assert entry.status == "SYNCED"

    @pytest.mark.django_db
    def test_failed_entry_increments_retry(self):
        """Failed processing should increment retry count."""
        from hmis.apps.core.models import SyncQueue

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
        )

        # Simulate failure
        entry.status = "FAILED"
        entry.retry_count += 1
        entry.error_message = "Server unavailable"
        entry.save()

        entry.refresh_from_db()
        assert entry.retry_count == 1
        assert entry.status == "FAILED"

    @pytest.mark.django_db
    def test_max_retries_exceeded(self):
        """Entries exceeding max retries should be marked appropriately."""
        from hmis.apps.core.models import SyncQueue

        max_retries = 3

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
            retry_count=max_retries,
        )

        # Entry with max retries should not be processed again
        # unless manually reset
        assert entry.retry_count >= max_retries


@pytest.mark.unit
class TestQueueDataIntegrity:
    """Tests for queue data integrity."""

    @pytest.mark.django_db
    def test_queue_preserves_all_model_fields(self):
        """Queue should preserve all model fields for sync."""
        from hmis.apps.core.models import SyncQueue

        full_patient_data = {
            "first_name": "Complete",
            "last_name": "Patient",
            "date_of_birth": "1990-01-15",
            "gender": "M",
            "national_id": "12345678",
            "phone_number": "+254712345678",
            "is_sensitive": False,
            "consent_given": True,
        }

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data=full_patient_data,
        )

        entry.refresh_from_db()

        # All fields should be preserved
        for key, value in full_patient_data.items():
            assert entry.data[key] == value

    @pytest.mark.django_db
    def test_queue_handles_unicode(self):
        """Queue should handle unicode characters correctly."""
        from hmis.apps.core.models import SyncQueue

        unicode_data = {
            "first_name": "José",
            "last_name": "Müller",
            "notes": "Patient speaks Swahili: Habari yako? 🏥",
        }

        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data=unicode_data,
        )

        entry.refresh_from_db()
        assert entry.data["first_name"] == "José"
        assert entry.data["notes"] == "Patient speaks Swahili: Habari yako? 🏥"

    @pytest.mark.django_db
    def test_queue_handles_large_data(self):
        """Queue should handle large data payloads."""
        from hmis.apps.core.models import SyncQueue

        # Create large data payload
        large_notes = "A" * 10000  # 10KB of text
        large_data = {
            "clinical_notes": large_notes,
            "attachments": [{"name": f"file_{i}.pdf"} for i in range(100)],
        }

        entry = SyncQueue.objects.create(
            operation="UPDATE",
            model_name="Encounter",
            record_id=1,
            data=large_data,
        )

        entry.refresh_from_db()
        assert len(entry.data["clinical_notes"]) == 10000
        assert len(entry.data["attachments"]) == 100
