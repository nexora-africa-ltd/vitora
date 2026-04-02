"""
Tests for Diagnosis model enhancements - Sprint 1.1-1.2.

Tests cover:
1. Certainty field (confirmed, provisional, ruled_out, suspected)
2. Diagnosed_by field (FK to User)
3. Principal diagnosis DB constraint
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Local Fixtures
# ============================================================================


@pytest.fixture
def gap_test_user(db):
    """Create a test user for gap tests."""
    return User.objects.create_user(username="testdoc", password="testpass123")


@pytest.fixture
def another_user(db):
    """Create another test user for audit tests."""
    return User.objects.create_user(username="anotherdoc", password="testpass456")


@pytest.fixture
def gap_sample_patient(db, sample_organization):
    """Create a sample patient for gap testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Gap",
        last_name="Test",
        date_of_birth=date(1985, 3, 20),
        gender="F",
        organization=sample_organization,
    )


@pytest.fixture
def gap_sample_encounter(db, gap_sample_patient, sample_facility):
    """Create a sample encounter for gap testing."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=gap_sample_patient,
        encounter_type="OPD",
        chief_complaint="Gap test complaint",
        facility=sample_facility,
    )


@pytest.fixture
def gap_sample_icd10_code(db):
    """Create a sample ICD-10 code for gap testing."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="A00.0",
        description="Cholera due to Vibrio cholerae",
        category="Certain infectious diseases",
        chapter=1,
    )


# ============================================================================
# Diagnosis Certainty Field Tests
# ============================================================================


@pytest.mark.unit
class TestDiagnosisCertaintyField:
    """Test Diagnosis certainty field implementation."""

    def test_diagnosis_has_certainty_field(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test that Diagnosis model has certainty field."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
            certainty="confirmed",
        )
        assert hasattr(diagnosis, "certainty")
        assert diagnosis.certainty == "confirmed"

    def test_certainty_choices_confirmed(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test certainty field accepts 'confirmed' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="SECONDARY",
            certainty="confirmed",
        )
        diagnosis.full_clean()  # Should not raise

    def test_certainty_choices_provisional(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test certainty field accepts 'provisional' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="SECONDARY",
            certainty="provisional",
        )
        diagnosis.full_clean()  # Should not raise

    def test_certainty_choices_ruled_out(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test certainty field accepts 'ruled_out' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="DIFFERENTIAL",
            certainty="ruled_out",
        )
        diagnosis.full_clean()  # Should not raise

    def test_certainty_choices_suspected(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test certainty field accepts 'suspected' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="WORKING",
            certainty="suspected",
        )
        diagnosis.full_clean()  # Should not raise

    def test_invalid_certainty_raises_error(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test invalid certainty value raises ValidationError."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
            certainty="INVALID_CERTAINTY",
        )
        with pytest.raises(ValidationError):
            diagnosis.full_clean()

    def test_certainty_default_value(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test certainty defaults to 'confirmed'."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
        )
        assert diagnosis.certainty == "confirmed"


# ============================================================================
# Diagnosis Diagnosed_by Field Tests
# ============================================================================


@pytest.mark.unit
class TestDiagnosisDiagnosedByField:
    """Test Diagnosis diagnosed_by field implementation."""

    def test_diagnosis_has_diagnosed_by_field(
        self, gap_sample_encounter, gap_sample_icd10_code, gap_test_user
    ):
        """Test that Diagnosis model has diagnosed_by field."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=gap_test_user,
        )
        assert hasattr(diagnosis, "diagnosed_by")
        assert diagnosis.diagnosed_by == gap_test_user

    def test_diagnosed_by_is_nullable(self, gap_sample_encounter, gap_sample_icd10_code):
        """Test diagnosed_by field can be null."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=None,
        )
        assert diagnosis.diagnosed_by is None

    def test_diagnosed_by_set_null_on_user_delete(
        self, gap_sample_encounter, gap_sample_icd10_code
    ):
        """Test diagnosed_by is set to NULL when user is deleted."""
        from hmis.apps.encounters.models import Diagnosis

        temp_user = User.objects.create_user(username="tempuser", password="temp123")
        diagnosis = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=temp_user,
        )

        temp_user.delete()
        diagnosis.refresh_from_db()
        assert diagnosis.diagnosed_by is None

    def test_diagnosed_by_tracks_clinician(
        self, gap_sample_encounter, gap_sample_icd10_code, gap_test_user, another_user
    ):
        """Test different diagnoses can track different clinicians."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code2 = ICD10Code.objects.create(
            code="B01.0",
            description="Varicella meningitis",
            category="Viral infections",
            chapter=1,
        )

        diag1 = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=gap_test_user,
        )
        diag2 = Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=code2,
            diagnosis_type="SECONDARY",
            diagnosed_by=another_user,
        )

        assert diag1.diagnosed_by.username == "testdoc"
        assert diag2.diagnosed_by.username == "anotherdoc"


# ============================================================================
# Diagnosis Principal Constraint Tests
# ============================================================================


@pytest.mark.unit
class TestDiagnosisPrincipalConstraint:
    """Test database-level unique constraint for principal diagnosis."""

    def test_only_one_principal_diagnosis_db_constraint(
        self, gap_sample_encounter, gap_sample_icd10_code
    ):
        """Test DB constraint prevents multiple principal diagnoses."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code2 = ICD10Code.objects.create(
            code="C01",
            description="Malignant neoplasm of base of tongue",
            category="Neoplasms",
            chapter=2,
        )

        Diagnosis.objects.create(
            encounter=gap_sample_encounter,
            icd10_code=gap_sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        # Second primary should raise IntegrityError at DB level
        with pytest.raises((IntegrityError, ValidationError)):
            Diagnosis.objects.create(
                encounter=gap_sample_encounter,
                icd10_code=code2,
                diagnosis_type="PRIMARY",
            )
