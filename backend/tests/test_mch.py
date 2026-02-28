"""
Tests for the MCH module.

TDD: write failing tests first for key MCH workflows.
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.fixture
def anc_clinic(db):
    """Create a sample ANC clinic."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Clinic",
        clinic_type="ANC",
        code="ANC-001",
        status="ACTIVE",
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user):
    """Create a sample ANC clinic enrollment."""
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=140),
    )


@pytest.mark.django_db
class TestMCHRegistration:
    """Tests for MCH registration model."""

    def test_registration_auto_generates_mch_number(self, sample_patient, anc_enrollment):
        """Should auto-generate MCH number on creation."""
        from hmis.apps.mch.models import MCHRegistration

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            anc_enrollment=anc_enrollment,
            registration_date=date.today(),
        )

        assert registration.mch_number.startswith("MCH-")
        assert len(registration.mch_number.split("-")) == 3

    def test_status_transition_updates_completed_at(self, sample_patient, anc_enrollment):
        """Should set completed_at when transitioning to COMPLETED."""
        from hmis.apps.mch.models import MCHRegistration

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            anc_enrollment=anc_enrollment,
            registration_date=date.today(),
        )

        registration.transition_status("DELIVERED")
        registration.transition_status("POSTNATAL")
        registration.transition_status("COMPLETED")
        registration.refresh_from_db()
        assert registration.status == "COMPLETED"
        assert registration.completed_at is not None


@pytest.mark.django_db
class TestDelivery:
    """Tests for delivery model."""

    def test_delivery_creates_baby_patient(self, sample_patient, anc_enrollment, test_user):
        """Should auto-create and link baby patient on completed delivery."""
        from hmis.apps.mch.models import Delivery, MCHRegistration

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            anc_enrollment=anc_enrollment,
            registration_date=date.today(),
        )

        delivery = Delivery.objects.create(
            registration=registration,
            delivery_date=date.today(),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            baby_gender="F",
            birth_weight="3.10",
            status="COMPLETED",
            delivered_by=test_user,
        )

        delivery.refresh_from_db()
        assert delivery.baby_patient is not None
        assert delivery.baby_patient.first_name.startswith("Baby of")


@pytest.mark.django_db
class TestGrowthMeasurement:
    """Tests for growth measurement model."""

    def test_growth_measurement_calculates_age_in_days(self, sample_county, sample_sub_county):
        """Should auto-calculate age in days from patient DOB."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Amina",
            last_name="Wanjiku",
            date_of_birth=date(2025, 1, 1),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date(2025, 2, 1),
            weight="4.2",
            height="54.0",
            muac="12.0",
        )

        assert measurement.age_in_days == 31

    def test_muac_classification_sam(self, sample_county, sample_sub_county):
        """Should classify MUAC < 11.5 cm as SAM for 6-59 months."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Kato",
            last_name="Otieno",
            date_of_birth=date(2024, 1, 1),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date(2025, 1, 1),
            muac="11.0",
        )

        assert measurement.muac_classification == "SAM"


@pytest.mark.django_db
class TestImmunizationSchedule:
    """Tests for immunization schedule generation."""

    def test_generate_schedule_creates_records(self, sample_county, sample_sub_county):
        """Should create scheduled immunization records based on KEPI data."""
        from hmis.apps.mch.models import ImmunizationRecord, Vaccine
        from hmis.apps.mch.services.immunization import generate_immunization_schedule
        from hmis.apps.patients.models import Patient

        child = Patient.objects.create(
            first_name="Child",
            last_name="Test",
            date_of_birth=date(2025, 1, 1),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        Vaccine.objects.create(
            code="BCG",
            name="BCG",
            standard_age_days=0,
        )
        Vaccine.objects.create(
            code="PENTA1",
            name="Penta 1",
            standard_age_days=42,
        )

        records = generate_immunization_schedule(child)

        assert ImmunizationRecord.objects.filter(patient=child).count() == 2
        assert records[0].scheduled_date == child.date_of_birth
        assert records[1].scheduled_date == child.date_of_birth + timedelta(days=42)


@pytest.mark.django_db
class TestHEIFollowUp:
    """Tests for HIV-exposed infant follow-up."""

    def test_create_hei_followup(self, sample_county, sample_sub_county, sample_patient, anc_enrollment):
        """Should allow creating HEI follow-up for an infant."""
        from hmis.apps.mch.models import HEIFollowUp
        from hmis.apps.mch.models import MCHRegistration
        from hmis.apps.patients.models import Patient

        infant = Patient.objects.create(
            first_name="Baby",
            last_name="Test",
            date_of_birth=date(2025, 6, 1),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            anc_enrollment=anc_enrollment,
            registration_date=date.today(),
        )

        followup = HEIFollowUp.objects.create(
            infant=infant,
            mch_registration=registration,
            enrollment_date=date.today(),
            status="ACTIVE",
        )

        assert followup.infant == infant
        assert followup.status == "ACTIVE"
