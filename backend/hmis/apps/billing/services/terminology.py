"""
Terminology Service for Vitora HMIS.

This module handles integration with Kenya DHA Terminology APIs
for standardized medical coding. Implements remote-first approach
with local database fallback.

Reference: docs/dha-api-usage-analysis.md
Official Endpoints:
    - GET /v1/sha-interventions - SHA interventions catalog
    - GET /v1/icd-11 - ICD-11 disease classification
    - GET /v1/drug-products - Drug products catalog
    - GET /v1/active-component - Active pharmaceutical ingredients
    - GET /v1/loinc - LOINC lab observation codes
    - GET /v1/ichi - ICHI intervention classification
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

import requests
from django.conf import settings
from django.db.models import Q

from .intervention_fallback import get_local_intervention, search_local_interventions
from .sha_auth import SHAAuthError, SHAAuthService

logger = logging.getLogger(__name__)


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class InterventionCode:
    """
    SHA Intervention code for reimbursement.

    Represents a standardized SHA intervention for billing and claims.

    Attributes:
        code: SHA intervention code (e.g., 'SHA-INT-001')
        name: Intervention name
        description: Detailed description
        category: Intervention category
        price: SHA reimbursement price
        facility_level: Minimum facility level (1-6)
        is_active: Whether intervention is currently valid
        effective_date: When this intervention became effective
        raw_data: Original API response
    """

    code: str
    name: str
    description: str | None = None
    category: str | None = None
    price: Decimal | None = None
    facility_level: int | None = None
    is_active: bool = True
    effective_date: date | None = None
    raw_data: dict = field(default_factory=dict)
    max_amount_per_test: str | None = None
    quantity_per_year: str | None = None
    requires_preauthorization: bool = False

    @classmethod
    def from_api_response(cls, data: dict) -> "InterventionCode":
        """Create from DHA API response."""
        # Parse price
        price = data.get("price") or data.get("sha_price")
        if price is not None:
            price = Decimal(str(price))

        # Parse facility level from levels list or direct field
        level = data.get("facility_level") or data.get("min_facility_level")
        levels = data.get("levels", [])
        if not level and levels:
            # Extract minimum level from levels array: [{"2": "..."}, {"3": "..."}]
            level_nums = []
            for lvl in levels:
                if isinstance(lvl, dict):
                    level_nums.extend(int(k) for k in lvl if k.isdigit())
            level = min(level_nums) if level_nums else None
        if isinstance(level, str):
            level = int(level.replace("LEVEL ", "").strip())

        # Parse effective date
        eff_date = data.get("effective_date")
        if isinstance(eff_date, str):
            eff_date = datetime.strptime(eff_date, "%Y-%m-%d").date()

        return cls(
            code=data.get("intervention_code", "") or data.get("code", ""),
            name=data.get("intervention_name", "") or data.get("name", ""),
            description=data.get("description"),
            category=data.get("category"),
            price=price,
            facility_level=level,
            is_active=data.get("is_active", True),
            effective_date=eff_date,
            raw_data=data,
        )


@dataclass
class ICD11Code:
    """
    ICD-11 disease classification code.

    Represents a disease/condition code from the WHO ICD-11
    classification system.

    Attributes:
        code: ICD-11 code (e.g., '1A00')
        title: Disease/condition title
        description: Detailed description
        parent_code: Parent category code
        chapter: ICD-11 chapter
        is_leaf: Whether this is a leaf node (most specific)
        raw_data: Original API response
    """

    code: str
    title: str
    description: str | None = None
    parent_code: str | None = None
    chapter: str | None = None
    is_leaf: bool = True
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "ICD11Code":
        """Create from DHA API response."""
        return cls(
            code=data.get("icd_11_code", "") or data.get("code", ""),
            title=data.get("description", "") or data.get("title", "") or data.get("name", ""),
            description=data.get("description"),
            parent_code=data.get("parent_code"),
            chapter=data.get("chapter"),
            is_leaf=data.get("is_leaf", True),
            raw_data=data,
        )


@dataclass
class DrugProduct:
    """
    Drug product from DHA HPT Registry.

    Maps to the DHA Terminology API response from
    GET /terminology/v1/product.

    Attributes:
        product_id: DHA unique product identifier (integer)
        brand_name: Commercial brand name
        generic_name: Generic/INN name
        brand_display_name: Full brand display (e.g., 'Glucodeal 500 mg Oral Tablet')
        generic_display_name: Full generic display (e.g., 'Metformin 500 mg Oral Tablet')
        generic_concept_id: DHA generic concept grouping ID
        strength_amount: Numeric strength (e.g., '500')
        strength_unit: Strength unit (e.g., 'mg')
        route_description: Administration route (e.g., 'Oral')
        form_description: Dosage form (e.g., 'Tablet')
        ppb_registration_code: Kenya PPB registration code
        etcd: ETCD identifier
        knhts_concept_id: KNHTS concept ID — primary HPT code (e.g., '10-03913-01')
        updation_date: Last update timestamp from DHA
        raw_data: Original API response
    """

    product_id: int
    brand_name: str
    generic_name: str = ""
    brand_display_name: str = ""
    generic_display_name: str = ""
    generic_concept_id: int | None = None
    strength_amount: str = ""
    strength_unit: str = ""
    route_description: str = ""
    form_description: str = ""
    ppb_registration_code: str = ""
    etcd: str = ""
    knhts_concept_id: str = ""
    updation_date: str = ""
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "DrugProduct":
        """Create from DHA API response."""
        product_id = data.get("product_id", 0)
        if isinstance(product_id, str):
            product_id = int(product_id) if product_id.isdigit() else 0

        generic_concept_id = data.get("generic_concept_id")
        if isinstance(generic_concept_id, str):
            generic_concept_id = int(generic_concept_id) if generic_concept_id.isdigit() else None

        return cls(
            product_id=product_id,
            brand_name=data.get("brand_name", "") or data.get("name", ""),
            generic_name=data.get("generic_name", ""),
            brand_display_name=data.get("brand_display_name", ""),
            generic_display_name=data.get("generic_display_name", ""),
            generic_concept_id=generic_concept_id,
            strength_amount=data.get("strength_amount", ""),
            strength_unit=data.get("strength_unit", ""),
            route_description=data.get("route_description", ""),
            form_description=data.get("form_description", ""),
            ppb_registration_code=data.get("ppb_registration_code", ""),
            etcd=data.get("etcd", ""),
            knhts_concept_id=data.get("knhts_concept_id", ""),
            updation_date=data.get("updation_date", ""),
            raw_data=data,
        )


@dataclass
class ComponentLink:
    """
    Link between an active component and its ATC classification.

    From the DHA API nested 'component_links' array.
    """

    active_component_link_id: int
    active_component_line: int
    active_component_id: int
    component_name: str
    component_atc_code: str

    @classmethod
    def from_api_response(cls, data: dict) -> "ComponentLink":
        """Create from API response."""
        return cls(
            active_component_link_id=data.get("active_component_link_id", 0),
            active_component_line=data.get("active_component_line", 0),
            active_component_id=data.get("active_component_id", 0),
            component_name=data.get("component_name", ""),
            component_atc_code=data.get("component_atc_code", ""),
        )


@dataclass
class ActiveComponent:
    """
    Active pharmaceutical ingredient from DHA HPT Registry.

    Maps to the DHA Terminology API response from
    GET /terminology/v1/active-component.

    Attributes:
        component_id: DHA unique component identifier
        name: Component description / INN name (e.g., 'Metformin')
        component_links: List of ATC classification links
        raw_data: Original API response
    """

    component_id: int
    name: str
    component_links: list[ComponentLink] = field(default_factory=list)
    raw_data: dict = field(default_factory=dict)

    @property
    def atc_codes(self) -> list[str]:
        """Extract all ATC codes from component links."""
        return [link.component_atc_code for link in self.component_links if link.component_atc_code]

    @property
    def atc_code(self) -> str | None:
        """Primary ATC code (first link), for backward compatibility."""
        codes = self.atc_codes
        return codes[0] if codes else None

    @classmethod
    def from_api_response(cls, data: dict) -> "ActiveComponent":
        """Create from DHA API response."""
        component_id = data.get("active_component_id", 0) or data.get("component_id", 0)
        if isinstance(component_id, str):
            component_id = int(component_id) if component_id.isdigit() else 0

        # Parse nested component_links
        links_data = data.get("component_links", [])
        links = [ComponentLink.from_api_response(link) for link in links_data]

        return cls(
            component_id=component_id,
            name=data.get("component_description", "") or data.get("name", ""),
            component_links=links,
            raw_data=data,
        )


@dataclass
class RemoteLOINCCode:
    """
    LOINC observation code from remote API.

    Represents a laboratory observation code from Regenstrief's
    LOINC database, fetched from DHA API.

    Note: Falls back to local LOINCCode model if API unavailable.

    Attributes:
        loinc_num: LOINC code number (e.g., '2345-7')
        component: What is measured
        property: Kind of property
        time_aspect: Timing (Pt, 24H, etc.)
        system: Body system/specimen
        scale_type: Scale (Qn, Ord, etc.)
        method_type: Method used
        long_common_name: Full descriptive name
        short_name: Abbreviated name
        status: Active, deprecated, etc.
        raw_data: Original API response
    """

    loinc_num: str
    component: str
    property: str | None = None
    time_aspect: str | None = None
    system: str | None = None
    scale_type: str | None = None
    method_type: str | None = None
    long_common_name: str | None = None
    short_name: str | None = None
    status: str = "ACTIVE"
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "RemoteLOINCCode":
        """Create from DHA API response."""
        return cls(
            loinc_num=data.get("loinc_num", "") or data.get("code", ""),
            component=data.get("component", "") or data.get("name", ""),
            property=data.get("property"),
            time_aspect=data.get("time_aspect"),
            system=data.get("system"),
            scale_type=data.get("scale_type"),
            method_type=data.get("method_type"),
            long_common_name=data.get("display_name") or data.get("long_common_name"),
            short_name=data.get("short_name"),
            status=data.get("status", "ACTIVE"),
            raw_data=data,
        )


@dataclass
class ICHICode:
    """
    ICHI intervention classification code.

    Represents an intervention from WHO's International
    Classification of Health Interventions.

    Attributes:
        code: ICHI code
        title: Intervention title
        definition: Intervention definition
        target: Target body system/entity
        action: Type of action
        means: Means of intervention
        raw_data: Original API response
    """

    code: str
    title: str
    definition: str | None = None
    target: str | None = None
    action: str | None = None
    means: str | None = None
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "ICHICode":
        """Create from DHA API response."""
        return cls(
            code=data.get("code", "") or data.get("id_code", ""),
            title=data.get("clean_title", "") or data.get("title", "") or data.get("name", ""),
            definition=data.get("definition"),
            target=data.get("target"),
            action=data.get("action"),
            means=data.get("mean") or data.get("means"),
            raw_data=data,
        )


# =============================================================================
# Custom Exceptions
# =============================================================================


class TerminologyError(Exception):
    """
    Base exception for Terminology operations.

    Attributes:
        message: Error description
        status_code: HTTP status code if applicable
        terminology_type: Which terminology system failed
    """

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        terminology_type: str | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.terminology_type = terminology_type
        super().__init__(message)

    def __str__(self):
        parts = ["TerminologyError"]
        if self.terminology_type:
            parts.append(f"[{self.terminology_type}]")
        if self.status_code:
            parts.append(f"({self.status_code})")
        parts.append(f": {self.message}")
        return "".join(parts)


class CodeNotFoundError(TerminologyError):
    """Raised when a terminology code is not found."""

    def __init__(self, code: str, terminology: str):
        self.code = code
        super().__init__(
            message=f"Code '{code}' not found in {terminology}",
            status_code=404,
            terminology_type=terminology,
        )


# =============================================================================
# Service Class
# =============================================================================


class TerminologyService:
    """
    Service for interacting with Kenya DHA Terminology APIs.

    This service provides methods to search and retrieve standardized
    medical codes from various terminology systems via the Digital
    Health Agency APIs.

    Strategy:
        - Remote API first for most up-to-date data
        - Local database fallback when API unavailable
        - Caching for frequently accessed codes

    Supported Terminologies:
        - SHA Interventions: Kenya SHA reimbursement codes
        - ICD-11: WHO disease classification
        - Drug Products: NMRA drug catalog
        - Active Components: Pharmaceutical ingredients
        - LOINC: Lab observation codes (remote + local fallback)
        - ICHI: Health intervention classification

    Attributes:
        api_base_url: DHA API base URL
        timeout: Request timeout in seconds
        auth_service: SHAAuthService instance
        use_local_fallback: Whether to use local DB on API failure

    Example:
        >>> ts = TerminologyService()
        >>> interventions = ts.search_interventions('consultation')
        >>> for i in interventions:
        ...     print(f"{i.code}: {i.name} - KES {i.price}")
    """

    def __init__(self, use_local_fallback: bool = True):
        """
        Initialize TerminologyService.

        Args:
            use_local_fallback: If True, use local DB when API fails
        """
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = getattr(settings, "SHA_API_TIMEOUT", 30)
        self.use_local_fallback = use_local_fallback

        # Get endpoint paths from settings (Official Kenya Digital Superhighway paths)
        # Reference: Kenya Digital Superhighway.postman_collection.json
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})
        self.interventions_endpoint = endpoints.get(
            "sha_interventions", "/terminology/v1/sha-intervention"
        )
        self.icd11_endpoint = endpoints.get("icd11", "/terminology/v1/icd11")
        self.products_endpoint = endpoints.get("drug_products", "/terminology/v1/product")
        self.components_endpoint = endpoints.get(
            "active_components", "/terminology/v1/active-component"
        )
        self.loinc_endpoint = endpoints.get("loinc", "/terminology/v1/loinc")
        self.ichi_endpoint = endpoints.get("ichi", "/terminology/v1/ichi")

        # HAPI FHIR server settings (LOINC fallback)
        self.fhir_base_url = getattr(settings, "HAPI_FHIR_BASE_URL", "http://localhost:8090/fhir")
        self.fhir_timeout = getattr(settings, "HAPI_FHIR_TIMEOUT", 10)
        self.fhir_enabled = getattr(settings, "HAPI_FHIR_ENABLED", True)

        # Initialize auth service
        self.auth_service = SHAAuthService()

    # =========================================================================
    # Response Helpers
    # =========================================================================

    @staticmethod
    def _unwrap_dha_response(response_json: dict, data_key: str) -> list[dict]:
        """
        Unwrap the standard DHA API response envelope.

        DHA APIs wrap responses in: { IsSuccess, Message, Errors, Data: { <key>: [...], count } }
        This helper extracts the list from Data[key], with fallback for
        alternate response formats.
        """
        # Check for DHA envelope format
        if "IsSuccess" in response_json:
            if not response_json.get("IsSuccess"):
                errors = response_json.get("Errors", [])
                message = response_json.get("Message", "Unknown error")
                logger.warning("DHA API returned IsSuccess=false: %s, errors=%s", message, errors)
                return []
            data = response_json.get("Data", {})
            if isinstance(data, dict):
                results = data.get(data_key, [])
                if isinstance(results, list):
                    return results
                return [results] if results else []
            return []

        # Fallback: try direct key access (older format or mocked responses)
        results = (
            response_json.get(data_key)
            or response_json.get("results")
            or response_json.get("data")
            or []
        )
        if isinstance(results, dict):
            return [results]
        return results if isinstance(results, list) else []

    # =========================================================================
    # SHA Interventions
    # =========================================================================

    def search_interventions(
        self,
        query: str,
        facility_level: int | None = None,
        category: str | None = None,
        limit: int = 50,
        force_remote: bool = False,
    ) -> list[InterventionCode]:
        """
        Search SHA interventions catalog.

        Uses local-first strategy: serves from local JSONL data for speed,
        falls back to DHA API only when local data is unavailable or
        force_remote=True.

        Args:
            query: Search term (name or code)
            facility_level: Filter by minimum facility level (1-6)
            category: Filter by category
            limit: Maximum results to return
            force_remote: If True, skip local and call DHA API directly

        Returns:
            List of matching InterventionCode objects

        Raises:
            TerminologyError: If search fails and no fallback available

        Example:
            >>> results = service.search_interventions('consultation')
            >>> print(f"Found {len(results)} interventions")
        """
        logger.info(f"Searching SHA interventions: query='{query}'")

        # Local-first: serve from JSONL unless forced remote
        if not force_remote:
            local_results, _ = search_local_interventions(
                query=query,
                facility_level=facility_level,
                category=category,
                limit=limit,
            )
            if local_results:
                logger.debug(
                    "Served %d interventions from local store for query='%s'",
                    len(local_results),
                    query,
                )
                return [InterventionCode(**kwargs) for kwargs in local_results]
            # Local store empty (missing JSONL or no matches) — try remote
            logger.info("Local store returned no results, trying DHA API")

        # Remote DHA API
        params = {
            "search": query,
            "limit": limit,
        }
        if facility_level is not None:
            params["facility_level"] = facility_level
        if category:
            params["category"] = category

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.interventions_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 401:
                raise TerminologyError(
                    "Authentication failed",
                    status_code=401,
                    terminology_type="SHA_INTERVENTIONS",
                )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "shaInterventions")
            return [InterventionCode.from_api_response(r) for r in results]

        except SHAAuthError as e:
            raise TerminologyError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
                terminology_type="SHA_INTERVENTIONS",
            )
        except requests.Timeout:
            raise TerminologyError(
                "Request timed out",
                terminology_type="SHA_INTERVENTIONS",
            )
        except requests.RequestException as e:
            raise TerminologyError(
                f"Request failed: {str(e)}",
                terminology_type="SHA_INTERVENTIONS",
            )

    def get_intervention(self, code: str, force_remote: bool = False) -> InterventionCode:
        """
        Get a specific SHA intervention by code.

        Uses local-first strategy: checks local JSONL data first,
        falls back to DHA API if not found locally or force_remote=True.

        Args:
            code: SHA intervention code
            force_remote: If True, skip local and call DHA API directly

        Returns:
            InterventionCode for the specified code

        Raises:
            CodeNotFoundError: If code not found in local or remote
            TerminologyError: If remote request fails and code not available locally
        """
        logger.info(f"Fetching SHA intervention: {code}")

        # Local-first: check JSONL store
        if not force_remote:
            local = get_local_intervention(code)
            if local:
                logger.debug("Served intervention '%s' from local store", code)
                return InterventionCode(**local)
            # Not found locally — try remote
            logger.info("Intervention '%s' not in local store, trying DHA API", code)

        # Remote DHA API
        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.interventions_endpoint}/{code}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(code, "SHA_INTERVENTIONS")

            response.raise_for_status()

            data = response.json()
            intervention_data = data.get("intervention") or data

            return InterventionCode.from_api_response(intervention_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch intervention: {str(e)}",
                terminology_type="SHA_INTERVENTIONS",
            )

    def get_interventions_for_facility_level(
        self,
        facility_level: int,
    ) -> list[InterventionCode]:
        """
        Get all interventions available at a facility level.

        Args:
            facility_level: Facility level (1-6)

        Returns:
            List of InterventionCode available at that level
        """
        return self.search_interventions(
            query="",
            facility_level=facility_level,
            limit=1000,
        )

    # =========================================================================
    # ICD-11
    # =========================================================================

    def search_icd11(
        self,
        query: str,
        chapter: str | None = None,
        limit: int = 50,
    ) -> list[ICD11Code]:
        """
        Search ICD-11 disease codes.

        Args:
            query: Search term (title or code)
            chapter: Filter by ICD-11 chapter
            limit: Maximum results

        Returns:
            List of matching ICD11Code objects

        Raises:
            TerminologyError: If search fails
        """
        logger.info(f"Searching ICD-11: query='{query}'")

        try:
            return self._search_icd11_remote(query, chapter, limit)
        except TerminologyError as e:
            logger.warning(f"Remote ICD-11 search failed: {e}")

        if self.use_local_fallback:
            logger.info("Using local database fallback for ICD-11")
            return self._search_icd11_local(query, limit)

        raise TerminologyError(
            "All ICD-11 sources unavailable",
            terminology_type="ICD11",
        )

    def _search_icd11_remote(
        self,
        query: str,
        chapter: str | None,
        limit: int,
    ) -> list[ICD11Code]:
        """Search ICD-11 via remote DHA API."""

        params = {
            "search": query,
            "limit": limit,
        }
        if chapter:
            params["chapter"] = chapter

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.icd11_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 401:
                raise TerminologyError(
                    "Authentication failed",
                    status_code=401,
                    terminology_type="ICD11",
                )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "icd11")
            return [ICD11Code.from_api_response(r) for r in results]

        except SHAAuthError as e:
            raise TerminologyError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
                terminology_type="ICD11",
            )
        except requests.RequestException as e:
            raise TerminologyError(
                f"Request failed: {str(e)}",
                terminology_type="ICD11",
            )

    def _search_icd11_local(
        self,
        query: str,
        limit: int,
    ) -> list[ICD11Code]:
        """Search ICD-11 in the local database fallback."""
        try:
            from hmis.apps.billing.models import ICD11CodeReference

            local_codes = ICD11CodeReference.objects.filter(
                Q(code__icontains=query)
                | Q(title__icontains=query)
                | Q(description__icontains=query),
                is_active=True,
            ).order_by("code")[:limit]

            return [
                ICD11Code(
                    code=code.code,
                    title=code.title,
                    description=code.description or code.title,
                    chapter=code.chapter or code.chapter_no,
                    is_leaf=code.is_leaf,
                    raw_data={
                        "source": "local_icd11_database",
                        "entity_id": code.entity_id,
                        "class_kind": code.class_kind,
                    },
                )
                for code in local_codes
            ]
        except Exception as e:
            logger.error(f"Local ICD-11 fallback failed: {e}")
            return []

    def get_icd11(self, code: str) -> ICD11Code:
        """
        Get a specific ICD-11 code.

        Args:
            code: ICD-11 code (e.g., '1A00')

        Returns:
            ICD11Code for the specified code

        Raises:
            CodeNotFoundError: If code not found
        """
        logger.info(f"Fetching ICD-11 code: {code}")

        try:
            return self._get_icd11_remote(code)
        except CodeNotFoundError:
            pass
        except TerminologyError as e:
            logger.warning(f"Remote ICD-11 fetch failed: {e}")

        if self.use_local_fallback:
            try:
                return self._get_icd11_local(code)
            except CodeNotFoundError:
                pass

        raise CodeNotFoundError(code, "ICD11")

    def _get_icd11_remote(self, code: str) -> ICD11Code:
        """Get a specific ICD-11 code via remote DHA API."""

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.icd11_endpoint}/{code}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(code, "ICD11")

            response.raise_for_status()

            data = response.json()
            code_data = data.get("code") or data

            return ICD11Code.from_api_response(code_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch ICD-11 code: {str(e)}",
                terminology_type="ICD11",
            )

    def _get_icd11_local(self, code: str) -> ICD11Code:
        """Get ICD-11 from the local database fallback."""
        from hmis.apps.billing.models import ICD11CodeReference

        try:
            local_code = ICD11CodeReference.objects.get(code=code.upper(), is_active=True)
        except ICD11CodeReference.DoesNotExist as exc:
            raise CodeNotFoundError(code, "ICD11") from exc

        return ICD11Code(
            code=local_code.code,
            title=local_code.title,
            description=local_code.description or local_code.title,
            chapter=local_code.chapter or local_code.chapter_no,
            is_leaf=local_code.is_leaf,
            raw_data={
                "source": "local_icd11_database",
                "entity_id": local_code.entity_id,
                "class_kind": local_code.class_kind,
            },
        )

    # =========================================================================
    # Drug Products
    # =========================================================================

    def search_drug_products(
        self,
        query: str = "",
        *,
        product_id: int | None = None,
        generic_concept_id: int | None = None,
        form_id: int | None = None,
        route_id: int | None = None,
        limit: int = 50,
    ) -> list[DrugProduct]:
        """
        Search drug products catalog via DHA HPT Registry.

        Args:
            query: Search term (brand name, generic name, PPB code, KNHTS concept ID)
            product_id: Search by specific DHA product ID
            generic_concept_id: Search by generic concept grouping
            form_id: Filter by dosage form ID
            route_id: Filter by administration route ID
            limit: Maximum results

        Returns:
            List of matching DrugProduct objects
        """
        logger.info(f"Searching drug products: query='{query}'")

        params: dict[str, str | int] = {}
        if query:
            params["search"] = query
        if product_id is not None:
            params["product_id"] = product_id
        if generic_concept_id is not None:
            params["generic_concept_id"] = generic_concept_id
        if form_id is not None:
            params["form_id"] = form_id
        if route_id is not None:
            params["route_id"] = route_id

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.products_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "products")
            return [DrugProduct.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search drug products: {str(e)}",
                terminology_type="DRUG_PRODUCTS",
            )

    def get_drug_product(self, product_id: int) -> DrugProduct:
        """
        Get a specific drug product by DHA product ID.

        Args:
            product_id: DHA product identifier (integer)

        Returns:
            DrugProduct for the specified ID

        Raises:
            CodeNotFoundError: If product not found
        """
        logger.info(f"Fetching drug product: {product_id}")

        try:
            results = self.search_drug_products(product_id=product_id)
            if not results:
                raise CodeNotFoundError(str(product_id), "DRUG_PRODUCTS")
            return results[0]

        except TerminologyError:
            raise
        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch drug product: {str(e)}",
                terminology_type="DRUG_PRODUCTS",
            )

    # =========================================================================
    # Active Components
    # =========================================================================

    def search_active_components(
        self,
        query: str = "",
        *,
        exact_match: bool = False,
        active_component_id: int | None = None,
        limit: int = 50,
    ) -> list[ActiveComponent]:
        """
        Search active pharmaceutical components via DHA HPT Registry.

        Args:
            query: Search term (component description)
            exact_match: If True, only exact matches are returned
            active_component_id: Search by specific component ID
            limit: Maximum results

        Returns:
            List of matching ActiveComponent objects
        """
        logger.info(f"Searching active components: query='{query}'")

        params: dict[str, str | int | bool] = {}
        if query:
            params["search"] = query
        if exact_match:
            params["exact_match"] = "true"
        if active_component_id is not None:
            params["active_component_id"] = active_component_id

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.components_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "ac")
            return [ActiveComponent.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search active components: {str(e)}",
                terminology_type="ACTIVE_COMPONENTS",
            )

    # =========================================================================
    # LOINC (with FHIR and local fallback)
    # =========================================================================

    def search_loinc(
        self,
        query: str,
        limit: int = 50,
    ) -> list[RemoteLOINCCode]:
        """
        Search LOINC lab observation codes.

        Strategy: SHA/DHA API → FHIR Server → Local database fallback.

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of RemoteLOINCCode objects
        """
        logger.info(f"Searching LOINC codes: query='{query}'")

        # Try remote SHA/DHA API first
        try:
            return self._search_loinc_remote(query, limit)
        except TerminologyError as e:
            logger.warning(f"Remote LOINC search failed: {e}")

        # Try FHIR server as secondary fallback
        if self.fhir_enabled:
            try:
                logger.info("Trying FHIR server for LOINC lookup")
                results = self._search_loinc_fhir(query, limit)
                if results:
                    return results
            except Exception as e:
                logger.warning(f"FHIR LOINC search failed: {e}")

        # Final fallback: local database
        if self.use_local_fallback:
            logger.info("Using local database fallback for LOINC")
            return self._search_loinc_local(query, limit)

        raise TerminologyError(
            "All LOINC sources unavailable",
            terminology_type="LOINC",
        )

    def _search_loinc_remote(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """Search LOINC via remote API."""
        params = {
            "search": query,
            "limit": limit,
        }

        headers = self.auth_service.get_terminology_headers()

        response = requests.get(
            f"{self.api_base_url}{self.loinc_endpoint}",
            params=params,
            headers=headers,
            timeout=self.timeout,
        )

        if response.status_code == 401:
            raise TerminologyError(
                "Authentication failed",
                status_code=401,
                terminology_type="LOINC",
            )

        response.raise_for_status()

        data = response.json()
        results = self._unwrap_dha_response(data, "loinc")
        return [RemoteLOINCCode.from_api_response(r) for r in results]

    def _search_loinc_fhir(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """
        Search LOINC via FHIR terminology server (HAPI FHIR).

        Uses FHIR ValueSet $expand operation or CodeSystem $lookup.
        Reference: https://www.hl7.org/fhir/terminology-service.html

        Args:
            query: Search term (component name or LOINC code)
            limit: Maximum results

        Returns:
            List of RemoteLOINCCode objects
        """
        # Try ValueSet $expand for text search
        # LOINC ValueSet: http://loinc.org/vs/top-2000-lab-observations-si
        expand_url = f"{self.fhir_base_url}/ValueSet/$expand"
        params = {
            "url": "http://loinc.org/vs",
            "filter": query,
            "count": limit,
        }

        try:
            response = requests.get(
                expand_url,
                params=params,
                headers={"Accept": "application/fhir+json"},
                timeout=self.fhir_timeout,
            )

            if response.status_code == 200:
                data = response.json()
                return self._parse_fhir_loinc_valueset(data)

            # Fallback: try CodeSystem $lookup if exact code
            if self._is_loinc_code_format(query):
                return self._lookup_loinc_code_fhir(query)

        except requests.RequestException as e:
            logger.warning(f"FHIR LOINC $expand failed: {e}")
            raise

        return []

    def _parse_fhir_loinc_valueset(self, data: dict) -> list[RemoteLOINCCode]:
        """Parse FHIR ValueSet expansion to RemoteLOINCCode list."""
        results = []
        expansion = data.get("expansion", {})
        contains = expansion.get("contains", [])

        for item in contains:
            if item.get("system") != "http://loinc.org":
                continue

            code = item.get("code", "")
            display = item.get("display", "")

            # Parse component from display (format: "Component:Property:...")
            parts = display.split(":") if ":" in display else [display]
            component = parts[0] if parts else display

            results.append(
                RemoteLOINCCode(
                    loinc_num=code,
                    component=component,
                    property=parts[1] if len(parts) > 1 else "",
                    time_aspect=parts[2] if len(parts) > 2 else "",
                    system=parts[3] if len(parts) > 3 else "",
                    scale_type=parts[4] if len(parts) > 4 else "",
                    method_type=parts[5] if len(parts) > 5 else "",
                    long_common_name=display,
                    short_name=component[:100] if component else "",
                    status="ACTIVE",
                )
            )

        return results

    def _is_loinc_code_format(self, query: str) -> bool:
        """Check if query looks like a LOINC code (e.g., '2345-7')."""
        import re

        return bool(re.match(r"^\d+-\d+$", query.strip()))

    def _lookup_loinc_code_fhir(self, code: str) -> list[RemoteLOINCCode]:
        """Lookup a specific LOINC code via FHIR CodeSystem/$lookup."""
        lookup_url = f"{self.fhir_base_url}/CodeSystem/$lookup"
        params = {
            "system": "http://loinc.org",
            "code": code,
        }

        try:
            response = requests.get(
                lookup_url,
                params=params,
                headers={"Accept": "application/fhir+json"},
                timeout=self.fhir_timeout,
            )

            if response.status_code != 200:
                return []

            data = response.json()
            parameters = data.get("parameter", [])

            # Extract values from FHIR Parameters resource
            display = ""
            for param in parameters:
                if param.get("name") == "display":
                    display = param.get("valueString", "")
                    break

            if display:
                return [
                    RemoteLOINCCode(
                        loinc_num=code,
                        component=display,
                        property="",
                        time_aspect="",
                        system="",
                        scale_type="",
                        method_type="",
                        long_common_name=display,
                        short_name=display[:100],
                        status="ACTIVE",
                    )
                ]

        except requests.RequestException as e:
            logger.warning(f"FHIR LOINC $lookup failed: {e}")

        return []

    def _search_loinc_local(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """Search LOINC in local database fallback."""
        try:
            from hmis.apps.laboratory.models import LOINCCode

            local_codes = LOINCCode.objects.filter(
                Q(code__icontains=query)
                | Q(component__icontains=query)
                | Q(long_common_name__icontains=query)
            )[:limit]

            return [
                RemoteLOINCCode(
                    loinc_num=c.code,
                    component=c.component,
                    property=c.property,
                    time_aspect=c.time_aspect,
                    system=c.system,
                    scale_type=c.scale_type,
                    method_type=c.method_type,
                    long_common_name=c.long_common_name,
                    short_name=c.short_name,
                    status="ACTIVE",
                )
                for c in local_codes
            ]
        except Exception as e:
            logger.error(f"Local LOINC fallback failed: {e}")
            return []

    def get_loinc(self, loinc_num: str) -> RemoteLOINCCode:
        """
        Get a specific LOINC code.

        Strategy: SHA/DHA API → FHIR Server → Local database.

        Args:
            loinc_num: LOINC number (e.g., '2345-7')

        Returns:
            RemoteLOINCCode for the specified number

        Raises:
            CodeNotFoundError: If code not found in all sources
        """
        logger.info(f"Fetching LOINC code: {loinc_num}")

        # Try remote SHA/DHA API first
        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.loinc_endpoint}/{loinc_num}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(loinc_num, "LOINC")

            response.raise_for_status()

            data = response.json()
            code_data = data.get("code") or data

            return RemoteLOINCCode.from_api_response(code_data)

        except CodeNotFoundError:
            pass  # Continue to fallbacks
        except (SHAAuthError, requests.RequestException) as e:
            logger.warning(f"Remote LOINC fetch failed: {e}")

        # Try FHIR server as secondary fallback
        if self.fhir_enabled:
            try:
                results = self._lookup_loinc_code_fhir(loinc_num)
                if results:
                    return results[0]
            except Exception as e:
                logger.warning(f"FHIR LOINC lookup failed: {e}")

        # Final fallback: local database
        if self.use_local_fallback:
            try:
                return self._get_loinc_local(loinc_num)
            except CodeNotFoundError:
                pass

        raise CodeNotFoundError(loinc_num, "LOINC")

    def _get_loinc_local(self, loinc_num: str) -> RemoteLOINCCode:
        """Get LOINC from local database."""
        try:
            from hmis.apps.laboratory.models import LOINCCode

            c = LOINCCode.objects.get(code=loinc_num)
            return RemoteLOINCCode(
                loinc_num=c.code,
                component=c.component,
                property=c.property,
                time_aspect=c.time_aspect,
                system=c.system,
                scale_type=c.scale_type,
                method_type=c.method_type,
                long_common_name=c.long_common_name,
                short_name=c.short_name,
                status="ACTIVE",
            )
        except Exception:
            raise CodeNotFoundError(loinc_num, "LOINC")

    # =========================================================================
    # ICHI
    # =========================================================================

    def search_ichi(
        self,
        query: str,
        limit: int = 50,
    ) -> list[ICHICode]:
        """
        Search ICHI intervention codes.

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of matching ICHICode objects
        """
        logger.info(f"Searching ICHI codes: query='{query}'")

        params = {
            "search": query,
            "limit": limit,
        }

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.ichi_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "ichi")
            return [ICHICode.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search ICHI codes: {str(e)}",
                terminology_type="ICHI",
            )

    def get_ichi(self, code: str) -> ICHICode:
        """
        Get a specific ICHI code.

        Args:
            code: ICHI code

        Returns:
            ICHICode for the specified code

        Raises:
            CodeNotFoundError: If code not found
        """
        logger.info(f"Fetching ICHI code: {code}")

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.ichi_endpoint}/{code}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(code, "ICHI")

            response.raise_for_status()

            data = response.json()
            code_data = data.get("code") or data

            return ICHICode.from_api_response(code_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch ICHI code: {str(e)}",
                terminology_type="ICHI",
            )

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def is_configured(self) -> bool:
        """
        Check if Terminology service is properly configured.

        Returns:
            True if service can be used
        """
        return bool(self.api_base_url and self.auth_service.is_configured())

    def validate_intervention_for_facility(
        self,
        intervention_code: str,
        facility_level: int,
    ) -> tuple[bool, str | None]:
        """
        Validate an intervention is available at facility level.

        Args:
            intervention_code: SHA intervention code
            facility_level: Facility level (1-6)

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            intervention = self.get_intervention(intervention_code)

            if not intervention.is_active:
                return False, f"Intervention {intervention_code} is not active"

            if intervention.facility_level and facility_level < intervention.facility_level:
                return False, (
                    f"Intervention {intervention_code} requires minimum "
                    f"Level {intervention.facility_level} facility"
                )

            return True, None

        except CodeNotFoundError:
            return False, f"Intervention {intervention_code} not found"
        except TerminologyError as e:
            return False, str(e)
