from io import StringIO

import pytest  # type: ignore
from django.core.management import call_command

from hmis.apps.patients.models import Patient
from hmis.apps.procedures.models import ProcedureCatalog
from hmis.apps.theatre.management.commands.seed_demo_surgical_patients import DEMO_SUFFIX
from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase


@pytest.mark.django_db
class TestSeedDemoSurgicalPatientsCommand:
    def test_creates_demo_surgical_patients_and_cases(
        self, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        out = StringIO()

        call_command(
            "seed_demo_surgical_patients",
            f"--org={sample_organization.slug}",
            f"--facility={sample_facility.mfl_code}",
            stdout=out,
        )

        output = out.getvalue()
        demo_patients = Patient.objects.filter(last_name__endswith=DEMO_SUFFIX)
        demo_cases = SurgeryCase.objects.filter(patient__last_name__endswith=DEMO_SUFFIX)

        assert demo_patients.count() == 5
        assert demo_cases.count() == 5
        assert OperatingTheatre.objects.filter(code__startswith="DEMO-OT-").count() >= 4
        assert ProcedureCatalog.objects.filter(
            code="GS-APP", tibabot_procedure_key="appendectomy"
        ).exists()
        assert demo_cases.filter(status=SurgeryCase.CaseStatus.DISCHARGED).exists()
        assert demo_cases.filter(status=SurgeryCase.CaseStatus.IN_SURGERY).exists()
        assert "Created 5 demo surgical patient(s) and 5 case(s)." in output

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
