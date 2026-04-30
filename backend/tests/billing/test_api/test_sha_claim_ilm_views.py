"""Tests for the SHAClaimViewSet ILM action endpoints.

These cover the per-action HTTP routes that wrap IlmClaimService:
    POST /api/sha/claims/{id}/ilm/start-visit/
    POST /api/sha/claims/{id}/ilm/interventions/{add,switch,restore,retire}/
    POST /api/sha/claims/{id}/ilm/diagnoses/{add,remove}/
    POST /api/sha/claims/{id}/ilm/lines/{add,edit,remove}/
    POST /api/sha/claims/{id}/ilm/attachments/{add,remove}/
    POST /api/sha/claims/{id}/ilm/{preview,submit,close}/

The IlmClaimService is mocked so we only verify routing, payload mapping
and HTTP-level error translation.
"""
# ruff: noqa: F811

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from rest_framework import status

# Reuse the rich fixture set defined in test_sha_api.py (sample_sha_claim,
# api_client, sha_client, ...).
from tests.billing.test_api.test_sha_api import (  # noqa: F401
    api_client,
    sample_sha_claim,
    sample_sha_member,
    sha_client,
    test_user,
    user_with_sha_permissions,
)


def _claim_url(claim, suffix: str) -> str:
    return f"/api/sha/claims/{claim.id}/ilm/{suffix.strip('/')}/"


def _ilm_result(payload=None, status_code: int = 200):
    """Build a fake IlmClaimResult-like object the ViewSet can introspect."""
    result = MagicMock()
    result.status_code = status_code
    result.payload = payload or {}
    return result


@pytest.mark.django_db
class TestStartVisitEndpoint:
    def test_start_visit_calls_service(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            instance = svc.return_value
            instance.start_visit.return_value = _ilm_result({"claim_id": "DHA-1"})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "start-visit"),
                {
                    "otp": "123456",
                    "patient_id": "PAT-1",
                    "intervention_codes": ["INT-001"],
                    "service_type": "OUTPATIENT",
                },
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["payload"]["claim_id"] == "DHA-1"
        instance.start_visit.assert_called_once()

    def test_start_visit_invalid_payload(self, sha_client, sample_sha_claim):
        # service_type=INPATIENT requires admission_date; constructor itself
        # accepts it but the service raises ValueError. We trip an alternate
        # validation by sending empty intervention_codes — accepted construction,
        # but no service call should still occur unless the request reaches it.
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            instance = svc.return_value
            instance.start_visit.side_effect = ValueError("admission_date is required")
            response = sha_client.post(
                _claim_url(sample_sha_claim, "start-visit"),
                {
                    "otp": "1",
                    "patient_id": "P",
                    "intervention_codes": ["X"],
                    "service_type": "INPATIENT",
                },
                format="json",
            )
        # ValueError isn't a DHAError → falls through to 500
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


@pytest.mark.django_db
class TestInterventionEndpoints:
    def test_add_intervention(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.add_intervention.return_value = _ilm_result({"ok": True})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "interventions/add"),
                {"intervention_code": "INT-1"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        svc.return_value.add_intervention.assert_called_once()

    def test_add_intervention_requires_code(self, sha_client, sample_sha_claim):
        response = sha_client.post(
            _claim_url(sample_sha_claim, "interventions/add"), {}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_add_virtual_claim_line(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.add_virtual_claim_line.return_value = _ilm_result({"ok": True})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "interventions/virtual-claim-line"),
                {
                    "intervention_code": "PHC-001",
                    "service_name": "Consultation",
                    "unit_price": "200.00",
                    "quantity": "1",
                    "extra": {"capitation_period": "2026-04"},
                },
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        svc.return_value.add_virtual_claim_line.assert_called_once()
        kwargs = svc.return_value.add_virtual_claim_line.call_args.kwargs
        assert kwargs["intervention_code"] == "PHC-001"
        assert kwargs["service_name"] == "Consultation"
        assert kwargs["unit_price"] == "200.00"
        assert kwargs["extra"] == {"capitation_period": "2026-04"}

    def test_add_virtual_claim_line_requires_code(self, sha_client, sample_sha_claim):
        response = sha_client.post(
            _claim_url(sample_sha_claim, "interventions/virtual-claim-line"),
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_add_virtual_claim_line_rejects_non_object_extra(self, sha_client, sample_sha_claim):
        response = sha_client.post(
            _claim_url(sample_sha_claim, "interventions/virtual-claim-line"),
            {"intervention_code": "PHC-001", "extra": "not-a-dict"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_switch_intervention(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.switch_intervention.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "interventions/switch"),
                {
                    "existing_intervention_code": "A",
                    "new_intervention_code": "B",
                },
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        kwargs = svc.return_value.switch_intervention.call_args.kwargs
        assert kwargs["existing_intervention_code"] == "A"
        assert kwargs["new_intervention_code"] == "B"
        assert kwargs["retain_bill_items"] is False

    def test_restore_intervention(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.restore_intervention.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "interventions/restore"),
                {"intervention_code": "X"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK

    def test_retire_intervention(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.retire_intervention.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "interventions/retire"),
                {"intervention_code": "X"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestDiagnosisEndpoints:
    def test_add_diagnosis(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.add_diagnosis.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "diagnoses/add"),
                {"icd_code": "J06.9", "intervention_code": "INT-1"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK

    def test_add_diagnosis_requires_fields(self, sha_client, sample_sha_claim):
        response = sha_client.post(_claim_url(sample_sha_claim, "diagnoses/add"), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_remove_diagnosis(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.remove_diagnosis.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "diagnoses/remove"),
                {"icd_code": "J06.9"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestLineEndpoints:
    def test_add_line(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.add_line.return_value = _ilm_result({"claim_line_id": "L1"})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "lines/add"),
                {
                    "intervention_code": "INT-1",
                    "service_name": "Consult",
                    "service_identifier": "SVC-1",
                    "unit_price": "100.00",
                    "quantity": "1",
                    "scheme_code": "SHA-A",
                },
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK

    def test_edit_line_requires_id(self, sha_client, sample_sha_claim):
        response = sha_client.post(_claim_url(sample_sha_claim, "lines/edit"), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_remove_line(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.remove_line.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "lines/remove"),
                {"claim_line_id": "L1"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestPreviewSubmitClose:
    def test_preview(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.preview.return_value = _ilm_result({"total": "200"})
            response = sha_client.post(_claim_url(sample_sha_claim, "preview"), {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["payload"]["total"] == "200"

    def test_submit_requires_invoice_number(self, sha_client, sample_sha_claim):
        response = sha_client.post(_claim_url(sample_sha_claim, "submit"), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_submit_calls_service(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.submit.return_value = _ilm_result({"sha_claim_reference": "SHA-REF-1"})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "submit"),
                {"invoice_number": "INV-1"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        kwargs = svc.return_value.submit.call_args.kwargs
        assert kwargs["invoice_number"] == "INV-1"

    def test_close_requires_reason(self, sha_client, sample_sha_claim):
        response = sha_client.post(_claim_url(sample_sha_claim, "close"), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_close_passes_params(self, sha_client, sample_sha_claim):
        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.close.return_value = _ilm_result({})
            response = sha_client.post(
                _claim_url(sample_sha_claim, "close"),
                {
                    "cancel_reason_type": "WRONG_PATIENT",
                    "cancel_reason_text": "wrong patient registered",
                },
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        params = svc.return_value.close.call_args.args[1]
        assert params.cancel_reason_type == "WRONG_PATIENT"


@pytest.mark.django_db
class TestErrorMapping:
    def test_dha_validation_error_returns_400(self, sha_client, sample_sha_claim):
        from hmis.apps.billing.services.dha_errors import DHAValidationError

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.preview.side_effect = DHAValidationError(
                "invalid", errors={"foo": "bar"}
            )
            response = sha_client.post(_claim_url(sample_sha_claim, "preview"), {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["errors"] == {"foo": "bar"}

    def test_dha_timeout_returns_502(self, sha_client, sample_sha_claim):
        from hmis.apps.billing.services.dha_errors import DHATimeoutError

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.preview.side_effect = DHATimeoutError("timeout")
            response = sha_client.post(_claim_url(sample_sha_claim, "preview"), {}, format="json")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY

    def test_dha_unauthorized_returns_401(self, sha_client, sample_sha_claim):
        from hmis.apps.billing.services.dha_errors import DHAUnauthorizedError

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            svc.return_value.preview.side_effect = DHAUnauthorizedError("nope")
            response = sha_client.post(_claim_url(sample_sha_claim, "preview"), {}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
