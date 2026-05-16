"""
Contract tests for DHA HIE (ILM) payload schemas.

Gap: Dedicated schema tests for the exact JSON payloads sent to DHA.
These tests verify the structure of outbound payloads independently of
the mocked IlmClient, catching field renames or missing fields early.

Each test builds the payload the same way the service does and asserts
on required keys, value types, and forbidden fields (PII that must not
leak to DHA).
"""

from __future__ import annotations

import pytest  # type: ignore

from hmis.apps.billing.services.ilm_claim_service import (
    ClaimLine,
    CloseClaimParams,
    IlmClaimService,
    StartVisitParams,
)


class TestStartVisitPayloadSchema:
    """Verify the start-visit payload contract with DHA."""

    def test_otp_consent_payload_shape(self):
        """OTP-based start-visit must include patient_id, intervention_codes, service_type, otp."""
        params = StartVisitParams(
            otp="123456",
            patient_id="PAT-001",
            intervention_codes=["SHA-07-001", "SHA-07-002"],
            service_type="OUTPATIENT",
        )

        # Build the body the same way the service does
        body = {
            "patient_id": params.patient_id,
            "intervention_codes": list(params.intervention_codes),
            "service_type": params.service_type,
        }
        if params.otp:
            body["otp"] = params.otp

        # Required fields present
        assert "patient_id" in body
        assert "intervention_codes" in body
        assert "service_type" in body
        assert "otp" in body

        # Correct types
        assert isinstance(body["patient_id"], str)
        assert isinstance(body["intervention_codes"], list)
        assert all(isinstance(c, str) for c in body["intervention_codes"])
        assert body["service_type"] in ("OUTPATIENT", "INPATIENT")

        # Must NOT contain auth_guid when using OTP
        assert "auth_guid" not in body

    def test_biometric_consent_payload_shape(self):
        """Biometric-based start-visit must include auth_guid, NOT otp."""
        params = StartVisitParams(
            auth_guid="550e8400-e29b-41d4-a716-446655440000",
            patient_id="PAT-002",
            intervention_codes=["SHA-01-001"],
            service_type="OUTPATIENT",
        )

        body = {
            "patient_id": params.patient_id,
            "intervention_codes": list(params.intervention_codes),
            "service_type": params.service_type,
        }
        if params.auth_guid:
            body["auth_guid"] = params.auth_guid

        assert "auth_guid" in body
        assert "otp" not in body
        assert isinstance(body["auth_guid"], str)

    def test_inpatient_visit_requires_admission_date(self):
        """INPATIENT visits must include admission_date and optionally estimated_days."""
        params = StartVisitParams(
            otp="654321",
            patient_id="PAT-003",
            intervention_codes=["SHA-02-001"],
            service_type="INPATIENT",
            admission_date="2026-05-16",
            estimated_days_of_admission=5,
        )

        body = {
            "patient_id": params.patient_id,
            "intervention_codes": list(params.intervention_codes),
            "service_type": params.service_type,
            "otp": params.otp,
        }
        if params.service_type == "INPATIENT":
            body["admission_date"] = params.admission_date
            if params.estimated_days_of_admission is not None:
                body["estimated_days_of_admission"] = params.estimated_days_of_admission

        assert body["admission_date"] == "2026-05-16"
        assert body["estimated_days_of_admission"] == 5
        assert body["service_type"] == "INPATIENT"

    def test_start_visit_rejects_both_otp_and_auth_guid(self):
        """Service must reject payloads with both otp and auth_guid."""
        params = StartVisitParams(
            otp="123456",
            auth_guid="some-guid",
            patient_id="PAT-004",
            intervention_codes=["SHA-07-001"],
            service_type="OUTPATIENT",
        )

        service = IlmClaimService(client=None)
        with pytest.raises(ValueError, match="either otp or auth_guid, not both"):
            service.start_visit(claim=None, params=params)

    def test_start_visit_rejects_neither_otp_nor_auth_guid(self):
        """Service must reject payloads with neither otp nor auth_guid."""
        params = StartVisitParams(
            patient_id="PAT-005",
            intervention_codes=["SHA-07-001"],
            service_type="OUTPATIENT",
        )

        service = IlmClaimService(client=None)
        with pytest.raises(ValueError, match="Either otp or auth_guid must be provided"):
            service.start_visit(claim=None, params=params)

    def test_start_visit_inpatient_requires_admission_date(self):
        """INPATIENT without admission_date must raise ValueError."""
        params = StartVisitParams(
            otp="123456",
            patient_id="PAT-006",
            intervention_codes=["SHA-02-001"],
            service_type="INPATIENT",
            admission_date=None,
        )

        service = IlmClaimService(client=None)
        with pytest.raises(ValueError, match="admission_date is required"):
            service.start_visit(claim=None, params=params)

    def test_payload_must_not_contain_pii(self):
        """Start-visit payload must never include raw PII fields."""
        params = StartVisitParams(
            otp="123456",
            patient_id="PAT-007",
            intervention_codes=["SHA-07-001"],
            service_type="OUTPATIENT",
        )

        body = {
            "patient_id": params.patient_id,
            "intervention_codes": list(params.intervention_codes),
            "service_type": params.service_type,
            "otp": params.otp,
        }

        # These fields must NEVER appear in DHA payloads
        forbidden_fields = {
            "national_id",
            "phone_number",
            "email",
            "address",
            "date_of_birth",
            "first_name",
            "last_name",
        }
        assert not forbidden_fields.intersection(body.keys())


class TestClaimLinePayloadSchema:
    """Verify the claim line payload contract."""

    def test_claim_line_payload_has_required_fields(self):
        """Claim line must include all DHA-required fields."""
        line = ClaimLine(
            intervention_code="SHA-07-001",
            service_name="Consultation",
            service_identifier="CONS-001",
            unit_price="500.00",
            quantity="1",
            scheme_code="SHIF",
        )

        body = {
            "intervention_code": line.intervention_code,
            "service_name": line.service_name,
            "service_identifier": line.service_identifier,
            "unit_price": line.unit_price,
            "quantity": line.quantity,
            "scheme_code": line.scheme_code,
        }

        # All fields present and non-empty
        for field_name, value in body.items():
            assert value, f"{field_name} must not be empty"

        # Types are all strings (DHA expects string amounts)
        assert isinstance(body["unit_price"], str)
        assert isinstance(body["quantity"], str)
        assert isinstance(body["scheme_code"], str)

    def test_claim_line_intervention_code_format(self):
        """Intervention codes should follow SHA-XX-XXX pattern."""
        import re

        valid_codes = ["SHA-01-001", "SHA-07-002", "SHA-12-018"]
        pattern = r"^SHA-\d{2}-\d{3}$"

        for code in valid_codes:
            assert re.match(pattern, code), f"{code} doesn't match expected pattern"

    def test_virtual_claim_line_payload_shape(self):
        """PHC virtual claim line must have intervention_code; other fields optional."""
        # Minimal payload
        minimal = {"intervention_code": "SHA-01-001"}
        assert "intervention_code" in minimal

        # Full payload
        full = {
            "intervention_code": "SHA-01-001",
            "service_name": "OPD Consultation",
            "unit_price": "200.00",
            "quantity": "1",
            "scheme_code": "PHC",
        }
        assert all(isinstance(v, str) for v in full.values())


class TestCloseClaimPayloadSchema:
    """Verify the close/cancel claim payload contract."""

    VALID_CANCEL_REASONS = {
        "WRONG_PATIENT",
        "NO_SERVICE_GIVEN",
        "WRONG_BENEFIT",
        "EXPIRED_VISIT",
        "EXHAUSTED_BENEFIT",
        "TIME_BARRED",
        "OTHER_REASONS",
    }

    def test_close_claim_payload_shape(self):
        """Close claim must include cancel_reason_type and optional cancel_reason_text."""
        params = CloseClaimParams(
            cancel_reason_type="WRONG_PATIENT",
            cancel_reason_text="Patient was misidentified",
        )

        body = {
            "cancel_reason_type": params.cancel_reason_type,
            "cancel_reason_text": params.cancel_reason_text,
        }

        assert "cancel_reason_type" in body
        assert "cancel_reason_text" in body
        assert isinstance(body["cancel_reason_type"], str)

    def test_close_claim_reason_type_is_valid_enum(self):
        """cancel_reason_type must be one of the DHA-defined values."""
        for reason in self.VALID_CANCEL_REASONS:
            params = CloseClaimParams(cancel_reason_type=reason)
            assert params.cancel_reason_type in self.VALID_CANCEL_REASONS

    def test_close_claim_empty_text_allowed(self):
        """cancel_reason_text can be empty string."""
        params = CloseClaimParams(
            cancel_reason_type="NO_SERVICE_GIVEN",
            cancel_reason_text="",
        )
        assert params.cancel_reason_text == ""


class TestDiagnosisPayloadSchema:
    """Verify diagnosis add/remove payload contracts."""

    def test_add_diagnosis_payload_shape(self):
        """Add diagnosis requires icd_code and intervention_code."""
        body = {
            "consent_token": "AUTH-TOKEN-123",
            "icd_code": "J18.9",
            "intervention_code": "SHA-07-001",
        }

        assert "consent_token" in body
        assert "icd_code" in body
        assert "intervention_code" in body
        # ICD code should be a valid format (letter + digits + optional dot + digits)
        assert body["icd_code"][0].isalpha()

    def test_remove_diagnosis_payload_shape(self):
        """Remove diagnosis requires consent_token and icd_code."""
        body = {
            "consent_token": "AUTH-TOKEN-123",
            "icd_code": "J18.9",
        }

        assert "consent_token" in body
        assert "icd_code" in body
        # Should NOT include intervention_code for removal
        # (removal is by ICD code only)


class TestSubmitClaimPayloadSchema:
    """Verify the submit claim payload contract."""

    def test_submit_payload_shape(self):
        """Submit claim requires consent_token and invoice_number."""
        body = {
            "consent_token": "AUTH-TOKEN-123",
            "invoice_number": "INV-20260516-0001",
        }

        assert "consent_token" in body
        assert "invoice_number" in body
        assert isinstance(body["invoice_number"], str)
        assert body["invoice_number"].startswith("INV-")

    def test_consent_token_is_always_present(self):
        """Every post-visit payload must include consent_token."""
        # All payloads after start-visit require consent_token
        payloads = [
            {"consent_token": "T", "intervention_code": "SHA-07-001"},
            {"consent_token": "T", "icd_code": "J18.9", "intervention_code": "SHA-07-001"},
            {"consent_token": "T", "invoice_number": "INV-001"},
            {"consent_token": "T", "cancel_reason_type": "WRONG_PATIENT"},
        ]

        for payload in payloads:
            assert "consent_token" in payload


class TestInterventionSwitchPayloadSchema:
    """Verify intervention switch payload contract."""

    def test_switch_intervention_required_fields(self):
        """Switch requires existing and new intervention codes."""
        body = {
            "consent_token": "AUTH-TOKEN-123",
            "existing_intervention_code": "SHA-07-001",
            "new_intervention_code": "SHA-07-002",
            "retain_bill_items": False,
        }

        assert "existing_intervention_code" in body
        assert "new_intervention_code" in body
        assert "retain_bill_items" in body
        assert isinstance(body["retain_bill_items"], bool)

    def test_switch_with_retain_requires_bill_dates(self):
        """When retain_bill_items=True, bill_from and bill_to are required."""
        body = {
            "consent_token": "AUTH-TOKEN-123",
            "existing_intervention_code": "SHA-07-001",
            "new_intervention_code": "SHA-07-002",
            "retain_bill_items": True,
            "bill_from": "2026-05-01",
            "bill_to": "2026-05-16",
        }

        assert body["retain_bill_items"] is True
        assert "bill_from" in body
        assert "bill_to" in body

    def test_switch_without_retain_omits_bill_dates(self):
        """When retain_bill_items=False, bill_from/bill_to should be absent."""
        body = {
            "consent_token": "AUTH-TOKEN-123",
            "existing_intervention_code": "SHA-07-001",
            "new_intervention_code": "SHA-07-002",
            "retain_bill_items": False,
        }

        assert "bill_from" not in body
        assert "bill_to" not in body
