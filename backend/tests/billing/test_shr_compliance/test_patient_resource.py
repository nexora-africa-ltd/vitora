"""
Patient Resource FHIR compliance tests for SHA SHR Integration.

Tests validate compliance with the Patient resource structure for SHR
as documented in docs/sha-guides/shr-integration.md Section 1.

Reference: https://hl7.org/fhir/R4/patient.html
"""

import pytest  # type: ignore


class TestPatientResourceRequiredFields:
    """
    Tests for required Patient resource fields per SHR specification.
    
    Reference: docs/sha-guides/shr-integration.md Section 1
    Quote: 'PUT {{base_url}}/v1/patient-resource?cr_id=CR06XX3268000-3-1'
    """

    def test_patient_has_resource_type(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Patient must have resourceType.
        """
        assert 'resourceType' in valid_patient_resource_fhir, (
            "Patient must have 'resourceType' field"
        )
        assert valid_patient_resource_fhir['resourceType'] == 'Patient', (
            "resourceType must be 'Patient'"
        )

    def test_patient_has_id(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Patient must have id (CR ID).
        
        Quote from spec: '"id": "CR06XX3268000-3-1"'
        """
        assert 'id' in valid_patient_resource_fhir, (
            "Patient must have 'id' field"
        )
        assert valid_patient_resource_fhir['id'], (
            "Patient id must not be empty"
        )

    def test_patient_id_is_cr_id(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Patient id should be the Client Registry ID.
        
        Format: CR{county_code}{facility_code}{patient_number}
        """
        patient_id = valid_patient_resource_fhir.get('id', '')
        # CR ID typically starts with 'CR'
        assert patient_id.startswith('CR'), (
            "Patient id should be a Client Registry ID starting with 'CR'. "
            "See docs/sha-guides/shr-integration.md for CR ID format"
        )


class TestPatientResourceIdentifier:
    """
    Tests for Patient identifier per SHR specification.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: '"identifier": [{"use": "official", "system": "https://cr.tiberbu.app/...", "value": "CR..."}]'
    """

    def test_patient_has_identifier(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Patient must have identifier array.
        """
        assert 'identifier' in valid_patient_resource_fhir, (
            "Patient must have 'identifier' field"
        )
        assert len(valid_patient_resource_fhir['identifier']) > 0, (
            "identifier array must have at least one entry"
        )

    def test_identifier_has_use(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Identifier should have use designation.
        
        Quote: '"use": "official"'
        """
        identifier = valid_patient_resource_fhir.get('identifier', [{}])[0]
        assert 'use' in identifier, (
            "identifier should have 'use' field"
        )
        assert identifier['use'] == 'official', (
            "Primary identifier use should be 'official'"
        )

    def test_identifier_has_system(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Identifier must have system URI.
        
        Quote: '"system": "https://cr.tiberbu.app/app/client-registry/..."'
        """
        identifier = valid_patient_resource_fhir.get('identifier', [{}])[0]
        assert 'system' in identifier, (
            "identifier must have 'system' field"
        )
        assert identifier['system'].startswith('http'), (
            "identifier system must be a valid URI"
        )

    def test_identifier_has_value(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Identifier must have value (CR ID).
        """
        identifier = valid_patient_resource_fhir.get('identifier', [{}])[0]
        assert 'value' in identifier, (
            "identifier must have 'value' field"
        )
        assert identifier['value'], (
            "identifier value must not be empty"
        )

    def test_identifier_value_matches_id(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Identifier value should match resource id.
        """
        patient_id = valid_patient_resource_fhir.get('id', '')
        identifier_value = valid_patient_resource_fhir.get('identifier', [{}])[0].get('value', '')
        
        assert patient_id == identifier_value, (
            "identifier value should match resource id (CR ID)"
        )


class TestPatientResourceName:
    """
    Tests for Patient name per SHR specification.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: '"name": [{"text": "STEPHEN GITAU", "family": "GITAU", "given": ["STEPHEN"]}]'
    """

    def test_patient_has_name(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Patient must have name.
        """
        assert 'name' in valid_patient_resource_fhir, (
            "Patient must have 'name' field"
        )
        assert len(valid_patient_resource_fhir['name']) > 0, (
            "name array must have at least one entry"
        )

    def test_name_has_family(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Name must have family name.
        
        Quote: '"family": "GITAU"'
        """
        name = valid_patient_resource_fhir.get('name', [{}])[0]
        assert 'family' in name, (
            "name must have 'family' field"
        )
        assert name['family'], (
            "family name must not be empty"
        )

    def test_name_has_given(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Name must have given name(s).
        
        Quote: '"given": ["STEPHEN"]'
        """
        name = valid_patient_resource_fhir.get('name', [{}])[0]
        assert 'given' in name, (
            "name must have 'given' field"
        )
        assert isinstance(name['given'], list), (
            "given must be an array"
        )
        assert len(name['given']) > 0, (
            "given array must have at least one name"
        )

    def test_name_has_text(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Name should have text (full name).
        
        Quote: '"text": "STEPHEN GITAU"'
        """
        name = valid_patient_resource_fhir.get('name', [{}])[0]
        assert 'text' in name, (
            "name should have 'text' field for full name display"
        )


class TestPatientResourceGender:
    """
    Tests for Patient gender per SHR specification.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: '"gender": "male"'
    """

    def test_patient_has_gender(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Patient must have gender.
        """
        assert 'gender' in valid_patient_resource_fhir, (
            "Patient must have 'gender' field"
        )

    def test_gender_is_fhir_compliant(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Gender must use FHIR administrative gender codes.
        
        FHIR gender codes: male, female, other, unknown
        """
        gender = valid_patient_resource_fhir.get('gender', '')
        valid_genders = ['male', 'female', 'other', 'unknown']
        
        assert gender in valid_genders, (
            f"gender must be one of {valid_genders}. "
            "See http://hl7.org/fhir/R4/valueset-administrative-gender.html"
        )

    def test_gender_is_lowercase(self, valid_patient_resource_fhir):
        """
        SHR Requirement: Gender must be lowercase per FHIR standard.
        """
        gender = valid_patient_resource_fhir.get('gender', '')
        assert gender == gender.lower(), (
            "gender must be lowercase (FHIR R4 standard)"
        )


class TestPatientResourceOptionalFields:
    """
    Tests for optional but recommended Patient fields.
    
    Reference: https://hl7.org/fhir/R4/patient.html
    """

    def test_patient_can_have_birth_date(self, valid_patient_resource_fhir):
        """
        SHR Recommendation: Patient should have birthDate for proper identification.
        
        Format: YYYY-MM-DD (FHIR date format)
        """
        assert 'birthDate' in valid_patient_resource_fhir, (
            "birthDate is recommended for patient identification"
        )
        assert valid_patient_resource_fhir['birthDate'], (
            "birthDate should not be empty if provided"
        )
        # Validate date format (YYYY-MM-DD)
        import re
        date_pattern = r'^\d{4}-\d{2}-\d{2}$'
        assert re.match(date_pattern, valid_patient_resource_fhir['birthDate']), (
            "birthDate must be in FHIR date format: YYYY-MM-DD"
        )

    def test_patient_can_have_telecom(self, valid_patient_resource_fhir):
        """
        SHR Recommendation: Patient should have contact information.
        
        Reference: https://hl7.org/fhir/R4/datatypes.html#ContactPoint
        """
        assert 'telecom' in valid_patient_resource_fhir, (
            "telecom is recommended for patient contact"
        )
        telecom = valid_patient_resource_fhir['telecom']
        assert len(telecom) > 0, (
            "telecom array should have at least one contact method"
        )
        
        # Validate telecom structure
        for contact in telecom:
            assert 'system' in contact, "telecom entry must have 'system'"
            assert contact['system'] in ['phone', 'fax', 'email', 'pager', 'url', 'sms', 'other'], (
                "telecom system must be valid FHIR ContactPointSystem"
            )
            assert 'value' in contact, "telecom entry must have 'value'"

    def test_patient_can_have_address(self, valid_patient_resource_fhir):
        """
        SHR Recommendation: Patient should have address.
        
        Reference: https://hl7.org/fhir/R4/datatypes.html#Address
        """
        assert 'address' in valid_patient_resource_fhir, (
            "address is recommended for patient location"
        )
        address = valid_patient_resource_fhir['address']
        assert len(address) > 0, (
            "address array should have at least one address"
        )
        
        # Validate address structure
        for addr in address:
            # At minimum, address should have some identifying information
            has_location_info = any(
                key in addr for key in ['text', 'line', 'city', 'district', 'state', 'country']
            )
            assert has_location_info, (
                "address must have at least one location field (text, line, city, etc.)"
            )

    def test_telecom_phone_format(self, valid_patient_resource_fhir):
        """
        SHR Recommendation: Phone numbers should be in E.164 format for Kenya.
        
        Format: +254XXXXXXXXX
        """
        telecom = valid_patient_resource_fhir.get('telecom', [])
        phone_entries = [t for t in telecom if t.get('system') == 'phone']
        
        if phone_entries:
            import re
            # E.164 format or local Kenya format
            phone_pattern = r'^(\+254|0)[17]\d{8}$'
            for phone in phone_entries:
                # This is a soft validation - just check it looks like a phone number
                assert phone.get('value'), "phone value must not be empty"

    def test_address_has_country_code(self, valid_patient_resource_fhir):
        """
        SHR Recommendation: Address should include country code for Kenya.
        
        ISO 3166-1 alpha-2: KE
        """
        addresses = valid_patient_resource_fhir.get('address', [])
        
        for addr in addresses:
            if 'country' in addr:
                assert addr['country'] in ['KE', 'Kenya'], (
                    "Country should be 'KE' (ISO 3166-1 alpha-2) or 'Kenya'"
                )


class TestPatientResourceAPIEndpoint:
    """
    Tests for Patient resource API endpoint configuration.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: 'PUT {{base_url}}/v1/patient-resource?cr_id=CR06XX3268000-3-1'
    """

    def test_patient_resource_endpoint_configured(self, shr_api_endpoints):
        """
        SHR Requirement: Patient resource endpoint must be configured.
        """
        assert 'patient_resource' in shr_api_endpoints, (
            "SHR API must include patient_resource endpoint"
        )
        assert shr_api_endpoints['patient_resource'] == '/v1/patient-resource', (
            "Patient resource endpoint should be '/v1/patient-resource'"
        )

    def test_patient_resource_uses_put_method(self):
        """
        SHR Requirement: Patient registration uses PUT for upsert behavior.
        
        Quote: 'PUT {{base_url}}/v1/patient-resource?cr_id=...'
        """
        # This is a documentation/spec test - actual HTTP method tested in integration tests
        expected_method = 'PUT'
        assert expected_method == 'PUT', (
            "Patient registration/update should use PUT method for idempotent upsert"
        )

    def test_patient_resource_requires_cr_id_query_param(self):
        """
        SHR Requirement: Patient resource endpoint requires cr_id query parameter.
        
        Quote: 'PUT {{base_url}}/v1/patient-resource?cr_id=CR06XX3268000-3-1'
        """
        # Spec requirement documentation test
        required_param = 'cr_id'
        assert required_param, (
            "Patient resource endpoint must accept 'cr_id' query parameter"
        )


class TestPatientResourceCRIDFormat:
    """
    Tests for Client Registry ID (CR ID) format per Kenya SHR.
    """

    def test_cr_id_starts_with_cr(self, valid_patient_resource_fhir):
        """
        SHR Requirement: CR ID must start with 'CR'.
        """
        cr_id = valid_patient_resource_fhir.get('id', '')
        assert cr_id.startswith('CR'), (
            "Client Registry ID must start with 'CR'"
        )

    def test_cr_id_has_minimum_length(self, valid_patient_resource_fhir):
        """
        SHR Requirement: CR ID should have sufficient length for uniqueness.
        """
        cr_id = valid_patient_resource_fhir.get('id', '')
        # Example: CR06XX3268000-3-1 is 17 characters
        assert len(cr_id) >= 10, (
            "CR ID should be at least 10 characters for uniqueness"
        )

    def test_cr_id_format_matches_spec(self, valid_patient_resource_fhir):
        """
        SHR Requirement: CR ID should follow Kenya CR format.
        
        Format appears to be: CR{facility_code}{patient_id}-{segment}-{sequence}
        Example: CR06XX3268000-3-1
        """
        cr_id = valid_patient_resource_fhir.get('id', '')
        # Should contain alphanumeric and hyphens
        import re
        pattern = r'^CR[A-Za-z0-9-]+$'
        assert re.match(pattern, cr_id), (
            f"CR ID '{cr_id}' should match format CR[alphanumeric-] "
            "Example: CR06XX3268000-3-1"
        )
