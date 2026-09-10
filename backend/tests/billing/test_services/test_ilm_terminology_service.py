# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for ILM clinical terminology lookups and prescription code validation.

Run with: poetry run pytest tests/billing/test_services/test_ilm_terminology_service.py -v
"""

from unittest.mock import MagicMock

import pytest
from django.test import override_settings

from hmis.apps.billing.services.ilm_client import IlmResponse


def _response(payload):
    return IlmResponse(status_code=200, headers={}, json=payload)


@pytest.mark.django_db
class TestIlmTerminologyService:
    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="source-a",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_lists_concepts_with_exact_resolved_params(self):
        from hmis.apps.billing.services.ilm_terminology_service import IlmTerminologyService

        client = MagicMock()
        client.get.return_value = _response({"results": []})

        result = IlmTerminologyService(client=client).list_concepts(query={"q": "amoxicillin"})

        assert result == {"results": []}
        client.get.assert_called_once_with(
            "/api/v1/clinical/concepts",
            params={"owner": "owner-a", "sources": "source-a", "q": "amoxicillin"},
        )

    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="source-a",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_lists_mappings_with_exact_params(self):
        from hmis.apps.billing.services.ilm_terminology_service import IlmTerminologyService

        client = MagicMock()
        client.get.return_value = _response({"results": []})

        result = IlmTerminologyService(client=client).list_mappings(
            query={"from_concept": "drug-1", "map_types": "same-as"}
        )

        assert result == {"results": []}
        client.get.assert_called_once_with(
            "/api/v1/clinical/concepts/mappings",
            params={
                "owner": "owner-a",
                "sources": "source-a",
                "from_concept": "drug-1",
                "map_types": "same-as",
            },
        )

    @override_settings(
        ILM_TERMINOLOGY_OWNER="",
        ILM_TERMINOLOGY_SOURCES="",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_rejects_missing_configuration(self):
        from hmis.apps.billing.services.ilm_terminology_service import (
            IlmTerminologyConfigurationError,
            IlmTerminologyService,
        )

        with pytest.raises(IlmTerminologyConfigurationError, match="owner"):
            IlmTerminologyService(client=MagicMock()).list_concepts()

    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="",
        ILM_TERMINOLOGY_COLLECTION="collection-a",
    )
    def test_mappings_require_sources_not_a_collection(self):
        from hmis.apps.billing.services.ilm_terminology_service import (
            IlmTerminologyConfigurationError,
            IlmTerminologyService,
        )

        with pytest.raises(IlmTerminologyConfigurationError, match="sources"):
            IlmTerminologyService(client=MagicMock()).list_mappings()

    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="source-a",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_validates_each_code_with_a_concept_lookup(self):
        from hmis.apps.billing.services.ilm_terminology_service import IlmTerminologyService

        client = MagicMock()
        client.get.return_value = _response({"results": [{"code": "GCC-1"}]})

        IlmTerminologyService(client=client).validate_concept_code("GCC-1")

        client.get.assert_called_once_with(
            "/api/v1/clinical/concepts",
            params={"owner": "owner-a", "sources": "source-a", "code": "GCC-1"},
        )
