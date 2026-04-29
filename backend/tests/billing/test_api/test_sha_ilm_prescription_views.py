"""ViewSet tests for DHA HIE Middleware (ILM) Phase 5 ePrescription endpoints."""

# ruff: noqa: F811 — pytest fixture reuse via import is intentional

from __future__ import annotations

from unittest.mock import patch

import pytest

from hmis.apps.billing.models import SHADhaPrescription
from hmis.apps.billing.services.dha_errors import (
    DHANotFoundError,
    DHAUnauthorizedError,
    DHAValidationError,
)
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_prescription_service import IlmPrescriptionResult
from tests.billing.test_api.test_sha_api import (  # noqa: F401
    sample_sha_member,
    sha_client,
    user_with_sha_permissions,
)

PX_SVC = "hmis.apps.billing.sha_ilm_prescription_views.IlmPrescriptionService"


def _ok(payload=None, record_id=None, http=200):
    resp = IlmResponse(
        status_code=http,
        headers={"X-Correlation-Id": "corr-1"},
        json=payload or {},
        text="",
        elapsed_ms=10,
    )
    return IlmPrescriptionResult(response=resp, payload=payload, record_id=record_id)


def _item(**overrides):
    base = {
        "generic_concept_code": "GCC-1",
        "dose_quantity": 1.0,
        "dose_unit": "TAB",
        "frequency": 2,
        "duration": 5,
        "duration_unit": "DAY",
        "period_unit": "DAY",
        "start_date": "2026-04-30",
    }
    base.update(overrides)
    return base


# ===========================================================================
# Preview
# ===========================================================================


@pytest.mark.django_db
class TestPreviewEndpoint:
    URL = "/api/sha/ilm/prescriptions/preview/"

    def test_requires_consent_token(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.preview_prescription.return_value = _ok({"guid": "rx-1"})
            r = sha_client.get(self.URL, {"consent_token": "c-1"})
            assert r.status_code == 200

    def test_unauthorized(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.preview_prescription.side_effect = DHAUnauthorizedError(
                "no", status_code=401
            )
            r = sha_client.get(self.URL, {"consent_token": "c-1"})
            assert r.status_code == 401


# ===========================================================================
# Create
# ===========================================================================


@pytest.mark.django_db
class TestCreateEndpoint:
    URL = "/api/sha/ilm/prescriptions/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_items_must_be_list(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "consent_token": "c-1",
                "intervention_code": "INT-1",
                "identification_number": "P-1",
                "items": "not-a-list",
            },
            format="json",
        )
        assert r.status_code == 400

    def test_invalid_item_returns_400(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "consent_token": "c-1",
                "intervention_code": "INT-1",
                "identification_number": "P-1",
                "items": [{"missing": "fields"}],
            },
            format="json",
        )
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.create_prescription.return_value = _ok({"id": 1}, record_id=11, http=201)
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "identification_number": "P-1",
                    "items": [_item()],
                },
                format="json",
            )
            assert r.status_code == 201
            assert r.data["record_id"] == 11

    def test_validation_error(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.create_prescription.side_effect = DHAValidationError(
                "bad", status_code=400
            )
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "identification_number": "P-1",
                    "items": [_item()],
                },
                format="json",
            )
            assert r.status_code == 400


# ===========================================================================
# Dispense
# ===========================================================================


@pytest.mark.django_db
class TestDispenseEndpoint:
    URL = "/api/sha/ilm/prescriptions/dispenses/"

    def test_requires_fields(self, sha_client):
        assert sha_client.post(self.URL, {}, format="json").status_code == 400

    def test_actual_products_must_be_list(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "consent_token": "c-1",
                "intervention_code": "INT-1",
                "actual_products": "x",
            },
            format="json",
        )
        assert r.status_code == 400

    def test_doctors_must_be_list(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "consent_token": "c-1",
                "intervention_code": "INT-1",
                "actual_products": [
                    {"actual_product_code": "APC-1", "medication_price": 10, "total_quantity": 2}
                ],
                "doctors": "not-list",
            },
            format="json",
        )
        assert r.status_code == 400

    def test_invalid_product_returns_400(self, sha_client):
        r = sha_client.post(
            self.URL,
            {
                "consent_token": "c-1",
                "intervention_code": "INT-1",
                "actual_products": [{"missing": "fields"}],
            },
            format="json",
        )
        assert r.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.create_dispense.return_value = _ok({"id": 5}, record_id=5, http=201)
            r = sha_client.post(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "actual_products": [
                        {
                            "actual_product_code": "APC-1",
                            "medication_price": 10,
                            "total_quantity": 2,
                        }
                    ],
                    "doctors": [{"identification_number": "DOC-1"}],
                },
                format="json",
            )
            assert r.status_code == 201


# ===========================================================================
# Remove doctor
# ===========================================================================


@pytest.mark.django_db
class TestRemoveDoctorEndpoint:
    URL = "/api/sha/ilm/prescriptions/doctors/"

    def test_requires_fields(self, sha_client):
        assert sha_client.delete(self.URL, {}, format="json").status_code == 400

    def test_calls_service(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.remove_prescription_doctor.return_value = _ok({"ok": True})
            r = sha_client.delete(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "practitioner_registration_number": "PRN-1",
                },
                format="json",
            )
            assert r.status_code == 200

    def test_not_found(self, sha_client):
        with patch(PX_SVC) as M:
            M.return_value.remove_prescription_doctor.side_effect = DHANotFoundError(
                "no", status_code=404
            )
            r = sha_client.delete(
                self.URL,
                {
                    "consent_token": "c-1",
                    "intervention_code": "INT-1",
                    "practitioner_registration_number": "PRN-1",
                },
                format="json",
            )
            assert r.status_code == 404


# ===========================================================================
# Local browse
# ===========================================================================


@pytest.mark.django_db
class TestLocalBrowse:
    def test_lists_records(self, sha_client, sample_facility):
        SHADhaPrescription.objects.create(
            facility=sample_facility,
            intervention_code="INT-1",
            status=SHADhaPrescription.Status.CREATED,
        )
        r = sha_client.get("/api/sha/ilm/prescriptions/local/")
        assert r.status_code == 200
        assert len(r.data["results"]) == 1

    def test_filter_by_status(self, sha_client, sample_facility):
        SHADhaPrescription.objects.create(
            facility=sample_facility,
            intervention_code="INT-1",
            status=SHADhaPrescription.Status.CREATED,
        )
        SHADhaPrescription.objects.create(
            facility=sample_facility,
            intervention_code="INT-2",
            status=SHADhaPrescription.Status.DISPENSED,
        )
        r = sha_client.get("/api/sha/ilm/prescriptions/local/", {"status": "dispensed"})
        assert r.status_code == 200
        assert len(r.data["results"]) == 1
        assert r.data["results"][0]["status"] == "dispensed"
