"""
Tests for immunization → scheduling integration.

Covers:
- Creating vaccination appointments from ImmunizationRecord
- Duplicate prevention
- Batch appointment creation for KEPI schedule
"""

from datetime import date, timedelta

import pytest  # type: ignore

from hmis.apps.immunizations.models import ImmunizationRecord, VaccineDefinition
from hmis.apps.immunizations.services.appointments import (
    create_appointments_for_schedule,
    create_vaccination_appointment,
)
from hmis.apps.scheduling.models import Appointment, Resource


@pytest.fixture
def bcg_vaccine(db):
    return VaccineDefinition.objects.create(
        code="BCG",
        name="Bacille Calmette-Guérin",
        disease_target="Tuberculosis",
        standard_age_days=0,
        route="ID",
        dose_number=1,
        target_population="INFANT",
        program="KEPI",
    )


@pytest.fixture
def child_patient(
    db,
    test_user,
    sample_county,
    sample_sub_county,
    sample_organization,
    sample_facility,
):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Baby",
        last_name="Wanjiku",
        date_of_birth=date.today() - timedelta(days=30),
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


@pytest.fixture
def imm_clinic_resource(db, sample_facility):
    return Resource.objects.create(
        name="Immunization Clinic",
        code="IMM-CLINIC",
        resource_type="PLACE",
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def scheduled_record(child_patient, bcg_vaccine, sample_facility):
    return ImmunizationRecord.objects.create(
        patient=child_patient,
        vaccine=bcg_vaccine,
        dose_number=1,
        scheduled_date=date.today() + timedelta(days=7),
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.mark.django_db
class TestVaccinationAppointments:
    """Tests for creating scheduling appointments from immunization records."""

    def test_create_appointment(self, scheduled_record, imm_clinic_resource, test_user):
        """Should create a VACCINATION appointment for a scheduled immunization."""
        apt = create_vaccination_appointment(
            scheduled_record,
            created_by=test_user,
        )
        assert apt is not None
        assert apt.appointment_type == "VACCINATION"
        assert apt.patient == scheduled_record.patient
        assert apt.resource == imm_clinic_resource
        assert apt.scheduled_start.date() == scheduled_record.scheduled_date
        assert "BCG" in apt.reason
        assert apt.priority == "ROUTINE"

    def test_no_duplicate_appointments(self, scheduled_record, imm_clinic_resource, test_user):
        """Should not create a second appointment for the same vaccine on the same date."""
        apt1 = create_vaccination_appointment(
            scheduled_record,
            created_by=test_user,
        )
        apt2 = create_vaccination_appointment(
            scheduled_record,
            created_by=test_user,
        )
        assert apt1 is not None
        assert apt2 is None
        assert (
            Appointment.objects.filter(
                patient=scheduled_record.patient,
                appointment_type="VACCINATION",
            ).count()
            == 1
        )

    def test_no_appointment_without_resource(self, scheduled_record, test_user):
        """Should return None if no IMM-CLINIC resource exists."""
        apt = create_vaccination_appointment(
            scheduled_record,
            created_by=test_user,
        )
        assert apt is None

    def test_explicit_resource(self, scheduled_record, test_user, sample_facility):
        """Should use explicitly provided resource."""
        resource = Resource.objects.create(
            name="MCH Room",
            code="MCH-ROOM",
            resource_type="PLACE",
            is_active=True,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        apt = create_vaccination_appointment(
            scheduled_record,
            resource=resource,
            created_by=test_user,
        )
        assert apt is not None
        assert apt.resource == resource

    def test_batch_create_for_schedule(
        self,
        child_patient,
        bcg_vaccine,
        imm_clinic_resource,
        test_user,
        sample_facility,
    ):
        """Should create appointments for a batch of immunization records."""
        records = []
        for i in range(3):
            r = ImmunizationRecord.objects.create(
                patient=child_patient,
                vaccine=VaccineDefinition.objects.create(
                    code=f"PENTA{i + 1}",
                    name=f"Pentavalent {i + 1}",
                    standard_age_days=42 + i * 28,
                    route="IM",
                    dose_number=i + 1,
                    target_population="INFANT",
                    program="KEPI",
                ),
                dose_number=i + 1,
                scheduled_date=date.today() + timedelta(days=42 + i * 28),
                status="SCHEDULED",
                facility=sample_facility,
                organization=sample_facility.organization,
            )
            records.append(r)

        appointments = create_appointments_for_schedule(
            records,
            created_by=test_user,
        )
        assert len(appointments) == 3
        assert all(a.appointment_type == "VACCINATION" for a in appointments)

    def test_resource_lookup_scoped_to_facility(
        self,
        scheduled_record,
        test_user,
        sample_facility,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        """Resource lookup should only find IMM-CLINIC in the record's facility.

        Prevents cross-tenant leakage where a resource from facility B
        could be attached to an appointment at facility A.
        """
        from hmis.apps.core.models import Facility

        # Create another facility with its own IMM-CLINIC resource
        other_facility = Facility.objects.create(
            name="Other Clinic",
            mfl_code="OTHER-001",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        Resource.objects.create(
            name="Immunization Clinic (Other)",
            code="IMM-CLINIC",
            resource_type="PLACE",
            is_active=True,
            facility=other_facility,
            organization=sample_organization,
        )

        # No IMM-CLINIC resource at sample_facility → should return None
        apt = create_vaccination_appointment(
            scheduled_record,
            created_by=test_user,
        )
        assert apt is None

        # Now create the resource at the correct facility
        correct_resource = Resource.objects.create(
            name="Immunization Clinic",
            code="IMM-CLINIC",
            resource_type="PLACE",
            is_active=True,
            facility=sample_facility,
            organization=sample_organization,
        )

        apt = create_vaccination_appointment(
            scheduled_record,
            created_by=test_user,
        )
        assert apt is not None
        assert apt.resource == correct_resource
        assert apt.resource.facility == sample_facility
