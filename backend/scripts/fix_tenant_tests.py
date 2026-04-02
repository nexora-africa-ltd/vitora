"""
Fix remaining test failures caused by multi-tenancy scoping.

This script applies targeted fixes to test files where:
1. Custom auth users lack StaffProfile (causing 404 from TenantScopedViewMixin)
2. Test data objects missing facility/organization (tenant filtering excludes them)
3. ProtectedError on deletion (StaffProfile references prevent deleting Facility/Org)
"""
import re
import sys


def apply_replacements(filepath, replacements):
    """Apply a list of (old, new) replacements to a file. Returns count of changes."""
    with open(filepath) as f:
        content = f.read()
    count = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new, 1)
            count += 1
    with open(filepath, "w") as f:
        f.write(content)
    return count


# ===========================================================================
# GROUP A: Custom auth without StaffProfile
# ===========================================================================

def fix_audit_log():
    """tests/core/test_audit_log.py - add StaffProfile to inline force_authenticate calls."""
    fp = "tests/core/test_audit_log.py"
    replacements = []

    # TestPatientAuditLogs uses api_client.force_authenticate(user=test_user) inline
    # Need to add ensure_staff_profile before those calls
    # The class methods receive test_user, api_client, sample_patient as fixtures
    # We need to add sample_organization, sample_facility and call ensure_staff_profile

    # Fix: Add a fixture that wraps the api_client with StaffProfile
    old = '''class TestPatientAuditLogs:
    """Tests for patient-related audit logging."""

    def test_patient_creation_is_logged(self, api_client, test_user, patient_data):'''
    new = '''class TestPatientAuditLogs:
    """Tests for patient-related audit logging."""

    @pytest.fixture(autouse=True)
    def _ensure_audit_user_profile(self, test_user, sample_organization, sample_facility):
        from tests.conftest import ensure_staff_profile
        ensure_staff_profile(test_user, sample_organization, sample_facility)

    def test_patient_creation_is_logged(self, api_client, test_user, patient_data):'''
    replacements.append((old, new))

    # Fix test_non_admin_can_view_only_their_own_audit_logs - uses test_user
    # who accesses patient, but patient must be in same org
    old = '''    def test_non_admin_can_view_only_their_own_audit_logs(
        self, api_client, test_user, admin_user, sample_patient
    ):'''
    new = '''    def test_non_admin_can_view_only_their_own_audit_logs(
        self, api_client, test_user, admin_user, sample_patient, sample_organization, sample_facility
    ):'''
    replacements.append((old, new))

    # Also ensure admin_user has profile in that test
    old = '''        # Admin views a patient
        api_client.force_authenticate(user=admin_user)
        api_client.get(f"/api/patients/{sample_patient.id}/")

        # Non-admin views a patient
        api_client.force_authenticate(user=test_user)
        api_client.get(f"/api/patients/{sample_patient.id}/")'''
    new = '''        from tests.conftest import ensure_staff_profile
        # Admin views a patient
        ensure_staff_profile(admin_user, sample_organization, sample_facility, employee_id="AUDIT-ADM")
        api_client.force_authenticate(user=admin_user)
        api_client.get(f"/api/patients/{sample_patient.id}/")

        # Non-admin views a patient
        api_client.force_authenticate(user=test_user)
        api_client.get(f"/api/patients/{sample_patient.id}/")'''
    replacements.append((old, new))

    # Fix TestKenyaDPACompliance::test_audit_log_captures_data_subject_access
    old = '''    def test_audit_log_captures_data_subject_access(
        self, api_client, test_user, sample_patient'''
    new = '''    def test_audit_log_captures_data_subject_access(
        self, api_client, test_user, sample_patient, sample_organization, sample_facility'''
    replacements.append((old, new))

    return fp, replacements


def fix_authorization():
    """tests/core/test_authorization.py - add StaffProfile to all role users."""
    fp = "tests/core/test_authorization.py"
    replacements = []

    # Each role user needs a StaffProfile. Add autouse fixture to each class that uses them.
    for cls, user_list in [
        ("TestRoleBasedAccess", ["doctor_user"]),
        ("TestSensitiveDataAccess", ["receptionist_user", "nurse_user", "admin_user"]),
        ("TestSensitiveAccessAudit", ["nurse_user"]),
    ]:
        old = f'class {cls}:'
        users_setup = "\n".join(
            f'        ensure_staff_profile({u}, sample_organization, sample_facility, employee_id="AUTH-{u[:6].upper()}")'
            for u in user_list
        )
        new = f'''class {cls}:

    @pytest.fixture(autouse=True)
    def _ensure_role_profiles(self, {", ".join(user_list)}, sample_organization, sample_facility):
        from tests.conftest import ensure_staff_profile
{users_setup}'''
        replacements.append((old, new))

    return fp, replacements


def fix_discharge_clearance():
    """tests/inpatient/test_discharge_clearance.py - add facility/org to admission and inline objects."""
    fp = "tests/inpatient/test_discharge_clearance.py"
    replacements = []

    # The clearance_admission fixture creates Admission without facility/org
    old = '''def clearance_admission(
    db, clearance_patient, clearance_ward, clearance_encounter, discharge_user, sample_facility,
):'''
    new = '''def clearance_admission(
    db, clearance_patient, clearance_ward, clearance_encounter, discharge_user, sample_facility, sample_organization,
):'''
    replacements.append((old, new))

    # Add organization to the Admission.objects.create
    old = '''    return Admission.objects.create(
        patient=clearance_patient,
        ward=clearance_ward,
        bed=bed,
        ipd_encounter=clearance_encounter,
        admitting_officer=discharge_user,
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia",
        payer_type="CASH",'''
    new = '''    return Admission.objects.create(
        patient=clearance_patient,
        ward=clearance_ward,
        bed=bed,
        ipd_encounter=clearance_encounter,
        admitting_officer=discharge_user,
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia",
        payer_type="CASH",
        organization=sample_organization,
        facility=sample_facility,'''
    replacements.append((old, new))

    return fp, replacements


def fix_admission_orders():
    """tests/inpatient/test_admission_orders.py - add facility/org to admission."""
    fp = "tests/inpatient/test_admission_orders.py"
    with open(fp) as f:
        content = f.read()

    # Check if there's a local admission fixture
    if "sample_admission" in content and "Admission.objects.create" in content:
        # Find the fixture and add facility/org
        # The admission fixture likely creates without facility
        pass

    replacements = []

    # Fix the orders_admission fixture to include tenant fields
    old = '''def orders_admission(db, sample_patient, sample_inpatient_ward, sample_bed, test_user, sample_facility, sample_organization):'''
    new = '''def orders_admission(db, sample_patient, sample_inpatient_ward, sample_bed, test_user, sample_facility, sample_organization):'''
    # Already has the params, need to ensure Admission gets them
    # Let's check if Admission.objects.create includes facility/org
    if "orders_admission" in content:
        old2 = "payer_type=\"CASH\","
        # Need to look at actual content near orders_admission
        pass

    return fp, replacements


def fix_smart_allocation():
    """tests/inpatient/test_smart_allocation.py - add facility to _create_admission Encounter."""
    fp = "tests/inpatient/test_smart_allocation.py"
    replacements = []

    # The _create_admission creates Encounter with facility=facility (from kwargs)
    # and Admission without facility/org. Need to add facility/org to Admission.
    old = '''    defaults = {
        "patient": patient,
        "ward": ward,
        "bed": bed,
        "ipd_encounter": ipd_encounter,
        "admission_date": kwargs.pop("admission_date", timezone.now()),
        "admitting_diagnosis": kwargs.pop("admitting_diagnosis", "J18.9"),
        "admitting_diagnosis_text": kwargs.pop(
            "admitting_diagnosis_text", "Pneumonia"
        ),
        "admitting_officer": test_user,
        "payer_type": "CASH",
    }'''
    new = '''    defaults = {
        "patient": patient,
        "ward": ward,
        "bed": bed,
        "ipd_encounter": ipd_encounter,
        "admission_date": kwargs.pop("admission_date", timezone.now()),
        "admitting_diagnosis": kwargs.pop("admitting_diagnosis", "J18.9"),
        "admitting_diagnosis_text": kwargs.pop(
            "admitting_diagnosis_text", "Pneumonia"
        ),
        "admitting_officer": test_user,
        "payer_type": "CASH",
        "facility": facility,
    }'''
    replacements.append((old, new))

    return fp, replacements


def fix_patient_timeline():
    """tests/patients/test_patient_timeline_api.py - add profile before sensitive patient test."""
    fp = "tests/patients/test_patient_timeline_api.py"
    replacements = []

    # Find the sensitive test that creates a raw client
    old = '''    def test_sensitive_patient_timeline_allowed_with_permission(
        self, timeline_test_user, sensitive_patient, sample_organization, sample_facility,
    ):'''
    new = '''    def test_sensitive_patient_timeline_allowed_with_permission(
        self, timeline_test_user, sensitive_patient, sample_organization, sample_facility, api_client,
    ):'''
    replacements.append((old, new))

    return fp, replacements


def fix_encounter_filter():
    """tests/encounters/test_encounter_api.py - add facility to inline encounter."""
    fp = "tests/encounters/test_encounter_api.py"
    replacements = []

    # test_filter_by_patient creates encounters without facility
    old = '''    def test_filter_by_patient(self, auth_client, sample_patient, sample_organization, sample_facility):'''
    new = '''    def test_filter_by_patient(self, auth_client, sample_patient, sample_organization, sample_facility):'''
    # The actual fix is in the Encounter.objects.create calls within that method
    # Let me handle this differently - read the actual content

    return fp, replacements


# ===========================================================================
# GROUP B: Data fixtures missing facility/org
# ===========================================================================

def fix_conftest_inpatient_fixtures():
    """tests/conftest.py - add facility/org to sample_inpatient_ward."""
    fp = "tests/conftest.py"
    replacements = []

    # sample_inpatient_ward needs facility and org
    old = '''@pytest.fixture
def sample_inpatient_ward(db):
    """Create a sample inpatient ward for testing."""
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Medical Ward 1",
        code="MED-01",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
        is_active=True,
    )'''
    new = '''@pytest.fixture
def sample_inpatient_ward(db, sample_organization, sample_facility):
    """Create a sample inpatient ward for testing."""
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Medical Ward 1",
        code="MED-01",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )'''
    replacements.append((old, new))

    return fp, replacements


if __name__ == "__main__":
    fixes = [
        fix_audit_log,
        fix_authorization,
        fix_discharge_clearance,
        fix_smart_allocation,
        fix_conftest_inpatient_fixtures,
    ]

    total = 0
    for fix_fn in fixes:
        result = fix_fn()
        if result:
            fp, replacements = result
            if replacements:
                count = apply_replacements(fp, replacements)
                if count:
                    print(f"  {fp}: {count} changes")
                    total += count
                else:
                    print(f"  {fp}: no matches found")

    print(f"\nTotal: {total} changes applied")
