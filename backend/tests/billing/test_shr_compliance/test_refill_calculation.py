"""
Refill Balance Calculation compliance tests for SHA SHR Integration.

Tests validate the refill balance calculation logic
as documented in docs/sha-guides/shr-integration.md Section 5.

This implements the Python algorithm from the spec for computing
remaining refills, next refill date, and prescription validity.
"""

import uuid
from datetime import date, datetime, timedelta

import pytest  # type: ignore


class RefillCalculator:
    """
    Refill balance calculator per SHR specification.

    Reference: docs/sha-guides/shr-integration.md Section 5
    """

    @staticmethod
    def calculate_refill_balance(ips_bundle: dict, medication_request_id: str) -> dict:
        """
        Calculate remaining refills based on the IPS data.

        This is the Python implementation from the SHR spec.

        Args:
            ips_bundle: IPS FHIR bundle containing MedicationRequest and MedicationDispense
            medication_request_id: ID of the MedicationRequest to check

        Returns:
            dict with refill information
        """
        medication_request = None
        medication_dispenses = []

        # Process IPS bundle to find resources
        for entry in ips_bundle.get("entry", []):
            resource = entry.get("resource", {})

            if (
                resource.get("resourceType") == "MedicationRequest"
                and resource.get("id") == medication_request_id
            ):
                medication_request = resource

            if resource.get("resourceType") == "MedicationDispense":
                for prescription in resource.get("authorizingPrescription", []):
                    if (
                        prescription.get("reference")
                        == f"MedicationRequest/{medication_request_id}"
                    ):
                        medication_dispenses.append(resource)

        if not medication_request:
            return {
                "error": f"MedicationRequest {medication_request_id} not found in patient summary"
            }

        # Calculate refill information
        total_allowed_fills = (
            medication_request.get("dispenseRequest", {}).get("numberOfRepeatsAllowed", 0) + 1
        )
        total_dispenses = len(medication_dispenses)
        remaining_refills = total_allowed_fills - total_dispenses

        # Find next refill date based on most recent dispense
        next_refill_date = None
        if medication_dispenses:
            sorted_dispenses = sorted(
                medication_dispenses, key=lambda x: x.get("whenHandedOver", ""), reverse=True
            )

            latest_dispense = sorted_dispenses[0]
            when_handed_over = latest_dispense.get("whenHandedOver", "")
            if when_handed_over:
                latest_dispense_date = datetime.fromisoformat(
                    when_handed_over.replace("Z", "+00:00")
                )
                days_supply = latest_dispense.get("daysSupply", {}).get("value", 30)
                next_refill_date = (latest_dispense_date + timedelta(days=days_supply)).isoformat()

        # Check if prescription is still valid
        is_valid = True
        current_date = datetime.now()
        prescription_expiry = None

        if (
            "dispenseRequest" in medication_request
            and "validityPeriod" in medication_request["dispenseRequest"]
        ):
            end_date_str = medication_request["dispenseRequest"]["validityPeriod"].get("end")
            prescription_expiry = end_date_str
            if end_date_str:
                end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                if current_date > end_date:
                    is_valid = False

        return {
            "medicationRequestId": medication_request_id,
            "totalAllowedFills": total_allowed_fills,
            "fillsDispensed": total_dispenses,
            "remainingRefills": remaining_refills,
            "nextRefillDueDate": next_refill_date,
            "isPrescriptionValid": is_valid,
            "prescriptionExpiryDate": prescription_expiry,
        }


@pytest.fixture
def refill_calculator():
    """Provide refill calculator instance."""
    return RefillCalculator()


@pytest.fixture
def prescription_with_5_refills():
    """MedicationRequest with 5 refills allowed (6 total fills)."""
    return {
        "resourceType": "MedicationRequest",
        "id": "rx-12345",
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {
            "coding": [{"code": "197319", "display": "Amlodipine 5mg"}],
            "text": "Amlodipine 5mg",
        },
        "subject": {"reference": "Patient/CR06XX3268000-3-1"},
        "authoredOn": date.today().isoformat(),
        "dispenseRequest": {
            "validityPeriod": {
                "start": date.today().isoformat(),
                "end": (date.today() + timedelta(days=180)).isoformat(),
            },
            "numberOfRepeatsAllowed": 5,
            "quantity": {"value": 30, "unit": "tablets"},
            "expectedSupplyDuration": {"value": 30, "unit": "days"},
        },
    }


@pytest.fixture
def dispense_record_factory():
    """Factory for creating dispense records."""

    def create_dispense(medication_request_id: str, when_handed_over: str, days_supply: int = 30):
        return {
            "resourceType": "MedicationDispense",
            "id": str(uuid.uuid4()),
            "status": "completed",
            "medicationCodeableConcept": {
                "coding": [{"code": "197319", "display": "Amlodipine 5mg"}],
                "text": "Amlodipine 5mg",
            },
            "subject": {"reference": "Patient/CR06XX3268000-3-1"},
            "authorizingPrescription": [
                {"reference": f"MedicationRequest/{medication_request_id}"}
            ],
            "quantity": {"value": 30, "unit": "tablets"},
            "daysSupply": {"value": days_supply, "unit": "days"},
            "whenHandedOver": when_handed_over,
        }

    return create_dispense


@pytest.fixture
def ips_with_no_dispenses(prescription_with_5_refills):
    """IPS bundle with prescription but no dispenses yet."""
    return {
        "resourceType": "Bundle",
        "type": "document",
        "id": str(uuid.uuid4()),
        "entry": [{"fullUrl": f"urn:uuid:{uuid.uuid4()}", "resource": prescription_with_5_refills}],
    }


@pytest.fixture
def ips_with_2_dispenses(prescription_with_5_refills, dispense_record_factory):
    """IPS bundle with prescription and 2 dispenses."""
    rx_id = prescription_with_5_refills["id"]
    dispense1_date = (datetime.now() - timedelta(days=60)).isoformat() + "Z"
    dispense2_date = (datetime.now() - timedelta(days=30)).isoformat() + "Z"

    return {
        "resourceType": "Bundle",
        "type": "document",
        "id": str(uuid.uuid4()),
        "entry": [
            {"fullUrl": f"urn:uuid:{uuid.uuid4()}", "resource": prescription_with_5_refills},
            {
                "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                "resource": dispense_record_factory(rx_id, dispense1_date),
            },
            {
                "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                "resource": dispense_record_factory(rx_id, dispense2_date),
            },
        ],
    }


class TestRefillCalculationBasics:
    """
    Tests for basic refill calculation logic per SHR specification.

    Reference: docs/sha-guides/shr-integration.md Section 5
    """

    def test_total_fills_equals_repeats_plus_one(self, refill_calculator, ips_with_no_dispenses):
        """
        SHR Requirement: Total allowed fills = numberOfRepeatsAllowed + 1.

        Quote: 'Total allowed fills: This is the initial fill plus all refills'
        Quote: 'If the doctor allows 5 refills, the total is 6 fills (1 initial + 5 refills)'
        """
        result = refill_calculator.calculate_refill_balance(ips_with_no_dispenses, "rx-12345")

        assert result["totalAllowedFills"] == 6, "5 refills + 1 initial = 6 total fills"

    def test_remaining_refills_with_no_dispenses(self, refill_calculator, ips_with_no_dispenses):
        """
        SHR Requirement: Remaining = Total - Dispensed.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_no_dispenses, "rx-12345")

        assert result["fillsDispensed"] == 0, "No dispenses yet"
        assert result["remainingRefills"] == 6, "All 6 fills remaining"

    def test_remaining_refills_after_2_dispenses(self, refill_calculator, ips_with_2_dispenses):
        """
        SHR Requirement: Remaining = Total - Dispensed.

        Quote from example: 'fillsDispensed: 2, remainingRefills: 4'
        """
        result = refill_calculator.calculate_refill_balance(ips_with_2_dispenses, "rx-12345")

        assert result["fillsDispensed"] == 2, "2 dispenses recorded"
        assert result["remainingRefills"] == 4, "6 total - 2 dispensed = 4 remaining"


class TestNextRefillDateCalculation:
    """
    Tests for next refill date calculation.

    Reference: docs/sha-guides/shr-integration.md
    Quote: 'Add those days to the last pickup date to find when they can get their next refill'
    """

    def test_next_refill_date_based_on_days_supply(self, refill_calculator, ips_with_2_dispenses):
        """
        SHR Requirement: Next refill = last dispense date + days supply.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_2_dispenses, "rx-12345")

        assert result["nextRefillDueDate"] is not None, "Next refill date should be calculated"
        # The next refill should be approximately today (30 days after last dispense)
        # which was 30 days ago

    def test_no_next_refill_date_without_dispenses(self, refill_calculator, ips_with_no_dispenses):
        """
        SHR Requirement: No next refill date if no dispenses yet.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_no_dispenses, "rx-12345")

        assert result["nextRefillDueDate"] is None, "No next refill date without prior dispenses"

    def test_uses_most_recent_dispense(
        self, prescription_with_5_refills, dispense_record_factory, refill_calculator
    ):
        """
        SHR Requirement: Use most recent dispense for calculation.

        Quote: 'Look at when the patient last picked up their medication'
        """
        rx_id = prescription_with_5_refills["id"]

        # Create dispenses with different dates - most recent should be used
        old_dispense = dispense_record_factory(rx_id, "2025-01-01T10:00:00Z", 30)
        recent_dispense = dispense_record_factory(rx_id, "2025-01-05T10:00:00Z", 30)

        bundle = {
            "resourceType": "Bundle",
            "type": "document",
            "entry": [
                {"resource": prescription_with_5_refills},
                {"resource": old_dispense},
                {"resource": recent_dispense},
            ],
        }

        result = refill_calculator.calculate_refill_balance(bundle, rx_id)

        # Next refill should be based on Jan 5 + 30 days = Feb 4
        assert "2025-02-04" in result["nextRefillDueDate"], (
            "Next refill should be calculated from most recent dispense (Jan 5 + 30 days)"
        )


class TestPrescriptionValidity:
    """
    Tests for prescription validity checking.

    Reference: docs/sha-guides/shr-integration.md
    Quote: 'If today's date is past the end date, the prescription is no longer valid'
    """

    def test_valid_prescription_within_period(self, refill_calculator, ips_with_no_dispenses):
        """
        SHR Requirement: Prescription valid if within validity period.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_no_dispenses, "rx-12345")

        assert result["isPrescriptionValid"] is True, (
            "Prescription should be valid within validity period"
        )

    def test_expired_prescription(self, refill_calculator):
        """
        SHR Requirement: Prescription invalid if past end date.
        """
        expired_rx = {
            "resourceType": "MedicationRequest",
            "id": "rx-expired",
            "status": "active",
            "intent": "order",
            "medicationCodeableConcept": {"text": "Test Med"},
            "subject": {"reference": "Patient/test"},
            "dispenseRequest": {
                "validityPeriod": {"start": "2024-01-01", "end": "2024-06-01"},  # Expired
                "numberOfRepeatsAllowed": 5,
            },
        }

        bundle = {"resourceType": "Bundle", "type": "document", "entry": [{"resource": expired_rx}]}

        result = refill_calculator.calculate_refill_balance(bundle, "rx-expired")

        assert result["isPrescriptionValid"] is False, (
            "Expired prescription should be marked invalid"
        )

    def test_returns_prescription_expiry_date(self, refill_calculator, ips_with_no_dispenses):
        """
        SHR Requirement: Return prescription expiry date.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_no_dispenses, "rx-12345")

        assert result["prescriptionExpiryDate"] is not None, (
            "Should return prescription expiry date"
        )


class TestRefillCalculationErrors:
    """
    Tests for error handling in refill calculation.
    """

    def test_medication_request_not_found(self, refill_calculator):
        """
        SHR Requirement: Return error if MedicationRequest not found.
        """
        empty_bundle = {"resourceType": "Bundle", "type": "document", "entry": []}

        result = refill_calculator.calculate_refill_balance(empty_bundle, "non-existent")

        assert "error" in result, "Should return error when MedicationRequest not found"
        assert "not found" in result["error"].lower(), (
            "Error message should indicate MedicationRequest not found"
        )

    def test_handles_missing_days_supply(self, prescription_with_5_refills, refill_calculator):
        """
        SHR Requirement: Default to 30 days if daysSupply not specified.
        """
        rx_id = prescription_with_5_refills["id"]
        dispense_without_days_supply = {
            "resourceType": "MedicationDispense",
            "id": str(uuid.uuid4()),
            "status": "completed",
            "authorizingPrescription": [{"reference": f"MedicationRequest/{rx_id}"}],
            "whenHandedOver": datetime.now().isoformat() + "Z",
            # No daysSupply field
        }

        bundle = {
            "resourceType": "Bundle",
            "type": "document",
            "entry": [
                {"resource": prescription_with_5_refills},
                {"resource": dispense_without_days_supply},
            ],
        }

        result = refill_calculator.calculate_refill_balance(bundle, rx_id)

        # Should not error, should use default 30 days
        assert "error" not in result, "Should handle missing daysSupply gracefully"
        assert result["nextRefillDueDate"] is not None, (
            "Should calculate next refill with default 30 days"
        )


class TestRefillCalculationOutput:
    """
    Tests for refill calculation output format.

    Reference: docs/sha-guides/shr-integration.md Example Output
    """

    def test_output_contains_all_required_fields(self, refill_calculator, ips_with_2_dispenses):
        """
        SHR Requirement: Output must contain all specified fields.

        Quote from example output: medicationRequestId, totalAllowedFills, fillsDispensed,
        remainingRefills, nextRefillDueDate, isPrescriptionValid, prescriptionExpiryDate
        """
        result = refill_calculator.calculate_refill_balance(ips_with_2_dispenses, "rx-12345")

        required_fields = [
            "medicationRequestId",
            "totalAllowedFills",
            "fillsDispensed",
            "remainingRefills",
            "nextRefillDueDate",
            "isPrescriptionValid",
            "prescriptionExpiryDate",
        ]

        for field in required_fields:
            assert field in result, f"Output must contain '{field}' field"

    def test_medication_request_id_in_output(self, refill_calculator, ips_with_2_dispenses):
        """
        SHR Requirement: Output includes the queried medication request ID.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_2_dispenses, "rx-12345")

        assert result["medicationRequestId"] == "rx-12345", (
            "Output should include the queried medication request ID"
        )

    def test_numeric_fields_are_integers(self, refill_calculator, ips_with_2_dispenses):
        """
        SHR Requirement: Numeric fields should be integers.
        """
        result = refill_calculator.calculate_refill_balance(ips_with_2_dispenses, "rx-12345")

        assert isinstance(result["totalAllowedFills"], int), (
            "totalAllowedFills should be an integer"
        )
        assert isinstance(result["fillsDispensed"], int), "fillsDispensed should be an integer"
        assert isinstance(result["remainingRefills"], int), "remainingRefills should be an integer"
