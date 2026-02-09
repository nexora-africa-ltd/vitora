"""
Tests for SpO2 vital sign in Encounter model - Sprint 0.7

Following TDD principles: Write tests FIRST, then implement.
SpO2 (oxygen saturation) is a critical vital sign.
"""

import pytest  # type: ignore
from django.core.exceptions import ValidationError


@pytest.mark.django_db
class TestSpO2VitalSign:
    """Test suite for SpO2 vital sign in Encounter model."""

    def test_create_encounter_with_spo2(self, sample_patient):
        """Test creating an encounter with SpO2 value."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            spo2=98,
        )

        assert encounter.spo2 == 98

    def test_spo2_accepts_valid_range(self, sample_patient):
        """Test SpO2 accepts values from 0 to 100."""
        from hmis.apps.encounters.models import Encounter

        # Test normal range
        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            spo2=95,
        )
        encounter.full_clean()  # Should not raise

        # Test boundary values
        encounter.spo2 = 0
        encounter.full_clean()  # 0% is valid (though clinically unlikely)

        encounter.spo2 = 100
        encounter.full_clean()  # 100% is valid

    def test_spo2_rejects_negative_values(self, sample_patient):
        """Test SpO2 rejects negative values."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            spo2=-1,
        )

        with pytest.raises(ValidationError) as exc_info:
            encounter.full_clean()

        assert "spo2" in str(exc_info.value)

    def test_spo2_rejects_values_over_100(self, sample_patient):
        """Test SpO2 rejects values over 100."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            spo2=101,
        )

        with pytest.raises(ValidationError) as exc_info:
            encounter.full_clean()

        assert "spo2" in str(exc_info.value)

    def test_spo2_is_optional(self, sample_patient):
        """Test SpO2 is optional (can be null)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            spo2=None,
        )

        assert encounter.spo2 is None

    def test_spo2_decimal_values(self, sample_patient):
        """Test SpO2 accepts decimal values."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            spo2=97.5,
        )

        assert float(encounter.spo2) == 97.5


@pytest.mark.django_db
class TestSpO2CriticalAlerts:
    """Test suite for SpO2 critical alerts."""

    def test_spo2_below_90_is_critical(self, sample_patient):
        """Test that SpO2 below 90% triggers critical alert (urgent evaluation needed)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Breathing difficulty",
            spo2=88,  # <90% is critical for all ages
        )

        assert encounter.has_critical_vitals() is True

    def test_spo2_90_to_94_is_warning_not_critical(self, sample_patient):
        """Test that SpO2 90-94% is warning (mildly low), not critical."""
        from hmis.apps.encounters.models import Encounter

        # 92% should be warning (mildly low), not critical
        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Breathing difficulty",
            spo2=92,
        )

        # Should NOT be critical (critical is <90%)
        assert encounter.has_critical_vitals() is False
        # But should have warning status
        assert encounter.get_vital_status("spo2") == "warning"

    def test_spo2_95_and_above_is_not_critical(self, sample_patient):
        """Test that SpO2 >= 95% is not critical."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            spo2=95,
        )

        assert encounter.has_critical_vitals() is False

        encounter.spo2 = 98
        assert encounter.has_critical_vitals() is False

    def test_spo2_alert_message(self, sample_patient):
        """Test SpO2 alert message content for critical level."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Respiratory distress",
            spo2=88,  # Critical level (<90%)
        )

        alerts = encounter.get_alerts()
        # Should show critical hypoxemia message
        assert "hypoxemia" in alerts.lower() or "spo2" in alerts.lower()

    def test_spo2_severe_hypoxemia_alert(self, sample_patient):
        """Test severe hypoxemia alert for very low SpO2."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Unable to breathe",
            spo2=85,
        )

        assert encounter.has_critical_vitals() is True
        alerts = encounter.get_alerts()
        assert "oxygen" in alerts.lower() or "spo2" in alerts.lower()


@pytest.mark.django_db
class TestSpO2API:
    """Test suite for SpO2 in Encounter API."""

    def test_create_encounter_with_spo2_via_api(self, authenticated_client, sample_patient):
        """Test creating an encounter with SpO2 via API."""
        data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Routine checkup",
            "spo2": 97,
        }

        response = authenticated_client.post("/api/encounters/", data, format="json")

        assert response.status_code == 201
        assert float(response.data["spo2"]) == 97.0

    def test_spo2_included_in_encounter_response(self, authenticated_client, sample_patient):
        """Test that SpO2 is included in encounter response."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            spo2=96,
        )

        response = authenticated_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == 200
        assert "spo2" in response.data

    def test_spo2_validation_via_api(self, authenticated_client, sample_patient):
        """Test SpO2 validation when creating encounter via API."""
        data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Test",
            "spo2": 150,  # Invalid: over 100
        }

        response = authenticated_client.post("/api/encounters/", data, format="json")

        assert response.status_code == 400
        assert "spo2" in response.data
