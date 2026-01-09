"""
Tests for enhanced vitals validation and clinical workflows.

Sprint 1.1-1.2: Encounter Management
TDD Focus: Test vital signs validation (ranges, units) and clinical workflows

Following TDD principles - these tests are written BEFORE implementation.
"""

from datetime import date
from decimal import Decimal

import pytest # type: ignore

pytestmark = pytest.mark.django_db


# ============================================================================
# Blood Pressure Parsing Tests
# ============================================================================


@pytest.mark.unit
class TestBloodPressureParsing:
    """Test blood pressure systolic/diastolic parsing and validation."""

    def test_parse_blood_pressure_valid(self, sample_patient):
        """Test parsing valid blood pressure format."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            blood_pressure="120/80",
        )

        assert encounter.get_systolic_bp() == 120
        assert encounter.get_diastolic_bp() == 80

    def test_parse_blood_pressure_high(self, sample_patient):
        """Test parsing high blood pressure values."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            blood_pressure="180/110",
        )

        assert encounter.get_systolic_bp() == 180
        assert encounter.get_diastolic_bp() == 110

    def test_parse_blood_pressure_empty(self, sample_patient):
        """Test parsing empty blood pressure returns None."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            blood_pressure="",
        )

        assert encounter.get_systolic_bp() is None
        assert encounter.get_diastolic_bp() is None

    def test_blood_pressure_critical_high_systolic(self, sample_patient):
        """Test critical alert for high systolic BP (>=180 mmHg - Hypertensive Crisis)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Dizziness",
            blood_pressure="185/95",
        )

        assert encounter.has_critical_vitals() is True
        assert "hypertensive crisis" in encounter.get_alerts().lower()

    def test_blood_pressure_critical_high_diastolic(self, sample_patient):
        """Test critical alert for high diastolic BP (>=120 mmHg)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            blood_pressure="150/125",
        )

        assert encounter.has_critical_vitals() is True
        assert "hypertensive" in encounter.get_alerts().lower()

    def test_blood_pressure_critical_low(self, sample_patient):
        """Test critical alert for low BP (Hypotension - systolic <90 or diastolic <60)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Fainting",
            blood_pressure="85/55",
        )

        assert encounter.has_critical_vitals() is True
        assert "hypotension" in encounter.get_alerts().lower()

    def test_blood_pressure_normal_no_alert(self, sample_patient):
        """Test normal blood pressure does not trigger critical alert."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            blood_pressure="120/80",
        )

        # Normal BP should not be flagged as critical (unless other vitals are critical)
        alerts = encounter.get_alerts()
        assert "hypertensive" not in alerts.lower()
        assert "hypotension" not in alerts.lower()


# ============================================================================
# Enhanced Vitals Validation Tests
# ============================================================================


@pytest.mark.unit
class TestEnhancedVitalsValidation:
    """Test enhanced vital signs validation with clinical ranges."""

    def test_temperature_celsius_validation(self, sample_patient):
        """Test temperature is validated as Celsius (35-45°C)."""
        from hmis.apps.encounters.models import Encounter

        # Valid temperature
        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            temperature=Decimal("38.5"),
        )
        encounter.full_clean()  # Should not raise

    def test_temperature_hypothermia_alert(self, sample_patient):
        """Test hypothermia alert for temperature < 36°C."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Found unresponsive",
            temperature=Decimal("35.0"),
        )

        assert encounter.has_critical_vitals() is True
        assert "hypothermia" in encounter.get_alerts().lower()

    def test_temperature_high_fever_alert(self, sample_patient):
        """Test high fever alert for temperature > 39°C."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="High fever",
            temperature=Decimal("40.5"),
        )

        assert encounter.has_critical_vitals() is True
        assert "fever" in encounter.get_alerts().lower()

    def test_pulse_bradycardia_alert(self, sample_patient):
        """Test bradycardia alert for pulse < 50 bpm."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Feeling faint",
            pulse=45,
        )

        assert encounter.has_critical_vitals() is True
        assert "bradycardia" in encounter.get_alerts().lower()

    def test_pulse_tachycardia_alert(self, sample_patient):
        """Test tachycardia alert for pulse > 120 bpm."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Palpitations",
            pulse=150,
        )

        assert encounter.has_critical_vitals() is True
        assert "tachycardia" in encounter.get_alerts().lower()

    def test_respiratory_rate_bradypnea_alert(self, sample_patient):
        """Test bradypnea alert for respiratory rate < 12/min."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Drowsy",
            respiratory_rate=10,
        )

        assert encounter.has_critical_vitals() is True
        assert "bradypnea" in encounter.get_alerts().lower()

    def test_respiratory_rate_tachypnea_alert(self, sample_patient):
        """Test tachypnea alert for respiratory rate > 25/min."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Difficulty breathing",
            respiratory_rate=30,
        )

        assert encounter.has_critical_vitals() is True
        assert "tachypnea" in encounter.get_alerts().lower()

    def test_spo2_severe_hypoxemia_alert(self, sample_patient):
        """Test severe hypoxemia alert for SpO2 < 90%."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Respiratory distress",
            spo2=Decimal("85.0"),
        )

        assert encounter.has_critical_vitals() is True
        assert "severe hypoxemia" in encounter.get_alerts().lower()

    def test_spo2_hypoxemia_alert(self, sample_patient):
        """Test hypoxemia alert for SpO2 90-94% (warning level, not critical)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Shortness of breath",
            spo2=Decimal("92.0"),
        )

        # SpO2 90-94% is warning (mild hypoxemia), not critical
        assert encounter.has_critical_vitals() is False
        # But get_alerts() includes warnings for SpO2
        assert encounter.get_vital_status("spo2") == "warning"

    def test_all_vitals_normal_no_alerts(self, sample_patient):
        """Test normal vitals produce no alerts."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            temperature=Decimal("36.8"),
            pulse=72,
            blood_pressure="120/80",
            respiratory_rate=16,
            spo2=Decimal("98.0"),
        )

        assert encounter.has_critical_vitals() is False
        assert encounter.get_alerts() == ""


# ============================================================================
# BMI Calculation Tests
# ============================================================================


@pytest.mark.unit
class TestBMICalculation:
    """Test BMI calculation and classification."""

    def test_bmi_calculation(self, sample_patient):
        """Test BMI is calculated correctly from weight and height."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Weight check",
            weight=Decimal("70.0"),
            height=Decimal("175.0"),
        )

        # BMI = 70 / (1.75^2) = 22.86
        assert encounter.calculate_bmi() == pytest.approx(22.9, 0.1)

    def test_bmi_underweight_classification(self, sample_patient):
        """Test BMI classification for underweight (< 18.5)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Weight concern",
            weight=Decimal("45.0"),
            height=Decimal("170.0"),
        )

        # BMI = 45 / (1.70^2) = 15.57
        assert encounter.get_bmi_classification() == "Underweight"

    def test_bmi_normal_classification(self, sample_patient):
        """Test BMI classification for normal weight (18.5-24.9)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            weight=Decimal("65.0"),
            height=Decimal("170.0"),
        )

        # BMI = 65 / (1.70^2) = 22.49
        assert encounter.get_bmi_classification() == "Normal"

    def test_bmi_overweight_classification(self, sample_patient):
        """Test BMI classification for overweight (25-29.9)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Weight management",
            weight=Decimal("85.0"),
            height=Decimal("175.0"),
        )

        # BMI = 85 / (1.75^2) = 27.76
        assert encounter.get_bmi_classification() == "Overweight"

    def test_bmi_obese_classification(self, sample_patient):
        """Test BMI classification for obese (>= 30)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Weight management",
            weight=Decimal("100.0"),
            height=Decimal("170.0"),
        )

        # BMI = 100 / (1.70^2) = 34.60
        assert encounter.get_bmi_classification() == "Obese"

    def test_bmi_missing_weight_returns_none(self, sample_patient):
        """Test BMI returns None when weight is missing."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            height=Decimal("175.0"),
        )

        assert encounter.calculate_bmi() is None
        assert encounter.get_bmi_classification() is None

    def test_bmi_missing_height_returns_none(self, sample_patient):
        """Test BMI returns None when height is missing."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            weight=Decimal("70.0"),
        )

        assert encounter.calculate_bmi() is None
        assert encounter.get_bmi_classification() is None


# ============================================================================
# Combined Critical Vitals Tests
# ============================================================================


@pytest.mark.unit
class TestCombinedCriticalVitals:
    """Test multiple critical vitals detection."""

    def test_multiple_critical_vitals(self, sample_patient):
        """Test patient with multiple critical vitals generates multiple alerts."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Multi-system emergency",
            temperature=Decimal("40.0"),  # Fever
            pulse=140,  # Tachycardia
            blood_pressure="85/50",  # Hypotension
            spo2=Decimal("88.0"),  # Severe hypoxemia
        )

        assert encounter.has_critical_vitals() is True
        alerts = encounter.get_alerts()
        assert "fever" in alerts.lower()
        assert "tachycardia" in alerts.lower()
        assert "hypotension" in alerts.lower()
        assert "hypoxemia" in alerts.lower()

    def test_get_vitals_summary(self, sample_patient):
        """Test get_vitals_summary returns formatted vitals string."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            temperature=Decimal("37.0"),
            pulse=75,
            blood_pressure="120/80",
            respiratory_rate=16,
            spo2=Decimal("98.0"),
            weight=Decimal("70.0"),
            height=Decimal("175.0"),
        )

        summary = encounter.get_vitals_summary()
        assert "37.0°C" in summary
        assert "75 bpm" in summary
        assert "120/80 mmHg" in summary
        assert "16/min" in summary
        assert "98.0%" in summary


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_patient(db):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth=date(1990, 5, 15),
        gender="M",
    )
