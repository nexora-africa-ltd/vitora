"""
FHIR R4 HTTP Client for Vitora HMIS.

This module provides an HTTP client for interacting with FHIR R4 servers,
specifically designed for integration testing with HAPI FHIR and
production use with Kenya SHA FHIR endpoints.

Features:
- Resource CRUD operations (Create, Read, Update, Delete)
- Bundle transaction and message submission
- Search with FHIR standard parameters
- Response time tracking for performance monitoring
- Automatic retry with exponential backoff

Reference:
- HAPI FHIR: https://hapifhir.io/
- FHIR R4 REST API: https://hl7.org/fhir/R4/http.html
- Phase 3: docs/fhir-validation-plan.md

Usage:
    >>> from hmis.apps.core.services.fhir_client import FHIRClient
    >>> client = FHIRClient("http://localhost:8090/fhir")
    >>> # Create a patient
    >>> result = client.create_resource("Patient", patient_data)
    >>> print(result.resource_id)
    >>> # Get a patient
    >>> patient = client.read_resource("Patient", patient_id)
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


# Standard FHIR media types
FHIR_JSON_CONTENT_TYPE = "application/fhir+json"
FHIR_XML_CONTENT_TYPE = "application/fhir+xml"


@dataclass
class FHIROperationOutcome:
    """
    Represents a FHIR OperationOutcome resource.

    Used to capture errors and warnings from FHIR server responses.
    """

    severity: str  # fatal | error | warning | information
    code: str  # FHIR issue type code
    diagnostics: str  # Human-readable error message
    location: list[str] = field(default_factory=list)  # FHIRPath to element
    expression: list[str] = field(default_factory=list)  # Alternative location

    @classmethod
    def from_dict(cls, issue: dict) -> "FHIROperationOutcome":
        """Create from FHIR OperationOutcome.issue element."""
        return cls(
            severity=issue.get("severity", "error"),
            code=issue.get("code", "unknown"),
            diagnostics=issue.get("diagnostics", "No details provided"),
            location=issue.get("location", []),
            expression=issue.get("expression", []),
        )


@dataclass
class FHIRResponse:
    """
    Result of a FHIR operation.

    Attributes:
        success: Whether the operation succeeded (HTTP 2xx)
        status_code: HTTP status code
        resource: Returned FHIR resource (if any)
        resource_id: ID of created/updated resource
        resource_type: Type of returned resource
        location: Location header (for created resources)
        etag: ETag header (for concurrency control)
        last_modified: Last-Modified header
        response_time_ms: Response time in milliseconds
        issues: List of OperationOutcome issues (for errors)
        raw_response: Raw requests.Response object
    """

    success: bool
    status_code: int
    resource: dict | None = None
    resource_id: str | None = None
    resource_type: str | None = None
    location: str | None = None
    etag: str | None = None
    last_modified: str | None = None
    response_time_ms: float = 0.0
    issues: list[FHIROperationOutcome] = field(default_factory=list)
    raw_response: requests.Response | None = None

    @property
    def is_error(self) -> bool:
        """Check if response indicates an error."""
        return not self.success or self.status_code >= 400

    def get_error_message(self) -> str:
        """Get human-readable error message."""
        if not self.issues:
            return f"HTTP {self.status_code}"
        return "; ".join(issue.diagnostics for issue in self.issues)

    def __bool__(self) -> bool:
        """Allow boolean evaluation."""
        return self.success


@dataclass
class FHIRSearchResult:
    """
    Result of a FHIR search operation.

    Attributes:
        success: Whether the search succeeded
        total: Total count of matching resources
        resources: List of matching resources
        link: Navigation links (self, next, previous)
        response_time_ms: Response time in milliseconds
    """

    success: bool
    total: int
    resources: list[dict] = field(default_factory=list)
    link: dict[str, str] = field(default_factory=dict)
    response_time_ms: float = 0.0

    def __bool__(self) -> bool:
        """Allow boolean evaluation."""
        return self.success

    def __iter__(self):
        """Iterate over resources."""
        return iter(self.resources)

    def __len__(self) -> int:
        """Return number of resources in this page."""
        return len(self.resources)


class FHIRClientError(Exception):
    """Base exception for FHIR client errors."""

    def __init__(self, message: str, response: FHIRResponse | None = None):
        super().__init__(message)
        self.response = response


class FHIRConnectionError(FHIRClientError):
    """Raised when connection to FHIR server fails."""

    pass


class FHIRValidationError(FHIRClientError):
    """Raised when FHIR resource validation fails on server."""

    pass


class FHIRNotFoundError(FHIRClientError):
    """Raised when requested resource is not found."""

    pass


class FHIRConflictError(FHIRClientError):
    """Raised when there's a conflict (e.g., version mismatch)."""

    pass


class FHIRClient:
    """
    HTTP client for FHIR R4 server operations.

    Provides methods for CRUD operations, search, and bundle transactions
    against a FHIR R4 server (HAPI FHIR or SHA FHIR endpoints).

    Attributes:
        base_url: Base URL of the FHIR server (e.g., "http://localhost:8090/fhir")
        timeout: Request timeout in seconds
        max_retries: Maximum number of retries for transient failures
        headers: Default headers to include in all requests

    Example:
        >>> client = FHIRClient("http://localhost:8090/fhir")
        >>> # Create a patient
        >>> result = client.create_resource("Patient", {
        ...     "resourceType": "Patient",
        ...     "name": [{"family": "Test", "given": ["John"]}]
        ... })
        >>> print(f"Created patient: {result.resource_id}")
        >>> # Read it back
        >>> patient = client.read_resource("Patient", result.resource_id)
        >>> print(patient.resource["name"])
    """

    def __init__(
        self,
        base_url: str,
        timeout: int = 30,
        max_retries: int = 3,
        auth_token: str | None = None,
    ):
        """
        Initialize FHIR client.

        Args:
            base_url: Base URL of FHIR server (e.g., "http://localhost:8090/fhir")
            timeout: Request timeout in seconds (default: 30)
            max_retries: Max retries for transient failures (default: 3)
            auth_token: Optional Bearer token for authentication
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries

        # Configure session with retry logic
        self.session = requests.Session()
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        # Default headers
        self.headers = {
            "Content-Type": FHIR_JSON_CONTENT_TYPE,
            "Accept": FHIR_JSON_CONTENT_TYPE,
        }
        if auth_token:
            self.headers["Authorization"] = f"Bearer {auth_token}"

    def __enter__(self) -> "FHIRClient":
        """Context manager entry."""
        return self

    def __exit__(self, *args) -> None:
        """Context manager exit - close session."""
        self.close()

    def close(self) -> None:
        """Close the HTTP session."""
        if self.session:
            self.session.close()

    def wait_for_server(self, max_wait_seconds: int = 120, poll_interval: int = 5) -> bool:
        """
        Wait for FHIR server to become available.

        Args:
            max_wait_seconds: Maximum time to wait
            poll_interval: Time between health checks

        Returns:
            True if server became available, False if timeout
        """
        start_time = time.time()
        while time.time() - start_time < max_wait_seconds:
            if self.check_health():
                logger.info("FHIR server is available")
                return True
            logger.debug(f"Waiting for FHIR server... ({poll_interval}s)")
            time.sleep(poll_interval)
        logger.error(f"FHIR server not available after {max_wait_seconds}s")
        return False

    def _build_url(self, *parts: str) -> str:
        """Build URL from base and parts."""
        path = "/".join(str(p).strip("/") for p in parts if p)
        return f"{self.base_url}/{path}"

    def _make_request(
        self,
        method: str,
        url: str,
        data: dict | None = None,
        params: dict | None = None,
        headers: dict | None = None,
    ) -> FHIRResponse:
        """
        Make HTTP request to FHIR server.

        Args:
            method: HTTP method (GET, POST, PUT, PATCH, DELETE)
            url: Full URL to request
            data: JSON data to send (for POST/PUT/PATCH)
            params: Query parameters
            headers: Additional headers

        Returns:
            FHIRResponse with operation result
        """
        request_headers = {**self.headers, **(headers or {})}

        start_time = time.perf_counter()

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=request_headers,
                timeout=self.timeout,
            )
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            return self._parse_response(response, elapsed_ms)

        except requests.exceptions.ConnectionError as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"FHIR connection error: {e}")
            raise FHIRConnectionError(f"Failed to connect to FHIR server: {e}")

        except requests.exceptions.Timeout as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"FHIR request timeout: {e}")
            raise FHIRConnectionError(f"FHIR request timed out after {self.timeout}s")

        except requests.exceptions.RetryError as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            # RetryError wraps connection failures after max retries
            logger.error(f"FHIR connection error (max retries exceeded): {e}")
            raise FHIRConnectionError(f"Failed to connect to FHIR server after retries: {e}")

        except requests.exceptions.RequestException as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"FHIR request error: {e}")
            raise FHIRClientError(f"FHIR request failed: {e}")

    def _parse_response(self, response: requests.Response, elapsed_ms: float) -> FHIRResponse:
        """Parse HTTP response into FHIRResponse."""
        result = FHIRResponse(
            success=response.ok,
            status_code=response.status_code,
            response_time_ms=elapsed_ms,
            location=response.headers.get("Location"),
            etag=response.headers.get("ETag"),
            last_modified=response.headers.get("Last-Modified"),
            raw_response=response,
        )

        # Parse JSON body if present
        if response.text:
            try:
                data = response.json()
                result.resource = data
                result.resource_type = data.get("resourceType")

                # Extract resource ID from response
                if "id" in data:
                    result.resource_id = data["id"]

                # Parse OperationOutcome issues
                if result.resource_type == "OperationOutcome":
                    issues = data.get("issue", [])
                    result.issues = [FHIROperationOutcome.from_dict(issue) for issue in issues]

                # For Bundle, extract entry resources
                if result.resource_type == "Bundle":
                    entries = data.get("entry", [])
                    # Extract IDs from bundle entries if present
                    for entry in entries:
                        if "response" in entry:
                            loc = entry["response"].get("location", "")
                            if "/" in loc and not result.resource_id:
                                # Extract ID from location like "Patient/123"
                                result.resource_id = loc.split("/")[-1]

            except ValueError:
                # Not JSON, that's okay for some operations
                pass

        # Extract ID from Location header if not in body
        if not result.resource_id and result.location:
            # Location format: "ResourceType/id/_history/version"
            parts = result.location.split("/")
            if len(parts) >= 2:
                result.resource_id = parts[-1].split("?")[0]
                if result.resource_id == "_history" and len(parts) >= 3:
                    result.resource_id = parts[-3]

        return result

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    def create_resource(
        self, resource_type: str, resource: dict, if_none_exist: str | None = None
    ) -> FHIRResponse:
        """
        Create a new FHIR resource.

        Args:
            resource_type: FHIR resource type (e.g., "Patient")
            resource: Resource data (must include resourceType)
            if_none_exist: Conditional create search query

        Returns:
            FHIRResponse with created resource details

        Raises:
            FHIRValidationError: If resource fails server validation
            FHIRConflictError: If conditional create finds existing resource

        Example:
            >>> result = client.create_resource("Patient", {
            ...     "resourceType": "Patient",
            ...     "name": [{"family": "Test"}]
            ... })
            >>> print(result.resource_id)
        """
        url = self._build_url(resource_type)
        headers = {}

        if if_none_exist:
            headers["If-None-Exist"] = if_none_exist

        logger.debug(f"Creating {resource_type} resource")
        result = self._make_request("POST", url, data=resource, headers=headers)

        if result.status_code == 201:
            logger.info(
                f"Created {resource_type}/{result.resource_id} "
                f"in {result.response_time_ms:.1f}ms"
            )
        elif result.status_code == 200:
            # Conditional create - resource already exists
            logger.info(f"Resource already exists: {resource_type}/{result.resource_id}")
        elif result.status_code == 400:
            raise FHIRValidationError(f"Validation failed: {result.get_error_message()}", result)
        elif result.status_code == 409:
            raise FHIRConflictError(f"Conflict: {result.get_error_message()}", result)

        return result

    def read_resource(
        self, resource_type: str, resource_id: str, version: str | None = None
    ) -> FHIRResponse:
        """
        Read a FHIR resource by ID.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID
            version: Specific version to read (optional)

        Returns:
            FHIRResponse with resource data

        Raises:
            FHIRNotFoundError: If resource doesn't exist

        Example:
            >>> result = client.read_resource("Patient", "12345")
            >>> print(result.resource["name"])
        """
        if version:
            url = self._build_url(resource_type, resource_id, "_history", version)
        else:
            url = self._build_url(resource_type, resource_id)

        logger.debug(f"Reading {resource_type}/{resource_id}")
        result = self._make_request("GET", url)

        if result.status_code == 404:
            raise FHIRNotFoundError(f"{resource_type}/{resource_id} not found", result)

        if result.success:
            logger.debug(f"Read {resource_type}/{resource_id} in {result.response_time_ms:.1f}ms")

        return result

    def update_resource(
        self,
        resource_type: str,
        resource_id: str,
        resource: dict,
        if_match: str | None = None,
    ) -> FHIRResponse:
        """
        Update an existing FHIR resource (full replacement).

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID to update
            resource: Complete updated resource
            if_match: ETag for optimistic locking

        Returns:
            FHIRResponse with updated resource

        Raises:
            FHIRNotFoundError: If resource doesn't exist
            FHIRConflictError: If version mismatch (when if_match provided)

        Example:
            >>> patient["name"][0]["family"] = "Updated"
            >>> result = client.update_resource("Patient", "12345", patient)
        """
        url = self._build_url(resource_type, resource_id)
        headers = {}

        if if_match:
            headers["If-Match"] = if_match

        # Ensure resource has correct ID
        resource = {**resource, "id": resource_id}

        logger.debug(f"Updating {resource_type}/{resource_id}")
        result = self._make_request("PUT", url, data=resource, headers=headers)

        if result.status_code == 404:
            raise FHIRNotFoundError(f"{resource_type}/{resource_id} not found", result)
        if result.status_code == 409:
            raise FHIRConflictError(f"Version conflict: {result.get_error_message()}", result)

        if result.success:
            logger.info(
                f"Updated {resource_type}/{resource_id} " f"in {result.response_time_ms:.1f}ms"
            )

        return result

    def patch_resource(
        self,
        resource_type: str,
        resource_id: str,
        patch_operations: list[dict],
        if_match: str | None = None,
    ) -> FHIRResponse:
        """
        Partially update a FHIR resource using JSON Patch.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID
            patch_operations: List of JSON Patch operations
            if_match: ETag for optimistic locking

        Returns:
            FHIRResponse with patched resource

        Example:
            >>> result = client.patch_resource("Patient", "12345", [
            ...     {"op": "replace", "path": "/active", "value": False}
            ... ])
        """
        url = self._build_url(resource_type, resource_id)
        headers = {"Content-Type": "application/json-patch+json"}

        if if_match:
            headers["If-Match"] = if_match

        logger.debug(f"Patching {resource_type}/{resource_id}")
        result = self._make_request("PATCH", url, data=patch_operations, headers=headers)

        if result.status_code == 404:
            raise FHIRNotFoundError(f"{resource_type}/{resource_id} not found", result)

        return result

    def delete_resource(self, resource_type: str, resource_id: str) -> FHIRResponse:
        """
        Delete a FHIR resource.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID to delete

        Returns:
            FHIRResponse indicating success/failure

        Example:
            >>> result = client.delete_resource("Patient", "12345")
            >>> print(result.success)
        """
        url = self._build_url(resource_type, resource_id)

        logger.debug(f"Deleting {resource_type}/{resource_id}")
        result = self._make_request("DELETE", url)

        if result.success:
            logger.info(
                f"Deleted {resource_type}/{resource_id} " f"in {result.response_time_ms:.1f}ms"
            )

        return result

    # =========================================================================
    # Search Operations
    # =========================================================================

    def search(
        self,
        resource_type: str,
        params: dict[str, Any] | None = None,
        count: int | None = None,
    ) -> FHIRSearchResult:
        """
        Search for FHIR resources.

        Args:
            resource_type: FHIR resource type to search
            params: Search parameters (FHIR search syntax)
            count: Number of results per page

        Returns:
            FHIRSearchResult with matching resources

        Example:
            >>> result = client.search("Patient", {"family": "Test", "_count": 10})
            >>> for patient in result:
            ...     print(patient["name"])
        """
        url = self._build_url(resource_type)
        search_params = params or {}

        if count:
            search_params["_count"] = count

        logger.debug(f"Searching {resource_type} with params: {search_params}")
        result = self._make_request("GET", url, params=search_params)

        search_result = FHIRSearchResult(
            success=result.success,
            total=0,
            response_time_ms=result.response_time_ms,
        )

        if result.success and result.resource:
            bundle = result.resource
            search_result.total = bundle.get("total", 0)

            # Extract resources from bundle entries
            for entry in bundle.get("entry", []):
                if "resource" in entry:
                    search_result.resources.append(entry["resource"])

            # Extract navigation links
            for link in bundle.get("link", []):
                relation = link.get("relation")
                url = link.get("url")
                if relation and url:
                    search_result.link[relation] = url

        logger.debug(
            f"Search returned {len(search_result.resources)} of {search_result.total} "
            f"resources in {search_result.response_time_ms:.1f}ms"
        )

        return search_result

    # =========================================================================
    # Bundle Operations
    # =========================================================================

    def submit_bundle(self, bundle: dict, bundle_type: str = "transaction") -> FHIRResponse:
        """
        Submit a FHIR Bundle.

        Args:
            bundle: FHIR Bundle resource
            bundle_type: Expected bundle type (transaction, batch, message)

        Returns:
            FHIRResponse with bundle response

        Raises:
            ValueError: If bundle type doesn't match expected

        Example:
            >>> bundle = {"resourceType": "Bundle", "type": "transaction", ...}
            >>> result = client.submit_bundle(bundle)
        """
        if bundle.get("type") != bundle_type:
            logger.warning(
                f"Bundle type mismatch: expected {bundle_type}, " f"got {bundle.get('type')}"
            )

        url = self.base_url

        logger.debug(f"Submitting {bundle_type} bundle")
        result = self._make_request("POST", url, data=bundle)

        if result.success:
            logger.info(f"Submitted {bundle_type} bundle in {result.response_time_ms:.1f}ms")

        return result

    def submit_transaction(self, bundle: dict) -> FHIRResponse:
        """
        Submit a transaction bundle (all-or-nothing).

        Transaction bundles are processed atomically - if any entry fails,
        the entire transaction is rolled back.

        Args:
            bundle: FHIR Bundle with type "transaction"

        Returns:
            FHIRResponse with transaction results
        """
        # Ensure bundle type is transaction
        bundle = {**bundle, "type": "transaction"}
        return self.submit_bundle(bundle, bundle_type="transaction")

    def submit_message(self, bundle: dict) -> FHIRResponse:
        """
        Submit a message bundle.

        Used for event-driven messaging (e.g., SHA claims submission).

        Args:
            bundle: FHIR Bundle with type "message"

        Returns:
            FHIRResponse with message processing result
        """
        return self.submit_bundle(bundle, bundle_type="message")

    # =========================================================================
    # Server Operations
    # =========================================================================

    def get_capability_statement(self) -> FHIRResponse:
        """
        Get server's CapabilityStatement (metadata).

        Returns:
            FHIRResponse with CapabilityStatement resource
        """
        url = self._build_url("metadata")
        return self._make_request("GET", url)

    def check_health(self) -> bool:
        """
        Check if FHIR server is healthy.

        Returns:
            True if server responds to metadata request
        """
        try:
            result = self.get_capability_statement()
            return result.success
        except FHIRClientError:
            return False

    def get_resource_history(self, resource_type: str, resource_id: str) -> FHIRSearchResult:
        """
        Get version history for a resource.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID

        Returns:
            FHIRSearchResult with historical versions
        """
        url = self._build_url(resource_type, resource_id, "_history")

        result = self._make_request("GET", url)

        search_result = FHIRSearchResult(
            success=result.success,
            total=0,
            response_time_ms=result.response_time_ms,
        )

        if result.success and result.resource:
            bundle = result.resource
            search_result.total = bundle.get("total", 0)
            for entry in bundle.get("entry", []):
                if "resource" in entry:
                    search_result.resources.append(entry["resource"])

        return search_result

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def validate_resource(self, resource_type: str, resource: dict) -> FHIRResponse:
        """
        Validate a resource against server's profiles.

        Uses the $validate operation to check resource validity.

        Args:
            resource_type: FHIR resource type
            resource: Resource to validate

        Returns:
            FHIRResponse with OperationOutcome
        """
        url = self._build_url(resource_type, "$validate")
        return self._make_request("POST", url, data=resource)

    def expunge_all(self, resource_type: str | None = None) -> FHIRResponse:
        """
        Expunge (hard delete) resources from server.

        WARNING: This permanently deletes data and history!

        Args:
            resource_type: Specific type to expunge, or None for all

        Returns:
            FHIRResponse indicating success
        """
        if resource_type:
            url = self._build_url(resource_type, "$expunge")
        else:
            url = self._build_url("$expunge")

        params = {
            "expungeDeletedResources": "true",
            "expungePreviousVersions": "true",
            "_cascade": "delete",
        }

        logger.warning(f"Expunging all {resource_type or 'resources'}")
        return self._make_request("POST", url, data={}, params=params)


# =============================================================================
# Convenience Functions
# =============================================================================


def create_fhir_client(base_url: str | None = None, **kwargs) -> FHIRClient:
    """
    Create a FHIR client with default settings.

    Args:
        base_url: FHIR server URL (defaults to local HAPI)
        **kwargs: Additional FHIRClient arguments

    Returns:
        Configured FHIRClient instance
    """
    if base_url is None:
        base_url = "http://localhost:8090/fhir"

    return FHIRClient(base_url, **kwargs)


def create_test_patient(client: FHIRClient, **overrides) -> FHIRResponse:
    """
    Create a test patient resource.

    Useful for integration tests that need sample data.

    Args:
        client: FHIRClient instance
        **overrides: Fields to override in default patient

    Returns:
        FHIRResponse with created patient
    """
    patient = {
        "resourceType": "Patient",
        "identifier": [
            {
                "system": "urn:sha:client-registry",
                "value": f"TEST-{uuid.uuid4().hex[:8].upper()}",
            }
        ],
        "active": True,
        "name": [
            {
                "use": "official",
                "family": "Test",
                "given": ["Integration"],
            }
        ],
        "gender": "unknown",
        "birthDate": "2000-01-01",
        **overrides,
    }

    return client.create_resource("Patient", patient)
