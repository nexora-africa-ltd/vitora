"""
Client Registry Service for Vitora HMIS.

This module handles integration with the Kenya Client Registry (CR)
through the Digital Superhighway API for patient identification
and registration.

Reference: docs/dha-api-usage-analysis.md
Official Endpoints:
    - POST /v3/uat-cr-registration - Register new client in CR
    - GET /v3/client-registry/fetch-client - Fetch client by ID
    - PUT /v3/update-client - Update existing client record
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import requests
from django.conf import settings

from .sha_auth import SHAAuthError, SHAAuthService
from .sha_pii import SHADecryptionError, maybe_decrypt_client_registry_item

logger = logging.getLogger(__name__)


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class ClientRegistryClient:
    """
    Client record from Kenya Client Registry.

    Represents a person's identity as registered in the national
    Client Registry system.

    Attributes:
        client_number: Unique CR identifier (e.g., 'CR-12345')
        first_name: Client's first name
        last_name: Client's last name
        middle_name: Client's middle name (optional)
        date_of_birth: Date of birth
        gender: Gender code ('M', 'F', 'O')
        national_id: Kenya National ID number (encrypted in CR)
        huduma_number: Huduma Namba (if available)
        passport_number: Passport number (for non-citizens)
        birth_certificate_number: Birth certificate number
        phone_number: Primary phone number
        email: Email address (optional)
        county_of_residence: County code
        sub_county_of_residence: Sub-county code
        ward_of_residence: Ward code
        raw_data: Original API response data
    """

    client_number: str
    first_name: str
    last_name: str
    date_of_birth: date
    gender: str
    middle_name: str | None = None
    national_id: str | None = None
    huduma_number: str | None = None
    passport_number: str | None = None
    birth_certificate_number: str | None = None
    phone_number: str | None = None
    email: str | None = None
    county_of_residence: str | None = None
    sub_county_of_residence: str | None = None
    ward_of_residence: str | None = None
    raw_data: dict = field(default_factory=dict)

    @property
    def full_name(self) -> str:
        """Return full name with middle name if available."""
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        return " ".join(parts)

    @property
    def age(self) -> int:
        """Calculate age from date of birth."""
        today = date.today()
        return (
            today.year
            - self.date_of_birth.year
            - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )

    @classmethod
    def from_api_response(cls, data: dict) -> "ClientRegistryClient":
        """
        Create ClientRegistryClient from CR API response.

        Args:
            data: API response data dict

        Returns:
            ClientRegistryClient instance

        Note:
            DHA API returns gender as full words: 'Male', 'Female', 'Other'
            We normalize to single char: 'M', 'F', 'O'

            DHA API field names differ from our model:
            - 'id' -> client_number (CR number like CR000000000-2)
            - 'county' -> county_of_residence
            - 'sub_county' -> sub_county_of_residence
            - 'ward' -> ward_of_residence
            - 'phone' -> phone_number
            - 'identification_number' -> national_id (when type is National ID)
        """
        # Parse date of birth
        dob = data.get("date_of_birth") or data.get("dob")
        if isinstance(dob, str) and dob:
            try:
                dob = datetime.strptime(dob, "%Y-%m-%d").date()
            except ValueError:
                dob = None

        # Normalize gender: DHA returns 'Male'/'Female'/'Other', we need 'M'/'F'/'O'
        raw_gender = data.get("gender", "")
        if raw_gender:
            gender_map = {
                "male": "M",
                "m": "M",
                "female": "F",
                "f": "F",
                "other": "O",
                "o": "O",
            }
            gender = gender_map.get(
                raw_gender.lower(), raw_gender[0].upper() if raw_gender else "O"
            )
        else:
            gender = ""

        # Extract national ID from identification fields if present
        national_id = data.get("national_id")
        if not national_id and data.get("identification_type") == "National ID":
            national_id = data.get("identification_number")

        # Client number: DHA uses 'id' field for CR number (e.g., CR000000000-2)
        client_number = data.get("client_number") or data.get("id", "")

        return cls(
            client_number=client_number,
            first_name=data.get("first_name", "").strip(),
            last_name=data.get("last_name", "").strip(),
            middle_name=data.get("middle_name", "").strip() if data.get("middle_name") else None,
            date_of_birth=dob,
            gender=gender,
            national_id=national_id,
            huduma_number=data.get("huduma_number"),
            passport_number=data.get("passport_number"),
            birth_certificate_number=data.get("birth_certificate_number"),
            phone_number=data.get("phone_number") or data.get("phone"),
            email=data.get("email"),
            county_of_residence=data.get("county_of_residence") or data.get("county"),
            sub_county_of_residence=data.get("sub_county_of_residence") or data.get("sub_county"),
            ward_of_residence=data.get("ward_of_residence") or data.get("ward"),
            raw_data=data,
        )


# =============================================================================
# Custom Exceptions
# =============================================================================


class ClientRegistryError(Exception):
    """
    Base exception for Client Registry operations.

    Attributes:
        message: Error description
        status_code: HTTP status code if applicable
        error_code: CR-specific error code
    """

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        error_code: str | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)

    def __str__(self):
        parts = ["ClientRegistryError"]
        if self.status_code:
            parts.append(f"({self.status_code})")
        if self.error_code:
            parts.append(f"[{self.error_code}]")
        parts.append(f": {self.message}")
        return "".join(parts)


class ClientNotFoundError(ClientRegistryError):
    """Raised when client is not found in the registry."""

    def __init__(self, identifier: str, identifier_type: str = "ID"):
        self.identifier = identifier
        self.identifier_type = identifier_type
        super().__init__(
            message=f"Client not found with {identifier_type}: {identifier}",
            status_code=404,
        )


class ClientRegistrationError(ClientRegistryError):
    """Raised when client registration fails."""

    def __init__(self, message: str, validation_errors: dict | None = None):
        self.validation_errors = validation_errors or {}
        super().__init__(message=message, status_code=400)


class DuplicateClientError(ClientRegistryError):
    """Raised when attempting to register a duplicate client."""

    def __init__(self, existing_client_number: str | None = None):
        self.existing_client_number = existing_client_number
        message = "A client with this identifier already exists"
        if existing_client_number:
            message += f" (CR Number: {existing_client_number})"
        super().__init__(message=message, status_code=409)


# =============================================================================
# Service Class
# =============================================================================


class ClientRegistryService:
    """
    Service for interacting with Kenya Client Registry.

    This service provides methods to:
        - Fetch existing clients by various identifiers
        - Register new clients in the CR
        - Update existing client records

    The Client Registry is Kenya's master patient index, providing
    unique identification across healthcare facilities.

    Attributes:
        api_base_url: DHA API base URL
        fetch_endpoint: Endpoint path for fetching clients
        register_endpoint: Endpoint path for registration
        update_endpoint: Endpoint path for updates
        timeout: Request timeout in seconds
        auth_service: SHAAuthService instance for authentication

    Example:
        >>> cr_service = ClientRegistryService()
        >>> client = cr_service.fetch_client(national_id='12345678')
        >>> if client:
        ...     print(f"Found: {client.full_name}")
    """

    def __init__(self):
        """Initialize ClientRegistryService with settings from Django config."""
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = getattr(settings, "SHA_API_TIMEOUT", 19)

        # Get agent from settings (required for API calls)
        self.agent = getattr(settings, "SHA_AGENT", "")

        # Get encrypted PIN from settings (required for CR registration/update)
        self.encrypted_pin = getattr(settings, "SHA_ENCRYPTED_PIN", "")

        # Get endpoint paths from settings
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})
        self.fetch_endpoint = endpoints.get("client_registry", "/v3/client-registry/fetch-client")
        self.register_endpoint = endpoints.get("client_register", "/v3/uat-cr-registration")
        self.update_endpoint = endpoints.get("client_update", "/v3/update-client")

        # Initialize auth service
        self.auth_service = SHAAuthService()

    def fetch_client(
        self,
        national_id: str | None = None,
        client_number: str | None = None,
        huduma_number: str | None = None,
        passport_number: str | None = None,
        identification_type: str | None = None,
        identification_number: str | None = None,
    ) -> ClientRegistryClient | None:
        """
        Fetch a client from the Client Registry.

        At least one identifier must be provided. The method will
        search using the provided identifier(s) in priority order.

        Args:
            national_id: Kenya National ID number
            client_number: Existing CR client number
            huduma_number: Huduma Namba
            passport_number: Passport number
            identification_type: Generic ID type (e.g., 'National ID', 'Passport')
            identification_number: Generic ID value (used with identification_type)

        Returns:
            ClientRegistryClient if found, None otherwise

        Raises:
            ClientRegistryError: If API request fails
            ValueError: If no identifier is provided

        Example:
            >>> client = service.fetch_client(national_id='12345678')
            >>> if client:
            ...     print(client.client_number)
        """
        # Validate at least one identifier is provided
        if not any(
            [
                national_id,
                client_number,
                huduma_number,
                passport_number,
                (identification_type and identification_number),
            ]
        ):
            raise ValueError("At least one identifier must be provided")

        # Build query parameters per official API spec
        # API requires: identification_type, identification_number, agent
        params = {
            "agent": self.agent,
        }

        # Priority: explicit identification_type/number > named params
        if identification_type and identification_number:
            params["identification_type"] = identification_type
            params["identification_number"] = identification_number
        elif national_id:
            params["identification_type"] = "National ID"
            params["identification_number"] = national_id
        elif client_number:
            params["identification_type"] = "client_number"
            params["identification_number"] = client_number
        elif huduma_number:
            params["identification_type"] = "huduma_number"
            params["identification_number"] = huduma_number
        elif passport_number:
            params["identification_type"] = "passport_number"
            params["identification_number"] = passport_number

        logger.info(f"Fetching client from CR with params: {params}")

        try:
            headers = self.auth_service.get_auth_headers()

            response = requests.get(
                f"{self.api_base_url}{self.fetch_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            logger.debug(f"CR fetch response status: {response.status_code}")

            if response.status_code == 404:
                return None

            if response.status_code == 401:
                raise ClientRegistryError(
                    "Authentication failed",
                    status_code=401,
                )

            response.raise_for_status()

            data = response.json()

            # Handle DHA API response format:
            # Official format: {"message": {"total": N, "result": [...]}}
            # The result array contains client records
            #
            # Also handle alternative formats for backward compatibility:
            # Format 1: {"client": {...}}
            # Format 2: {"data": {"client": {...}}}
            # Format 3: Direct client data

            client_data = None

            # Check for official DHA format: {"message": {"result": [...]}}
            if "message" in data and isinstance(data["message"], dict):
                message = data["message"]
                total = message.get("total", 0)
                result = message.get("result", [])

                if total > 0 and result:
                    # Get the first matching client
                    client_data = result[0]
                else:
                    return None
            # Fallback formats
            elif "client" in data:
                client_data = data["client"]
            elif "data" in data and isinstance(data["data"], dict):
                client_data = data["data"].get("client")
            else:
                # Assume direct client data
                client_data = data

            # Check if client was found
            if not client_data:
                return None

            # Some APIs return found=0 to indicate not found
            if client_data.get("found") == 0:
                return None

            # DHA sometimes returns encrypted payload in `_pii`.
            # Decrypt server-side so the frontend receives usable fields.
            try:
                if isinstance(client_data, dict):
                    client_data = maybe_decrypt_client_registry_item(client_data)
            except SHADecryptionError as e:
                raise ClientRegistryError(
                    f"Unable to decrypt client registry response: {str(e)}",
                    status_code=0,
                )

            return ClientRegistryClient.from_api_response(client_data)

        except SHAAuthError as e:
            raise ClientRegistryError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
            )
        except requests.Timeout:
            raise ClientRegistryError(
                "Request timed out",
                status_code=0,
            )
        except requests.RequestException as e:
            raise ClientRegistryError(
                f"Request failed: {str(e)}",
                status_code=getattr(e.response, "status_code", 0) if hasattr(e, "response") else 0,
            )

    def register_client(
        self,
        first_name: str,
        last_name: str,
        date_of_birth: str | date,
        gender: str,
        national_id: str | None = None,
        middle_name: str | None = None,
        huduma_number: str | None = None,
        passport_number: str | None = None,
        birth_certificate_number: str | None = None,
        phone_number: str | None = None,
        email: str | None = None,
        county_of_residence: str | None = None,
        sub_county_of_residence: str | None = None,
        ward_of_residence: str | None = None,
    ) -> ClientRegistryClient:
        """
        Register a new client in the Client Registry.

        Creates a new client record in Kenya's CR and returns the
        assigned client number.

        Args:
            first_name: Client's first name (required)
            last_name: Client's last name (required)
            date_of_birth: Date of birth (required, 'YYYY-MM-DD' or date object)
            gender: Gender code 'M', 'F', or 'O' (required)
            national_id: Kenya National ID number
            middle_name: Middle name
            huduma_number: Huduma Namba
            passport_number: Passport number
            birth_certificate_number: Birth certificate number
            phone_number: Phone number
            email: Email address
            county_of_residence: County code
            sub_county_of_residence: Sub-county code
            ward_of_residence: Ward code

        Returns:
            ClientRegistryClient with assigned client_number

        Raises:
            ClientRegistrationError: If registration fails
            DuplicateClientError: If client already exists

        Example:
            >>> client = service.register_client(
            ...     first_name='John',
            ...     last_name='Doe',
            ...     date_of_birth='1990-01-15',
            ...     gender='M',
            ...     national_id='12345678',
            ... )
            >>> print(f"Registered as: {client.client_number}")
        """
        # Validate required fields
        if not all([first_name, last_name, date_of_birth, gender]):
            raise ClientRegistrationError(
                "first_name, last_name, date_of_birth, and gender are required",
                validation_errors={
                    "first_name": "required" if not first_name else None,
                    "last_name": "required" if not last_name else None,
                    "date_of_birth": "required" if not date_of_birth else None,
                    "gender": "required" if not gender else None,
                },
            )

        # Validate gender
        if gender not in ("M", "F", "O"):
            raise ClientRegistrationError(
                "Gender must be 'M', 'F', or 'O'", validation_errors={"gender": "invalid"}
            )

        # Format date of birth
        if isinstance(date_of_birth, date):
            dob_formatted = date_of_birth.strftime("%Y-%m-%d")
        else:
            dob_formatted = date_of_birth
        # dob_formatted is used below when building the payload
        _ = dob_formatted  # Mark as used

        # Validate agent and encrypted_pin are configured
        if not self.agent:
            raise ClientRegistrationError(
                "SHA_AGENT is not configured. Set SHA_AGENT in environment.",
                validation_errors={"agent": "required"},
            )
        if not self.encrypted_pin:
            raise ClientRegistrationError(
                "SHA_ENCRYPTED_PIN is not configured. Use sha-pin-gen.py to generate and set in environment.",
                validation_errors={"encrypted_pin": "required"},
            )

        # Determine identification type and number for DHA API
        # DHA expects identification_type and identification_number, not individual ID fields
        identification_type = None
        identification_number = None

        if national_id:
            identification_type = "National ID"
            identification_number = national_id
        elif huduma_number:
            identification_type = "Huduma Number"
            identification_number = huduma_number
        elif passport_number:
            identification_type = "Passport"
            identification_number = passport_number
        elif birth_certificate_number:
            identification_type = "Birth Certificate"
            identification_number = birth_certificate_number

        if not identification_number:
            raise ClientRegistrationError(
                "At least one identification (national_id, huduma_number, passport_number, or birth_certificate_number) is required",
                validation_errors={"identification": "required"},
            )

        # Build request payload - DHA UAT CR registration API format
        # Reference: Kenya Digital Superhighway Postman Collection
        payload = {
            "agent": self.agent,
            "encrypted_pin": self.encrypted_pin,
            "identification_type": identification_type,
            "identification_number": identification_number,
        }

        logger.info(
            f"Registering new client in CR: {first_name} {last_name} ({identification_type}: {identification_number[:4]}...)"
        )

        try:
            headers = self.auth_service.get_auth_headers()

            response = requests.post(
                f"{self.api_base_url}{self.register_endpoint}",
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )

            logger.debug(f"CR registration response status: {response.status_code}")

            # Log response body for debugging (truncate if too long)
            try:
                response_text = response.text[:1000] if response.text else "(empty)"
                logger.debug(f"CR registration response body: {response_text}")
            except Exception as exc:
                logger.debug(f"Unable to read CR registration response body: {exc}")

            if response.status_code == 409:
                # Duplicate client
                data = response.json()
                existing_number = data.get("client_number")
                raise DuplicateClientError(existing_client_number=existing_number)

            if response.status_code == 400:
                # Validation error
                data = response.json()
                raise ClientRegistrationError(
                    data.get("message", "Validation failed"),
                    validation_errors=data.get("errors", {}),
                )

            if response.status_code == 401:
                raise ClientRegistryError(
                    "Authentication failed",
                    status_code=401,
                )

            if response.status_code >= 500:
                # Server error - include response body for debugging
                error_body = response.text[:500] if response.text else "No response body"
                logger.error(f"DHA server error ({response.status_code}): {error_body}")
                raise ClientRegistryError(
                    f"DHA server error: {error_body}",
                    status_code=response.status_code,
                )

            response.raise_for_status()

            data = response.json()

            # Extract client data from response
            # Response format: {"client_number": "CR-12345", ...}
            client_data = data.get("client") or data

            # Add submitted data if not in response
            if "first_name" not in client_data:
                client_data.update(payload)

            return ClientRegistryClient.from_api_response(client_data)

        except SHAAuthError as e:
            raise ClientRegistryError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
            )
        except requests.Timeout:
            raise ClientRegistryError(
                "Request timed out",
                status_code=0,
            )
        except (DuplicateClientError, ClientRegistrationError):
            raise
        except requests.RequestException as e:
            raise ClientRegistryError(
                f"Request failed: {str(e)}",
                status_code=getattr(e.response, "status_code", 0) if hasattr(e, "response") else 0,
            )

    def update_client(
        self,
        client_number: str,
        **updates: Any,
    ) -> ClientRegistryClient:
        """
        Update an existing client in the Client Registry.

        Updates specified fields for an existing client record.
        Only provided fields will be updated.

        Args:
            client_number: The CR client number to update (required)
            **updates: Field-value pairs to update. Supported fields:
                - phone_number
                - email
                - county_of_residence
                - sub_county_of_residence
                - ward_of_residence

        Returns:
            Updated ClientRegistryClient

        Raises:
            ClientNotFoundError: If client not found
            ClientRegistryError: If update fails
            ValueError: If no updates provided

        Example:
            >>> updated = service.update_client(
            ...     client_number='CR-12345',
            ...     phone_number='0712345678',
            ...     email='john@example.com',
            ... )
        """
        if not client_number:
            raise ValueError("client_number is required")

        if not updates:
            raise ValueError("At least one field to update is required")

        # Allowed update fields
        allowed_fields = {
            "phone_number",
            "email",
            "county_of_residence",
            "sub_county_of_residence",
            "ward_of_residence",
            "middle_name",
        }

        # Filter to allowed fields only
        payload = {
            "client_number": client_number,
            **{k: v for k, v in updates.items() if k in allowed_fields},
        }

        logger.info(f"Updating client {client_number} in CR")

        try:
            headers = self.auth_service.get_auth_headers()

            response = requests.put(
                f"{self.api_base_url}{self.update_endpoint}",
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )

            logger.debug(f"CR update response status: {response.status_code}")

            if response.status_code == 404:
                raise ClientNotFoundError(
                    identifier=client_number,
                    identifier_type="client_number",
                )

            if response.status_code == 401:
                raise ClientRegistryError(
                    "Authentication failed",
                    status_code=401,
                )

            response.raise_for_status()

            data = response.json()

            # Extract updated client data
            client_data = data.get("client") or data

            return ClientRegistryClient.from_api_response(client_data)

        except SHAAuthError as e:
            raise ClientRegistryError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
            )
        except requests.Timeout:
            raise ClientRegistryError(
                "Request timed out",
                status_code=0,
            )
        except ClientNotFoundError:
            raise
        except requests.RequestException as e:
            raise ClientRegistryError(
                f"Request failed: {str(e)}",
                status_code=getattr(e.response, "status_code", 0) if hasattr(e, "response") else 0,
            )

    def is_configured(self) -> bool:
        """
        Check if Client Registry integration is properly configured.

        Returns:
            True if CR integration can be used
        """
        return bool(
            self.api_base_url
            and self.fetch_endpoint
            and self.register_endpoint
            and self.agent
            and self.encrypted_pin
            and self.auth_service.is_configured()
        )
