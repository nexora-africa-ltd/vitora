"""
Tests for Terminology Service.

TDD GREEN PHASE: These tests verify the implemented TerminologyService
integrates correctly with Kenya DHA Terminology APIs.

APIs Covered:
- GET /v1/sha-interventions - SHA intervention codes with pricing
- GET /v1/icd11-codes - ICD-11 diagnosis codes
- GET /v1/drug-products - Drug product lookup
- GET /v1/active-components - Active pharmaceutical components
- GET /v1/loinc-codes - LOINC lab observation codes
- GET /v1/ichi-codes - ICHI intervention codes

Reference: docs/dha-api-usage-analysis.md
"""

from unittest.mock import Mock, patch

import pytest

from hmis.apps.billing.services.terminology import (
    CodeNotFoundError,
    DrugProduct,
    ICD11Code,
    ICHICode,
    InterventionCode,
    RemoteLOINCCode,
    TerminologyError,
    TerminologyService,
)

# =============================================================================
# SHA Interventions Tests
# =============================================================================


class TestSHAInterventions:
    """Tests for SHA intervention code lookup."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create TerminologyService instance with mocked auth."""
        return TerminologyService()

    def test_search_interventions(self, service, mock_requests_get):
        """Should search SHA interventions by name."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "interventions": [
                    {
                        "code": "SHA-INT-001",
                        "name": "General Consultation",
                        "price": 500.00,
                        "facility_level": 3,
                    }
                ]
            },
        )

        results = service.search_interventions(query="consultation")

        assert len(results) > 0
        assert results[0].code == "SHA-INT-001"
        assert results[0].name == "General Consultation"

    def test_get_intervention_by_code(self, service, mock_requests_get):
        """Should get specific intervention by code."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "intervention": {
                    "code": "SHA-INT-001",
                    "name": "General Consultation",
                    "price": 500.00,
                }
            },
        )

        result = service.get_intervention("SHA-INT-001")

        assert result.code == "SHA-INT-001"

    def test_get_intervention_not_found(self, service, mock_requests_get):
        """Should raise error when not found."""
        mock_requests_get.return_value = Mock(status_code=404)

        with pytest.raises(CodeNotFoundError) as exc_info:
            service.get_intervention("INVALID")

        assert "INVALID" in str(exc_info.value)

    def test_search_by_facility_level(self, service, mock_requests_get):
        """Should filter by facility level."""
        mock_requests_get.return_value = Mock(status_code=200, json=lambda: {"interventions": []})

        service.search_interventions(query="surgery", facility_level=4)

        call_args = mock_requests_get.call_args
        assert call_args is not None

    def test_validate_intervention_for_facility(self, service, mock_requests_get):
        """Should validate intervention for facility level."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "intervention": {
                    "code": "SHA-INT-001",
                    "name": "Test",
                    "facility_level": 3,
                    "is_active": True,
                }
            },
        )

        is_valid, error = service.validate_intervention_for_facility(
            intervention_code="SHA-INT-001",
            facility_level=4,  # Higher than required
        )

        assert is_valid is True


# =============================================================================
# ICD-11 Tests
# =============================================================================


class TestICD11Codes:
    """Tests for ICD-11 diagnosis code lookup."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create TerminologyService instance with mocked auth."""
        return TerminologyService()

    def test_search_icd11(self, service, mock_requests_get):
        """Should search ICD-11 codes."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "codes": [
                    {
                        "code": "1A00",
                        "title": "Cholera",
                        "chapter": "01",
                    }
                ]
            },
        )

        results = service.search_icd11(query="cholera")

        assert len(results) > 0
        assert results[0].code == "1A00"

    def test_get_icd11_by_code(self, service, mock_requests_get):
        """Should get specific ICD-11 code."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "code": {
                    "code": "1A00",
                    "title": "Cholera",
                }
            },
        )

        result = service.get_icd11("1A00")

        assert result.code == "1A00"

    def test_get_icd11_not_found(self, service, mock_requests_get):
        """Should raise error when not found."""
        mock_requests_get.return_value = Mock(status_code=404)

        with pytest.raises(CodeNotFoundError):
            service.get_icd11("INVALID")


# =============================================================================
# Drug Products Tests
# =============================================================================


class TestDrugProducts:
    """Tests for drug products lookup."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create TerminologyService instance with mocked auth."""
        return TerminologyService()

    def test_search_drug_products(self, service, mock_requests_get):
        """Should search drug products."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "products": [
                    {
                        "product_id": "PRD-001",
                        "brand_name": "Panadol",
                        "generic_name": "Paracetamol",
                    }
                ]
            },
        )

        results = service.search_drug_products(query="panadol")

        assert len(results) > 0
        assert results[0].brand_name == "Panadol"

    def test_get_drug_product_by_id(self, service, mock_requests_get):
        """Should get specific drug product."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "product": {
                    "product_id": "PRD-001",
                    "brand_name": "Panadol",
                }
            },
        )

        result = service.get_drug_product("PRD-001")

        assert result.product_id == "PRD-001"


# =============================================================================
# Active Components Tests
# =============================================================================


class TestActiveComponents:
    """Tests for active component lookup."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create TerminologyService instance with mocked auth."""
        return TerminologyService()

    def test_search_active_components(self, service, mock_requests_get):
        """Should search active components."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "components": [
                    {
                        "component_id": "COMP-001",
                        "name": "Paracetamol",
                        "atc_code": "N02BE01",
                    }
                ]
            },
        )

        results = service.search_active_components(query="paracetamol")

        assert len(results) > 0
        assert results[0].name == "Paracetamol"


# =============================================================================
# LOINC Tests (with local fallback)
# =============================================================================


class TestLOINCCodes:
    """Tests for LOINC code lookup with local fallback."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create TerminologyService instance with mocked auth."""
        return TerminologyService(use_local_fallback=True)

    def test_search_loinc_remote(self, service, mock_requests_get):
        """Should search LOINC via remote API."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "codes": [
                    {
                        "loinc_num": "2345-7",
                        "component": "Glucose",
                        "long_common_name": "Glucose [Mass/volume] in Serum or Plasma",
                    }
                ]
            },
        )

        results = service.search_loinc(query="glucose")

        assert len(results) > 0
        assert results[0].loinc_num == "2345-7"

    def test_search_loinc_local_fallback(self, service):
        """Should fall back to local when remote fails."""
        # Mock the methods directly since we need different behavior
        with patch.object(service, "_search_loinc_remote") as mock_remote:
            mock_remote.side_effect = TerminologyError(
                "Remote API failed", terminology_type="LOINC"
            )

            with patch.object(service, "_search_loinc_local") as mock_local:
                mock_local.return_value = [
                    RemoteLOINCCode(
                        loinc_num="2345-7",
                        component="Glucose",
                    )
                ]

                results = service.search_loinc(query="glucose")

                mock_remote.assert_called_once()
                mock_local.assert_called_once()


# =============================================================================
# ICHI Tests
# =============================================================================


class TestICHICodes:
    """Tests for ICHI intervention code lookup."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create TerminologyService instance with mocked auth."""
        return TerminologyService()

    def test_search_ichi(self, service, mock_requests_get):
        """Should search ICHI codes."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "codes": [
                    {
                        "code": "PZX.DB.AC",
                        "title": "Appendectomy",
                    }
                ]
            },
        )

        results = service.search_ichi(query="appendectomy")

        assert len(results) > 0
        assert results[0].title == "Appendectomy"

    def test_get_ichi_by_code(self, service, mock_requests_get):
        """Should get specific ICHI code."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                "code": {
                    "code": "PZX.DB.AC",
                    "title": "Appendectomy",
                }
            },
        )

        result = service.get_ichi("PZX.DB.AC")

        assert result.code == "PZX.DB.AC"


# =============================================================================
# Service Configuration Tests
# =============================================================================


class TestTerminologyServiceConfig:
    """Tests for TerminologyService configuration."""

    def test_service_uses_sha_endpoints(self, mock_sha_auth):
        """Should use endpoints from settings."""
        service = TerminologyService()

        assert service.interventions_endpoint is not None
        assert service.icd11_endpoint is not None

    def test_service_has_timeout(self, mock_sha_auth):
        """Should have configurable timeout."""
        service = TerminologyService()

        assert service.timeout > 0

    def test_service_local_fallback_config(self, mock_sha_auth):
        """Should configure local fallback option."""
        service = TerminologyService(use_local_fallback=True)

        assert service.use_local_fallback is True


# =============================================================================
# Data Class Tests
# =============================================================================


class TestInterventionCode:
    """Tests for InterventionCode data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        data = {
            "code": "SHA-INT-001",
            "name": "General Consultation",
            "price": 500.00,
            "facility_level": 3,
        }

        intervention = InterventionCode.from_api_response(data)

        assert intervention.code == "SHA-INT-001"
        assert intervention.price == 500.00


class TestICD11Code:
    """Tests for ICD11Code data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        data = {
            "code": "1A00",
            "title": "Cholera",
            "chapter": "01",
        }

        code = ICD11Code.from_api_response(data)

        assert code.code == "1A00"
        assert code.title == "Cholera"


class TestDrugProduct:
    """Tests for DrugProduct data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        data = {
            "product_id": "PRD-001",
            "brand_name": "Panadol",
            "generic_name": "Paracetamol",
        }

        product = DrugProduct.from_api_response(data)

        assert product.product_id == "PRD-001"
        assert product.brand_name == "Panadol"


class TestRemoteLOINCCode:
    """Tests for RemoteLOINCCode data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        data = {
            "loinc_num": "2345-7",
            "component": "Glucose",
            "long_common_name": "Glucose [Mass/volume] in Serum or Plasma",
        }

        code = RemoteLOINCCode.from_api_response(data)

        assert code.loinc_num == "2345-7"
        assert code.component == "Glucose"


class TestICHICode:
    """Tests for ICHICode data class."""

    def test_from_api_response(self):
        """Should create from API response."""
        data = {
            "code": "PZX.DB.AC",
            "title": "Appendectomy",
        }

        code = ICHICode.from_api_response(data)

        assert code.code == "PZX.DB.AC"
        assert code.title == "Appendectomy"
