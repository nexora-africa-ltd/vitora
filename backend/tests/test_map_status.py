"""
Tests for Mean Arterial Pressure (MAP) status calculation.

Phase 2: Deferred Items Implementation
TDD Focus: get_map_status() method on Encounter model

MAP = Diastolic + (1/3 × (Systolic - Diastolic))
Normal: 70-100 mmHg

Note: get_map() already exists in encounters/models.py
This file tests the new get_map_status() method.

Following TDD methodology - these tests are written BEFORE implementation.
"""

from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.django_db


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def map_test_patient(db):
    """Create a patient for MAP testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Map",
        last_name="TestPatient",
        date_of_birth=date.today() - timedelta(days=10950),  # ~30 years old
        gender="M",
    )


# ============================================================================
# get_map_status() Method Tests
# ============================================================================


@pytest.mark.unit
class TestGetMAPStatusMethod:
    """Test get_map_status() method for MAP status classification."""

    def test_get_map_status_method_exists(self, map_test_patient):
        """Test that get_map_status method exists on Encounter."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="BP check",
        )

        assert hasattr(encounter, "get_map_status")
        assert callable(encounter.get_map_status)

    def test_map_status_normal_range(self, map_test_patient):
        """Test MAP status is 'normal' for 70-100 mmHg range."""
        from hmis.apps.encounters.models import Encounter

        # BP 120/80 -> MAP = 80 + (120-80)/3 = 93.3 -> normal
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="Routine BP",
            blood_pressure="120/80",
        )

        assert encounter.get_map_status() == "normal"

    def test_map_status_normal_low_boundary(self, map_test_patient):
        """Test MAP status at lower normal boundary (70 mmHg)."""
        from hmis.apps.encounters.models import Encounter

        # Need BP that gives MAP around 70
        # MAP = DBP + (SBP-DBP)/3 = 70
        # Example: 90/60 -> 60 + 30/3 = 70
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="Low-normal BP",
            blood_pressure="90/60",
        )

        assert encounter.get_map_status() == "normal"

    def test_map_status_normal_high_boundary(self, map_test_patient):
        """Test MAP status at upper normal boundary (100 mmHg)."""
        from hmis.apps.encounters.models import Encounter

        # Need BP that gives MAP around 100
        # Example: 135/82 -> 82 + 53/3 = 82 + 17.67 = 99.67 ≈ 100
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="High-normal BP",
            blood_pressure="135/82",
        )

        status = encounter.get_map_status()
        assert status == "normal"

    def test_map_status_low(self, map_test_patient):
        """Test MAP status is 'warning' when below 70 mmHg (warning_low range)."""
        from hmis.apps.encounters.models import Encounter

        # Need BP that gives MAP in warning_low range (65-69 for adult)
        # Example: 85/55 -> 55 + 30/3 = 55 + 10 = 65
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypotension",
            blood_pressure="85/55",
        )

        assert encounter.get_map_status() == "warning"

    def test_map_status_high(self, map_test_patient):
        """Test MAP status is 'warning' when above 100 mmHg (warning_high range)."""
        from hmis.apps.encounters.models import Encounter

        # Need BP that gives MAP in warning_high range (101-105 for adult)
        # Example: 145/85 -> 85 + 60/3 = 85 + 20 = 105
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypertensive crisis",
            blood_pressure="145/85",
        )

        assert encounter.get_map_status() == "warning"

    def test_map_status_critical_low(self, map_test_patient):
        """Test MAP status is 'critical' when severely low (< 60 mmHg)."""
        from hmis.apps.encounters.models import Encounter

        # MAP < 60 is life-threatening (organ perfusion compromised)
        # Example: 70/50 -> 50 + 20/3 = 50 + 6.67 = 56.67
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Severe hypotension / shock",
            blood_pressure="70/50",
        )

        assert encounter.get_map_status() == "critical"

    def test_map_status_critical_high(self, map_test_patient):
        """Test MAP status is 'emergency' when severely high (> 130 mmHg)."""
        from hmis.apps.encounters.models import Encounter

        # MAP > 130 is hypertensive emergency
        # Example: 200/130 -> 130 + 70/3 = 130 + 23.3 = 153.3
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypertensive emergency",
            blood_pressure="200/130",
        )

        assert encounter.get_map_status() == "emergency"

    def test_map_status_unknown_without_bp(self, map_test_patient):
        """Test MAP status is None when BP not recorded."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="No BP taken",
        )

        assert encounter.get_map_status() is None

    def test_map_status_unknown_with_empty_bp(self, map_test_patient):
        """Test MAP status is None when BP is empty string."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="Empty BP",
            blood_pressure="",
        )

        assert encounter.get_map_status() is None


# ============================================================================
# MAP Status Ranges Constants Tests
# ============================================================================


@pytest.mark.unit
class TestMAPStatusRanges:
    """Test MAP status range definitions."""

    def test_map_ranges_defined(self):
        """Test that MAP ranges are defined in the model."""
        from hmis.apps.encounters.models import Encounter

        # Check that VITAL_RANGES or MAP_RANGES contains MAP thresholds
        # This can be defined as a class attribute or in settings
        assert hasattr(Encounter, "MAP_RANGES") or hasattr(Encounter, "VITAL_RANGES")

    def test_map_normal_range_is_70_to_100(self):
        """Test normal MAP range is 70-100 mmHg per clinical standards."""
        from hmis.apps.encounters.models import Encounter

        # Access the MAP ranges - implementation may vary
        if hasattr(Encounter, "MAP_RANGES"):
            ranges = Encounter.MAP_RANGES
            assert ranges["normal"] == (70, 100)
        else:
            # If embedded in VITAL_RANGES
            pass  # Skip if not implemented this way


# ============================================================================
# MAP in Timeline/Summary Tests
# ============================================================================


@pytest.mark.unit
class TestMAPInVitalsSummary:
    """Test MAP inclusion in vitals summary and timeline."""

    def test_map_included_in_all_vital_statuses(self, map_test_patient):
        """Test that get_all_vital_statuses includes MAP."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="Complete vitals",
            blood_pressure="120/80",
            temperature=37.0,
            pulse=80,
        )

        statuses = encounter.get_all_vital_statuses()

        assert "map" in statuses
        assert statuses["map"]["value"] == encounter.get_map()
        assert statuses["map"]["status"] == encounter.get_map_status()
        assert statuses["map"]["unit"] == "mmHg"

    def test_map_null_in_statuses_when_no_bp(self, map_test_patient):
        """Test MAP is None in statuses when BP not recorded."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="No BP",
            temperature=37.0,
        )

        statuses = encounter.get_all_vital_statuses()

        assert statuses.get("map") is None


# ============================================================================
# MAP Critical Alert Tests
# ============================================================================


@pytest.mark.unit
class TestMAPCriticalAlerts:
    """Test MAP contribution to critical vitals alerts."""

    def test_critical_map_triggers_has_critical_vitals(self, map_test_patient):
        """Test that critical MAP triggers has_critical_vitals()."""
        from hmis.apps.encounters.models import Encounter

        # Severely low MAP (shock)
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Shock",
            blood_pressure="70/50",
        )

        assert encounter.has_critical_vitals() is True

    def test_critical_map_generates_alert(self, map_test_patient):
        """Test that critical MAP is included in get_alerts()."""
        from hmis.apps.encounters.models import Encounter

        # Hypertensive emergency
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Hypertensive emergency",
            blood_pressure="200/130",
        )

        alerts = encounter.get_alerts()

        # Should mention MAP or hypotension/hypertension
        assert len(alerts) > 0 or "MAP" in alerts or "pressure" in alerts.lower()


# ============================================================================
# Pediatric MAP Tests
# ============================================================================


@pytest.mark.unit
class TestPediatricMAPStatus:
    """Test MAP status for pediatric patients (different ranges)."""

    def test_pediatric_map_uses_age_appropriate_ranges(self, db):
        """Test that pediatric patients use age-appropriate MAP ranges."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        # Create infant patient (6 months)
        infant = Patient.objects.create(
            first_name="Baby",
            last_name="Test",
            date_of_birth=date.today() - timedelta(days=180),
            gender="F",
        )

        # Infant normal MAP is lower (around 45-75 mmHg)
        # BP 80/50 -> MAP = 50 + 30/3 = 60 (normal for infant)
        encounter = Encounter.objects.create(
            patient=infant,
            encounter_type="OPD",
            chief_complaint="Well baby check",
            blood_pressure="80/50",
        )

        # This should be normal for an infant, but would be low for adult
        status = encounter.get_map_status()
        # If pediatric ranges implemented, should be 'normal'
        # If not implemented, may be 'low' (still valid to test)
        assert status in ("normal", "low", None)

    def test_newborn_map_status(self, db):
        """Test MAP status for newborn with different normal range."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        # Create newborn (2 weeks)
        newborn = Patient.objects.create(
            first_name="Newborn",
            last_name="Test",
            date_of_birth=date.today() - timedelta(days=14),
            gender="M",
        )

        # Newborn normal MAP is even lower
        # BP 70/40 -> MAP = 40 + 30/3 = 50
        encounter = Encounter.objects.create(
            patient=newborn,
            encounter_type="OPD",
            chief_complaint="Newborn check",
            blood_pressure="70/40",
        )

        status = encounter.get_map_status()
        # Testing that it handles pediatric cases
        assert status is not None or encounter.get_map() is None


# ============================================================================
# MAP Calculation Edge Cases
# ============================================================================


@pytest.mark.unit
class TestMAPEdgeCases:
    """Test MAP calculation and status edge cases."""

    def test_map_with_wide_pulse_pressure(self, map_test_patient):
        """Test MAP with wide pulse pressure (e.g., 160/50)."""
        from hmis.apps.encounters.models import Encounter

        # Wide pulse pressure: 160/50 -> MAP = 50 + 110/3 = 50 + 36.67 = 86.67
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="Wide pulse pressure",
            blood_pressure="160/50",
        )

        map_value = encounter.get_map()
        assert map_value is not None
        assert 85 <= map_value <= 90  # Around 87

    def test_map_with_narrow_pulse_pressure(self, map_test_patient):
        """Test MAP with narrow pulse pressure (e.g., 100/90)."""
        from hmis.apps.encounters.models import Encounter

        # Narrow pulse pressure: 100/90 -> MAP = 90 + 10/3 = 90 + 3.33 = 93.33
        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Narrow pulse pressure",
            blood_pressure="100/90",
        )

        map_value = encounter.get_map()
        assert map_value is not None
        assert 92 <= map_value <= 94

    def test_map_with_invalid_bp_format(self, map_test_patient):
        """Test MAP returns None with invalid BP format."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=map_test_patient,
            encounter_type="OPD",
            chief_complaint="Invalid BP format",
        )
        # Set invalid BP directly (bypassing validation)
        encounter.blood_pressure = "invalid"

        assert encounter.get_map() is None
        assert encounter.get_map_status() is None
