"""Tests for ICD-11 Local API Service."""

import pytest
from unittest import mock

from hmis.apps.billing.services.icd11_local import ICD11Code, ICD11LocalService


class TestICD11Code:
    """Tests for ICD11Code dataclass."""

    def test_create_icd11_code(self):
        """Should create ICD11Code with required fields."""
        code = ICD11Code(
            code="1A00",
            title="Cholera",
            entity_id="http://id.who.int/icd/entity/123456",
        )
        assert code.code == "1A00"
        assert code.title == "Cholera"
        assert code.entity_id == "http://id.who.int/icd/entity/123456"

    def test_create_icd11_code_with_optional_fields(self):
        """Should create ICD11Code with optional fields."""
        code = ICD11Code(
            code="1A00",
            title="Cholera",
            entity_id="http://id.who.int/icd/entity/123456",
            chapter="Infectious diseases",
            browser_url="https://icd.who.int/browse/2025-01/mms/en#1A00",
            is_leaf=True,
        )
        assert code.chapter == "Infectious diseases"
        assert code.browser_url == "https://icd.who.int/browse/2025-01/mms/en#1A00"
        assert code.is_leaf is True

    def test_icd11_code_defaults(self):
        """Should have correct default values."""
        code = ICD11Code(
            code="1A00",
            title="Cholera",
            entity_id="123",
        )
        assert code.chapter is None
        assert code.browser_url is None
        assert code.is_leaf is False

    def test_to_dict(self):
        """Should convert to dictionary for serialization."""
        code = ICD11Code(
            code="1A00",
            title="Cholera",
            entity_id="http://id.who.int/icd/entity/123456",
            chapter="Infectious diseases",
            browser_url="https://icd.who.int/browse",
            is_leaf=True,
        )
        result = code.to_dict()
        
        assert result == {
            "code": "1A00",
            "title": "Cholera",
            "entity_id": "http://id.who.int/icd/entity/123456",
            "chapter": "Infectious diseases",
            "browser_url": "https://icd.who.int/browse",
            "is_leaf": True,
        }

    def test_to_dict_with_none_values(self):
        """Should include None values in dictionary."""
        code = ICD11Code(
            code="1A00",
            title="Cholera",
            entity_id="123",
        )
        result = code.to_dict()
        
        assert result["chapter"] is None
        assert result["browser_url"] is None
        assert result["is_leaf"] is False


class TestICD11LocalService:
    """Tests for ICD11LocalService."""

    def test_service_initialization(self):
        """Should initialize with default settings."""
        service = ICD11LocalService()
        assert service.base_url == "http://localhost:5080"
        assert service.timeout == 10
        assert service.api_version == "v2"
        assert service.language == "en"

    def test_service_initialization_custom_url(self):
        """Should use custom URL from settings."""
        with mock.patch(
            "hmis.apps.billing.services.icd11_local.settings",
            ICD11_LOCAL_API_URL="http://custom:8080",
            ICD11_API_TIMEOUT=30,
        ):
            service = ICD11LocalService()
            assert service.base_url == "http://custom:8080"
            assert service.timeout == 30

    def test_get_headers(self):
        """Should return required headers for WHO ICD-11 API."""
        service = ICD11LocalService()
        headers = service._get_headers()
        
        assert headers["API-Version"] == "v2"
        assert headers["Accept-Language"] == "en"
        assert headers["Accept"] == "application/json"

    def test_strip_html_removes_tags(self):
        """Should remove HTML tags from text."""
        service = ICD11LocalService()
        
        result = service._strip_html("<em class='found'>Cholera</em>")
        assert result == "Cholera"

    def test_strip_html_handles_multiple_tags(self):
        """Should handle multiple HTML tags."""
        service = ICD11LocalService()
        
        result = service._strip_html("<b>Bold</b> and <i>italic</i>")
        assert result == "Bold and italic"

    def test_strip_html_plain_text_unchanged(self):
        """Should leave plain text unchanged."""
        service = ICD11LocalService()
        
        result = service._strip_html("Plain text without tags")
        assert result == "Plain text without tags"

    def test_strip_html_empty_string(self):
        """Should handle empty string."""
        service = ICD11LocalService()
        
        result = service._strip_html("")
        assert result == ""

    def test_extract_code_from_url(self):
        """Should return None (extraction requires API call)."""
        service = ICD11LocalService()
        
        result = service._extract_code_from_url("http://id.who.int/icd/entity/123")
        assert result is None

    def test_search_empty_query_returns_empty(self):
        """Should return empty list for empty query."""
        service = ICD11LocalService()
        
        result = service.search("")
        assert result == []

    def test_search_short_query_returns_empty(self):
        """Should return empty list for query less than 2 chars."""
        service = ICD11LocalService()
        
        result = service.search("a")
        assert result == []

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_search_api_error_returns_empty(self, mock_get):
        """Should return empty list on API error."""
        import requests
        mock_get.side_effect = requests.exceptions.ConnectionError("Connection refused")
        
        service = ICD11LocalService()
        result = service.search("malaria")
        
        assert result == []

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_search_success(self, mock_get):
        """Should parse search results correctly."""
        mock_response = mock.Mock()
        mock_response.status_code = 200
        mock_response.raise_for_status = mock.Mock()
        mock_response.json.return_value = {
            "destinationEntities": [
                {
                    "id": "http://id.who.int/icd/entity/123",
                    "title": "Malaria",
                    "chapter": "Infectious diseases",
                    "theCode": "1F40",
                    "isLeaf": True,
                },
            ]
        }
        mock_get.return_value = mock_response
        
        service = ICD11LocalService()
        results = service.search("malaria", limit=10)
        
        assert len(results) == 1
        assert results[0].code == "1F40"
        assert results[0].title == "Malaria"

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_get_by_code_not_found(self, mock_get):
        """Should return None for 404 response."""
        mock_response = mock.Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        service = ICD11LocalService()
        result = service.get_by_code("INVALID")
        
        assert result is None

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_get_by_code_api_error(self, mock_get):
        """Should return None on API error."""
        import requests
        mock_get.side_effect = requests.exceptions.Timeout("Request timed out")
        
        service = ICD11LocalService()
        result = service.get_by_code("1A00")
        
        assert result is None

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_get_by_code_success(self, mock_get):
        """Should return ICD11Code for valid code."""
        mock_response = mock.Mock()
        mock_response.status_code = 200
        mock_response.raise_for_status = mock.Mock()
        mock_response.json.return_value = {
            "stemId": "http://id.who.int/icd/entity/123",
            "title": {"@value": "Cholera"},
            "browserUrl": "https://icd.who.int/browse/1A00",
        }
        mock_get.return_value = mock_response
        
        service = ICD11LocalService()
        result = service.get_by_code("1A00")
        
        assert result is not None
        assert result.code == "1A00"
        assert result.title == "Cholera"

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_is_available_success(self, mock_get):
        """Should return True when API is available."""
        mock_response = mock.Mock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        service = ICD11LocalService()
        result = service.is_available()
        
        assert result is True

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_is_available_failure(self, mock_get):
        """Should return False when API is unavailable."""
        mock_get.side_effect = Exception("Connection refused")
        
        service = ICD11LocalService()
        result = service.is_available()
        
        assert result is False

    @mock.patch("hmis.apps.billing.services.icd11_local.requests.get")
    def test_is_available_non_200_status(self, mock_get):
        """Should return False for non-200 status."""
        mock_response = mock.Mock()
        mock_response.status_code = 503
        mock_get.return_value = mock_response
        
        service = ICD11LocalService()
        result = service.is_available()
        
        assert result is False
