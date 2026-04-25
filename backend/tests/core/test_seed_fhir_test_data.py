from io import StringIO

import pytest  # type: ignore
from django.core.management import call_command


@pytest.mark.django_db
class TestSeedFHIRTestDataCommand:
    def test_seed_command_creates_additional_inferno_resources(self):
        from hmis.apps.encounters.models import PregnancyObservation, SocialHistoryObservation
        from hmis.apps.imaging.models import DICOMInstance, DICOMStudy
        from hmis.apps.immunizations.models import ImmunizationRecord
        from hmis.apps.laboratory.models import DiagnosticReport, Specimen
        from hmis.apps.procedures.models import ProcedureOrder
        from hmis.apps.theatre.models import TheatreConsumable

        out = StringIO()
        call_command("seed_fhir_test_data", stdout=out)
        output = out.getvalue()

        assert ImmunizationRecord.objects.exists()
        assert Specimen.objects.exists()
        assert DiagnosticReport.objects.exists()
        assert ProcedureOrder.objects.exists()
        assert DICOMStudy.objects.exists()
        assert DICOMInstance.objects.exists()
        assert TheatreConsumable.objects.filter(is_implant=True).exists()
        assert SocialHistoryObservation.objects.filter(observation_type="ALCOHOL_USE").exists()
        assert SocialHistoryObservation.objects.filter(observation_type="TOBACCO_USE").exists()
        assert PregnancyObservation.objects.filter(observation_type="PREGNANCY_STATUS").exists()
        assert PregnancyObservation.objects.filter(
            observation_type="PREGNANCY_EXPECTED_DELIVERY_DATE"
        ).exists()
        assert PregnancyObservation.objects.filter(observation_type="PREGNANCY_OUTCOME").exists()

        assert "url:" in output
        assert "patient_id:" in output
        assert "bundle_id:" in output
        assert "composition_id:" in output
        assert "practitioner_id:" in output
        assert "practitioner_role_id:" in output
        assert "organization_id:" in output
        assert "condition_id:" in output
        assert "allergy_intolerance_id:" in output
        assert "medication_id:" in output
        assert "medication_statement_id:" in output
        assert "observation_results_id:" in output
        assert "immunization_id:" in output
        assert "specimen_id:" in output
        assert "diagnostic_report_id:" in output
        assert "procedure_id:" in output
        assert "imaging_study_id:" in output
        assert "media_id:" in output
        assert "device_id:" in output
        assert "device_use_statement_id:" in output
        assert "observation_results_laboratory_id:" in output
        assert "observation_results_pathology_id:" in output
        assert "observation_results_radiology_id:" in output
        assert "observation_alcohol_use_id:" in output
        assert "observation_tobacco_use_id:" in output
        assert "observation_pregnancy_status_id:" in output
        assert "observation_pregnancy_edd_id:" in output
        assert "observation_pregnancy_outcome_id:" in output

    def test_seed_command_is_rerunnable(self):
        from hmis.apps.patients.models import Patient

        out = StringIO()
        call_command("seed_fhir_test_data", stdout=out)
        call_command("seed_fhir_test_data", stdout=out)

        patients = Patient.objects.filter(
            identification_type="passport",
            identification_number="FHIR-TEST-PATIENT-001",
        )
        assert patients.count() == 1
