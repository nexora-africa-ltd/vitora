"""
Tests for RBAC default roles fixture.
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation - Default Roles Fixture
"""

import json
from pathlib import Path

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.management import call_command

User = get_user_model()


# Expected default roles from deliverables spec
EXPECTED_ROLES = [
    "ADMIN",
    "DOCTOR",
    "CONSULTANT",  # External service provider doctor
    "CLINICAL_OFFICER",
    "NURSE",
    "NURSE_AIDE",  # Lowest rank medical staff
    "LAB_TECH",
    "PHARMACIST",
    "RECEPTIONIST",
    "RECORDS_CLERK",
    "CHW",
]

# Licensed roles with their Kenya regulatory bodies
LICENSED_ROLES = {
    "DOCTOR": "KMPDB",
    "CONSULTANT": "KMPDB",  # External doctors still need KMPDB license
    "CLINICAL_OFFICER": "COC",  # Clinical Officers Council (not KMPDB)
    "NURSE": "NCK",
    "LAB_TECH": "KMLTTB",
    "PHARMACIST": "PPB",
}


@pytest.mark.django_db
class TestDefaultRolesFixture:
    """Tests for default roles fixture loading."""

    @pytest.fixture
    def fixture_path(self):
        """Get path to roles fixture."""
        return Path(__file__).parent.parent / "hmis" / "apps" / "core" / "fixtures" / "roles.json"

    def test_fixture_file_exists(self, fixture_path):
        """Should have roles.json fixture file in core/fixtures/."""
        assert fixture_path.exists(), f"Fixture file not found at {fixture_path}"

    def test_fixture_is_valid_json(self, fixture_path):
        """Should contain valid JSON data."""
        with open(fixture_path) as f:
            data = json.load(f)

        assert isinstance(data, list), "Fixture should be a JSON array"
        assert len(data) > 0, "Fixture should contain at least one role"

    def test_all_default_roles_load_successfully(self, fixture_path):
        """Should load all default roles from fixture."""
        from hmis.apps.core.models import Role

        # Load fixture
        call_command("loaddata", str(fixture_path), verbosity=0)

        # Check all expected roles exist
        for code in EXPECTED_ROLES:
            assert Role.objects.filter(
                code=code
            ).exists(), f"Role {code} not found after loading fixture"

    def test_role_hierarchy_levels_consistent(self, fixture_path):
        """Should have consistent hierarchy levels reflecting Kenya hospital structure."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        # ADMIN should be highest (level 0)
        admin = Role.objects.get(code="ADMIN")
        assert admin.hierarchy_level == 0, "ADMIN should have hierarchy_level 0"

        # DOCTOR and CONSULTANT should be level 2
        doctor = Role.objects.get(code="DOCTOR")
        assert doctor.hierarchy_level == 2, "DOCTOR should have hierarchy_level 2"

        consultant = Role.objects.get(code="CONSULTANT")
        assert consultant.hierarchy_level == 2, "CONSULTANT should have hierarchy_level 2"

        # CLINICAL_OFFICER just below doctor (level 3)
        clinical_officer = Role.objects.get(code="CLINICAL_OFFICER")
        assert (
            clinical_officer.hierarchy_level == 3
        ), "CLINICAL_OFFICER should have hierarchy_level 3"

        # NURSE below clinical officer (level 4)
        nurse = Role.objects.get(code="NURSE")
        assert nurse.hierarchy_level == 4, "NURSE should have hierarchy_level 4"

        # NURSE_AIDE below nurse but above CHW (level 5)
        nurse_aide = Role.objects.get(code="NURSE_AIDE")
        assert nurse_aide.hierarchy_level == 5, "NURSE_AIDE should have hierarchy_level 5"

        # CHW should be level 6
        chw = Role.objects.get(code="CHW")
        assert chw.hierarchy_level == 6, "CHW should have hierarchy_level 6"

    def test_permissions_matrices_valid_json(self, fixture_path):
        """Should have valid JSON permission matrices for all roles."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        for role in Role.objects.all():
            assert isinstance(
                role.permissions_matrix, dict
            ), f"Role {role.code} permissions_matrix should be a dict"

            # Each resource should have action keys
            for resource, actions in role.permissions_matrix.items():
                assert isinstance(
                    actions, dict
                ), f"Role {role.code} resource {resource} should have dict of actions"
                for action, value in actions.items():
                    assert isinstance(
                        value, bool
                    ), f"Role {role.code} {resource}.{action} should be boolean"

    def test_licensed_roles_have_license_body(self, fixture_path):
        """Should set license_body for roles requiring license."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        for code, expected_body in LICENSED_ROLES.items():
            role = Role.objects.get(code=code)
            assert role.requires_license is True, f"Role {code} should require license"
            assert (
                role.license_body == expected_body
            ), f"Role {code} should have license_body {expected_body}"

    def test_unlicensed_roles_no_license_body(self, fixture_path):
        """Should not require license for administrative and aide roles."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        unlicensed_roles = ["ADMIN", "RECEPTIONIST", "RECORDS_CLERK", "CHW", "NURSE_AIDE"]
        for code in unlicensed_roles:
            role = Role.objects.get(code=code)
            assert role.requires_license is False, f"Role {code} should not require license"

    def test_django_groups_created_for_roles(self, fixture_path):
        """Should create Django Groups linked to roles."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        # Each role should have a linked Django Group
        for code in EXPECTED_ROLES:
            role = Role.objects.get(code=code)
            assert role.django_group is not None, f"Role {code} should have linked Django Group"
            assert (
                role.django_group.name == role.name
            ), f"Role {code} Django Group should have name '{role.name}'"

    def test_role_categories_valid(self, fixture_path):
        """Should have valid category for each role."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        # Categories aligned with base.py RBAC_HIERARCHY_LEVELS
        valid_categories = ["CLINICAL", "ADMINISTRATIVE", "TECHNICAL", "MANAGEMENT", "COMMUNITY"]

        for role in Role.objects.all():
            assert (
                role.category in valid_categories
            ), f"Role {role.code} has invalid category {role.category}"

    def test_duplicate_role_codes_rejected(self):
        """Should reject duplicate role codes."""
        from django.db import IntegrityError

        from hmis.apps.core.models import Role

        Role.objects.create(
            code="DUPLICATE",
            name="First Role",
            category="CLINICAL",
        )

        with pytest.raises(IntegrityError):
            Role.objects.create(
                code="DUPLICATE",
                name="Second Role",
                category="CLINICAL",
            )

    def test_role_update_preserves_permissions(self, fixture_path):
        """Should preserve permissions when updating role."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        doctor = Role.objects.get(code="DOCTOR")
        original_perms = doctor.permissions_matrix.copy()

        # Update role name
        doctor.name = "Senior Medical Doctor"
        doctor.save()

        # Reload and check permissions preserved
        doctor.refresh_from_db()
        assert (
            doctor.permissions_matrix == original_perms
        ), "Permissions should be preserved after update"

    def test_admin_role_has_full_permissions(self, fixture_path):
        """Should give ADMIN role full access to key resources."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        admin = Role.objects.get(code="ADMIN")

        # Admin should have full CRUD + view_sensitive for Patient
        patient_perms = admin.permissions_matrix.get("Patient", {})
        assert patient_perms.get("create") is True
        assert patient_perms.get("read") is True
        assert patient_perms.get("update") is True
        assert patient_perms.get("delete") is True
        assert patient_perms.get("view_sensitive") is True

    def test_clinical_roles_have_patient_access(self, fixture_path):
        """Should give clinical roles patient read/create access."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        # CHW is COMMUNITY category, not CLINICAL
        clinical_roles = ["DOCTOR", "NURSE", "CLINICAL_OFFICER", "CONSULTANT"]

        for code in clinical_roles:
            role = Role.objects.get(code=code)
            patient_perms = role.permissions_matrix.get("Patient", {})
            assert patient_perms.get("read") is True, f"Role {code} should be able to read patients"

    def test_clinical_officer_registered_by_COC(self, fixture_path):
        """Clinical Officers should be registered by COC (Clinical Officers Council)."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        clinical_officer = Role.objects.get(code="CLINICAL_OFFICER")
        assert clinical_officer.requires_license is True
        assert (
            clinical_officer.license_body == "COC"
        ), "Clinical Officer should be registered by COC, not KMPDB"

    def test_clinical_officer_ranks_above_nurse(self, fixture_path):
        """Clinical Officer should rank higher than Registered Nurse."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        clinical_officer = Role.objects.get(code="CLINICAL_OFFICER")
        nurse = Role.objects.get(code="NURSE")

        # Lower hierarchy_level = higher rank
        assert (
            clinical_officer.hierarchy_level < nurse.hierarchy_level
        ), "Clinical Officer should rank above Nurse (lower hierarchy level)"

    def test_consultant_is_external_service_provider(self, fixture_path):
        """Consultant role should be marked as external service provider."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        consultant = Role.objects.get(code="CONSULTANT")

        # Consultant should be clinical category
        assert consultant.category == "CLINICAL"
        # Should require KMPDB license (they are doctors)
        assert consultant.requires_license is True
        assert consultant.license_body == "KMPDB"
        # Should have same hierarchy as doctor
        doctor = Role.objects.get(code="DOCTOR")
        assert consultant.hierarchy_level == doctor.hierarchy_level

    def test_consultant_has_appropriate_permissions(self, fixture_path):
        """Consultant should have read-heavy permissions (external provider)."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        consultant = Role.objects.get(code="CONSULTANT")

        # Should be able to read patients and encounters
        patient_perms = consultant.permissions_matrix.get("Patient", {})
        assert patient_perms.get("read") is True

        encounter_perms = consultant.permissions_matrix.get("Encounter", {})
        assert encounter_perms.get("read") is True
        # Should be able to create encounters (consultations)
        assert encounter_perms.get("create") is True

    def test_nurse_aide_ranks_below_nurse_above_chw(self, fixture_path):
        """Nurse Aide should rank below Nurse but above CHW."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        nurse = Role.objects.get(code="NURSE")
        nurse_aide = Role.objects.get(code="NURSE_AIDE")
        chw = Role.objects.get(code="CHW")

        # Nurse Aide should be between Nurse and CHW
        assert (
            nurse.hierarchy_level < nurse_aide.hierarchy_level
        ), "Nurse should rank above Nurse Aide"
        assert nurse_aide.hierarchy_level < chw.hierarchy_level, "Nurse Aide should rank above CHW"

    def test_nurse_aide_has_limited_permissions(self, fixture_path):
        """Nurse Aide should have limited permissions (assistive role)."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        nurse_aide = Role.objects.get(code="NURSE_AIDE")

        # Should be able to read patients
        patient_perms = nurse_aide.permissions_matrix.get("Patient", {})
        assert patient_perms.get("read") is True
        # Should NOT be able to create/update patients
        assert patient_perms.get("create") is False
        assert patient_perms.get("update") is False

    def test_nurse_aide_is_technical_category(self, fixture_path):
        """Nurse Aide should be TECHNICAL category (nurse with limited capabilities)."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        nurse_aide = Role.objects.get(code="NURSE_AIDE")
        assert (
            nurse_aide.category == "TECHNICAL"
        ), "NURSE_AIDE should be TECHNICAL category (nurse with limited capabilities)"

    def test_chw_is_community_category(self, fixture_path):
        """CHW should be COMMUNITY category (community outreach)."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        chw = Role.objects.get(code="CHW")
        assert chw.category == "COMMUNITY", "CHW should be COMMUNITY category, not CLINICAL"

    def test_categories_align_with_settings(self, fixture_path):
        """Role categories should align with base.py RBAC_HIERARCHY_LEVELS."""

        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        # Map hierarchy levels to expected categories from settings
        level_to_category = {
            0: "ADMINISTRATIVE",  # ADMIN
            2: "CLINICAL",  # DOCTOR, CONSULTANT (CLINICAL_SENIOR maps to CLINICAL)
            3: "CLINICAL",  # CLINICAL_OFFICER
            4: "TECHNICAL",  # NURSE, LAB_TECH, PHARMACIST
            5: "TECHNICAL",  # NURSE_AIDE (also ADMINISTRATIVE for RECEPTIONIST, RECORDS_CLERK)
            6: "COMMUNITY",  # CHW
        }

        # Verify key roles match their expected categories
        expected_categories = {
            "ADMIN": "ADMINISTRATIVE",
            "DOCTOR": "CLINICAL",
            "CONSULTANT": "CLINICAL",
            "CLINICAL_OFFICER": "CLINICAL",
            "NURSE": "CLINICAL",
            "NURSE_AIDE": "TECHNICAL",
            "LAB_TECH": "TECHNICAL",
            "PHARMACIST": "TECHNICAL",
            "RECEPTIONIST": "ADMINISTRATIVE",
            "RECORDS_CLERK": "ADMINISTRATIVE",
            "CHW": "COMMUNITY",
        }

        for code, expected_cat in expected_categories.items():
            role = Role.objects.get(code=code)
            assert (
                role.category == expected_cat
            ), f"Role {code} should have category {expected_cat}, got {role.category}"

    def test_medical_hierarchy_order(self, fixture_path):
        """Should maintain proper Kenya medical hierarchy order."""
        from hmis.apps.core.models import Role

        call_command("loaddata", str(fixture_path), verbosity=0)

        # Expected hierarchy (lower number = higher rank):
        # DOCTOR/CONSULTANT (2) > CLINICAL_OFFICER (3) > NURSE (4) >
        # NURSE_AIDE (5) > CHW (6)

        doctor = Role.objects.get(code="DOCTOR")
        consultant = Role.objects.get(code="CONSULTANT")
        clinical_officer = Role.objects.get(code="CLINICAL_OFFICER")
        nurse = Role.objects.get(code="NURSE")
        nurse_aide = Role.objects.get(code="NURSE_AIDE")
        chw = Role.objects.get(code="CHW")

        # Verify hierarchy chain
        assert (
            doctor.hierarchy_level == consultant.hierarchy_level
        ), "Doctor and Consultant should be same level"
        assert (
            doctor.hierarchy_level < clinical_officer.hierarchy_level
        ), "Doctor should rank above Clinical Officer"
        assert (
            clinical_officer.hierarchy_level < nurse.hierarchy_level
        ), "Clinical Officer should rank above Nurse"
        assert (
            nurse.hierarchy_level < nurse_aide.hierarchy_level
        ), "Nurse should rank above Nurse Aide"
        assert nurse_aide.hierarchy_level < chw.hierarchy_level, "Nurse Aide should rank above CHW"
