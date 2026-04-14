"""
Tests for SNOMED CT integration (Gap #30).

Covers:
- SNOMEDConcept model
- SNOMEDService (search, lookup, caching)
- SNOMED search API endpoint
- Diagnosis model SNOMED fields
- FHIR Condition SNOMED coding
- DiagnosisSerializer SNOMED validation
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import TestCase
from rest_framework import status


@pytest.fixture
def snomed_concepts(db):
    """Create sample SNOMED CT concepts for local search."""
    from hmis.apps.core.models import SNOMEDConcept

    concepts = [
        SNOMEDConcept.objects.create(
            concept_id="38341003",
            display="Hypertensive disorder",
            semantic_tag="disorder",
        ),
        SNOMEDConcept.objects.create(
            concept_id="73211009",
            display="Diabetes mellitus",
            semantic_tag="disorder",
        ),
        SNOMEDConcept.objects.create(
            concept_id="195967001",
            display="Asthma",
            semantic_tag="disorder",
        ),
        SNOMEDConcept.objects.create(
            concept_id="386661006",
            display="Fever",
            semantic_tag="finding",
        ),
        SNOMEDConcept.objects.create(
            concept_id="25064002",
            display="Headache",
            semantic_tag="finding",
        ),
    ]
    return concepts


class TestSNOMEDConceptModel:
    """Tests for the SNOMEDConcept model."""

    @pytest.mark.django_db
    def test_create_snomed_concept(self):
        from hmis.apps.core.models import SNOMEDConcept

        concept = SNOMEDConcept.objects.create(
            concept_id="38341003",
            display="Hypertensive disorder",
            semantic_tag="disorder",
        )
        assert concept.concept_id == "38341003"
        assert concept.display == "Hypertensive disorder"
        assert concept.semantic_tag == "disorder"
        assert concept.is_active is True

    @pytest.mark.django_db
    def test_concept_id_uniqueness(self):
        from django.db import IntegrityError

        from hmis.apps.core.models import SNOMEDConcept

        SNOMEDConcept.objects.create(concept_id="38341003", display="Test")
        with pytest.raises(IntegrityError):
            SNOMEDConcept.objects.create(concept_id="38341003", display="Duplicate")

    @pytest.mark.django_db
    def test_str_representation(self):
        from hmis.apps.core.models import SNOMEDConcept

        concept = SNOMEDConcept.objects.create(
            concept_id="38341003", display="Hypertensive disorder"
        )
        assert str(concept) == "38341003 | Hypertensive disorder"


class TestSNOMEDService:
    """Tests for the SNOMEDService."""

    @pytest.mark.django_db
    def test_search_local_cache(self, snomed_concepts):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        service = SNOMEDService()
        results = service._search_local("hypertensive", "", 20)
        # Should match "Hypertensive disorder" via icontains
        assert len(results) >= 1
        assert results[0].concept_id == "38341003"

    @pytest.mark.django_db
    def test_search_local_by_semantic_tag(self, snomed_concepts):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        service = SNOMEDService()
        # Search with both query and semantic_tag filter
        results = service._search_local("fever", "finding", 20)
        assert len(results) == 1
        assert results[0].concept_id == "386661006"

        # Searching for disorder tag should not return findings
        results = service._search_local("fever", "disorder", 20)
        assert len(results) == 0

    @pytest.mark.django_db
    def test_search_local_by_concept_id(self, snomed_concepts):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        service = SNOMEDService()
        results = service._search_local("38341003", "", 20)
        assert len(results) == 1
        assert results[0].display == "Hypertensive disorder"

    @pytest.mark.django_db
    def test_search_empty_query_returns_empty(self):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        service = SNOMEDService()
        results = service.search("", "", 20)
        assert results == []

    @pytest.mark.django_db
    def test_search_short_query_returns_empty(self):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        service = SNOMEDService()
        results = service.search("a", "", 20)
        assert results == []

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_search_snowstorm_success(self, mock_get, snomed_concepts):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "items": [
                {
                    "concept": {
                        "conceptId": "44054006",
                        "fsn": {"term": "Type 2 diabetes mellitus (disorder)"},
                        "pt": {"term": "Type 2 diabetes mellitus"},
                    }
                }
            ]
        }
        mock_get.return_value = mock_response

        service = SNOMEDService()
        results = service.search("type 2 diabetes")
        assert len(results) == 1
        assert results[0].concept_id == "44054006"
        assert results[0].display == "Type 2 diabetes mellitus"
        assert results[0].semantic_tag == "disorder"

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_search_snowstorm_caches_results(self, mock_get, db):
        from hmis.apps.core.models import SNOMEDConcept
        from hmis.apps.core.services.snomed_service import SNOMEDService

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "items": [
                {
                    "concept": {
                        "conceptId": "44054006",
                        "fsn": {"term": "Type 2 diabetes mellitus (disorder)"},
                        "pt": {"term": "Type 2 diabetes mellitus"},
                    }
                }
            ]
        }
        mock_get.return_value = mock_response

        service = SNOMEDService()
        service.search("type 2 diabetes")

        # Verify cached in local DB
        assert SNOMEDConcept.objects.filter(concept_id="44054006").exists()
        cached = SNOMEDConcept.objects.get(concept_id="44054006")
        assert cached.display == "Type 2 diabetes mellitus"
        assert cached.semantic_tag == "disorder"

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_search_falls_back_to_local_on_api_failure(self, mock_get, snomed_concepts):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        mock_get.side_effect = Exception("Network error")

        service = SNOMEDService()
        results = service.search("diabetes")
        # Should fall back to local and find "Diabetes mellitus"
        assert len(results) >= 1
        assert any(r.concept_id == "73211009" for r in results)

    @pytest.mark.django_db
    def test_lookup_from_local_cache(self, snomed_concepts):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        service = SNOMEDService()
        result = service.lookup("38341003")
        assert result is not None
        assert result.display == "Hypertensive disorder"

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_lookup_not_found(self, mock_get, db):
        from hmis.apps.core.services.snomed_service import SNOMEDService

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response

        service = SNOMEDService()
        result = service.lookup("99999999")
        assert result is None


class TestSNOMEDSearchEndpoint:
    """Tests for the SNOMED search API endpoint."""

    @pytest.mark.django_db
    def test_search_requires_auth(self, api_client):
        response = api_client.get("/api/encounters/snomed/search/?q=hypertension")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_search_requires_min_query_length(self, authenticated_client):
        response = authenticated_client.get("/api/encounters/snomed/search/?q=a")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_search_missing_query(self, authenticated_client):
        response = authenticated_client.get("/api/encounters/snomed/search/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_search_returns_results(self, mock_get, authenticated_client, snomed_concepts):
        # Mock Snowstorm to fail so it falls back to local
        mock_get.side_effect = Exception("Network error")

        response = authenticated_client.get("/api/encounters/snomed/search/?q=diabetes")
        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert "count" in response.data
        assert response.data["count"] >= 1

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_search_with_semantic_tag_filter(self, mock_get, authenticated_client, snomed_concepts):
        mock_get.side_effect = Exception("Network error")

        response = authenticated_client.get(
            "/api/encounters/snomed/search/?q=fever&semantic_tag=finding"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert len(results) >= 1
        assert all(r["semantic_tag"] == "finding" for r in results)

    @pytest.mark.django_db
    @patch("hmis.apps.core.services.snomed_service.requests.get")
    def test_search_limit_parameter(self, mock_get, authenticated_client, snomed_concepts):
        mock_get.side_effect = Exception("Network error")

        response = authenticated_client.get("/api/encounters/snomed/search/?q=disorder&limit=2")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] <= 2


class TestDiagnosisSNOMEDFields:
    """Tests for SNOMED CT fields on Diagnosis model."""

    @pytest.mark.django_db
    def test_create_diagnosis_with_snomed_code(self, authenticated_client, sample_encounter):
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            {
                "encounter": sample_encounter.id,
                "snomed_code": "38341003",
                "snomed_display": "Hypertensive disorder",
                "diagnosis_type": "PRIMARY",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["snomed_code"] == "38341003"
        assert response.data["snomed_display"] == "Hypertensive disorder"

    @pytest.mark.django_db
    def test_diagnosis_with_both_icd10_and_snomed(
        self, authenticated_client, sample_encounter, sample_icd10_code
    ):
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            {
                "encounter": sample_encounter.id,
                "icd10_code": sample_icd10_code.id,
                "snomed_code": "38341003",
                "snomed_display": "Hypertensive disorder",
                "diagnosis_type": "PRIMARY",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["snomed_code"] == "38341003"
        assert response.data["icd10_code"] == sample_icd10_code.id

    @pytest.mark.django_db
    def test_diagnosis_requires_at_least_one_code(self, authenticated_client, sample_encounter):
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            {
                "encounter": sample_encounter.id,
                "diagnosis_type": "PRIMARY",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_diagnosis_snomed_only_is_valid(self, authenticated_client, sample_encounter):
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            {
                "encounter": sample_encounter.id,
                "snomed_code": "73211009",
                "snomed_display": "Diabetes mellitus",
                "diagnosis_type": "SECONDARY",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED


class TestFHIRConditionSNOMEDCoding:
    """Tests for SNOMED CT in FHIR Condition resources."""

    @pytest.mark.django_db
    def test_fhir_condition_includes_snomed_coding(
        self, authenticated_client, sample_encounter, sample_icd10_code
    ):
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            snomed_code="38341003",
            snomed_display="Hypertensive disorder",
            diagnosis_type="PRIMARY",
        )

        response = authenticated_client.get(f"/fhir/Condition/{diagnosis.id}")
        assert response.status_code == status.HTTP_200_OK

        codings = response.data["code"]["coding"]
        snomed_codings = [c for c in codings if c["system"] == "http://snomed.info/sct"]
        assert len(snomed_codings) == 1
        assert snomed_codings[0]["code"] == "38341003"
        assert snomed_codings[0]["display"] == "Hypertensive disorder"

    @pytest.mark.django_db
    def test_fhir_condition_without_snomed(
        self, authenticated_client, sample_encounter, sample_icd10_code
    ):
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        response = authenticated_client.get(f"/fhir/Condition/{diagnosis.id}")
        assert response.status_code == status.HTTP_200_OK

        codings = response.data["code"]["coding"]
        snomed_codings = [c for c in codings if c["system"] == "http://snomed.info/sct"]
        assert len(snomed_codings) == 0

    @pytest.mark.django_db
    def test_fhir_condition_with_icd11_and_snomed(self, authenticated_client, sample_encounter):
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd11_code="BA80",
            icd11_display="Essential hypertension",
            snomed_code="38341003",
            snomed_display="Hypertensive disorder",
            diagnosis_type="PRIMARY",
        )

        response = authenticated_client.get(f"/fhir/Condition/{diagnosis.id}")
        assert response.status_code == status.HTTP_200_OK

        codings = response.data["code"]["coding"]
        assert len(codings) == 2  # ICD-11 + SNOMED
        systems = {c["system"] for c in codings}
        assert "http://snomed.info/sct" in systems
        assert "http://id.who.int/icd/release/11/mms" in systems
