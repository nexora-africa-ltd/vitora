"""
MedicationRequest FHIR compliance tests for SHA SHR Integration.

Tests validate compliance with the MedicationRequest (Prescription) structure
as documented in docs/sha-guides/shr-integration.md Section 2.

Reference: https://hl7.org/fhir/R4/medicationrequest.html
"""

import pytest  # type: ignore


class TestMedicationRequestRequiredFields:
    """
    Tests for required MedicationRequest fields per SHR specification.
    
    Reference: docs/sha-guides/shr-integration.md Section 2
    Quote: 'POST {{base_url}}/v1/shr-submission?resource=MedicationRequest'
    """

    def test_medication_request_has_resource_type(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have resourceType.
        """
        assert 'resourceType' in valid_medication_request_fhir, (
            "MedicationRequest must have 'resourceType' field"
        )
        assert valid_medication_request_fhir['resourceType'] == 'MedicationRequest', (
            "resourceType must be 'MedicationRequest'"
        )

    def test_medication_request_has_id(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have id.
        """
        assert 'id' in valid_medication_request_fhir, (
            "MedicationRequest must have 'id' field"
        )
        assert valid_medication_request_fhir['id'], (
            "MedicationRequest id must not be empty"
        )

    def test_medication_request_has_status(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have status.
        
        Quote from spec: '"status": "active"'
        """
        assert 'status' in valid_medication_request_fhir, (
            "MedicationRequest must have 'status' field"
        )
        valid_statuses = ['active', 'on-hold', 'cancelled', 'completed', 
                         'entered-in-error', 'stopped', 'draft', 'unknown']
        assert valid_medication_request_fhir['status'] in valid_statuses, (
            f"status must be one of {valid_statuses}"
        )

    def test_medication_request_has_intent(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have intent.
        
        Quote from spec: '"intent": "order"'
        """
        assert 'intent' in valid_medication_request_fhir, (
            "MedicationRequest must have 'intent' field"
        )
        valid_intents = ['proposal', 'plan', 'order', 'original-order', 
                        'reflex-order', 'filler-order', 'instance-order', 'option']
        assert valid_medication_request_fhir['intent'] in valid_intents, (
            f"intent must be one of {valid_intents}"
        )

    def test_medication_request_has_medication(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must specify medication.
        
        Quote from spec: '"medicationCodeableConcept": {...}'
        """
        has_medication = (
            'medicationCodeableConcept' in valid_medication_request_fhir or
            'medicationReference' in valid_medication_request_fhir
        )
        assert has_medication, (
            "MedicationRequest must have 'medicationCodeableConcept' or 'medicationReference'"
        )

    def test_medication_request_has_subject(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must reference the patient.
        
        Quote from spec: '"subject": {"reference": "Patient/CR06XX3268000-3-1"}'
        """
        assert 'subject' in valid_medication_request_fhir, (
            "MedicationRequest must have 'subject' field"
        )
        assert 'reference' in valid_medication_request_fhir['subject'], (
            "subject must have 'reference' field"
        )
        assert valid_medication_request_fhir['subject']['reference'].startswith('Patient/'), (
            "subject reference must start with 'Patient/'"
        )

    def test_medication_request_has_authored_on(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have authoredOn date.
        
        Quote from spec: '"authoredOn": "2025-03-28"'
        """
        assert 'authoredOn' in valid_medication_request_fhir, (
            "MedicationRequest must have 'authoredOn' field"
        )

    def test_medication_request_has_requester(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have requester (prescriber).
        
        Quote from spec: '"requester": {"reference": "Practitioner/123456"}'
        """
        assert 'requester' in valid_medication_request_fhir, (
            "MedicationRequest must have 'requester' field"
        )
        assert 'reference' in valid_medication_request_fhir['requester'], (
            "requester must have 'reference' field"
        )


class TestMedicationRequestMedicationCoding:
    """
    Tests for medication coding in MedicationRequest.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: 'coding: [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm", ...}]'
    """

    def test_medication_has_coding(self, valid_medication_request_fhir):
        """
        SHR Requirement: Medication must have coding.
        """
        medication = valid_medication_request_fhir.get('medicationCodeableConcept', {})
        assert 'coding' in medication, (
            "medicationCodeableConcept must have 'coding' array"
        )
        assert len(medication['coding']) > 0, (
            "coding array must have at least one entry"
        )

    def test_medication_coding_has_system(self, valid_medication_request_fhir):
        """
        SHR Requirement: Medication coding must have system.
        
        Expected: RxNorm, SNOMED-CT, or local coding system
        """
        medication = valid_medication_request_fhir.get('medicationCodeableConcept', {})
        coding = medication.get('coding', [{}])[0]
        
        assert 'system' in coding, (
            "medication coding must have 'system' field"
        )

    def test_medication_coding_has_code(self, valid_medication_request_fhir):
        """
        SHR Requirement: Medication coding must have code.
        """
        medication = valid_medication_request_fhir.get('medicationCodeableConcept', {})
        coding = medication.get('coding', [{}])[0]
        
        assert 'code' in coding, (
            "medication coding must have 'code' field"
        )

    def test_medication_coding_has_display(self, valid_medication_request_fhir):
        """
        SHR Requirement: Medication coding should have display.
        """
        medication = valid_medication_request_fhir.get('medicationCodeableConcept', {})
        coding = medication.get('coding', [{}])[0]
        
        assert 'display' in coding, (
            "medication coding should have 'display' field for human readability"
        )

    def test_medication_has_text(self, valid_medication_request_fhir):
        """
        SHR Requirement: Medication should have text description.
        
        Quote from spec: '"text": "Amlodipine 5mg tablet"'
        """
        medication = valid_medication_request_fhir.get('medicationCodeableConcept', {})
        assert 'text' in medication, (
            "medicationCodeableConcept should have 'text' field"
        )


class TestMedicationRequestDosageInstruction:
    """
    Tests for dosage instructions in MedicationRequest.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: '"dosageInstruction": [{...}]'
    """

    def test_has_dosage_instruction(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest should have dosage instructions.
        """
        assert 'dosageInstruction' in valid_medication_request_fhir, (
            "MedicationRequest should have 'dosageInstruction' field"
        )
        assert len(valid_medication_request_fhir['dosageInstruction']) > 0, (
            "dosageInstruction must have at least one entry"
        )

    def test_dosage_instruction_has_text(self, valid_medication_request_fhir):
        """
        SHR Requirement: Dosage instruction must have text.
        
        Quote: '"text": "Take one tablet by mouth once daily"'
        """
        dosage = valid_medication_request_fhir.get('dosageInstruction', [{}])[0]
        assert 'text' in dosage, (
            "dosageInstruction must have 'text' field"
        )

    def test_dosage_instruction_has_timing(self, valid_medication_request_fhir):
        """
        SHR Requirement: Dosage instruction should have timing.
        """
        dosage = valid_medication_request_fhir.get('dosageInstruction', [{}])[0]
        assert 'timing' in dosage, (
            "dosageInstruction should have 'timing' field"
        )

    def test_timing_has_repeat(self, valid_medication_request_fhir):
        """
        SHR Requirement: Timing should have repeat schedule.
        """
        dosage = valid_medication_request_fhir.get('dosageInstruction', [{}])[0]
        timing = dosage.get('timing', {})
        
        assert 'repeat' in timing, (
            "timing should have 'repeat' field"
        )

    def test_repeat_has_frequency(self, valid_medication_request_fhir):
        """
        SHR Requirement: Repeat must specify frequency.
        
        Quote: '"frequency": 1, "period": 1, "periodUnit": "d"'
        """
        dosage = valid_medication_request_fhir.get('dosageInstruction', [{}])[0]
        repeat = dosage.get('timing', {}).get('repeat', {})
        
        assert 'frequency' in repeat, (
            "repeat must have 'frequency' field"
        )
        assert 'period' in repeat, (
            "repeat must have 'period' field"
        )
        assert 'periodUnit' in repeat, (
            "repeat must have 'periodUnit' field"
        )

    def test_dosage_has_route(self, valid_medication_request_fhir):
        """
        SHR Requirement: Dosage should specify route of administration.
        
        Quote: '"route": {"coding": [{"system": "http://snomed.info/sct", ...}]}'
        """
        dosage = valid_medication_request_fhir.get('dosageInstruction', [{}])[0]
        assert 'route' in dosage, (
            "dosageInstruction should have 'route' field"
        )

    def test_dosage_has_dose_and_rate(self, valid_medication_request_fhir):
        """
        SHR Requirement: Dosage should specify dose and rate.
        """
        dosage = valid_medication_request_fhir.get('dosageInstruction', [{}])[0]
        assert 'doseAndRate' in dosage, (
            "dosageInstruction should have 'doseAndRate' field"
        )


class TestMedicationRequestDispenseRequest:
    """
    Tests for dispense request in MedicationRequest.
    
    Reference: docs/sha-guides/shr-integration.md
    Quote: '"dispenseRequest": {...}'
    """

    def test_has_dispense_request(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest must have dispenseRequest.
        """
        assert 'dispenseRequest' in valid_medication_request_fhir, (
            "MedicationRequest must have 'dispenseRequest' field for refill tracking"
        )

    def test_dispense_request_has_validity_period(self, valid_medication_request_fhir):
        """
        SHR Requirement: DispenseRequest must have validityPeriod.
        
        Quote: '"validityPeriod": {"start": "2025-03-28", "end": "2025-09-28"}'
        """
        dispense_request = valid_medication_request_fhir.get('dispenseRequest', {})
        assert 'validityPeriod' in dispense_request, (
            "dispenseRequest must have 'validityPeriod' field"
        )
        
        validity = dispense_request['validityPeriod']
        assert 'start' in validity, (
            "validityPeriod must have 'start' date"
        )
        assert 'end' in validity, (
            "validityPeriod must have 'end' date"
        )

    def test_dispense_request_has_number_of_repeats(self, valid_medication_request_fhir):
        """
        SHR Requirement: DispenseRequest must specify number of refills.
        
        Quote: '"numberOfRepeatsAllowed": 5'
        """
        dispense_request = valid_medication_request_fhir.get('dispenseRequest', {})
        assert 'numberOfRepeatsAllowed' in dispense_request, (
            "dispenseRequest must have 'numberOfRepeatsAllowed' field for refill tracking"
        )
        assert isinstance(dispense_request['numberOfRepeatsAllowed'], int), (
            "numberOfRepeatsAllowed must be an integer"
        )

    def test_dispense_request_has_quantity(self, valid_medication_request_fhir):
        """
        SHR Requirement: DispenseRequest must specify quantity per fill.
        
        Quote: '"quantity": {"value": 30, "unit": "tablets"}'
        """
        dispense_request = valid_medication_request_fhir.get('dispenseRequest', {})
        assert 'quantity' in dispense_request, (
            "dispenseRequest must have 'quantity' field"
        )
        
        quantity = dispense_request['quantity']
        assert 'value' in quantity, (
            "quantity must have 'value' field"
        )
        assert 'unit' in quantity, (
            "quantity must have 'unit' field"
        )

    def test_dispense_request_has_supply_duration(self, valid_medication_request_fhir):
        """
        SHR Requirement: DispenseRequest should specify supply duration.
        
        Quote: '"expectedSupplyDuration": {"value": 30, "unit": "days"}'
        """
        dispense_request = valid_medication_request_fhir.get('dispenseRequest', {})
        assert 'expectedSupplyDuration' in dispense_request, (
            "dispenseRequest should have 'expectedSupplyDuration' field"
        )


class TestMedicationRequestReasonCode:
    """
    Tests for reason code (diagnosis) in MedicationRequest.
    """

    def test_has_reason_code(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest should have reasonCode (diagnosis).
        
        Quote: '"reasonCode": [{"coding": [{"system": "http://hl7.org/fhir/sid/icd-10", ...}]}]'
        """
        assert 'reasonCode' in valid_medication_request_fhir, (
            "MedicationRequest should have 'reasonCode' field linking to diagnosis"
        )

    def test_reason_code_uses_icd10(self, valid_medication_request_fhir):
        """
        SHR Requirement: ReasonCode should use ICD-10 coding.
        """
        reason_codes = valid_medication_request_fhir.get('reasonCode', [])
        if reason_codes:
            coding = reason_codes[0].get('coding', [{}])[0]
            assert 'system' in coding, (
                "reasonCode coding must have 'system' field"
            )
            # ICD-10 system
            assert 'icd-10' in coding['system'].lower() or 'icd10' in coding['system'].lower(), (
                "reasonCode should use ICD-10 coding system"
            )


class TestMedicationRequestSubstitution:
    """
    Tests for substitution settings in MedicationRequest.
    """

    def test_has_substitution(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest should specify substitution policy.
        
        Quote: '"substitution": {"allowedBoolean": true, ...}'
        """
        assert 'substitution' in valid_medication_request_fhir, (
            "MedicationRequest should have 'substitution' field"
        )

    def test_substitution_has_allowed_flag(self, valid_medication_request_fhir):
        """
        SHR Requirement: Substitution must indicate if allowed.
        """
        substitution = valid_medication_request_fhir.get('substitution', {})
        has_allowed = (
            'allowedBoolean' in substitution or 
            'allowedCodeableConcept' in substitution
        )
        assert has_allowed, (
            "substitution must have 'allowedBoolean' or 'allowedCodeableConcept'"
        )


class TestMedicationRequestRecorder:
    """
    Tests for recorder in MedicationRequest.
    """

    def test_has_recorder(self, valid_medication_request_fhir):
        """
        SHR Requirement: MedicationRequest should have recorder.
        
        Quote: '"recorder": {"reference": "Practitioner/123456"}'
        """
        assert 'recorder' in valid_medication_request_fhir, (
            "MedicationRequest should have 'recorder' field"
        )

    def test_recorder_has_reference(self, valid_medication_request_fhir):
        """
        SHR Requirement: Recorder must have reference.
        """
        recorder = valid_medication_request_fhir.get('recorder', {})
        assert 'reference' in recorder, (
            "recorder must have 'reference' field"
        )
