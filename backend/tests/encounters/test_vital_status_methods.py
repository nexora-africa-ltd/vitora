"""
Tests for Vital Status methods on Encounter model - Sprint 1.1-1.2.

Tests cover:
1. get_vital_status() - Individual vital classification
2. get_all_vital_statuses() - All vitals at once
3. get_map() - Mean Arterial Pressure calculation
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


# ============================================================================
# Local Fixtures
# ============================================================================


@pytest.fixture
def vital_test_patient(db, sample_organization):
    """Create a sample patient for vital tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Vital",
        last_name="Test",
        date_of_birth=date(1985, 3, 20),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def vital_test_encounter(db, vital_test_patient, sample_facility):
    """Create a sample encounter for vital tests."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=vital_test_patient,
        encounter_type="OPD",
        chief_complaint="Vital status test",
        facility=sample_facility,
    )


# ============================================================================
# get_vital_status() Tests
# ============================================================================


@pytest.mark.unit
class TestGetVitalStatusMethod:
    """Test get_vital_status() method implementation."""

    def test_get_vital_status_exists(self, vital_test_encounter):
        """Test Encounter has get_vital_status method."""
        assert hasattr(vital_test_encounter, "get_vital_status")
        assert callable(vital_test_encounter.get_vital_status)

    def test_temperature_normal_status(self, vital_test_patient, sample_facility):
        """Test temperature 36.5°C returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=Decimal("36.5"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("temperature") == "normal"

    def test_temperature_warning_low_status(self, vital_test_patient, sample_facility):
        """Test temperature 35.8°C returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Feeling cold",
            temperature=Decimal("35.8"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("temperature") == "warning"

    def test_temperature_warning_high_status(self, vital_test_patient, sample_facility):
        """Test temperature 37.6°C returns 'warning' status (low-grade fever)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Low grade fever",
            temperature=Decimal("37.6"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("temperature") == "warning"

    def test_temperature_critical_low_status(self, vital_test_patient, sample_facility):
        """Test temperature 31.5°C returns 'critical' status (severe hypothermia)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Severe Hypothermia",
            temperature=Decimal("31.5"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("temperature") == "critical"

    def test_temperature_critical_high_status(self, vital_test_patient, sample_facility):
        """Test temperature ≥40°C returns 'critical' status (high fever/hyperpyrexia)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="High fever",
            temperature=Decimal("40.5"),  # ≥40°C is critical,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("temperature") == "critical"

    def test_pulse_normal_status(self, vital_test_patient, sample_facility):
        """Test pulse 75 bpm returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            pulse=75,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "normal"

    def test_pulse_warning_low_status(self, vital_test_patient, sample_facility):
        """Test pulse 55 bpm returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Slow heart rate",
            pulse=55,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "warning"

    def test_pulse_warning_high_status(self, vital_test_patient, sample_facility):
        """Test pulse 110 bpm returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Palpitations",
            pulse=110,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "warning"

    def test_pulse_critical_low_status(self, vital_test_patient, sample_facility):
        """Test pulse 45 bpm returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Bradycardia",
            pulse=45,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "critical"

    def test_pulse_critical_high_status(self, vital_test_patient, sample_facility):
        """Test pulse 135 bpm returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Tachycardia",
            pulse=135,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("pulse") == "critical"

    def test_systolic_bp_normal_status(self, vital_test_patient, sample_facility):
        """Test systolic BP 115 returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            blood_pressure="115/75",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "normal"

    def test_systolic_bp_warning_status(self, vital_test_patient, sample_facility):
        """Test systolic BP 130 returns 'warning' status (prehypertension)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="BP check",
            blood_pressure="130/85",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "warning"

    def test_systolic_bp_critical_high_status(self, vital_test_patient, sample_facility):
        """Test systolic BP 145 returns 'critical' status (hypertension)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="High BP",
            blood_pressure="145/95",
            facility=sample_facility,
        )
        assert encounter.get_vital_status("systolic_bp") == "critical"

    def test_spo2_normal_status(self, vital_test_patient, sample_facility):
        """Test SpO2 98% returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            spo2=Decimal("98.0"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("spo2") == "normal"

    def test_spo2_warning_status(self, vital_test_patient, sample_facility):
        """Test SpO2 92% returns 'warning' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Mild hypoxia",
            spo2=Decimal("92.0"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("spo2") == "warning"

    def test_spo2_critical_status(self, vital_test_patient, sample_facility):
        """Test SpO2 88% returns 'critical' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Severe hypoxia",
            spo2=Decimal("88.0"),
            facility=sample_facility,
        )
        assert encounter.get_vital_status("spo2") == "critical"

    def test_respiratory_rate_normal_status(self, vital_test_patient, sample_facility):
        """Test RR 16/min returns 'normal' status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            respiratory_rate=16,
            facility=sample_facility,
        )
        assert encounter.get_vital_status("respiratory_rate") == "normal"

    def test_vital_status_returns_none_when_missing(self, vital_test_encounter):
        """Test get_vital_status returns None when vital not recorded."""
        assert vital_test_encounter.get_vital_status("temperature") is None

    def test_invalid_vital_name_raises_error(self, vital_test_patient, sample_facility):
        """Test invalid vital name raises ValueError."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            temperature=Decimal("37.0"),
            facility=sample_facility,
        )
        with pytest.raises(ValueError):
            encounter.get_vital_status("invalid_vital")


# ============================================================================
# get_all_vital_statuses() Tests
# ============================================================================


@pytest.mark.unit
class TestGetAllVitalStatusesMethod:
    """Test get_all_vital_statuses() method implementation."""

    def test_get_all_vital_statuses_exists(self, vital_test_encounter):
        """Test Encounter has get_all_vital_statuses method."""
        assert hasattr(vital_test_encounter, "get_all_vital_statuses")
        assert callable(vital_test_encounter.get_all_vital_statuses)

    def test_get_all_vital_statuses_returns_dict(self, vital_test_patient, sample_facility):
        """Test get_all_vital_statuses returns dictionary."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Full vitals",
            temperature=Decimal("37.0"),
            pulse=75,
            blood_pressure="120/80",
            respiratory_rate=16,
            spo2=Decimal("98.0"),
            facility=sample_facility,
        )
        statuses = encounter.get_all_vital_statuses()
        assert isinstance(statuses, dict)

    def test_all_vital_statuses_structure(self, vital_test_patient, sample_facility):
        """Test get_all_vital_statuses returns correct structure."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Full vitals",
            temperature=Decimal("37.0"),
            pulse=75,
            blood_pressure="120/80",
            respiratory_rate=16,
            spo2=Decimal("98.0"),
            facility=sample_facility,
        )
        statuses = encounter.get_all_vital_statuses()

        # Should have keys for each vital
        assert "temperature" in statuses
        assert "pulse" in statuses
        assert "systolic_bp" in statuses
        assert "diastolic_bp" in statuses
        assert "respiratory_rate" in statuses
        assert "spo2" in statuses

        # Each value should have 'value', 'status', 'unit' keys
        for vital, data in statuses.items():
            if data is not None:
                assert "value" in data
                assert "status" in data
                assert "unit" in data

    def test_all_vital_statuses_mixed_statuses(self, vital_test_patient, sample_facility):
        """Test with mixed normal/warning/critical vitals."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Multi-system issue",
            temperature=Decimal("40.5"),  # Critical (≥40°C)
            pulse=75,  # Normal
            blood_pressure="130/85",  # Warning
            spo2=Decimal("88.0"),  # Critical,
            facility=sample_facility,
        )
        statuses = encounter.get_all_vital_statuses()

        assert statuses["temperature"]["status"] == "critical"
        assert statuses["pulse"]["status"] == "normal"
        assert statuses["systolic_bp"]["status"] == "warning"
        assert statuses["spo2"]["status"] == "critical"


# ============================================================================
# get_map() (Mean Arterial Pressure) Tests
# ============================================================================


@pytest.mark.unit
class TestGetMAPMethod:
    """Test get_map() Mean Arterial Pressure calculation."""

    def test_get_map_exists(self, vital_test_encounter):
        """Test Encounter has get_map method."""
        assert hasattr(vital_test_encounter, "get_map")
        assert callable(vital_test_encounter.get_map)

    def test_map_calculation_normal_bp(self, vital_test_patient, sample_facility):
        """Test MAP calculation for 120/80: MAP = DBP + 1/3(SBP - DBP)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="BP check",
            blood_pressure="120/80",
            facility=sample_facility,
        )
        # MAP = 80 + 1/3(120 - 80) = 80 + 13.33 = 93.33 ≈ 93
        map_value = encounter.get_map()
        assert map_value == pytest.approx(93, abs=1)

    def test_map_calculation_high_bp(self, vital_test_patient, sample_facility):
        """Test MAP calculation for 180/110."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypertensive crisis",
            blood_pressure="180/110",
            facility=sample_facility,
        )
        # MAP = 110 + 1/3(180 - 110) = 110 + 23.33 = 133.33 ≈ 133
        map_value = encounter.get_map()
        assert map_value == pytest.approx(133, abs=1)

    def test_map_calculation_low_bp(self, vital_test_patient, sample_facility):
        """Test MAP calculation for 90/60."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Hypotension",
            blood_pressure="90/60",
            facility=sample_facility,
        )
        # MAP = 60 + 1/3(90 - 60) = 60 + 10 = 70
        map_value = encounter.get_map()
        assert map_value == pytest.approx(70, abs=1)

    def test_map_returns_none_without_bp(self, vital_test_patient, sample_facility):
        """Test MAP returns None when BP not recorded."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="No BP",
            facility=sample_facility,
        )
        assert encounter.get_map() is None

    def test_map_returns_none_with_empty_bp(self, vital_test_patient, sample_facility):
        """Test MAP returns None when BP is empty string."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=vital_test_patient,
            encounter_type="OPD",
            chief_complaint="Empty BP",
            blood_pressure="",
            facility=sample_facility,
        )
        assert encounter.get_map() is None
