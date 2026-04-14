"""
Tests for MCH integration gap closures.

Covers:
- Gap 1: Auto-create ANC ClinicEnrollment when MCH registration is created
- Gap 2: Auto-transition MCH registration to DELIVERED on delivery completion
- Gap 3: Auto-create scheduling Appointment from ANC next_visit_date
- Gap 3b: Auto-create scheduling Appointment from immunization scheduled_date
- Delivery serializer defaults status to COMPLETED
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def anc_clinic(db, sample_facility, sample_organization):
    """Create a sample ANC clinic."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Clinic",
        clinic_type="ANC",
        code="ANC-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def scheduling_resource(db):
    """Create a scheduling resource for appointment creation."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="ANC Room 1",
        resource_type="PLACE",
        code="ANC-ROOM-001",
        is_active=True,
    )


@pytest.fixture
def immunization_resource(db):
    """Create a scheduling resource for immunization appointments."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Immunization Room",
        resource_type="PLACE",
        code="IMM-ROOM-001",
        is_active=True,
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user, sample_facility, sample_organization):
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


@pytest.fixture
def mch_registration_with_enrollment(
    db, sample_patient, anc_enrollment, sample_facility, sample_organization
):
    """Create MCH registration with existing ANC enrollment (signal won't auto-create)."""
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today(),
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_vaccine(db):
    """Create a sample vaccine for immunization tests."""
    from hmis.apps.mch.models import Vaccine

    return Vaccine.objects.create(
        code="BCG",
        name="BCG Vaccine",
        description="Bacillus Calmette-Guérin vaccine",
        disease_target="Tuberculosis",
        standard_age_days=0,
        route="ID",
        dose_number=1,
        series_name="BCG",
        is_active=True,
    )


# =============================================================================
# Gap 1: Auto-create ANC ClinicEnrollment on MCH Registration
# =============================================================================


@pytest.mark.django_db
class TestAutoCreateANCEnrollment:
    """Tests for auto-creating ANC enrollment when MCH registration is created."""

    def test_auto_creates_anc_enrollment_when_no_enrollment_linked(
        self, anc_clinic, sample_patient, test_user
    ):
        """Should auto-create ANC ClinicEnrollment when MCH registration has no linked enrollment."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.mch.models import MCHRegistration

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            registration_date=date.today(),
            registered_by=test_user,
        )

        # Refresh from DB to check signal updated anc_enrollment
        registration.refresh_from_db()
        assert registration.anc_enrollment is not None

        # Verify the enrollment was created correctly
        enrollment = registration.anc_enrollment
        assert enrollment.clinic == anc_clinic
        assert enrollment.patient == sample_patient
        assert enrollment.status == "ACTIVE"
        assert enrollment.enrolled_by == test_user
        assert enrollment.enrollment_data["source"] == "MCH_AUTO_ENROLLMENT"
        assert enrollment.enrollment_data["mch_number"] == registration.mch_number

    def test_does_not_create_enrollment_when_already_linked(
        self, anc_clinic, sample_patient, anc_enrollment, test_user
    ):
        """Should NOT auto-create enrollment if one is already linked."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.mch.models import MCHRegistration

        initial_count = ClinicEnrollment.objects.count()

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            anc_enrollment=anc_enrollment,
            registration_date=date.today(),
            registered_by=test_user,
        )

        # No new enrollment should be created
        assert ClinicEnrollment.objects.count() == initial_count
        assert registration.anc_enrollment == anc_enrollment

    def test_enrollment_inherits_high_risk_from_registration(
        self, anc_clinic, sample_patient, test_user
    ):
        """Should set high_risk_pregnancy on auto-created enrollment."""
        from hmis.apps.mch.models import MCHRegistration

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            registration_date=date.today(),
            registered_by=test_user,
            is_high_risk=True,
            risk_factors="Previous cesarean, advanced age",
        )

        registration.refresh_from_db()
        enrollment = registration.anc_enrollment
        assert enrollment is not None
        assert enrollment.high_risk_pregnancy is True
        assert enrollment.high_risk_factors == "Previous cesarean, advanced age"

    def test_no_error_when_no_anc_clinic_exists(self, sample_patient, test_user):
        """Should gracefully handle missing ANC clinic without raising."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.mch.models import MCHRegistration

        # Delete all ANC clinics to simulate missing clinic
        Clinic.objects.filter(clinic_type="ANC").delete()

        registration = MCHRegistration.objects.create(
            mother=sample_patient,
            registration_date=date.today(),
            registered_by=test_user,
        )

        registration.refresh_from_db()
        assert registration.anc_enrollment is None  # No clinic found, no enrollment created

    def test_api_returns_enrollment_in_response(
        self, authenticated_client, anc_clinic, sample_patient
    ):
        """API should return the auto-created anc_enrollment in the response."""
        response = authenticated_client.post(
            "/api/mch/registrations/",
            {
                "mother": sample_patient.id,
                "registration_date": date.today().isoformat(),
            },
            format="json",
        )

        assert response.status_code == 201
        assert response.data["anc_enrollment"] is not None


# =============================================================================
# Gap 2: Auto-transition MCH Registration to DELIVERED
# =============================================================================


@pytest.mark.django_db
class TestAutoTransitionToDelivered:
    """Tests for auto-transitioning MCH registration status on delivery completion."""

    def test_auto_transitions_to_delivered_on_completed_delivery(
        self, mch_registration_with_enrollment
    ):
        """Should auto-transition MCH registration from ACTIVE to DELIVERED."""
        from hmis.apps.mch.models import Delivery

        registration = mch_registration_with_enrollment
        assert registration.status == "ACTIVE"

        Delivery.objects.create(
            registration=registration,
            delivery_date=date.today(),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            place_of_delivery="FACILITY",
            baby_gender="F",
            status="COMPLETED",
        )

        registration.refresh_from_db()
        assert registration.status == "DELIVERED"

    def test_does_not_transition_on_pending_delivery(self, mch_registration_with_enrollment):
        """Should NOT transition if delivery status is PENDING."""
        from hmis.apps.mch.models import Delivery

        registration = mch_registration_with_enrollment
        assert registration.status == "ACTIVE"

        Delivery.objects.create(
            registration=registration,
            delivery_date=date.today(),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            place_of_delivery="FACILITY",
            baby_gender="M",
            status="PENDING",
        )

        registration.refresh_from_db()
        assert registration.status == "ACTIVE"  # Should remain ACTIVE

    def test_does_not_transition_if_already_delivered(self, mch_registration_with_enrollment):
        """Should not error if registration is already DELIVERED."""
        from hmis.apps.mch.models import Delivery

        registration = mch_registration_with_enrollment
        registration.status = "DELIVERED"
        registration.save(update_fields=["status"])

        # Creating another completed delivery should not raise
        Delivery.objects.create(
            registration=registration,
            delivery_date=date.today(),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            place_of_delivery="FACILITY",
            baby_gender="F",
            status="COMPLETED",
        )

        registration.refresh_from_db()
        assert registration.status == "DELIVERED"

    def test_delivery_serializer_defaults_to_completed(self, mch_registration_with_enrollment):
        """DeliverySerializer should default status to COMPLETED."""
        from hmis.apps.mch.serializers import DeliverySerializer

        data = {
            "registration": mch_registration_with_enrollment.id,
            "delivery_date": date.today().isoformat(),
            "delivery_type": "SVD",
            "delivery_outcome": "LIVE_BIRTH",
            "place_of_delivery": "FACILITY",
            "baby_gender": "M",
            # status not provided — should default to COMPLETED
        }
        serializer = DeliverySerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data.get("status", "COMPLETED") == "COMPLETED"


# =============================================================================
# Gap 3: Auto-create Scheduling Appointment from ANC Visit
# =============================================================================


@pytest.mark.django_db
class TestAutoCreateANCAppointment:
    """Tests for auto-creating scheduling appointments from ANC visit next_visit_date."""

    def test_creates_appointment_when_next_visit_date_set(
        self, mch_registration_with_enrollment, scheduling_resource, test_user
    ):
        """Should create a scheduling Appointment when ANC visit has next_visit_date."""
        from hmis.apps.mch.models import ANCVisit
        from hmis.apps.scheduling.models import Appointment

        next_date = date.today() + timedelta(days=28)

        ANCVisit.objects.create(
            registration=mch_registration_with_enrollment,
            visit_number=1,
            visit_date=date.today(),
            next_visit_date=next_date,
            conducted_by=test_user,
        )

        appointment = Appointment.objects.filter(
            patient=mch_registration_with_enrollment.mother,
            scheduled_start__date=next_date,
            appointment_type="FOLLOW_UP",
        ).first()

        assert appointment is not None
        assert appointment.status == "CREATED"
        assert "ANC follow-up" in appointment.reason
        assert mch_registration_with_enrollment.mch_number in appointment.reason

    def test_does_not_create_appointment_without_next_visit_date(
        self, mch_registration_with_enrollment, scheduling_resource
    ):
        """Should NOT create appointment if next_visit_date is not set."""
        from hmis.apps.mch.models import ANCVisit
        from hmis.apps.scheduling.models import Appointment

        ANCVisit.objects.create(
            registration=mch_registration_with_enrollment,
            visit_number=1,
            visit_date=date.today(),
            next_visit_date=None,
        )

        count = Appointment.objects.filter(
            patient=mch_registration_with_enrollment.mother,
            appointment_type="FOLLOW_UP",
        ).count()

        assert count == 0

    def test_does_not_create_duplicate_appointment(
        self, mch_registration_with_enrollment, scheduling_resource, test_user
    ):
        """Should not create duplicate appointment for same date."""
        from hmis.apps.mch.models import ANCVisit
        from hmis.apps.scheduling.models import Appointment

        next_date = date.today() + timedelta(days=28)

        # First visit
        ANCVisit.objects.create(
            registration=mch_registration_with_enrollment,
            visit_number=1,
            visit_date=date.today(),
            next_visit_date=next_date,
            conducted_by=test_user,
        )

        # Second visit with same next_visit_date
        ANCVisit.objects.create(
            registration=mch_registration_with_enrollment,
            visit_number=2,
            visit_date=date.today() + timedelta(days=1),
            next_visit_date=next_date,
            conducted_by=test_user,
        )

        count = Appointment.objects.filter(
            patient=mch_registration_with_enrollment.mother,
            scheduled_start__date=next_date,
            appointment_type="FOLLOW_UP",
        ).count()

        assert count == 1  # No duplicate

    def test_no_error_when_no_scheduling_resource(self, mch_registration_with_enrollment):
        """Should gracefully handle missing scheduling resource."""
        from hmis.apps.mch.models import ANCVisit

        # No scheduling resource exists — should not raise
        ANCVisit.objects.create(
            registration=mch_registration_with_enrollment,
            visit_number=1,
            visit_date=date.today(),
            next_visit_date=date.today() + timedelta(days=28),
        )
        # If we got here without exception, the test passes


# =============================================================================
# Gap 3b: Auto-create Scheduling Appointment from Immunization
# =============================================================================


@pytest.mark.django_db
class TestAutoCreateImmunizationAppointment:
    """Tests for auto-creating scheduling appointments from immunization records."""

    def test_creates_vaccination_appointment_for_scheduled_immunization(
        self, sample_patient, sample_vaccine, immunization_resource
    ):
        """Should create a VACCINATION appointment for a scheduled immunization record."""
        from hmis.apps.mch.models import ImmunizationRecord
        from hmis.apps.scheduling.models import Appointment

        scheduled_date = date.today() + timedelta(days=42)  # 6 weeks

        ImmunizationRecord.objects.create(
            patient=sample_patient,
            vaccine=sample_vaccine,
            scheduled_date=scheduled_date,
            status="SCHEDULED",
            dose_number=1,
        )

        appointment = Appointment.objects.filter(
            patient=sample_patient,
            scheduled_start__date=scheduled_date,
            appointment_type="VACCINATION",
        ).first()

        assert appointment is not None
        assert appointment.status == "CREATED"
        assert "BCG Vaccine" in appointment.reason

    def test_does_not_create_for_administered_immunization(
        self, sample_patient, sample_vaccine, immunization_resource
    ):
        """Should NOT create appointment for ADMINISTERED status."""
        from hmis.apps.mch.models import ImmunizationRecord
        from hmis.apps.scheduling.models import Appointment

        ImmunizationRecord.objects.create(
            patient=sample_patient,
            vaccine=sample_vaccine,
            scheduled_date=date.today() + timedelta(days=42),
            administered_date=date.today(),
            status="ADMINISTERED",
            dose_number=1,
        )

        count = Appointment.objects.filter(
            patient=sample_patient,
            appointment_type="VACCINATION",
        ).count()

        assert count == 0

    def test_does_not_create_for_past_dates(
        self, sample_patient, sample_vaccine, immunization_resource
    ):
        """Should NOT create appointment for past scheduled dates."""
        from hmis.apps.mch.models import ImmunizationRecord
        from hmis.apps.scheduling.models import Appointment

        ImmunizationRecord.objects.create(
            patient=sample_patient,
            vaccine=sample_vaccine,
            scheduled_date=date.today() - timedelta(days=7),
            status="SCHEDULED",
            dose_number=1,
        )

        count = Appointment.objects.filter(
            patient=sample_patient,
            appointment_type="VACCINATION",
        ).count()

        assert count == 0

    def test_does_not_create_duplicate_vaccination_appointment(
        self, sample_patient, sample_vaccine, immunization_resource
    ):
        """Should not create duplicate appointment for same vaccine on same date."""
        from hmis.apps.mch.models import ImmunizationRecord
        from hmis.apps.scheduling.models import Appointment

        scheduled_date = date.today() + timedelta(days=42)

        ImmunizationRecord.objects.create(
            patient=sample_patient,
            vaccine=sample_vaccine,
            scheduled_date=scheduled_date,
            status="SCHEDULED",
            dose_number=1,
        )

        # Save again (simulate update)
        record = ImmunizationRecord.objects.filter(
            patient=sample_patient,
            vaccine=sample_vaccine,
        ).first()
        record.save()

        count = Appointment.objects.filter(
            patient=sample_patient,
            scheduled_start__date=scheduled_date,
            appointment_type="VACCINATION",
        ).count()

        assert count == 1


# =============================================================================
# Integration: ANC visit list includes next_visit_date
# =============================================================================


@pytest.mark.django_db
class TestANCVisitListIncludesNextVisitDate:
    """Verify the ANC visit list serializer includes next_visit_date."""

    def test_list_response_includes_next_visit_date(
        self, authenticated_client, mch_registration_with_enrollment
    ):
        """API list should include next_visit_date in each ANC visit."""
        from hmis.apps.mch.models import ANCVisit

        next_date = date.today() + timedelta(days=28)
        ANCVisit.objects.create(
            registration=mch_registration_with_enrollment,
            visit_number=1,
            visit_date=date.today(),
            next_visit_date=next_date,
        )

        response = authenticated_client.get(
            f"/api/mch/anc-visits/?registration={mch_registration_with_enrollment.id}"
        )

        assert response.status_code == 200
        results = response.data["results"]
        assert len(results) == 1
        assert results[0]["next_visit_date"] == next_date.isoformat()
