# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for DHA terminology source selection and normalized concept responses.

Run with: poetry run pytest tests/billing/test_services/test_terminology_source_registry.py -q
Inputs: bundled DHA terminology source registry and mocked Clinical Concepts API responses.
"""

from unittest.mock import Mock

import pytest

from hmis.apps.billing.services.terminology import TerminologyConcept, TerminologyService
from hmis.apps.billing.services.terminology_source_registry import get_terminology_source


def test_hpt_registry_source_has_official_dha_provenance():
    """HPT lookups use the KNHTS-published MOH-PPB/HPT source."""
    source = get_terminology_source("hpt")

    assert source.owner == "MOH-PPB"
    assert source.source == "HPT"
    assert source.collection is None
    assert source.endpoint == ("https://ilm-dev.dha.go.ke/uat-middleware/api/v1/clinical/concepts")


def test_terminology_concept_normalizes_clinical_concepts_response():
    """Clinical Concepts records retain code, display, provenance, and raw payload."""
    concept = TerminologyConcept.from_api_response(
        {
            "system": "https://example.test/ocl/orgs/MOH-PPB/sources/HPT/",
            "code": "PH11949",
            "display": "Amoxicillin",
        },
        owner="MOH-PPB",
        source="HPT",
    )

    assert concept.code == "PH11949"
    assert concept.display == "Amoxicillin"
    assert concept.owner == "MOH-PPB"
    assert concept.source == "HPT"
    assert concept.system.endswith("/HPT/")


def test_search_hpt_concepts_uses_registry_endpoint_and_normalizes_results(mocker):
    """HPT search calls Clinical Concepts with controlled registry provenance."""
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "count": 1,
        "results": [{"code": "PH11949", "display": "Amoxicillin"}],
    }
    get = mocker.patch(
        "hmis.apps.billing.services.terminology_core.requests.get", return_value=response
    )

    results = TerminologyService().search_hpt_concepts("Amoxicillin", limit=5)

    assert results == [
        TerminologyConcept(
            code="PH11949",
            display="Amoxicillin",
            owner="MOH-PPB",
            source="HPT",
            system="",
            raw_data={"code": "PH11949", "display": "Amoxicillin"},
        )
    ]
    get.assert_called_once_with(
        "https://ilm-dev.dha.go.ke/uat-middleware/api/v1/clinical/concepts",
        params={"owner": "MOH-PPB", "source": "HPT", "search": "Amoxicillin", "limit": 5},
        headers={"Accept": "application/json"},
        timeout=30,
    )
