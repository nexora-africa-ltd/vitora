"""Tests for ``IlmPreauthService`` — Phase 3 preauth, doctor consent & emergency."""

from __future__ import annotations

import json
from datetime import date
from unittest.mock import MagicMock

import pytest

from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimIntervention,
    SHAEmergencyClaim,
    SHAMember,
    SHAPreauth,
)
from hmis.apps.billing.services.dha_errors import DHANotFoundError, DHAValidationError
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_preauth_service import (
    DOCTOR_CONSENT_PATH,
    EMERGENCY_PATH,
    EMERGENCY_PROTOCOLS_PATH,
    EMT_PATH,
    PREAUTH_CANCEL_FALLBACK_PATH,
    PREAUTH_CANCEL_PATH,
    PREAUTH_CREATE_PATH,
    PREAUTH_DOCTORS_PATH,
    PREAUTH_LIST_PATH,
    DoctorConsentParams,
    EmergencyProtocolParams,
    EmergencyVisitParams,
    EmtAttachment,
    EmtVisitParams,
    IlmPreauthService,
)


def _resp(status=200, payload=None, headers=None):
    return IlmResponse(
        status_code=status,
        headers=headers or {"X-Correlation-Id": "corr-1"},
        json=payload,
        text="",
        elapsed_ms=10,
    )


@pytest.fixture
def mock_client():
    client = MagicMock()
    client.get.return_value = _resp(200, {"ok": True})
    client.post.return_value = _resp(200, {"ok": True})
    client.delete.return_value = _resp(200, {"ok": True})
    return client


@pytest.fixture
def service(mock_client):
    return IlmPreauthService(client=mock_client)


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    SHAMember.objects.filter(patient=sample_patient).delete()
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-PA-0001",
        national_id="22334455",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
    )


# ---------------------------------------------------------------------------
# Preauth fetch / create / cancel
# ---------------------------------------------------------------------------


class TestFetchPreauth:
    def test_calls_get_with_consent_token(self, service, mock_client, sample_facility):
        mock_client.get.return_value = _resp(200, {"preauth_id": "p-1"})
        result = service.fetch_preauth(consent_token="c-1", facility=sample_facility)
        args, kwargs = mock_client.get.call_args
        assert args[0] == PREAUTH_LIST_PATH
        assert kwargs["params"] == {"consent_token": "c-1"}
        assert kwargs["consent_token"] == "c-1"
        assert result.dha_external_id == "p-1"


class TestCreatePreauth:
    def test_persists_local_preauth(
        self, service, mock_client, db, sample_patient, sample_facility, test_user
    ):
        mock_client.post.return_value = _resp(201, {"preauth_id": "p-99"})
        result = service.create_preauth(
            consent_token="c-create",
            intervention_code="INT-001",
            extra_fields={"notes": "hello"},
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        args, kwargs = mock_client.post.call_args
        assert args[0] == PREAUTH_CREATE_PATH
        assert kwargs["files"]["consent_token"] == (None, "c-create")
        assert kwargs["files"]["intervention_code"] == (None, "INT-001")
        assert kwargs["files"]["notes"] == (None, "hello")
        assert result.record_id is not None
        rec = SHAPreauth.objects.get(pk=result.record_id)
        assert rec.status == SHAPreauth.Status.SUBMITTED
        assert rec.dha_external_id == "p-99"
        assert rec.correlation_id == "corr-1"

    def test_rejects_intervention_not_registered_on_claim(
        self,
        service,
        mock_client,
        db,
        sample_patient,
        sample_facility,
        sample_organization,
        sample_encounter,
        sha_member,
        test_user,
    ):
        mock_client.post.return_value = _resp(201, {"preauth_id": "p-99"})
        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            claim_type=SHAClaim.ClaimType.INPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today(),
            admission_date=date.today(),
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia",
            facility=sample_facility,
            organization=sample_organization,
            encounter=sample_encounter,
            created_by=test_user,
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-197",
            intervention_name="Bilateral nephrostomy tube insertion",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
            needs_preauth=True,
        )

        with pytest.raises(DHAValidationError) as exc_info:
            service.create_preauth(
                consent_token="c-create",
                intervention_code="SHA-19-277",
                patient=sample_patient,
                claim=claim,
                facility=sample_facility,
                user=test_user,
            )

        assert "SHA-19-277" in str(exc_info.value)
        assert "SHA-19-197" in str(exc_info.value)
        assert not mock_client.post.called

    def test_accepts_intervention_registered_on_claim(
        self,
        service,
        mock_client,
        db,
        sample_patient,
        sample_facility,
        sample_organization,
        sample_encounter,
        sha_member,
        test_user,
    ):
        mock_client.post.return_value = _resp(201, {"preauth_id": "p-99"})
        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            claim_type=SHAClaim.ClaimType.INPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today(),
            admission_date=date.today(),
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia",
            facility=sample_facility,
            organization=sample_organization,
            encounter=sample_encounter,
            created_by=test_user,
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-197",
            intervention_name="Bilateral nephrostomy tube insertion",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
            needs_preauth=True,
        )

        result = service.create_preauth(
            consent_token="c-create",
            intervention_code="SHA-19-197",
            patient=sample_patient,
            claim=claim,
            facility=sample_facility,
            user=test_user,
        )

        args, kwargs = mock_client.post.call_args
        assert args[0] == PREAUTH_CREATE_PATH
        assert kwargs["files"]["intervention_code"] == (None, "SHA-19-197")
        assert result.record_id is not None

    def test_populates_missing_item_unit_price_from_claim_intervention(
        self,
        service,
        mock_client,
        db,
        sample_patient,
        sample_facility,
        sample_organization,
        sample_encounter,
        sha_member,
        test_user,
    ):
        mock_client.post.return_value = _resp(201, {"preauth_id": "p-99"})
        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            claim_type=SHAClaim.ClaimType.INPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today(),
            admission_date=date.today(),
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia",
            facility=sample_facility,
            organization=sample_organization,
            encounter=sample_encounter,
            created_by=test_user,
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-197",
            intervention_name="Bilateral nephrostomy tube insertion",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
            needs_preauth=True,
            tariff_amount="28000.00",
        )

        service.create_preauth(
            consent_token="c-create",
            intervention_code="SHA-19-197",
            patient=sample_patient,
            claim=claim,
            facility=sample_facility,
            user=test_user,
            extra_fields={
                "items": [
                    {
                        "item_code": "SHA-19-197",
                    }
                ]
            },
        )

        _, kwargs = mock_client.post.call_args
        serialized_items = kwargs["files"]["items"][1]
        items = json.loads(serialized_items)
        assert items[0]["unit_price"] == "28000.00"
        assert items[0]["UnitPrice"] == "28000.00"
        assert items[0]["ItemCode"] == "SHA-19-197"
        assert items[0]["Quantity"] == 1

    def test_rejects_item_without_unit_price_when_no_claim_tariff(
        self,
        service,
        mock_client,
        db,
        sample_patient,
        sample_facility,
        sample_organization,
        sample_encounter,
        sha_member,
        test_user,
    ):
        mock_client.post.return_value = _resp(201, {"preauth_id": "p-99"})
        claim = SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today(),
            primary_diagnosis_code="J18.9",
            primary_diagnosis_description="Pneumonia",
            facility=sample_facility,
            organization=sample_organization,
            encounter=sample_encounter,
            created_by=test_user,
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-01-001",
            intervention_name="Consultation",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
            needs_preauth=True,
        )

        with pytest.raises(DHAValidationError) as exc_info:
            service.create_preauth(
                consent_token="c-create",
                intervention_code="SHA-01-001",
                patient=sample_patient,
                claim=claim,
                facility=sample_facility,
                user=test_user,
                extra_fields={
                    "items": [
                        {
                            "item_code": "SHA-01-001",
                        }
                    ]
                },
            )

        assert "missing unit_price" in str(exc_info.value)
        assert not mock_client.post.called


class TestCancelPreauth:
    def test_singular_path_used_when_available(self, service, mock_client, sample_facility):
        mock_client.post.return_value = _resp(200, {"ok": True})
        service.cancel_preauth(
            consent_token="c-1", intervention_code="INT-1", facility=sample_facility
        )
        assert mock_client.post.call_args.args[0] == PREAUTH_CANCEL_PATH

    def test_falls_back_to_plural_on_404(self, service, mock_client, sample_facility):
        mock_client.post.side_effect = [
            DHANotFoundError("missing", status_code=404),
            _resp(200, {"ok": True}),
        ]
        service.cancel_preauth(
            consent_token="c-1", intervention_code="INT-1", facility=sample_facility
        )
        assert mock_client.post.call_count == 2
        assert mock_client.post.call_args_list[1].args[0] == PREAUTH_CANCEL_FALLBACK_PATH

    def test_marks_local_record_cancelled(
        self, service, mock_client, db, sample_patient, sample_facility, test_user
    ):
        preauth = SHAPreauth.objects.create(
            patient=sample_patient,
            facility=sample_facility,
            consent_token="c-can",
            intervention_code="INT-Z",
            status=SHAPreauth.Status.SUBMITTED,
            requested_by=test_user,
        )
        mock_client.post.return_value = _resp(200, {"ok": True})
        service.cancel_preauth(
            consent_token="c-can",
            intervention_code="INT-Z",
            facility=sample_facility,
            user=test_user,
            preauth=preauth,
        )
        preauth.refresh_from_db()
        assert preauth.status == SHAPreauth.Status.CANCELLED
        assert preauth.cancelled_at is not None


class TestRemovePreauthDiagnosis:
    def test_delete_with_icd_in_path_and_body(self, service, mock_client):
        service.remove_preauth_diagnosis(
            consent_token="c-1",
            intervention_code="INT-1",
            icd_code="A00.0",
        )
        args, kwargs = mock_client.delete.call_args
        assert args[0] == "/api/v1/preauths/diagnoses/A00.0"
        assert kwargs["json_body"]["icd_code"] == "A00.0"


class TestRemovePreauthDoctor:
    def test_delete_with_required_body(self, service, mock_client):
        service.remove_preauth_doctor(
            consent_token="c-1",
            intervention_code="INT-1",
            practitioner_registration_number="DOC-99",
        )
        args, kwargs = mock_client.delete.call_args
        assert args[0] == PREAUTH_DOCTORS_PATH
        assert kwargs["json_body"]["practitioner_registration_number"] == "DOC-99"


# ---------------------------------------------------------------------------
# Doctor consent
# ---------------------------------------------------------------------------


class TestDoctorConsent:
    def test_posts_with_required_fields(
        self, service, mock_client, db, sample_patient, sample_facility, test_user
    ):
        preauth = SHAPreauth.objects.create(
            patient=sample_patient,
            facility=sample_facility,
            consent_token="c-doc",
            intervention_code="INT-D",
            status=SHAPreauth.Status.SUBMITTED,
            requested_by=test_user,
        )
        params = DoctorConsentParams(
            consent_token="c-doc",
            intervention_code="INT-D",
            practitioner_registration_number="DOC-7",
            identification_number="11111111",
        )
        service.request_doctor_consent(
            params, facility=sample_facility, user=test_user, preauth=preauth
        )
        args, kwargs = mock_client.post.call_args
        assert args[0] == DOCTOR_CONSENT_PATH
        body = kwargs["json_body"]
        assert body["practitioner_registration_number"] == "DOC-7"
        assert body["identification_number"] == "11111111"
        preauth.refresh_from_db()
        assert preauth.doctor_consent_state == "REQUESTED"


# ---------------------------------------------------------------------------
# Emergency
# ---------------------------------------------------------------------------


class TestOpenEmergencyClaim:
    def test_creates_emergency_claim_record(
        self, service, mock_client, db, sample_patient, sample_facility, test_user
    ):
        mock_client.post.return_value = _resp(201, {"emergency_claim_id": "e-7"})
        result = service.open_emergency_claim(
            EmergencyVisitParams(
                interventions=["INT-1"],
                brought_by="RELATIVE",
                mode_of_arrival="AMBULANCE",
                reference_number="REF-1",
                notes="urgent",
            ),
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        args, kwargs = mock_client.post.call_args
        assert args[0] == EMERGENCY_PATH
        body = kwargs["json_body"]
        assert body["interventions"] == ["INT-1"]
        assert body["reference_number"] == "REF-1"
        assert result.record_id is not None
        rec = SHAEmergencyClaim.objects.get(pk=result.record_id)
        assert rec.kind == SHAEmergencyClaim.ClaimKind.EMERGENCY
        assert rec.dha_external_id == "e-7"
        assert rec.status == SHAEmergencyClaim.Status.SUBMITTED


class TestListEmergencyProtocols:
    def test_get_with_required_params(self, service, mock_client, sample_facility):
        service.list_emergency_protocols(
            active="true", intervention_code="INT-9", facility=sample_facility
        )
        args, kwargs = mock_client.get.call_args
        assert args[0] == EMERGENCY_PROTOCOLS_PATH
        assert kwargs["params"] == {"active": "true", "intervention_code": "INT-9"}


class TestApplyEmergencyProtocol:
    def test_posts_form_data(self, service, mock_client, sample_facility):
        service.apply_emergency_protocol(
            EmergencyProtocolParams(
                consent_token="c-1",
                protocol_code="P-1",
                intervention_code="I-1",
                unit_price=10.5,
                quantity=2,
                diagnoses="A00.0,B01.1",
            ),
            facility=sample_facility,
        )
        args, kwargs = mock_client.post.call_args
        assert args[0] == EMERGENCY_PROTOCOLS_PATH
        assert kwargs["data"]["protocol_code"] == "P-1"
        assert kwargs["data"]["unit_price"] == "10.5"
        assert kwargs["data"]["quantity"] == "2"
        assert kwargs["data"]["diagnoses"] == "A00.0,B01.1"


class TestCreateEmtClaim:
    def test_persists_emt_record(
        self, service, mock_client, db, sample_patient, sample_facility, test_user
    ):
        mock_client.post.return_value = _resp(201, {"claim_id": "emt-12"})
        params = EmtVisitParams(
            beneficiary_cr_id="CR-1",
            case_number="CASE-1",
            consent_token="c-emt",
            diagnoses=["A00"],
            interventions=["I-1"],
            practitioner_reg_number="DOC-1",
            provider_registration_number="PROV-1",
            protocol_code="P-1",
            attachments=[
                EmtAttachment(
                    document_title="Discharge",
                    document_type="DISCHARGE_SUMMARY",
                    file_field_name="file1",
                )
            ],
        )
        result = service.create_emt_claim(
            params, patient=sample_patient, facility=sample_facility, user=test_user
        )
        args, kwargs = mock_client.post.call_args
        assert args[0] == EMT_PATH
        body = kwargs["json_body"]
        assert body["case_number"] == "CASE-1"
        assert body["attachments"][0]["document_type"] == "DISCHARGE_SUMMARY"
        rec = SHAEmergencyClaim.objects.get(pk=result.record_id)
        assert rec.kind == SHAEmergencyClaim.ClaimKind.EMT
        assert rec.dha_external_id == "emt-12"
