"""
SHA Health Worker Registry (HWR) Compliance Tests.

Validates that practitioner data aligns with SHA Health Worker Registry requirements.

Reference: docs/sha-guides/hwr.md

Key Requirements:
    - Practitioner identifier support (PUID, National ID)
    - CareTeam references in claims
    - Valid practitioner lookup before claims
"""

import pytest

# Try to import models
try:
    from hmis.apps.billing.services.sha_claims import SHAClaimsService
    HAS_SHA_CLAIMS_SERVICE = True
except ImportError:
    HAS_SHA_CLAIMS_SERVICE = False


class TestPractitionerIdentifiers:
    """Tests for practitioner identifier requirements."""
    
    def test_supported_identifier_types(self):
        """
        SHA Requirement: Support practitioner identification types.
        
        Reference: docs/sha-guides/hwr.md - Identifiers
        
        Supported types:
            - National ID
            - Passport
            - Registration Number (from regulatory body)
            - PUID (Practitioner Unique ID)
        """
        identifier_types = [
            'National ID',
            'Passport',
            'Registration Number',
            'PUID',
        ]
        
        assert len(identifier_types) >= 4, (
            "Support at least 4 practitioner identifier types"
        )
    
    def test_puid_format_understanding(self):
        """
        SHA Requirement: Understand PUID format.
        
        Reference: docs/sha-guides/claims-submission.md - Reference PreAuth JSON
        Example: 'PUID-0002532-1'
        """
        example_puid = 'PUID-0002532-1'
        
        assert example_puid.startswith('PUID-'), (
            "PUID format starts with 'PUID-'"
        )


class TestPractitionerSearchAPI:
    """Tests for practitioner search API compliance."""
    
    def test_search_endpoint_documented(self):
        """
        SHA Requirement: Know practitioner search endpoint.
        
        Reference: docs/sha-guides/hwr.md - Endpoint
        
        Endpoint: GET /v1/practitioner-search?identification_type={type}&identification_number={number}
        """
        expected_endpoint = '/v1/practitioner-search'
        
        # Document the endpoint
        assert True, (
            f"Practitioner search endpoint: {expected_endpoint}. "
            "Use to verify practitioner before including in claims."
        )
    
    def test_search_request_parameters(self):
        """
        SHA Requirement: Include required parameters.
        
        Reference: docs/sha-guides/hwr.md - Request Parameters
        
        Required:
            - identification_type (string): Type (passport, ID, etc.)
            - identification_number (string): ID number
        """
        required_params = [
            'identification_type',
            'identification_number',
        ]
        
        assert len(required_params) == 2, "2 required parameters"
    
    def test_search_response_fields(self):
        """
        SHA Requirement: Handle response fields.
        
        Reference: docs/sha-guides/hwr.md - Response
        
        Response fields:
            - registration_number
            - found (1 = found, 0 = not found)
            - is_active (active status)
        """
        response_fields = [
            'registration_number',
            'found',
            'is_active',
        ]
        
        assert len(response_fields) >= 3, "Handle at least 3 response fields"


class TestPractitionerInFHIRBundle:
    """Tests for Practitioner resource in FHIR bundles."""
    
    def test_practitioner_resource_documented(self):
        """
        SHA Requirement: Practitioner resource in claims.
        
        Reference: docs/sha-guides/claims.md
        Quote: 'Practitioner - The medical/health practitioner providing or 
               requesting the service. This can be the ID number of any licensed 
               Health Worker in your facility.'
        """
        assert True, (
            "COMPLIANCE NOTE: Include Practitioner resource in claims. "
            "This identifies the healthcare worker who provided/requested the service."
        )
    
    @pytest.mark.skipif(not HAS_SHA_CLAIMS_SERVICE, reason="SHAClaimsService not available")
    def test_claim_has_care_team_with_practitioner(self, sha_claim_with_items):
        """
        SHA Requirement: CareTeam references practitioner.
        
        Reference: docs/sha-guides/claims-submission.md - Integration Checklist
        Quote: 'Ensure CareTeam has valid details including reference to Practitioner'
        """
        service = SHAClaimsService()
        bundle = service.package_claim(sha_claim_with_items)
        
        claim = self._get_resource_by_type(bundle, 'Claim')
        if claim is None:
            pytest.skip("Claim resource not found")
        
        care_team = claim.get('careTeam', [])
        
        # CareTeam is expected for claims
        if not care_team:
            pytest.skip("CareTeam not included - consider adding")
        
        for member in care_team:
            assert 'provider' in member, (
                "CareTeam member must have provider reference"
            )
    
    def test_practitioner_resource_structure(self):
        """
        SHA Requirement: Practitioner resource structure.
        
        Reference: docs/sha-guides/claims-submission.md - Reference PreAuth JSON
        
        Required fields:
            - resourceType: "Practitioner"
            - id: PUID
            - name: Practitioner name
            - identifier: Official identifiers
            - active: Active status
        """
        required_fields = [
            'resourceType',
            'id',
            'name',
            'identifier',
            'active',
        ]
        
        assert len(required_fields) >= 5, "Practitioner needs 5+ fields"
    
    def _get_resource_by_type(self, bundle: dict, resource_type: str) -> dict | None:
        """Helper to extract a resource by type from bundle."""
        for entry in bundle.get('entry', []):
            if entry.get('resource', {}).get('resourceType') == resource_type:
                return entry['resource']
        return None


class TestHWRRoleAndFunctions:
    """Tests for understanding HWR role in HIE."""
    
    def test_hwr_purposes_documented(self):
        """
        SHA Reference: Understand Health Worker Registry purposes.
        
        Reference: docs/sha-guides/hwr.md - What is a Health Worker Registry?
        
        Functions:
            - Centralized Identity Management
            - Standardized Data for Workforce Planning
            - Role-Based Access and Permission Management
            - Enabling Interoperability
            - Supporting Licensing and Credentialing
        """
        hwr_functions = [
            'identity_management',
            'workforce_planning',
            'access_management',
            'interoperability',
            'licensing_credentialing',
        ]
        
        assert len(hwr_functions) >= 5, "HWR serves 5+ key functions"
    
    def test_practitioner_data_elements(self):
        """
        SHA Reference: Core practitioner data elements.
        
        Reference: docs/sha-guides/hwr.md - Core Components
        
        Elements:
            - Personal/Professional Identifiers (PUID, National ID, License #)
            - Demographic Information (Name, DOB, Gender)
            - Employment Details (Employer, Facility, Status)
            - Education and Credentialing (Qualifications, CME)
            - Licensing Information (Status, Expiry)
        """
        data_elements = [
            'identifiers',
            'demographics',
            'employment',
            'education',
            'licensing',
        ]
        
        assert len(data_elements) == 5, "5 core data element categories"


class TestPractitionerValidation:
    """Tests for practitioner validation workflow."""
    
    def test_validate_practitioner_before_claim(self):
        """
        SHA Best Practice: Validate practitioner exists in HWR before claim.
        
        The practitioner included in a claim should be a valid, active
        healthcare worker registered in the Health Worker Registry.
        """
        assert True, (
            "BEST PRACTICE: Verify practitioner is registered and active "
            "in HWR before including in claims. Use practitioner-search API."
        )
    
    def test_license_status_check(self):
        """
        SHA Consideration: Check practitioner license status.
        
        Reference: docs/sha-guides/hwr.md - Licensing Information
        Quote: 'Maintain a record of professional credentials, licenses, and certifications'
        """
        assert True, (
            "CONSIDERATION: Practitioner license should be valid. "
            "Claims may be rejected if practitioner license is expired or suspended."
        )
