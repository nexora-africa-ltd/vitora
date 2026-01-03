"""
Billing services for Vitora HMIS.

This module contains business logic services for billing operations:
- MpesaService: M-Pesa Daraja API integration for mobile money payments
"""

import base64
from datetime import datetime, timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.core.exceptions import ValidationError


class MpesaService:
    """
    M-Pesa Daraja API integration service.
    
    Handles:
    - OAuth token management with automatic refresh
    - STK Push (Lipa Na M-Pesa Online) initiation
    - Payment callback processing
    - Transaction status queries
    
    Configuration in settings:
    - MPESA_CONSUMER_KEY
    - MPESA_CONSUMER_SECRET
    - MPESA_PASSKEY
    - MPESA_SHORTCODE
    - MPESA_CALLBACK_URL
    """

    # Request timeout in seconds
    REQUEST_TIMEOUT = 30

    def __init__(self):
        """Initialize M-Pesa service with sandbox credentials."""
        self.consumer_key = getattr(settings, 'MPESA_CONSUMER_KEY', '')
        self.consumer_secret = getattr(settings, 'MPESA_CONSUMER_SECRET', '')
        self.passkey = getattr(settings, 'MPESA_PASSKEY', '')
        self.shortcode = getattr(settings, 'MPESA_SHORTCODE', '174379')
        self.callback_url = getattr(settings, 'MPESA_CALLBACK_URL', 'https://example.com/api/billing/mpesa/callback/')

        # Daraja API endpoints (sandbox)
        self.base_url = getattr(settings, 'MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')
        self.oauth_url = f'{self.base_url}/oauth/v1/generate?grant_type=client_credentials'
        self.stk_push_url = f'{self.base_url}/mpesa/stkpush/v1/processrequest'
        self.query_url = f'{self.base_url}/mpesa/stkpushquery/v1/query'

        self._access_token = None
        self._token_expires_at = None

    def format_phone(self, phone: str) -> str:
        """
        Normalize phone number to 254XXXXXXXXX format.
        
        Handles various Kenyan phone number formats:
        - 0712345678 → 254712345678
        - +254712345678 → 254712345678
        - 254712345678 → 254712345678
        - 712345678 → 254712345678
        
        Args:
            phone: Phone number in any common format
            
        Returns:
            str: Phone number in 254XXXXXXXXX format
            
        Raises:
            ValidationError: If phone number is invalid
        """
        # Remove whitespace, dashes, and parentheses
        phone = phone.strip().replace(' ', '').replace('-', '').replace('(', '').replace(')', '')

        # Remove leading + if present
        if phone.startswith('+'):
            phone = phone[1:]

        # Handle 07XX format (Kenya local)
        if phone.startswith('0') and len(phone) == 10:
            phone = '254' + phone[1:]

        # Handle 7XX format (missing prefix)
        elif len(phone) == 9 and phone[0] in '17':
            phone = '254' + phone

        # Validate final format
        if not phone.startswith('254'):
            raise ValidationError('Phone number must be a valid Kenyan number')

        if len(phone) != 12:
            raise ValidationError('Phone number must be 12 digits (254XXXXXXXXX)')

        if not phone.isdigit():
            raise ValidationError('Phone number must contain only digits')

        return phone

    def get_access_token(self) -> str:
        """
        Get OAuth access token from Daraja API.
        
        Caches token until expiration, then refreshes automatically.
        
        Returns:
            str: Valid OAuth access token
            
        Raises:
            ValidationError: If OAuth request fails
        """
        # Check if cached token is still valid
        if self._access_token and self._token_expires_at:
            if datetime.now() < self._token_expires_at:
                return self._access_token

        # Request new token
        try:
            auth_string = f'{self.consumer_key}:{self.consumer_secret}'
            auth_bytes = auth_string.encode('ascii')
            auth_b64 = base64.b64encode(auth_bytes).decode('ascii')

            headers = {
                'Authorization': f'Basic {auth_b64}',
                'Content-Type': 'application/json'
            }

            response = requests.get(self.oauth_url, headers=headers, timeout=30)
            response.raise_for_status()

            data = response.json()
            self._access_token = data['access_token']

            # Cache for 55 minutes (expires in 60, we refresh at 55)
            expires_in = int(data.get('expires_in', 3600))
            self._token_expires_at = datetime.now() + timedelta(seconds=expires_in - 300)

            return self._access_token

        except requests.RequestException as e:
            raise ValidationError(f'M-Pesa OAuth failed: {str(e)}')

    def generate_password(self, timestamp: str) -> str:
        """
        Generate M-Pesa API password.
        
        Password = Base64(Shortcode + Passkey + Timestamp)
        
        Args:
            timestamp: Timestamp in format YYYYMMDDHHmmss
            
        Returns:
            str: Base64-encoded password
        """
        password_str = f'{self.shortcode}{self.passkey}{timestamp}'
        password_bytes = password_str.encode('ascii')
        return base64.b64encode(password_bytes).decode('ascii')

    def initiate_stk_push(
        self,
        phone_number: str,
        amount: Decimal,
        account_reference: str,
        transaction_desc: str
    ) -> dict:
        """
        Initiate STK Push (Lipa Na M-Pesa Online) payment request.
        
        Args:
            phone_number: Customer phone number (any common format - will be normalized)
            amount: Payment amount (minimum 1 KES)
            account_reference: Reference for the transaction (e.g., invoice number)
            transaction_desc: Description of the transaction
            
        Returns:
            dict: M-Pesa API response with CheckoutRequestID
            
        Raises:
            ValidationError: If STK Push request fails
        """
        # Normalize phone number to 254XXXXXXXXX format
        phone_number = self.format_phone(phone_number)

        # Validate amount
        if amount < Decimal('1.00'):
            raise ValidationError('Amount must be at least 1 KES')

        if amount > Decimal('150000.00'):
            raise ValidationError('Amount cannot exceed 150,000 KES per transaction')

        # Get access token
        access_token = self.get_access_token()

        # Generate timestamp and password
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = self.generate_password(timestamp)

        # Prepare request payload
        payload = {
            'BusinessShortCode': self.shortcode,
            'Password': password,
            'Timestamp': timestamp,
            'TransactionType': 'CustomerPayBillOnline',
            'Amount': int(amount),  # M-Pesa expects integer
            'PartyA': phone_number,
            'PartyB': self.shortcode,
            'PhoneNumber': phone_number,
            'CallBackURL': self.callback_url,
            'AccountReference': account_reference[:12],  # Max 12 characters
            'TransactionDesc': transaction_desc[:13]  # Max 13 characters
        }

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        try:
            response = requests.post(
                self.stk_push_url,
                json=payload,
                headers=headers,
                timeout=30
            )
            response.raise_for_status()

            data = response.json()

            # Check response code
            if data.get('ResponseCode') != '0':
                raise ValidationError(
                    f"M-Pesa STK Push failed: {data.get('ResponseDescription', 'Unknown error')}"
                )

            return {
                'MerchantRequestID': data.get('MerchantRequestID'),
                'CheckoutRequestID': data.get('CheckoutRequestID'),
                'ResponseCode': data.get('ResponseCode'),
                'ResponseDescription': data.get('ResponseDescription'),
                'CustomerMessage': data.get('CustomerMessage')
            }

        except requests.RequestException as e:
            raise ValidationError(f'M-Pesa STK Push request failed: {str(e)}')

    def process_callback(self, callback_data: dict) -> dict:
        """
        Process M-Pesa payment callback.
        
        Args:
            callback_data: Callback data from M-Pesa
            
        Returns:
            dict: Processed payment data
            
        Raises:
            ValidationError: If callback processing fails
        """
        try:
            body = callback_data.get('Body', {})
            stk_callback = body.get('stkCallback', {})

            result_code = stk_callback.get('ResultCode')
            result_desc = stk_callback.get('ResultDesc', '')
            merchant_request_id = stk_callback.get('MerchantRequestID')
            checkout_request_id = stk_callback.get('CheckoutRequestID')

            # Extract callback metadata
            metadata = {}
            callback_metadata = stk_callback.get('CallbackMetadata', {})
            items = callback_metadata.get('Item', [])

            for item in items:
                name = item.get('Name')
                value = item.get('Value')
                metadata[name] = value

            return {
                'success': result_code == 0,
                'result_code': result_code,
                'result_description': result_desc,
                'merchant_request_id': merchant_request_id,
                'checkout_request_id': checkout_request_id,
                'amount': metadata.get('Amount'),
                'mpesa_receipt_number': metadata.get('MpesaReceiptNumber'),
                'transaction_date': metadata.get('TransactionDate'),
                'phone_number': metadata.get('PhoneNumber')
            }

        except (KeyError, AttributeError) as e:
            raise ValidationError(f'Invalid M-Pesa callback data: {str(e)}')

    def query_transaction_status(self, checkout_request_id: str) -> dict:
        """
        Query the status of an STK Push transaction.
        
        Args:
            checkout_request_id: CheckoutRequestID from STK Push response
            
        Returns:
            dict: Transaction status information
            
        Raises:
            ValidationError: If query request fails
        """
        # Get access token
        access_token = self.get_access_token()

        # Generate timestamp and password
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = self.generate_password(timestamp)

        # Prepare request payload
        payload = {
            'BusinessShortCode': self.shortcode,
            'Password': password,
            'Timestamp': timestamp,
            'CheckoutRequestID': checkout_request_id
        }

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        try:
            response = requests.post(
                self.query_url,
                json=payload,
                headers=headers,
                timeout=30
            )
            response.raise_for_status()

            data = response.json()

            return {
                'ResponseCode': data.get('ResponseCode'),
                'ResponseDescription': data.get('ResponseDescription'),
                'MerchantRequestID': data.get('MerchantRequestID'),
                'CheckoutRequestID': data.get('CheckoutRequestID'),
                'ResultCode': data.get('ResultCode'),
                'ResultDesc': data.get('ResultDesc')
            }

        except requests.RequestException as e:
            raise ValidationError(f'M-Pesa query request failed: {str(e)}')
