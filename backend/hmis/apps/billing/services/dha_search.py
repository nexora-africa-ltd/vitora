"""
DHA Search Service for Vitora HMIS.

This module handles integration with Kenya Digital Health Agency
search APIs for facilities and practitioners.

Reference: docs/dha-api-usage-analysis.md
Official Endpoints:
    - GET /v1/facility-search - Search facility in Master Facility List
    - GET /v1/practitioner-search - Search healthcare worker in HWR
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List, Optional, Tuple

import requests
from django.conf import settings

from .sha_auth import SHAAuthService, SHAAuthError

logger = logging.getLogger(__name__)


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class FacilityInfo:
    """
    Facility information from Master Facility List (MFL).
    
    Represents a healthcare facility registered in Kenya's
    Master Facility List.
    
    Attributes:
        facility_code: MFL code (e.g., '24979')
        found: Whether facility was found (1 = found, 0 = not found)
        name: Facility name
        approved: SHA approval status
        level: Facility level (1-6)
        operational_status: Current operational status
        license_expiry: Current license expiry date
        county: County name
        sub_county: Sub-county name
        ward: Ward name
        ownership: Ownership type (Government, Private, etc.)
        facility_type: Type (Hospital, Health Center, etc.)
        fid: Facility ID (FID format)
        registration_number: Official registration number
        raw_data: Original API response
    """
    
    facility_code: str
    found: bool
    name: Optional[str] = None
    approved: Optional[bool] = None
    level: Optional[int] = None
    operational_status: Optional[str] = None
    license_expiry: Optional[date] = None
    county: Optional[str] = None
    sub_county: Optional[str] = None
    ward: Optional[str] = None
    ownership: Optional[str] = None
    facility_type: Optional[str] = None
    fid: Optional[str] = None
    registration_number: Optional[str] = None
    raw_data: dict = field(default_factory=dict)
    
    @property
    def is_operational(self) -> bool:
        """Check if facility is operational."""
        return self.operational_status == 'Operational'
    
    @property
    def is_license_valid(self) -> bool:
        """Check if license is valid (not expired)."""
        if not self.license_expiry:
            return True  # Assume valid if no expiry info
        return self.license_expiry >= date.today()
    
    @property
    def is_approved_for_sha(self) -> bool:
        """Check if facility is approved for SHA claims."""
        return bool(self.approved)
    
    @classmethod
    def from_api_response(cls, data: dict) -> 'FacilityInfo':
        """
        Create FacilityInfo from MFL API response.
        
        Args:
            data: API response data dict (from 'message' field)
            
        Returns:
            FacilityInfo instance
        """
        # Parse found status
        found = data.get('found', 0)
        if isinstance(found, int):
            found = found == 1
        
        # Parse facility level
        level = data.get('facility_level')
        if isinstance(level, str) and level.startswith('LEVEL '):
            level = int(level.replace('LEVEL ', '').strip())
        elif isinstance(level, str):
            try:
                level = int(level)
            except ValueError:
                level = None
        
        # Parse license expiry date
        expiry = data.get('current_license_expiry_date')
        if isinstance(expiry, str):
            try:
                expiry = datetime.strptime(expiry, '%Y-%m-%d').date()
            except ValueError:
                expiry = None
        
        return cls(
            facility_code=data.get('facility_code', ''),
            found=found,
            name=data.get('name') or data.get('facility_name'),
            approved=data.get('approved'),
            level=level,
            operational_status=data.get('operational_status'),
            license_expiry=expiry,
            county=data.get('county'),
            sub_county=data.get('sub_county'),
            ward=data.get('ward'),
            ownership=data.get('ownership'),
            facility_type=data.get('facility_type'),
            fid=data.get('fid'),
            registration_number=data.get('registration_number'),
            raw_data=data,
        )


@dataclass
class PractitionerLicense:
    """
    Individual license record from DHA HWR.
    
    Attributes:
        id: License ID (e.g., 'COC-Clinical Officer-2026-620095')
        external_reference_id: External reference (e.g., 'Rb01923/25')
        license_type: Type of license (e.g., 'Clinical Officer', 'Annual')
        license_start: Start date string
        license_end: End date string (expiry)
    """
    id: str
    external_reference_id: str
    license_type: str
    license_start: str
    license_end: str


@dataclass
class PractitionerMembership:
    """
    Membership/registration details from DHA HWR.
    
    Attributes:
        id: Member ID (e.g., 'PUID-0022840-4')
        status: License status (e.g., 'Licensed', 'Suspended')
        salutation: Title (e.g., 'Dr.', 'Mr.')
        full_name: Full name as registered
        gender: Gender
        first_name: First name
        middle_name: Middle name
        last_name: Last name
        registration_id: Registration ID (e.g., 'PUID-059839')
        external_reference_id: External reference
        licensing_body: Regulatory body (e.g., 'Clinical Officers Council')
        specialty: Specialty (e.g., 'CLINICAL OFFICER')
        is_active: 1 = active, 0 = inactive
        is_withdrawn: 1 = withdrawn, 0 = not
        withdrawal_reason: Reason for withdrawal
        withdrawal_date: Date of withdrawal
        license_expires_in_days: Days until license expires
    """
    id: str
    status: str
    salutation: str
    full_name: str
    gender: str
    first_name: str
    middle_name: str
    last_name: str
    registration_id: str
    external_reference_id: str
    licensing_body: str
    specialty: str
    is_active: int
    is_withdrawn: int
    withdrawal_reason: str
    withdrawal_date: str
    license_expires_in_days: int


@dataclass
class PractitionerProfessionalDetails:
    """
    Professional details from DHA HWR.
    
    Attributes:
        professional_cadre: Cadre (e.g., 'CLINICAL OFFICER')
        practice_type: Practice type (e.g., 'Clinical Officer')
        specialty: Specialty
        subspecialty: Subspecialty
        discipline_name: Discipline (e.g., 'Clinical Officer')
        educational_qualifications: Qualifications
    """
    professional_cadre: str
    practice_type: str
    specialty: str
    subspecialty: str
    discipline_name: str
    educational_qualifications: str


@dataclass
class PractitionerContacts:
    """
    Contact information from DHA HWR.
    
    Attributes:
        phone: Phone number
        email: Email address
        postal_address: Postal address
    """
    phone: str
    email: str
    postal_address: str


@dataclass
class PractitionerIdentifiers:
    """
    Identifier information from DHA HWR.
    
    Attributes:
        identification_type: ID type (e.g., 'National ID')
        identification_number: ID number
        client_registry_id: Client registry ID
        student_id: Student ID
    """
    identification_type: str
    identification_number: str
    client_registry_id: str
    student_id: str


@dataclass
class PractitionerInfo:
    """
    Practitioner information from Health Worker Registry (HWR).
    
    Updated to match actual DHA API response format.
    Based on: https://uat.dha.go.ke/v1/practitioner-search
    
    Attributes:
        membership: Registration/membership details
        licenses: List of license records
        professional_details: Professional qualifications
        contacts: Contact information
        identifiers: ID documents
        found: Whether practitioner was found
        raw_data: Original API response
    """
    
    membership: PractitionerMembership
    licenses: List[PractitionerLicense]
    professional_details: PractitionerProfessionalDetails
    contacts: PractitionerContacts
    identifiers: PractitionerIdentifiers
    found: bool = True
    raw_data: dict = field(default_factory=dict)
    
    # Legacy compatibility properties
    @property
    def puid(self) -> str:
        """Return PUID for backward compatibility."""
        return self.membership.registration_id
    
    @property
    def first_name(self) -> str:
        """Return first name."""
        return self.membership.first_name
    
    @property
    def last_name(self) -> str:
        """Return last name."""
        return self.membership.last_name
    
    @property
    def middle_name(self) -> str:
        """Return middle name."""
        return self.membership.middle_name
    
    @property
    def full_name(self) -> str:
        """Return full name."""
        return self.membership.full_name.strip()
    
    @property
    def cadre(self) -> str:
        """Return professional cadre."""
        return self.professional_details.professional_cadre
    
    @property
    def qualification(self) -> str:
        """Return educational qualifications."""
        return self.professional_details.educational_qualifications
    
    @property
    def registration_number(self) -> str:
        """Return registration number."""
        return self.membership.registration_id
    
    @property
    def license_status(self) -> str:
        """Return license status."""
        return self.membership.status
    
    @property
    def license_expiry(self) -> Optional[date]:
        """Calculate license expiry date from days remaining."""
        if self.membership.license_expires_in_days <= 0:
            return None
        from datetime import timedelta
        return date.today() + timedelta(days=self.membership.license_expires_in_days)
    
    @property
    def specialty(self) -> str:
        """Return specialty."""
        return self.professional_details.specialty or self.membership.specialty
    
    @property
    def is_license_active(self) -> bool:
        """Check if license is active."""
        return (
            self.membership.is_active == 1 and 
            self.membership.status.lower() == 'licensed' and
            self.membership.license_expires_in_days > 0
        )
    
    @classmethod
    def from_api_response(cls, data: dict) -> 'PractitionerInfo':
        """
        Create PractitionerInfo from HWR API response.
        
        Handles the actual DHA API response format:
        {
            "message": {
                "membership": {...},
                "licenses": [...],
                "professional_details": {...},
                "contacts": {...},
                "identifiers": {...}
            }
        }
        
        Args:
            data: API response data dict (can be full response or 'message' content)
            
        Returns:
            PractitionerInfo instance
        """
        # Handle nested 'message' field if present
        message_data = data.get('message', data)
        
        # Parse membership
        membership_data = message_data.get('membership', {})
        membership = PractitionerMembership(
            id=membership_data.get('id', ''),
            status=membership_data.get('status', ''),
            salutation=membership_data.get('salutation', ''),
            full_name=membership_data.get('full_name', ''),
            gender=membership_data.get('gender', ''),
            first_name=membership_data.get('first_name', ''),
            middle_name=membership_data.get('middle_name', ''),
            last_name=membership_data.get('last_name', ''),
            registration_id=membership_data.get('registration_id', ''),
            external_reference_id=membership_data.get('external_reference_id', ''),
            licensing_body=membership_data.get('licensing_body', ''),
            specialty=membership_data.get('specialty', ''),
            is_active=membership_data.get('is_active', 0),
            is_withdrawn=membership_data.get('is_withdrawn', 0),
            withdrawal_reason=membership_data.get('withdrawal_reason', ''),
            withdrawal_date=membership_data.get('withdrawal_date', ''),
            license_expires_in_days=membership_data.get('license_expires_in_days', 0),
        )
        
        # Parse licenses
        licenses_data = message_data.get('licenses', [])
        licenses = [
            PractitionerLicense(
                id=lic.get('id', ''),
                external_reference_id=lic.get('external_reference_id', ''),
                license_type=lic.get('license_type', ''),
                license_start=lic.get('license_start', ''),
                license_end=lic.get('license_end', ''),
            )
            for lic in licenses_data
        ]
        
        # Parse professional details
        prof_data = message_data.get('professional_details', {})
        professional_details = PractitionerProfessionalDetails(
            professional_cadre=prof_data.get('professional_cadre', ''),
            practice_type=prof_data.get('practice_type', ''),
            specialty=prof_data.get('specialty', ''),
            subspecialty=prof_data.get('subspecialty', ''),
            discipline_name=prof_data.get('discipline_name', ''),
            educational_qualifications=prof_data.get('educational_qualifications', ''),
        )
        
        # Parse contacts
        contacts_data = message_data.get('contacts', {})
        contacts = PractitionerContacts(
            phone=contacts_data.get('phone', ''),
            email=contacts_data.get('email', ''),
            postal_address=contacts_data.get('postal_address', ''),
        )
        
        # Parse identifiers
        identifiers_data = message_data.get('identifiers', {})
        identifiers = PractitionerIdentifiers(
            identification_type=identifiers_data.get('identification_type', ''),
            identification_number=identifiers_data.get('identification_number', ''),
            client_registry_id=identifiers_data.get('client_registry_id', ''),
            student_id=identifiers_data.get('student_id', ''),
        )
        
        return cls(
            membership=membership,
            licenses=licenses,
            professional_details=professional_details,
            contacts=contacts,
            identifiers=identifiers,
            found=True,
            raw_data=data,
        )


# =============================================================================
# Custom Exception
# =============================================================================

class SearchError(Exception):
    """
    Exception raised for DHA search errors.
    
    Attributes:
        message: Error description
        status_code: HTTP status code if applicable
        search_type: Which search failed (facility/practitioner)
    """
    
    def __init__(
        self,
        message: str,
        status_code: int = 0,
        search_type: Optional[str] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.search_type = search_type
        super().__init__(message)
    
    def __str__(self):
        parts = ["SearchError"]
        if self.search_type:
            parts.append(f"[{self.search_type}]")
        if self.status_code:
            parts.append(f"({self.status_code})")
        parts.append(f": {self.message}")
        return ''.join(parts)


# =============================================================================
# Service Class
# =============================================================================

class DHASearchService:
    """
    Service for searching Kenya DHA registries.
    
    This service provides methods to search:
        - Master Facility List (MFL) for healthcare facilities
        - Health Worker Registry (HWR) for practitioners
    
    These searches are crucial for:
        - Validating facilities for SHA claims
        - Verifying practitioner credentials
        - Claims pre-submission validation
    
    Attributes:
        api_base_url: DHA API base URL
        facility_endpoint: MFL search endpoint
        practitioner_endpoint: HWR search endpoint
        timeout: Request timeout in seconds
        auth_service: SHAAuthService instance
    
    Example:
        >>> search = DHASearchService()
        >>> facility = search.search_facility(facility_code='24979')
        >>> if facility and facility.is_operational:
        ...     print(f"Facility {facility.name} is operational")
    """
    
    def __init__(self):
        """Initialize DHASearchService with settings from Django config."""
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip('/')
        self.timeout = getattr(settings, 'SHA_API_TIMEOUT', 30)
        
        # Get endpoint paths from settings
        endpoints = getattr(settings, 'SHA_ENDPOINTS', {})
        self.facility_endpoint = endpoints.get('facility_search', '/v1/facility-search')
        self.practitioner_endpoint = endpoints.get('practitioner_search', '/v1/practitioner-search')
        
        # Initialize auth service
        self.auth_service = SHAAuthService()
    
    # =========================================================================
    # Facility Search
    # =========================================================================
    
    def search_facility(
        self,
        facility_code: Optional[str] = None,
        fid: Optional[str] = None,
        registration_number: Optional[str] = None,
    ) -> Optional[FacilityInfo]:
        """
        Search for a facility in the Master Facility List.
        
        At least one search parameter must be provided.
        
        Args:
            facility_code: MFL facility code (e.g., '24979')
            fid: Facility ID (FID format)
            registration_number: Official registration number
            
        Returns:
            FacilityInfo if found, None otherwise
            
        Raises:
            SearchError: If search request fails
            ValueError: If no search parameter provided
            
        Example:
            >>> facility = service.search_facility(facility_code='24979')
            >>> if facility:
            ...     print(f"Found: {facility.name}")
        """
        # Validate at least one parameter
        if not any([facility_code, fid, registration_number]):
            raise ValueError("At least one search parameter must be provided")
        
        # Build query parameters
        params = {}
        if facility_code:
            params['facility_code'] = facility_code
        elif fid:
            params['fid'] = fid
        elif registration_number:
            params['registration_number'] = registration_number
        
        logger.info(f"Searching MFL with params: {params}")
        
        try:
            headers = self.auth_service.get_auth_headers()
            
            response = requests.get(
                f"{self.api_base_url}{self.facility_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
            
            logger.debug(f"MFL search response status: {response.status_code}")
            
            if response.status_code == 401:
                raise SearchError(
                    "Authentication failed",
                    status_code=401,
                    search_type="FACILITY",
                )
            
            if response.status_code == 500:
                raise SearchError(
                    "Server error",
                    status_code=500,
                    search_type="FACILITY",
                )
            
            response.raise_for_status()
            
            data = response.json()
            
            # Response format: {"message": {...}}
            message_data = data.get('message', data)
            
            # Check if facility was found
            found = message_data.get('found', 0)
            if isinstance(found, int) and found == 0:
                return None
            if isinstance(found, bool) and not found:
                return None
            
            return FacilityInfo.from_api_response(message_data)
            
        except SHAAuthError as e:
            raise SearchError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
                search_type="FACILITY",
            )
        except requests.Timeout:
            raise SearchError(
                "Request timed out",
                search_type="FACILITY",
            )
        except SearchError:
            raise
        except requests.RequestException as e:
            raise SearchError(
                f"Request failed: {str(e)}",
                search_type="FACILITY",
            )
    
    def validate_facility_for_claims(
        self,
        facility_code: Optional[str] = None,
        fid: Optional[str] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Validate a facility can submit SHA claims.
        
        Checks that facility:
            - Exists in MFL
            - Is approved for SHA
            - Is operational
            - Has valid license
        
        Args:
            facility_code: MFL facility code
            fid: Facility ID
            
        Returns:
            Tuple of (is_valid, list_of_errors)
            
        Example:
            >>> valid, errors = service.validate_facility_for_claims(
            ...     facility_code='24979'
            ... )
            >>> if not valid:
            ...     for error in errors:
            ...         print(f"Error: {error}")
        """
        errors = []
        
        try:
            facility = self.search_facility(
                facility_code=facility_code,
                fid=fid,
            )
            
            if not facility:
                return False, ["Facility not found in Master Facility List"]
            
            if not facility.found:
                return False, ["Facility not found in Master Facility List"]
            
            if facility.approved is not None and not facility.approved:
                errors.append("Facility is not approved for SHA claims")
            
            if not facility.is_operational:
                errors.append(
                    f"Facility is not operational (status: {facility.operational_status})"
                )
            
            if not facility.is_license_valid:
                errors.append(
                    f"Facility license has expired (expiry: {facility.license_expiry})"
                )
            
            return len(errors) == 0, errors
            
        except SearchError as e:
            return False, [f"Facility validation failed: {str(e)}"]
    
    # =========================================================================
    # Practitioner Search
    # =========================================================================
    
    def search_practitioner(
        self,
        identification_number: Optional[str] = None,
        identification_type: str = 'ID',
        registration_number: Optional[str] = None,
    ) -> Optional[PractitionerInfo]:
        """
        Search for a practitioner in the Health Worker Registry.
        
        At least one search parameter must be provided.
        
        Based on DHA API: https://uat.dha.go.ke/v1/practitioner-search
        
        Args:
            identification_number: National ID or Passport number
            identification_type: Type of ID ('ID' for National ID, 'passport')
            registration_number: Professional registration number (PUID)
            
        Returns:
            PractitionerInfo if found, None otherwise
            
        Raises:
            SearchError: If search request fails
            ValueError: If no search parameter provided
            
        Example:
            >>> practitioner = service.search_practitioner(
            ...     identification_number='12345678',
            ...     identification_type='ID'
            ... )
            >>> if practitioner:
            ...     print(f"Found: {practitioner.full_name}")
        """
        # Validate at least one parameter
        if not any([identification_number, registration_number]):
            raise ValueError("At least one search parameter must be provided")
        
        # Build query parameters per DHA API spec
        params = {}
        if identification_number:
            params['identification_number'] = identification_number
            params['identification_type'] = identification_type
        elif registration_number:
            params['registration_number'] = registration_number
        
        logger.info(f"Searching HWR with params: {list(params.keys())}")
        
        try:
            headers = self.auth_service.get_auth_headers()
            
            response = requests.get(
                f"{self.api_base_url}{self.practitioner_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
            
            logger.debug(f"HWR search response status: {response.status_code}")
            
            if response.status_code == 401:
                raise SearchError(
                    "Authentication failed",
                    status_code=401,
                    search_type="PRACTITIONER",
                )
            
            if response.status_code == 500:
                raise SearchError(
                    "Server error",
                    status_code=500,
                    search_type="PRACTITIONER",
                )
            
            response.raise_for_status()
            
            data = response.json()
            
            # Response format: {"message": {...}} or {"found": true, "practitioner": {...}}
            message_data = data.get('message', data)
            
            # Check if practitioner was found
            found = message_data.get('found', False)
            if isinstance(found, str):
                found = found.lower() == 'true'
            if not found:
                return None
            
            return PractitionerInfo.from_api_response(message_data)
            
        except SHAAuthError as e:
            raise SearchError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
                search_type="PRACTITIONER",
            )
        except requests.Timeout:
            raise SearchError(
                "Request timed out",
                search_type="PRACTITIONER",
            )
        except SearchError:
            raise
        except requests.RequestException as e:
            raise SearchError(
                f"Request failed: {str(e)}",
                search_type="PRACTITIONER",
            )
    
    def validate_practitioner_for_claims(
        self,
        identification_number: Optional[str] = None,
        registration_number: Optional[str] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Validate a practitioner can be referenced in SHA claims.
        
        Checks that practitioner:
            - Exists in HWR
            - Has active license
        
        Args:
            identification_number: National ID number
            registration_number: Professional registration number
            
        Returns:
            Tuple of (is_valid, list_of_errors)
            
        Example:
            >>> valid, errors = service.validate_practitioner_for_claims(
            ...     identification_number='12345678'
            ... )
            >>> if not valid:
            ...     for error in errors:
            ...         print(f"Error: {error}")
        """
        errors = []
        
        try:
            practitioner = self.search_practitioner(
                identification_number=identification_number,
                registration_number=registration_number,
            )
            
            if not practitioner:
                return False, ["Practitioner not found or not registered in Health Worker Registry"]
            
            if not practitioner.is_license_active:
                errors.append(
                    f"Practitioner license is not active (status: {practitioner.license_status})"
                )
            
            return len(errors) == 0, errors
            
        except SearchError as e:
            return False, [f"Practitioner validation failed: {str(e)}"]
    
    # =========================================================================
    # Utility Methods
    # =========================================================================
    
    def is_configured(self) -> bool:
        """
        Check if Search service is properly configured.
        
        Returns:
            True if service can be used
        """
        return bool(
            self.api_base_url and
            self.facility_endpoint and
            self.practitioner_endpoint and
            self.auth_service.is_configured()
        )
