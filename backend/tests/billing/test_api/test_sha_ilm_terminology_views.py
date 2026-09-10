# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""API tests for SHA ILM terminology proxy endpoints.

Run with: poetry run pytest tests/billing/test_api/test_sha_ilm_terminology_views.py -v
"""

from unittest.mock import patch, seal

import pytest
from django.test import override_settings

from hmis.apps.billing.services.dha_errors import DHAServerError
from tests.billing.test_api.test_sha_api import sha_client, user_with_sha_permissions  # noqa: F401

SERVICE = "hmis.apps.billing.sha_ilm_terminology_views.IlmTerminologyService"


@pytest.mark.django_db
class TestIlmTerminologyViews:
    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="source-a",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_concepts_forwards_exact_query_params(self, sha_client):
        with patch(SERVICE, autospec=True) as service:
            service.return_value.list_concepts.return_value = {"results": [{"code": "GCC-1"}]}
            service.return_value.configured_provenance.return_value = {
                "owner": "owner-a",
                "sources": "source-a",
            }
            # Fail fast on unconfigured mock access instead of serializing new mocks.
            seal(service.return_value)

            response = sha_client.get("/api/sha/ilm/terminology/concepts/?q=amoxicillin")

        assert response.status_code == 200
        assert response.json() == {
            "results": [{"code": "GCC-1"}],
            "provenance": {"owner": "owner-a", "sources": "source-a"},
        }
        service.return_value.list_concepts.assert_called_once_with(query={"q": "amoxicillin"})
        service.return_value.configured_provenance.assert_called_once_with()

    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="source-a",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_mappings_forwards_exact_optional_params(self, sha_client):
        with patch(SERVICE, autospec=True) as service:
            service.return_value.list_mappings.return_value = {"results": []}
            service.return_value.configured_provenance.return_value = {
                "owner": "owner-a",
                "sources": "source-a",
            }
            seal(service.return_value)

            response = sha_client.get(
                "/api/sha/ilm/terminology/mappings/?from_concept=GCC-1&map_types=same-as"
            )

        assert response.status_code == 200
        assert response.json() == {
            "results": [],
            "provenance": {"owner": "owner-a", "sources": "source-a"},
        }
        service.return_value.list_mappings.assert_called_once_with(
            query={"from_concept": "GCC-1", "map_types": "same-as"}
        )
        service.return_value.configured_provenance.assert_called_once_with()

    @override_settings(
        ILM_TERMINOLOGY_OWNER="",
        ILM_TERMINOLOGY_SOURCES="",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_concepts_rejects_missing_configuration(self, sha_client):
        response = sha_client.get("/api/sha/ilm/terminology/concepts/")

        assert response.status_code == 400
        assert "owner" in response.data["error"]

    @override_settings(
        ILM_TERMINOLOGY_OWNER="owner-a",
        ILM_TERMINOLOGY_SOURCES="source-a",
        ILM_TERMINOLOGY_COLLECTION="",
    )
    def test_maps_upstream_dha_errors(self, sha_client):
        with patch(SERVICE, autospec=True) as service:
            service.return_value.list_concepts.side_effect = DHAServerError("down", status_code=503)
            seal(service.return_value)

            response = sha_client.get("/api/sha/ilm/terminology/concepts/")

        assert response.status_code == 502
