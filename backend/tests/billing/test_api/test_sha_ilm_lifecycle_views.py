"""ViewSet tests for DHA HIE Middleware (ILM) Phase 4 lifecycle endpoints."""

# ruff: noqa: F811 — pytest fixture reuse via import is intentional

from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from hmis.apps.billing.models import SHAOtpRequest, SHAOtpWhitelistRequest, SHAUpload
from hmis.apps.billing.services.dha_errors import (
    DHANotFoundError,
    DHAUnauthorizedError,
    DHAValidationError,
)
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_lifecycle_service import IlmLifecycleResult
from tests.billing.test_api.test_sha_api import (  # noqa: F401
    sample_sha_member,
    sha_client,
    user_with_sha_permissions,
)

LF_SVC = "hmis.apps.billing.sha_ilm_lifecycle_views.IlmLifecycleService"


def _ok(payload=None, record_id=None, http=200):
    resp = IlmResponse(
        status_code=http,
        headers={"X-Correlation-Id": "corr-1"},
        json=payload or {},
        text="",
        elapsed_ms=10,
    )
    return IlmLifecycleResult(response=resp, payload=payload, record_id=record_id)


# ===========================================================================
# OTP send
# ===========================================================================


@pytest.mark.django_db
class TestVisitOtpEndpoint:
    URL = "/api/sha/ilm/lifecycle/visit-otp/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.send_visit_otp.return_value = _ok({"message": "sent"})
            r = sha_client.post(
                self.URL,
                {"intervention_codes": ["INT-1"], "patient_id": "CR-1"},
                format="json",
            )
            assert r.status_code == 200

    def test_intervention_codes_must_be_list(self, sha_client):
        r = sha_client.post(
            self.URL,
            {"intervention_codes": "INT-1", "patient_id": "CR-1"},
            format="json",
        )
        assert r.status_code == 400


@pytest.mark.django_db
class TestDischargeOtpEndpoint:
    URL = "/api/sha/ilm/lifecycle/discharge-otp/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_dha_unauthorized_returns_401(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.send_discharge_otp.side_effect = DHAUnauthorizedError(
                "no", status_code=401
            )
            r = sha_client.post(
                self.URL, {"consent_token": "c-1", "patient_id": "CR-1"}, format="json"
            )
            assert r.status_code == 401


# ===========================================================================
# Discharge
# ===========================================================================


@pytest.mark.django_db
class TestDischargeEndpoint:
    URL = "/api/sha/ilm/lifecycle/discharge/"

    def test_requires_all_fields(self, sha_client):
        assert sha_client.post(self.URL, {"consent_token": "c-1"}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.discharge_inpatient.return_value = _ok({"ok": True})
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "discharge_date": "2026-04-30",
                    "discharge_reason": "RECOVERED",
                    "invoice_number": "INV-1",
                    "otp": "123456",
                },
                format="json",
            )
            assert r.status_code == 200


# ===========================================================================
# OTP whitelist
# ===========================================================================


@pytest.mark.django_db
class TestOtpWhitelistRequestEndpoint:
    URL = "/api/sha/ilm/lifecycle/otp-whitelist/"

    def test_requires_fields(self, sha_client):
        r = sha_client.post(self.URL, {}, format="json")
        assert r.status_code == 400

    def test_validates_biometric_attempts_int(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "beneficiary_cr_id": "CR-1",
                "facility_fr_code": "FR-1",
                "biometric_attempts": "abc",
            },
            format="json",
        )
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.request_otp_whitelist.return_value = _ok({"guid": "wh-1"}, record_id=99)
            r = sha_client.post(
                self.URL,
                {
                    "beneficiary_cr_id": "CR-1",
                    "facility_fr_code": "FR-1",
                    "biometric_attempts": "3",
                    "reason": "biometric failed",
                },
                format="json",
            )
            assert r.status_code == 201
            assert r.data["record_id"] == 99


@pytest.mark.django_db
class TestOtpWhitelistCallbackEndpoint:
    URL = "/api/sha/ilm/lifecycle/otp-whitelist/callback/"

    def test_requires_beneficiary(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.list_otp_whitelist_status.return_value = _ok({"results": []})
            r = sha_client.get(self.URL, {"beneficiary_cr_id": "CR-1"})
            assert r.status_code == 200


# ===========================================================================
# Next of kin
# ===========================================================================


@pytest.mark.django_db
class TestNextOfKinEndpoint:
    URL = "/api/sha/ilm/lifecycle/next-of-kin/"

    def test_requires_fields(self, sha_client):
        r = sha_client.post(self.URL, {"consent_token": "c-1"}, format="json")
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.add_next_of_kin_contact.return_value = _ok({"id": 1})
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "contact_value": "+254700000000",
                    "next_of_kin_full_name": "Jane Doe",
                    "next_of_kin_id_number": "12345678",
                },
                format="json",
            )
            assert r.status_code == 201


# ===========================================================================
# Emergency claim doctors
# ===========================================================================


@pytest.mark.django_db
class TestEmergencyDoctorAddEndpoint:
    URL = "/api/sha/ilm/lifecycle/emergency-doctors/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_validation_error_returns_400(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.add_emergency_claim_doctor.side_effect = DHAValidationError(
                "bad", status_code=400
            )
            r = sha_client.post(
                self.URL,
                {"consent_token": "c-1", "identification_number": "DOC-1"},
                format="json",
            )
            assert r.status_code == 400


@pytest.mark.django_db
class TestEmergencyDoctorRemoveEndpoint:
    URL = "/api/sha/ilm/lifecycle/emergency-doctors/remove/"

    def test_requires_consent_token(self, sha_client):
        assert sha_client.delete(self.URL, {}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.remove_emergency_claim_doctor.return_value = _ok({"ok": True})
            r = sha_client.delete(self.URL, {"consent_token": "c-1"}, format="json")
            assert r.status_code == 200


# ===========================================================================
# POMSF balances
# ===========================================================================


@pytest.mark.django_db
class TestPomsfBalancesEndpoint:
    URL = "/api/sha/ilm/lifecycle/pomsf-balances/"

    def test_requires_params(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.get_pomsf_balances.return_value = _ok({"firstName": "Jane"})
            r = sha_client.get(self.URL, {"patient_id": "CR-1", "policy_year": "2026"})
            assert r.status_code == 200


# ===========================================================================
# File uploads
# ===========================================================================


@pytest.mark.django_db
class TestFileUploadEndpoint:
    URL = "/api/sha/ilm/uploads/"

    def test_requires_file(self, sha_client):
        r = sha_client.post(self.URL, {}, format="multipart")
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.upload_file.return_value = _ok({"file_id": "f-1"}, record_id=7, http=201)
            f = SimpleUploadedFile("test.pdf", b"hello", content_type="application/pdf")
            r = sha_client.post(self.URL, {"file": f}, format="multipart")
            assert r.status_code == 201
            assert r.data["record_id"] == 7


@pytest.mark.django_db
class TestFileUrlEndpoint:
    def test_calls_service(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.get_upload_url.return_value = _ok({"url": "https://x"})
            r = sha_client.get("/api/sha/ilm/uploads/f-1/")
            assert r.status_code == 200

    def test_dha_not_found_returns_404(self, sha_client):
        with patch(LF_SVC) as M:
            M.return_value.get_upload_url.side_effect = DHANotFoundError("no", status_code=404)
            r = sha_client.get("/api/sha/ilm/uploads/missing/")
            assert r.status_code == 404


# ===========================================================================
# Local browse
# ===========================================================================


@pytest.mark.django_db
class TestLocalBrowse:
    def test_otp_local_lists(self, sha_client, sample_patient, sample_facility):
        SHAOtpRequest.objects.create(
            patient=sample_patient,
            facility=sample_facility,
            kind="visit",
            patient_cr_id="CR-X",
        )
        r = sha_client.get("/api/sha/ilm/lifecycle/otp/local/")
        assert r.status_code == 200
        assert len(r.data["results"]) == 1

    def test_whitelist_local_lists(self, sha_client, sample_facility):
        SHAOtpWhitelistRequest.objects.create(
            beneficiary_cr_id="CR-X",
            facility=sample_facility,
        )
        r = sha_client.get("/api/sha/ilm/lifecycle/otp-whitelist/local/")
        assert r.status_code == 200
        assert len(r.data["results"]) == 1

    def test_uploads_local_lists(self, sha_client, sample_facility):
        SHAUpload.objects.create(filename="x.pdf", facility=sample_facility)
        r = sha_client.get("/api/sha/ilm/uploads/local/")
        assert r.status_code == 200
        assert len(r.data["results"]) == 1
