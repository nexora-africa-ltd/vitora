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
import requests
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

    def test_fetch_client_decrypts_pii_payload(self, service, mock_requests_get):
        """Should decrypt DHA `_pii` payload and parse decrypted client fields."""

        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'message': {
                    'total': 1,
                    'result': [
                        {
                            '_pii': 'dummy-encrypted-pii',
                        }
                    ],
                }
            },
        )

        decrypted = {
            'id': 'CR0000000000001-1',
            'first_name': 'Omar',
            'middle_name': 'Abdullahi',
            'last_name': 'Mohamud',
            'gender': 'Male',
            'date_of_birth': '1977-01-01',
            'identification_type': 'National ID',
            'identification_number': '12345678',
        }

        with patch(
            'hmis.apps.billing.services.client_registry.maybe_decrypt_client_registry_item',
            return_value=decrypted,
        ) as mock_decrypt:
            result = service.fetch_client(national_id='12345678')

        assert result is not None
        assert result.client_number == 'CR0000000000001-1'
        assert result.full_name == 'Omar Abdullahi Mohamud'
        assert result.gender == 'M'
        assert result.national_id == '12345678'
        mock_decrypt.assert_called_once()


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
    """Tests for updating clients in Client Registry.
    
    API: PUT /v3/update-client
    
    Updatable fields per DHA docs:
    - email: Patient email address
    - phone: Patient phone number  
    - county: Patient county of residence
    - sub_county: Patient sub-county of residence
    """

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

    def test_update_client_email(self, service, mock_requests_put):
        """Should update client email address."""
        mock_requests_put.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-12345678',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'date_of_birth': '1990-01-15',
                    'gender': 'M',
                    'email': 'john.doe@example.com',
                }
            }
        )
        
        result = service.update_client(
            client_number='CR-12345678',
            email='john.doe@example.com',
        )
        
        assert result.email == 'john.doe@example.com'
        mock_requests_put.assert_called_once()
        # Verify request body contains email
        call_kwargs = mock_requests_put.call_args
        assert 'email' in str(call_kwargs)

    def test_update_client_county_and_sub_county(self, service, mock_requests_put):
        """Should update client county and sub_county of residence."""
        mock_requests_put.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-12345678',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'date_of_birth': '1990-01-15',
                    'gender': 'M',
                    'county': 'Nairobi',
                    'sub_county': 'Westlands',
                }
            }
        )
        
        result = service.update_client(
            client_number='CR-12345678',
            county_of_residence='Nairobi',
            sub_county_of_residence='Westlands',
        )
        
        assert result.county_of_residence == 'Nairobi'
        assert result.sub_county_of_residence == 'Westlands'

    def test_update_client_multiple_fields(self, service, mock_requests_put):
        """Should update multiple fields in a single request."""
        mock_requests_put.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-12345678',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'date_of_birth': '1990-01-15',
                    'gender': 'M',
                    'phone_number': '0722123456',
                    'email': 'john@example.com',
                    'county': 'Mombasa',
                    'sub_county': 'Nyali',
                }
            }
        )
        
        result = service.update_client(
            client_number='CR-12345678',
            phone_number='0722123456',
            email='john@example.com',
            county_of_residence='Mombasa',
            sub_county_of_residence='Nyali',
        )
        
        assert result.phone_number == '0722123456'
        assert result.email == 'john@example.com'
        assert result.county_of_residence == 'Mombasa'
        assert result.sub_county_of_residence == 'Nyali'

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

    def test_update_client_bad_request(self, service, mock_requests_put):
        """Should handle 400 Bad Request for invalid parameters."""
        mock_response = Mock(
            status_code=400,
            json=lambda: {'error': 'Invalid email format'}
        )
        mock_response.raise_for_status.side_effect = requests.HTTPError(response=mock_response)
        mock_requests_put.return_value = mock_response
        
        with pytest.raises(ClientRegistryError) as exc_info:
            service.update_client(
                client_number='CR-12345678',
                email='invalid-email',
            )
        
        # Should capture the error
        assert exc_info.value is not None

    def test_update_client_unauthorized(self, service, mock_requests_put):
        """Should handle 401 Unauthorized for invalid credentials."""
        mock_requests_put.return_value = Mock(status_code=401)
        
        with pytest.raises(ClientRegistryError) as exc_info:
            service.update_client(
                client_number='CR-12345678',
                phone_number='0799999999',
            )
        
        # Should indicate auth failure
        assert 'auth' in str(exc_info.value).lower() or '401' in str(exc_info.value)

    def test_update_client_uses_correct_endpoint(self, service, mock_requests_put):
        """Should call PUT /v3/update-client endpoint."""
        mock_requests_put.return_value = Mock(
            status_code=200,
            json=lambda: {
                'client': {
                    'client_number': 'CR-12345678',
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'date_of_birth': '1990-01-15',
                    'gender': 'M',
                    'phone_number': '0799999999',
                }
            }
        )
        
        service.update_client(
            client_number='CR-12345678',
            phone_number='0799999999',
        )
        
        # Verify correct endpoint was called
        call_args = mock_requests_put.call_args
        assert '/v3/update-client' in call_args[0][0] or 'update-client' in str(call_args)


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

    def test_from_api_response_with_dha_format(self):
        """Should parse DHA official API format with full gender words."""
        # DHA API returns gender as full words and 'id' for client number
        api_data = {
            'id': 'CR000000000000-2',
            'first_name': 'Jane ',  # Note trailing space
            'middle_name': 'Doe',
            'last_name': 'Test',
            'date_of_birth': '2010-05-11',
            'gender': 'Female',  # Full word, not 'F'
            'identification_type': 'National ID',
            'identification_number': '32440686',
            'phone': '0712345678',  # DHA uses 'phone' not 'phone_number'
            'county': 'Nairobi',  # DHA uses 'county' not 'county_of_residence'
            'sub_county': 'Kasarani',
            'ward': 'kasarani',
        }
        
        client = ClientRegistryClient.from_api_response(api_data)
        
        assert client.client_number == 'CR000000000000-2'
        assert client.first_name == 'Jane'  # Should strip whitespace
        assert client.middle_name == 'Doe'
        assert client.last_name == 'Test'
        assert client.date_of_birth == date(2010, 5, 11)
        assert client.gender == 'F'  # Should convert 'Female' to 'F'
        assert client.national_id == '32440686'
        assert client.phone_number == '0712345678'
        assert client.county_of_residence == 'Nairobi'
        assert client.sub_county_of_residence == 'Kasarani'
        assert client.ward_of_residence == 'kasarani'

    def test_from_api_response_gender_mapping(self):
        """Should correctly map all gender formats."""
        # Test 'Male' -> 'M'
        male_data = {'id': 'CR1', 'first_name': 'Test', 'last_name': 'User', 
                    'date_of_birth': '1990-01-01', 'gender': 'Male'}
        assert ClientRegistryClient.from_api_response(male_data).gender == 'M'
        
        # Test 'Female' -> 'F'
        female_data = {'id': 'CR2', 'first_name': 'Test', 'last_name': 'User',
                      'date_of_birth': '1990-01-01', 'gender': 'Female'}
        assert ClientRegistryClient.from_api_response(female_data).gender == 'F'
        
        # Test 'Other' -> 'O'
        other_data = {'id': 'CR3', 'first_name': 'Test', 'last_name': 'User',
                     'date_of_birth': '1990-01-01', 'gender': 'Other'}
        assert ClientRegistryClient.from_api_response(other_data).gender == 'O'
        
        # Test lowercase also works
        lowercase_data = {'id': 'CR4', 'first_name': 'Test', 'last_name': 'User',
                         'date_of_birth': '1990-01-01', 'gender': 'male'}
        assert ClientRegistryClient.from_api_response(lowercase_data).gender == 'M'


# =============================================================================
# DHA Official API Format Tests
# =============================================================================

class TestDHAOfficialFormatParsing:
    """Tests for parsing official DHA API response format."""

    @pytest.fixture
    def service(self, mock_sha_auth):
        """Create ClientRegistryService instance with mocked auth."""
        return ClientRegistryService()

    def test_fetch_client_dha_official_format(self, service, mock_requests_get):
        """Should correctly parse DHA official response format with message.result array."""
        # This is the actual format from DHA API
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'message': {
                    'total': 1,
                    'result': [
                        {
                            'id': 'CR000000000000-2',
                            'resourceType': 'Patient',
                            'first_name': 'Jane ',
                            'middle_name': 'Doe',
                            'last_name': 'Test',
                            'gender': 'Female',
                            'date_of_birth': '2010-05-11',
                            'identification_type': 'National ID',
                            'identification_number': '32440686',
                            'phone': '',
                            'county': 'Nairobi',
                            'sub_county': 'Kasarani',
                            'ward': 'kasarani',
                        }
                    ]
                }
            }
        )
        
        result = service.fetch_client(national_id='32440686')
        
        assert result is not None
        assert result.client_number == 'CR000000000000-2'
        assert result.first_name == 'Jane'
        assert result.last_name == 'Test'
        assert result.gender == 'F'
        assert result.national_id == '32440686'
        assert result.county_of_residence == 'Nairobi'

    def test_fetch_client_dha_not_found(self, service, mock_requests_get):
        """Should return None when DHA returns empty result array."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'message': {
                    'total': 0,
                    'result': []
                }
            }
        )
        
        result = service.fetch_client(national_id='99999999')
        
        assert result is None

    def test_fetch_client_dha_multiple_results(self, service, mock_requests_get):
        """Should return first client when DHA returns multiple results."""
        mock_requests_get.return_value = Mock(
            status_code=200,
            json=lambda: {
                'message': {
                    'total': 2,
                    'result': [
                        {
                            'id': 'CR000000000001-1',
                            'first_name': 'First',
                            'last_name': 'Person',
                            'date_of_birth': '1990-01-01',
                            'gender': 'Male',
                        },
                        {
                            'id': 'CR000000000002-2',
                            'first_name': 'Second',
                            'last_name': 'Person',
                            'date_of_birth': '1991-02-02',
                            'gender': 'Female',
                        }
                    ]
                }
            }
        )
        
        result = service.fetch_client(national_id='12345678')
        
        assert result is not None
        assert result.client_number == 'CR000000000001-1'
        assert result.first_name == 'First'
