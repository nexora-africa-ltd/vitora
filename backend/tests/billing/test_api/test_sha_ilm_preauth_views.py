"""ViewSet tests for DHA HIE Middleware (ILM) Phase 3 endpoints.

Mocks ``IlmPreauthService`` to keep tests focused on URL routing,
parameter validation, and DHAError → HTTP status mapping.
"""

# ruff: noqa: F811 — pytest fixture reuse via import is intentional

from __future__ import annotations

from unittest.mock import patch

import pytest

from hmis.apps.billing.models import SHAEmergencyClaim, SHAPreauth
from hmis.apps.billing.services.dha_errors import (
    DHANotFoundError,
    DHAUnauthorizedError,
    DHAValidationError,
)
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_preauth_service import IlmPreauthResult
from tests.billing.test_api.test_sha_api import (  # noqa: F401
    sample_sha_member,
    sha_client,
    user_with_sha_permissions,
)

PA_SVC = "hmis.apps.billing.sha_ilm_preauth_views.IlmPreauthService"


def _ok(payload=None, record_id=None, http=200, dha_id=""):
    resp = IlmResponse(
        status_code=http,
        headers={"X-Correlation-Id": "corr-1"},
        json=payload,
        text="",
        elapsed_ms=10,
    )
    r = IlmPreauthResult(response=resp, payload=payload, record_id=record_id)
    if dha_id and isinstance(r.payload, dict):
        # Force the property by injecting in payload
        r.payload["preauth_id"] = dha_id
    return r


# ===========================================================================
# Preauth endpoints
# ===========================================================================


@pytest.mark.django_db
class TestPreauthFetchEndpoint:
    URL = "/api/sha/ilm/preauth/"

    def test_requires_consent_token(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.fetch_preauth.return_value = _ok({"preauth_id": "p1"})
            r = sha_client.get(self.URL, {"consent_token": "c-1"})
            assert r.status_code == 200
            assert r.data["data"]["preauth_id"] == "p1"

    def test_dha_unauthorized_returns_401(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.fetch_preauth.side_effect = DHAUnauthorizedError("no", status_code=401)
            r = sha_client.get(self.URL, {"consent_token": "c-1"})
            assert r.status_code == 401


@pytest.mark.django_db
class TestPreauthCreateEndpoint:
    URL = "/api/sha/ilm/preauth/create/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_requires_patient(self, sha_client):
        r = sha_client.post(
            self.URL,
            {"consent_token": "c-1", "intervention_code": "INT-1"},
            format="json",
        )
        assert r.status_code == 400

    def test_creates_via_service(self, sha_client, sample_patient):
        with patch(PA_SVC) as M:
            M.return_value.create_preauth.return_value = _ok({"preauth_id": "p9"}, record_id=42)
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "patient_pk": sample_patient.id,
                },
                format="json",
            )
            assert r.status_code == 201
            assert r.data["record_id"] == 42

    def test_validation_error_returns_400(self, sha_client, sample_patient):
        with patch(PA_SVC) as M:
            M.return_value.create_preauth.side_effect = DHAValidationError("bad", status_code=400)
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "patient_pk": sample_patient.id,
                },
                format="json",
            )
            assert r.status_code == 400


@pytest.mark.django_db
class TestPreauthCancelEndpoint:
    URL = "/api/sha/ilm/preauth/cancel/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.cancel_preauth.return_value = _ok({"ok": True})
            r = sha_client.post(
                self.URL,
                {"consent_token": "c-1", "intervention_code": "INT-1"},
                format="json",
            )
            assert r.status_code == 200


@pytest.mark.django_db
class TestPreauthRemoveDiagnosisEndpoint:
    URL_TPL = "/api/sha/ilm/preauth/diagnoses/{}/"

    def test_requires_body(self, sha_client):
        r = sha_client.delete(self.URL_TPL.format("A00.0"))
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.remove_preauth_diagnosis.return_value = _ok({"ok": True})
            r = sha_client.delete(
                self.URL_TPL.format("A00.0"),
                {"consent_token": "c-1", "intervention_code": "INT-1"},
                format="json",
            )
            assert r.status_code == 200
            assert M.return_value.remove_preauth_diagnosis.call_args.kwargs["icd_code"] == "A00.0"


@pytest.mark.django_db
class TestPreauthRemoveDoctorEndpoint:
    URL = "/api/sha/ilm/preauth/doctors/"

    def test_requires_fields(self, sha_client):
        r = sha_client.delete(self.URL, {"consent_token": "c"}, format="json")
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.remove_preauth_doctor.return_value = _ok({"ok": True})
            r = sha_client.delete(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "practitioner_registration_number": "DOC-1",
                },
                format="json",
            )
            assert r.status_code == 200


# ===========================================================================
# Doctor consent
# ===========================================================================


@pytest.mark.django_db
class TestDoctorConsentEndpoint:
    URL = "/api/sha/ilm/preauth/doctor-consent/"

    def test_validates_required_fields(self, sha_client):
        r = sha_client.post(self.URL, {"consent_token": "c"}, format="json")
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.request_doctor_consent.return_value = _ok({"message": "ok"})
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "practitioner_registration_number": "DOC-1",
                    "identification_number": "12345678",
                },
                format="json",
            )
            assert r.status_code == 200


# ===========================================================================
# Emergency
# ===========================================================================


@pytest.mark.django_db
class TestEmergencyOpenEndpoint:
    URL = "/api/sha/ilm/emergency/"

    def test_requires_interventions(self, sha_client):
        r = sha_client.post(self.URL, {}, format="json")
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.open_emergency_claim.return_value = _ok(
                {"claim_id": "e-1"}, record_id=11
            )
            r = sha_client.post(
                self.URL,
                {"interventions": ["INT-1"], "reference_number": "R-1"},
                format="json",
            )
            assert r.status_code == 201
            assert r.data["record_id"] == 11


@pytest.mark.django_db
class TestEmergencyProtocolsListEndpoint:
    URL = "/api/sha/ilm/emergency/protocols/"

    def test_requires_params(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.list_emergency_protocols.return_value = _ok(
                {"results": [{"protocolCode": "P1"}]}
            )
            r = sha_client.get(self.URL, {"active": "true", "intervention_code": "INT-1"})
            assert r.status_code == 200


@pytest.mark.django_db
class TestEmergencyProtocolApplyEndpoint:
    URL = "/api/sha/ilm/emergency/protocols/apply/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.apply_emergency_protocol.return_value = _ok({"ok": True})
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "protocol_code": "P-1",
                    "intervention_code": "INT-1",
                    "unit_price": 10,
                    "quantity": 2,
                    "diagnoses": "A00.0",
                },
                format="json",
            )
            assert r.status_code == 200

    def test_invalid_numeric_returns_400(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "consent_token": "c-1",
                "protocol_code": "P-1",
                "intervention_code": "INT-1",
                "unit_price": "not-a-number",
                "quantity": 2,
            },
            format="json",
        )
        assert r.status_code == 400


@pytest.mark.django_db
class TestEmtCreateEndpoint:
    URL = "/api/sha/ilm/emt/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.create_emt_claim.return_value = _ok({"claim_id": "emt-1"}, record_id=7)
            r = sha_client.post(
                self.URL,
                {
                    "beneficiary_cr_id": "CR-1",
                    "case_number": "CASE-1",
                    "consent_token": "c-1",
                    "diagnoses": ["A00"],
                    "interventions": ["INT-1"],
                    "practitioner_reg_number": "DOC-1",
                    "provider_registration_number": "PROV-1",
                    "protocol_code": "P-1",
                },
                format="json",
            )
            assert r.status_code == 201

    def test_dha_not_found_returns_404(self, sha_client):
        with patch(PA_SVC) as M:
            M.return_value.create_emt_claim.side_effect = DHANotFoundError(
                "missing", status_code=404
            )
            r = sha_client.post(
                self.URL,
                {
                    "beneficiary_cr_id": "CR-1",
                    "case_number": "CASE-1",
                    "consent_token": "c-1",
                    "diagnoses": ["A00"],
                    "interventions": ["INT-1"],
                    "practitioner_reg_number": "DOC-1",
                    "provider_registration_number": "PROV-1",
                    "protocol_code": "P-1",
                },
                format="json",
            )
            assert r.status_code == 404


# ===========================================================================
# Local browse endpoints
# ===========================================================================


@pytest.mark.django_db
class TestPreauthLocalBrowse:
    URL = "/api/sha/ilm/preauth/local/"

    def test_lists_without_filter(self, sha_client):
        """Should return 200 with empty results when no filter is provided (facility-scoped)."""
        r = sha_client.get(self.URL)
        assert r.status_code == 200
        assert r.data["results"] == []

    def test_lists_by_patient(self, sha_client, sample_patient, sample_facility):
        SHAPreauth.objects.create(
            patient=sample_patient,
            facility=sample_facility,
            consent_token="c-z",
            intervention_code="INT-Z",
            status=SHAPreauth.Status.SUBMITTED,
        )
        r = sha_client.get(self.URL, {"patient_pk": sample_patient.id})
        assert r.status_code == 200
        assert len(r.data["results"]) == 1


@pytest.mark.django_db
class TestEmergencyLocalBrowse:
    URL = "/api/sha/ilm/emergency/local/"

    def test_lists_all_when_no_filter(self, sha_client, sample_patient, sample_facility):
        SHAEmergencyClaim.objects.create(
            patient=sample_patient,
            facility=sample_facility,
            kind=SHAEmergencyClaim.ClaimKind.EMERGENCY,
            reference_number="R-X",
        )
        r = sha_client.get(self.URL)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1
