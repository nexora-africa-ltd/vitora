# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for hub superuser / cloud-user conflict prevention.

Covers:
- Cloud user manifest generation (serialize_users_summary)
- Placeholder user seeding (seed_cloud_users)
- PK offset allocation for hub-created users
- Username collision detection in create_superuser
- Cloud admin skip offer in create_superuser
- Sync materializer PK conflict avoidance
"""

import json
from datetime import date
from io import StringIO
from pathlib import Path

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings

from hmis.apps.core.models import Role, StaffProfile
from hmis.apps.licensing.bootstrap import seed_cloud_users, serialize_users_summary

User = get_user_model()

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# serialize_users_summary
# ---------------------------------------------------------------------------


class TestSerializeUsersSummary:
    """Cloud activation response includes lightweight user manifest."""

    def test_returns_users_for_organization(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """Users with StaffProfiles in the org appear in the manifest."""
        user = User.objects.create_user(username="doc_jane", password="pass123")
        StaffProfile.objects.create(
            user=user,
            employee_id="EMP-001",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
        )

        result = serialize_users_summary(organization=sample_organization)

        assert len(result) >= 1
        user_entry = next(u for u in result if u["username"] == "doc_jane")
        assert user_entry["id"] == user.pk
        assert user_entry["is_superuser"] is False
        assert user_entry["role_code"] == "DOC"
        # No password hash in manifest
        assert "password" not in user_entry

    def test_excludes_other_org_users(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """Users from a different organization are excluded."""
        from hmis.apps.core.models import Organization

        other_org = Organization.objects.create(name="Other Org", slug="other-org")
        user = User.objects.create_user(username="other_user", password="pass123")
        StaffProfile.objects.create(
            user=user,
            employee_id="EMP-OTHER",
            organization=other_org,
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
        )

        result = serialize_users_summary(organization=sample_organization)
        usernames = [u["username"] for u in result]
        assert "other_user" not in usernames

    def test_empty_org_returns_empty_list(self, sample_organization):
        """Organization with no staff returns empty list."""
        result = serialize_users_summary(organization=sample_organization)
        assert result == []


# ---------------------------------------------------------------------------
# seed_cloud_users
# ---------------------------------------------------------------------------


class TestSeedCloudUsers:
    """Placeholder User rows are created from cloud manifest during seed."""

    def test_creates_placeholder_users_with_correct_pk(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """Placeholder users preserve cloud PK and are inactive with unusable password."""
        users_data = [
            {
                "id": 42,
                "username": "cloud_admin",
                "email": "admin@example.com",
                "is_superuser": True,
                "role_code": "ADMIN",
            },
            {
                "id": 43,
                "username": "cloud_nurse",
                "email": "nurse@example.com",
                "is_superuser": False,
                "role_code": "",
            },
        ]

        counts = seed_cloud_users(
            users_data, organization=sample_organization, facility=sample_facility
        )

        assert counts["created"] == 2
        assert counts["skipped"] == 0

        admin = User.objects.get(pk=42)
        assert admin.username == "cloud_admin"
        assert admin.is_active is False
        assert admin.has_usable_password() is False
        assert admin.is_superuser is True

        nurse = User.objects.get(pk=43)
        assert nurse.username == "cloud_nurse"
        assert nurse.is_active is False

        # StaffProfiles created
        assert StaffProfile.objects.filter(user=admin).exists()
        assert StaffProfile.objects.filter(user=nurse).exists()

    def test_skips_existing_pk(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """If a user with the cloud PK already exists, skip it."""
        User.objects.create_user(pk=42, username="existing_user", password="pass123")

        users_data = [
            {"id": 42, "username": "cloud_admin", "email": "", "is_superuser": True},
        ]

        counts = seed_cloud_users(
            users_data, organization=sample_organization, facility=sample_facility
        )
        assert counts["skipped"] == 1
        assert counts["created"] == 0

    def test_skips_existing_username(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """If a user with the same username exists (different PK), skip it."""
        User.objects.create_user(username="cloud_admin", password="pass123")

        users_data = [
            {"id": 999, "username": "cloud_admin", "email": "", "is_superuser": True},
        ]

        counts = seed_cloud_users(
            users_data, organization=sample_organization, facility=sample_facility
        )
        assert counts["skipped"] == 1
        assert counts["created"] == 0

    def test_skips_entries_with_missing_id_or_username(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """Entries without id or username are silently ignored."""
        users_data = [
            {"username": "no_id_user"},
            {"id": 50},
        ]
        counts = seed_cloud_users(
            users_data, organization=sample_organization, facility=sample_facility
        )
        assert counts["created"] == 0
        assert counts["skipped"] == 0


# ---------------------------------------------------------------------------
# create_superuser: PK offset
# ---------------------------------------------------------------------------


class TestHubPKOffset:
    """Hub-created users get PKs in the offset range to avoid cloud collisions."""

    @override_settings(HUB_USER_PK_OFFSET=100000)
    def test_superuser_gets_offset_pk(self, sample_organization, sample_facility):
        """On hub settings, create_superuser allocates PK >= HUB_USER_PK_OFFSET."""
        out = StringIO()
        call_command(
            "create_superuser",
            "--username=hub_admin",
            "--password=test-pass-123",
            "--no-profile",
            "--force",
            stdout=out,
        )

        user = User.objects.get(username="hub_admin")
        assert user.pk >= 100000

    @override_settings(HUB_USER_PK_OFFSET=100000)
    def test_sequential_hub_users_get_incremental_pks(self, sample_organization, sample_facility):
        """Multiple hub-created users get sequential PKs in the offset range."""
        out = StringIO()
        call_command(
            "create_superuser",
            "--username=hub_admin1",
            "--password=pass1",
            "--no-profile",
            "--force",
            stdout=out,
        )
        call_command(
            "create_superuser",
            "--username=hub_admin2",
            "--password=pass2",
            "--no-profile",
            "--force",
            stdout=out,
        )

        u1 = User.objects.get(username="hub_admin1")
        u2 = User.objects.get(username="hub_admin2")
        assert u1.pk >= 100000
        assert u2.pk == u1.pk + 1

    @override_settings(HUB_USER_PK_OFFSET=100000)
    def test_offset_pk_does_not_collide_with_cloud_placeholder(
        self, sample_organization, sample_facility
    ):
        """Hub-created user PK doesn't collide with cloud placeholder PKs."""
        # Simulate cloud user with PK 5 (seeded by seed_cloud_users)
        cloud_user = User(pk=5, username="cloud_user", is_active=False)
        cloud_user.set_unusable_password()
        cloud_user.save()

        out = StringIO()
        call_command(
            "create_superuser",
            "--username=hub_admin",
            "--password=test-pass",
            "--no-profile",
            "--force",
            stdout=out,
        )

        hub_user = User.objects.get(username="hub_admin")
        assert hub_user.pk >= 100000
        assert hub_user.pk != cloud_user.pk

    def test_no_offset_when_setting_not_configured(self, sample_organization, sample_facility):
        """Without HUB_USER_PK_OFFSET, PK is auto-assigned by Django."""
        out = StringIO()
        call_command(
            "create_superuser",
            "--username=regular_admin",
            "--password=test-pass",
            "--no-profile",
            "--force",
            stdout=out,
        )

        user = User.objects.get(username="regular_admin")
        # Default Django auto-increment, should be a small number
        assert user.pk < 100000


# ---------------------------------------------------------------------------
# create_superuser: username collision detection
# ---------------------------------------------------------------------------


class TestUsernameCollisionDetection:
    """create_superuser checks cloud manifest for username conflicts."""

    def test_blocks_username_matching_cloud_user(self, tmp_path, monkeypatch):
        """Rejects username that exists in cloud manifest (without --force)."""
        manifest = tmp_path / "cloud_users.json"
        manifest.write_text(
            json.dumps(
                [
                    {"id": 10, "username": "admin", "is_superuser": True, "role_code": "ADMIN"},
                ]
            )
        )

        # Simulate non-interactive stdin (EOFError on input → skip)
        monkeypatch.setattr("builtins.input", lambda *a: (_ for _ in ()).throw(EOFError))

        out = StringIO()
        with override_settings(HUB_USER_PK_OFFSET=0):
            import os

            old_env = os.environ.get("HUB_DATA_DIR", "")
            os.environ["HUB_DATA_DIR"] = str(tmp_path)
            try:
                call_command(
                    "create_superuser",
                    "--username=admin",
                    "--password=test-pass",
                    "--no-profile",
                    stdout=out,
                )
            finally:
                if old_env:
                    os.environ["HUB_DATA_DIR"] = old_env
                else:
                    os.environ.pop("HUB_DATA_DIR", None)

        output = out.getvalue()
        assert "Skipped" in output or "already exists in the cloud" in output
        assert not User.objects.filter(username="admin").exists()

    def test_force_flag_bypasses_collision_check(self, tmp_path):
        """--force allows creating a user even if username matches cloud."""
        manifest = tmp_path / "cloud_users.json"
        manifest.write_text(
            json.dumps(
                [
                    {"id": 10, "username": "admin", "is_superuser": True, "role_code": "ADMIN"},
                ]
            )
        )

        out = StringIO()
        with override_settings(HUB_USER_PK_OFFSET=0):
            import os

            old_env = os.environ.get("HUB_DATA_DIR", "")
            os.environ["HUB_DATA_DIR"] = str(tmp_path)
            try:
                call_command(
                    "create_superuser",
                    "--username=admin",
                    "--password=test-pass",
                    "--no-profile",
                    "--force",
                    stdout=out,
                )
            finally:
                if old_env:
                    os.environ["HUB_DATA_DIR"] = old_env
                else:
                    os.environ.pop("HUB_DATA_DIR", None)

        assert User.objects.filter(username="admin").exists()

    def test_no_manifest_allows_creation(self):
        """Without cloud_users.json, creation proceeds normally."""
        out = StringIO()
        with override_settings(HUB_USER_PK_OFFSET=0):
            import os

            old_env = os.environ.get("HUB_DATA_DIR", "")
            os.environ["HUB_DATA_DIR"] = "/nonexistent"
            try:
                call_command(
                    "create_superuser",
                    "--username=solo_admin",
                    "--password=test-pass",
                    "--no-profile",
                    "--force",
                    stdout=out,
                )
            finally:
                if old_env:
                    os.environ["HUB_DATA_DIR"] = old_env
                else:
                    os.environ.pop("HUB_DATA_DIR", None)

        assert User.objects.filter(username="solo_admin").exists()


class TestExistingSuperuserRepair:
    """create_superuser can repair an existing placeholder/local admin."""

    def test_existing_user_can_be_promoted_and_password_reset(self):
        """Existing inactive placeholder becomes a usable local superuser."""
        user = User.objects.create_user(username="hub_admin", email="old@example.test")
        user.is_active = False
        user.is_staff = False
        user.is_superuser = False
        user.set_unusable_password()
        user.save()

        out = StringIO()
        call_command(
            "create_superuser",
            "--username=hub_admin",
            "--email=hub_admin@vitora.local",
            "--password=new-pass-123",
            "--no-profile",
            "--force",
            "--reset-password",
            stdout=out,
        )

        user.refresh_from_db()
        assert user.is_active is True
        assert user.is_staff is True
        assert user.is_superuser is True
        assert user.email == "hub_admin@vitora.local"
        assert user.check_password("new-pass-123") is True
        assert "Updated superuser" in out.getvalue()

    def test_existing_user_without_reset_keeps_password(self):
        """Existing users are not password-reset unless explicitly requested."""
        user = User.objects.create_superuser(username="admin", password="old-pass-123")

        out = StringIO()
        call_command(
            "create_superuser",
            "--username=admin",
            "--no-profile",
            "--force",
            stdout=out,
        )

        user.refresh_from_db()
        assert user.check_password("old-pass-123") is True
        assert "Password reset" not in out.getvalue()


# ---------------------------------------------------------------------------
# Sync materializer: PK conflict avoidance
# ---------------------------------------------------------------------------


class TestSyncMaterializerPKConflict:
    """Cloud user sync doesn't collide with hub-created user PKs."""

    @override_settings(HUB_USER_PK_OFFSET=100000)
    def test_cloud_sync_updates_placeholder_not_hub_user(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """When cloud syncs user pk=5, it updates the placeholder, not the hub admin."""
        from hmis.apps.core.sync_materializer import materialize_entry

        # 1. Seed cloud placeholder at pk=5
        seed_cloud_users(
            [{"id": 5, "username": "cloud_doc", "email": "doc@example.com", "is_superuser": False}],
            organization=sample_organization,
            facility=sample_facility,
        )

        # 2. Create hub admin at pk >= 100000
        out = StringIO()
        call_command(
            "create_superuser",
            "--username=hub_admin",
            "--password=hub-pass-123",
            "--no-profile",
            "--force",
            stdout=out,
        )
        hub_admin = User.objects.get(username="hub_admin")
        assert hub_admin.pk >= 100000

        # 3. Cloud syncs real credentials for pk=5
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": 5,
                "data": {
                    "id": 5,
                    "username": "cloud_doc",
                    "is_active": True,
                    "password": "pbkdf2_sha256$600000$salt$realhash",
                },
            }
        )

        assert result["success"] is True
        cloud_doc = User.objects.get(pk=5)
        assert cloud_doc.is_active is True
        assert cloud_doc.password == "pbkdf2_sha256$600000$salt$realhash"

        # Hub admin untouched
        hub_admin.refresh_from_db()
        assert hub_admin.pk >= 100000
        assert hub_admin.is_active is True

    def test_cloud_create_with_reserved_pk_uses_update_or_create(
        self, sample_organization, sample_facility, sample_role, sample_department
    ):
        """Materializer update_or_create on a placeholder PK updates rather than failing."""
        from hmis.apps.core.sync_materializer import materialize_entry

        # Seed placeholder
        seed_cloud_users(
            [{"id": 7, "username": "nurse_k", "email": "", "is_superuser": False}],
            organization=sample_organization,
            facility=sample_facility,
        )

        # Cloud sends CREATE (first sync) — should update existing placeholder
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "CREATE",
                "record_id": 7,
                "data": {
                    "id": 7,
                    "username": "nurse_k",
                    "email": "nurse@hospital.co.ke",
                    "is_active": True,
                    "password": "pbkdf2_sha256$600000$salt$nursehash",
                },
            }
        )

        assert result["success"] is True
        nurse = User.objects.get(pk=7)
        assert nurse.email == "nurse@hospital.co.ke"
        assert nurse.is_active is True
        # Only one user with this PK
        assert User.objects.filter(pk=7).count() == 1


# ---------------------------------------------------------------------------
# seed_from_activation: manifest file written
# ---------------------------------------------------------------------------


class TestSeedFromActivationManifest:
    """seed_from_activation writes cloud_users.json for createsuperuser."""

    def test_manifest_file_written(self, tmp_path, sample_organization, sample_facility):
        """seed_from_activation saves bootstrap.users to cloud_users.json."""
        import os

        # Create activation payload with users
        payload = {
            "organization": {
                "id": sample_organization.id,
                "name": sample_organization.name,
                "slug": sample_organization.slug,
                "contact_email": "",
                "contact_phone": "",
            },
            "facility": {
                "id": sample_facility.id,
                "name": sample_facility.name,
                "mfl_code": sample_facility.mfl_code,
                "level": sample_facility.level,
                "ownership": sample_facility.ownership,
                "county_id": sample_facility.county_id,
                "county_name": "Test County",
                "sub_county_id": sample_facility.sub_county_id,
                "sub_county_name": "Test Sub-County",
                "modules": {},
            },
            "bootstrap": {
                "departments": [],
                "roles": [],
                "users": [
                    {
                        "id": 10,
                        "username": "cloud_boss",
                        "email": "boss@example.com",
                        "is_superuser": True,
                        "role_code": "ADMIN",
                        "role_name": "Admin",
                    },
                ],
            },
        }

        payload_file = tmp_path / "activation.json"
        payload_file.write_text(json.dumps(payload))

        data_dir = tmp_path / "hub_data"
        data_dir.mkdir()

        old_env = os.environ.get("HUB_DATA_DIR", "")
        os.environ["HUB_DATA_DIR"] = str(data_dir)
        try:
            out = StringIO()
            call_command(
                "seed_from_activation",
                f"--response-file={payload_file}",
                "--skip-locations",
                stdout=out,
            )
        finally:
            if old_env:
                os.environ["HUB_DATA_DIR"] = old_env
            else:
                os.environ.pop("HUB_DATA_DIR", None)

        manifest_path = data_dir / "cloud_users.json"
        assert manifest_path.exists()

        manifest = json.loads(manifest_path.read_text())
        assert len(manifest) == 1
        assert manifest[0]["username"] == "cloud_boss"
        assert manifest[0]["id"] == 10

        # Placeholder user created in DB
        assert User.objects.filter(pk=10, username="cloud_boss").exists()
        cloud_user = User.objects.get(pk=10)
        assert cloud_user.is_active is False
        assert cloud_user.has_usable_password() is False
