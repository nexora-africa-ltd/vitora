# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Test the report-only DHA ICHI procedure-enrichment workflow.

Run: ``poetry run pytest tests/procedures/test_propose_procedure_ichi_mappings.py -q``.
Inputs: a facility-scoped procedure catalogue, mocked DHA terminology responses, and a temporary report path.
"""

import json

import pytest  # type: ignore
from django.core.management import call_command


@pytest.mark.django_db
def test_proposal_command_writes_candidates_without_changing_catalogue(
    mocker, tmp_path, sample_facility, sample_organization
):
    """The command reports DHA candidates but leaves every ICHI field unchanged."""
    from hmis.apps.billing.services.terminology_models import ICHICode
    from hmis.apps.procedures.models import ProcedureCatalog

    procedure = ProcedureCatalog.objects.create(
        code="PROC-ENRICH-001",
        name="Wound debridement",
        category="THERAPEUTIC",
        facility=sample_facility,
        organization=sample_organization,
    )
    search = mocker.patch(
        "hmis.apps.procedures.management.commands.propose_procedure_ichi_mappings."
        "TerminologyService.search_ichi",
        return_value=[ICHICode(code="MZJ.01", title="Wound debridement")],
    )
    output = tmp_path / "ichi-proposals.json"

    call_command(
        "propose_procedure_ichi_mappings",
        "--facility-id",
        str(sample_facility.id),
        "--output",
        str(output),
    )

    procedure.refresh_from_db()
    report = json.loads(output.read_text())
    assert search.call_args.args[0] == "Wound debridement"
    assert search.call_args.kwargs["limit"] == 25
    assert procedure.ichi_code == ""
    assert report["review_required"] is True
    assert report["proposals"][0]["candidates"][0]["code"] == "MZJ.01"
