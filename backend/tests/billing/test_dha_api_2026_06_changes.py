"""Tests for DHA API June 2026 changes.

Covers:
1. X-Facility-Id / X-Facility-Id-Type headers on all ILM requests
2. Practitioner fields on start_visit, add_line, add_diagnosis
3. Outpatient discharge consent fields on submit (otp/discharge_auth_guid/discharge_reason/notes)
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings
from django.utils import timezone

from hmis.apps.billing.models import ConsentToken, SHAClaim, SHAMember
from hmis.apps.billing.services.ilm_claim_service import (
    DIAGNOSES_PATH,
    LINES_PATH,
    SUBMIT_PATH,
    VISIT_PATH,
    ClaimLine,
    IlmClaimService,
    StartVisitParams,
)
from hmis.apps.billing.services.ilm_client import IlmClient, IlmResponse


def _make_response(status_code=200, payload=None, headers=None):
    return IlmResponse(
        status_code=status_code,
        headers=headers or {},
        json=payload,
        text="" if payload is None else str(payload),
        elapsed_ms=12,
    )


class _FakeHTTPResponse:
    def __init__(self, status_code=200, json_data=None, text=None, headers=None):
        self.status_code = status_code
        self._json = json_data
        self.text = text if text is not None else ""
        self.headers = headers or {"Content-Type": "application/json"}

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


@pytest.fixture
def auth_stub(mocker):
    fake = mocker.MagicMock()
    fake.auth_mode = "ilm"
    fake.auth_base_url = "https://uat-middleware.example"
    fake.get_auth_headers.return_value = {"Authorization": "Bearer test-token"}
    return fake


@pytest.fixture
def ilm_client(auth_stub):
    return IlmClient(
        auth_service=auth_stub,
        base_url="https://uat-middleware.example",
        timeout=5,
        max_retries=0,
        backoff_seconds=0,
    )


@pytest.fixture
def mock_client():
    client = MagicMock()
    client.post.return_value = _make_response(200, {"ok": True})
    client.patch.return_value = _make_response(200, {"ok": True})
    return client


@pytest.fixture
def service(mock_client):
    return IlmClaimService(client=mock_client)


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    SHAMember.objects.filter(patient=sample_patient).delete()
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-TEST-0001",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
    )


@pytest.fixture
def claim(db, sample_patient, sample_encounter, sha_member, sample_facility, test_user):
    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        facility=sample_facility,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="URI",
        claimed_amount=Decimal("500.00"),
        facility_code="MFL-001",
        facility_level="L4",
        created_by=test_user,
    )


@pytest.fixture
def consent(db, claim, test_user):
    return ConsentToken.objects.create(
        patient=claim.patient,
        sha_member=claim.sha_member,
        encounter=claim.encounter,
        facility=claim.facility,
        consent_method=ConsentToken.ConsentMethod.OTP,
        status=ConsentToken.ConsentStatus.VALIDATED,
        identification_number="12345678",
        consent_token="CT-TOKEN-XYZ",
        validated_at=timezone.now(),
        expires_at=timezone.now() + timedelta(hours=1),
        created_by=test_user,
    )


# ===========================================================================
# 1. Facility ID Headers
# ===========================================================================


@pytest.mark.django_db
class TestFacilityIdHeaders:
    """X-Facility-Id and X-Facility-Id-Type headers on all outbound requests."""

    def test_facility_fr_code_injected_from_facility_object(self, ilm_client, sample_facility):
        """When facility has dha_fr_code, it is sent as X-Facility-Id."""
        sample_facility.dha_fr_code = "FID-01-23"
        sample_facility.save(update_fields=["dha_fr_code"])

        with patch.object(
            ilm_client._session,
            "request",
            return_value=_FakeHTTPResponse(200, {"ok": True}),
        ) as mock_req:
            ilm_client.get("/api/v1/ping", facility=sample_facility)

        headers_sent = mock_req.call_args.kwargs["headers"]
        assert headers_sent["X-Facility-Id"] == "FID-01-23"
        assert headers_sent["X-Facility-Id-Type"] == "fr-code"

    def test_falls_back_to_settings_when_facility_has_no_fr_code(self, ilm_client):
        """When facility is None or has no dha_fr_code, uses settings.SHA_FACILITY_FR_CODE."""
        with patch.object(settings, "SHA_FACILITY_FR_CODE", "FID-99-00"):
            with patch.object(
                ilm_client._session,
                "request",
                return_value=_FakeHTTPResponse(200, {"ok": True}),
            ) as mock_req:
                ilm_client.post("/api/v1/claims/visit", json_body={}, facility=None)

        headers_sent = mock_req.call_args.kwargs["headers"]
        assert headers_sent["X-Facility-Id"] == "FID-99-00"
        assert headers_sent["X-Facility-Id-Type"] == "fr-code"

    def test_no_header_when_no_facility_and_no_setting(self, ilm_client):
        """When there's no facility and SHA_FACILITY_FR_CODE is empty, header is absent."""
        with patch.object(settings, "SHA_FACILITY_FR_CODE", ""):
            with patch.object(
                ilm_client._session,
                "request",
                return_value=_FakeHTTPResponse(200, {"ok": True}),
            ) as mock_req:
                ilm_client.get("/api/v1/ping", facility=None)

        headers_sent = mock_req.call_args.kwargs["headers"]
        assert "X-Facility-Id" not in headers_sent
        assert "X-Facility-Id-Type" not in headers_sent

    def test_caller_headers_override_facility_headers(self, ilm_client, sample_facility):
        """Explicit caller headers take precedence over auto-injected facility headers."""
        sample_facility.dha_fr_code = "FID-01-23"
        sample_facility.save(update_fields=["dha_fr_code"])

        with patch.object(
            ilm_client._session,
            "request",
            return_value=_FakeHTTPResponse(200, {"ok": True}),
        ) as mock_req:
            ilm_client.get(
                "/api/v1/ping",
                facility=sample_facility,
                headers={"X-Facility-Id": "OVERRIDE-99"},
            )

        headers_sent = mock_req.call_args.kwargs["headers"]
        assert headers_sent["X-Facility-Id"] == "OVERRIDE-99"


# ===========================================================================
# 2. Practitioner fields
# ===========================================================================


@pytest.mark.django_db
class TestPractitionerFieldsStartVisit:
    """Practitioner details injected into start_visit payload."""

    def test_practitioner_fields_included_when_provided(
        self, service, mock_client, claim, test_user
    ):
        mock_client.post.return_value = _make_response(201, {"authorization_code": "A"})
        service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-12-001"],
                service_type="OUTPATIENT",
                practitioner_identification_number="A12345",
                practitioner_identification_type="License Number",
                practitioner_regulation_body="KMPDC",
            ),
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["practitioner_identification_number"] == "A12345"
        assert body["practitioner_identification_type"] == "License Number"
        assert body["practitioner_regulation_body"] == "KMPDC"

    def test_practitioner_fields_omitted_when_empty(self, service, mock_client, claim, test_user):
        mock_client.post.return_value = _make_response(201, {"authorization_code": "A"})
        service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-12-001"],
            ),
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert "practitioner_identification_number" not in body
        assert "practitioner_identification_type" not in body
        assert "practitioner_regulation_body" not in body

    def test_practitioner_defaults_type_and_body(self, service, mock_client, claim, test_user):
        """When only identification_number is set, type defaults to 'National ID', body to 'KMPDC'."""
        mock_client.post.return_value = _make_response(201, {"authorization_code": "A"})
        service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-12-001"],
                practitioner_identification_number="28765432",
            ),
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["practitioner_identification_type"] == "National ID"
        assert body["practitioner_regulation_body"] == "KMPDC"


@pytest.mark.django_db
class TestPractitionerFieldsAddLine:
    """Practitioner details injected into add_line payload."""

    def test_practitioner_fields_on_add_line(self, service, mock_client, claim, consent, test_user):
        line = ClaimLine(
            intervention_code="SHA-12-001",
            service_name="Consultation",
            service_identifier="CONS-001",
            unit_price="500.00",
            quantity="1",
            scheme_code="SHIF",
        )
        service.add_line(
            claim,
            line,
            practitioner_identification_number="A12345",
            practitioner_identification_type="License Number",
            practitioner_regulation_body="KMPDC",
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["practitioner_identification_number"] == "A12345"
        assert body["consent_token"] == "CT-TOKEN-XYZ"
        assert body["intervention_code"] == "SHA-12-001"


@pytest.mark.django_db
class TestPractitionerFieldsAddDiagnosis:
    """Practitioner details injected into add_diagnosis payload."""

    def test_practitioner_fields_on_add_diagnosis(
        self, service, mock_client, claim, consent, test_user
    ):
        service.add_diagnosis(
            claim,
            icd_code="J06.9",
            intervention_code="SHA-12-001",
            practitioner_identification_number="28765432",
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["practitioner_identification_number"] == "28765432"
        assert body["practitioner_identification_type"] == "National ID"
        assert body["practitioner_regulation_body"] == "KMPDC"
        assert body["icd_code"] == "J06.9"
        assert body["consent_token"] == "CT-TOKEN-XYZ"


# ===========================================================================
# 3. Outpatient discharge consent on submit
# ===========================================================================


@pytest.mark.django_db
class TestOutpatientDischargeSubmit:
    """Submit claim with discharge OTP/biometrics (DHA 2026-06 requirement)."""

    def test_submit_with_otp_and_discharge_reason(
        self, service, mock_client, claim, consent, test_user
    ):
        service.submit(
            claim,
            invoice_number="OPD/1/267",
            otp="654321",
            discharge_reason="RECOVERED",
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["consent_token"] == "CT-TOKEN-XYZ"
        assert body["invoice_number"] == "OPD/1/267"
        assert body["otp"] == "654321"
        assert body["discharge_reason"] == "RECOVERED"
        assert "discharge_auth_guid" not in body
        assert "notes" not in body

    def test_submit_with_biometrics_and_notes(
        self, service, mock_client, claim, consent, test_user
    ):
        service.submit(
            claim,
            invoice_number="OPD/1/268",
            discharge_auth_guid="83a184cc-5662-4aea-a4b6-1fa18e258b2e",
            discharge_reason="OTHER",
            notes="Patient requested early discharge",
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["discharge_auth_guid"] == "83a184cc-5662-4aea-a4b6-1fa18e258b2e"
        assert body["discharge_reason"] == "OTHER"
        assert body["notes"] == "Patient requested early discharge"
        assert "otp" not in body

    def test_submit_without_discharge_fields_backwards_compatible(
        self, service, mock_client, claim, consent, test_user
    ):
        """When no discharge fields are provided, only invoice_number + consent_token are sent."""
        service.submit(claim, invoice_number="INV-001", user=test_user)
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body == {"consent_token": "CT-TOKEN-XYZ", "invoice_number": "INV-001"}

    def test_submit_with_practitioner_fields(self, service, mock_client, claim, consent, test_user):
        """Practitioner can also be passed at submit time as a fallback."""
        service.submit(
            claim,
            invoice_number="OPD/1/269",
            otp="111222",
            discharge_reason="REFERRED",
            practitioner_identification_number="P99999",
            practitioner_identification_type="License Number",
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["practitioner_identification_number"] == "P99999"
        assert body["practitioner_identification_type"] == "License Number"
        assert body["practitioner_regulation_body"] == "KMPDC"
