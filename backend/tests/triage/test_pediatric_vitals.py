"""
Tests for pediatric vital signs validation.

Sprint 1.1-1.2: Enhanced Encounter Management
TDD Focus: Age-aware vital sign ranges for pediatric patients

Pediatric vital signs have different normal ranges than adults:
- Newborns and infants have higher heart rates and respiratory rates
- Blood pressure norms vary by age, sex, and height percentiles
- These tests ensure proper age-based vital sign classification

Following TDD methodology - these tests are written BEFORE implementation.
"""

from datetime import date, timedelta

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


# ============================================================================
# Pediatric Age Group Constants (for reference)
# ============================================================================
# Newborn: 0-28 days
# Infant: 1-12 months
# Toddler: 1-3 years
# Preschool: 3-6 years
# School Age: 6-12 years
# Adolescent: 12-18 years


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def newborn_patient(db, sample_organization):
    """Create a newborn patient (14 days old)."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Baby",
        last_name="Newborn",
        date_of_birth=date.today() - timedelta(days=14),
        gender="F",
        organization=sample_organization,
    )


@pytest.fixture
def infant_patient(db, sample_organization):
    """Create an infant patient (6 months old)."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Baby",
        last_name="Infant",
        date_of_birth=date.today() - timedelta(days=180),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def toddler_patient(db, sample_organization):
    """Create a toddler patient (2 years old)."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Child",
        last_name="Toddler",
        date_of_birth=date.today() - timedelta(days=730),
        gender="F",
        organization=sample_organization,
    )


@pytest.fixture
def school_age_patient(db, sample_organization):
    """Create a school-age patient (8 years old)."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Child",
        last_name="SchoolAge",
        date_of_birth=date.today() - timedelta(days=2920),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def adolescent_patient(db, sample_organization):
    """Create an adolescent patient (15 years old)."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Teen",
        last_name="Adolescent",
        date_of_birth=date.today() - timedelta(days=5475),
        gender="F",
        organization=sample_organization,
    )


@pytest.fixture
def adult_patient(db, sample_organization):
    """Create an adult patient (30 years old) for comparison."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Adult",
        last_name="Patient",
        date_of_birth=date.today() - timedelta(days=10950),
        gender="M",
        organization=sample_organization,
    )


# ============================================================================
# Pediatric Pulse Range Tests
# ============================================================================


@pytest.mark.unit
class TestPediatricPulseRanges:
    """Test age-appropriate pulse rate ranges for pediatric patients."""

    def test_newborn_pulse_140_is_normal(self, newborn_patient, sample_facility):
        """Newborn pulse 140 bpm should be normal (normal range: 100-205)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            pulse=140,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_newborn_pulse_180_is_normal(self, newborn_patient, sample_facility):
        """Newborn pulse 180 bpm should be normal (high end of normal)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            pulse=180,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_newborn_pulse_70_is_critical(self, newborn_patient, sample_facility):
        """Newborn pulse 70 bpm should be critical (bradycardia for newborn)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Lethargic baby",
            pulse=70,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "critical"

    def test_infant_pulse_130_is_normal(self, infant_patient, sample_facility):
        """Infant pulse 130 bpm should be normal (normal range: 100-180)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            pulse=130,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_infant_pulse_80_is_warning(self, infant_patient, sample_facility):
        """Infant pulse 80 bpm should be warning (low for infant)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            pulse=80,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "warning"

    def test_toddler_pulse_120_is_normal(self, toddler_patient, sample_facility):
        """Toddler pulse 120 bpm should be normal (normal range: 98-140)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=toddler_patient,
            encounter_type="OPD",
            chief_complaint="Wellness check",
            pulse=120,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_school_age_pulse_90_is_normal(self, school_age_patient, sample_facility):
        """School-age pulse 90 bpm should be normal (normal range: 75-118)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=school_age_patient,
            encounter_type="OPD",
            chief_complaint="School physical",
            pulse=90,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_adolescent_pulse_75_is_normal(self, adolescent_patient, sample_facility):
        """Adolescent pulse 75 bpm should be normal (approaching adult norms)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adolescent_patient,
            encounter_type="OPD",
            chief_complaint="Sports physical",
            pulse=75,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_adult_pulse_140_is_critical(self, adult_patient, sample_facility):
        """Adult pulse 140 bpm should be critical (tachycardia for adult)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adult_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Palpitations",
            pulse=140,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "critical"


# ============================================================================
# Pediatric Respiratory Rate Tests
# ============================================================================


@pytest.mark.unit
class TestPediatricRespiratoryRate:
    """Test age-appropriate respiratory rate ranges for pediatric patients."""

    def test_newborn_rr_45_is_normal(self, newborn_patient, sample_facility):
        """Newborn RR 45/min should be normal (normal range: 30-60)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            respiratory_rate=45,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_newborn_rr_25_is_critical(self, newborn_patient, sample_facility):
        """Newborn RR 25/min should be critical (bradypnea for newborn)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Lethargic baby",
            respiratory_rate=25,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "critical"

    def test_newborn_rr_65_is_critical(self, newborn_patient, sample_facility):
        """Newborn RR 65/min should be critical (tachypnea)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Respiratory distress",
            respiratory_rate=65,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "critical"

    def test_infant_rr_40_is_normal(self, infant_patient, sample_facility):
        """Infant RR 40/min should be normal (normal range: 30-53)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            respiratory_rate=40,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_toddler_rr_28_is_normal(self, toddler_patient, sample_facility):
        """Toddler RR 28/min should be normal (normal range: 22-37)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=toddler_patient,
            encounter_type="OPD",
            chief_complaint="Wellness check",
            respiratory_rate=28,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_school_age_rr_20_is_normal(self, school_age_patient, sample_facility):
        """School-age RR 20/min should be normal (normal range: 18-25)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=school_age_patient,
            encounter_type="OPD",
            chief_complaint="School physical",
            respiratory_rate=20,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_adolescent_rr_16_is_normal(self, adolescent_patient, sample_facility):
        """Adolescent RR 16/min should be normal (approaching adult norms: 12-20)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adolescent_patient,
            encounter_type="OPD",
            chief_complaint="Sports physical",
            respiratory_rate=16,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_adult_rr_40_is_critical(self, adult_patient, sample_facility):
        """Adult RR 40/min should be critical (tachypnea for adult)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adult_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Respiratory distress",
            respiratory_rate=40,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "critical"


# ============================================================================
# Pediatric Blood Pressure Tests
# ============================================================================


@pytest.mark.unit
class TestPediatricBloodPressure:
    """Test age-appropriate blood pressure ranges for pediatric patients.

    Pediatric BP norms (simplified by age):
    - Infant: 72-104/37-56 mmHg
    - Toddler (1-3y): 86-106/42-63 mmHg
    - Preschool (3-6y): 89-112/46-72 mmHg
    - School age (6-12y): 97-120/57-80 mmHg
    - Adolescent: Similar to adult (90-120/60-80)
    """

    def test_infant_bp_90_60_is_normal(self, infant_patient, sample_facility):
        """Infant BP 90/60 should be normal."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            blood_pressure="90/55",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "normal"

    def test_toddler_bp_95_55_is_normal(self, toddler_patient, sample_facility):
        """Toddler BP 95/55 should be normal."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=toddler_patient,
            encounter_type="OPD",
            chief_complaint="Wellness check",
            blood_pressure="95/55",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "normal"

    def test_school_age_bp_110_70_is_normal(self, school_age_patient, sample_facility):
        """School-age BP 110/70 should be normal."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=school_age_patient,
            encounter_type="OPD",
            chief_complaint="School physical",
            blood_pressure="110/70",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "normal"

    def test_infant_bp_130_90_is_critical(self, infant_patient, sample_facility):
        """Infant BP 130/90 should be critical (hypertensive for infant)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Irritable infant",
            blood_pressure="130/90",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "critical"

    def test_toddler_bp_60_40_is_critical(self, toddler_patient, sample_facility):
        """Toddler BP 60/40 should be critical (hypotensive)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=toddler_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Lethargic child",
            blood_pressure="60/40",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "critical"


# ============================================================================
# Utility Method Tests
# ============================================================================


@pytest.mark.unit
class TestPediatricUtilityMethods:
    """Test utility methods for pediatric vital sign handling."""

    def test_get_patient_age_in_years(self, infant_patient, sample_facility):
        """Test encounter can determine patient age in years."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            facility=sample_facility,
        )
        # Infant is ~6 months old = 0 years
        assert encounter.get_patient_age_years() == 0

    def test_get_patient_age_in_days(self, newborn_patient, sample_facility):
        """Test encounter can determine patient age in days for newborns."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            facility=sample_facility,
        )
        # Newborn is 14 days old
        age_days = encounter.get_patient_age_days()
        assert 13 <= age_days <= 15  # Allow for test timing variance

    def test_is_pediatric_patient_true_for_child(self, school_age_patient, sample_facility):
        """Test is_pediatric_patient returns True for patient under 18."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=school_age_patient,
            encounter_type="OPD",
            chief_complaint="School physical",
            facility=sample_facility,
        )
        assert encounter.is_pediatric_patient() is True

    def test_is_pediatric_patient_false_for_adult(self, adult_patient, sample_facility):
        """Test is_pediatric_patient returns False for patient 18+."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adult_patient,
            encounter_type="OPD",
            chief_complaint="Annual checkup",
            facility=sample_facility,
        )
        assert encounter.is_pediatric_patient() is False

    def test_get_pediatric_age_group_newborn(self, newborn_patient, sample_facility):
        """Test correct age group classification for newborn."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            facility=sample_facility,
        )
        assert encounter.get_pediatric_age_group() == "newborn"

    def test_get_pediatric_age_group_infant(self, infant_patient, sample_facility):
        """Test correct age group classification for infant."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            facility=sample_facility,
        )
        assert encounter.get_pediatric_age_group() == "infant"

    def test_get_pediatric_age_group_toddler(self, toddler_patient, sample_facility):
        """Test correct age group classification for toddler."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=toddler_patient,
            encounter_type="OPD",
            chief_complaint="Wellness check",
            facility=sample_facility,
        )
        assert encounter.get_pediatric_age_group() == "toddler"

    def test_get_pediatric_age_group_school_age(self, school_age_patient, sample_facility):
        """Test correct age group classification for school-age child."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=school_age_patient,
            encounter_type="OPD",
            chief_complaint="School physical",
            facility=sample_facility,
        )
        assert encounter.get_pediatric_age_group() == "school_age"

    def test_get_pediatric_age_group_adolescent(self, adolescent_patient, sample_facility):
        """Test correct age group classification for adolescent."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adolescent_patient,
            encounter_type="OPD",
            chief_complaint="Sports physical",
            facility=sample_facility,
        )
        assert encounter.get_pediatric_age_group() == "adolescent"

    def test_get_pediatric_age_group_adult_returns_none(self, adult_patient, sample_facility):
        """Test adult patient returns None for pediatric age group."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=adult_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            facility=sample_facility,
        )
        assert encounter.get_pediatric_age_group() is None


# ============================================================================
# Integration Tests - Vital Status with Pediatric Awareness
# ============================================================================


@pytest.mark.unit
class TestPediatricVitalStatusIntegration:
    """Integration tests for pediatric-aware vital status."""

    def test_get_all_vital_statuses_uses_pediatric_ranges(self, infant_patient, sample_facility):
        """Test get_all_vital_statuses uses age-appropriate ranges for infant."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=infant_patient,
            encounter_type="OPD",
            chief_complaint="Well baby visit",
            pulse=140,  # Normal for infant, tachycardia for adult
            respiratory_rate=40,  # Normal for infant, tachypnea for adult
            blood_pressure="90/55",  # Normal for infant,
            facility=sample_facility,
        )

        statuses = encounter.get_all_vital_statuses()
        assert statuses["pulse"]["status"] == "normal"
        assert statuses["respiratory_rate"]["status"] == "normal"
        assert statuses["systolic_bp"]["status"] == "normal"

    def test_critical_alerts_use_pediatric_thresholds(self, newborn_patient, sample_facility):
        """Test critical vitals detection uses pediatric thresholds."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=newborn_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Lethargic baby",
            pulse=70,  # Critical for newborn (bradycardia)
            respiratory_rate=20,  # Critical for newborn (bradypnea),
            facility=sample_facility,
        )

        assert encounter.has_critical_vitals() is True
        alerts = encounter.get_alerts()
        assert "bradycardia" in alerts.lower() or "pulse" in alerts.lower()

    def test_vitals_summary_indicates_pediatric_patient(self, toddler_patient, sample_facility):
        """Test vitals summary includes pediatric indicator."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=toddler_patient,
            encounter_type="OPD",
            chief_complaint="Wellness check",
            pulse=120,
            respiratory_rate=28,
            facility=sample_facility,
        )

        # The encounter should recognize this is a pediatric patient
        assert encounter.is_pediatric_patient() is True
