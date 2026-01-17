"""
MedicationDispense FHIR compliance tests for SHA SHR Integration.

Tests validate compliance with the MedicationDispense structure
as documented in docs/sha-guides/shr-integration.md Section 4.

Reference: https://hl7.org/fhir/R4/medicationdispense.html
"""


class TestMedicationDispenseRequiredFields:
    """
    Tests for required MedicationDispense fields per SHR specification.

    Reference: docs/sha-guides/shr-integration.md Section 4
    Quote: 'POST {{base_url}}/v1/shr-submission?resource=MedicationDispense'
    """

    def test_medication_dispense_has_resource_type(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must have resourceType.
        """
        assert (
            "resourceType" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'resourceType' field"
        assert (
            valid_medication_dispense_fhir["resourceType"] == "MedicationDispense"
        ), "resourceType must be 'MedicationDispense'"

    def test_medication_dispense_has_id(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must have id.
        """
        assert "id" in valid_medication_dispense_fhir, "MedicationDispense must have 'id' field"
        assert valid_medication_dispense_fhir["id"], "MedicationDispense id must not be empty"

    def test_medication_dispense_has_status(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must have status.

        Quote from spec: '"status": "completed"'
        """
        assert (
            "status" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'status' field"
        valid_statuses = [
            "preparation",
            "in-progress",
            "cancelled",
            "on-hold",
            "completed",
            "entered-in-error",
            "stopped",
            "declined",
            "unknown",
        ]
        assert (
            valid_medication_dispense_fhir["status"] in valid_statuses
        ), f"status must be one of {valid_statuses}"

    def test_medication_dispense_has_medication(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must specify medication.
        """
        has_medication = (
            "medicationCodeableConcept" in valid_medication_dispense_fhir
            or "medicationReference" in valid_medication_dispense_fhir
        )
        assert (
            has_medication
        ), "MedicationDispense must have 'medicationCodeableConcept' or 'medicationReference'"

    def test_medication_dispense_has_subject(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must reference the patient.

        Quote from spec: '"subject": {"reference": "Patient/CR06XX3268000-3-1"}'
        """
        assert (
            "subject" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'subject' field"
        assert (
            "reference" in valid_medication_dispense_fhir["subject"]
        ), "subject must have 'reference' field"
        assert valid_medication_dispense_fhir["subject"]["reference"].startswith(
            "Patient/"
        ), "subject reference must start with 'Patient/'"


class TestMedicationDispenseMedicationCoding:
    """
    Tests for medication coding in MedicationDispense.
    """

    def test_medication_has_coding(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Medication must have coding.
        """
        medication = valid_medication_dispense_fhir.get("medicationCodeableConcept", {})
        assert "coding" in medication, "medicationCodeableConcept must have 'coding' array"

    def test_medication_coding_has_system(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Medication coding must have system.
        """
        medication = valid_medication_dispense_fhir.get("medicationCodeableConcept", {})
        coding = medication.get("coding", [{}])[0]

        assert "system" in coding, "medication coding must have 'system' field"

    def test_medication_coding_has_code(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Medication coding must have code.
        """
        medication = valid_medication_dispense_fhir.get("medicationCodeableConcept", {})
        coding = medication.get("coding", [{}])[0]

        assert "code" in coding, "medication coding must have 'code' field"

    def test_medication_coding_matches_request(
        self, valid_medication_dispense_fhir, valid_medication_request_fhir
    ):
        """
        SHR Requirement: Dispensed medication should match prescribed medication.
        """
        dispense_med = valid_medication_dispense_fhir.get("medicationCodeableConcept", {})
        request_med = valid_medication_request_fhir.get("medicationCodeableConcept", {})

        dispense_code = dispense_med.get("coding", [{}])[0].get("code")
        request_code = request_med.get("coding", [{}])[0].get("code")

        assert (
            dispense_code == request_code
        ), "Dispensed medication code should match prescribed medication code"


class TestMedicationDispensePerformer:
    """
    Tests for performer (pharmacist/organization) in MedicationDispense.

    Reference: docs/sha-guides/shr-integration.md
    Quote: '"performer": [{"actor": {"reference": "Practitioner/pharm-789"}}]'
    """

    def test_has_performer(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must have performer.
        """
        assert (
            "performer" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'performer' field"
        assert (
            len(valid_medication_dispense_fhir["performer"]) > 0
        ), "performer array must have at least one entry"

    def test_performer_has_actor(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Performer must have actor reference.
        """
        performer = valid_medication_dispense_fhir.get("performer", [{}])[0]
        assert "actor" in performer, "performer must have 'actor' field"

    def test_performer_actor_has_reference(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Performer actor must have reference.
        """
        performer = valid_medication_dispense_fhir.get("performer", [{}])[0]
        actor = performer.get("actor", {})

        assert "reference" in actor, "performer actor must have 'reference' field"

    def test_performer_includes_pharmacist(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Performer should include pharmacist.

        Quote: '"actor": {"reference": "Practitioner/pharm-789", "display": "Pharmacist Bob Green"}'
        """
        performers = valid_medication_dispense_fhir.get("performer", [])
        has_practitioner = any(
            "Practitioner/" in p.get("actor", {}).get("reference", "") for p in performers
        )
        assert (
            has_practitioner
        ), "performer should include a Practitioner reference for the pharmacist"

    def test_performer_includes_organization(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Performer should include dispensing organization.

        Quote: '"actor": {"reference": "Organization/org-123", "display": "Community Pharmacy"}'
        """
        performers = valid_medication_dispense_fhir.get("performer", [])
        has_organization = any(
            "Organization/" in p.get("actor", {}).get("reference", "") for p in performers
        )
        assert (
            has_organization
        ), "performer should include an Organization reference for the pharmacy"


class TestMedicationDispenseAuthorizingPrescription:
    """
    Tests for authorizing prescription reference in MedicationDispense.

    Reference: docs/sha-guides/shr-integration.md
    Quote: '"authorizingPrescription": [{"reference": "MedicationRequest/..."}]'
    """

    def test_has_authorizing_prescription(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must reference authorizing prescription.
        """
        assert (
            "authorizingPrescription" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'authorizingPrescription' field"
        assert (
            len(valid_medication_dispense_fhir["authorizingPrescription"]) > 0
        ), "authorizingPrescription must have at least one reference"

    def test_authorizing_prescription_has_reference(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: AuthorizingPrescription must have reference.
        """
        auth_rx = valid_medication_dispense_fhir.get("authorizingPrescription", [{}])[0]
        assert "reference" in auth_rx, "authorizingPrescription must have 'reference' field"

    def test_authorizing_prescription_references_medication_request(
        self, valid_medication_dispense_fhir
    ):
        """
        SHR Requirement: AuthorizingPrescription must reference a MedicationRequest.
        """
        auth_rx = valid_medication_dispense_fhir.get("authorizingPrescription", [{}])[0]
        reference = auth_rx.get("reference", "")

        assert reference.startswith(
            "MedicationRequest/"
        ), "authorizingPrescription reference must start with 'MedicationRequest/'"


class TestMedicationDispenseType:
    """
    Tests for dispense type in MedicationDispense.

    Reference: docs/sha-guides/shr-integration.md
    Quote: '"type": {"coding": [{"code": "RF", "display": "Refill"}]}'
    """

    def test_has_type(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense should have type.
        """
        assert (
            "type" in valid_medication_dispense_fhir
        ), "MedicationDispense should have 'type' field"

    def test_type_has_coding(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Type must have coding.
        """
        dispense_type = valid_medication_dispense_fhir.get("type", {})
        assert "coding" in dispense_type, "type must have 'coding' array"

    def test_type_uses_v3_act_code(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Type should use HL7 v3-ActCode system.
        """
        dispense_type = valid_medication_dispense_fhir.get("type", {})
        coding = dispense_type.get("coding", [{}])[0]

        assert "system" in coding, "type coding must have 'system' field"
        assert "v3-ActCode" in coding["system"], "type coding should use v3-ActCode system"


class TestMedicationDispenseQuantity:
    """
    Tests for quantity in MedicationDispense.

    Reference: docs/sha-guides/shr-integration.md
    Quote: '"quantity": {"value": 30, "unit": "tablets"}'
    """

    def test_has_quantity(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must have quantity.
        """
        assert (
            "quantity" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'quantity' field"

    def test_quantity_has_value(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Quantity must have numeric value.
        """
        quantity = valid_medication_dispense_fhir.get("quantity", {})
        assert "value" in quantity, "quantity must have 'value' field"
        assert isinstance(quantity["value"], (int, float)), "quantity value must be numeric"

    def test_quantity_has_unit(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Quantity must have unit.
        """
        quantity = valid_medication_dispense_fhir.get("quantity", {})
        assert "unit" in quantity, "quantity must have 'unit' field"


class TestMedicationDispenseDaysSupply:
    """
    Tests for days supply in MedicationDispense.

    Reference: docs/sha-guides/shr-integration.md
    Quote: '"daysSupply": {"value": 30, "unit": "days"}'
    """

    def test_has_days_supply(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense should have daysSupply for refill calculation.
        """
        assert (
            "daysSupply" in valid_medication_dispense_fhir
        ), "MedicationDispense should have 'daysSupply' field for refill tracking"

    def test_days_supply_has_value(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: DaysSupply must have numeric value.
        """
        days_supply = valid_medication_dispense_fhir.get("daysSupply", {})
        assert "value" in days_supply, "daysSupply must have 'value' field"

    def test_days_supply_has_unit(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: DaysSupply must have unit.
        """
        days_supply = valid_medication_dispense_fhir.get("daysSupply", {})
        assert "unit" in days_supply, "daysSupply must have 'unit' field"
        assert days_supply["unit"] == "days", "daysSupply unit should be 'days'"


class TestMedicationDispenseTimestamps:
    """
    Tests for timestamps in MedicationDispense.

    Reference: docs/sha-guides/shr-integration.md
    Quote: '"whenPrepared": "2025-04-27T09:15:00Z", "whenHandedOver": "2025-04-27T10:30:00Z"'
    """

    def test_has_when_prepared(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense should have whenPrepared timestamp.
        """
        assert (
            "whenPrepared" in valid_medication_dispense_fhir
        ), "MedicationDispense should have 'whenPrepared' timestamp"

    def test_has_when_handed_over(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense must have whenHandedOver for refill calculation.

        This is critical for computing the next refill date.
        """
        assert (
            "whenHandedOver" in valid_medication_dispense_fhir
        ), "MedicationDispense must have 'whenHandedOver' timestamp for refill tracking"

    def test_when_handed_over_is_iso_format(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Timestamps must be ISO 8601 format.
        """
        when_handed_over = valid_medication_dispense_fhir.get("whenHandedOver", "")
        # Should contain 'T' separating date and time
        assert (
            "T" in when_handed_over
        ), "whenHandedOver must be ISO 8601 datetime format (contains 'T')"


class TestMedicationDispenseDosageInstruction:
    """
    Tests for dosage instructions in MedicationDispense.
    """

    def test_has_dosage_instruction(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: MedicationDispense should include dosage instructions.
        """
        assert (
            "dosageInstruction" in valid_medication_dispense_fhir
        ), "MedicationDispense should have 'dosageInstruction' field"

    def test_dosage_instruction_has_text(self, valid_medication_dispense_fhir):
        """
        SHR Requirement: Dosage instruction must have text.

        Quote: '"text": "Take one tablet by mouth once daily"'
        """
        dosage = valid_medication_dispense_fhir.get("dosageInstruction", [{}])[0]
        assert "text" in dosage, "dosageInstruction must have 'text' field"


class TestMedicationDispenseSubjectConsistency:
    """
    Tests for subject consistency between Request and Dispense.
    """

    def test_dispense_subject_matches_request(
        self, valid_medication_dispense_fhir, valid_medication_request_fhir
    ):
        """
        SHR Requirement: Dispense subject must match prescription subject.
        """
        dispense_subject = valid_medication_dispense_fhir.get("subject", {}).get("reference", "")
        request_subject = valid_medication_request_fhir.get("subject", {}).get("reference", "")

        assert (
            dispense_subject == request_subject
        ), "MedicationDispense subject must match MedicationRequest subject"
