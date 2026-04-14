from __future__ import annotations

import json
from datetime import date, timedelta
from io import StringIO

import pytest
from django.core.management import call_command


@pytest.fixture
def anc_clinic(db, sample_facility, sample_organization):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Command Clinic",
        clinic_type="ANC",
        code="ANCCMD001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def pnc_clinic(db, sample_facility, sample_organization):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="PNC Command Clinic",
        clinic_type="PNC",
        code="PNCCMD001",
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
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=140),
        total_visits=0,
    )


@pytest.fixture
def mch_registration(
    db, sample_patient, anc_enrollment, test_user, sample_facility, sample_organization
):
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today(),
        registered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.mark.django_db
class TestMCHClinicUnificationCommands:
    def test_backfill_mch_clinic_visits_links_anc_visit_idempotently(self, mch_registration):
        from hmis.apps.mch.models import ANCVisit

        visit = ANCVisit.objects.create(
            registration=mch_registration,
            visit_number=1,
            visit_date=date.today(),
            blood_pressure="120/80",
        )

        call_command("backfill_mch_clinic_visits", module="anc")
        visit.refresh_from_db()

        assert visit.clinic_visit is not None
        first_link = visit.clinic_visit_id

        call_command("backfill_mch_clinic_visits", module="anc")
        visit.refresh_from_db()

        assert visit.clinic_visit_id == first_link

    def test_reconcile_clinic_enrollment_attendance_recomputes_totals(
        self, mch_registration, anc_enrollment
    ):
        from hmis.apps.clinics.models import ClinicVisit
        from hmis.apps.mch.models import ANCVisit

        clinic = anc_enrollment.clinic
        session = clinic.get_current_session()
        clinic_visit = ClinicVisit.objects.create(
            session=session,
            patient=mch_registration.mother,
            status="COMPLETED",
            visit_type="FOLLOW_UP",
            source="DIRECT",
            source_module="MCH_ANC",
            source_record_id=mch_registration.id,
            chief_complaint="ANC review",
        )
        anc_visit = ANCVisit.objects.create(
            registration=mch_registration,
            visit_number=1,
            visit_date=date.today(),
            clinic_visit=clinic_visit,
            next_visit_date=date.today() + timedelta(days=28),
        )
        anc_enrollment.total_visits = 9
        anc_enrollment.last_visit_date = None
        anc_enrollment.next_appointment = None
        anc_enrollment.save(update_fields=["total_visits", "last_visit_date", "next_appointment"])

        call_command("reconcile_clinic_enrollment_attendance")
        anc_enrollment.refresh_from_db()

        assert anc_enrollment.total_visits == 1
        assert anc_enrollment.last_visit_date == anc_visit.visit_date
        assert anc_enrollment.next_appointment == anc_visit.next_visit_date

    def test_validate_mch_clinic_links_json_reports_missing_links(self, mch_registration):
        from hmis.apps.mch.models import ANCVisit

        ANCVisit.objects.create(
            registration=mch_registration,
            visit_number=1,
            visit_date=date.today(),
        )

        out = StringIO()
        call_command("validate_mch_clinic_links", json=True, stdout=out)
        payload = json.loads(out.getvalue())

        assert payload["summary"]["anc_visits_without_clinic_visit"] == 1
        assert payload["details"][0]["issue"] == "missing_clinic_visit"
