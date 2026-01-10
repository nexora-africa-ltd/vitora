"""
SHA Authentication Service for Vitora HMIS.

This module handles SHA (Social Health Authority) API authentication
using two methods:
1. Basic Auth to obtain JWT tokens for client registry/eligibility APIs
2. Self-signed JWT for terminology APIs (uses client_secret as HMAC key)

Reference: docs/sha-api-validation-report.md
Official Endpoint: GET /v1/hie-auth?key={consumer_key}
"""

import base64
import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass
class SHAToken:
    """Container for SHA JWT token with expiry tracking."""
    
    token: str
    obtained_at: datetime
    expires_in_seconds: int = 3600  # Default 1 hour
    
    @property
    def expires_at(self) -> datetime:
        """Calculate token expiry time."""
        return self.obtained_at + timedelta(seconds=self.expires_in_seconds)
    
    @property
    def is_expired(self) -> bool:
        """Check if token is expired (with 5 minute buffer)."""
        buffer = timedelta(minutes=5)
        return datetime.now() >= (self.expires_at - buffer)
    
    @property
    def is_valid(self) -> bool:
        """Check if token is valid and not expired."""
        return bool(self.token) and not self.is_expired


class SHAAuthService:
    """
    SHA Authentication Service.
    
    Handles authentication with the SHA Kenya Digital Superhighway API
    using Basic Auth to obtain JWT tokens.
    
    Official Flow:
        1. Send GET request to /v1/hie-auth?key={consumer_key}
        2. Include Basic Auth header with username:password
        3. Receive JWT token in response
        4. Use JWT token as Bearer token for subsequent requests
    
    Attributes:
        base_url: SHA API base URL
        consumer_key: SHA consumer key (API key)
        username: SHA API username
        password: SHA API password
        timeout: Request timeout in seconds
    
    Example:
        >>> auth_service = SHAAuthService()
        >>> headers = auth_service.get_auth_headers()
        >>> response = requests.get(url, headers=headers)
    """
    
    # Class-level token cache for efficiency
    _token_cache: Optional[SHAToken] = None
    _terminology_token_cache: Optional[SHAToken] = None
    
    def __init__(self):
        """Initialize SHAAuthService with settings from Django config."""
        self.base_url = settings.SHA_API_BASE_URL.rstrip('/')
        self.consumer_key = settings.SHA_CONSUMER_KEY
        self.client_secret = getattr(settings, 'SHA_CLIENT_SECRET', '')
        self.username = settings.SHA_USERNAME
        self.password = settings.SHA_PASSWORD
        self.timeout = getattr(settings, 'SHA_API_TIMEOUT', 30)
    
    def _base64url_encode(self, data: bytes) -> str:
        """
        Base64url encode data (JWT-compatible).
        
        Removes padding and replaces +/ with -_
        """
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')
    
    def _create_basic_auth_header(self) -> str:
        """
        Create Basic Auth header value.
        
        Encodes username:password as base64 per HTTP Basic Auth spec.
        
        Returns:
            Base64-encoded credentials string
            
        Example:
            >>> auth._create_basic_auth_header()
            'dXNlcm5hbWU6cGFzc3dvcmQ='
        """
        credentials = f"{self.username}:{self.password}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return encoded
    
    def generate_terminology_token(self, expires_in: int = 20) -> str:
        """
        Generate a self-signed JWT for terminology API calls.
        
        The terminology APIs (ICD-11, LOINC, ICHI, etc.) require a JWT
        that is locally signed using the client_secret as the HMAC key.
        This is different from the /v1/hie-auth endpoint which returns
        a server-signed token.
        
        Args:
            expires_in: Token validity in seconds (default 20)
            
        Returns:
            Self-signed JWT token string
            
        Example:
            >>> token = auth_service.generate_terminology_token()
        """
        # Check cache first
        if self._terminology_token_cache and self._terminology_token_cache.is_valid:
            logger.debug("Using cached terminology token")
            return self._terminology_token_cache.token
        
        now = int(time.time())
        
        # JWT Header (compact JSON, no spaces)
        header = {"alg":"HS256","typ":"JWT"}
        
        # JWT Payload (matches Postman pre-request script)
        payload = {"key":self.consumer_key,"iat":now,"exp":now+expires_in}
        
        # Encode header and payload (compact JSON)
        encoded_header = self._base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
        encoded_payload = self._base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
        
        # Create signature
        message = f"{encoded_header}.{encoded_payload}"
        signature = hmac.new(
            self.client_secret.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        encoded_signature = self._base64url_encode(signature)
        
        # Combine to form JWT
        token = f"{encoded_header}.{encoded_payload}.{encoded_signature}"
        
        # Cache the token
        SHAAuthService._terminology_token_cache = SHAToken(
            token=token,
            obtained_at=datetime.now(),
            expires_in_seconds=expires_in,
        )
        
        logger.debug("Generated new terminology JWT")
        return token
    
    def get_terminology_headers(self) -> dict:
        """
        Get HTTP headers for terminology API requests.
        
        Uses self-signed JWT for terminology endpoints.
        
        Returns:
            Dict with Authorization and Accept headers
        """
        token = self.generate_terminology_token()
        return {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
        }
    
    def get_token(self, force_refresh: bool = False) -> str:
        """
        Get a valid JWT token from SHA API.
        
        Uses cached token if available and not expired. Otherwise,
        obtains a new token from the SHA auth endpoint.
        
        Args:
            force_refresh: If True, always fetch a new token
            
        Returns:
            JWT token string
            
        Raises:
            SHAAuthError: If authentication fails
            
        Example:
            >>> token = auth_service.get_token()
            >>> print(f"Bearer {token}")
        """
        # Check cache first
        if not force_refresh and self._token_cache and self._token_cache.is_valid:
            logger.debug("Using cached SHA token")
            return self._token_cache.token
        
        # Fetch new token
        logger.info("Fetching new SHA authentication token")
        
        basic_auth = self._create_basic_auth_header()
        
        try:
            response = requests.get(
                f"{self.base_url}/v1/hie-auth",
                params={'key': self.consumer_key},
                headers={
                    'Authorization': f'Basic {basic_auth}',
                    'Content-Type': 'application/json',
                },
                timeout=self.timeout,
            )
            
            # Log response for debugging
            logger.debug(f"SHA auth response status: {response.status_code}")
            
            if response.status_code == 401:
                raise SHAAuthError(
                    "Authentication failed: Invalid credentials",
                    status_code=401
                )
            
            if response.status_code == 403:
                raise SHAAuthError(
                    "Authentication failed: Access denied",
                    status_code=403
                )
            
            response.raise_for_status()
            
            # Handle different response formats
            # The API may return:
            # 1. Plain text JWT token directly
            # 2. JSON with {"token": "..."}
            # 3. JSON with {"IsSuccess": true, "Data": {"token": "..."}}
            
            content_type = response.headers.get('Content-Type', '')
            response_text = response.text.strip()
            
            if 'application/json' in content_type:
                data = response.json()
                # Official format: {"token": "..."}
                # Alternative: {"IsSuccess": true, "Data": {"token": "..."}}
                token = data.get('token')
                if not token and data.get('Data'):
                    token = data['Data'].get('token')
            else:
                # Plain text JWT token (official DHA format)
                # Check if it looks like a JWT (starts with eyJ)
                if response_text.startswith('eyJ'):
                    token = response_text
                    data = {'token': token}
                else:
                    raise SHAAuthError(
                        f"Unexpected response format: {response_text[:100]}",
                        status_code=response.status_code
                    )
            
            if not token:
                raise SHAAuthError(
                    f"No token in response: {data}",
                    status_code=response.status_code
                )
            
            # Parse expiry if provided
            expires_in = data.get('expires_in', 3600)
            
            # Cache the token
            SHAAuthService._token_cache = SHAToken(
                token=token,
                obtained_at=datetime.now(),
                expires_in_seconds=expires_in,
            )
            
            logger.info("Successfully obtained SHA authentication token")
            return token
            
        except requests.Timeout:
            raise SHAAuthError("Authentication request timed out", status_code=0)
        except requests.RequestException as e:
            raise SHAAuthError(f"Authentication request failed: {str(e)}", status_code=0)
    
    def get_auth_headers(self, force_refresh: bool = False) -> dict:
        """
        Get HTTP headers with valid Bearer token.
        
        Convenience method that returns headers ready for API requests.
        
        Args:
            force_refresh: If True, force token refresh
            
        Returns:
            Dict with Authorization and Content-Type headers
            
        Example:
            >>> headers = auth_service.get_auth_headers()
            >>> response = requests.get(url, headers=headers)
        """
        token = self.get_token(force_refresh=force_refresh)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
    
    def clear_token_cache(self):
        """
        Clear the cached token.
        
        Use this if the token becomes invalid before expiry.
        """
        SHAAuthService._token_cache = None
        logger.debug("SHA token cache cleared")
    
    def is_configured(self) -> bool:
        """
        Check if SHA authentication is properly configured.
        
        Returns:
            True if all required credentials are set
        """
        return all([
            self.base_url,
            self.consumer_key,
            self.username,
            self.password,
        ])


class SHAAuthError(Exception):
    """
    Exception raised for SHA authentication errors.
    
    Attributes:
        message: Error description
        status_code: HTTP status code if applicable
    """
    
    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(message)
    
    def __str__(self):
        if self.status_code:
            return f"SHAAuthError ({self.status_code}): {self.message}"
        return f"SHAAuthError: {self.message}"
