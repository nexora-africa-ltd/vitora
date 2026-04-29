"""Service-layer tests for IlmPrescriptionService (Phase 5)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from hmis.apps.billing.models import SHADhaPrescription
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_prescription_service import (
    CreateDispenseParams,
    CreatePrescriptionParams,
    DispenseDoctor,
    DispenseProduct,
    IlmPrescriptionResult,
    IlmPrescriptionService,
    PrescriptionItem,
    RemovePrescriptionDoctorParams,
)


def _resp(status_code=200, payload=None, corr="corr-1"):
    return IlmResponse(
        status_code=status_code,
        headers={"X-Correlation-Id": corr},
        json=payload or {},
        text="",
        elapsed_ms=10,
    )


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
    return PrescriptionItem(**base)


@pytest.fixture
def client():
    return MagicMock()


@pytest.mark.django_db
class TestPreview:
    def test_calls_endpoint_with_consent_token(self, client, sample_facility):
        client.get.return_value = _resp(200, {"guid": "rx-1"})
        svc = IlmPrescriptionService(client=client)
        result = svc.preview_prescription(consent_token="c-1", facility=sample_facility)
        assert client.get.call_args[0][0] == "/api/v1/prescriptions"
        assert client.get.call_args.kwargs["params"] == {"consent_token": "c-1"}
        assert result.status_code == 200
        assert result.dha_external_id == "rx-1"


@pytest.mark.django_db
class TestCreate:
    def test_records_prescription(self, client, sample_patient, sample_facility):
        client.post.return_value = _resp(200, {"id": 99, "guid": "rx-99"})
        svc = IlmPrescriptionService(client=client)
        params = CreatePrescriptionParams(
            consent_token="c-1",
            intervention_code="INT-1",
            identification_number="P-1",
            items=[_item()],
        )
        result = svc.create_prescription(
            params=params, patient=sample_patient, facility=sample_facility
        )
        assert client.post.call_args[0][0] == "/api/v1/prescriptions"
        body = client.post.call_args.kwargs["json_body"]
        assert body["intervention_code"] == "INT-1"
        assert len(body["items"]) == 1
        rec = SHADhaPrescription.objects.get()
        assert rec.status == SHADhaPrescription.Status.CREATED
        assert rec.dha_external_id == "99"
        assert rec.dha_guid == "rx-99"
        assert result.record_id == rec.pk

    def test_failed_status_marks_failed(self, client, sample_patient, sample_facility):
        client.post.return_value = _resp(500, {"error": "boom"})
        svc = IlmPrescriptionService(client=client)
        params = CreatePrescriptionParams(
            consent_token="c-1",
            intervention_code="INT-1",
            identification_number="P-1",
            items=[_item()],
        )
        svc.create_prescription(params=params, patient=sample_patient, facility=sample_facility)
        rec = SHADhaPrescription.objects.get()
        assert rec.status == SHADhaPrescription.Status.FAILED

    def test_optional_fields_omitted(self, client, sample_facility):
        client.post.return_value = _resp(200, {})
        svc = IlmPrescriptionService(client=client)
        params = CreatePrescriptionParams(
            consent_token="c-1",
            intervention_code="INT-1",
            identification_number="P-1",
            items=[_item()],
        )
        svc.create_prescription(params=params, facility=sample_facility)
        body = client.post.call_args.kwargs["json_body"]
        assert "identification_type" not in body
        assert "regulation_body" not in body


@pytest.mark.django_db
class TestDispense:
    def test_marks_prescription_dispensed(self, client, sample_facility):
        prescription = SHADhaPrescription.objects.create(
            facility=sample_facility,
            intervention_code="INT-1",
            status=SHADhaPrescription.Status.CREATED,
        )
        client.post.return_value = _resp(200, {"id": 5, "status": "DISPENSED"})
        svc = IlmPrescriptionService(client=client)
        params = CreateDispenseParams(
            consent_token="c-1",
            intervention_code="INT-1",
            actual_products=[
                DispenseProduct(
                    actual_product_code="APC-1", medication_price=10.0, total_quantity=2
                )
            ],
            doctors=[DispenseDoctor(identification_number="DOC-1", identification_type="NID")],
        )
        result = svc.create_dispense(
            params=params, prescription=prescription, facility=sample_facility
        )
        assert client.post.call_args[0][0] == "/api/v1/prescriptions/dispenses"
        prescription.refresh_from_db()
        assert prescription.status == SHADhaPrescription.Status.DISPENSED
        assert prescription.dispense_payload["status"] == "DISPENSED"
        assert prescription.dispensed_at is not None
        assert result.record_id == prescription.pk

    def test_dispense_without_prescription_returns_no_record(self, client, sample_facility):
        client.post.return_value = _resp(200, {})
        svc = IlmPrescriptionService(client=client)
        params = CreateDispenseParams(
            consent_token="c-1",
            intervention_code="INT-1",
            actual_products=[
                DispenseProduct(
                    actual_product_code="APC-1", medication_price=10.0, total_quantity=2
                )
            ],
            doctors=[],
        )
        result = svc.create_dispense(params=params, prescription=None, facility=sample_facility)
        assert result.record_id is None


@pytest.mark.django_db
class TestRemoveDoctor:
    def test_calls_delete_with_body(self, client, sample_facility):
        client.delete.return_value = _resp(200, {})
        svc = IlmPrescriptionService(client=client)
        svc.remove_prescription_doctor(
            params=RemovePrescriptionDoctorParams(
                consent_token="c-1",
                intervention_code="INT-1",
                practitioner_registration_number="PRN-1",
            ),
            facility=sample_facility,
        )
        assert client.delete.call_args[0][0] == "/api/v1/prescriptions/doctors"
        body = client.delete.call_args.kwargs["json_body"]
        assert body["practitioner_registration_number"] == "PRN-1"


@pytest.mark.django_db
class TestResultDataclass:
    def test_dha_external_id_walks_payload(self):
        result = IlmPrescriptionResult(
            response=_resp(200, {"id": 42}),
            payload={"id": 42},
        )
        assert result.dha_external_id == "42"
        assert result.correlation_id == "corr-1"
