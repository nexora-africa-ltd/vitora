"""DHA HIE Middleware (ILM) — pre-visit registries & eligibility service.

Implements the 8 read-only ``/api/v1/...`` operations needed BEFORE a clinical
visit to confirm provider, member and benefit data:

Registries (3):
* GET ``/api/v1/facilities/search`` — Facility Registry lookup
* GET ``/api/v1/patients`` — Client Registry lookup
* GET ``/api/v1/professionals`` — Health Worker Registry lookup

Eligibility (5):
* GET ``/api/v1/patients/eligibility`` — top-level SHA eligibility
* GET ``/api/v1/patients/benefits`` — benefit packages
* GET ``/api/v1/patients/sub-benefits`` — sub-benefits per package
* GET ``/api/v1/patients/benefits/interventions`` — interventions per sub-benefit
* GET ``/api/v1/patients/benefits/utilization`` — utilisation balances per intervention

Each call goes through :class:`IlmClient` (auth, retries, audit, PII redaction)
and persists a :class:`SHACoverageSnapshot` row for the eligibility family.
The service intentionally does NOT mutate :class:`SHAMember` directly — that
remains the responsibility of the existing eligibility check workflow. This
service is an *additive* cache that the new ILM UIs can read from.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .ilm_client import IlmClient, IlmResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Endpoint paths (mirrors Postman collection / OpenAPI specs)
# ---------------------------------------------------------------------------

FACILITY_SEARCH_PATH = "/api/v1/facilities/search"
PATIENT_LOOKUP_PATH = "/api/v1/patients"
PROFESSIONAL_SEARCH_PATH = "/api/v1/professionals"

PATIENT_ELIGIBILITY_PATH = "/api/v1/patients/eligibility"
PATIENT_BENEFITS_PATH = "/api/v1/patients/benefits"
PATIENT_SUB_BENEFITS_PATH = "/api/v1/patients/sub-benefits"
PATIENT_BENEFIT_INTERVENTIONS_PATH = "/api/v1/patients/benefits/interventions"
PATIENT_BENEFIT_UTILIZATION_PATH = "/api/v1/patients/benefits/utilization"


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        publish_event(event_type, payload)
    except Exception:  # pragma: no cover
        logger.exception("Failed to publish DHA HIE registry event %s", event_type)


# ---------------------------------------------------------------------------
# Result wrappers
# ---------------------------------------------------------------------------


@dataclass
class IlmRegistryResult:
    response: IlmResponse
    payload: Any = None
    snapshot_id: int | None = None

    @property
    def status_code(self) -> int:
        return self.response.status_code


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class IlmRegistriesService:
    """Per-action wrapper around DHA HIE registry & eligibility GETs."""

    def __init__(self, client: IlmClient | None = None) -> None:
        self.client = client or IlmClient()

    # --- Facility Registry ------------------------------------------------

    def search_facility(
        self,
        *,
        identifier: str,
        identifier_type: str,
        name: str | None = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params = {
            "identifier": identifier,
            "identifier-type": identifier_type,
        }
        if name:
            params["name"] = name
        response = self.client.get(
            FACILITY_SEARCH_PATH, params=params, facility=facility, user=user
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_REGISTRY_FACILITY_QUERIED,
            {
                "identifier": identifier,
                "identifier_type": identifier_type,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # --- Client Registry --------------------------------------------------

    def lookup_patient(
        self,
        *,
        identification_number: str,
        identification_type: str,
        facility: Any = None,
        user: Any = None,
        patient: Any = None,
        sha_member: Any = None,
    ) -> IlmRegistryResult:
        params = {
            "identification_number": identification_number,
            "identification_type": identification_type,
        }
        response = self.client.get(PATIENT_LOOKUP_PATH, params=params, facility=facility, user=user)
        result = IlmRegistryResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_REGISTRY_PATIENT_QUERIED,
            {
                "identification_type": identification_type,
                "facility_id": getattr(facility, "id", None),
                "patient_id": getattr(patient, "id", None),
                "sha_member_id": getattr(sha_member, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # --- Health Worker Registry ------------------------------------------

    def search_professional(
        self,
        *,
        identification_number: str,
        identification_type: str,
        regulator: str,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params = {
            "identification_number": identification_number,
            "identification_type": identification_type,
            "regulator": regulator,
        }
        response = self.client.get(
            PROFESSIONAL_SEARCH_PATH, params=params, facility=facility, user=user
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_REGISTRY_PROFESSIONAL_QUERIED,
            {
                "identification_type": identification_type,
                "regulator": regulator,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # --- Eligibility -----------------------------------------------------

    def check_eligibility(
        self,
        *,
        identification_number: str,
        identification_type: str,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params = {
            "identification_number": identification_number,
            "identification_type": identification_type,
        }
        response = self.client.get(
            PATIENT_ELIGIBILITY_PATH, params=params, facility=facility, user=user
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        snapshot = self._snapshot(
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            snapshot_type="eligibility",
            response=response,
            request_params=params,
            extra_fields={
                "is_eligible": _eligibility_flag(response.json),
                "member_cr_number": _safe_get(response.json, "memberCrNumber") or "",
            },
        )
        if snapshot is not None:
            result.snapshot_id = snapshot.pk
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_ELIGIBILITY_CHECKED,
            {
                "patient_id": getattr(patient, "id", None),
                "sha_member_id": getattr(sha_member, "id", None),
                "facility_id": getattr(facility, "id", None),
                "is_eligible": _eligibility_flag(response.json),
                "http_status": response.status_code,
                "snapshot_id": result.snapshot_id,
            },
        )
        return result

    def fetch_benefits(
        self,
        *,
        patient_id: str,
        fields: str | None = None,
        is_unique_benefit: bool | None = None,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params: dict[str, Any] = {"patient_id": patient_id}
        if fields:
            params["fields"] = fields
        if is_unique_benefit is not None:
            params["is_unique_benefit"] = "true" if is_unique_benefit else "false"
        response = self.client.get(
            PATIENT_BENEFITS_PATH, params=params, facility=facility, user=user
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        snapshot = self._snapshot(
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            snapshot_type="benefits",
            response=response,
            request_params=params,
        )
        if snapshot is not None:
            result.snapshot_id = snapshot.pk
        self._emit_coverage_event("benefits", result, patient, sha_member, facility)
        return result

    def fetch_sub_benefits(
        self,
        *,
        patient_id: str,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params = {"patient_id": patient_id}
        response = self.client.get(
            PATIENT_SUB_BENEFITS_PATH, params=params, facility=facility, user=user
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        snapshot = self._snapshot(
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            snapshot_type="sub_benefits",
            response=response,
            request_params=params,
        )
        if snapshot is not None:
            result.snapshot_id = snapshot.pk
        self._emit_coverage_event("sub_benefits", result, patient, sha_member, facility)
        return result

    def fetch_benefit_interventions(
        self,
        *,
        patient_id: str,
        sub_benefit_code: str,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params = {"patient_id": patient_id, "sub_benefit_code": sub_benefit_code}
        response = self.client.get(
            PATIENT_BENEFIT_INTERVENTIONS_PATH,
            params=params,
            facility=facility,
            user=user,
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        snapshot = self._snapshot(
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            snapshot_type="benefits_interventions",
            response=response,
            request_params=params,
            extra_fields={"sub_benefit_code": sub_benefit_code},
        )
        if snapshot is not None:
            result.snapshot_id = snapshot.pk
        self._emit_coverage_event("benefits_interventions", result, patient, sha_member, facility)
        return result

    def fetch_utilization(
        self,
        *,
        patient_id: str,
        intervention_code: str,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmRegistryResult:
        params = {"patient_id": patient_id, "intervention_code": intervention_code}
        response = self.client.get(
            PATIENT_BENEFIT_UTILIZATION_PATH,
            params=params,
            facility=facility,
            user=user,
        )
        result = IlmRegistryResult(response=response, payload=response.json)
        snapshot = self._snapshot(
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            snapshot_type="utilization",
            response=response,
            request_params=params,
            extra_fields={"intervention_code": intervention_code},
        )
        if snapshot is not None:
            result.snapshot_id = snapshot.pk
        self._emit_coverage_event("utilization", result, patient, sha_member, facility)
        return result

    # --- helpers ----------------------------------------------------------

    def _snapshot(
        self,
        *,
        patient: Any,
        sha_member: Any,
        facility: Any,
        user: Any,
        snapshot_type: str,
        response: IlmResponse,
        request_params: dict[str, Any],
        extra_fields: dict[str, Any] | None = None,
    ):
        if patient is None:
            return None
        from hmis.apps.billing.models import SHACoverageSnapshot

        kwargs: dict[str, Any] = {
            "patient": patient,
            "sha_member": sha_member,
            "facility": facility,
            "snapshot_type": snapshot_type,
            "payload": response.json or {},
            "request_params": request_params,
            "correlation_id": str(response.headers.get("X-Correlation-Id") or ""),
            "http_status": response.status_code,
            "fetched_by": user if getattr(user, "is_authenticated", False) else None,
        }
        if extra_fields:
            kwargs.update(extra_fields)
        try:
            return SHACoverageSnapshot.objects.create(**kwargs)
        except Exception:  # pragma: no cover - persistence must not break the call
            logger.exception("Failed to persist SHACoverageSnapshot %s", snapshot_type)
            return None

    def _emit_coverage_event(
        self,
        snapshot_type: str,
        result: IlmRegistryResult,
        patient: Any,
        sha_member: Any,
        facility: Any,
    ) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_COVERAGE_SNAPSHOT_REFRESHED,
            {
                "snapshot_type": snapshot_type,
                "patient_id": getattr(patient, "id", None),
                "sha_member_id": getattr(sha_member, "id", None),
                "facility_id": getattr(facility, "id", None),
                "http_status": result.status_code,
                "snapshot_id": result.snapshot_id,
            },
        )


def _safe_get(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return None


def _eligibility_flag(payload: Any) -> bool:
    """Heuristic: a scheme with active coverage status implies eligibility."""
    if not isinstance(payload, dict):
        return False
    schemes = payload.get("schemes") or []
    for scheme in schemes:
        coverage = (scheme or {}).get("coverage") or {}
        status = str(coverage.get("status") or "").upper()
        if status in {"ACTIVE", "ELIGIBLE", "VALID"}:
            return True
    return False
