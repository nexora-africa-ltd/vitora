# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""DHA Shared Health Record consent lifecycle service.

Uses the common ILM client for authenticated, auditable requests. The service
accepts Django patient, facility, and user objects and never returns a bearer
token to a caller other than the persisted SHRConsentVisit model.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from django.conf import settings

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.services.ilm_client import IlmClient
from hmis.apps.shr.models import SHRConsentVisit


class SHRConsentError(Exception):
    """A validation or DHA failure during an SHR consent operation."""


class SHRConsentService:
    """Create, verify, refresh, and close DHA Shared Health Record visits."""

    def __init__(self, *, client: IlmClient | None = None) -> None:
        self.client = client or IlmClient(base_url=settings.SHR_ILM_BASE_URL)

    @staticmethod
    def _facility_id(facility: Any) -> str:
        value = resolve_fr_code(facility, allow_settings_fallback=False).value
        value = (
            value or getattr(facility, "dha_fr_code", "") or getattr(facility, "dha_fid_code", "")
        )
        if not value:
            raise SHRConsentError("Facility does not have a DHA Facility Registry code configured.")
        return value

    @staticmethod
    def _patient_cr_id(patient: Any) -> str:
        value = getattr(patient, "cr_number", "") or ""
        if not value:
            raise SHRConsentError(
                "Patient must have a DHA Client Registry identifier before SHR access."
            )
        return value

    def request_consent(
        self,
        *,
        patient: Any,
        facility: Any,
        user: Any,
        requested_by: str,
        visit_type: str,
        practitioner_id: str,
        request_kind: str = SHRConsentVisit.RequestKind.STANDARD,
        emergency: bool = False,
        patient_capable: bool = True,
        incapacity_reason: str = "",
        representative_cr_id: str = "",
        representative_relationship: str = "",
        start_date: date | None = None,
        encounter: Any = None,
    ) -> SHRConsentVisit:
        """Reuse an open DHA visit or create a consent request for the patient."""
        patient_cr_id = self._patient_cr_id(patient)
        facility_id = self._facility_id(facility)
        open_visits = self.client.get(
            "/shr/open-visits",
            params={"patient_id": patient_cr_id, "facility_id": facility_id},
            facility=facility,
            user=user,
        ).json
        visits = open_visits.get("visits", []) if isinstance(open_visits, dict) else []
        if visits:
            visit_id = str(visits[0].get("visit_id", ""))
            if visit_id:
                local_visit, _ = SHRConsentVisit.objects.get_or_create(
                    facility=facility,
                    visit_id=visit_id,
                    defaults={
                        "patient": patient,
                        "encounter": encounter,
                        "request_kind": request_kind,
                        "visit_type": visit_type,
                        "status": SHRConsentVisit.Status.PENDING,
                        "requested_by": requested_by,
                        "practitioner_id": practitioner_id,
                        "created_by": user,
                    },
                )
                refreshed = self.client.post(
                    f"/shr/visits/{visit_id}/refresh",
                    json_body={},
                    facility=facility,
                    user=user,
                    consent_token=None,
                ).json
                token = refreshed.get("consent_token", "") if isinstance(refreshed, dict) else ""
                if not token:
                    raise SHRConsentError(
                        "DHA did not return a refreshed consent token for the open visit."
                    )
                local_visit.approve(
                    consent_id=local_visit.consent_id, visit_id=visit_id, consent_token=token
                )
                return local_visit

        payload = {
            "cr_id": patient_cr_id,
            "facility_id": facility_id,
            "requested_by": requested_by,
            "visit_type": visit_type,
            "practitioner_id": practitioner_id,
            "emergency": int(emergency),
            "patient_capable": int(patient_capable),
            "start_date": (start_date or date.today()).isoformat(),
        }
        if incapacity_reason:
            payload["incapacity_reason"] = incapacity_reason
        if representative_cr_id:
            payload["representative_cr_id"] = representative_cr_id
            payload["representative_relationship"] = representative_relationship
        result = self.client.post(
            "/shr/consents", json_body=payload, facility=facility, user=user
        ).json
        if not isinstance(result, dict) or not result.get("consent_id"):
            raise SHRConsentError("DHA did not return a consent identifier.")
        visit = SHRConsentVisit.objects.create(
            patient=patient,
            encounter=encounter,
            facility=facility,
            consent_id=result["consent_id"],
            request_kind=request_kind,
            visit_type=visit_type,
            status=SHRConsentVisit.Status.PENDING,
            otp_record=result.get("otp_record", ""),
            requested_by=requested_by,
            practitioner_id=practitioner_id,
            representative_cr_id=representative_cr_id,
            representative_relationship=representative_relationship,
            patient_capable=patient_capable,
            emergency=emergency,
            incapacity_reason=incapacity_reason,
            start_date=start_date or date.today(),
            created_by=user,
        )
        token = result.get("consent_token", "")
        if token and result.get("visit_id"):
            visit.approve(
                consent_id=result["consent_id"], visit_id=result["visit_id"], consent_token=token
            )
        return visit
