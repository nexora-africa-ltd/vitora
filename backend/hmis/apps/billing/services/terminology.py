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

    @classmethod
    def from_api_response(cls, data: dict) -> 'InterventionCode':
        """Create from API response."""
        # Parse price
        price = data.get('price') or data.get('sha_price')
        if price is not None:
            price = Decimal(str(price))

        # Parse facility level
        level = data.get('facility_level') or data.get('min_facility_level')
        if isinstance(level, str):
            level = int(level.replace('LEVEL ', '').strip())

        # Parse effective date
        eff_date = data.get('effective_date')
        if isinstance(eff_date, str):
            eff_date = datetime.strptime(eff_date, '%Y-%m-%d').date()

        return cls(
            code=data.get('code', ''),
            name=data.get('name', ''),
            description=data.get('description'),
            category=data.get('category'),
            price=price,
            facility_level=level,
            is_active=data.get('is_active', True),
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
    def from_api_response(cls, data: dict) -> 'ICD11Code':
        """Create from API response."""
        return cls(
            code=data.get('code', ''),
            title=data.get('title', '') or data.get('name', ''),
            description=data.get('description'),
            parent_code=data.get('parent_code'),
            chapter=data.get('chapter'),
            is_leaf=data.get('is_leaf', True),
            raw_data=data,
        )


@dataclass
class DrugProduct:
    """
    Drug product from NMRA catalog.
    
    Represents a registered pharmaceutical product.
    
    Attributes:
        product_id: Unique product identifier
        brand_name: Commercial brand name
        generic_name: Generic/INN name
        manufacturer: Manufacturer name
        dosage_form: Form (tablet, syrup, etc.)
        strength: Strength specification
        registration_number: NMRA registration number
        active_components: List of active ingredients
        is_active: Registration status
        raw_data: Original API response
    """

    product_id: str
    brand_name: str
    generic_name: str | None = None
    manufacturer: str | None = None
    dosage_form: str | None = None
    strength: str | None = None
    registration_number: str | None = None
    active_components: list[str] = field(default_factory=list)
    is_active: bool = True
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> 'DrugProduct':
        """Create from API response."""
        # Parse active components
        components = data.get('active_components', [])
        if isinstance(components, str):
            components = [c.strip() for c in components.split(',')]

        return cls(
            product_id=data.get('product_id', '') or data.get('id', ''),
            brand_name=data.get('brand_name', '') or data.get('name', ''),
            generic_name=data.get('generic_name'),
            manufacturer=data.get('manufacturer'),
            dosage_form=data.get('dosage_form'),
            strength=data.get('strength'),
            registration_number=data.get('registration_number'),
            active_components=components,
            is_active=data.get('is_active', True),
            raw_data=data,
        )


@dataclass
class ActiveComponent:
    """
    Active pharmaceutical ingredient (API).
    
    Represents a drug's active ingredient.
    
    Attributes:
        component_id: Unique component identifier
        name: Component name (INN)
        atc_code: ATC classification code
        description: Description
        raw_data: Original API response
    """

    component_id: str
    name: str
    atc_code: str | None = None
    description: str | None = None
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> 'ActiveComponent':
        """Create from API response."""
        return cls(
            component_id=data.get('component_id', '') or data.get('id', ''),
            name=data.get('name', ''),
            atc_code=data.get('atc_code'),
            description=data.get('description'),
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
    status: str = 'ACTIVE'
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> 'RemoteLOINCCode':
        """Create from API response."""
        return cls(
            loinc_num=data.get('loinc_num', '') or data.get('code', ''),
            component=data.get('component', '') or data.get('name', ''),
            property=data.get('property'),
            time_aspect=data.get('time_aspect'),
            system=data.get('system'),
            scale_type=data.get('scale_type'),
            method_type=data.get('method_type'),
            long_common_name=data.get('long_common_name'),
            short_name=data.get('short_name'),
            status=data.get('status', 'ACTIVE'),
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
    def from_api_response(cls, data: dict) -> 'ICHICode':
        """Create from API response."""
        return cls(
            code=data.get('code', ''),
            title=data.get('title', '') or data.get('name', ''),
            definition=data.get('definition'),
            target=data.get('target'),
            action=data.get('action'),
            means=data.get('means'),
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
        return ''.join(parts)


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
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip('/')
        self.timeout = getattr(settings, 'SHA_API_TIMEOUT', 30)
        self.use_local_fallback = use_local_fallback

        # Get endpoint paths from settings (Official Kenya Digital Superhighway paths)
        # Reference: Kenya Digital Superhighway.postman_collection.json
        endpoints = getattr(settings, 'SHA_ENDPOINTS', {})
        self.interventions_endpoint = endpoints.get('sha_interventions', '/terminology/v1/sha-intervention')
        self.icd11_endpoint = endpoints.get('icd11', '/terminology/v1/icd11')
        self.products_endpoint = endpoints.get('drug_products', '/terminology/v1/product')
        self.components_endpoint = endpoints.get('active_components', '/terminology/v1/active-component')
        self.loinc_endpoint = endpoints.get('loinc', '/terminology/v1/loinc')
        self.ichi_endpoint = endpoints.get('ichi', '/terminology/v1/ichi')

        # Initialize auth service
        self.auth_service = SHAAuthService()

    # =========================================================================
    # SHA Interventions
    # =========================================================================

    def search_interventions(
        self,
        query: str,
        facility_level: int | None = None,
        category: str | None = None,
        limit: int = 50,
    ) -> list[InterventionCode]:
        """
        Search SHA interventions catalog.
        
        Searches for reimbursable interventions by name or code.
        
        Args:
            query: Search term (name or code)
            facility_level: Filter by minimum facility level (1-6)
            category: Filter by category
            limit: Maximum results to return
            
        Returns:
            List of matching InterventionCode objects
            
        Raises:
            TerminologyError: If search fails
            
        Example:
            >>> results = service.search_interventions('consultation')
            >>> print(f"Found {len(results)} interventions")
        """
        logger.info(f"Searching SHA interventions: query='{query}'")

        params = {
            'search': query,
            'limit': limit,
        }
        if facility_level is not None:
            params['facility_level'] = facility_level
        if category:
            params['category'] = category

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

            # Handle response format
            results = data.get('interventions') or data.get('results') or data.get('data') or []
            if isinstance(results, dict):
                results = [results]

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

    def get_intervention(self, code: str) -> InterventionCode:
        """
        Get a specific SHA intervention by code.
        
        Args:
            code: SHA intervention code
            
        Returns:
            InterventionCode for the specified code
            
        Raises:
            CodeNotFoundError: If code not found
            TerminologyError: If request fails
        """
        logger.info(f"Fetching SHA intervention: {code}")

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
            intervention_data = data.get('intervention') or data

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
            query='',
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

        params = {
            'search': query,
            'limit': limit,
        }
        if chapter:
            params['chapter'] = chapter

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
            results = data.get('codes') or data.get('results') or data.get('data') or []

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
            code_data = data.get('code') or data

            return ICD11Code.from_api_response(code_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch ICD-11 code: {str(e)}",
                terminology_type="ICD11",
            )

    # =========================================================================
    # Drug Products
    # =========================================================================

    def search_drug_products(
        self,
        query: str,
        limit: int = 50,
    ) -> list[DrugProduct]:
        """
        Search drug products catalog.
        
        Args:
            query: Search term (brand name or generic name)
            limit: Maximum results
            
        Returns:
            List of matching DrugProduct objects
        """
        logger.info(f"Searching drug products: query='{query}'")

        params = {
            'search': query,
            'limit': limit,
        }

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
            results = data.get('products') or data.get('results') or data.get('data') or []

            return [DrugProduct.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search drug products: {str(e)}",
                terminology_type="DRUG_PRODUCTS",
            )

    def get_drug_product(self, product_id: str) -> DrugProduct:
        """
        Get a specific drug product by ID.
        
        Args:
            product_id: Product identifier
            
        Returns:
            DrugProduct for the specified ID
            
        Raises:
            CodeNotFoundError: If product not found
        """
        logger.info(f"Fetching drug product: {product_id}")

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.products_endpoint}/{product_id}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(product_id, "DRUG_PRODUCTS")

            response.raise_for_status()

            data = response.json()
            product_data = data.get('product') or data

            return DrugProduct.from_api_response(product_data)

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
        query: str,
        limit: int = 50,
    ) -> list[ActiveComponent]:
        """
        Search active pharmaceutical components.
        
        Args:
            query: Search term (component name or ATC code)
            limit: Maximum results
            
        Returns:
            List of matching ActiveComponent objects
        """
        logger.info(f"Searching active components: query='{query}'")

        params = {
            'search': query,
            'limit': limit,
        }

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
            results = data.get('components') or data.get('results') or data.get('data') or []

            return [ActiveComponent.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search active components: {str(e)}",
                terminology_type="ACTIVE_COMPONENTS",
            )

    # =========================================================================
    # LOINC (with local fallback)
    # =========================================================================

    def search_loinc(
        self,
        query: str,
        limit: int = 50,
    ) -> list[RemoteLOINCCode]:
        """
        Search LOINC lab observation codes.
        
        Strategy: Remote API first, local database fallback.
        
        Args:
            query: Search term
            limit: Maximum results
            
        Returns:
            List of RemoteLOINCCode objects
        """
        logger.info(f"Searching LOINC codes: query='{query}'")

        # Try remote API first
        try:
            return self._search_loinc_remote(query, limit)
        except TerminologyError:
            if self.use_local_fallback:
                logger.warning("Remote LOINC search failed, using local fallback")
                return self._search_loinc_local(query, limit)
            raise

    def _search_loinc_remote(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """Search LOINC via remote API."""
        params = {
            'search': query,
            'limit': limit,
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
        results = data.get('codes') or data.get('results') or data.get('data') or []

        return [RemoteLOINCCode.from_api_response(r) for r in results]

    def _search_loinc_local(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """Search LOINC in local database fallback."""
        try:
            from hmis.apps.lab.models import LOINCCode

            local_codes = LOINCCode.objects.filter(
                Q(loinc_num__icontains=query) |
                Q(component__icontains=query) |
                Q(long_common_name__icontains=query)
            )[:limit]

            return [
                RemoteLOINCCode(
                    loinc_num=c.loinc_num,
                    component=c.component,
                    property=c.property,
                    time_aspect=c.time_aspect,
                    system=c.system,
                    scale_type=c.scale_type,
                    method_type=c.method_type,
                    long_common_name=c.long_common_name,
                    short_name=c.short_name,
                    status=c.status,
                )
                for c in local_codes
            ]
        except Exception as e:
            logger.error(f"Local LOINC fallback failed: {e}")
            return []

    def get_loinc(self, loinc_num: str) -> RemoteLOINCCode:
        """
        Get a specific LOINC code.
        
        Args:
            loinc_num: LOINC number (e.g., '2345-7')
            
        Returns:
            RemoteLOINCCode for the specified number
            
        Raises:
            CodeNotFoundError: If code not found
        """
        logger.info(f"Fetching LOINC code: {loinc_num}")

        # Try remote first
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
            code_data = data.get('code') or data

            return RemoteLOINCCode.from_api_response(code_data)

        except CodeNotFoundError:
            if self.use_local_fallback:
                return self._get_loinc_local(loinc_num)
            raise
        except (SHAAuthError, requests.RequestException):
            if self.use_local_fallback:
                return self._get_loinc_local(loinc_num)
            raise TerminologyError(
                f"Failed to fetch LOINC code: {loinc_num}",
                terminology_type="LOINC",
            )

    def _get_loinc_local(self, loinc_num: str) -> RemoteLOINCCode:
        """Get LOINC from local database."""
        try:
            from hmis.apps.lab.models import LOINCCode

            c = LOINCCode.objects.get(loinc_num=loinc_num)
            return RemoteLOINCCode(
                loinc_num=c.loinc_num,
                component=c.component,
                property=c.property,
                time_aspect=c.time_aspect,
                system=c.system,
                scale_type=c.scale_type,
                method_type=c.method_type,
                long_common_name=c.long_common_name,
                short_name=c.short_name,
                status=c.status,
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
            'search': query,
            'limit': limit,
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
            results = data.get('codes') or data.get('results') or data.get('data') or []

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
            code_data = data.get('code') or data

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
        return bool(
            self.api_base_url and
            self.auth_service.is_configured()
        )

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
