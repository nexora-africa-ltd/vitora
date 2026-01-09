"""
Tests for Client Registry Service.

TDD GREEN PHASE: These tests verify the implemented ClientRegistryService
integrates correctly with Kenya Digital Superhighway Client Registry APIs.

APIs Covered:
- POST /v3/uat-cr-registration - Register new client
- GET /v3/client-registry/fetch-client - Fetch client by ID
- PUT /v3/update-client - Update existing client

Reference: docs/dha-api-usage-analysis.md
"""

import pytest # type: ignore
from unittest.mock import Mock, patch
from datetime import date
from django.conf import settings

from hmis.apps.billing.services.client_registry import (
    ClientRegistryService,
    ClientRegistryClient,
    ClientRegistryError,
    ClientNotFoundError,
    ClientRegistrationError,
    DuplicateClientError,
)


# =============================================================================
# Service Configuration Tests
# =============================================================================

class TestClientRegistryServiceInit:
    """Tests for ClientRegistryService initialization."""

    def test_service_initializes_with_settings(self):
        """Should initialize with Django settings."""
        service = ClientRegistryService()
        
        assert service.api_base_url == settings.SHA_API_BASE_URL.rstrip('/')
        assert service.timeout > 0
        assert service.auth_service is not None

    def test_service_uses_sha_endpoints(self):
        """Should use endpoints from SHA_ENDPOINTS settings."""
        service = ClientRegistryService()
        
        # Verify endpoints are set (from settings or defaults)
        assert service.fetch_endpoint is not None
        assert service.register_endpoint is not None
        assert service.update_endpoint is not None

    def test_service_is_configured_check(self):
        """Should report configuration status."""
        service = ClientRegistryService()
        
        # Service should be configured if auth is configured
        result = service.is_configured()
        assert isinstance(result, bool)


# =============================================================================
# Fetch Client Tests
# =============================================================================

class TestFetchClient:
    """Tests for fetching clients from Client Registry."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create ClientRegistryService instance with mocked auth."""
        return ClientRegistryService()

    def test_fetch_client_by_national_id(self, service, mock_requests_get):
        """Should fetch client using National ID."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-12345678',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'date_of_birth': '1990-01-15',
                    'gender': 'M',
                    'national_id': '12345678',
                }
            }
        )
        
        result = service.fetch_client(national_id='12345678')
        
        assert result is not None
        assert result.client_number == 'CR-12345678'
        assert result.first_name == 'John'
        assert result.last_name == 'Doe'
        mock_requests_get.assert_called_once()

    def test_fetch_client_by_client_number(self, service, mock_requests_get):
        """Should fetch client using CR client number."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-87654321',
                    'first_name': 'Jane',
                    'last_name': 'Smith',
                    'date_of_birth': '1985-06-20',
                    'gender': 'F',
                }
            }
        )
        
        result = service.fetch_client(client_number='CR-87654321')
        
        assert result is not None
        assert result.client_number == 'CR-87654321'

    def test_fetch_client_by_huduma_number(self, service, mock_requests_get):
        """Should fetch client using Huduma Namba."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-11111111',
                    'first_name': 'Peter',
                    'last_name': 'Kamau',
                    'date_of_birth': '1988-03-10',
                    'gender': 'M',
                    'huduma_number': 'HN-123456',
                }
            }
        )
        
        result = service.fetch_client(huduma_number='HN-123456')
        
        assert result is not None
        assert result.client_number == 'CR-11111111'

    def test_fetch_client_by_passport(self, service, mock_requests_get):
        """Should fetch client using passport number."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-22222222',
                    'first_name': 'Mary',
                    'last_name': 'Johnson',
                    'date_of_birth': '1992-11-25',
                    'gender': 'F',
                    'passport_number': 'AB1234567',
                }
            }
        )
        
        result = service.fetch_client(passport_number='AB1234567')
        
        assert result is not None
        assert result.client_number == 'CR-22222222'

    def test_fetch_client_not_found_returns_none(self, service, mock_requests_get):
        """Should return None when client not found."""
        mock_requests_get.return_value = Mock(
            status_code=404,
            json=lambda: {'message': 'Client not found'}
        )
        
        result = service.fetch_client(national_id='99999999')
        
        assert result is None

    def test_fetch_client_requires_identifier(self, service):
        """Should raise error if no identifier provided."""
        with pytest.raises(ValueError) as exc_info:
            service.fetch_client()
        
        assert 'identifier' in str(exc_info.value).lower()

    def test_fetch_client_auth_failure(self, service, mock_requests_get):
        """Should raise error on auth failure."""
        mock_requests_get.return_value = Mock(status_code=401)
        
        with pytest.raises(ClientRegistryError) as exc_info:
            service.fetch_client(national_id='12345678')
        
        assert exc_info.value.status_code == 401

    def test_fetch_client_timeout(self, service, mock_requests_get):
        """Should handle timeout gracefully."""
        import requests as req
        mock_requests_get.side_effect = req.Timeout()
        
        with pytest.raises(ClientRegistryError) as exc_info:
            service.fetch_client(national_id='12345678')
        
        assert 'timed out' in str(exc_info.value).lower() or 'timeout' in str(exc_info.value).lower()

    def test_client_data_parsing(self, service, mock_requests_get):
        """Should correctly parse client data from response."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-33333333',
                    'first_name': 'Alice',
                    'middle_name': 'Wanjiku',
                    'last_name': 'Njoroge',
                    'date_of_birth': '1995-07-15',
                    'gender': 'F',
                    'national_id': '33333333',
                    'phone_number': '0712345678',
                    'email': 'alice@example.com',
                    'county_of_residence': 'Nairobi',
                }
            }
        )
        
        result = service.fetch_client(national_id='33333333')
        
        assert result.full_name == 'Alice Wanjiku Njoroge'
        assert result.phone_number == '0712345678'
        assert result.email == 'alice@example.com'


# =============================================================================
# Register Client Tests
# =============================================================================

class TestRegisterClient:
    """Tests for registering clients in Client Registry."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create ClientRegistryService instance with mocked auth."""
        return ClientRegistryService()

    def test_register_client_success(self, service, mock_requests_post):
        """Should register new client and return client number."""
        mock_requests_post.return_value = Mock(
            status_code=201,
            json=lambda: {
                'client_number': 'CR-NEW12345',
                'first_name': 'John',
                'last_name': 'Doe',
            }
        )
        
        result = service.register_client(
            first_name='John',
            last_name='Doe',
            date_of_birth='1990-01-15',
            gender='M',
            national_id='12345678',
        )
        
        assert result.client_number == 'CR-NEW12345'
        mock_requests_post.assert_called_once()

    def test_register_client_with_all_fields(self, service, mock_requests_post):
        """Should include all optional fields in registration."""
        mock_requests_post.return_value = Mock(
            status_code=201,
            json=lambda: {
                'client_number': 'CR-FULL12345',
            }
        )
        
        result = service.register_client(
            first_name='Jane',
            last_name='Smith',
            middle_name='Wambui',
            date_of_birth='1985-06-20',
            gender='F',
            national_id='87654321',
            phone_number='0722334455',
            email='jane@example.com',
            county_of_residence='Nairobi',
            sub_county_of_residence='Westlands',
        )
        
        assert result.client_number == 'CR-FULL12345'
        
        # Verify all fields were sent
        call_kwargs = mock_requests_post.call_args
        json_data = call_kwargs.kwargs.get('json', call_kwargs[1].get('json', {}))
        assert json_data.get('middle_name') == 'Wambui'

    def test_register_client_validates_required_fields(self, service):
        """Should validate required fields."""
        with pytest.raises(ClientRegistrationError) as exc_info:
            service.register_client(
                first_name='John',
                last_name='',  # Empty
                date_of_birth='1990-01-15',
                gender='M',
            )
        
        # Should indicate validation error
        assert exc_info.value.validation_errors or 'required' in str(exc_info.value).lower()

    def test_register_client_validates_gender(self, service):
        """Should validate gender value."""
        with pytest.raises(ClientRegistrationError) as exc_info:
            service.register_client(
                first_name='John',
                last_name='Doe',
                date_of_birth='1990-01-15',
                gender='X',  # Invalid
            )
        
        assert 'gender' in str(exc_info.value).lower()

    def test_register_client_handles_duplicate(self, service, mock_requests_post):
        """Should handle duplicate client error."""
        mock_requests_post.return_value = Mock(
            status_code=409,
            json=lambda: {
                'message': 'Client already exists',
                'client_number': 'CR-EXISTING',
            }
        )
        
        with pytest.raises(DuplicateClientError) as exc_info:
            service.register_client(
                first_name='John',
                last_name='Doe',
                date_of_birth='1990-01-15',
                gender='M',
                national_id='12345678',
            )
        
        assert exc_info.value.existing_client_number == 'CR-EXISTING'

    def test_register_client_with_date_object(self, service, mock_requests_post):
        """Should accept date object for date_of_birth."""
        mock_requests_post.return_value = Mock(
            status_code=201,
            json=lambda: {'client_number': 'CR-DATE12345'}
        )
        
        result = service.register_client(
            first_name='John',
            last_name='Doe',
            date_of_birth=date(1990, 1, 15),
            gender='M',
        )
        
        assert result.client_number == 'CR-DATE12345'


# =============================================================================
# Update Client Tests
# =============================================================================

class TestUpdateClient:
    """Tests for updating clients in Client Registry."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create ClientRegistryService instance with mocked auth."""
        return ClientRegistryService()

    def test_update_client_success(self, service, mock_requests_put):
        """Should update client and return updated data."""
        mock_requests_put.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-12345678',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'date_of_birth': '1990-01-15',
                    'gender': 'M',
                    'phone_number': '0799999999',  # Updated
                }
            }
        )
        
        result = service.update_client(
            client_number='CR-12345678',
            phone_number='0799999999',
        )
        
        assert result.phone_number == '0799999999'

    def test_update_client_requires_client_number(self, service):
        """Should require client_number."""
        with pytest.raises(ValueError) as exc_info:
            service.update_client(
                client_number='',  # Empty
                phone_number='0799999999',
            )
        
        assert 'client_number' in str(exc_info.value).lower()

    def test_update_client_requires_at_least_one_update(self, service):
        """Should require at least one field to update."""
        with pytest.raises(ValueError) as exc_info:
            service.update_client(client_number='CR-12345678')
        
        assert 'update' in str(exc_info.value).lower()

    def test_update_client_not_found(self, service, mock_requests_put):
        """Should raise error if client not found."""
        mock_requests_put.return_value = Mock(status_code=404)
        
        with pytest.raises(ClientNotFoundError) as exc_info:
            service.update_client(
                client_number='CR-NOTEXIST',
                phone_number='0799999999',
            )
        
        assert 'CR-NOTEXIST' in str(exc_info.value)


# =============================================================================
# Data Class Tests
# =============================================================================

class TestClientRegistryClient:
    """Tests for ClientRegistryClient data class."""

    def test_full_name_without_middle(self):
        """Should format full name without middle name."""
        client = ClientRegistryClient(
            client_number='CR-12345',
            first_name='John',
            last_name='Doe',
            date_of_birth=date(1990, 1, 15),
            gender='M',
        )
        
        assert client.full_name == 'John Doe'

    def test_full_name_with_middle(self):
        """Should format full name with middle name."""
        client = ClientRegistryClient(
            client_number='CR-12345',
            first_name='John',
            middle_name='Kamau',
            last_name='Doe',
            date_of_birth=date(1990, 1, 15),
            gender='M',
        )
        
        assert client.full_name == 'John Kamau Doe'

    def test_age_calculation(self):
        """Should calculate age from date of birth."""
        client = ClientRegistryClient(
            client_number='CR-12345',
            first_name='John',
            last_name='Doe',
            date_of_birth=date(1990, 1, 15),
            gender='M',
        )
        
        # Age should be calculated (will vary based on current date)
        assert isinstance(client.age, int)
        assert client.age > 0

    def test_from_api_response(self):
        """Should create instance from API response."""
        api_data = {
            'client_number': 'CR-98765',
            'first_name': 'Jane',
            'last_name': 'Smith',
            'date_of_birth': '1985-06-20',
            'gender': 'F',
            'phone_number': '0712345678',
        }
        
        client = ClientRegistryClient.from_api_response(api_data)
        
        assert client.client_number == 'CR-98765'
        assert client.first_name == 'Jane'
        assert client.date_of_birth == date(1985, 6, 20)
        assert client.raw_data == api_data
