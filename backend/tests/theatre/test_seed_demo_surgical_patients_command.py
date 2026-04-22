from io import StringIO

import pytest  # type: ignore
from django.core.management import call_command

from hmis.apps.core.models import Facility
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient
from hmis.apps.procedures.models import ProcedureCatalog
from hmis.apps.theatre.management.commands.seed_demo_surgical_patients import DEMO_SUFFIX
from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase


@pytest.mark.django_db
class TestSeedDemoSurgicalPatientsCommand:
    def test_creates_demo_surgical_patients_and_cases(
        self, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        hq_facility = Facility.objects.create(
            organization=sample_organization,
            name="Demo General Hospital",
            mfl_code="DEMO-HQ-001",
            level="4",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
            is_headquarters=True,
            branch_code="HQ",
        )
        out = StringIO()

        call_command(
            "seed_demo_surgical_patients",
            f"--org={sample_organization.slug}",
            stdout=out,
        )

        output = out.getvalue()
        demo_patients = Patient.objects.filter(last_name__endswith=DEMO_SUFFIX)
        demo_cases = SurgeryCase.objects.filter(patient__last_name__endswith=DEMO_SUFFIX)
        demo_encounters = Encounter.objects.filter(patient__last_name__endswith=DEMO_SUFFIX)

        assert demo_patients.count() == 5
        assert demo_cases.count() == 5
        assert demo_encounters.count() == 5
        assert OperatingTheatre.objects.filter(code__startswith="DEMO-OT-").count() >= 4
        assert ProcedureCatalog.objects.filter(
            code="GS-APP", tibabot_procedure_key="appendectomy"
        ).exists()
        assert demo_cases.filter(status=SurgeryCase.CaseStatus.DISCHARGED).exists()
        assert demo_cases.filter(status=SurgeryCase.CaseStatus.IN_SURGERY).exists()
        assert demo_cases.filter(encounter__isnull=False).count() == 5
        assert demo_patients.filter(registered_at_facility=hq_facility).count() == 5
        assert demo_cases.filter(facility=hq_facility).count() == 5
        assert demo_encounters.filter(facility=hq_facility).count() == 5
        assert demo_encounters.exclude(notes="").count() == 5
        assert "Created 5 demo surgical patient(s) and 5 case(s)." in output
        assert "Facility:     Demo General Hospital" in output

    def test_clear_removes_demo_surgical_patients_and_cases(
        self, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        call_command(
            "seed_demo_surgical_patients",
            f"--org={sample_organization.slug}",
            f"--facility={sample_facility.mfl_code}",
            stdout=StringIO(),
        )

        out = StringIO()
        call_command("seed_demo_surgical_patients", "--clear", stdout=out)

        assert not Patient.objects.filter(last_name__endswith=DEMO_SUFFIX).exists()
        assert not SurgeryCase.objects.filter(patient__last_name__endswith=DEMO_SUFFIX).exists()
        assert "Deleted" in out.getvalue()
