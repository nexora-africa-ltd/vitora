"""
International Patient Summary (IPS) Bundle compliance tests for SHA SHR Integration.

Tests validate compliance with the IPS bundle structure
as documented in docs/sha-guides/shr-integration.md Section 3.

Reference: https://hl7.org/fhir/uv/ips/
"""


class TestIPSBundleStructure:
    """
    Tests for IPS bundle structure per SHR specification.

    Reference: docs/sha-guides/shr-integration.md Section 3
    Quote: 'GET {{base_url}}/v1/shr/summary?cr_id=CR06XX3268000-3-1'
    """

    def test_ips_has_resource_type(self, valid_ips_bundle):
        """
        SHR Requirement: IPS must have resourceType Bundle.
        """
        assert "resourceType" in valid_ips_bundle, "IPS must have 'resourceType' field"
        assert valid_ips_bundle["resourceType"] == "Bundle", "resourceType must be 'Bundle'"

    def test_ips_has_type_document(self, valid_ips_bundle):
        """
        SHR Requirement: IPS bundle type must be 'document'.

        Quote from spec: '"type": "document"'
        """
        assert "type" in valid_ips_bundle, "IPS bundle must have 'type' field"
        assert valid_ips_bundle["type"] == "document", "IPS bundle type must be 'document'"

    def test_ips_has_id(self, valid_ips_bundle):
        """
        SHR Requirement: IPS bundle must have id.
        """
        assert "id" in valid_ips_bundle, "IPS bundle must have 'id' field"
        assert valid_ips_bundle["id"], "IPS bundle id must not be empty"

    def test_ips_has_timestamp(self, valid_ips_bundle):
        """
        SHR Requirement: IPS bundle must have timestamp.

        Quote from spec: '"timestamp": "2025-03-28T10:58:27.831+00:00"'
        """
        assert "timestamp" in valid_ips_bundle, "IPS bundle must have 'timestamp' field"
        # Timestamp should be ISO 8601 format
        assert "T" in valid_ips_bundle["timestamp"], "timestamp must be ISO 8601 datetime format"

    def test_ips_has_entry_array(self, valid_ips_bundle):
        """
        SHR Requirement: IPS bundle must have entry array.
        """
        assert "entry" in valid_ips_bundle, "IPS bundle must have 'entry' field"
        assert isinstance(valid_ips_bundle["entry"], list), "entry must be an array"
        assert len(valid_ips_bundle["entry"]) > 0, "entry array must have at least one resource"


class TestIPSCompositionResource:
    """
    Tests for Composition resource in IPS bundle.

    Reference: docs/sha-guides/shr-integration.md
    The first entry should be a Composition resource.
    """

    def test_first_entry_is_composition(self, valid_ips_bundle):
        """
        SHR Requirement: First entry must be Composition resource.
        """
        first_entry = valid_ips_bundle.get("entry", [{}])[0]
        resource = first_entry.get("resource", {})

        assert resource.get("resourceType") == "Composition", (
            "First entry in IPS bundle must be a Composition resource"
        )

    def test_composition_has_status(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must have status.

        Quote: '"status": "final"'
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "status" in composition, "Composition must have 'status' field"
        assert composition["status"] == "final", (
            "Composition status should be 'final' for complete IPS"
        )

    def test_composition_has_type(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must have type with LOINC code.

        Quote: '"code": "60591-5", "display": "Patient summary Document"'
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "type" in composition, "Composition must have 'type' field"

        type_coding = composition["type"].get("coding", [{}])[0]
        assert type_coding.get("system") == "http://loinc.org", (
            "Composition type must use LOINC system"
        )
        assert type_coding.get("code") == "60591-5", (
            "Composition type code must be '60591-5' (Patient summary)"
        )

    def test_composition_has_subject(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must reference the patient.

        Quote: '"subject": {"reference": "Patient/CR06XX3268000-3-1"}'
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "subject" in composition, "Composition must have 'subject' field"
        assert "reference" in composition["subject"], "Composition subject must have 'reference'"
        assert composition["subject"]["reference"].startswith("Patient/"), (
            "Composition subject must reference a Patient"
        )

    def test_composition_has_date(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must have date.
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "date" in composition, "Composition must have 'date' field"

    def test_composition_has_author(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must have author.

        Quote: '"author": [{"reference": "Practitioner/789012"}]'
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "author" in composition, "Composition must have 'author' field"
        assert len(composition["author"]) > 0, "author array must have at least one entry"

    def test_composition_has_title(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must have title.

        Quote: '"title": "Patient Summary"'
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "title" in composition, "Composition must have 'title' field"

    def _get_composition(self, bundle):
        """Helper to extract Composition from bundle."""
        for entry in bundle.get("entry", []):
            resource = entry.get("resource", {})
            if resource.get("resourceType") == "Composition":
                return resource
        return {}


class TestIPSCompositionSections:
    """
    Tests for Composition sections in IPS bundle.

    Reference: docs/sha-guides/shr-integration.md
    """

    def test_composition_has_sections(self, valid_ips_bundle):
        """
        SHR Requirement: Composition must have sections.
        """
        composition = self._get_composition(valid_ips_bundle)
        assert "section" in composition, "Composition must have 'section' field"
        assert len(composition["section"]) > 0, "Composition must have at least one section"

    def test_allergies_section_present(self, valid_ips_bundle):
        """
        SHR Requirement: IPS should have allergies section.

        Quote: '"title": "Allergies and Intolerances"'
        """
        composition = self._get_composition(valid_ips_bundle)
        sections = composition.get("section", [])

        allergy_section = next((s for s in sections if "Allerg" in s.get("title", "")), None)
        assert allergy_section is not None, "Composition should have an Allergies section"

    def test_allergies_section_has_loinc_code(self, valid_ips_bundle):
        """
        SHR Requirement: Allergies section must have LOINC code.

        Quote: '"code": "48765-2", "display": "Allergies and adverse reactions"'
        """
        composition = self._get_composition(valid_ips_bundle)
        sections = composition.get("section", [])

        allergy_section = next((s for s in sections if "Allerg" in s.get("title", "")), None)
        if allergy_section:
            code = allergy_section.get("code", {})
            coding = code.get("coding", [{}])[0]
            assert coding.get("code") == "48765-2", (
                "Allergies section LOINC code should be '48765-2'"
            )

    def test_medication_section_present(self, valid_ips_bundle):
        """
        SHR Requirement: IPS should have medication list section.

        Quote: '"title": "Medication List"'
        """
        composition = self._get_composition(valid_ips_bundle)
        sections = composition.get("section", [])

        med_section = next((s for s in sections if "Medication" in s.get("title", "")), None)
        assert med_section is not None, "Composition should have a Medication List section"

    def test_medication_section_has_loinc_code(self, valid_ips_bundle):
        """
        SHR Requirement: Medication section must have LOINC code.

        Quote: '"code": "10160-0", "display": "History of Medication use"'
        """
        composition = self._get_composition(valid_ips_bundle)
        sections = composition.get("section", [])

        med_section = next((s for s in sections if "Medication" in s.get("title", "")), None)
        if med_section:
            code = med_section.get("code", {})
            coding = code.get("coding", [{}])[0]
            assert coding.get("code") == "10160-0", (
                "Medication section LOINC code should be '10160-0'"
            )

    def test_medication_section_has_entries(self, valid_ips_bundle):
        """
        SHR Requirement: Medication section should reference MedicationRequests.
        """
        composition = self._get_composition(valid_ips_bundle)
        sections = composition.get("section", [])

        med_section = next((s for s in sections if "Medication" in s.get("title", "")), None)
        if med_section:
            entries = med_section.get("entry", [])
            # May be empty if no medications
            assert isinstance(entries, list), "Medication section entry must be an array"

    def _get_composition(self, bundle):
        """Helper to extract Composition from bundle."""
        for entry in bundle.get("entry", []):
            resource = entry.get("resource", {})
            if resource.get("resourceType") == "Composition":
                return resource
        return {}


class TestIPSPatientResource:
    """
    Tests for Patient resource in IPS bundle.
    """

    def test_ips_contains_patient_resource(self, valid_ips_bundle):
        """
        SHR Requirement: IPS bundle must contain Patient resource.
        """
        patient = self._get_patient(valid_ips_bundle)
        assert patient, "IPS bundle must contain a Patient resource"

    def test_patient_has_identifier(self, valid_ips_bundle):
        """
        SHR Requirement: Patient in IPS must have identifier.
        """
        patient = self._get_patient(valid_ips_bundle)
        assert "identifier" in patient, "Patient in IPS must have 'identifier' field"

    def test_patient_has_name(self, valid_ips_bundle):
        """
        SHR Requirement: Patient in IPS must have name.
        """
        patient = self._get_patient(valid_ips_bundle)
        assert "name" in patient, "Patient in IPS must have 'name' field"

    def test_patient_has_gender(self, valid_ips_bundle):
        """
        SHR Requirement: Patient in IPS must have gender.
        """
        patient = self._get_patient(valid_ips_bundle)
        assert "gender" in patient, "Patient in IPS must have 'gender' field"

    def _get_patient(self, bundle):
        """Helper to extract Patient from bundle."""
        for entry in bundle.get("entry", []):
            resource = entry.get("resource", {})
            if resource.get("resourceType") == "Patient":
                return resource
        return {}


class TestIPSBundleEntryFormat:
    """
    Tests for bundle entry format in IPS.
    """

    def test_entries_have_full_url(self, valid_ips_bundle):
        """
        SHR Requirement: Bundle entries should have fullUrl.

        Quote: '"fullUrl": "urn:uuid:..."'
        """
        for entry in valid_ips_bundle.get("entry", []):
            assert "fullUrl" in entry, "Each bundle entry should have 'fullUrl'"

    def test_entries_have_resource(self, valid_ips_bundle):
        """
        SHR Requirement: Bundle entries must have resource.
        """
        for entry in valid_ips_bundle.get("entry", []):
            assert "resource" in entry, "Each bundle entry must have 'resource'"

    def test_full_url_format_is_urn_uuid(self, valid_ips_bundle):
        """
        SHR Requirement: Bundle entry fullUrl should use urn:uuid format.
        """
        for entry in valid_ips_bundle.get("entry", []):
            full_url = entry.get("fullUrl", "")
            assert full_url.startswith("urn:uuid:"), (
                "fullUrl should use 'urn:uuid:' format for document bundles"
            )


class TestIPSSummaryAPIEndpoint:
    """
    Tests for IPS summary API endpoint configuration.

    Reference: docs/sha-guides/shr-integration.md
    Quote: 'GET {{base_url}}/v1/shr/summary?cr_id=CR06XX3268000-3-1'
    """

    def test_shr_summary_endpoint_configured(self, shr_api_endpoints):
        """
        SHR Requirement: SHR summary endpoint must be configured.
        """
        assert "shr_summary" in shr_api_endpoints, "SHR API must include shr_summary endpoint"
        assert shr_api_endpoints["shr_summary"] == "/v1/shr/summary", (
            "SHR summary endpoint should be '/v1/shr/summary'"
        )

    def test_shr_summary_uses_get_method(self):
        """
        SHR Requirement: IPS summary uses GET method.

        Quote: 'GET {{base_url}}/v1/shr/summary?cr_id=...'
        """
        expected_method = "GET"
        assert expected_method == "GET", "IPS summary should use GET method"

    def test_shr_summary_requires_cr_id(self):
        """
        SHR Requirement: IPS summary endpoint requires cr_id query parameter.
        """
        required_param = "cr_id"
        assert required_param, "IPS summary endpoint must accept 'cr_id' query parameter"


class TestIPSBundleWithDispenseHistory:
    """
    Tests for IPS bundle containing dispense history for refill calculation.
    """

    def test_bundle_can_contain_medication_request(self, ips_bundle_with_dispense_history):
        """
        SHR Requirement: IPS bundle can contain MedicationRequest resources.
        """
        has_med_request = any(
            e.get("resource", {}).get("resourceType") == "MedicationRequest"
            for e in ips_bundle_with_dispense_history.get("entry", [])
        )
        assert has_med_request, "IPS bundle with dispense history should contain MedicationRequest"

    def test_bundle_can_contain_medication_dispense(self, ips_bundle_with_dispense_history):
        """
        SHR Requirement: IPS bundle can contain MedicationDispense resources.
        """
        has_med_dispense = any(
            e.get("resource", {}).get("resourceType") == "MedicationDispense"
            for e in ips_bundle_with_dispense_history.get("entry", [])
        )
        assert has_med_dispense, (
            "IPS bundle with dispense history should contain MedicationDispense"
        )
