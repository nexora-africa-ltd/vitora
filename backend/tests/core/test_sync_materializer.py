"""Tests for applying pulled cloud sync entries on a hub."""

from datetime import date

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

    def test_materialize_user_create_updates_existing_username(self):
        """Cloud-created users should update a same-username local row instead of colliding."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        local_user = User.objects.create_user(
            username="cloud_admin",
            email="local@example.com",
            password="old-password",
        )
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "CREATE",
                "record_id": local_user.pk + 100,
                "data": {
                    "id": local_user.pk + 100,
                    "username": "cloud_admin",
                    "email": "cloud@example.com",
                    "first_name": "Cloud",
                },
            }
        )

        assert result == {"success": True}
        assert User.objects.filter(username="cloud_admin").count() == 1
        local_user.refresh_from_db()
        assert local_user.first_name == "Cloud"

    def test_materialize_user_pk_collision_updates_existing_username(self):
        """Cloud users should reconcile by username even when the cloud PK exists locally."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        local_pk_owner = User.objects.create_user(
            username="local_system",
            email="system.local@example.com",
            password="system-password",
        )
        local_cloud_user = User.objects.create_user(
            username="cloud_admin",
            email="admin.local@example.com",
            password="old-password",
        )

        new_hash = "pbkdf2_sha256$600000$salt$cloudadminhash"
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "CREATE",
                "record_id": local_pk_owner.pk,
                "data": {
                    "id": local_pk_owner.pk,
                    "username": "cloud_admin",
                    "email": "admin@cloud.example.com",
                    "first_name": "Cloud",
                    "password": new_hash,
                },
            }
        )

        assert result == {"success": True}
        local_pk_owner.refresh_from_db()
        local_cloud_user.refresh_from_db()
        assert local_pk_owner.username == "local_system"
        assert local_cloud_user.first_name == "Cloud"
        assert local_cloud_user.password == new_hash

    def test_materialize_update_creates_missing_user_from_full_payload(self):
        """Cloud UPDATE payloads should upsert when the local row is missing."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": 9001,
                "data": {
                    "id": 9001,
                    "username": "missing_cloud_user",
                    "email": "missing@example.com",
                    "password": "pbkdf2_sha256$600000$salt$missinghash",
                    "is_active": True,
                },
            }
        )

        assert result == {"success": True}
        user = User.objects.get(pk=9001)
        assert user.username == "missing_cloud_user"
        assert user.email == "missing@example.com"

    def test_materialize_staff_profile_create_updates_existing_user_profile(
        self, test_user, sample_organization, sample_facility, sample_department, sample_role
    ):
        """Cloud staff profiles should update an existing local profile for the same user."""
        from hmis.apps.core.models import StaffProfile
        from hmis.apps.core.sync_materializer import materialize_entry

        local_profile = StaffProfile.objects.create(
            user=test_user,
            employee_id="LOCAL-001",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date(2026, 1, 1),
        )
        result = materialize_entry(
            {
                "table": "core.StaffProfile",
                "operation": "CREATE",
                "record_id": local_profile.pk + 100,
                "data": {
                    "id": local_profile.pk + 100,
                    "user": test_user.pk,
                    "employee_id": "CLOUD-001",
                    "organization": sample_organization.pk,
                    "primary_facility": sample_facility.pk,
                    "primary_department": sample_department.pk,
                    "primary_role": sample_role.pk,
                    "date_joined": "2026-01-01",
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                },
            }
        )

        assert result == {"success": True}
        assert StaffProfile.objects.filter(user=test_user).count() == 1
        local_profile.refresh_from_db()
        assert local_profile.employee_id == "CLOUD-001"

    def test_materialize_staff_profile_pk_collision_updates_existing_user_profile(
        self,
        test_user,
        another_user,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """Cloud staff profiles should reconcile by user before updating a colliding PK."""
        from hmis.apps.core.models import StaffProfile
        from hmis.apps.core.sync_materializer import materialize_entry

        local_pk_owner = StaffProfile.objects.create(
            user=another_user,
            employee_id="LOCAL-PK-OWNER",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date(2026, 1, 1),
        )
        local_cloud_profile = StaffProfile.objects.create(
            user=test_user,
            employee_id="LOCAL-CLOUD-USER",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date(2026, 1, 1),
        )

        result = materialize_entry(
            {
                "table": "core.StaffProfile",
                "operation": "CREATE",
                "record_id": local_pk_owner.pk,
                "data": {
                    "id": local_pk_owner.pk,
                    "user": test_user.pk,
                    "employee_id": "CLOUD-STAFF-001",
                    "organization": sample_organization.pk,
                    "primary_facility": sample_facility.pk,
                    "primary_department": sample_department.pk,
                    "primary_role": sample_role.pk,
                    "date_joined": "2026-01-01",
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                },
            }
        )

        assert result == {"success": True}
        local_pk_owner.refresh_from_db()
        local_cloud_profile.refresh_from_db()
        assert local_pk_owner.user == another_user
        assert local_cloud_profile.employee_id == "CLOUD-STAFF-001"
        assert StaffProfile.objects.filter(user=test_user).count() == 1

    def test_materialize_staff_profile_remaps_cloud_identity_dependencies_by_natural_keys(
        self,
        test_user,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """Full pulls should use local Role/Department PKs when cloud IDs differ."""
        from hmis.apps.core.models import StaffProfile
        from hmis.apps.core.sync_materializer import materialize_entry

        cloud_role_id = sample_role.pk + 1000
        cloud_department_id = sample_department.pk + 1000

        result = materialize_entry(
            {
                "table": "core.StaffProfile",
                "operation": "CREATE",
                "record_id": 88001,
                "data": {
                    "id": 88001,
                    "user_id": test_user.pk,
                    "username": test_user.username,
                    "employee_id": "CLOUD-NATURAL-001",
                    "organization_id": sample_organization.pk,
                    "organization_slug": sample_organization.slug,
                    "primary_facility_id": sample_facility.pk,
                    "primary_facility_mfl_code": sample_facility.mfl_code,
                    "primary_department_id": cloud_department_id,
                    "primary_department_code": sample_department.code,
                    "primary_role_id": cloud_role_id,
                    "primary_role_code": sample_role.code,
                    "date_joined": "2026-01-01",
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                },
            }
        )

        assert result == {"success": True}
        profile = StaffProfile.objects.get(employee_id="CLOUD-NATURAL-001")
        assert profile.primary_role_id == sample_role.pk
        assert profile.primary_department_id == sample_department.pk
        assert profile.primary_facility_id == sample_facility.pk

    def test_materialize_role_create_reconciles_by_code(self, sample_role):
        """Cloud roles should update same-code local roles instead of failing uniqueness."""
        from hmis.apps.core.models import Role
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "core.Role",
                "operation": "CREATE",
                "record_id": sample_role.pk + 1000,
                "data": {
                    "id": sample_role.pk + 1000,
                    "code": sample_role.code,
                    "name": "Cloud Doctor",
                    "category": sample_role.category,
                    "scope": sample_role.scope,
                    "hierarchy_level": sample_role.hierarchy_level,
                    "is_active": True,
                },
            }
        )

        assert result == {"success": True}
        assert Role.objects.filter(code=sample_role.code).count() == 1
        sample_role.refresh_from_db()
        assert sample_role.name == "Cloud Doctor"

    def test_materialize_org_membership_remaps_identity_dependencies_by_natural_keys(
        self,
        test_staff_profile,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """Org memberships should resolve cloud FK IDs to local identity rows."""
        from hmis.apps.core.models import OrgMembership
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "core.OrgMembership",
                "operation": "CREATE",
                "record_id": 99001,
                "data": {
                    "id": 99001,
                    "staff_profile_id": test_staff_profile.pk + 1000,
                    "staff_username": test_staff_profile.user.username,
                    "staff_profile_employee_id": test_staff_profile.employee_id,
                    "organization_id": sample_organization.pk + 1000,
                    "organization_slug": sample_organization.slug,
                    "role_id": sample_role.pk + 1000,
                    "role_code": sample_role.code,
                    "department_id": sample_department.pk + 1000,
                    "department_code": sample_department.code,
                    "facility_ids": [sample_facility.pk + 1000],
                    "facility_mfl_codes": [sample_facility.mfl_code],
                    "is_primary": True,
                    "status": "ACTIVE",
                },
            }
        )

        assert result == {"success": True}
        membership = OrgMembership.objects.get(staff_profile=test_staff_profile)
        assert membership.organization_id == sample_organization.pk
        assert membership.role_id == sample_role.pk
        assert membership.department_id == sample_department.pk
        assert list(membership.facilities.values_list("pk", flat=True)) == [sample_facility.pk]

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
