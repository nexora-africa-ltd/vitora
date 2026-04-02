from __future__ import annotations

from datetime import date, time, timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone


@pytest.fixture
def anc_clinic(db, sample_facility, sample_organization):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Backfill Clinic",
        clinic_type="ANC",
        code="ANC-BF-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def pnc_clinic(db, sample_facility, sample_organization):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="PNC Backfill Clinic",
        clinic_type="PNC",
        code="PNC-BF-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user, sample_facility, sample_organization):
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today() - timedelta(days=200),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=270),
    )


@pytest.fixture
def mch_registration(db, sample_patient, anc_enrollment, test_user, sample_facility, sample_organization):
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today() - timedelta(days=200),
        registered_by=test_user,
        status="DELIVERED",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def maternity_resource(db):
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="PNC Backfill Room",
        resource_type="PLACE",
        code="PNC-BF-ROOM",
        is_active=True,
    )


@pytest.fixture
def maternity_admission(db, sample_patient, sample_encounter, sample_inpatient_ward, sample_bed, test_user, mch_registration, sample_facility):
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.inpatient.models import Admission

    sample_inpatient_ward.ward_type = "MATERNITY"
    sample_inpatient_ward.gender_restriction = "FEMALE_ONLY"
    sample_inpatient_ward.save(update_fields=["ward_type", "gender_restriction"])

    ipd_encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="IPD",
        chief_complaint="Postpartum observation",
        facility=sample_facility,
    )

    return Admission.objects.create(
        patient=sample_patient,
        opd_encounter=sample_encounter,
        ipd_encounter=ipd_encounter,
        mch_registration=mch_registration,
        admission_date=timezone.now() - timedelta(days=2),
        admitting_diagnosis="O80",
        admitting_diagnosis_text="Normal delivery admission",
        admitting_officer=test_user,
        attending_doctor=test_user,
        ward=sample_inpatient_ward,
        bed=sample_bed,
        payer_type="SHA",
    )


@pytest.fixture
def legacy_maternity_discharge(db, maternity_admission, test_user):
    from hmis.apps.inpatient.models import Discharge

    return Discharge.objects.create(
        admission=maternity_admission,
        discharge_type="NORMAL",
        discharge_date=timezone.now() - timedelta(days=1),
        discharged_by=test_user,
        admission_diagnosis="O80",
        final_diagnosis="O80",
        final_diagnosis_text="Stable postpartum mother",
        treatment_summary="Legacy postpartum discharge without structured continuity.",
        follow_up_date=(timezone.now() + timedelta(days=6)).date(),
        follow_up_instructions="Return for early postnatal review.",
        patient_instructions="Seek urgent care if heavy bleeding occurs.",
        pharmacy_cleared=True,
        billing_cleared=True,
        lab_results_acknowledged=True,
    )


@pytest.mark.django_db
class TestMaternityPostpartumContinuityCommand:
    def test_dry_run_does_not_modify_legacy_maternity_discharge(
        self,
        legacy_maternity_discharge,
        mch_registration,
        maternity_resource,
    ):
        out = StringIO()

        call_command("backfill_maternity_postpartum_continuity", dry_run=True, stdout=out)

        legacy_maternity_discharge.refresh_from_db()
        mch_registration.refresh_from_db()

        assert legacy_maternity_discharge.maternity_continuity_action == "NONE"
        assert legacy_maternity_discharge.maternity_continuity_status == "NOT_APPLICABLE"
        assert legacy_maternity_discharge.pnc_appointment_id is None
        assert legacy_maternity_discharge.pnc_clinic_visit_id is None
        assert mch_registration.status == "DELIVERED"
        assert "Dry run" in out.getvalue()

    def test_backfill_schedules_early_pnc_and_propagates_to_kardex_and_pre_discharge_round(
        self,
        legacy_maternity_discharge,
        maternity_admission,
        mch_registration,
        maternity_resource,
        test_user,
    ):
        from hmis.apps.inpatient.models import WardRound
        from hmis.apps.scheduling.models import Appointment

        ward_round = WardRound.objects.create(
            admission=maternity_admission,
            round_date=date.today() - timedelta(days=1),
            round_time=time(10, 30),
            conducted_by=test_user,
            review_type="PRE_DISCHARGE",
            subjective="Ready for home care review",
            objective="Vitals stable, breastfeeding established",
            assessment="Stable postpartum recovery",
            plan="Complete discharge planning",
            condition_status="IMPROVING",
        )

        out = StringIO()
        call_command("backfill_maternity_postpartum_continuity", stdout=out)

        legacy_maternity_discharge.refresh_from_db()
        maternity_admission.kardex.refresh_from_db()
        ward_round.refresh_from_db()
        mch_registration.refresh_from_db()

        appointment = Appointment.objects.get(pk=legacy_maternity_discharge.pnc_appointment_id)

        assert legacy_maternity_discharge.maternity_continuity_action == "SCHEDULE_EARLY_PNC"
        assert legacy_maternity_discharge.maternity_continuity_status == "SCHEDULED"
        assert appointment.scheduled_start.date() == legacy_maternity_discharge.follow_up_date
        assert maternity_admission.kardex.maternity_continuity_action == "SCHEDULE_EARLY_PNC"
        assert "backfilled from discharge" in maternity_admission.kardex.maternity_continuity_notes.lower()
        assert ward_round.maternity_continuity_action == "SCHEDULE_EARLY_PNC"
        assert mch_registration.status == "POSTNATAL"
        assert "Discharges updated: 1" in out.getvalue()

    def test_backfill_links_existing_pnc_visit_as_queue_route(
        self,
        legacy_maternity_discharge,
        maternity_admission,
        mch_registration,
        pnc_clinic,
        test_user,
    ):
        from hmis.apps.clinics.models import ClinicVisit
        from hmis.apps.mch.models import PNCVisit

        session = pnc_clinic.get_current_session()
        clinic_visit = ClinicVisit.objects.create(
            session=session,
            patient=mch_registration.mother,
            status="COMPLETED",
            visit_type="FOLLOW_UP",
            source="DIRECT",
            source_module="MCH_PNC",
            source_record_id=mch_registration.id,
            registered_by=test_user,
            chief_complaint="Early PNC review",
        )
        PNCVisit.objects.create(
            registration=mch_registration,
            admission=maternity_admission,
            discharge=legacy_maternity_discharge,
            clinic_visit=clinic_visit,
            visit_number=1,
            visit_date=legacy_maternity_discharge.discharge_date.date(),
            breastfeeding_status="EXCLUSIVE",
            conducted_by=test_user,
        )

        call_command("backfill_maternity_postpartum_continuity", stdout=StringIO())

        legacy_maternity_discharge.refresh_from_db()

        assert legacy_maternity_discharge.maternity_continuity_action == "ROUTE_TO_PNC_QUEUE"
        assert legacy_maternity_discharge.maternity_continuity_status == "QUEUED"
        assert legacy_maternity_discharge.pnc_clinic_visit_id == clinic_visit.id
        assert legacy_maternity_discharge.pnc_appointment_id is None