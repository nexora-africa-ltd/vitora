"""
Tests for Encounter model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the Encounter model.
"""

from datetime import date

import pytest  # type: ignore
from django.core.exceptions import ValidationError

pytestmark = pytest.mark.django_db


@pytest.mark.unit
class TestEncounterModel:
    """Test Encounter model functionality."""

    def test_encounter_creation_with_required_fields(self, sample_organization, sample_facility):
        """Test creating an encounter with all required fields."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            facility=sample_facility,
        )

        assert encounter.id is not None
        assert encounter.patient == patient
        assert encounter.encounter_type == "OPD"
        assert encounter.chief_complaint == "Headache"
        assert encounter.encounter_date is not None

    def test_encounter_type_validation(self, sample_organization):
        """Test that encounter_type field only accepts valid choices."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # Valid encounter types should work
        for encounter_type in ["OPD", "IPD", "EMERGENCY"]:
            encounter = Encounter(
                patient=patient, encounter_type=encounter_type, chief_complaint="Test"
            )
            encounter.full_clean()  # Should not raise

    def test_invalid_encounter_type_raises_error(self, sample_organization):
        """Test that invalid encounter type raises validation error."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter(patient=patient, encounter_type="INVALID", chief_complaint="Test")

        with pytest.raises(ValidationError):
            encounter.full_clean()

    def test_vitals_temperature_validation(self, sample_organization):
        """Test temperature vital sign validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
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

    def test_vitals_pulse_validation(self, sample_organization):
        """Test pulse vital sign validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
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

    def test_vitals_blood_pressure_validation(self, sample_organization):
        """Test blood pressure vital sign validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
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

    def test_has_critical_vitals(self, sample_organization, sample_facility):
        """Test the has_critical_vitals method."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # Normal vitals - not critical
        encounter_normal = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            temperature=37.0,
            pulse=80,
            facility=sample_facility,
        )
        assert encounter_normal.has_critical_vitals() is False

        # High temperature - critical
        encounter_fever = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            temperature=40.0,
            pulse=80,
            facility=sample_facility,
        )
        assert encounter_fever.has_critical_vitals() is True

        # High pulse - critical
        encounter_tachycardia = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Palpitations",
            temperature=37.0,
            pulse=130,
            facility=sample_facility,
        )
        assert encounter_tachycardia.has_critical_vitals() is True

    def test_get_alerts(self, sample_organization, sample_facility):
        """Test the get_alerts method."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # High temperature should trigger fever alert
        encounter_fever = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            temperature=40.0,
            pulse=80,
            facility=sample_facility,
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
            facility=sample_facility,
        )
        alerts = encounter_tachycardia.get_alerts()
        assert "tachycardia" in alerts.lower() or "high pulse" in alerts.lower()

    def test_encounter_timestamps(self, sample_organization, sample_facility):
        """Test that created_at and updated_at are set automatically."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            facility=sample_facility,
        )

        assert encounter.created_at is not None
        assert encounter.updated_at is not None
        assert encounter.created_at <= encounter.updated_at

    def test_encounter_str_representation(self, sample_organization, sample_facility):
        """Test the string representation of encounter."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            facility=sample_facility,
        )

        str_repr = str(encounter)
        assert patient.mrn in str_repr
        assert "OPD" in str_repr

    def test_optional_vitals_fields(self, sample_organization, sample_facility):
        """Test that vitals fields are optional."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # Should be able to create encounter without vitals
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Consultation",
            facility=sample_facility,
        )

        assert encounter.temperature is None
        assert encounter.pulse is None
        assert encounter.blood_pressure is None or encounter.blood_pressure == ""
        assert encounter.respiratory_rate is None
        assert encounter.weight is None
        assert encounter.height is None

    def test_encounter_with_all_vitals(self, sample_organization, sample_facility):
        """Test creating encounter with all vital signs."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
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
            facility=sample_facility,
        )

        assert encounter.temperature == 37.5
        assert encounter.pulse == 80
        assert encounter.blood_pressure == "120/80"
        assert encounter.respiratory_rate == 18
        assert encounter.weight == 70.5
        assert encounter.height == 175.0

    def test_encounter_date_auto_set(self, sample_organization, sample_facility):
        """Test that encounter_date is set automatically to today."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            facility=sample_facility,
        )

        assert encounter.encounter_date == date.today()

    def test_multiple_encounters_for_patient(self, sample_organization, sample_facility):
        """Test that a patient can have multiple encounters."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter1 = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            facility=sample_facility,
        )

        encounter2 = Encounter.objects.create(
            patient=patient,
            encounter_type="IPD",
            chief_complaint="Fever",
            facility=sample_facility,
        )

        assert encounter1.patient == encounter2.patient
        assert Encounter.objects.filter(patient=patient).count() == 2

    def test_vitals_respiratory_rate_validation(self, sample_organization):
        """Test respiratory rate validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # Valid respiratory rate
        encounter = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            respiratory_rate=18,
        )
        encounter.full_clean()  # Should not raise

        # Too low
        encounter_low = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            respiratory_rate=5,
        )
        with pytest.raises(ValidationError):
            encounter_low.full_clean()

        # Too high
        encounter_high = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            respiratory_rate=50,
        )
        with pytest.raises(ValidationError):
            encounter_high.full_clean()

    def test_vitals_weight_validation(self, sample_organization):
        """Test weight validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # Valid weight
        encounter = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            weight=70.5,
        )
        encounter.full_clean()  # Should not raise

        # Invalid - too high
        encounter_high = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            weight=350.0,
        )
        with pytest.raises(ValidationError):
            encounter_high.full_clean()

    def test_vitals_height_validation(self, sample_organization):
        """Test height validation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # Valid height
        encounter = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            height=175.0,
        )
        encounter.full_clean()  # Should not raise

        # Invalid - too high
        encounter_high = Encounter(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            height=300.0,
        )
        with pytest.raises(ValidationError):
            encounter_high.full_clean()

    def test_critical_respiratory_rate_alerts(self, sample_organization, sample_facility):
        """Test alerts for critical respiratory rate."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        # High respiratory rate
        encounter_high = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Breathing difficulty",
            respiratory_rate=30,
            facility=sample_facility,
        )
        assert encounter_high.has_critical_vitals() is True
        alerts = encounter_high.get_alerts()
        assert "respiratory" in alerts.lower()

        # Low respiratory rate
        encounter_low = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Sedation",
            respiratory_rate=10,
            facility=sample_facility,
        )
        assert encounter_low.has_critical_vitals() is True
        alerts = encounter_low.get_alerts()
        assert "respiratory" in alerts.lower()

    def test_low_temperature_alert(self, sample_organization, sample_facility):
        """Test alert for severe hypothermia (<32°C is critical)."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="EMERGENCY",
            chief_complaint="Exposure",
            temperature=31.5,  # <32°C is severe hypothermia (critical),
            facility=sample_facility,
        )
        assert encounter.has_critical_vitals() is True
        alerts = encounter.get_alerts()
        assert "hypothermia" in alerts.lower() or "low temperature" in alerts.lower()

    def test_low_pulse_alert(self, sample_organization, sample_facility):
        """Test alert for bradycardia."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Weakness",
            pulse=45,
            facility=sample_facility,
        )
        assert encounter.has_critical_vitals() is True
        alerts = encounter.get_alerts()
        assert "bradycardia" in alerts.lower() or "low pulse" in alerts.lower()


@pytest.mark.unit
class TestBeginConsultation:
    """Test Encounter.begin_consultation() method."""

    def test_begin_consultation_sets_status_to_in_progress(
        self, sample_organization, sample_facility
    ):
        """Should set consultation_status to IN_PROGRESS."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
            triage_status="COMPLETED",
            consultation_status="WAITING",
            facility=sample_facility,
        )

        result = encounter.begin_consultation()

        assert result == encounter  # Returns self for chaining
        assert encounter.consultation_status == "IN_PROGRESS"

    def test_begin_consultation_sets_started_at_timestamp(
        self, sample_organization, sample_facility
    ):
        """Should record consultation_started_at timestamp."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Jane",
            last_name="Doe",
            date_of_birth=date(1985, 5, 15),
            gender="F",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Check-up",
            triage_status="NOT_APPLICABLE",
            consultation_status="CALLED",
            facility=sample_facility,
        )

        assert encounter.consultation_started_at is None
        encounter.begin_consultation()

        assert encounter.consultation_started_at is not None

    def test_begin_consultation_raises_error_when_triage_pending(
        self, sample_organization, sample_facility
    ):
        """Should raise ValueError if triage is still pending."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(2000, 1, 1),
            gender="M",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            triage_status="PENDING",
            consultation_status="WAITING",
            facility=sample_facility,
        )

        with pytest.raises(ValueError) as exc_info:
            encounter.begin_consultation()

        assert "triage" in str(exc_info.value).lower()

    def test_begin_consultation_raises_error_when_already_in_progress(
        self, sample_organization, sample_facility
    ):
        """Should raise ValueError if consultation is already in progress."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1995, 6, 15),
            gender="F",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Follow-up",
            triage_status="COMPLETED",
            consultation_status="IN_PROGRESS",
            facility=sample_facility,
        )

        with pytest.raises(ValueError) as exc_info:
            encounter.begin_consultation()

        assert "already in progress" in str(exc_info.value).lower()

    def test_begin_consultation_raises_error_when_completed(
        self, sample_organization, sample_facility
    ):
        """Should raise ValueError if consultation is already completed."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1988, 12, 1),
            gender="M",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Review",
            triage_status="COMPLETED",
            consultation_status="COMPLETED",
            facility=sample_facility,
        )

        with pytest.raises(ValueError) as exc_info:
            encounter.begin_consultation()

        assert "already completed" in str(exc_info.value).lower()

    def test_begin_consultation_works_with_bypassed_triage(
        self, sample_organization, sample_facility
    ):
        """Should work when triage is BYPASSED."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1975, 3, 20),
            gender="F",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Routine check",
            triage_status="BYPASSED",
            consultation_status="WAITING",
            facility=sample_facility,
        )

        encounter.begin_consultation()

        assert encounter.consultation_status == "IN_PROGRESS"

    def test_begin_consultation_persists_changes(self, sample_organization, sample_facility):
        """Should persist changes to database."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 7, 10),
            gender="M",
            organization=sample_organization,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            triage_status="COMPLETED",
            consultation_status="WAITING",
            facility=sample_facility,
        )

        encounter.begin_consultation()

        # Refresh from database to verify persistence
        encounter.refresh_from_db()
        assert encounter.consultation_status == "IN_PROGRESS"
        assert encounter.consultation_started_at is not None
