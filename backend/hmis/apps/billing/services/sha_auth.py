"""
SHA Authentication Service for Vitora HMIS.

This module handles SHA (Social Health Authority) API authentication
using Basic Auth to obtain JWT tokens per the official Kenya Digital
Superhighway API specification.

Reference: docs/sha-api-validation-report.md
Official Endpoint: GET /v1/hie-auth?key={consumer_key}
"""

import base64
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
    
    def __init__(self):
        """Initialize SHAAuthService with settings from Django config."""
        self.base_url = settings.SHA_API_BASE_URL.rstrip('/')
        self.consumer_key = settings.SHA_CONSUMER_KEY
        self.username = settings.SHA_USERNAME
        self.password = settings.SHA_PASSWORD
        self.timeout = getattr(settings, 'SHA_API_TIMEOUT', 30)
    
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
            
            data = response.json()
            
            # Handle different response formats
            # Official format: {"token": "..."}
            # Alternative: {"IsSuccess": true, "Data": {"token": "..."}}
            token = data.get('token')
            if not token and data.get('Data'):
                token = data['Data'].get('token')
            
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
