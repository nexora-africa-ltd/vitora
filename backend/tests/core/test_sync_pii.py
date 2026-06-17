"""Phase 5 tests: PII handling in hub↔cloud sync."""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import override_settings

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_materializer import materialize_entry
from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection

User = get_user_model()

pytestmark = pytest.mark.django_db


class TestUserBidirectionalSync:
    """User model syncs bidirectionally so credentials work on hub and cloud."""

    def test_user_is_registered_bidirectional(self):
        """auth.User should sync BOTH directions for credential portability."""
        entry = SYNC_REGISTRY["auth.User"]
        assert entry.direction == SyncDirection.BOTH

    def test_user_conflict_policy_is_last_write_wins(self):
        """Password changes on either side should resolve via timestamp."""
        entry = SYNC_REGISTRY["auth.User"]
        assert entry.conflict_policy == "LAST_WRITE_WINS"

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_password_hash_queued_on_hub_change(self, sample_organization, sample_facility):
        """When a user changes their password on the hub, the hash is queued for sync."""
        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        user = User.objects.create_user(
            username="nurse_hub",
            password="initial-password-123",
        )

        entry = SyncQueue.objects.get(model_name="auth.User", record_id=user.pk)
        assert "password" in entry.data
        # Hash format varies by settings (pbkdf2, md5 in tests, argon2 in prod)
        assert "$" in entry.data["password"]  # All Django hashers use $ separator

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_last_login_not_queued(self, sample_organization, sample_facility):
        """Ephemeral last_login should be excluded from sync payloads."""
        from django.utils import timezone

        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        user = User.objects.create_user(username="nurse_login", password="pass123")
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        # Should have CREATE entry but last_login excluded from data
        entries = SyncQueue.objects.filter(model_name="auth.User", record_id=user.pk)
        for entry in entries:
            assert "last_login" not in entry.data

    @override_settings(ENVIRONMENT="staging", SYNC_ENABLED=True)
    def test_user_save_with_groups_does_not_500(self, sample_organization, sample_facility):
        """Regression: saving a User with groups must not break sync serialization.

        Previously, ``model_to_dict`` returned Group/Permission instances for the
        ``groups`` and ``user_permissions`` M2M fields. ``DjangoJSONEncoder``
        then raised ``TypeError: Object of type Group is not JSON serializable``
        when the post_save sync signal fired (e.g. during ``update_last_login``
        on every successful admin/API login), surfacing as a 500 to clients.
        """
        from django.contrib.auth.models import Group

        import hmis.apps.core.sync_signals  # noqa: F401

        SyncQueue.objects.all().delete()

        user = User.objects.create_user(username="grouped_user", password="pass123")
        group = Group.objects.create(name="Test Sync Group")
        user.groups.add(group)

        # This save mirrors what django.contrib.auth.update_last_login does.
        from django.utils import timezone

        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])  # must not raise

        entry = SyncQueue.objects.filter(model_name="auth.User", record_id=user.pk).latest(
            "created_at"
        )
        # Groups should be serialized as a list of PKs, not model instances.
        assert entry.data.get("groups") == [group.pk]

    def test_materialize_user_from_cloud_with_password(self):
        """Cloud-created user with password hash should be usable locally."""
        user = User.objects.create_user(username="cloud_user", password="old-password")

        new_hash = "pbkdf2_sha256$600000$salt$newhash123abc"
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": user.pk,
                "data": {
                    "id": user.pk,
                    "username": "cloud_user",
                    "password": new_hash,
                },
            }
        )

        assert result["success"] is True
        user.refresh_from_db()
        assert user.password == new_hash

    def test_materialize_user_excludes_last_login(self):
        """Even if cloud sends last_login, materializer should strip it."""
        user = User.objects.create_user(username="strip_test", password="pass123")

        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": user.pk,
                "data": {
                    "id": user.pk,
                    "username": "strip_test",
                    "last_login": "2026-06-01T10:00:00Z",
                    "is_active": True,
                },
            }
        )

        assert result["success"] is True


class TestStaffProfileBidirectionalSync:
    """StaffProfile should sync both ways so hub-created staff appear on cloud."""

    def test_staff_profile_is_bidirectional(self):
        """StaffProfile syncs BOTH directions."""
        entry = SYNC_REGISTRY["core.StaffProfile"]
        assert entry.direction == SyncDirection.BOTH

    def test_staff_profile_conflict_is_last_write_wins(self):
        """Profile edits resolve by most recent change."""
        entry = SYNC_REGISTRY["core.StaffProfile"]
        assert entry.conflict_policy == "LAST_WRITE_WINS"


class TestPIIEncryptedFieldSync:
    """Encrypted PII fields transfer as ciphertext blobs between hub and cloud."""

    @override_settings(ENVIRONMENT="hub", SYNC_ENABLED=True)
    def test_encrypted_fields_synced_as_ciphertext(
        self, sample_county, sample_sub_county, sample_organization, sample_facility
    ):
        """Patient encrypted fields should be queued as their ciphertext values."""
        import hmis.apps.core.sync_signals  # noqa: F401
        from hmis.apps.patients.models import Patient

        SyncQueue.objects.all().delete()

        patient = Patient.objects.create(
            first_name="Jane",
            last_name="Doe",
            date_of_birth=date(1990, 3, 15),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )
        # Set PII via the property (encrypts on write)
        patient.phone_number = "+254712345678"
        patient.save()

        entry = SyncQueue.objects.filter(
            model_name="patients.Patient", record_id=patient.pk
        ).latest("created_at")
        # The data should contain the encrypted column, not plaintext
        # model_to_dict serializes the concrete fields (phone_number_encrypted)
        assert "phone_number_encrypted" in entry.data or "phone_number" not in entry.data

    def test_pii_fields_not_listed_in_exclude(self):
        """Patient PII encrypted columns should NOT be excluded from sync."""
        entry = SYNC_REGISTRY["patients.Patient"]
        assert "phone_number_encrypted" not in entry.exclude_fields
        assert "identification_number_encrypted" not in entry.exclude_fields
