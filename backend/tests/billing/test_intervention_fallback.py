"""
Tests for SHA BenefitsAndInterventions local JSONL fallback.

Tests cover:
1. intervention_fallback module (loading, searching, lookup)
2. TerminologyService integration (fallback on API failure)
"""

import json
import tempfile
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import pytest
import requests

from hmis.apps.billing.services.intervention_fallback import (
    clear_cache,
    get_local_intervention,
    search_local_interventions,
)
from hmis.apps.billing.services.terminology import (
    CodeNotFoundError,
    InterventionCode,
    TerminologyError,
    TerminologyService,
)

# =============================================================================
# Test Fixture Data
# =============================================================================

SAMPLE_INTERVENTION_ACTIVE = {
    "id": "PMF-07-002",
    "uuid": "2913323",
    "display_name": "Surgical Complications (Public Officers Medical Service Fund)",
    "concept_class": "code",
    "retired": False,
    "description": None,
    "names": [{"name": "Surgical Complications (POMF)", "type": None, "locale": "en"}],
    "extras": {
        "active": "True",
        "benefit": "PMF-07-SC-01",
        "complexity": None,
        "access_point": "IP",
        "level_2_tariff": 0.0,
        "level_3_tariff": 2240.0,
        "level_4_tariff": 3360.0,
        "level_5_tariff": 3920.0,
        "level_6_tariff": 4480.0,
        "applicable_gender": "ALL",
        "levels_applicable": ["LEVEL 3", "LEVEL 4", "LEVEL 5", "LEVEL 6"],
        "payment_mechanism": "FEE FOR SERVICE",
        "applicable_schemes": ["PMF"],
        "requires_surgical_preauth": "False",
    },
    "url": "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/PMF-07-002/",
    "source": "BenefitsAndInterventions",
    "owner": "MOH-KENYA",
    "created_on": "2025-12-02T11:44:36.373797Z",
    "updated_on": "2025-12-17T16:57:00.657906Z",
}

SAMPLE_INTERVENTION_RETIRED = {
    "id": "SHA-07-007",
    "uuid": "2913343",
    "display_name": "Symptom management of chronic disease",
    "concept_class": "code",
    "retired": False,
    "description": None,
    "names": [{"name": "Symptom management of chronic disease", "type": None, "locale": "en"}],
    "extras": {
        "active": "False",
        "benefit": "SHA-07-SC-07",
        "level_3_tariff": 2240.0,
        "level_4_tariff": 3360.0,
        "level_5_tariff": 3920.0,
        "level_6_tariff": 4481.0,
        "levels_applicable": ["LEVEL 3", "LEVEL 4", "LEVEL 5", "LEVEL 6"],
    },
    "url": "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/SHA-07-007/",
    "source": "BenefitsAndInterventions",
    "owner": "MOH-KENYA",
    "created_on": "2025-12-02T11:44:36.373797Z",
    "updated_on": "2025-12-17T16:57:00.657906Z",
}

SAMPLE_SUB_INTERVENTION = {
    "id": "SHA - 06- 004-SI-019",
    "uuid": "2956733",
    "display_name": "Squamous Cell Carcinoma Immunotherapy (IHC x2)",
    "concept_class": "Procedure",
    "retired": False,
    "description": "Sub-intervention for SHA - 06- 004",
    "names": [
        {
            "name": "Squamous Cell Carcinoma Immunotherapy (IHC x2)",
            "type": "Fully Specified",
            "locale": "en",
        }
    ],
    "extras": {
        "Protocol": "",
        "Tariff (KES)": "3500",
        "Total Maximum Amount per test": "7000",
        "Sub-Intervention quantity per year. Maximum No of markers (Drop down for number of tests done at a time)": "2",
    },
    "url": "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/SHA - 06- 004-SI-019/",
    "source": "BenefitsAndInterventions",
    "owner": "MOH-KENYA",
    "created_on": "2026-01-19T14:18:31.910871Z",
    "updated_on": "2026-02-23T20:01:01.798952Z",
}

SAMPLE_CHAPTER = {
    "id": "Sub-Interventions",
    "uuid": "2956543",
    "display_name": "Sub-Interventions",
    "concept_class": "Chapter",
    "retired": False,
    "description": "Chapter for all sub-interventions",
    "names": [{"name": "Sub-Interventions", "type": None, "locale": "en"}],
    "extras": {},
    "url": "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/Sub-Interventions/",
    "source": "BenefitsAndInterventions",
    "owner": "MOH-KENYA",
    "created_on": "2026-01-19T14:17:12.430000Z",
    "updated_on": "2026-01-19T14:17:12.430000Z",
}

SAMPLE_LEVEL_5_ONLY = {
    "id": "SHA-05-100",
    "uuid": "2913400",
    "display_name": "Complex Cardiac Surgery",
    "concept_class": "code",
    "retired": False,
    "description": "High-level cardiac procedure",
    "names": [{"name": "Complex Cardiac Surgery", "type": None, "locale": "en"}],
    "extras": {
        "active": "True",
        "benefit": "SHA-05-SC-01",
        "level_2_tariff": 0.0,
        "level_3_tariff": 0.0,
        "level_4_tariff": 0.0,
        "level_5_tariff": 250000.0,
        "level_6_tariff": 350000.0,
        "levels_applicable": ["LEVEL 5", "LEVEL 6"],
        "applicable_schemes": ["PMF", "SHIF"],
    },
    "url": "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/SHA-05-100/",
    "source": "BenefitsAndInterventions",
    "owner": "MOH-KENYA",
    "created_on": "2025-12-02T11:44:36.373797Z",
    "updated_on": "2025-12-17T16:57:00.657906Z",
}


@pytest.fixture(autouse=True)
def _clear_fallback_cache():
    """Clear the module-level cache before/after each test."""
    clear_cache()
    yield
    clear_cache()


@pytest.fixture
def sample_jsonl(tmp_path):
    """Create a temporary JSONL file with sample interventions."""
    jsonl_file = tmp_path / "test_interventions.jsonl"
    records = [
        SAMPLE_INTERVENTION_ACTIVE,
        SAMPLE_INTERVENTION_RETIRED,
        SAMPLE_SUB_INTERVENTION,
        SAMPLE_CHAPTER,
        SAMPLE_LEVEL_5_ONLY,
    ]
    with open(jsonl_file, "w") as f:
        for record in records:
            f.write(json.dumps(record) + "\n")
    return jsonl_file


@pytest.fixture
def patch_jsonl_path(sample_jsonl):
    """Patch settings to point to test JSONL file."""
    with patch(
        "hmis.apps.billing.services.intervention_fallback._get_jsonl_path",
        return_value=sample_jsonl,
    ):
        yield sample_jsonl


# =============================================================================
# Tests: intervention_fallback module
# =============================================================================


class TestInterventionFallbackLoading:
    """Tests for JSONL loading and caching."""

    def test_loads_actionable_concepts_only(self, patch_jsonl_path):
        """Should skip Chapter/Root concepts and only load code/Code/Procedure."""
        results, _ = search_local_interventions(query="", limit=100)
        # 3 actionable records (active: PMF-07-002, SHA-05-100, SHA-06-004-SI-019)
        # SHA-07-007 is inactive and filtered out in search
        # Chapter is skipped during load
        ids = [r["code"] for r in results]
        assert "Sub-Interventions" not in ids  # Chapter excluded
        assert "PMF-07-002" in ids
        assert "SHA - 06- 004-SI-019" in ids

    def test_missing_jsonl_returns_empty(self, tmp_path):
        """Should return empty list if JSONL file doesn't exist."""
        with patch(
            "hmis.apps.billing.services.intervention_fallback._get_jsonl_path",
            return_value=tmp_path / "nonexistent.jsonl",
        ):
            results, _ = search_local_interventions(query="test")
            assert results == []

    def test_cache_is_reused(self, patch_jsonl_path):
        """Should load JSONL only once (cached in memory)."""
        search_local_interventions(query="")
        # Modify the file after first load
        with open(patch_jsonl_path, "w") as f:
            f.write("")  # empty file
        # Second call should still return cached data
        results, _ = search_local_interventions(query="", limit=100)
        assert len(results) > 0

    def test_clear_cache_forces_reload(self, patch_jsonl_path):
        """clear_cache() should force a fresh reload on next access."""
        results1, _ = search_local_interventions(query="", limit=100)
        assert len(results1) > 0

        clear_cache()
        # Overwrite with empty
        with open(patch_jsonl_path, "w") as f:
            f.write("")
        results2, _ = search_local_interventions(query="", limit=100)
        assert results2 == []


class TestSearchLocalInterventions:
    """Tests for search_local_interventions()."""

    def test_search_by_name(self, patch_jsonl_path):
        """Should find interventions by display_name substring match."""
        results, _ = search_local_interventions(query="Surgical Complications")
        assert len(results) == 1
        assert results[0]["code"] == "PMF-07-002"
        assert results[0]["name"] == "Surgical Complications (Public Officers Medical Service Fund)"

    def test_search_by_code(self, patch_jsonl_path):
        """Should find interventions by ID substring match."""
        results, _ = search_local_interventions(query="PMF-07")
        assert len(results) == 1
        assert results[0]["code"] == "PMF-07-002"

    def test_search_case_insensitive(self, patch_jsonl_path):
        """Search should be case-insensitive."""
        results, _ = search_local_interventions(query="surgical complications")
        assert len(results) == 1

    def test_search_filters_inactive(self, patch_jsonl_path):
        """Should exclude records with active=False."""
        results, _ = search_local_interventions(query="Symptom management")
        assert len(results) == 0

    def test_search_filters_by_facility_level(self, patch_jsonl_path):
        """Should only return interventions available at the given level."""
        # SHA-05-100 is level 5+6 only
        results_l4, _ = search_local_interventions(query="Cardiac", facility_level=4)
        assert len(results_l4) == 0

        results_l5, _ = search_local_interventions(query="Cardiac", facility_level=5)
        assert len(results_l5) == 1
        assert results_l5[0]["code"] == "SHA-05-100"

    def test_search_filters_by_category(self, patch_jsonl_path):
        """Should filter by benefit (category) code."""
        results, _ = search_local_interventions(query="", category="PMF-07-SC-01")
        assert len(results) == 1
        assert results[0]["code"] == "PMF-07-002"

    def test_search_respects_limit(self, patch_jsonl_path):
        """Should not return more than the limit."""
        results, _ = search_local_interventions(query="", limit=1)
        assert len(results) == 1

    def test_empty_query_returns_all_active(self, patch_jsonl_path):
        """Empty query returns all active interventions."""
        results, _ = search_local_interventions(query="", limit=100)
        codes = [r["code"] for r in results]
        assert "PMF-07-002" in codes
        assert "SHA-05-100" in codes
        assert "SHA - 06- 004-SI-019" in codes
        # Retired record excluded
        assert "SHA-07-007" not in codes

    def test_tariff_extraction_for_level(self, patch_jsonl_path):
        """Should return correct tariff for requested facility level."""
        results, _ = search_local_interventions(query="PMF-07-002", facility_level=4)
        assert len(results) == 1
        assert results[0]["price"] == Decimal("3360.0")

    def test_tariff_extraction_procedure_type(self, patch_jsonl_path):
        """Procedure types use 'Tariff (KES)' field."""
        results, _ = search_local_interventions(query="Squamous Cell")
        assert len(results) == 1
        assert results[0]["price"] == Decimal("3500")

    def test_facility_level_extraction(self, patch_jsonl_path):
        """Should extract minimum facility level from levels_applicable."""
        results, _ = search_local_interventions(query="PMF-07-002")
        assert results[0]["facility_level"] == 3  # min of [3,4,5,6]

        results, _ = search_local_interventions(query="Cardiac")
        assert results[0]["facility_level"] == 5  # min of [5,6]


class TestGetLocalIntervention:
    """Tests for get_local_intervention()."""

    def test_get_existing_code(self, patch_jsonl_path):
        """Should return kwargs for an existing intervention."""
        result = get_local_intervention("PMF-07-002")
        assert result is not None
        assert result["code"] == "PMF-07-002"
        assert result["name"] == "Surgical Complications (Public Officers Medical Service Fund)"
        assert result["category"] == "Surgical (PMF)"
        assert result["is_active"] is True

    def test_get_nonexistent_code(self, patch_jsonl_path):
        """Should return None for unknown code."""
        result = get_local_intervention("NONEXISTENT-999")
        assert result is None

    def test_get_with_facility_level(self, patch_jsonl_path):
        """Should return tariff for specified facility level."""
        result = get_local_intervention("PMF-07-002", facility_level=5)
        assert result is not None
        assert result["price"] == Decimal("3920.0")

    def test_get_procedure_type(self, patch_jsonl_path):
        """Should work for Procedure concept class."""
        result = get_local_intervention("SHA - 06- 004-SI-019")
        assert result is not None
        assert result["code"] == "SHA - 06- 004-SI-019"
        assert result["price"] == Decimal("3500")

    def test_get_inactive_still_returned(self, patch_jsonl_path):
        """get_local_intervention returns even inactive records (for lookups)."""
        result = get_local_intervention("SHA-07-007")
        assert result is not None
        assert result["is_active"] is False


# =============================================================================
# Tests: TerminologyService integration (local-first)
# =============================================================================


class TestTerminologyServiceLocalFirst:
    """Tests for TerminologyService local-first intervention lookup."""

    @pytest.fixture
    def service(self, patch_jsonl_path):
        """TerminologyService with local data available."""
        with patch.object(TerminologyService, "__init__", lambda self, **kw: None):
            svc = TerminologyService.__new__(TerminologyService)
            svc.api_base_url = "https://fake-dha.example.com"
            svc.interventions_endpoint = "/terminology/v1/sha-intervention"
            svc.timeout = 5
            svc.use_local_fallback = True
            svc.auth_service = type("FakeAuth", (), {"get_terminology_headers": lambda s: {}})()
            return svc

    def test_search_serves_from_local_without_api_call(self, service):
        """Should serve from local JSONL without ever calling the DHA API."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            results = service.search_interventions("Surgical")

        # API should NOT be called — local had results
        mock_get.assert_not_called()
        assert len(results) == 1
        assert isinstance(results[0], InterventionCode)
        assert results[0].code == "PMF-07-002"
        assert results[0].name == "Surgical Complications (Public Officers Medical Service Fund)"

    def test_search_respects_facility_level(self, service):
        """Local-first search should filter by facility level."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            results = service.search_interventions("", facility_level=4)

        mock_get.assert_not_called()
        codes = [r.code for r in results]
        assert "SHA-05-100" not in codes  # Level 5+6 only
        assert "PMF-07-002" in codes  # Level 3+

    def test_search_returns_correct_price_for_level(self, service):
        """Local-first should return level-specific tariff."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            results = service.search_interventions("PMF-07", facility_level=6)

        mock_get.assert_not_called()
        assert len(results) == 1
        assert results[0].price == Decimal("4480.0")

    def test_search_falls_through_to_api_when_local_empty(self, service):
        """Should call DHA API when local returns no matches."""
        mock_response = type(
            "Response",
            (),
            {
                "status_code": 200,
                "raise_for_status": lambda s: None,
                "json": lambda s: {
                    "IsSuccess": True,
                    "Data": {
                        "shaInterventions": [
                            {
                                "intervention_code": "SHA-NEW-001",
                                "intervention_name": "New From API",
                                "price": "9000",
                            }
                        ]
                    },
                },
            },
        )()

        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_get.return_value = mock_response
            # Query that doesn't match any local record
            results = service.search_interventions("xyznonexistent999")

        mock_get.assert_called_once()
        assert len(results) == 1
        assert results[0].code == "SHA-NEW-001"

    def test_search_force_remote_skips_local(self, service):
        """force_remote=True should always call DHA API."""
        mock_response = type(
            "Response",
            (),
            {
                "status_code": 200,
                "raise_for_status": lambda s: None,
                "json": lambda s: {
                    "IsSuccess": True,
                    "Data": {
                        "shaInterventions": [
                            {
                                "intervention_code": "SHA-API-001",
                                "intervention_name": "From API",
                                "price": "5000",
                            }
                        ]
                    },
                },
            },
        )()

        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_get.return_value = mock_response
            results = service.search_interventions("Surgical", force_remote=True)

        mock_get.assert_called_once()
        assert len(results) == 1
        assert results[0].code == "SHA-API-001"

    def test_search_force_remote_raises_on_api_failure(self, service):
        """force_remote should raise if API fails (no local fallback)."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_get.side_effect = requests.Timeout("timed out")

            with pytest.raises(TerminologyError):
                service.search_interventions("test", force_remote=True)

    def test_get_intervention_serves_from_local(self, service):
        """get_intervention should serve from local without API call."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            result = service.get_intervention("PMF-07-002")

        mock_get.assert_not_called()
        assert isinstance(result, InterventionCode)
        assert result.code == "PMF-07-002"

    def test_get_intervention_falls_through_to_api(self, service):
        """Should call API when code not in local store."""
        mock_response = type(
            "Response",
            (),
            {
                "status_code": 200,
                "raise_for_status": lambda s: None,
                "json": lambda s: {
                    "intervention_code": "SHA-REMOTE-001",
                    "intervention_name": "Remote Only",
                    "price": "7500",
                },
            },
        )()

        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_get.return_value = mock_response
            result = service.get_intervention("SHA-REMOTE-001")

        mock_get.assert_called_once()
        assert result.code == "SHA-REMOTE-001"

    def test_get_intervention_raises_not_found(self, service):
        """Should raise CodeNotFoundError when not in local AND API returns 404."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_resp = type(
                "Response", (), {"status_code": 404, "raise_for_status": lambda s: None}
            )()
            mock_get.return_value = mock_resp

            with pytest.raises(CodeNotFoundError):
                service.get_intervention("NONEXISTENT-999")

    def test_get_intervention_raises_on_api_error(self, service):
        """Should raise TerminologyError when not local and API fails."""
        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_get.side_effect = requests.ConnectionError("Network down")

            with pytest.raises(TerminologyError):
                service.get_intervention("NOT-IN-LOCAL-STORE")

    def test_get_intervention_force_remote(self, service):
        """force_remote=True should skip local and call API."""
        mock_response = type(
            "Response",
            (),
            {
                "status_code": 200,
                "raise_for_status": lambda s: None,
                "json": lambda s: {
                    "intervention_code": "PMF-07-002",
                    "intervention_name": "Fresh From API",
                    "price": "9999",
                },
            },
        )()

        with patch("hmis.apps.billing.services.terminology.requests.get") as mock_get:
            mock_get.return_value = mock_response
            result = service.get_intervention("PMF-07-002", force_remote=True)

        mock_get.assert_called_once()
        assert result.name == "Fresh From API"
