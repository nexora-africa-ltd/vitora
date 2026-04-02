"""
Script to fix multitenancy test bugs across all failing test files.
This adds organization/facility to ORM-created objects and StaffProfile to local auth fixtures.
"""

import re
import sys


def fix_file(filepath: str, fixes: list[dict]) -> int:
    """Apply a list of string replacement fixes to a file. Returns count of applied fixes."""
    with open(filepath) as f:
        content = f.read()

    applied = 0
    for fix in fixes:
        old = fix["old"]
        new = fix["new"]
        if old in content:
            content = content.replace(old, new, 1)
            applied += 1
        else:
            print(f"  WARNING: Could not find pattern in {filepath}:")
            print(f"    {old[:80]}...")

    with open(filepath, "w") as f:
        f.write(content)

    return applied


# =============================================================================
# test_patient_clinical_summary.py
# =============================================================================
def fix_patient_clinical_summary():
    fp = "tests/patients/test_patient_clinical_summary.py"
    print(f"Fixing {fp}...")

    with open(fp) as f:
        content = f.read()

    # Replace the auth_client fixture to include StaffProfile
    content = content.replace(
        """@pytest.fixture
def auth_client(db):
    \"\"\"Provide authenticated API client.\"\"\"
    from django.contrib.auth import get_user_model

    from rest_framework.test import APIClient

    User = get_user_model()
    user = User.objects.create_user(
        username="clinicalsummary_user",
        password="testpass123",
        email="clinicalsummary@test.com",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client""",
        """@pytest.fixture
def auth_client(db, sample_organization, sample_facility, sample_department, sample_role):
    \"\"\"Provide authenticated API client with multitenancy context.\"\"\"
    from datetime import date

    from django.contrib.auth import get_user_model

    from rest_framework.test import APIClient

    from hmis.apps.core.models import StaffProfile

    User = get_user_model()
    user = User.objects.create_user(
        username="clinicalsummary_user",
        password="testpass123",
        email="clinicalsummary@test.com",
    )
    StaffProfile.objects.get_or_create(
        user=user,
        defaults={
            "employee_id": "CS-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date.today(),
        },
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client""",
    )

    # Add facility to Encounter.objects.create calls
    # These use sample_patient which already has org from global conftest
    content = content.replace(
        """    def test_patient_with_no_encounters_returns_empty_string(
        self, auth_client, sample_patient
    ):""",
        """    def test_patient_with_no_encounters_returns_empty_string(
        self, auth_client, sample_patient, sample_facility
    ):""",
    )

    content = content.replace(
        """    def test_patient_returns_latest_encounter_chronic_conditions(
        self, auth_client, sample_patient
    ):""",
        """    def test_patient_returns_latest_encounter_chronic_conditions(
        self, auth_client, sample_patient, sample_facility
    ):""",
    )

    content = content.replace(
        """    def test_empty_chronic_conditions_on_latest_encounter(
        self, auth_client, sample_patient
    ):""",
        """    def test_empty_chronic_conditions_on_latest_encounter(
        self, auth_client, sample_patient, sample_facility
    ):""",
    )

    content = content.replace(
        """    def test_allergy_summary_is_read_only(self, auth_client, sample_patient):""",
        """    def test_allergy_summary_is_read_only(self, auth_client, sample_patient, sample_facility):""",
    )

    # Add facility= to Encounter.objects.create calls
    # These create encounters without facility
    content = content.replace(
        """            chief_complaint="Old visit",
            chronic_conditions="Old conditions",
        )""",
        """            chief_complaint="Old visit",
            chronic_conditions="Old conditions",
            facility=sample_facility,
        )""",
    )

    content = content.replace(
        """            chief_complaint="Recent visit",
            chronic_conditions="Hypertension, Type 2 Diabetes",
        )""",
        """            chief_complaint="Recent visit",
            chronic_conditions="Hypertension, Type 2 Diabetes",
            facility=sample_facility,
        )""",
    )

    content = content.replace(
        """            chief_complaint="Empty chronic",
            chronic_conditions="",
        )""",
        """            chief_complaint="Empty chronic",
            chronic_conditions="",
            facility=sample_facility,
        )""",
    )

    content = content.replace(
        """            chief_complaint="Checkup",
            chronic_conditions="Asthma",
        )""",
        """            chief_complaint="Checkup",
            chronic_conditions="Asthma",
            facility=sample_facility,
        )""",
    )

    with open(fp, "w") as f:
        f.write(content)
    print(f"  Done")


# =============================================================================
# test_encounter_api.py
# =============================================================================
def fix_encounter_api():
    fp = "tests/encounters/test_encounter_api.py"
    print(f"Fixing {fp}...")

    with open(fp) as f:
        content = f.read()

    # Fix auth_client fixture to include StaffProfile
    content = content.replace(
        """@pytest.fixture
def auth_user(db):
    \"\"\"Create a test user for authentication.\"\"\"
    return User.objects.create_user(
        username="encounteruser",
        password="encounterpassword123",
        email="encounteruser@test.com",
    )


@pytest.fixture
def auth_client(api_client, auth_user):
    \"\"\"Provide authenticated API client.\"\"\"
    api_client.force_authenticate(user=auth_user)
    return api_client""",
        """@pytest.fixture
def auth_user(db):
    \"\"\"Create a test user for authentication.\"\"\"
    return User.objects.create_user(
        username="encounteruser",
        password="encounterpassword123",
        email="encounteruser@test.com",
    )


@pytest.fixture
def auth_client(
    api_client, auth_user, sample_organization, sample_facility, sample_department, sample_role
):
    \"\"\"Provide authenticated API client with multitenancy context.\"\"\"
    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=auth_user,
        defaults={
            "employee_id": "ENC-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date(2026, 1, 1),
        },
    )
    api_client.force_authenticate(user=auth_user)
    return api_client""",
    )

    # Fix sample_patient fixture to include organization
    content = content.replace(
        """@pytest.fixture
def sample_patient():
    \"\"\"Create a sample patient for encounter tests.\"\"\"
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1990, 1, 1),
        gender="M",
    )""",
        """@pytest.fixture
def sample_patient(sample_organization):
    \"\"\"Create a sample patient for encounter tests.\"\"\"
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1990, 1, 1),
        gender="M",
        organization=sample_organization,
    )""",
    )

    # Add facility to all Encounter.objects.create calls
    # Replace pattern: Encounter.objects.create( without facility=
    # We need to add sample_facility to test methods and facility= to creates

    # Add sample_facility fixture to test methods that create encounters inline
    # This is tricky because there are many. Let's use a different approach:
    # Add a local fixture that wraps Encounter creation

    # Actually, the simplest approach: since auth_client depends on sample_facility,
    # we can reference sample_facility in test methods.

    # But many test methods create Encounter objects inline. We need to:
    # 1. Add sample_facility to their signatures
    # 2. Add facility=sample_facility to Encounter.objects.create calls

    # Let's do a bulk pattern replacement
    # All inline Encounter.objects.create need facility=sample_facility

    # Pattern: Add facility=sample_facility before closing paren of Encounter.objects.create
    import re

    def add_facility_to_encounter_create(text):
        """Add facility=sample_facility to Encounter.objects.create calls missing it."""
        # Find multi-line Encounter.objects.create(...) blocks
        result = []
        lines = text.split('\n')
        i = 0
        in_encounter_create = False
        encounter_indent = 0

        while i < len(lines):
            line = lines[i]

            if 'Encounter.objects.create(' in line and 'facility=' not in line:
                # Start of an encounter create block
                in_encounter_create = True
                encounter_indent = len(line) - len(line.lstrip()) + 4  # indent of args
                result.append(line)
                # Check if single-line
                if ')' in line.split('Encounter.objects.create(')[1]:
                    in_encounter_create = False
            elif in_encounter_create:
                stripped = line.strip()
                if stripped == ')' or stripped == '),':
                    # Closing paren - add facility before it
                    prev = result[-1].rstrip()
                    if not prev.endswith(','):
                        result[-1] = prev + ','
                    result.append(' ' * encounter_indent + 'facility=sample_facility,')
                    result.append(line)
                    in_encounter_create = False
                else:
                    result.append(line)
            else:
                result.append(line)

            i += 1

        return '\n'.join(result)

    content = add_facility_to_encounter_create(content)

    # Now add sample_facility to test method signatures that create Encounters
    # Find test methods that contain Encounter.objects.create but don't have sample_facility
    lines = content.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r'\s+def test_\w+\(self,\s*auth_client', line) and 'sample_facility' not in line:
            # Look ahead - does this test create Encounter objects?
            j = i + 1
            needs_facility = False
            while j < len(lines):
                if re.match(r'\s+def test_\w+\(', lines[j]):
                    break
                if 'facility=sample_facility' in lines[j]:
                    needs_facility = True
                    break
                j += 1

            if needs_facility:
                # Add sample_facility to signature
                if line.rstrip().endswith('):'):
                    line = line.replace('):', ', sample_facility):')
                elif ', sample_encounter_data):' in line:
                    line = line.replace(', sample_encounter_data):', ', sample_encounter_data, sample_facility):')
                elif ', sample_encounter_with_vitals):' in line:
                    line = line.replace(', sample_encounter_with_vitals):', ', sample_encounter_with_vitals, sample_facility):')
                elif ', sample_patient):' in line:
                    line = line.replace(', sample_patient):', ', sample_patient, sample_facility):')

        new_lines.append(line)
        i += 1

    content = '\n'.join(new_lines)

    with open(fp, "w") as f:
        f.write(content)
    print(f"  Done")


# =============================================================================
# test_encounter_consultation_queue_api.py
# =============================================================================
def fix_encounter_consultation_queue():
    fp = "tests/encounters/test_encounter_consultation_queue_api.py"
    print(f"Fixing {fp}...")

    with open(fp) as f:
        content = f.read()

    # Fix auth_user fixture
    old_auth = """@pytest.fixture
def auth_user(db):
    \"\"\"Create a test user for authentication.\"\"\"
    return User.objects.create_user(
        username="queueuser",
        password="queuepassword123",
        email="queueuser@test.com",
    )"""

    # Check if this exact auth_user exists
    if old_auth not in content:
        # Try a generic pattern
        pass

    # Fix auth_client fixture
    content = content.replace(
        """@pytest.fixture
def auth_client(api_client, auth_user):
    \"\"\"Provide authenticated API client.\"\"\"
    api_client.force_authenticate(user=auth_user)
    return api_client""",
        """@pytest.fixture
def auth_client(
    api_client, auth_user, sample_organization, sample_facility, sample_department, sample_role
):
    \"\"\"Provide authenticated API client with multitenancy context.\"\"\"
    from datetime import date as date_cls

    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=auth_user,
        defaults={
            "employee_id": "QUEUE-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date_cls.today(),
        },
    )
    api_client.force_authenticate(user=auth_user)
    return api_client""",
    )

    # Fix sample_patient and second_patient to include organization
    content = content.replace(
        """def sample_patient(db):
    \"\"\"Create a sample patient.\"\"\"
    return Patient.objects.create(
        first_name="Queue",
        last_name="Patient",
        date_of_birth=date(1990, 5, 15),
        gender="M",
    )""",
        """def sample_patient(db, sample_organization):
    \"\"\"Create a sample patient.\"\"\"
    return Patient.objects.create(
        first_name="Queue",
        last_name="Patient",
        date_of_birth=date(1990, 5, 15),
        gender="M",
        organization=sample_organization,
    )""",
    )

    content = content.replace(
        """def second_patient(db):
    \"\"\"Create a second patient.\"\"\"
    return Patient.objects.create(
        first_name="Second",
        last_name="Patient",
        date_of_birth=date(1985, 3, 20),
        gender="F",
    )""",
        """def second_patient(db, sample_organization):
    \"\"\"Create a second patient.\"\"\"
    return Patient.objects.create(
        first_name="Second",
        last_name="Patient",
        date_of_birth=date(1985, 3, 20),
        gender="F",
        organization=sample_organization,
    )""",
    )

    # Add facility to Encounter.objects.create calls
    # Pattern: chief_complaint="...",\n    ) -> chief_complaint="...",\n        facility=sample_facility,\n    )
    # This file has fixtures that create encounters

    # Fix mandatory_encounter fixture
    content = content.replace(
        """def mandatory_encounter(sample_patient):
    \"\"\"Create an encounter (mandatory for queue entry).\"\"\"
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Fever and headache",
    )""",
        """def mandatory_encounter(sample_patient, sample_facility):
    \"\"\"Create an encounter (mandatory for queue entry).\"\"\"
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Fever and headache",
        facility=sample_facility,
    )""",
    )

    # Fix optional_encounter fixture
    content = content.replace(
        """def optional_encounter(second_patient):
    \"\"\"Create another encounter for a different patient.\"\"\"
    return Encounter.objects.create(
        patient=second_patient,
        encounter_type="OPD",
        chief_complaint="Cough for 3 days",
    )""",
        """def optional_encounter(second_patient, sample_facility):
    \"\"\"Create another encounter for a different patient.\"\"\"
    return Encounter.objects.create(
        patient=second_patient,
        encounter_type="OPD",
        chief_complaint="Cough for 3 days",
        facility=sample_facility,
    )""",
    )

    # Fix inline Encounter.objects.create calls in test methods
    # Search for patterns and add facility
    import re

    def add_facility_to_encounter_creates(text):
        lines = text.split('\n')
        result = []
        i = 0
        in_encounter_create = False

        while i < len(lines):
            line = lines[i]
            if 'Encounter.objects.create(' in line and 'facility=' not in line:
                in_encounter_create = True
                result.append(line)
                if ')' in line.split('Encounter.objects.create(')[1]:
                    in_encounter_create = False
            elif in_encounter_create:
                stripped = line.strip()
                if stripped == ')' or stripped == '),':
                    prev = result[-1].rstrip()
                    if not prev.endswith(','):
                        result[-1] = prev + ','
                    indent = len(line) - len(line.strip()) + 4
                    result.append(' ' * indent + 'facility=sample_facility,')
                    result.append(line)
                    in_encounter_create = False
                else:
                    result.append(line)
            else:
                result.append(line)
            i += 1

        return '\n'.join(result)

    content = add_facility_to_encounter_creates(content)

    # Add sample_facility to test methods that now reference it
    lines = content.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r'\s+def test_\w+\(self', line) and 'sample_facility' not in line:
            j = i + 1
            needs_facility = False
            while j < len(lines):
                if re.match(r'\s+def test_\w+\(', lines[j]):
                    break
                if 'facility=sample_facility' in lines[j]:
                    needs_facility = True
                    break
                j += 1
            if needs_facility:
                if line.rstrip().endswith('):'):
                    line = line.replace('):', ', sample_facility):')
        new_lines.append(line)
        i += 1

    content = '\n'.join(new_lines)

    with open(fp, "w") as f:
        f.write(content)
    print(f"  Done")


# =============================================================================
# test_encounter_pre_triage_queue_api.py
# =============================================================================
def fix_encounter_pre_triage_queue():
    fp = "tests/encounters/test_encounter_pre_triage_queue_api.py"
    print(f"Fixing {fp}...")

    with open(fp) as f:
        content = f.read()

    # Fix auth_client
    content = content.replace(
        """@pytest.fixture
def auth_client(api_client, auth_user):
    \"\"\"Provide authenticated API client.\"\"\"
    api_client.force_authenticate(user=auth_user)
    return api_client""",
        """@pytest.fixture
def auth_client(
    api_client, auth_user, sample_organization, sample_facility, sample_department, sample_role
):
    \"\"\"Provide authenticated API client with multitenancy context.\"\"\"
    from datetime import date as date_cls

    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=auth_user,
        defaults={
            "employee_id": "PRETRIAGE-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date_cls.today(),
        },
    )
    api_client.force_authenticate(user=auth_user)
    return api_client""",
    )

    # Fix patient fixtures to include organization
    for name, fname, lname, dob, gender in [
        ("sample_patient", "PreTriage", "Patient", "date(1990, 5, 15)", "M"),
        ("second_patient", "Second", "PTPatient", "date(1985, 3, 20)", "F"),
        ("third_patient", "Third", "PTPatient", "date(2000, 8, 10)", "M"),
    ]:
        old_pat = f"""def {name}(db):"""
        new_pat = f"""def {name}(db, sample_organization):"""
        content = content.replace(old_pat, new_pat, 1)

    # Add organization=sample_organization to Patient.objects.create calls
    # These are in fixture definitions
    import re

    def add_org_to_patient_creates(text):
        lines = text.split('\n')
        result = []
        i = 0
        in_patient_create = False

        while i < len(lines):
            line = lines[i]
            if 'Patient.objects.create(' in line and 'organization=' not in line:
                in_patient_create = True
                result.append(line)
                if ')' in line.split('Patient.objects.create(')[1]:
                    in_patient_create = False
            elif in_patient_create:
                stripped = line.strip()
                if stripped == ')' or stripped == '),':
                    prev = result[-1].rstrip()
                    if not prev.endswith(','):
                        result[-1] = prev + ','
                    indent = len(line) - len(line.strip()) + 4
                    result.append(' ' * indent + 'organization=sample_organization,')
                    result.append(line)
                    in_patient_create = False
                else:
                    result.append(line)
            else:
                result.append(line)
            i += 1

        return '\n'.join(result)

    content = add_org_to_patient_creates(content)

    # Add facility to Encounter.objects.create
    def add_facility_to_encounter_creates(text):
        lines = text.split('\n')
        result = []
        i = 0
        in_encounter_create = False

        while i < len(lines):
            line = lines[i]
            if 'Encounter.objects.create(' in line and 'facility=' not in line:
                in_encounter_create = True
                result.append(line)
                if ')' in line.split('Encounter.objects.create(')[1]:
                    in_encounter_create = False
            elif in_encounter_create:
                stripped = line.strip()
                if stripped == ')' or stripped == '),':
                    prev = result[-1].rstrip()
                    if not prev.endswith(','):
                        result[-1] = prev + ','
                    indent = len(line) - len(line.strip()) + 4
                    result.append(' ' * indent + 'facility=sample_facility,')
                    result.append(line)
                    in_encounter_create = False
                else:
                    result.append(line)
            else:
                result.append(line)
            i += 1

        return '\n'.join(result)

    content = add_facility_to_encounter_creates(content)

    # Add sample_facility to test methods/fixtures that now reference it
    lines = content.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r'(\s+def (?:test_\w+)\(self.*?)(\):)', line)
        if m and 'sample_facility' not in line:
            j = i + 1
            needs_facility = False
            while j < len(lines):
                if re.match(r'\s+def (?:test_|$)', lines[j]):
                    break
                if 'facility=sample_facility' in lines[j]:
                    needs_facility = True
                    break
                j += 1
            if needs_facility:
                line = m.group(1) + ', sample_facility' + m.group(2)

        # Same for fixtures
        m2 = re.match(r'(def \w+\(.*?)(\):)', line)
        if m2 and 'facility=sample_facility' not in line and 'sample_facility' not in line:
            j = i + 1
            needs_facility = False
            while j < len(lines) and j < i + 30:
                if re.match(r'(?:@pytest|def )', lines[j].lstrip()):
                    break
                if 'facility=sample_facility' in lines[j]:
                    needs_facility = True
                    break
                j += 1
            if needs_facility:
                line = m2.group(1) + ', sample_facility' + m2.group(2)

        new_lines.append(line)
        i += 1

    content = '\n'.join(new_lines)

    with open(fp, "w") as f:
        f.write(content)
    print(f"  Done")


# =============================================================================
# test_lab_api.py
# =============================================================================
def fix_lab_api():
    fp = "tests/laboratory/test_lab_api.py"
    print(f"Fixing {fp}...")

    with open(fp) as f:
        content = f.read()

    # Fix authenticated_user to include StaffProfile
    content = content.replace(
        """@pytest.fixture
def authenticated_user(db):
    \"\"\"Create a user for authentication.\"\"\"
    return User.objects.create_user(
        username="labuser",
        password="labpassword123",
        email="labuser@test.com",
    )


@pytest.fixture
def auth_client(api_client, authenticated_user):
    \"\"\"Provide authenticated API client.\"\"\"
    api_client.force_authenticate(user=authenticated_user)
    return api_client""",
        """@pytest.fixture
def authenticated_user(db):
    \"\"\"Create a user for authentication.\"\"\"
    return User.objects.create_user(
        username="labuser",
        password="labpassword123",
        email="labuser@test.com",
    )


@pytest.fixture
def auth_client(
    api_client, authenticated_user, sample_organization, sample_facility, sample_department, sample_role
):
    \"\"\"Provide authenticated API client with multitenancy context.\"\"\"
    from datetime import date

    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=authenticated_user,
        defaults={
            "employee_id": "LAB-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date.today(),
        },
    )
    api_client.force_authenticate(user=authenticated_user)
    return api_client""",
    )

    # Fix sample_patient to include organization
    content = content.replace(
        """@pytest.fixture
def sample_patient(db):
    \"\"\"Create a sample patient.\"\"\"
    return Patient.objects.create(
        first_name="Lab",
        last_name="Patient",
        date_of_birth="1990-05-15",
        gender="M",
    )""",
        """@pytest.fixture
def sample_patient(db, sample_organization):
    \"\"\"Create a sample patient.\"\"\"
    return Patient.objects.create(
        first_name="Lab",
        last_name="Patient",
        date_of_birth="1990-05-15",
        gender="M",
        organization=sample_organization,
    )""",
    )

    # Fix sample_encounter to include facility
    content = content.replace(
        """@pytest.fixture
def sample_encounter(sample_patient, authenticated_user):
    \"\"\"Create a sample encounter.\"\"\"
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Lab test needed",
    )""",
        """@pytest.fixture
def sample_encounter(sample_patient, authenticated_user, sample_facility):
    \"\"\"Create a sample encounter.\"\"\"
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Lab test needed",
        facility=sample_facility,
    )""",
    )

    with open(fp, "w") as f:
        f.write(content)
    print(f"  Done")


# =============================================================================
# test_lab_specimen_api.py
# =============================================================================
def fix_lab_specimen_api():
    fp = "tests/laboratory/test_lab_specimen_api.py"
    print(f"Fixing {fp}...")

    with open(fp) as f:
        content = f.read()

    # Fix authenticated_user + auth_client
    content = content.replace(
        """@pytest.fixture
def auth_client(api_client, authenticated_user):
    \"\"\"Provide authenticated API client.\"\"\"
    api_client.force_authenticate(user=authenticated_user)
    return api_client""",
        """@pytest.fixture
def auth_client(
    api_client, authenticated_user, sample_organization, sample_facility, sample_department, sample_role
):
    \"\"\"Provide authenticated API client with multitenancy context.\"\"\"
    from datetime import date

    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=authenticated_user,
        defaults={
            "employee_id": "LABSPEC-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date.today(),
        },
    )
    api_client.force_authenticate(user=authenticated_user)
    return api_client""",
    )

    # Fix sample_patient
    content = content.replace(
        """def sample_patient(db):
    \"\"\"Create a sample patient.\"\"\"
    return Patient.objects.create(
        first_name="Lab",
        last_name="Patient",
        date_of_birth="1990-05-15",
        gender="M",
    )""",
        """def sample_patient(db, sample_organization):
    \"\"\"Create a sample patient.\"\"\"
    return Patient.objects.create(
        first_name="Lab",
        last_name="Patient",
        date_of_birth="1990-05-15",
        gender="M",
        organization=sample_organization,
    )""",
    )

    # Fix sample_encounter
    content = content.replace(
        """def sample_encounter(sample_patient, authenticated_user):
    \"\"\"Create a sample encounter.\"\"\"
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Lab tests needed",
    )""",
        """def sample_encounter(sample_patient, authenticated_user, sample_facility):
    \"\"\"Create a sample encounter.\"\"\"
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Lab tests needed",
        facility=sample_facility,
    )""",
    )

    with open(fp, "w") as f:
        f.write(content)
    print(f"  Done")


if __name__ == "__main__":
    fix_patient_clinical_summary()
    fix_encounter_api()
    fix_encounter_consultation_queue()
    fix_encounter_pre_triage_queue()
    fix_lab_api()
    fix_lab_specimen_api()
    print("\nAll fixes applied!")
