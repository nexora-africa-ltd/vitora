"""Service-layer tests for IlmLifecycleService (Phase 4)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from hmis.apps.billing.models import SHAOtpRequest, SHAOtpWhitelistRequest, SHAUpload
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_lifecycle_service import (
    DischargeOtpParams,
    DischargeParams,
    EmergencyDoctorAddParams,
    EmergencyDoctorRemoveParams,
    IlmLifecycleResult,
    IlmLifecycleService,
    NextOfKinParams,
    OtpWhitelistAttachment,
    OtpWhitelistParams,
    PomsfBalanceParams,
    VisitOtpParams,
)
from hmis.apps.billing.services.multipart_builder import MultipartFile


def _resp(status_code=200, payload=None, corr="corr-1"):
    return IlmResponse(
        status_code=status_code,
        headers={"X-Correlation-Id": corr},
        json=payload or {},
        text="",
        elapsed_ms=10,
    )


@pytest.fixture
def client():
    return MagicMock()


@pytest.mark.django_db
class TestSendVisitOtp:
    def test_calls_endpoint_and_records_locally(self, client, sample_patient, sample_facility):
        client.post.return_value = _resp(200, {"message": "sent"})
        svc = IlmLifecycleService(client=client)
        result = svc.send_visit_otp(
            params=VisitOtpParams(intervention_codes=["INT-1"], patient_id="CR-1"),
            patient=sample_patient,
            facility=sample_facility,
        )
        assert result.status_code == 200
        client.post.assert_called_once()
        called_path = client.post.call_args[0][0]
        assert called_path == "/api/v1/claims/otp"
        body = client.post.call_args.kwargs["json_body"]
        assert body["intervention_codes"] == ["INT-1"]
        assert body["patient_id"] == "CR-1"
        # Local row recorded
        rec = SHAOtpRequest.objects.get()
        assert rec.kind == "visit"
        assert rec.patient_cr_id == "CR-1"
        assert rec.intervention_codes == ["INT-1"]


@pytest.mark.django_db
class TestSendDischargeOtp:
    def test_records_discharge_otp(self, client, sample_patient, sample_facility):
        client.post.return_value = _resp(200, {"message": "sent"})
        svc = IlmLifecycleService(client=client)
        result = svc.send_discharge_otp(
            params=DischargeOtpParams(consent_token="c-1", patient_id="CR-1"),
            patient=sample_patient,
            facility=sample_facility,
        )
        assert client.post.call_args[0][0] == "/api/v1/claims/otp/discharge"
        rec = SHAOtpRequest.objects.get()
        assert rec.kind == "discharge"
        assert rec.consent_token == "c-1"
        assert result.record_id == rec.pk


@pytest.mark.django_db
class TestDischarge:
    def test_calls_endpoint(self, client, sample_facility):
        client.post.return_value = _resp(200, {"ok": True})
        svc = IlmLifecycleService(client=client)
        svc.discharge_inpatient(
            params=DischargeParams(
                consent_token="c-1",
                discharge_date="2026-04-30",
                discharge_reason="RECOVERED",
                invoice_number="INV-1",
                otp="123456",
            ),
            facility=sample_facility,
        )
        body = client.post.call_args.kwargs["json_body"]
        assert body["discharge_reason"] == "RECOVERED"
        assert body["invoice_number"] == "INV-1"


@pytest.mark.django_db
class TestOtpWhitelist:
    def test_request_records_locally(self, client, sample_patient, sample_facility):
        client.post.return_value = _resp(200, {"guid": "wh-1"})
        svc = IlmLifecycleService(client=client)
        result = svc.request_otp_whitelist(
            params=OtpWhitelistParams(
                beneficiary_cr_id="CR-1",
                facility_fr_code="FR-1",
                reason_type="BIOMETRIC_FAILURE",
                reason="failed twice",
                biometric_attempts=2,
                attachments=[
                    OtpWhitelistAttachment(
                        document_title="Support",
                        document_type="SUPPORT_DOCUMENT",
                        file_field_name="att1",
                    )
                ],
            ),
            files=[
                MultipartFile(
                    field_name="att1",
                    filename="test.pdf",
                    content=b"hello",
                    content_type="application/pdf",
                )
            ],
            patient=sample_patient,
            facility=sample_facility,
        )
        assert client.post.call_args[0][0] == "/api/v1/patients/otp-whitelists"
        files_arg = client.post.call_args.kwargs["files"]
        # Form fields are encoded as (None, value) tuples in the files dict
        assert files_arg["beneficiary_cr_id"] == (None, "CR-1")
        assert files_arg["biometric_attempts"] == (None, "2")
        rec = SHAOtpWhitelistRequest.objects.get()
        assert rec.dha_guid == "wh-1"
        assert result.record_id == rec.pk

    def test_callback_passes_params(self, client, sample_facility):
        client.get.return_value = _resp(200, {"results": []})
        svc = IlmLifecycleService(client=client)
        svc.list_otp_whitelist_status(
            beneficiary_cr_id="CR-1",
            facility_fr_code="FR-1",
            facility=sample_facility,
        )
        params = client.get.call_args.kwargs["params"]
        assert params["beneficiary_cr_id"] == "CR-1"
        assert params["facility_fr_code"] == "FR-1"


@pytest.mark.django_db
class TestNextOfKin:
    def test_posts_correct_body(self, client, sample_facility):
        client.post.return_value = _resp(200, {"id": 1})
        svc = IlmLifecycleService(client=client)
        svc.add_next_of_kin_contact(
            params=NextOfKinParams(
                consent_token="c-1",
                contact_value="+254700000000",
                next_of_kin_full_name="Jane Doe",
                next_of_kin_id_number="12345678",
            ),
            facility=sample_facility,
        )
        body = client.post.call_args.kwargs["json_body"]
        assert body["next_of_kin_full_name"] == "Jane Doe"
        assert body["next_of_kin_id_number_type"] == "National ID"


@pytest.mark.django_db
class TestEmergencyDoctors:
    def test_add_uses_post(self, client, sample_facility):
        client.post.return_value = _resp(200, {"message": "added"})
        svc = IlmLifecycleService(client=client)
        svc.add_emergency_claim_doctor(
            params=EmergencyDoctorAddParams(consent_token="c-1", identification_number="DOC-1"),
            facility=sample_facility,
        )
        assert client.post.call_args[0][0] == "/api/v1/claims/doctors"

    def test_remove_uses_delete(self, client, sample_facility):
        client.delete.return_value = _resp(204, {})
        svc = IlmLifecycleService(client=client)
        svc.remove_emergency_claim_doctor(
            params=EmergencyDoctorRemoveParams(consent_token="c-1"),
            facility=sample_facility,
        )
        assert client.delete.call_args[0][0] == "/api/v1/claims/doctors"


@pytest.mark.django_db
class TestPomsfBalances:
    def test_query_params(self, client, sample_facility):
        client.get.return_value = _resp(200, {"firstName": "Jane"})
        svc = IlmLifecycleService(client=client)
        svc.get_pomsf_balances(
            params=PomsfBalanceParams(
                patient_id="CR-1",
                policy_year="2026",
                principal_member_number="P-1",
            ),
            facility=sample_facility,
        )
        params = client.get.call_args.kwargs["params"]
        assert params["patient_id"] == "CR-1"
        assert params["policy_year"] == "2026"
        assert params["principal_member_number"] == "P-1"


@pytest.mark.django_db
class TestUploads:
    def test_upload_records_local_row(self, client, sample_facility):
        client.post.return_value = _resp(
            201, {"file_id": "f-1", "path": "/tmp/x", "url": "https://example/x"}
        )
        svc = IlmLifecycleService(client=client)
        upload = MultipartFile(
            field_name="file",
            filename="report.pdf",
            content=b"hello world",
            content_type="application/pdf",
        )
        result = svc.upload_file(upload=upload, facility=sample_facility)
        rec = SHAUpload.objects.get()
        assert rec.dha_file_id == "f-1"
        assert rec.size_bytes == len(b"hello world")
        assert result.record_id == rec.pk

    def test_url_lookup_updates_local(self, client, sample_facility):
        SHAUpload.objects.create(
            filename="a.pdf",
            dha_file_id="f-1",
            facility=sample_facility,
        )
        client.get.return_value = _resp(200, {"url": "https://example/dl/x"})
        svc = IlmLifecycleService(client=client)
        result = svc.get_upload_url(file_id="f-1", facility=sample_facility)
        assert client.get.call_args[0][0] == "/api/v1/uploads/f-1"
        rec = SHAUpload.objects.get(dha_file_id="f-1")
        assert rec.dha_download_url == "https://example/dl/x"
        assert result.record_id == rec.pk


@pytest.mark.django_db
class TestResultDataclass:
    def test_dha_external_id_walks_payload(self):
        result = IlmLifecycleResult(
            response=_resp(200, {"file_id": "f-9"}),
            payload={"file_id": "f-9"},
        )
        assert result.dha_external_id == "f-9"
        assert result.correlation_id == "corr-1"
