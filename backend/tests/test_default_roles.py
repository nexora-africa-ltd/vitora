"""backend/tests/test_default_roles.py

Tests for default roles fixture and loading.

The `load_default_roles` management command is fixture-driven (roles.json). These
tests intentionally treat the fixture as the source of truth so expectations stay
in sync with the current implementation.
"""

import json
from pathlib import Path

from io import StringIO

import pytest  # type: ignore
from django.contrib.auth.models import Group
from django.core.management import call_command


def _get_roles_fixture_path() -> Path:
    # Keep aligned with hmis.apps.core.management.commands.load_default_roles
    return (
        Path(__file__).resolve().parent.parent
        / "hmis"
        / "apps"
        / "core"
        / "fixtures"
        / "roles.json"
    )


def _get_expected_role_codes_from_fixture() -> set[str]:
    fixture_path = _get_roles_fixture_path()
    data = json.loads(fixture_path.read_text())
    return {item["fields"]["code"] for item in data if item.get("model") == "core.role"}


@pytest.mark.django_db
class TestDefaultRolesFixture:
    """Tests for default roles data and loading."""

    def test_all_default_roles_load_successfully(self):
        """Should load all default roles from the roles.json fixture without errors."""
        from hmis.apps.core.models import Role

        expected_codes = _get_expected_role_codes_from_fixture()

        # Load default roles
        out = StringIO()
        call_command("load_default_roles", stdout=out)

        # Check all roles created
        assert Role.objects.count() == len(expected_codes)

        # Check every fixture role exists
        for code in expected_codes:
            assert Role.objects.filter(code=code).exists(), f"Role {code} not found"

    def test_role_hierarchy_levels_consistent(self):
        """Should have consistent hierarchy levels (0=highest)."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        admin = Role.objects.get(code="ADMIN")
        doctor = Role.objects.get(code="DOCTOR")
        nurse = Role.objects.get(code="NURSE")
        chw = Role.objects.get(code="CHW")

        # Verify hierarchy ordering
        assert admin.hierarchy_level < doctor.hierarchy_level
        assert doctor.hierarchy_level < nurse.hierarchy_level
        assert nurse.hierarchy_level < chw.hierarchy_level

    def test_permission_matrices_valid_json(self):
        """Should have valid JSON permission matrices for all roles."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        for role in Role.objects.all():
            # Check permissions_matrix is a dict
            assert isinstance(role.permissions_matrix, dict)

            # Check structure
            for resource, actions in role.permissions_matrix.items():
                assert isinstance(resource, str)
                assert isinstance(actions, dict)
                for action, allowed in actions.items():
                    assert isinstance(action, str)
                    assert isinstance(allowed, bool)

    def test_licensed_roles_have_license_body(self):
        """Should set license_body for roles requiring licenses."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        doctor = Role.objects.get(code="DOCTOR")
        nurse = Role.objects.get(code="NURSE")
        lab_tech = Role.objects.get(code="LAB_TECH")
        pharmacist = Role.objects.get(code="PHARMACIST")

        # Licensed roles should have license_body
        assert doctor.requires_license is True
        assert doctor.license_body == "KMPDB"

        assert nurse.requires_license is True
        assert nurse.license_body == "NCK"

        assert lab_tech.requires_license is True
        assert lab_tech.license_body == "KMLTTB"

        assert pharmacist.requires_license is True
        assert pharmacist.license_body == "PPB"

    def test_django_groups_created_for_roles(self):
        """Should create Django Groups for each role."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        for role in Role.objects.all():
            # Each role should have a linked Django group
            assert role.django_group is not None
            assert isinstance(role.django_group, Group)
            assert role.django_group.name == role.name

    def test_role_categories_valid(self):
        """Should have valid role categories."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        valid_categories = ["CLINICAL", "ADMINISTRATIVE", "TECHNICAL", "MANAGEMENT", "COMMUNITY"]

        for role in Role.objects.all():
            assert role.category in valid_categories

    def test_duplicate_role_codes_rejected(self):
        """Should reject duplicate role codes on reload."""
        from django.db import IntegrityError

        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        # Try to create duplicate
        with pytest.raises(IntegrityError):
            Role.objects.create(
                code="DOCTOR",
                name="Duplicate Doctor",
                category="CLINICAL",
            )

    def test_role_update_preserves_permissions(self):
        """Should preserve custom permissions when updating roles."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        # Get doctor role
        doctor = Role.objects.get(code="DOCTOR")
        original_perms = doctor.permissions_matrix.copy()

        # Manually add a custom permission
        doctor.permissions_matrix["CustomResource"] = {"read": True}
        doctor.save()

        # Reload roles with update flag
        call_command("load_default_roles", "--update", stdout=StringIO())

        # Check custom permission preserved
        doctor.refresh_from_db()
        assert "CustomResource" in doctor.permissions_matrix

        # But default permissions should be updated
        for resource in original_perms:
            assert resource in doctor.permissions_matrix

    def test_admin_role_has_all_permissions(self):
        """Should give admin role comprehensive permissions."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        admin = Role.objects.get(code="ADMIN")

        # Check admin has permissions for key resources
        assert "Patient" in admin.permissions_matrix
        assert "Encounter" in admin.permissions_matrix
        assert "StaffProfile" in admin.permissions_matrix
        assert "Role" in admin.permissions_matrix
        assert "Department" in admin.permissions_matrix

        # Check admin can do all CRUD operations on Patient
        patient_perms = admin.permissions_matrix["Patient"]
        assert patient_perms["create"] is True
        assert patient_perms["read"] is True
        assert patient_perms["update"] is True
        assert patient_perms["delete"] is True
        assert patient_perms["view_sensitive"] is True

    def test_receptionist_limited_permissions(self):
        """Should give receptionist only necessary permissions."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        receptionist = Role.objects.get(code="RECEPTIONIST")

        # Should have patient access but limited
        assert "Patient" in receptionist.permissions_matrix
        patient_perms = receptionist.permissions_matrix["Patient"]

        assert patient_perms["create"] is True
        assert patient_perms["read"] is True
        assert patient_perms["update"] is True
        assert patient_perms["delete"] is False
        assert patient_perms["view_sensitive"] is False

        # Should have limited encounter access
        assert "Encounter" in receptionist.permissions_matrix
        encounter_perms = receptionist.permissions_matrix["Encounter"]
        assert encounter_perms["read"] is True
        assert encounter_perms.get("create", False) is False


@pytest.mark.django_db
class TestLoadDefaultRolesCommand:
    """Tests for load_default_roles management command."""

    def test_command_runs_without_errors(self):
        """Should run command successfully."""
        out = StringIO()
        call_command("load_default_roles", stdout=out)

        output = out.getvalue()
        assert "Successfully loaded" in output or "default roles" in output.lower()

    def test_command_with_verbose_flag(self):
        """Should output detailed information with --verbose flag."""
        out = StringIO()
        call_command("load_default_roles", "--verbose", stdout=out)

        output = out.getvalue()
        # Should show progress for each role
        assert "ADMIN" in output or "DOCTOR" in output

    def test_command_idempotent(self):
        """Should be idempotent - running twice doesn't duplicate."""
        from hmis.apps.core.models import Role

        expected_codes = _get_expected_role_codes_from_fixture()

        # Run command twice
        call_command("load_default_roles", stdout=StringIO())
        first_count = Role.objects.count()

        call_command("load_default_roles", stdout=StringIO())
        second_count = Role.objects.count()

        # Should have same count (no duplicates)
        assert first_count == second_count
        assert first_count == len(expected_codes)

    def test_command_with_update_flag(self):
        """Should update existing roles with --update flag."""
        from hmis.apps.core.models import Role

        # Load initial roles
        call_command("load_default_roles", stdout=StringIO())

        # Modify a role
        doctor = Role.objects.get(code="DOCTOR")
        doctor.name = "Modified Name"
        doctor.save()

        # Reload with update
        call_command("load_default_roles", "--update", stdout=StringIO())

        # Name should be restored to default
        doctor.refresh_from_db()
        assert doctor.name == "Medical Doctor"

    def test_command_with_dry_run_flag(self):
        """Should not create roles with --dry-run flag."""
        from hmis.apps.core.models import Role

        out = StringIO()
        call_command("load_default_roles", "--dry-run", stdout=out)

        # No roles should be created
        assert Role.objects.count() == 0

        # But output should show what would be created
        output = out.getvalue()
        assert "would create" in output.lower() or "dry run" in output.lower()
