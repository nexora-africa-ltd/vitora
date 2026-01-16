"""
Tests for M-Pesa Service.

Following TDD approach - tests for MpesaService class covering:
- OAuth token management
- Phone number formatting/validation
- STK Push initiation
- Callback processing
- Transaction status queries
- Error handling and timeouts
"""
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest  # type: ignore
from django.core.exceptions import ValidationError

from hmis.apps.billing.services.mpesa import MpesaService


@pytest.mark.django_db
class TestMpesaServicePhoneFormatting:
    """Tests for phone number formatting and validation."""

    def test_format_phone_07xx_format(self):
        """Test formatting 07XX phone numbers to 254XX format."""
        service = MpesaService()

        result = service.format_phone('0712345678')

        assert result == '254712345678'

    def test_format_phone_01xx_format(self):
        """Test formatting 01XX phone numbers (Safaricom new prefix)."""
        service = MpesaService()

        result = service.format_phone('0112345678')

        assert result == '254112345678'

    def test_format_phone_254xx_format(self):
        """Test phone number already in 254XX format passes through."""
        service = MpesaService()

        result = service.format_phone('254712345678')

        assert result == '254712345678'

    def test_format_phone_plus254_format(self):
        """Test formatting +254XX phone numbers (removes +)."""
        service = MpesaService()

        result = service.format_phone('+254712345678')

        assert result == '254712345678'

    def test_format_phone_7xx_format(self):
        """Test formatting 7XX phone numbers (9 digits without country code)."""
        service = MpesaService()

        result = service.format_phone('712345678')

        assert result == '254712345678'

    def test_format_phone_1xx_format(self):
        """Test formatting 1XX phone numbers (Safaricom new prefix, 9 digits)."""
        service = MpesaService()

        result = service.format_phone('112345678')

        assert result == '254112345678'

    def test_format_phone_with_spaces(self):
        """Test formatting phone numbers with spaces."""
        service = MpesaService()

        result = service.format_phone('0712 345 678')

        assert result == '254712345678'

    def test_format_phone_with_dashes(self):
        """Test formatting phone numbers with dashes."""
        service = MpesaService()

        result = service.format_phone('0712-345-678')

        assert result == '254712345678'

    def test_format_phone_with_parentheses(self):
        """Test formatting phone numbers with parentheses."""
        service = MpesaService()

        result = service.format_phone('(0712) 345678')

        assert result == '254712345678'

    def test_format_phone_invalid_length_raises_error(self):
        """Test that invalid phone number length raises ValidationError."""
        service = MpesaService()

        with pytest.raises(ValidationError) as exc:
            service.format_phone('071234567')  # 9 digits starting with 0

        assert 'valid Kenyan number' in str(exc.value)

    def test_format_phone_invalid_prefix_raises_error(self):
        """Test that invalid phone number prefix raises ValidationError."""
        service = MpesaService()

        with pytest.raises(ValidationError) as exc:
            service.format_phone('123456789012')  # Doesn't resolve to 254

        assert 'valid Kenyan number' in str(exc.value)

    def test_format_phone_with_letters_raises_error(self):
        """Test that phone number with letters raises ValidationError."""
        service = MpesaService()

        with pytest.raises(ValidationError) as exc:
            service.format_phone('07123ABCD8')

        assert 'only digits' in str(exc.value)


@pytest.mark.django_db
class TestMpesaServiceAccessToken:
    """Tests for OAuth access token management."""

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_get_access_token_success(self, mock_get):
        """Test successful OAuth token retrieval."""
        # Arrange
        mock_response = Mock()
        mock_response.json.return_value = {
            'access_token': 'test_access_token_12345',
            'expires_in': '3600'
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        service = MpesaService()

        # Act
        token = service.get_access_token()

        # Assert
        assert token == 'test_access_token_12345'
        mock_get.assert_called_once()

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_get_access_token_caching(self, mock_get):
        """Test that access token is cached and reused."""
        # Arrange
        mock_response = Mock()
        mock_response.json.return_value = {
            'access_token': 'cached_token',
            'expires_in': '3600'
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        service = MpesaService()

        # Act - call twice
        token1 = service.get_access_token()
        token2 = service.get_access_token()

        # Assert - should only call API once (second call uses cache)
        assert token1 == token2 == 'cached_token'
        assert mock_get.call_count == 1

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_get_access_token_invalid_credentials(self, mock_get):
        """Test OAuth failure with invalid credentials raises ValidationError."""
        import requests as req_lib

        # Arrange - use RequestException which is caught by the service
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = req_lib.HTTPError('401 Unauthorized')
        mock_get.return_value = mock_response

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.get_access_token()

        assert 'M-Pesa OAuth failed' in str(exc.value)

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_get_access_token_network_error(self, mock_get):
        """Test network error during OAuth raises ValidationError."""
        import requests as req_lib

        # Arrange
        mock_get.side_effect = req_lib.RequestException('Connection timeout')

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.get_access_token()

        assert 'M-Pesa OAuth failed' in str(exc.value)


@pytest.mark.django_db
class TestMpesaServiceSTKPush:
    """Tests for STK Push initiation."""

    @patch('hmis.apps.billing.services.mpesa.requests.post')
    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_stk_push_success(self, mock_get, mock_post):
        """Test successful STK Push initiation."""
        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        # Mock STK Push
        mock_stk = Mock()
        mock_stk.json.return_value = {
            'MerchantRequestID': 'merchant-123',
            'CheckoutRequestID': 'checkout-456',
            'ResponseCode': '0',
            'ResponseDescription': 'Success',
            'CustomerMessage': 'STK initiated'
        }
        mock_stk.raise_for_status = Mock()
        mock_post.return_value = mock_stk

        service = MpesaService()

        # Act
        result = service.initiate_stk_push(
            phone_number='0712345678',
            amount=Decimal('500.00'),
            account_reference='INV-001',
            transaction_desc='Payment'
        )

        # Assert
        assert result['CheckoutRequestID'] == 'checkout-456'
        assert result['ResponseCode'] == '0'

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_stk_push_invalid_phone_format(self, mock_get):
        """Test STK Push with invalid phone number raises ValidationError."""
        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.initiate_stk_push(
                phone_number='invalid',
                amount=Decimal('500.00'),
                account_reference='INV-001',
                transaction_desc='Payment'
            )

        assert 'Phone number' in str(exc.value)

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_stk_push_amount_too_low(self, mock_get):
        """Test STK Push with amount less than 1 KES raises ValidationError."""
        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.initiate_stk_push(
                phone_number='0712345678',
                amount=Decimal('0.50'),
                account_reference='INV-001',
                transaction_desc='Payment'
            )

        assert 'at least 1 KES' in str(exc.value)

    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_stk_push_amount_too_high(self, mock_get):
        """Test STK Push with amount over 150,000 KES raises ValidationError."""
        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.initiate_stk_push(
                phone_number='0712345678',
                amount=Decimal('200000.00'),
                account_reference='INV-001',
                transaction_desc='Payment'
            )

        assert '150,000 KES' in str(exc.value)

    @patch('hmis.apps.billing.services.mpesa.requests.post')
    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_stk_push_api_error(self, mock_get, mock_post):
        """Test STK Push API error raises ValidationError."""
        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        # Mock failed STK Push
        mock_stk = Mock()
        mock_stk.json.return_value = {
            'ResponseCode': '1',
            'ResponseDescription': 'Invalid credentials'
        }
        mock_stk.raise_for_status = Mock()
        mock_post.return_value = mock_stk

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.initiate_stk_push(
                phone_number='0712345678',
                amount=Decimal('500.00'),
                account_reference='INV-001',
                transaction_desc='Payment'
            )

        assert 'STK Push failed' in str(exc.value)

    @patch('hmis.apps.billing.services.mpesa.requests.post')
    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_stk_push_timeout_handling(self, mock_get, mock_post):
        """Test STK Push timeout raises ValidationError."""
        import requests as req_lib

        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        # Mock timeout
        mock_post.side_effect = req_lib.Timeout('Request timed out')

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.initiate_stk_push(
                phone_number='0712345678',
                amount=Decimal('500.00'),
                account_reference='INV-001',
                transaction_desc='Payment'
            )

        assert 'request failed' in str(exc.value)


@pytest.mark.django_db
class TestMpesaServiceCallback:
    """Tests for M-Pesa callback processing."""

    def test_process_callback_success(self):
        """Test processing successful payment callback."""
        service = MpesaService()

        callback_data = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': 'merchant-123',
                    'CheckoutRequestID': 'checkout-456',
                    'ResultCode': 0,
                    'ResultDesc': 'The service request is processed successfully.',
                    'CallbackMetadata': {
                        'Item': [
                            {'Name': 'Amount', 'Value': 500.00},
                            {'Name': 'MpesaReceiptNumber', 'Value': 'MPE123456789'},
                            {'Name': 'TransactionDate', 'Value': 20260103120000},
                            {'Name': 'PhoneNumber', 'Value': 254712345678}
                        ]
                    }
                }
            }
        }

        result = service.process_callback(callback_data)

        assert result['success'] is True
        assert result['result_code'] == 0
        assert result['mpesa_receipt_number'] == 'MPE123456789'
        assert result['amount'] == 500.00

    def test_process_callback_user_cancelled(self):
        """Test processing callback when user cancelled the request."""
        service = MpesaService()

        callback_data = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': 'merchant-123',
                    'CheckoutRequestID': 'checkout-456',
                    'ResultCode': 1032,
                    'ResultDesc': 'Request cancelled by user'
                }
            }
        }

        result = service.process_callback(callback_data)

        assert result['success'] is False
        assert result['result_code'] == 1032
        assert 'cancelled' in result['result_description'].lower()

    def test_process_callback_insufficient_funds(self):
        """Test processing callback when user has insufficient funds."""
        service = MpesaService()

        callback_data = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': 'merchant-123',
                    'CheckoutRequestID': 'checkout-456',
                    'ResultCode': 1,
                    'ResultDesc': 'The balance is insufficient for the transaction'
                }
            }
        }

        result = service.process_callback(callback_data)

        assert result['success'] is False
        assert result['result_code'] == 1

    def test_process_callback_timeout(self):
        """Test processing callback when request times out."""
        service = MpesaService()

        callback_data = {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': 'merchant-123',
                    'CheckoutRequestID': 'checkout-456',
                    'ResultCode': 1037,
                    'ResultDesc': 'DS timeout'
                }
            }
        }

        result = service.process_callback(callback_data)

        assert result['success'] is False
        assert result['result_code'] == 1037

    def test_process_callback_invalid_data(self):
        """Test processing callback with invalid/malformed data returns None values."""
        service = MpesaService()

        # Missing required fields - service handles gracefully with None values
        callback_data = {'invalid': 'data'}

        result = service.process_callback(callback_data)

        # Service returns result with None values instead of raising
        assert result['success'] is False  # result_code is None, so not == 0
        assert result['result_code'] is None
        assert result['merchant_request_id'] is None
        assert result['checkout_request_id'] is None


@pytest.mark.django_db
class TestMpesaServiceTransactionQuery:
    """Tests for transaction status queries."""

    @patch('hmis.apps.billing.services.mpesa.requests.post')
    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_query_transaction_success(self, mock_get, mock_post):
        """Test successful transaction status query."""
        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        # Mock query response
        mock_query = Mock()
        mock_query.json.return_value = {
            'ResponseCode': '0',
            'ResponseDescription': 'Success',
            'MerchantRequestID': 'merchant-123',
            'CheckoutRequestID': 'checkout-456',
            'ResultCode': '0',
            'ResultDesc': 'The service request is processed successfully.'
        }
        mock_query.raise_for_status = Mock()
        mock_post.return_value = mock_query

        service = MpesaService()

        # Act
        result = service.query_transaction_status('checkout-456')

        # Assert
        assert result['ResultCode'] == '0'
        assert result['CheckoutRequestID'] == 'checkout-456'

    @patch('hmis.apps.billing.services.mpesa.requests.post')
    @patch('hmis.apps.billing.services.mpesa.requests.get')
    def test_query_transaction_network_error(self, mock_get, mock_post):
        """Test transaction query network error raises ValidationError."""
        import requests as req_lib

        # Arrange - Mock OAuth
        mock_oauth = Mock()
        mock_oauth.json.return_value = {'access_token': 'token', 'expires_in': '3600'}
        mock_oauth.raise_for_status = Mock()
        mock_get.return_value = mock_oauth

        # Mock network error
        mock_post.side_effect = req_lib.ConnectionError('Network error')

        service = MpesaService()

        # Act & Assert
        with pytest.raises(ValidationError) as exc:
            service.query_transaction_status('checkout-456')

        assert 'query request failed' in str(exc.value)


@pytest.mark.django_db
class TestMpesaServicePasswordGeneration:
    """Tests for M-Pesa password generation."""

    def test_generate_password_format(self):
        """Test that password is correctly base64 encoded."""
        service = MpesaService()
        service.shortcode = '174379'
        service.passkey = 'testpasskey'

        timestamp = '20260103120000'
        password = service.generate_password(timestamp)

        # Password should be base64 encoded
        import base64
        decoded = base64.b64decode(password).decode('ascii')
        assert decoded == '174379testpasskey20260103120000'
