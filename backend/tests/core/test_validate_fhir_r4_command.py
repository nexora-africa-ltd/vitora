# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for the controlled HAPI FHIR R4 evidence validation command.

Run: ``poetry run pytest tests/core/test_validate_fhir_r4_command.py -q``.
Inputs: DHA-only resource IDs and an output directory; HAPI calls are mocked.
"""

import json

import pytest  # type: ignore
from django.core.management import call_command
from django.test import override_settings

from hmis.apps.core.services.hapi_r4_validation import HAPIR4ValidationResult


@pytest.mark.django_db
@override_settings(FHIR_BASE_URL="https://testserver")
def test_command_writes_resources_and_authoritative_outcomes(
    mocker,
    tmp_path,
    sample_patient,
    sample_encounter,
    sample_lab_result,
    sample_lab_order,
    test_user,
):
    """The evidence command saves each export and its HAPI OperationOutcome."""
    from hmis.apps.laboratory.models import DiagnosticReport

    report = DiagnosticReport.objects.create(
        lab_order=sample_lab_order,
        issued_by=test_user,
        status=DiagnosticReport.Status.FINAL,
        conclusion="Synthetic report.",
    )
    validate = mocker.patch(
        "hmis.apps.core.management.commands.validate_fhir_r4_evidence.HAPIR4ValidationService.validate_resource",
        return_value=HAPIR4ValidationResult(
            resource_type="Patient",
            local_valid=True,
            authoritative=True,
            is_valid=True,
            status="validated",
            operation_outcome={
                "resourceType": "OperationOutcome",
                "issue": [{"severity": "information", "code": "informational"}],
            },
        ),
    )
    call_command(
        "validate_fhir_r4_evidence",
        "--patient-id",
        str(sample_patient.id),
        "--encounter-id",
        str(sample_encounter.id),
        "--observation-id",
        str(sample_lab_result.id),
        "--diagnostic-report-id",
        str(report.id),
        "--output-dir",
        str(tmp_path),
    )

    assert validate.call_count == 4
    assert json.loads((tmp_path / "patient.json").read_text())["resourceType"] == "Patient"
    assert json.loads((tmp_path / "encounter.json").read_text())["resourceType"] == "Encounter"
    assert json.loads((tmp_path / "observation.json").read_text())["resourceType"] == "Observation"
    assert json.loads((tmp_path / "diagnostic-report.json").read_text())["resourceType"] == (
        "DiagnosticReport"
    )
    assert json.loads((tmp_path / "validation-report.json").read_text())["passed"] is True
