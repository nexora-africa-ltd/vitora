"""
Tests for Sprint 1.1-1.2 implementation gaps - TDD approach.

This module contains comprehensive tests for features identified as gaps
in the initial implementation audit. Tests are written BEFORE implementation.

Gap Categories:
1. Diagnosis enhancements (certainty, diagnosed_by, DB constraint)
2. ICD10Code enhancements (is_billable, short/long descriptions)
3. Vital status methods (get_vital_status, get_all_vital_statuses, get_map)
4. Admin registrations
5. TreatmentPlanTemplate model
6. Patient Timeline API with statistics
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(username="testdoc", password="testpass123")


@pytest.fixture
def another_user(db):
    """Create another test user for audit tests."""
    return User.objects.create_user(username="anotherdoc", password="testpass456")


@pytest.fixture
def sample_patient(db):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Gap",
        last_name="Test",
        date_of_birth=date(1985, 3, 20),
        gender="F",
    )


@pytest.fixture
def sample_encounter(db, sample_patient):
    """Create a sample encounter for testing."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Gap test complaint",
    )


@pytest.fixture
def sample_icd10_code(db):
    """Create a sample ICD-10 code for testing."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="A00.0",
        description="Cholera due to Vibrio cholerae",
        category="Certain infectious diseases",
        chapter=1,
    )


@pytest.fixture
def authenticated_client(db, test_user):
    """Provide authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=test_user)
    return client


# ============================================================================
# 1. DIAGNOSIS ENHANCEMENTS TESTS
# ============================================================================


@pytest.mark.unit
class TestDiagnosisCertaintyField:
    """Test Diagnosis certainty field implementation."""

    def test_diagnosis_has_certainty_field(self, sample_encounter, sample_icd10_code):
        """Test that Diagnosis model has certainty field."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            certainty="confirmed",
        )
        assert hasattr(diagnosis, "certainty")
        assert diagnosis.certainty == "confirmed"

    def test_certainty_choices_confirmed(self, sample_encounter, sample_icd10_code):
        """Test certainty field accepts 'confirmed' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="SECONDARY",
            certainty="confirmed",
        )
        diagnosis.full_clean()  # Should not raise

    def test_certainty_choices_provisional(self, sample_encounter, sample_icd10_code):
        """Test certainty field accepts 'provisional' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="SECONDARY",
            certainty="provisional",
        )
        diagnosis.full_clean()  # Should not raise

    def test_certainty_choices_ruled_out(self, sample_encounter, sample_icd10_code):
        """Test certainty field accepts 'ruled_out' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="DIFFERENTIAL",
            certainty="ruled_out",
        )
        diagnosis.full_clean()  # Should not raise

    def test_certainty_choices_suspected(self, sample_encounter, sample_icd10_code):
        """Test certainty field accepts 'suspected' value."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="WORKING",
            certainty="suspected",
        )
        diagnosis.full_clean()  # Should not raise

    def test_invalid_certainty_raises_error(self, sample_encounter, sample_icd10_code):
        """Test invalid certainty value raises ValidationError."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            certainty="INVALID_CERTAINTY",
        )
        with pytest.raises(ValidationError):
            diagnosis.full_clean()

    def test_certainty_default_value(self, sample_encounter, sample_icd10_code):
        """Test certainty defaults to 'confirmed'."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )
        assert diagnosis.certainty == "confirmed"


@pytest.mark.unit
class TestDiagnosisDiagnosedByField:
    """Test Diagnosis diagnosed_by field implementation."""

    def test_diagnosis_has_diagnosed_by_field(
        self, sample_encounter, sample_icd10_code, test_user
    ):
        """Test that Diagnosis model has diagnosed_by field."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=test_user,
        )
        assert hasattr(diagnosis, "diagnosed_by")
        assert diagnosis.diagnosed_by == test_user

    def test_diagnosed_by_is_nullable(self, sample_encounter, sample_icd10_code):
        """Test diagnosed_by field can be null."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=None,
        )
        assert diagnosis.diagnosed_by is None

    def test_diagnosed_by_set_null_on_user_delete(
        self, sample_encounter, sample_icd10_code
    ):
        """Test diagnosed_by is set to NULL when user is deleted."""
        from hmis.apps.encounters.models import Diagnosis

        temp_user = User.objects.create_user(username="tempuser", password="temp123")
        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=temp_user,
        )

        temp_user.delete()
        diagnosis.refresh_from_db()
        assert diagnosis.diagnosed_by is None

    def test_diagnosed_by_tracks_clinician(
        self, sample_encounter, sample_icd10_code, test_user, another_user
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
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=test_user,
        )
        diag2 = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=code2,
            diagnosis_type="SECONDARY",
            diagnosed_by=another_user,
        )

        assert diag1.diagnosed_by.username == "testdoc"
        assert diag2.diagnosed_by.username == "anotherdoc"


@pytest.mark.unit
class TestDiagnosisPrincipalConstraint:
    """Test database-level unique constraint for principal diagnosis."""

    def test_only_one_principal_diagnosis_db_constraint(
        self, sample_encounter, sample_icd10_code
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
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        # Second primary should raise IntegrityError at DB level
        with pytest.raises((IntegrityError, ValidationError)):
            Diagnosis.objects.create(
                encounter=sample_encounter,
                icd10_code=code2,
                diagnosis_type="PRIMARY",
            )


# ============================================================================
# 2. ICD10CODE ENHANCEMENTS TESTS
# ============================================================================


@pytest.mark.unit
class TestICD10CodeEnhancements:
    """Test ICD10Code model enhancements."""

    def test_icd10_has_is_billable_field(self, db):
        """Test ICD10Code has is_billable field."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="D50.0",
            description="Iron deficiency anemia secondary to blood loss",
            category="Diseases of the blood",
            chapter=3,
            is_billable=True,
        )
        assert hasattr(code, "is_billable")
        assert code.is_billable is True

    def test_is_billable_defaults_to_true(self, db):
        """Test is_billable defaults to True."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="E10.9",
            description="Type 1 diabetes mellitus without complications",
            category="Endocrine diseases",
            chapter=4,
        )
        assert code.is_billable is True

    def test_is_billable_can_be_false(self, db):
        """Test is_billable can be set to False (non-terminal codes)."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="E10",
            description="Type 1 diabetes mellitus (category)",
            category="Endocrine diseases",
            chapter=4,
            is_billable=False,
        )
        assert code.is_billable is False

    def test_icd10_has_short_description(self, db):
        """Test ICD10Code has short_description field."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="F32.0",
            short_description="Major depressive disorder, single episode, mild",
            description="Major depressive disorder, single episode, mild",
            category="Mental disorders",
            chapter=5,
        )
        assert hasattr(code, "short_description")

    def test_icd10_has_long_description(self, db):
        """Test ICD10Code has long_description field."""
        from hmis.apps.encounters.models import ICD10Code

        long_desc = (
            "Major depressive disorder, single episode, mild. "
            "A mood disorder characterized by a depressed mood or loss of interest "
            "in activities, lasting for at least two weeks."
        )
        code = ICD10Code.objects.create(
            code="F32.1",
            short_description="Major depressive disorder, moderate",
            description="Major depressive disorder, single episode, moderate",
            long_description=long_desc,
            category="Mental disorders",
            chapter=5,
        )
        assert hasattr(code, "long_description")
        assert code.long_description == long_desc

    def test_long_description_can_be_blank(self, db):
        """Test long_description can be blank."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="G40.0",
            short_description="Localization-related epilepsy",
            description="Localization-related (focal) epilepsy",
            category="Diseases of the nervous system",
            chapter=6,
        )
        assert code.long_description == ""

    def test_filter_billable_codes(self, db):
        """Test filtering billable vs non-billable codes."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(
            code="H10",
            description="Conjunctivitis (category)",
            category="Eye diseases",
            chapter=7,
            is_billable=False,
        )
        ICD10Code.objects.create(
            code="H10.0",
            description="Mucopurulent conjunctivitis",
            category="Eye diseases",
            chapter=7,
            is_billable=True,
        )
        ICD10Code.objects.create(
            code="H10.1",
            description="Acute atopic conjunctivitis",
            category="Eye diseases",
            chapter=7,
            is_billable=True,
        )

        billable = ICD10Code.objects.filter(is_billable=True)
        non_billable = ICD10Code.objects.filter(is_billable=False)

        assert billable.count() == 2
        assert non_billable.count() == 1


# ============================================================================
# 3. VITAL STATUS METHODS TESTS
# ============================================================================


@pytest.mark.unit
class TestGetVitalStatusMethod:
    """Test get_vital_status() method implementation."""

    def test_get_vital_status_exists(self, sample_encounter):
        """Test Encounter has get_vital_status method."""
        assert hasattr(sample_encounter, "get_vital_status")
        assert callable(sample_encounter.get_vital_status)

    def test_temperature_normal_status(self, sample_patient):
        """Test temperature 36.5°C returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=Decimal("36.5"),
        )
        assert encounter.get_vital_status("temperature") == "normal"

    def test_temperature_warning_low_status(self, sample_patient):
        """Test temperature 35.8°C returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Feeling cold",
            temperature=Decimal("35.8"),
        )
        assert encounter.get_vital_status("temperature") == "warning"

    def test_temperature_warning_high_status(self, sample_patient):
        """Test temperature 37.5°C returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Low grade fever",
            temperature=Decimal("37.5"),
        )
        assert encounter.get_vital_status("temperature") == "warning"

    def test_temperature_critical_low_status(self, sample_patient):
        """Test temperature 35.0°C returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypothermia",
            temperature=Decimal("35.0"),
        )
        assert encounter.get_vital_status("temperature") == "critical"

    def test_temperature_critical_high_status(self, sample_patient):
        """Test temperature 39.5°C returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="High fever",
            temperature=Decimal("39.5"),
        )
        assert encounter.get_vital_status("temperature") == "critical"

    def test_pulse_normal_status(self, sample_patient):
        """Test pulse 75 bpm returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            pulse=75,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_pulse_warning_low_status(self, sample_patient):
        """Test pulse 55 bpm returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Slow heart rate",
            pulse=55,
        )
        assert encounter.get_vital_status("pulse") == "warning"

    def test_pulse_warning_high_status(self, sample_patient):
        """Test pulse 110 bpm returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Palpitations",
            pulse=110,
        )
        assert encounter.get_vital_status("pulse") == "warning"

    def test_pulse_critical_low_status(self, sample_patient):
        """Test pulse 45 bpm returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Bradycardia",
            pulse=45,
        )
        assert encounter.get_vital_status("pulse") == "critical"

    def test_pulse_critical_high_status(self, sample_patient):
        """Test pulse 135 bpm returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Tachycardia",
            pulse=135,
        )
        assert encounter.get_vital_status("pulse") == "critical"

    def test_bp_systolic_normal_status(self, sample_patient):
        """Test systolic BP 115 returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            blood_pressure="115/75",
        )
        assert encounter.get_vital_status("bp_systolic") == "normal"

    def test_bp_systolic_warning_status(self, sample_patient):
        """Test systolic BP 130 returns 'warning' status (prehypertension)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="BP check",
            blood_pressure="130/85",
        )
        assert encounter.get_vital_status("bp_systolic") == "warning"

    def test_bp_systolic_critical_high_status(self, sample_patient):
        """Test systolic BP 145 returns 'critical' status (hypertension)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="High BP",
            blood_pressure="145/95",
        )
        assert encounter.get_vital_status("bp_systolic") == "critical"

    def test_spo2_normal_status(self, sample_patient):
        """Test SpO2 98% returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            spo2=Decimal("98.0"),
        )
        assert encounter.get_vital_status("spo2") == "normal"

    def test_spo2_warning_status(self, sample_patient):
        """Test SpO2 92% returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Mild hypoxia",
            spo2=Decimal("92.0"),
        )
        assert encounter.get_vital_status("spo2") == "warning"

    def test_spo2_critical_status(self, sample_patient):
        """Test SpO2 88% returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Severe hypoxia",
            spo2=Decimal("88.0"),
        )
        assert encounter.get_vital_status("spo2") == "critical"

    def test_respiratory_rate_normal_status(self, sample_patient):
        """Test RR 16/min returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            respiratory_rate=16,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_vital_status_returns_none_when_missing(self, sample_encounter):
        """Test get_vital_status returns None when vital not recorded."""
        assert sample_encounter.get_vital_status("temperature") is None

    def test_invalid_vital_name_raises_error(self, sample_patient):
        """Test invalid vital name raises ValueError."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            temperature=Decimal("37.0"),
        )
        with pytest.raises(ValueError):
            encounter.get_vital_status("invalid_vital")


@pytest.mark.unit
class TestGetAllVitalStatusesMethod:
    """Test get_all_vital_statuses() method implementation."""

    def test_get_all_vital_statuses_exists(self, sample_encounter):
        """Test Encounter has get_all_vital_statuses method."""
        assert hasattr(sample_encounter, "get_all_vital_statuses")
        assert callable(sample_encounter.get_all_vital_statuses)

    def test_get_all_vital_statuses_returns_dict(self, sample_patient):
        """Test get_all_vital_statuses returns dictionary."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Full vitals",
            temperature=Decimal("37.0"),
            pulse=75,
            blood_pressure="120/80",
            respiratory_rate=16,
            spo2=Decimal("98.0"),
        )
        statuses = encounter.get_all_vital_statuses()
        assert isinstance(statuses, dict)

    def test_all_vital_statuses_structure(self, sample_patient):
        """Test get_all_vital_statuses returns correct structure."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Full vitals",
            temperature=Decimal("37.0"),
            pulse=75,
            blood_pressure="120/80",
            respiratory_rate=16,
            spo2=Decimal("98.0"),
        )
        statuses = encounter.get_all_vital_statuses()

        # Should have keys for each vital
        assert "temperature" in statuses
        assert "pulse" in statuses
        assert "bp_systolic" in statuses
        assert "bp_diastolic" in statuses
        assert "respiratory_rate" in statuses
        assert "spo2" in statuses

        # Each value should have 'value', 'status', 'unit' keys
        for vital, data in statuses.items():
            if data is not None:
                assert "value" in data
                assert "status" in data
                assert "unit" in data

    def test_all_vital_statuses_mixed_statuses(self, sample_patient):
        """Test with mixed normal/warning/critical vitals."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Multi-system issue",
            temperature=Decimal("39.5"),  # Critical
            pulse=75,  # Normal
            blood_pressure="130/85",  # Warning
            spo2=Decimal("88.0"),  # Critical
        )
        statuses = encounter.get_all_vital_statuses()

        assert statuses["temperature"]["status"] == "critical"
        assert statuses["pulse"]["status"] == "normal"
        assert statuses["bp_systolic"]["status"] == "warning"
        assert statuses["spo2"]["status"] == "critical"


@pytest.mark.unit
class TestGetMAPMethod:
    """Test get_map() Mean Arterial Pressure calculation."""

    def test_get_map_exists(self, sample_encounter):
        """Test Encounter has get_map method."""
        assert hasattr(sample_encounter, "get_map")
        assert callable(sample_encounter.get_map)

    def test_map_calculation_normal_bp(self, sample_patient):
        """Test MAP calculation for 120/80: MAP = DBP + 1/3(SBP - DBP)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="BP check",
            blood_pressure="120/80",
        )
        # MAP = 80 + 1/3(120 - 80) = 80 + 13.33 = 93.33 ≈ 93
        map_value = encounter.get_map()
        assert map_value == pytest.approx(93, abs=1)

    def test_map_calculation_high_bp(self, sample_patient):
        """Test MAP calculation for 180/110."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypertensive crisis",
            blood_pressure="180/110",
        )
        # MAP = 110 + 1/3(180 - 110) = 110 + 23.33 = 133.33 ≈ 133
        map_value = encounter.get_map()
        assert map_value == pytest.approx(133, abs=1)

    def test_map_calculation_low_bp(self, sample_patient):
        """Test MAP calculation for 90/60."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Hypotension",
            blood_pressure="90/60",
        )
        # MAP = 60 + 1/3(90 - 60) = 60 + 10 = 70
        map_value = encounter.get_map()
        assert map_value == pytest.approx(70, abs=1)

    def test_map_returns_none_without_bp(self, sample_patient):
        """Test MAP returns None when BP not recorded."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="No BP",
        )
        assert encounter.get_map() is None

    def test_map_returns_none_with_empty_bp(self, sample_patient):
        """Test MAP returns None when BP is empty string."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Empty BP",
            blood_pressure="",
        )
        assert encounter.get_map() is None


# ============================================================================
# 4. ADMIN REGISTRATIONS TESTS
# ============================================================================


@pytest.mark.unit
class TestAdminRegistrations:
    """Test Django Admin registrations for new models."""

    def test_icd10code_admin_registered(self):
        """Test ICD10Code is registered in admin."""
        from django.contrib import admin

        from hmis.apps.encounters.models import ICD10Code

        assert ICD10Code in admin.site._registry

    def test_diagnosis_admin_accessible_via_encounter(self):
        """Test Diagnosis is accessible as inline on Encounter admin."""
        from django.contrib import admin

        from hmis.apps.encounters.admin import EncounterAdmin
        from hmis.apps.encounters.models import Encounter

        admin_instance = admin.site._registry.get(Encounter)
        assert admin_instance is not None

        # Check for DiagnosisInline
        inline_names = [inline.__name__ for inline in admin_instance.inlines]
        assert "DiagnosisInline" in inline_names

    def test_treatment_plan_admin_accessible_via_encounter(self):
        """Test TreatmentPlan is accessible as inline on Encounter admin."""
        from django.contrib import admin

        from hmis.apps.encounters.admin import EncounterAdmin
        from hmis.apps.encounters.models import Encounter

        admin_instance = admin.site._registry.get(Encounter)
        assert admin_instance is not None

        # Check for TreatmentPlanInline
        inline_names = [inline.__name__ for inline in admin_instance.inlines]
        assert "TreatmentPlanInline" in inline_names

    def test_treatment_plan_template_admin_registered(self):
        """Test TreatmentPlanTemplate is registered in admin."""
        from django.contrib import admin

        from hmis.apps.encounters.models import TreatmentPlanTemplate

        assert TreatmentPlanTemplate in admin.site._registry

    def test_icd10code_admin_list_display(self):
        """Test ICD10CodeAdmin has appropriate list_display."""
        from django.contrib import admin

        from hmis.apps.encounters.models import ICD10Code

        admin_instance = admin.site._registry.get(ICD10Code)
        assert "code" in admin_instance.list_display
        assert "is_billable" in admin_instance.list_display
        assert "is_active" in admin_instance.list_display

    def test_icd10code_admin_search_fields(self):
        """Test ICD10CodeAdmin has search fields."""
        from django.contrib import admin

        from hmis.apps.encounters.models import ICD10Code

        admin_instance = admin.site._registry.get(ICD10Code)
        assert "code" in admin_instance.search_fields


# ============================================================================
# 5. TREATMENT PLAN TEMPLATE TESTS
# ============================================================================


@pytest.mark.unit
class TestTreatmentPlanTemplateModel:
    """Test TreatmentPlanTemplate model implementation."""

    def test_treatment_plan_template_exists(self):
        """Test TreatmentPlanTemplate model exists."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        assert TreatmentPlanTemplate is not None

    def test_create_treatment_plan_template(self, db, test_user):
        """Test creating a treatment plan template."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Respiratory Infection Template",
            description="Standard template for respiratory infections",
            default_medications='[{"name": "Amoxicillin", "dosage": "500mg", "frequency": "TDS"}]',
            default_instructions="Rest, fluids, complete antibiotic course",
            follow_up_days=7,
            department="General Medicine",
            created_by=test_user,
        )
        assert template.id is not None
        assert template.name == "Respiratory Infection Template"

    def test_template_with_diagnosis_codes(self, db, test_user, sample_icd10_code):
        """Test template can be linked to diagnosis codes."""
        from hmis.apps.encounters.models import ICD10Code, TreatmentPlanTemplate

        code2 = ICD10Code.objects.create(
            code="J06.9",
            description="Acute upper respiratory infection",
            category="Respiratory",
            chapter=10,
        )

        template = TreatmentPlanTemplate.objects.create(
            name="URI Template",
            description="Template for upper respiratory infections",
            follow_up_days=5,
            created_by=test_user,
        )
        template.diagnosis_codes.add(sample_icd10_code, code2)

        assert template.diagnosis_codes.count() == 2

    def test_template_is_active_default(self, db, test_user):
        """Test template is_active defaults to True."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Active Template",
            created_by=test_user,
        )
        assert template.is_active is True

    def test_template_string_representation(self, db, test_user):
        """Test template __str__ method."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Malaria Treatment",
            created_by=test_user,
        )
        assert str(template) == "Malaria Treatment"


@pytest.mark.unit
class TestTreatmentPlanWithTemplate:
    """Test TreatmentPlan integration with templates."""

    def test_treatment_plan_has_template_fk(self, sample_encounter):
        """Test TreatmentPlan has template foreign key."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Test plan",
        )
        assert hasattr(plan, "template")

    def test_treatment_plan_apply_template_method(self, sample_encounter, test_user):
        """Test TreatmentPlan.apply_template() method."""
        from hmis.apps.encounters.models import TreatmentPlan, TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Apply Test Template",
            default_medications='[{"name": "Paracetamol", "dosage": "500mg"}]',
            default_instructions="Take with water",
            follow_up_days=14,
            created_by=test_user,
        )

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Before template",
        )
        plan.apply_template(template)

        assert plan.template == template
        assert "Paracetamol" in plan.medications
        assert plan.follow_up_instructions == "Take with water"
        assert plan.follow_up_date == date.today() + timedelta(days=14)


# ============================================================================
# 6. PATIENT TIMELINE API TESTS
# ============================================================================


@pytest.mark.integration
class TestPatientTimelineAPI:
    """Test Patient Encounter Timeline API endpoint."""

    def test_timeline_endpoint_exists(self, authenticated_client, sample_patient):
        """Test /api/patients/{id}/encounter-timeline/ endpoint exists."""
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code != 404

    def test_timeline_returns_patient_info(
        self, authenticated_client, sample_patient, sample_encounter
    ):
        """Test timeline response includes patient information."""
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code == 200
        assert "patient" in response.data
        assert "mrn" in response.data["patient"]

    def test_timeline_returns_encounters_list(
        self, authenticated_client, sample_patient, sample_encounter
    ):
        """Test timeline response includes encounters list."""
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code == 200
        assert "timeline" in response.data
        assert isinstance(response.data["timeline"], list)

    def test_timeline_encounters_ordered_by_date(
        self, authenticated_client, sample_patient
    ):
        """Test timeline encounters are ordered newest first."""
        from hmis.apps.encounters.models import Encounter

        old = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Old visit",
        )
        new = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="New visit",
        )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        timeline = response.data["timeline"]
        assert timeline[0]["encounter_id"] == new.id
        assert timeline[1]["encounter_id"] == old.id

    def test_timeline_includes_vitals_summary(
        self, authenticated_client, sample_patient
    ):
        """Test timeline includes vitals summary for each encounter."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="With vitals",
            temperature=Decimal("37.5"),
            pulse=80,
            blood_pressure="120/80",
        )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "vitals_summary" in encounter_data
        assert "temperature" in encounter_data["vitals_summary"]

    def test_timeline_includes_diagnoses(self, authenticated_client, sample_patient):
        """Test timeline includes diagnoses for each encounter."""
        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="With diagnosis",
        )
        code = ICD10Code.objects.create(
            code="K35.80",
            description="Acute appendicitis",
            category="Digestive",
            chapter=11,
        )
        Diagnosis.objects.create(
            encounter=encounter,
            icd10_code=code,
            diagnosis_type="PRIMARY",
        )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "diagnoses" in encounter_data
        assert len(encounter_data["diagnoses"]) == 1

    def test_timeline_includes_statistics(
        self, authenticated_client, sample_patient
    ):
        """Test timeline response includes statistics."""
        from hmis.apps.encounters.models import Encounter

        for i in range(3):
            Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD" if i < 2 else "IPD",
                encounter_date=date.today() - timedelta(days=i * 10),
                chief_complaint=f"Visit {i + 1}",
            )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        assert "statistics" in response.data
        stats = response.data["statistics"]
        assert "total_encounters" in stats
        assert stats["total_encounters"] == 3
        assert "by_type" in stats

    def test_timeline_date_range_filter(self, authenticated_client, sample_patient):
        """Test timeline can be filtered by date range."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=60),
            chief_complaint="Old visit",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=5),
            chief_complaint="Recent visit",
        )

        start_date = (date.today() - timedelta(days=30)).isoformat()
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/?start_date={start_date}"
        )

        assert response.status_code == 200
        # Should only include recent visit
        assert len(response.data["timeline"]) == 1

    def test_timeline_requires_authentication(self, sample_patient):
        """Test timeline endpoint requires authentication."""
        client = APIClient()  # Not authenticated
        response = client.get(
            f"/api/patients/{sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code == 401

    def test_timeline_nonexistent_patient_returns_404(self, authenticated_client):
        """Test timeline for non-existent patient returns 404."""
        response = authenticated_client.get("/api/patients/99999/encounter-timeline/")
        assert response.status_code == 404


# ============================================================================
# DIAGNOSIS API ENHANCEMENTS TESTS
# ============================================================================


@pytest.mark.integration
class TestDiagnosisAPIEnhancements:
    """Test Diagnosis API includes new fields."""

    def test_create_diagnosis_with_certainty(
        self, authenticated_client, sample_encounter, sample_icd10_code
    ):
        """Test creating diagnosis via API with certainty field."""
        data = {
            "icd10_code": sample_icd10_code.id,
            "diagnosis_type": "PRIMARY",
            "certainty": "provisional",
        }

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["certainty"] == "provisional"

    def test_diagnosis_response_includes_certainty(
        self, authenticated_client, sample_encounter, sample_icd10_code
    ):
        """Test diagnosis list response includes certainty field."""
        from hmis.apps.encounters.models import Diagnosis

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            certainty="suspected",
        )

        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter.id}/diagnoses/"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert results[0]["certainty"] == "suspected"

    def test_diagnosis_response_includes_diagnosed_by(
        self, authenticated_client, sample_encounter, sample_icd10_code, test_user
    ):
        """Test diagnosis response includes diagnosed_by info."""
        from hmis.apps.encounters.models import Diagnosis

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=test_user,
        )

        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter.id}/diagnoses/"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert "diagnosed_by" in results[0]
