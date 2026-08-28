# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: ILM diagnosis/line/attachment mixin methods.
How to use: mixed into IlmClaimService in split ILM claim service core module.
Supported inputs/args: instance methods for clinical lines, diagnoses, and attachments.
"""

from hmis.apps.billing.services.ilm_claim_service_shared import *  # noqa: F403
from hmis.apps.billing.services.ilm_claim_service_shared import _normalise_regulator


class IlmClaimClinicalMixin:
    def add_diagnosis(
        self,
        claim: Any,
        *,
        icd_code: str,
        intervention_code: str,
        practitioner_identification_number: str = "",
        practitioner_identification_type: str = "",
        practitioner_regulation_body: str = "KMPDC",
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {"icd_code": icd_code, "intervention_code": intervention_code}
        if practitioner_identification_number:
            body["practitioner_identification_number"] = practitioner_identification_number
            body["practitioner_identification_type"] = (
                practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                practitioner_regulation_body
            )
        result = self._post_with_consent(
            claim,
            DIAGNOSES_PATH,
            body,
            user=user,
        )
        self._emit_diagnosis_event(
            claim,
            result,
            action="added",
            icd_code=icd_code,
            intervention_code=intervention_code,
        )
        return result

    def remove_diagnosis(
        self,
        claim: Any,
        *,
        icd_code: str,
        intervention_code: str,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        response = self.client.patch(
            DIAGNOSES_PATH,
            json_body={
                "consent_token": consent.token,
                "icd_code": icd_code,
                "intervention_code": intervention_code,
            },
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_diagnosis_event(claim, result, action="removed", icd_code=icd_code)
        return result

    # -----------------------------------------------------------------
    # Lines
    # -----------------------------------------------------------------

    def add_line(
        self,
        claim: Any,
        line: ClaimLine,
        *,
        practitioner_identification_number: str = "",
        practitioner_identification_type: str = "",
        practitioner_regulation_body: str = "KMPDC",
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {
            "intervention_code": line.intervention_code,
            "service_name": line.service_name,
            "service_identifier": line.service_identifier,
            "unit_price": line.unit_price,
            "quantity": line.quantity,
            "scheme_code": line.scheme_code,
        }
        if practitioner_identification_number:
            body["practitioner_identification_number"] = practitioner_identification_number
            body["practitioner_identification_type"] = (
                practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                practitioner_regulation_body
            )
        result = self._post_with_consent(claim, LINES_PATH, body, user=user)
        self._emit_line_event(
            claim, result, action="added", intervention_code=line.intervention_code
        )
        return result

    def edit_line(
        self,
        claim: Any,
        *,
        claim_line_id: str,
        quantity: int | None = None,
        unit_price: str | None = None,
        scheme_code: str | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        body: dict[str, Any] = {"consent_token": consent.token, "claim_line_id": claim_line_id}
        if quantity is not None:
            body["quantity"] = quantity
        if unit_price is not None:
            body["unit_price"] = unit_price
        if scheme_code is not None:
            body["scheme_code"] = scheme_code
        response = self.client.patch(
            LINES_EDIT_PATH,
            json_body=body,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_line_event(claim, result, action="edited", claim_line_id=claim_line_id)
        return result

    def remove_line(self, claim: Any, *, claim_line_id: str, user: Any = None) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        response = self.client.patch(
            LINES_PATH,
            json_body={"consent_token": consent.token, "claim_line_id": claim_line_id},
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_line_event(claim, result, action="removed", claim_line_id=claim_line_id)
        return result

    # -----------------------------------------------------------------
    # Attachments
    # -----------------------------------------------------------------

    def add_attachment(
        self,
        claim: Any,
        files: list[MultipartFile],
        *,
        extra_fields: dict[str, Any] | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        multipart = build_multipart(files)
        data = {"consent_token": consent.token}
        if extra_fields:
            data.update({k: str(v) for k, v in extra_fields.items()})
        response = self.client.post(
            ATTACHMENTS_PATH,
            data=data,
            files=multipart,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_attachment_event(claim, result, action="added", file_count=len(files))
        return result

    def remove_attachment(
        self,
        claim: Any,
        *,
        attachment_id: str,
        intervention_code: str,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        body = {
            "consent_token": consent.token,
            "attachment_id": attachment_id,
            "intervention_code": intervention_code,
        }
        response = self.client.patch(
            ATTACHMENTS_PATH,
            json_body=body,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_attachment_event(claim, result, action="removed", attachment_id=attachment_id)
        return result

    # -----------------------------------------------------------------
    # Preview / Submit / Close
    # -----------------------------------------------------------------
