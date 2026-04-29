"""Tests for ``IlmClaimService`` — DHA HIE Middleware claim build & dispatch.

Focuses on payload shape, consent-token resolution, and the persistence
side-effects on the SHAClaim model. The HTTP layer itself is tested in
``test_ilm_client.py``; here we mock ``IlmClient`` to keep tests fast.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from django.utils import timezone

from hmis.apps.billing.models import ConsentToken, SHAClaim, SHAMember
from hmis.apps.billing.services.consent_token_resolver import (
    ConsentTokenExpiredError,
    ConsentTokenNotFoundError,
)
from hmis.apps.billing.services.ilm_claim_service import (
    ATTACHMENTS_PATH,
    CLOSE_PATH,
    DIAGNOSES_PATH,
    INTERVENTION_RESTORE_PATH,
    INTERVENTION_RETIRE_PATH,
    INTERVENTION_SWITCH_PATH,
    INTERVENTIONS_PATH,
    LINES_EDIT_PATH,
    LINES_PATH,
    PREVIEW_PATH,
    SUBMIT_PATH,
    VISIT_PATH,
    ClaimLine,
    CloseClaimParams,
    IlmClaimService,
    StartVisitParams,
)
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.multipart_builder import MultipartFile


def _make_response(status_code=200, payload=None, headers=None):
    return IlmResponse(
        status_code=status_code,
        headers=headers or {},
        json=payload,
        text="" if payload is None else str(payload),
        elapsed_ms=12,
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


# ---------------------------------------------------------------------------
# start_visit
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStartVisit:
    def test_outpatient_visit_posts_expected_payload(self, service, mock_client, claim, test_user):
        mock_client.post.return_value = _make_response(
            201,
            {"authorization_code": "AUTH-123", "claim_id": "DHA-9999"},
            headers={"X-Correlation-Id": "corr-abc"},
        )
        result = service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-12-001"],
                service_type="OUTPATIENT",
            ),
            user=test_user,
        )
        assert result.status_code == 201
        mock_client.post.assert_called_once()
        path, kwargs = mock_client.post.call_args[0][0], mock_client.post.call_args.kwargs
        assert path == VISIT_PATH
        body = kwargs["json_body"]
        assert body == {
            "otp": "123456",
            "patient_id": "CR-001",
            "intervention_codes": ["SHA-12-001"],
            "service_type": "OUTPATIENT",
        }
        assert kwargs["facility"] == claim.facility
        # Claim was updated
        claim.refresh_from_db()
        assert claim.dha_external_id == "DHA-9999"
        assert claim.dha_visit_started_at is not None
        assert claim.last_dha_status == "VISIT_STARTED"
        assert claim.dha_correlation_id == "corr-abc"
        # ConsentToken row was upserted
        assert ConsentToken.objects.filter(
            encounter=claim.encounter, consent_token="AUTH-123"
        ).exists()

    def test_inpatient_visit_requires_admission_date(self, service, claim, test_user):
        with pytest.raises(ValueError, match="admission_date"):
            service.start_visit(
                claim,
                StartVisitParams(
                    otp="123",
                    patient_id="CR-001",
                    intervention_codes=["SHA-12-001"],
                    service_type="INPATIENT",
                ),
                user=test_user,
            )

    def test_inpatient_visit_includes_admission_fields(
        self, service, mock_client, claim, test_user
    ):
        mock_client.post.return_value = _make_response(201, {"authorization_code": "A"})
        service.start_visit(
            claim,
            StartVisitParams(
                otp="123",
                patient_id="CR-001",
                intervention_codes=["SHA-12-001"],
                service_type="INPATIENT",
                admission_date="2026-04-29",
                estimated_days_of_admission=3,
            ),
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["admission_date"] == "2026-04-29"
        assert body["estimated_days_of_admission"] == 3


# ---------------------------------------------------------------------------
# Interventions
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInterventions:
    def test_add_intervention_includes_consent_token(self, service, mock_client, claim, consent):
        service.add_intervention(claim, "SHA-12-001")
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == INTERVENTIONS_PATH
        assert body == {"consent_token": "CT-TOKEN-XYZ", "intervention_code": "SHA-12-001"}
        assert mock_client.post.call_args.kwargs["consent_token"] == "CT-TOKEN-XYZ"

    def test_switch_intervention_without_retain(self, service, mock_client, claim, consent):
        service.switch_intervention(
            claim,
            existing_intervention_code="A",
            new_intervention_code="B",
        )
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == INTERVENTION_SWITCH_PATH
        assert body == {
            "consent_token": "CT-TOKEN-XYZ",
            "existing_intervention_code": "A",
            "new_intervention_code": "B",
            "retain_bill_items": False,
        }

    def test_switch_intervention_retain_requires_bill_range(self, service, claim, consent):
        with pytest.raises(ValueError, match="bill_from"):
            service.switch_intervention(
                claim,
                existing_intervention_code="A",
                new_intervention_code="B",
                retain_bill_items=True,
            )

    def test_switch_intervention_with_retain(self, service, mock_client, claim, consent):
        service.switch_intervention(
            claim,
            existing_intervention_code="A",
            new_intervention_code="B",
            retain_bill_items=True,
            bill_from="L-1",
            bill_to="L-9",
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["bill_from"] == "L-1"
        assert body["bill_to"] == "L-9"

    def test_restore_intervention(self, service, mock_client, claim, consent):
        service.restore_intervention(claim, "SHA-12-001")
        assert mock_client.post.call_args[0][0] == INTERVENTION_RESTORE_PATH

    def test_retire_intervention(self, service, mock_client, claim, consent):
        service.retire_intervention(claim, "SHA-12-001")
        assert mock_client.post.call_args[0][0] == INTERVENTION_RETIRE_PATH


# ---------------------------------------------------------------------------
# Diagnoses
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDiagnoses:
    def test_add_diagnosis(self, service, mock_client, claim, consent):
        service.add_diagnosis(claim, icd_code="1F44", intervention_code="SHA-12-001")
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == DIAGNOSES_PATH
        assert body["icd_code"] == "1F44"
        assert body["intervention_code"] == "SHA-12-001"

    def test_remove_diagnosis_uses_patch(self, service, mock_client, claim, consent):
        service.remove_diagnosis(claim, icd_code="1F44")
        path = mock_client.patch.call_args[0][0]
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert path == DIAGNOSES_PATH
        assert body == {"consent_token": "CT-TOKEN-XYZ", "icd_code": "1F44"}


# ---------------------------------------------------------------------------
# Lines
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLines:
    def test_add_line(self, service, mock_client, claim, consent):
        service.add_line(
            claim,
            ClaimLine(
                intervention_code="SHA-12-001",
                service_name="Consult",
                service_identifier="C/123",
                unit_price="200",
                quantity="1",
                scheme_code="UHC",
            ),
        )
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == LINES_PATH
        assert body["service_name"] == "Consult"
        assert body["consent_token"] == "CT-TOKEN-XYZ"

    def test_edit_line_only_includes_provided_fields(self, service, mock_client, claim, consent):
        service.edit_line(claim, claim_line_id="LINE-1", quantity=5)
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert mock_client.patch.call_args[0][0] == LINES_EDIT_PATH
        assert body["claim_line_id"] == "LINE-1"
        assert body["quantity"] == 5
        assert "unit_price" not in body
        assert "scheme_code" not in body

    def test_remove_line(self, service, mock_client, claim, consent):
        service.remove_line(claim, claim_line_id="LINE-1")
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert mock_client.patch.call_args[0][0] == LINES_PATH
        assert body == {"consent_token": "CT-TOKEN-XYZ", "claim_line_id": "LINE-1"}


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAttachments:
    def test_add_attachment_uses_multipart(self, service, mock_client, claim, consent):
        files = [MultipartFile(field_name="file", filename="x.pdf", content=b"hello")]
        service.add_attachment(claim, files, extra_fields={"category": "lab"})
        path = mock_client.post.call_args[0][0]
        kwargs = mock_client.post.call_args.kwargs
        assert path == ATTACHMENTS_PATH
        assert "files" in kwargs
        assert kwargs["data"] == {"consent_token": "CT-TOKEN-XYZ", "category": "lab"}

    def test_remove_attachment(self, service, mock_client, claim, consent):
        service.remove_attachment(claim, attachment_id="A-1")
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert mock_client.patch.call_args[0][0] == ATTACHMENTS_PATH
        assert body == {"consent_token": "CT-TOKEN-XYZ", "attachment_id": "A-1"}


# ---------------------------------------------------------------------------
# Lifecycle: preview / submit / close
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLifecycle:
    def test_preview(self, service, mock_client, claim, consent):
        service.preview(claim)
        assert mock_client.post.call_args[0][0] == PREVIEW_PATH
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body == {"consent_token": "CT-TOKEN-XYZ"}

    def test_submit_persists_status_and_reference(
        self, service, mock_client, claim, consent, test_user
    ):
        mock_client.post.return_value = _make_response(
            200,
            {"sha_claim_reference": "SHA-REF-123"},
            headers={"X-Correlation-Id": "corr-z"},
        )
        result = service.submit(claim, invoice_number="INV/1", user=test_user)
        assert result.status_code == 200
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body == {"consent_token": "CT-TOKEN-XYZ", "invoice_number": "INV/1"}
        claim.refresh_from_db()
        assert claim.status == "submitted"
        assert claim.submitted_at is not None
        assert claim.sha_claim_reference == "SHA-REF-123"
        assert claim.last_dha_status == "SUBMITTED"
        assert claim.dha_correlation_id == "corr-z"

    def test_close_marks_written_off(self, service, mock_client, claim, consent):
        mock_client.post.return_value = _make_response(200, {})
        service.close(
            claim,
            CloseClaimParams(cancel_reason_type="WRONG_PATIENT", cancel_reason_text="oops"),
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert mock_client.post.call_args[0][0] == CLOSE_PATH
        assert body["cancel_reason_type"] == "WRONG_PATIENT"
        assert body["cancel_reason_text"] == "oops"
        assert body["consent_token"] == "CT-TOKEN-XYZ"
        claim.refresh_from_db()
        assert claim.status == "written_off"
        assert claim.last_dha_status == "CLOSED"


# ---------------------------------------------------------------------------
# Consent-token error handling
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConsentResolution:
    def test_missing_consent_raises(self, service, claim):
        with pytest.raises(ConsentTokenNotFoundError):
            service.add_intervention(claim, "SHA-12-001")

    def test_expired_consent_raises(self, service, claim, test_user):
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=claim.encounter,
            facility=claim.facility,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_number="12345678",
            consent_token="EXPIRED",
            validated_at=timezone.now() - timedelta(hours=2),
            expires_at=timezone.now() - timedelta(minutes=1),
            created_by=test_user,
        )
        with pytest.raises(ConsentTokenExpiredError):
            service.add_intervention(claim, "SHA-12-001")
