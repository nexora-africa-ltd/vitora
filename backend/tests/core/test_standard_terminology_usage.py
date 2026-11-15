# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for the DHA INTER-TERM-001 standard-terminology evidence endpoint.

Run: ``poetry run pytest tests/core/test_standard_terminology_usage.py -q``.
Inputs: authenticated tenant clients and mocked WHO, SNOMED CT, and LOINC lookups.
"""

from unittest.mock import Mock, patch

import pytest
from rest_framework import status

from hmis.apps.billing.services.terminology_models import TerminologyConcept


@pytest.mark.django_db
class TestStandardTerminologyUsageView:
    """The evidence endpoint verifies all three required standards together."""

    def test_requires_authentication(self, api_client):
        """Unauthenticated callers cannot inspect terminology evidence."""
        response = api_client.get("/api/terminology/standard-usage/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_requires_an_authorized_facility_context(self, authenticated_client):
        """The live demonstration is bounded to an accessible active facility."""
        response = authenticated_client.get(
            "/api/terminology/standard-usage/",
            HTTP_X_FACILITY_ID="999999999",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["detail"] == "An authorized X-Facility-ID header is required."

    @patch("hmis.apps.core.terminology_views.SNOMEDService")
    @patch("hmis.apps.core.terminology_views.TerminologyService")
    def test_returns_current_standard_codings_and_descriptions(
        self,
        terminology_service,
        snomed_service,
        authenticated_client,
        sample_facility,
    ):
        """The one endpoint exposes valid ICD-11, SNOMED CT, and LOINC evidence."""
        terminology_service.return_value.search_concepts.side_effect = [
            [
                TerminologyConcept(
                    code="BA00",
                    display="Essential hypertension",
                    owner="WHO",
                    source="ICD-11",
                    version="2026-01",
                )
            ],
            [
                TerminologyConcept(
                    code="57021-8",
                    display="CBC W Auto Differential panel - Blood",
                    owner="Regenstrief",
                    source="LOINC",
                    version="2.83",
                )
            ],
        ]
        snomed_service.return_value.lookup.return_value = Mock(
            concept_id="38341003",
            display="Hypertensive disorder",
        )

        response = authenticated_client.get(
            "/api/terminology/standard-usage/",
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["facility"]["id"] == sample_facility.id
        assert response.data["passed"] is True
        assert response.data["standards"]["icd11"] == {
            "system": "http://id.who.int/icd/release/11/mms",
            "code": "BA00",
            "display": "Essential hypertension",
            "version": "2026-01",
            "valid": True,
        }
        assert response.data["standards"]["snomed_ct"]["code"] == "38341003"
        assert response.data["standards"]["snomed_ct"]["version"] == "20261030"
        assert response.data["standards"]["loinc"] == {
            "system": "http://loinc.org",
            "code": "57021-8",
            "display": "CBC W Auto Differential panel - Blood",
            "version": "2.83",
            "valid": True,
        }

    @patch("hmis.apps.core.terminology_views.SNOMEDService")
    @patch("hmis.apps.core.terminology_views.TerminologyService")
    def test_fails_closed_when_any_required_code_cannot_be_validated(
        self,
        terminology_service,
        snomed_service,
        authenticated_client,
        sample_facility,
    ):
        """No partial pass is presented when a required terminology is unavailable."""
        terminology_service.return_value.search_concepts.return_value = []
        snomed_service.return_value.lookup.return_value = None

        response = authenticated_client.get(
            "/api/terminology/standard-usage/",
            HTTP_X_FACILITY_ID=str(sample_facility.id),
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["passed"] is False
        assert response.data["standards"]["icd11"]["valid"] is False
        assert response.data["standards"]["snomed_ct"]["valid"] is False
        assert response.data["standards"]["loinc"]["valid"] is False
