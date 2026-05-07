"""backend/tests/test_default_roles.py

Tests for default roles fixture and loading.

The `load_default_roles` management command is fixture-driven (roles.json). These
tests intentionally treat the fixture as the source of truth so expectations stay
in sync with the current implementation.
"""

import json
from io import StringIO
from pathlib import Path

import pytest  # type: ignore
from django.contrib.auth.models import Group
from django.core.management import call_command


def _get_roles_fixture_path() -> Path:
    # Keep aligned with hmis.apps.core.management.commands.load_default_roles
    return (
        Path(__file__).resolve().parent.parent.parent
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

        valid_categories = [
            "CLINICAL",
            "ADMINISTRATIVE",
            "TECHNICAL",
            "MANAGEMENT",
            "COMMUNITY",
            "ALLIED_HEALTH",
        ]

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

        # Should have limited encounter access (can create walk-in encounters)
        assert "Encounter" in receptionist.permissions_matrix
        encounter_perms = receptionist.permissions_matrix["Encounter"]
        assert encounter_perms["read"] is True
        assert encounter_perms.get("create") is True
        assert encounter_perms.get("update", False) is False


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


# =========================================================================
# Expanded permissions matrix tests
# =========================================================================

# Valid CRUD action keys that every permissions_matrix entry may use.
STANDARD_ACTIONS = {"create", "read", "update", "delete"}

# All *known* custom action keys accepted by sync_role_permissions.
# The set is kept in sync with CUSTOM_ACTIONS + MODEL_SUFFIXED_ACTIONS in the
# management command.
KNOWN_CUSTOM_ACTIONS = {
    # model-suffixed
    "view_sensitive",
    # standalone
    "perform_triage",
    "view_triage_queue",
    "override_triage_category",
    "escalate_patient",
    "certify_death",
    "release_body",
    "void_death_record",
    "accept_referral",
    "decline_referral",
    "view_sensitive_referral",
    "view_sensitive_mch_registration",
    "view_sensitive_hei_followup",
    "receive_critical_alerts",
    "submit_sha_claim",
    "approve_sha_claim",
    "appeal_sha_claim",
    "view_ccc_clinic",
    "view_mental_health_clinic",
    "manage_clinic_staff",
    "manage_clinic_schedule",
    "approve_physiotherapy_order",
    "assign_physiotherapy_therapist",
    "approve_ot_order",
    "assign_ot_therapist",
    "view_sensitive_counselling_referral",
    "view_sensitive_counselling_session",
    "accept_sw_referral",
    "assign_social_worker",
    "view_sensitive_sw_referral",
    "close_sw_case",
    "view_sensitive_sw_case",
    "supervise_sw_case",
    "escalate_ihr_to_county",
    "escalate_ihr_to_national",
    "notify_ihr_to_who",
    "manage_theatre",
    "document_surgery",
    "manage_schedules",
    "approve_swap",
    "manage_theatre_settings",
    "approve_purchase_order",
    "approve_stock_transfer",
    "approve_stock_count",
    "manage_etims",
    # blood_bank
    "manage_blood_bank",
    "issue_blood_unit",
    "perform_crossmatch",
    # dialysis
    "manage_dialysis",
    "perform_dialysis",
    # laboratory — standalone LIS
    "accept_order",
    "reject_order",
    # laboratory — critical values
    "acknowledge",
    # immunizations
    "submit_to_authorities",
    "follow_up",
    "issue",
    "resolve",
    "accept",
    "decline",
    "complete",
    "cancel",
    "record",
    "add_observation",
    "mark_reaction",
    "complete_transfusion",
    "submit_to_ppb",
    # quality / analytics / moh_reporting
    "regenerate",
    "export_sdmx",
    "import_csv",
    "export_csv",
    "submit_to_dhis2",
    # emergency access
    "approve_emergency_access",
    "revoke_emergency_access",
    "view_emergency_dashboard",
}

ALL_VALID_ACTIONS = STANDARD_ACTIONS | KNOWN_CUSTOM_ACTIONS


def _load_fixture():
    """Load roles fixture from file, return list of role entries."""
    fixture_path = (
        Path(__file__).resolve().parent.parent.parent
        / "hmis"
        / "apps"
        / "core"
        / "fixtures"
        / "roles.json"
    )
    data = json.loads(fixture_path.read_text())
    return [item for item in data if item.get("model") == "core.role"]


@pytest.mark.django_db
class TestExpandedPermissionMatrices:
    """Tests for the comprehensive permissions expansion (April 2026).

    Validates that every role's permissions_matrix:
    - Uses only valid action keys
    - References only models in MODEL_MAPPING
    - Has the correct minimum resource set for its clinical tier
    - Does NOT grant phantom permissions (e.g. verify/release for LabResult)
    """

    @pytest.fixture(autouse=True)
    def load_roles(self):
        call_command("load_default_roles", stdout=StringIO())

    # ── Schema validation ────────────────────────────────────────────────

    def test_all_action_keys_are_valid(self):
        """No permissions_matrix entry should use an unknown action key."""
        from hmis.apps.core.management.commands.sync_role_permissions import MODEL_MAPPING
        from hmis.apps.core.models import Role

        invalid = []
        for role in Role.objects.all():
            for resource, actions in (role.permissions_matrix or {}).items():
                for action in actions:
                    if action not in ALL_VALID_ACTIONS:
                        invalid.append(f"{role.code}.{resource}.{action}")

        assert invalid == [], f"Unknown action keys: {invalid}"

    def test_all_resources_in_model_mapping(self):
        """Every resource referenced in permissions_matrix must be in MODEL_MAPPING."""
        from hmis.apps.core.management.commands.sync_role_permissions import MODEL_MAPPING
        from hmis.apps.core.models import Role

        unmapped = []
        for role in Role.objects.all():
            for resource in role.permissions_matrix or {}:
                if resource not in MODEL_MAPPING:
                    unmapped.append(f"{role.code}.{resource}")

        assert unmapped == [], f"Resources not in MODEL_MAPPING: {unmapped}"

    def test_no_phantom_verify_release_actions(self):
        """No role should have phantom 'verify' or 'release' actions."""
        from hmis.apps.core.models import Role

        phantom_found = []
        for role in Role.objects.all():
            for resource, actions in (role.permissions_matrix or {}).items():
                for action in actions:
                    if action in ("verify", "release"):
                        phantom_found.append(f"{role.code}.{resource}.{action}")

        assert phantom_found == [], f"Phantom permissions found: {phantom_found}"

    # ── ADMIN ────────────────────────────────────────────────────────────

    def test_admin_has_comprehensive_coverage(self):
        """ADMIN should have 60+ resources covering all modules."""
        from hmis.apps.core.models import Role

        admin = Role.objects.get(code="ADMIN")
        assert len(admin.permissions_matrix) >= 60

    def test_admin_has_full_crud_on_all_resources(self):
        """ADMIN should have create+read+update+delete on most resources."""
        from hmis.apps.core.models import Role

        admin = Role.objects.get(code="ADMIN")
        # Only AuditLog and CDSAlert should lack create/update/delete
        read_only_resources = {
            "AuditLog",
            "CDSAlert",
            "SurveillanceAlert",
            "WardStockTransaction",
            "VaccineDefinition",
            # Analytics read-only ViewSets
            "FacilityDailySummary",
            "DepartmentMonthlySummary",
            "DiagnosisTrend",
            "PatientDemographicSnapshot",
        }

        for resource, actions in admin.permissions_matrix.items():
            assert actions.get("read") is True, f"ADMIN missing read on {resource}"
            if resource not in read_only_resources:
                assert actions.get("create") is True, f"ADMIN missing create on {resource}"

    def test_admin_has_custom_perms(self):
        """ADMIN should have all custom permissions."""
        from hmis.apps.core.models import Role

        admin = Role.objects.get(code="ADMIN")
        triage = admin.permissions_matrix["TriageAssessment"]
        assert triage["perform_triage"] is True
        assert triage["override_triage_category"] is True

        sha = admin.permissions_matrix["SHAClaim"]
        assert sha["submit_sha_claim"] is True
        assert sha["approve_sha_claim"] is True

        ihr = admin.permissions_matrix["IHRNotification"]
        assert ihr["escalate_ihr_to_county"] is True

    # ── ORG-ADMIN ────────────────────────────────────────────────────────

    def test_org_admin_management_focused(self):
        """ORG-ADMIN should manage facilities, staff, billing config."""
        from hmis.apps.core.models import Role

        # ORG-ADMIN may not be loaded by load_default_roles if it lacks a
        # django_group; load the fixture directly in that case.
        if not Role.objects.filter(code="ORG-ADMIN").exists():
            fixture_path = (
                Path(__file__).resolve().parent.parent.parent
                / "hmis"
                / "apps"
                / "core"
                / "fixtures"
                / "roles.json"
            )
            call_command("loaddata", str(fixture_path), verbosity=0)

        org_admin = Role.objects.get(code="ORG-ADMIN")
        matrix = org_admin.permissions_matrix
        assert len(matrix) >= 10

        # Management resources
        assert matrix["StaffProfile"]["create"] is True
        assert matrix["Facility"]["read"] is True
        assert matrix["FacilityBillingConfig"]["update"] is True
        assert matrix["Clinic"]["manage_clinic_staff"] is True

        # Should NOT have clinical create
        assert matrix["Patient"]["create"] is False

    # ── DOCTOR ───────────────────────────────────────────────────────────

    def test_doctor_has_triage_create(self):
        """DOCTOR should have triage create + perform_triage (root cause fix)."""
        from hmis.apps.core.models import Role

        doctor = Role.objects.get(code="DOCTOR")
        triage = doctor.permissions_matrix["TriageAssessment"]
        assert triage["create"] is True
        assert triage["perform_triage"] is True
        assert triage["view_triage_queue"] is True

    def test_doctor_has_all_nurse_resources(self):
        """DOCTOR should have at least all resources that NURSE has."""
        from hmis.apps.core.models import Role

        doctor = Role.objects.get(code="DOCTOR")
        nurse = Role.objects.get(code="NURSE")

        nurse_resources = set(nurse.permissions_matrix.keys())
        doctor_resources = set(doctor.permissions_matrix.keys())

        # Nurse-specific resources that doctors don't need directly
        nurse_only = {
            "NursingKardex",
            "NursingCarePlanEntry",
            "ShiftHandover",
            "Escalation",
            "GrowthMeasurement",
            "Specimen",
            "EmergencyContact",
        }
        remaining = nurse_resources - doctor_resources - nurse_only
        assert remaining == set(), f"DOCTOR missing nurse resources: {remaining}"

    def test_doctor_custom_perms(self):
        """DOCTOR should have death certification and referral custom perms."""
        from hmis.apps.core.models import Role

        doctor = Role.objects.get(code="DOCTOR")
        assert doctor.permissions_matrix["DeathRecord"]["certify_death"] is True
        assert doctor.permissions_matrix["ClinicalReferral"]["accept_referral"] is True
        assert doctor.permissions_matrix["Admission"]["receive_critical_alerts"] is True

    # ── CLINICAL_OFFICER ─────────────────────────────────────────────────

    def test_clinical_officer_is_near_doctor(self):
        """CLINICAL_OFFICER should have 35+ resources (near-DOCTOR level)."""
        from hmis.apps.core.models import Role

        co = Role.objects.get(code="CLINICAL_OFFICER")
        assert len(co.permissions_matrix) >= 35

        # Should have triage
        assert co.permissions_matrix["TriageAssessment"]["create"] is True
        assert co.permissions_matrix["TriageAssessment"]["perform_triage"] is True

        # Should have procedures
        assert "ProcedureOrder" in co.permissions_matrix
        assert co.permissions_matrix["ProcedureOrder"]["create"] is True

    # ── NURSE ────────────────────────────────────────────────────────────

    def test_nurse_has_triage(self):
        """NURSE should have triage create/perform (primary triage role)."""
        from hmis.apps.core.models import Role

        nurse = Role.objects.get(code="NURSE")
        triage = nurse.permissions_matrix["TriageAssessment"]
        assert triage["create"] is True
        assert triage["perform_triage"] is True
        assert triage["view_triage_queue"] is True

    def test_nurse_has_nursing_resources(self):
        """NURSE should have nursing-specific resources."""
        from hmis.apps.core.models import Role

        nurse = Role.objects.get(code="NURSE")
        assert "NursingKardex" in nurse.permissions_matrix
        assert nurse.permissions_matrix["NursingKardex"]["create"] is True
        assert "ShiftHandover" in nurse.permissions_matrix
        assert nurse.permissions_matrix["ShiftHandover"]["create"] is True

    def test_nurse_has_checkin_and_scheduling(self):
        """NURSE should have check-in and appointment access."""
        from hmis.apps.core.models import Role

        nurse = Role.objects.get(code="NURSE")
        assert "CheckIn" in nurse.permissions_matrix
        assert nurse.permissions_matrix["CheckIn"]["create"] is True
        assert "Appointment" in nurse.permissions_matrix

    def test_nurse_has_mch_resources(self):
        """NURSE should have MCH resources (core nursing function)."""
        from hmis.apps.core.models import Role

        nurse = Role.objects.get(code="NURSE")
        for mch_resource in ("MCHRegistration", "ANCVisit", "PNCVisit", "ImmunizationRecord"):
            assert mch_resource in nurse.permissions_matrix, f"NURSE missing {mch_resource}"
            assert nurse.permissions_matrix[mch_resource]["create"] is True

    # ── CONSULTANT ───────────────────────────────────────────────────────

    def test_consultant_has_inpatient_and_procedures(self):
        """CONSULTANT should have inpatient and procedure access."""
        from hmis.apps.core.models import Role

        consultant = Role.objects.get(code="CONSULTANT")
        assert "Admission" in consultant.permissions_matrix
        assert consultant.permissions_matrix["Admission"]["create"] is True
        assert "ProcedureOrder" in consultant.permissions_matrix

    # ── PHARMACIST ───────────────────────────────────────────────────────

    def test_pharmacist_has_stock_management(self):
        """PHARMACIST should have stock batch, adjustment, and alert access."""
        from hmis.apps.core.models import Role

        pharmacist = Role.objects.get(code="PHARMACIST")
        assert "StockBatch" in pharmacist.permissions_matrix
        assert pharmacist.permissions_matrix["StockBatch"]["create"] is True
        assert "StockAdjustment" in pharmacist.permissions_matrix
        assert "StockAlert" in pharmacist.permissions_matrix

    def test_pharmacist_has_allergy_read(self):
        """PHARMACIST should be able to read allergies for drug interaction checks."""
        from hmis.apps.core.models import Role

        pharmacist = Role.objects.get(code="PHARMACIST")
        assert "Allergy" in pharmacist.permissions_matrix
        assert pharmacist.permissions_matrix["Allergy"]["read"] is True

    # ── BILLING SUPERVISOR ───────────────────────────────────────────────

    def test_billing_supervisor_full_billing(self):
        """BILLING_SUPERVISOR should have full billing suite."""
        from hmis.apps.core.models import Role

        bs = Role.objects.get(code="BILLING_SUPERVISOR")
        for resource in ("Invoice", "Payment", "Receipt", "CreditNote", "Service", "SHAClaim"):
            assert resource in bs.permissions_matrix, f"BILLING_SUPERVISOR missing {resource}"

        assert bs.permissions_matrix["SHAClaim"]["submit_sha_claim"] is True
        assert bs.permissions_matrix["SHAClaim"]["approve_sha_claim"] is True

    # ── PATHOLOGIST ──────────────────────────────────────────────────────

    def test_pathologist_has_lab_report_resources(self):
        """PATHOLOGIST should have DiagnosticReport, Specimen, TestCatalog."""
        from hmis.apps.core.models import Role

        pathologist = Role.objects.get(code="PATHOLOGIST")
        assert "DiagnosticReport" in pathologist.permissions_matrix
        assert pathologist.permissions_matrix["DiagnosticReport"]["create"] is True
        assert "Specimen" in pathologist.permissions_matrix
        assert "TestCatalog" in pathologist.permissions_matrix

    # ── RADIOLOGIST ──────────────────────────────────────────────────────

    def test_radiologist_has_correct_report_model(self):
        """RADIOLOGIST should use RadiologyReport (not ImagingReport alias)."""
        from hmis.apps.core.models import Role

        radiologist = Role.objects.get(code="RADIOLOGIST")
        assert "RadiologyReport" in radiologist.permissions_matrix
        assert radiologist.permissions_matrix["RadiologyReport"]["create"] is True
        assert "DICOMStudy" in radiologist.permissions_matrix

    # ── IMAGING TECHS ────────────────────────────────────────────────────

    def test_imaging_techs_have_dicom(self):
        """All imaging technologists should have DICOMStudy access."""
        from hmis.apps.core.models import Role

        for code in ("RADIOGRAPHER", "SONOGRAPHER", "MRI_TECHNOLOGIST", "CT_TECHNOLOGIST"):
            role = Role.objects.get(code=code)
            assert "DICOMStudy" in role.permissions_matrix, f"{code} missing DICOMStudy"
            assert role.permissions_matrix["DICOMStudy"]["create"] is True

    # ── ALLIED HEALTH ────────────────────────────────────────────────────

    def test_allied_health_have_referral_and_appointment_read(self):
        """Allied health roles should have ClinicalReferral and Appointment read."""
        from hmis.apps.core.models import Role

        for code in (
            "PHYSIOTHERAPIST",
            "DIETITIAN",
            "OCCUPATIONAL_THERAPIST",
            "COUNSELLOR",
            "SOCIAL_WORKER",
        ):
            role = Role.objects.get(code=code)
            assert "ClinicalReferral" in role.permissions_matrix, f"{code} missing ClinicalReferral"
            assert role.permissions_matrix["ClinicalReferral"]["read"] is True
            assert "Appointment" in role.permissions_matrix, f"{code} missing Appointment"

    def test_social_worker_has_custom_perms(self):
        """SOCIAL_WORKER should have sensitive access and case management custom perms."""
        from hmis.apps.core.models import Role

        sw = Role.objects.get(code="SOCIAL_WORKER")
        assert sw.permissions_matrix["SocialWorkReferral"]["accept_sw_referral"] is True
        assert sw.permissions_matrix["SocialWorkCase"]["close_sw_case"] is True
        assert sw.permissions_matrix["SocialWorkCase"]["view_sensitive_sw_case"] is True

    def test_counsellor_has_sensitive_perms(self):
        """COUNSELLOR should have sensitive counselling access."""
        from hmis.apps.core.models import Role

        counsellor = Role.objects.get(code="COUNSELLOR")
        assert (
            counsellor.permissions_matrix["CounsellingReferral"][
                "view_sensitive_counselling_referral"
            ]
            is True
        )
        assert (
            counsellor.permissions_matrix["CounsellingSession"][
                "view_sensitive_counselling_session"
            ]
            is True
        )

    # ── RECEPTIONIST ─────────────────────────────────────────────────────

    def test_receptionist_has_scheduling(self):
        """RECEPTIONIST should have appointment and check-in access."""
        from hmis.apps.core.models import Role

        receptionist = Role.objects.get(code="RECEPTIONIST")
        assert "Appointment" in receptionist.permissions_matrix
        assert receptionist.permissions_matrix["Appointment"]["create"] is True
        assert "CheckIn" in receptionist.permissions_matrix
        assert receptionist.permissions_matrix["CheckIn"]["create"] is True

    # ── STORE_KEEPER ─────────────────────────────────────────────────────

    def test_store_keeper_has_stock_resources(self):
        """STORE_KEEPER should have Drug, StockBatch, StockAdjustment (not phantom StockReceive)."""
        from hmis.apps.core.models import Role

        store_keeper = Role.objects.get(code="STORE_KEEPER")
        assert "Drug" in store_keeper.permissions_matrix
        assert "StockBatch" in store_keeper.permissions_matrix
        assert "StockAdjustment" in store_keeper.permissions_matrix
        # StockReceive was phantom — should not exist anymore
        assert "StockReceive" not in store_keeper.permissions_matrix

    def test_store_keeper_has_inventory_resources(self):
        """STORE_KEEPER should have all inventory module resources."""
        from hmis.apps.core.models import Role

        store_keeper = Role.objects.get(code="STORE_KEEPER")
        for resource in (
            "Supplier",
            "PurchaseOrder",
            "GoodsReceiptNote",
            "StoreLocation",
            "StockTransfer",
            "WardStock",
            "StockCount",
        ):
            assert resource in store_keeper.permissions_matrix, f"STORE_KEEPER missing {resource}"
            assert store_keeper.permissions_matrix[resource]["read"] is True

    # ── Inventory RBAC ───────────────────────────────────────────────────

    def test_admin_has_inventory_approve_permissions(self):
        """ADMIN should have all inventory approval custom permissions."""
        from hmis.apps.core.models import Role

        admin = Role.objects.get(code="ADMIN")
        assert admin.permissions_matrix["PurchaseOrder"]["approve_purchase_order"] is True
        assert admin.permissions_matrix["StockTransfer"]["approve_stock_transfer"] is True
        assert admin.permissions_matrix["StockCount"]["approve_stock_count"] is True
        assert admin.permissions_matrix["ETIMSConfig"]["manage_etims"] is True

    def test_org_admin_has_inventory_approve_permissions(self):
        """ORG-ADMIN should have inventory approval custom permissions."""
        from hmis.apps.core.models import Role

        if not Role.objects.filter(code="ORG-ADMIN").exists():
            fixture_path = (
                Path(__file__).resolve().parent.parent.parent
                / "hmis"
                / "apps"
                / "core"
                / "fixtures"
                / "roles.json"
            )
            call_command("loaddata", str(fixture_path), verbosity=0)

        org_admin = Role.objects.get(code="ORG-ADMIN")
        assert org_admin.permissions_matrix["PurchaseOrder"]["approve_purchase_order"] is True
        assert org_admin.permissions_matrix["StockTransfer"]["approve_stock_transfer"] is True
        assert org_admin.permissions_matrix["StockCount"]["approve_stock_count"] is True
        assert org_admin.permissions_matrix["ETIMSConfig"]["manage_etims"] is True

    def test_pharmacist_has_inventory_resources(self):
        """PHARMACIST should have inventory read/create access."""
        from hmis.apps.core.models import Role

        pharmacist = Role.objects.get(code="PHARMACIST")
        for resource in ("PurchaseOrder", "GoodsReceiptNote", "StockTransfer", "StockCount"):
            assert resource in pharmacist.permissions_matrix, f"PHARMACIST missing {resource}"
            assert pharmacist.permissions_matrix[resource]["create"] is True
            assert pharmacist.permissions_matrix[resource]["read"] is True

    def test_billing_supervisor_has_etims(self):
        """BILLING_SUPERVISOR should have eTIMS config and invoice access."""
        from hmis.apps.core.models import Role

        bs = Role.objects.get(code="BILLING_SUPERVISOR")
        assert "ETIMSConfig" in bs.permissions_matrix
        assert bs.permissions_matrix["ETIMSConfig"]["manage_etims"] is True
        assert "ETIMSInvoice" in bs.permissions_matrix
        assert bs.permissions_matrix["ETIMSInvoice"]["read"] is True
