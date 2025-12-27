"""
Tests for Encounter model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the Encounter model.
"""

from datetime import date, datetime

import pytest
from django.core.exceptions import ValidationError

pytestmark = pytest.mark.django_db


@pytest.mark.unit
class TestEncounterModel:
    """Test Encounter model functionality."""

    def test_encounter_creation_with_required_fields(self):
        """Test creating an encounter with all required fields."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter = Encounter.objects.create(
            patient=patient, encounter_type="OPD", chief_complaint="Headache"
        )

        assert encounter.id is not None
        assert encounter.patient == patient
        assert encounter.encounter_type == "OPD"
        assert encounter.chief_complaint == "Headache"
        assert encounter.encounter_date is not None

    def test_encounter_type_validation(self):
        """Test that encounter_type field only accepts valid choices."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Valid encounter types should work
        for encounter_type in ["OPD", "IPD", "EMERGENCY"]:
            encounter = Encounter(
                patient=patient, encounter_type=encounter_type, chief_complaint="Test"
            )
            encounter.full_clean()  # Should not raise

    def test_invalid_encounter_type_raises_error(self):
        """Test that invalid encounter type raises validation error."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter = Encounter(
            patient=patient, encounter_type="INVALID", chief_complaint="Test"
        )

        with pytest.raises(ValidationError):
            encounter.full_clean()

    def test_vitals_temperature_validation(self):
        """Test temperature vital sign validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Normal temperature should be valid
        encounter = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=37.5,
        )
        encounter.full_clean()  # Should not raise

        # Temperature too low should raise error
        encounter_low = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=20.0,  # Too low
        )
        with pytest.raises(ValidationError):
            encounter_low.full_clean()

        # Temperature too high should raise error
        encounter_high = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=50.0,  # Too high
        )
        with pytest.raises(ValidationError):
            encounter_high.full_clean()

    def test_vitals_pulse_validation(self):
        """Test pulse vital sign validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Normal pulse should be valid
        encounter = Encounter(
            patient=patient, encounter_type="OPD", chief_complaint="Checkup", pulse=80
        )
        encounter.full_clean()  # Should not raise

        # Pulse too low should raise error
        encounter_low = Encounter(
            patient=patient, encounter_type="OPD", chief_complaint="Checkup", pulse=20
        )
        with pytest.raises(ValidationError):
            encounter_low.full_clean()

        # Pulse too high should raise error
        encounter_high = Encounter(
            patient=patient, encounter_type="OPD", chief_complaint="Checkup", pulse=250
        )
        with pytest.raises(ValidationError):
            encounter_high.full_clean()

    def test_vitals_blood_pressure_validation(self):
        """Test blood pressure vital sign validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Valid blood pressure formats
        valid_bps = ["120/80", "110/70", "140/90"]
        for bp in valid_bps:
            encounter = Encounter(
                patient=patient,
                encounter_type="OPD",
                chief_complaint="Checkup",
                blood_pressure=bp,
            )
            encounter.full_clean()  # Should not raise

        # Invalid blood pressure formats
        invalid_bps = ["120", "120/", "/80", "abc/def", "120-80"]
        for bp in invalid_bps:
            encounter = Encounter(
                patient=patient,
                encounter_type="OPD",
                chief_complaint="Checkup",
                blood_pressure=bp,
            )
            with pytest.raises(ValidationError):
                encounter.full_clean()

    def test_has_critical_vitals(self):
        """Test the has_critical_vitals method."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Normal vitals - not critical
        encounter_normal = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=37.0,
            pulse=80,
        )
        assert encounter_normal.has_critical_vitals() is False

        # High temperature - critical
        encounter_fever = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            temperature=40.0,
            pulse=80,
        )
        assert encounter_fever.has_critical_vitals() is True

        # High pulse - critical
        encounter_tachycardia = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Palpitations",
            temperature=37.0,
            pulse=130,
        )
        assert encounter_tachycardia.has_critical_vitals() is True

    def test_get_alerts(self):
        """Test the get_alerts method."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # High temperature should trigger fever alert
        encounter_fever = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            temperature=40.0,
            pulse=80,
        )
        alerts = encounter_fever.get_alerts()
        assert "fever" in alerts or "high temperature" in alerts.lower()

        # High pulse should trigger tachycardia alert
        encounter_tachycardia = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Palpitations",
            temperature=37.0,
            pulse=130,
        )
        alerts = encounter_tachycardia.get_alerts()
        assert "tachycardia" in alerts.lower() or "high pulse" in alerts.lower()

    def test_encounter_timestamps(self):
        """Test that created_at and updated_at are set automatically."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter = Encounter.objects.create(
            patient=patient, encounter_type="OPD", chief_complaint="Headache"
        )

        assert encounter.created_at is not None
        assert encounter.updated_at is not None
        assert encounter.created_at <= encounter.updated_at

    def test_encounter_str_representation(self):
        """Test the string representation of encounter."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter = Encounter.objects.create(
            patient=patient, encounter_type="OPD", chief_complaint="Headache"
        )

        str_repr = str(encounter)
        assert patient.mrn in str_repr
        assert "OPD" in str_repr

    def test_optional_vitals_fields(self):
        """Test that vitals fields are optional."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        # Should be able to create encounter without vitals
        encounter = Encounter.objects.create(
            patient=patient, encounter_type="OPD", chief_complaint="Consultation"
        )

        assert encounter.temperature is None
        assert encounter.pulse is None
        assert encounter.blood_pressure is None or encounter.blood_pressure == ""
        assert encounter.respiratory_rate is None
        assert encounter.weight is None
        assert encounter.height is None

    def test_encounter_with_all_vitals(self):
        """Test creating encounter with all vital signs."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=37.5,
            pulse=80,
            blood_pressure="120/80",
            respiratory_rate=18,
            weight=70.5,
            height=175.0,
        )

        assert encounter.temperature == 37.5
        assert encounter.pulse == 80
        assert encounter.blood_pressure == "120/80"
        assert encounter.respiratory_rate == 18
        assert encounter.weight == 70.5
        assert encounter.height == 175.0

    def test_encounter_date_auto_set(self):
        """Test that encounter_date is set automatically to today."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter = Encounter.objects.create(
            patient=patient, encounter_type="OPD", chief_complaint="Checkup"
        )

        assert encounter.encounter_date == date.today()

    def test_multiple_encounters_for_patient(self):
        """Test that a patient can have multiple encounters."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

        encounter1 = Encounter.objects.create(
            patient=patient, encounter_type="OPD", chief_complaint="Headache"
        )

        encounter2 = Encounter.objects.create(
            patient=patient, encounter_type="IPD", chief_complaint="Fever"
        )

        assert encounter1.patient == encounter2.patient
        assert Encounter.objects.filter(patient=patient).count() == 2
