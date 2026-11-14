# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Test controlled INTER-SEM-001 FHIR evidence generation.

Run: ``poetry run pytest tests/core/test_validate_fhir_semantic_evidence.py -q``.
Inputs: synthetic Condition, ProcedureOrder, and LabResult IDs plus an output directory.
"""

import json

import pytest  # type: ignore
from django.core.management import call_command
from django.test import override_settings

from hmis.apps.core.services.hapi_r4_validation import HAPIR4ValidationResult


@pytest.mark.django_db
@override_settings(FHIR_BASE_URL="https://testserver")
def test_command_writes_semantic_exports_and_authoritative_outcomes(
    mocker,
    tmp_path,
    sample_patient,
    sample_encounter,
    sample_lab_result,
    sample_facility,
    sample_organization,
    test_user,
):
    """The command retains code-system-preserving exports and HAPI outcomes."""
    from hmis.apps.encounters.models import Diagnosis
    from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder

    diagnosis = Diagnosis.objects.create(
        encounter=sample_encounter,
        icd11_code="BA00",
        icd11_display="Essential hypertension",
        diagnosis_type="WORKING",
    )
    catalog = ProcedureCatalog.objects.create(
        code="PROC-SEM-EVIDENCE",
        name="Synthetic wound debridement",
        ichi_code="MZJ.01",
        category="THERAPEUTIC",
        facility=sample_facility,
        organization=sample_organization,
    )
    procedure = ProcedureOrder.objects.create(
        procedure=catalog,
        patient=sample_patient,
        encounter=sample_encounter,
        indication="Synthetic semantic evidence",
        ordered_by=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )
    validate = mocker.patch(
        "hmis.apps.core.management.commands.validate_fhir_semantic_evidence."
        "HAPIR4ValidationService.validate_resource",
        return_value=HAPIR4ValidationResult(
            resource_type="Condition",
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
        "validate_fhir_semantic_evidence",
        "--condition-id",
        str(diagnosis.id),
        "--procedure-id",
        str(procedure.id),
        "--observation-id",
        str(sample_lab_result.id),
        "--facility-id",
        str(sample_facility.id),
        "--output-dir",
        str(tmp_path),
    )

    assert validate.call_count == 3
    condition = json.loads((tmp_path / "condition.json").read_text())
    procedure_export = json.loads((tmp_path / "procedure.json").read_text())
    observation = json.loads((tmp_path / "observation.json").read_text())
    assert condition["code"]["coding"][0]["system"] == "http://id.who.int/icd/release/11/mms"
    assert procedure_export["code"]["coding"][0]["system"] == "http://id.who.int/ichi"
    assert observation["code"]["coding"][0]["system"] == "http://loinc.org"
    assert json.loads((tmp_path / "validation-report.json").read_text())["passed"] is True
