"""
Tests for tamper-resistant audit log hash chaining.

DHA Compliance: Gap #31 — Tamper-Resistant Audit Log (Sprint 3.C)
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.core.models import AuditLog, Notification
from hmis.apps.core.services.audit_integrity import AuditIntegrityService
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.fixture
def audit_service():
    return AuditIntegrityService()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username="auditadmin",
        email="admin@example.com",
        password="adminpassword123",
    )


@pytest.fixture
def admin_client(api_client, admin_user, sample_organization, sample_facility):
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=admin_user)
    return api_client


class TestAuditHashChaining:
    """Tests for hash computation on AuditLog entries."""

    def test_hash_computed_on_log(self, test_user):
        """Hash fields are populated when AuditLog.log() is called."""
        entry = AuditLog.log(
            action="patient_view",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
        )
        assert entry.sequence_number == 1
        assert len(entry.entry_hash) == 64
        assert entry.previous_hash == AuditLog.GENESIS_HASH

    def test_sequential_entries_chain(self, test_user):
        """Entry N+1 references the hash of entry N."""
        e1 = AuditLog.log(
            action="patient_view", user=test_user, resource_type="Patient", resource_id=1
        )
        e2 = AuditLog.log(
            action="patient_view", user=test_user, resource_type="Patient", resource_id=2
        )
        e3 = AuditLog.log(
            action="patient_view", user=test_user, resource_type="Patient", resource_id=3
        )

        assert e2.previous_hash == e1.entry_hash
        assert e3.previous_hash == e2.entry_hash
        assert e1.sequence_number == 1
        assert e2.sequence_number == 2
        assert e3.sequence_number == 3

    def test_genesis_entry_has_zero_previous_hash(self, test_user):
        """The first entry in the chain uses GENESIS_HASH as previous_hash."""
        entry = AuditLog.log(action="login_success", user=test_user)
        assert entry.previous_hash == "0" * 64

    def test_hash_determinism(self, test_user):
        """Same input produces the same hash."""
        from django.utils import timezone

        ts = timezone.now()
        h1 = AuditLog.compute_hash(
            sequence_number=1,
            previous_hash=AuditLog.GENESIS_HASH,
            action="test",
            user_id=42,
            timestamp=ts,
            resource_type="Patient",
            resource_id=1,
            details={"key": "value"},
        )
        h2 = AuditLog.compute_hash(
            sequence_number=1,
            previous_hash=AuditLog.GENESIS_HASH,
            action="test",
            user_id=42,
            timestamp=ts,
            resource_type="Patient",
            resource_id=1,
            details={"key": "value"},
        )
        assert h1 == h2

    def test_different_input_produces_different_hash(self, test_user):
        """Different input produces a different hash."""
        from django.utils import timezone

        ts = timezone.now()
        h1 = AuditLog.compute_hash(
            sequence_number=1,
            previous_hash=AuditLog.GENESIS_HASH,
            action="test",
            user_id=42,
            timestamp=ts,
            resource_type="Patient",
            resource_id=1,
            details={},
        )
        h2 = AuditLog.compute_hash(
            sequence_number=1,
            previous_hash=AuditLog.GENESIS_HASH,
            action="test",
            user_id=42,
            timestamp=ts,
            resource_type="Patient",
            resource_id=2,  # Different resource_id
            details={},
        )
        assert h1 != h2

    def test_anonymous_entry_uses_zero_user_id(self, db):
        """Entries without a user use user_id=0 in the hash."""
        entry = AuditLog.log(action="system_error", resource_type="System")
        assert entry.sequence_number == 1
        assert len(entry.entry_hash) == 64


class TestAuditIntegrityVerification:
    """Tests for the AuditIntegrityService."""

    def test_verify_valid_chain(self, test_user, audit_service):
        """verify_chain returns valid for an untampered chain."""
        for i in range(5):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        result = audit_service.verify_chain()
        assert result.valid is True
        assert result.entries_checked == 5

    def test_tamper_detection_modified_details(self, test_user, audit_service):
        """Detects tampering when an entry's details are modified."""
        for i in range(3):
            AuditLog.log(
                action="patient_view",
                user=test_user,
                resource_type="Patient",
                resource_id=i + 1,
                details={"original": True},
            )

        # Tamper with the second entry's details
        entry = AuditLog.objects.get(sequence_number=2)
        AuditLog.objects.filter(pk=entry.pk).update(details={"tampered": True})

        result = audit_service.verify_chain()
        assert result.valid is False
        assert result.first_mismatch_seq == 2

    def test_tamper_detection_modified_hash(self, test_user, audit_service):
        """Detects tampering when an entry's hash is modified."""
        for i in range(3):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        # Tamper with the first entry's hash
        AuditLog.objects.filter(sequence_number=1).update(entry_hash="a" * 64)

        result = audit_service.verify_chain()
        assert result.valid is False

    def test_tamper_detection_deleted_entry(self, test_user, audit_service):
        """Detects tampering when an entry in the middle is deleted."""
        for i in range(5):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        # Delete entry in the middle
        AuditLog.objects.filter(sequence_number=3).delete()

        result = audit_service.verify_chain()
        assert result.valid is False

    def test_verify_latest(self, test_user, audit_service):
        """verify_latest checks the most recent N entries."""
        for i in range(10):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        result = audit_service.verify_latest(count=5)
        assert result.valid is True
        assert result.entries_checked == 5

    def test_verify_empty_chain(self, db, audit_service):
        """verify_chain returns valid for an empty chain."""
        result = audit_service.verify_chain()
        assert result.valid is True
        assert result.entries_checked == 0

    def test_chain_status(self, test_user, audit_service):
        """get_chain_status returns correct summary."""
        for i in range(3):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        status_data = audit_service.get_chain_status()
        assert status_data["chained_entries"] >= 3
        assert status_data["last_sequence_number"] >= 3
        assert status_data["last_entry_hash"] is not None
        assert status_data["tamper_alerts_count"] == 0


class TestAuditIntegrityAPI:
    """Tests for the audit integrity API endpoints."""

    def test_chain_status_admin_access(self, admin_client):
        """Admin users can access the chain_status endpoint."""
        response = admin_client.get("/api/auditlogs/chain_status/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_entries" in response.data
        assert "chained_entries" in response.data

    def test_chain_status_non_admin_rejected(self, authenticated_client):
        """Non-admin users cannot access chain_status."""
        response = authenticated_client.get("/api/auditlogs/chain_status/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_verify_integrity_admin_access(self, admin_client):
        """Admin users can trigger on-demand verification."""
        response = admin_client.post("/api/auditlogs/verify_integrity/", {"count": 100})
        assert response.status_code == status.HTTP_200_OK
        assert "valid" in response.data
        assert "entries_checked" in response.data

    def test_verify_integrity_non_admin_rejected(self, authenticated_client):
        """Non-admin users cannot trigger verification."""
        response = authenticated_client.post("/api/auditlogs/verify_integrity/")
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestAuditIntegrityCeleryTask:
    """Tests for the Celery verification task."""

    def test_task_succeeds_on_valid_chain(self, test_user):
        """Task completes successfully when chain is valid."""
        for i in range(3):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        from hmis.apps.core.tasks import verify_audit_chain_integrity

        result = verify_audit_chain_integrity(count=100)
        assert result["valid"] is True

    def test_task_creates_notification_on_tamper(self, test_user, admin_user):
        """Task creates CRITICAL notification for superusers on tamper detection."""
        for i in range(3):
            AuditLog.log(
                action="patient_view", user=test_user, resource_type="Patient", resource_id=i + 1
            )

        # Tamper
        AuditLog.objects.filter(sequence_number=2).update(details={"tampered": True})

        from hmis.apps.core.tasks import verify_audit_chain_integrity

        result = verify_audit_chain_integrity(count=100)
        assert result["valid"] is False

        # Check notification was created for superuser
        notifications = Notification.objects.filter(
            user=admin_user,
            notification_type="audit_tamper_detected",
            priority=Notification.Priority.CRITICAL,
        )
        assert notifications.exists()
        assert "Tampering Detected" in notifications.first().title


class TestBackfillCommand:
    """Tests for the backfill_audit_hashes management command."""

    def test_backfill_populates_hashes(self, test_user):
        """Backfill command hashes existing entries without hashes."""
        # Create entries directly (bypassing log() to simulate pre-hash entries)
        for i in range(3):
            AuditLog.objects.create(
                action="patient_view",
                user=test_user,
                resource_type="Patient",
                resource_id=i + 1,
            )

        assert AuditLog.objects.filter(sequence_number__isnull=True).count() == 3

        from django.core.management import call_command

        call_command("backfill_audit_hashes")

        assert AuditLog.objects.filter(sequence_number__isnull=True).count() == 0
        assert AuditLog.objects.filter(sequence_number__isnull=False).count() == 3

        # Verify the chain is valid
        service = AuditIntegrityService()
        result = service.verify_chain()
        assert result.valid is True

    def test_backfill_is_idempotent(self, test_user):
        """Running backfill twice doesn't change already-hashed entries."""
        AuditLog.objects.create(
            action="patient_view",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
        )

        from django.core.management import call_command

        call_command("backfill_audit_hashes")

        entry = AuditLog.objects.first()
        original_hash = entry.entry_hash

        # Run again — already-hashed, nothing to do
        call_command("backfill_audit_hashes")

        entry.refresh_from_db()
        assert entry.entry_hash == original_hash

    def test_backfill_dry_run(self, test_user):
        """Dry run doesn't modify entries."""
        AuditLog.objects.create(
            action="patient_view",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
        )

        from django.core.management import call_command

        call_command("backfill_audit_hashes", dry_run=True)

        assert AuditLog.objects.filter(sequence_number__isnull=True).count() == 1


class TestConcurrentHashChaining:
    """Test hash chain integrity under concurrent writes."""

    @pytest.mark.skipif(
        "sqlite"
        in str(__import__("django").conf.settings.DATABASES.get("default", {}).get("ENGINE", "")),
        reason="SQLite does not support concurrent writes",
    )
    def test_concurrent_log_preserves_chain(self, test_user):
        """Multiple concurrent log calls maintain chain integrity."""
        import threading

        results = []

        def log_entry(idx):
            entry = AuditLog.log(
                action="patient_view",
                user=test_user,
                resource_type="Patient",
                resource_id=idx,
            )
            results.append(entry)

        threads = [threading.Thread(target=log_entry, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 5

        # All entries should have unique sequence numbers
        seq_numbers = [e.sequence_number for e in results]
        assert len(set(seq_numbers)) == 5

        # Chain should be valid
        service = AuditIntegrityService()
        result = service.verify_chain()
        assert result.valid is True
        assert result.entries_checked == 5

    def test_sequential_writes_preserve_chain(self, test_user):
        """Sequential writes maintain valid chain (works on all databases)."""
        for i in range(10):
            AuditLog.log(
                action="patient_view",
                user=test_user,
                resource_type="Patient",
                resource_id=i + 1,
            )

        service = AuditIntegrityService()
        result = service.verify_chain()
        assert result.valid is True
        assert result.entries_checked == 10
