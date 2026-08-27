# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""High-level insurance service classes.

These orchestrate adapter calls, persist results back onto models,
and publish domain events. Views call these services rather than
interacting with adapters directly.
"""

from __future__ import annotations

import contextlib
import csv
import hashlib
import io
import json
import logging
import time
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from django.utils import timezone
from prometheus_client import Counter, Histogram

if TYPE_CHECKING:
    from hmis.apps.insurance.models import (
        InsuranceClaim,
        InsurancePreauth,
        InsuranceProviderConfig,
        InsuranceRemittance,
        PatientInsurance,
    )

from .adapters import get_adapter
from .errors import InsuranceNotConfiguredError, InsuranceValidationError
from .results import ClaimResult, EligibilityResult, PreauthResult

logger = logging.getLogger(__name__)

HEALTHCLOUD_WORKFLOW_TOTAL = Counter(
    "vitora_insurance_healthcloud_workflow_total",
    "Total HealthCloud workflow operations by result",
    ["operation", "result"],
)
HEALTHCLOUD_WORKFLOW_LATENCY_SECONDS = Histogram(
    "vitora_insurance_healthcloud_workflow_latency_seconds",
    "Latency of HealthCloud workflow operations",
    ["operation"],
)


def _publish_safe(event_type: str, payload: dict[str, Any]) -> None:
    """Publish a domain event, never raising."""
    with contextlib.suppress(Exception):
        from hmis.apps.core.events import publish_event

        publish_event(event_type, payload)


def _get_config(provider: Any, facility: Any) -> InsuranceProviderConfig:
    """Look up the facility-level config for a provider."""
    from hmis.apps.insurance.models import InsuranceProviderConfig

    try:
        return InsuranceProviderConfig.objects.select_related("provider").get(
            provider=provider, facility=facility
        )
    except InsuranceProviderConfig.DoesNotExist:
        raise InsuranceNotConfiguredError(
            f"No InsuranceProviderConfig for provider={provider} at facility={facility}",
            provider_code=getattr(provider, "code", None),
        ) from None


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------


class InsuranceEligibilityService:
    """Verify patient insurance eligibility via the insurer's API."""

    def verify(
        self,
        enrollment: PatientInsurance,
        *,
        facility: Any = None,
    ) -> EligibilityResult:
        config = _get_config(enrollment.provider, facility or enrollment.facility)
        adapter = get_adapter(config)
        result = adapter.verify_eligibility(enrollment)

        enrollment.last_eligibility_checked_at = timezone.now()
        enrollment.last_eligibility_eligible = result.eligible
        enrollment.last_eligibility_status = result.status
        previous_payload = (
            enrollment.last_eligibility_payload
            if isinstance(enrollment.last_eligibility_payload, dict)
            else {}
        )
        latest_payload = result.raw_response if isinstance(result.raw_response, dict) else {}
        merged_payload = dict(latest_payload)
        previous_health_identity = previous_payload.get("health_identity")
        if isinstance(previous_health_identity, dict) and "health_identity" not in merged_payload:
            merged_payload["health_identity"] = previous_health_identity

        enrollment.last_eligibility_payload = merged_payload

        update_fields = [
            "last_eligibility_checked_at",
            "last_eligibility_eligible",
            "last_eligibility_status",
            "last_eligibility_payload",
            "updated_at",
        ]

        # Persist verification result
        if result.eligible:
            enrollment.verified_at = enrollment.last_eligibility_checked_at
            enrollment.status = "ACTIVE"
            update_fields.extend(["verified_at", "status"])
            if result.annual_balance is not None:
                enrollment.annual_balance = result.annual_balance
                update_fields.append("annual_balance")
        enrollment.save(update_fields=update_fields)

        _publish_safe(
            "insurance.enrollment.verified",
            {
                "enrollment_id": enrollment.pk,
                "eligible": result.eligible,
                "provider_code": getattr(enrollment.provider, "code", ""),
            },
        )
        return result


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------


class InsuranceClaimsService:
    """Orchestrate insurance claim lifecycle via adapters."""

    def submit(
        self,
        claim: InsuranceClaim,
        *,
        user: Any = None,
    ) -> ClaimResult:
        """Submit a claim to the insurer via the adapter."""
        config = _get_config(claim.provider, claim.facility)
        adapter = get_adapter(config)
        result = adapter.submit_claim(claim)

        if result.success:
            claim.status = "SUBMITTED"
            claim.submission_date = timezone.now().date()
            claim.submitted_by = user
            update_fields = ["status", "submission_date", "submitted_by", "updated_at"]
            if result.external_claim_id:
                claim.external_claim_id = result.external_claim_id
                update_fields.append("external_claim_id")
            claim.save(update_fields=update_fields)

        _publish_safe(
            "insurance.claim.submitted",
            {
                "claim_id": claim.pk,
                "claim_number": claim.claim_number,
                "success": result.success,
                "external_claim_id": result.external_claim_id,
            },
        )
        return result

    def check_status(self, claim: InsuranceClaim) -> ClaimResult:
        """Poll the insurer for claim status updates."""
        config = _get_config(claim.provider, claim.facility)
        adapter = get_adapter(config)
        result = adapter.check_claim_status(claim)

        old_status = claim.status
        if result.status and result.status != old_status:
            self._apply_status_update(claim, result)
            _publish_safe(
                "insurance.claim.status_changed",
                {
                    "claim_id": claim.pk,
                    "claim_number": claim.claim_number,
                    "old_status": old_status,
                    "new_status": result.status,
                },
            )
        return result

    def _apply_status_update(self, claim: InsuranceClaim, result: ClaimResult) -> None:
        """Persist status changes from a poll result."""
        from hmis.apps.insurance.models import InsuranceClaim as ClaimModel

        update_fields = ["status", "updated_at"]
        # Map external statuses (possibly uppercase) to internal TextChoices values
        status_map = {
            "APPROVED": ClaimModel.Status.APPROVED,
            "PARTIALLY_APPROVED": ClaimModel.Status.PARTIALLY_APPROVED,
            "REJECTED": ClaimModel.Status.REJECTED,
            "QUERY": ClaimModel.Status.QUERY,
            "QUERIED": ClaimModel.Status.QUERY,
            "ACKNOWLEDGED": ClaimModel.Status.ACKNOWLEDGED,
            "PAID": ClaimModel.Status.PAID,
        }
        new_status = status_map.get(result.status.upper())
        if new_status is None:
            logger.warning(
                "Unknown claim status '%s' from insurer for claim %s",
                result.status,
                claim.claim_number,
            )
            return

        claim.status = new_status
        if result.approved_amount is not None:
            claim.approved_amount = result.approved_amount
            update_fields.append("approved_amount")
        if result.paid_amount is not None:
            claim.paid_amount = result.paid_amount
            update_fields.append("paid_amount")
        if result.rejection_reason:
            claim.rejection_reason = result.rejection_reason
            update_fields.append("rejection_reason")
        if result.query_details:
            claim.query_details = result.query_details
            update_fields.append("query_details")
        claim.save(update_fields=update_fields)


# ---------------------------------------------------------------------------
# Pre-authorization
# ---------------------------------------------------------------------------


class InsurancePreauthService:
    """Orchestrate insurance preauthorization lifecycle."""

    def submit(
        self,
        preauth: InsurancePreauth,
        *,
        user: Any = None,
    ) -> PreauthResult:
        """Submit a preauth to the insurer."""
        config = _get_config(preauth.provider, preauth.facility)
        adapter = get_adapter(config)
        result = adapter.submit_preauth(preauth)

        if result.success:
            preauth.status = "SUBMITTED"
            preauth.submitted_by = user
            update_fields = ["status", "submitted_by", "updated_at"]
            if result.external_preauth_id:
                preauth.external_preauth_id = result.external_preauth_id
                update_fields.append("external_preauth_id")
            preauth.save(update_fields=update_fields)

        _publish_safe(
            "insurance.preauth.submitted",
            {
                "preauth_id": preauth.pk,
                "preauth_number": preauth.preauth_number,
                "success": result.success,
            },
        )
        return result

    def check_status(self, preauth: InsurancePreauth) -> PreauthResult:
        """Poll the insurer for preauth status updates."""
        config = _get_config(preauth.provider, preauth.facility)
        adapter = get_adapter(config)
        result = adapter.check_preauth_status(preauth)

        old_status = preauth.status
        if result.status and result.status.lower() != old_status:
            self._apply_status_update(preauth, result)
            _publish_safe(
                "insurance.preauth.status_changed",
                {
                    "preauth_id": preauth.pk,
                    "preauth_number": preauth.preauth_number,
                    "old_status": old_status,
                    "new_status": result.status,
                },
            )
        return result

    def _apply_status_update(self, preauth: InsurancePreauth, result: PreauthResult) -> None:
        from hmis.apps.insurance.models import InsurancePreauth as PreauthModel

        update_fields = ["status", "updated_at"]
        status_map = {
            "SUBMITTED": PreauthModel.Status.SUBMITTED,
            "APPROVED": PreauthModel.Status.APPROVED,
            "DENIED": PreauthModel.Status.DENIED,
            "EXPIRED": PreauthModel.Status.EXPIRED,
            "CANCELLED": PreauthModel.Status.CANCELLED,
        }
        new_status = status_map.get(result.status.upper())
        if new_status is None:
            logger.warning(
                "Unknown preauth status '%s' from insurer for %s",
                result.status,
                preauth.preauth_number,
            )
            return

        preauth.status = new_status
        if result.approved_amount is not None:
            preauth.approved_amount = result.approved_amount
            update_fields.append("approved_amount")
        if result.rejection_reason:
            preauth.rejection_reason = result.rejection_reason
            update_fields.append("rejection_reason")
        if new_status == PreauthModel.Status.APPROVED and not preauth.approved_at:
            preauth.approved_at = timezone.now()
            update_fields.append("approved_at")
        preauth.save(update_fields=update_fields)


# ---------------------------------------------------------------------------
# Remittances
# ---------------------------------------------------------------------------


class InsuranceRemittanceService:
    """Fetch and reconcile insurance remittances."""

    def fetch_and_reconcile(
        self,
        config: InsuranceProviderConfig,
        date_from: date,
        date_to: date,
    ) -> list[InsuranceRemittance]:
        """Fetch remittances from insurer API and auto-reconcile."""
        from hmis.apps.insurance.models import (
            InsuranceClaim,
            InsuranceRemittance,
            InsuranceRemittanceLine,
        )

        adapter = get_adapter(config)
        results = adapter.fetch_remittances(date_from, date_to)

        created: list[InsuranceRemittance] = []
        for r in results:
            if not r.success or not r.remittance_number:
                continue

            remittance, was_created = InsuranceRemittance.objects.get_or_create(
                provider=config.provider,
                remittance_number=r.remittance_number,
                facility=config.facility,
                organization=config.facility.organization if config.facility else None,
                defaults={
                    "remittance_date": r.remittance_date or date_to,
                    "total_amount": r.total_amount,
                    "payment_reference": r.payment_reference,
                    "status": "RECEIVED",
                    "received_at": timezone.now(),
                },
            )
            if not was_created:
                continue

            for entry in r.entries:
                claim = None
                with contextlib.suppress(InsuranceClaim.DoesNotExist):
                    claim = InsuranceClaim.objects.get(
                        claim_number=entry.claim_number, facility=config.facility
                    )
                InsuranceRemittanceLine.objects.create(
                    remittance=remittance,
                    claim=claim,
                    claim_number=entry.claim_number,
                    member_number=entry.member_number,
                    paid_amount=entry.paid_amount,
                    deductions=entry.deductions,
                    net_amount=entry.net_amount,
                )

            # Auto-reconcile
            remittance.reconcile()
            created.append(remittance)

            _publish_safe(
                "insurance.remittance.received",
                {
                    "remittance_id": remittance.pk,
                    "remittance_number": remittance.remittance_number,
                    "total_amount": str(remittance.total_amount),
                    "lines_count": len(r.entries),
                },
            )

        return created


class HealthCloudWorkflowService:
    """Orchestrates HealthCloud-specific visit and billing workflow operations."""

    _HEALTHCLOUD_STATUS_MAP = {
        "PENDING": "submitted",
        "SUBMITTED": "submitted",
        "RECEIVED": "acknowledged",
        "ACKNOWLEDGED": "acknowledged",
        "IN_REVIEW": "under_review",
        "UNDER_REVIEW": "under_review",
        "QUERY": "query",
        "QUERIED": "query",
        "APPROVED": "approved",
        "PARTIALLY_APPROVED": "partially_approved",
        "REJECTED": "rejected",
        "PAID": "paid",
        "PARTIALLY_PAID": "partially_paid",
        "APPEALED": "appealed",
        "CANCELLED": "cancelled",
        "WRITTEN_OFF": "written_off",
    }

    @classmethod
    def _map_healthcloud_status_to_claim_status(cls, status_value: str) -> str | None:
        normalized = str(status_value or "").strip().upper().replace("-", "_").replace(" ", "_")
        if not normalized:
            return None
        return cls._HEALTHCLOUD_STATUS_MAP.get(normalized)

    @staticmethod
    def _payload_hash(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    def _run_idempotent(
        self,
        *,
        operation: str,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
        runner: Any,
        claim: Any = None,
        preauth: Any = None,
        authorization: Any = None,
    ) -> dict[str, Any]:
        from hmis.apps.insurance.models import InsuranceExternalSync

        request_hash = self._payload_hash(payload)
        existing = (
            InsuranceExternalSync.objects.filter(
                facility=facility,
                operation=operation,
                request_hash=request_hash,
                status=InsuranceExternalSync.Status.SUCCESS,
            )
            .order_by("-created_at")
            .first()
        )
        if existing:
            return existing.response_payload or {}

        sync = InsuranceExternalSync.objects.create(
            facility=facility,
            organization=organization,
            operation=operation,
            request_hash=request_hash,
            claim=claim,
            preauth=preauth,
            authorization=authorization,
            request_payload=payload,
        )

        started = time.monotonic()
        try:
            response = runner(payload)
            external_id = str(response.get("id") or response.get("guid") or "")
            sync.mark_success(external_id=external_id, response_payload=response)
            HEALTHCLOUD_WORKFLOW_TOTAL.labels(operation=operation, result="success").inc()
            HEALTHCLOUD_WORKFLOW_LATENCY_SECONDS.labels(operation=operation).observe(
                time.monotonic() - started
            )
            return response
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:
            sync.mark_failure(error=str(exc))
            HEALTHCLOUD_WORKFLOW_TOTAL.labels(operation=operation, result="failed").inc()
            HEALTHCLOUD_WORKFLOW_LATENCY_SECONDS.labels(operation=operation).observe(
                time.monotonic() - started
            )
            raise

    @staticmethod
    def _require_operation(adapter: Any, operation: str) -> None:
        if not hasattr(adapter, operation):
            raise InsuranceNotConfiguredError(
                f"Adapter '{adapter.__class__.__name__}' does not support '{operation}'",
            )

    @staticmethod
    def _extract_contact_value(eligibility_payload: Any, contact_id: int) -> str:
        if not isinstance(eligibility_payload, dict):
            return ""
        member = eligibility_payload.get("member")
        if not isinstance(member, dict):
            return ""
        contacts = member.get("contacts")
        if not isinstance(contacts, list):
            return ""

        for contact in contacts:
            if not isinstance(contact, dict):
                continue
            try:
                candidate_id = int(contact.get("id") or 0)
            except (TypeError, ValueError):
                continue
            if candidate_id == contact_id:
                return str(contact.get("contactValue") or "")
        return ""

    @staticmethod
    def _extract_policy_number(eligibility_payload: Any) -> str:
        if not isinstance(eligibility_payload, dict):
            return ""
        cover = eligibility_payload.get("cover")
        if not isinstance(cover, dict):
            return ""
        return str(cover.get("policyNumber") or "")

    @staticmethod
    def _ensure_eligibility_snapshot(enrollment: Any) -> dict[str, Any]:
        payload = getattr(enrollment, "last_eligibility_payload", None)
        if isinstance(payload, dict) and payload:
            return payload
        raise InsuranceValidationError(
            "HealthCloud eligibility must be run before OTP and visit authorization.",
            provider_code=getattr(getattr(enrollment, "provider", None), "code", None),
        )

    @staticmethod
    def _stable_profile_id(enrollment: Any) -> str:
        patient = getattr(enrollment, "patient", None)
        patient_public_id = getattr(patient, "public_id", None)
        if patient_public_id:
            return str(patient_public_id)

        patient_pk = getattr(patient, "pk", None)
        if patient_pk:
            return str(patient_pk)

        return str(enrollment.pk)

    @staticmethod
    def _identity_contacts(enrollment: Any) -> list[dict[str, str]]:
        patient = enrollment.patient
        contacts: list[dict[str, str]] = []

        def _append_contact(kind: str, value: Any) -> None:
            cleaned = str(value or "").strip()
            if not cleaned:
                return
            contacts.append(
                {
                    "contactType": kind,
                    "contactValue": cleaned,
                    "contact_type": kind,
                    "contact_value": cleaned,
                }
            )

        _append_contact("MOBILE", getattr(patient, "phone_number", ""))
        _append_contact("EMAIL", getattr(patient, "email", ""))

        primary_emergency_contact = patient.emergency_contacts.first()
        if primary_emergency_contact is not None:
            _append_contact("EMERGENCY", getattr(primary_emergency_contact, "phone_number", ""))

        return contacts

    @staticmethod
    def _identity_identifiers(enrollment: Any) -> list[dict[str, str]]:
        patient = enrollment.patient
        identifiers: list[dict[str, str]] = []

        def _append_identifier(kind: str, value: Any) -> None:
            cleaned = str(value or "").strip()
            if not cleaned:
                return
            identifiers.append(
                {
                    "identifierType": kind,
                    "identifierValue": cleaned,
                    "identifier_type": kind,
                    "identifier_value": cleaned,
                }
            )

        identification_type = str(getattr(patient, "identification_type", "") or "").strip().upper()
        if identification_type:
            _append_identifier(identification_type, getattr(patient, "identification_number", ""))
        else:
            _append_identifier("IDENTIFICATION", getattr(patient, "identification_number", ""))

        _append_identifier("NATIONAL_ID", getattr(patient, "national_id", ""))
        _append_identifier("MRN", getattr(patient, "mrn", ""))
        _append_identifier("CR_NUMBER", getattr(patient, "cr_number", ""))
        _append_identifier("SHA_NUMBER", getattr(patient, "sha_number", ""))

        return identifiers

    @staticmethod
    def _clean_identity_payload_override(payload: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return {}

        cleaned: dict[str, Any] = {}
        for key, value in payload.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            if isinstance(value, list) and not value:
                continue
            cleaned[key] = value
        return cleaned

    @staticmethod
    def _to_iso_date(value: Any) -> str:
        if value is None:
            return ""
        if hasattr(value, "isoformat"):
            try:
                return str(value.isoformat())
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                return str(value)
        return str(value)

    @staticmethod
    def _default_identity_payload(enrollment: Any, config: Any) -> dict[str, Any]:
        patient = enrollment.patient
        return {
            "profile_id": HealthCloudWorkflowService._stable_profile_id(enrollment),
            "first_name": str(getattr(patient, "first_name", "") or "").strip(),
            "last_name": str(getattr(patient, "last_name", "") or "").strip(),
            "other_name": str(getattr(patient, "middle_name", "") or "").strip(),
            "gender": (
                "MALE"
                if str(getattr(patient, "gender", "")).upper() == "M"
                else "FEMALE"
                if str(getattr(patient, "gender", "")).upper() == "F"
                else "OTHER"
            ),
            "date_of_birth": HealthCloudWorkflowService._to_iso_date(
                getattr(patient, "date_of_birth", None)
            ),
            "enrolment_date": HealthCloudWorkflowService._to_iso_date(
                getattr(enrollment, "valid_from", None)
            ),
            "slade_code": str(getattr(config, "payer_slade_code", "") or ""),
            "service_name": "SLADE_ADVANTAGE",
            "contacts": HealthCloudWorkflowService._identity_contacts(enrollment),
            "identifiers": HealthCloudWorkflowService._identity_identifiers(enrollment),
        }

    @staticmethod
    def _merge_health_identity_snapshot(
        enrollment: Any,
        *,
        profile_response: dict[str, Any] | None = None,
        health_id_response: dict[str, Any] | None = None,
    ) -> None:
        payload = getattr(enrollment, "last_eligibility_payload", None)
        merged = dict(payload) if isinstance(payload, dict) else {}
        snapshot = merged.get("health_identity")
        if not isinstance(snapshot, dict):
            snapshot = {}

        if isinstance(profile_response, dict):
            if profile_response.get("id") is not None:
                snapshot["profile_request_id"] = str(profile_response.get("id") or "")
            if profile_response.get("profile_id") is not None:
                snapshot["profile_id"] = str(profile_response.get("profile_id") or "")
            if profile_response.get("service_account_number") is not None:
                snapshot["service_account_number"] = str(
                    profile_response.get("service_account_number") or ""
                )
            snapshot["profile_response"] = profile_response
            snapshot["posted_at"] = timezone.now().isoformat()

        if isinstance(health_id_response, dict):
            if health_id_response.get("health_id") is not None:
                snapshot["health_id"] = str(health_id_response.get("health_id") or "")
            if health_id_response.get("profile_id") is not None:
                snapshot["profile_id"] = str(health_id_response.get("profile_id") or "")
            snapshot["health_id_response"] = health_id_response
            snapshot["health_id_checked_at"] = timezone.now().isoformat()

        merged["health_identity"] = snapshot
        enrollment.last_eligibility_payload = merged
        enrollment.save(update_fields=["last_eligibility_payload", "updated_at"])

    def post_profile_to_crm(
        self,
        *,
        enrollment: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        config = _get_config(enrollment.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "post_profile_to_crm")

        base_payload = self._default_identity_payload(enrollment, config)
        base_payload.update(self._clean_identity_payload_override(payload))

        if not str(base_payload.get("slade_code") or "").strip():
            raise InsuranceValidationError(
                "payer_slade_code is required to post profile to Health CRM.",
                provider_code=getattr(config.provider, "code", None),
            )
        if not str(base_payload.get("service_name") or "").strip():
            raise InsuranceValidationError(
                "service_name is required to post profile to Health CRM.",
                provider_code=getattr(config.provider, "code", None),
            )

        response = self._run_idempotent(
            operation="healthcloud.identity.post_profile",
            facility=facility,
            organization=organization,
            payload=base_payload,
            runner=adapter.post_profile_to_crm,
        )
        self._merge_health_identity_snapshot(enrollment, profile_response=response)
        return response

    def get_health_id(
        self,
        *,
        enrollment: Any,
        facility: Any,
        organization: Any,
        profile_id: str = "",
    ) -> dict[str, Any]:
        config = _get_config(enrollment.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "get_health_id")

        resolved_profile_id = str(profile_id or "").strip()
        if not resolved_profile_id:
            payload = getattr(enrollment, "last_eligibility_payload", None)
            if isinstance(payload, dict):
                identity_snapshot = payload.get("health_identity")
                if isinstance(identity_snapshot, dict):
                    resolved_profile_id = str(
                        identity_snapshot.get("profile_request_id")
                        or identity_snapshot.get("profile_id")
                        or ""
                    ).strip()

        if not resolved_profile_id:
            raise InsuranceValidationError(
                "profile_id is required before polling Health ID.",
                provider_code=getattr(config.provider, "code", None),
            )

        request_payload = {
            "profile_id": resolved_profile_id,
            "requested_at": timezone.now().isoformat(),
        }
        response = self._run_idempotent(
            operation="healthcloud.identity.get_health_id",
            facility=facility,
            organization=organization,
            payload=request_payload,
            runner=lambda _payload: adapter.get_health_id(resolved_profile_id),
        )
        self._merge_health_identity_snapshot(enrollment, health_id_response=response)
        return response

    def start_session(
        self,
        *,
        enrollment: Any,
        facility: Any,
        organization: Any,
        eligibility_result: EligibilityResult,
    ) -> Any:
        from hmis.apps.insurance.models import InsuranceVisitAuthorization

        config = _get_config(enrollment.provider, facility)
        payload = eligibility_result.raw_response or {}

        return InsuranceVisitAuthorization.objects.create(
            facility=facility,
            organization=organization,
            enrollment=enrollment,
            provider_config=config,
            patient=enrollment.patient,
            member_number=eligibility_result.member_number or enrollment.member_number,
            payer_slade_code=config.payer_slade_code,
            beneficiary_id=(
                (payload.get("member") or {}).get("id")
                if isinstance(payload.get("member"), dict)
                else None
            ),
            policy_number=self._extract_policy_number(payload),
            eligibility_payload=payload,
            workflow_step="eligibility_verified",
            status=InsuranceVisitAuthorization.Status.PENDING,
            raw_payload=payload,
        )

    def request_otp_for_session(
        self,
        *,
        authorization: Any,
        facility: Any,
        organization: Any,
        contact_id: int,
    ) -> Any:
        config = authorization.provider_config
        adapter = get_adapter(config)
        self._require_operation(adapter, "request_otp")

        if authorization.workflow_step not in {"eligibility_verified", "otp_requested"}:
            raise InsuranceValidationError(
                "Eligibility session is required before requesting OTP.",
                provider_code=getattr(config.provider, "code", None),
            )

        eligibility_payload = authorization.eligibility_payload or {}
        if not isinstance(eligibility_payload, dict) or not eligibility_payload:
            eligibility_payload = self._ensure_eligibility_snapshot(authorization.enrollment)

        payload = {
            "contact_id": contact_id,
            "member_number": authorization.member_number,
            "payer_slade_code": authorization.payer_slade_code,
            "session_id": authorization.pk,
        }
        response = self._run_idempotent(
            operation="healthcloud.session.request_otp",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=lambda _payload: adapter.request_otp(contact_id),
            authorization=authorization,
        )

        authorization.beneficiary_contact_id = contact_id
        authorization.selected_beneficiary_contact_id = contact_id
        authorization.selected_beneficiary_contact_value = self._extract_contact_value(
            eligibility_payload,
            contact_id,
        )
        authorization.eligibility_payload = eligibility_payload
        authorization.workflow_step = "otp_requested"
        authorization.status = authorization.Status.OTP_REQUESTED
        authorization.raw_payload = response
        authorization.save(
            update_fields=[
                "beneficiary_contact_id",
                "selected_beneficiary_contact_id",
                "selected_beneficiary_contact_value",
                "eligibility_payload",
                "workflow_step",
                "status",
                "raw_payload",
                "updated_at",
            ]
        )
        return authorization

    def start_visit_for_session(
        self,
        *,
        authorization: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
        encounter: Any = None,
    ) -> Any:
        config = authorization.provider_config
        adapter = get_adapter(config)
        self._require_operation(adapter, "start_visit")

        if authorization.status != authorization.Status.OTP_REQUESTED:
            raise InsuranceValidationError(
                "OTP must be requested before starting a visit.",
                provider_code=getattr(config.provider, "code", None),
            )

        request_payload = dict(payload)
        request_payload.setdefault("beneficiary_id", payload.get("beneficiary_id"))
        request_payload.setdefault("beneficiary_contact", payload.get("beneficiary_contact"))
        request_payload["session_id"] = authorization.pk

        response = self._run_idempotent(
            operation="healthcloud.session.start_visit",
            facility=facility,
            organization=organization,
            payload=request_payload,
            runner=adapter.start_visit,
            authorization=authorization,
        )

        authorization.encounter = encounter
        authorization.benefit_type = str(payload.get("benefit_type") or "")
        authorization.benefit_code = str(payload.get("benefit_code") or "")
        authorization.policy_number = str(
            payload.get("policy_number") or authorization.policy_number
        )
        authorization.beneficiary_id = payload.get("beneficiary_id")
        authorization.beneficiary_contact_id = payload.get("beneficiary_contact")
        authorization.selected_beneficiary_contact_id = payload.get("beneficiary_contact")
        authorization.selected_beneficiary_contact_value = str(
            payload.get("beneficiary_contact_value")
            or authorization.selected_beneficiary_contact_value
        )
        authorization.selected_benefit_type = str(payload.get("benefit_type") or "")
        authorization.selected_benefit_code = str(payload.get("benefit_code") or "")
        authorization.factors = payload.get("factors") or ["OTP"]
        authorization.workflow_step = "visit_authorized"
        authorization.status = authorization.Status.AUTHORIZED
        authorization.auth_token = str(response.get("auth_token") or authorization.auth_token)
        authorization.authorization_guid = str(
            response.get("edi_auth_guid") or response.get("authorization_guid") or ""
        )
        authorization.auth_status = str(response.get("auth_status") or "AUTHORIZED")
        authorization.raw_payload = response
        authorization.save(
            update_fields=[
                "encounter",
                "benefit_type",
                "benefit_code",
                "policy_number",
                "beneficiary_id",
                "beneficiary_contact_id",
                "selected_beneficiary_contact_id",
                "selected_beneficiary_contact_value",
                "selected_benefit_type",
                "selected_benefit_code",
                "factors",
                "workflow_step",
                "status",
                "auth_token",
                "authorization_guid",
                "auth_status",
                "raw_payload",
                "updated_at",
            ]
        )
        return authorization

    def request_otp(
        self,
        *,
        enrollment: Any,
        facility: Any,
        organization: Any,
        contact_id: int,
    ) -> Any:
        from hmis.apps.insurance.models import InsuranceVisitAuthorization

        config = _get_config(enrollment.provider, facility)
        self._ensure_eligibility_snapshot(enrollment)
        adapter = get_adapter(config)
        self._require_operation(adapter, "request_otp")
        payload = {
            "contact_id": contact_id,
            "member_number": enrollment.member_number,
            "payer_slade_code": config.payer_slade_code,
        }
        response = self._run_idempotent(
            operation="healthcloud.request_otp",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=lambda _payload: adapter.request_otp(contact_id),
        )
        eligibility_payload = {}
        if isinstance(getattr(enrollment, "last_eligibility_payload", None), dict):
            eligibility_payload = enrollment.last_eligibility_payload
        auth = InsuranceVisitAuthorization.objects.create(
            facility=facility,
            organization=organization,
            enrollment=enrollment,
            provider_config=config,
            patient=enrollment.patient,
            member_number=enrollment.member_number,
            payer_slade_code=config.payer_slade_code,
            beneficiary_contact_id=contact_id,
            selected_beneficiary_contact_id=contact_id,
            selected_beneficiary_contact_value=self._extract_contact_value(
                eligibility_payload,
                contact_id,
            ),
            eligibility_payload=eligibility_payload,
            workflow_step="otp_requested",
            status=InsuranceVisitAuthorization.Status.OTP_REQUESTED,
            raw_payload=response,
        )
        return auth

    def start_visit(
        self,
        *,
        enrollment: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
        encounter: Any = None,
    ) -> Any:
        from hmis.apps.insurance.models import InsuranceVisitAuthorization

        config = _get_config(enrollment.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "start_visit")
        request_payload = dict(payload)
        request_payload.setdefault("beneficiary_id", payload.get("beneficiary_id"))

        response = self._run_idempotent(
            operation="healthcloud.start_visit",
            facility=facility,
            organization=organization,
            payload=request_payload,
            runner=adapter.start_visit,
        )

        return InsuranceVisitAuthorization.objects.create(
            facility=facility,
            organization=organization,
            enrollment=enrollment,
            provider_config=config,
            patient=enrollment.patient,
            encounter=encounter,
            member_number=enrollment.member_number,
            payer_slade_code=config.payer_slade_code,
            benefit_type=str(payload.get("benefit_type") or ""),
            benefit_code=str(payload.get("benefit_code") or ""),
            policy_number=str(payload.get("policy_number") or ""),
            beneficiary_id=payload.get("beneficiary_id"),
            beneficiary_contact_id=payload.get("beneficiary_contact"),
            selected_beneficiary_contact_id=payload.get("beneficiary_contact"),
            selected_beneficiary_contact_value=str(payload.get("beneficiary_contact_value") or ""),
            selected_benefit_type=str(payload.get("benefit_type") or ""),
            selected_benefit_code=str(payload.get("benefit_code") or ""),
            factors=payload.get("factors") or ["OTP"],
            eligibility_payload=getattr(enrollment, "last_eligibility_payload", {}) or {},
            workflow_step="visit_authorized",
            status=InsuranceVisitAuthorization.Status.AUTHORIZED,
            auth_token=str(response.get("auth_token") or ""),
            authorization_guid=str(response.get("edi_auth_guid") or ""),
            auth_status="AUTHORIZED",
            raw_payload=response,
        )

    def validate_authorization(
        self,
        *,
        authorization: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        config = authorization.provider_config
        adapter = get_adapter(config)
        self._require_operation(adapter, "validate_authorization")
        if authorization.status != authorization.Status.AUTHORIZED:
            raise InsuranceValidationError(
                "Visit authorization must be started before token validation.",
                provider_code=getattr(config.provider, "code", None),
            )
        response = self._run_idempotent(
            operation="healthcloud.validate_authorization",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=adapter.validate_authorization,
            authorization=authorization,
        )
        authorization.status = authorization.Status.VALIDATED
        authorization.authorization_guid = str(
            response.get("authorization_guid") or authorization.authorization_guid
        )
        authorization.auth_status = str(response.get("auth_status") or authorization.auth_status)
        authorization.raw_payload = response
        authorization.workflow_step = "authorization_validated"
        authorization.save(
            update_fields=[
                "status",
                "authorization_guid",
                "auth_status",
                "workflow_step",
                "raw_payload",
                "updated_at",
            ]
        )
        return response

    def reserve_balance(
        self,
        *,
        claim: Any,
        authorization: Any,
        facility: Any,
        organization: Any,
        amount: Any,
        invoice_number: str,
    ) -> Any:
        from hmis.apps.insurance.models import InsuranceBalanceReservation

        adapter = get_adapter(authorization.provider_config)
        self._require_operation(adapter, "reserve_balance")
        payload = {
            "authorization": authorization.authorization_guid,
            "invoice_number": invoice_number,
            "amount": str(amount),
        }
        response = self._run_idempotent(
            operation="healthcloud.reserve_balance",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=adapter.reserve_balance,
            claim=claim,
            authorization=authorization,
        )
        return InsuranceBalanceReservation.objects.create(
            facility=facility,
            organization=organization,
            authorization=authorization,
            claim=claim,
            reservation_guid=str(response.get("guid") or ""),
            invoice_number=str(response.get("invoiceNumber") or invoice_number),
            amount=amount,
            amount_released=response.get("amountReleased") or 0,
            payer_invoice_reference=str(response.get("payerInvoiceReference") or ""),
            status=InsuranceBalanceReservation.Status.RESERVED,
            raw_payload=response,
        )

    def submit_claim(self, *, claim: Any, facility: Any, organization: Any) -> dict[str, Any]:
        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "submit_claim")
        payload = {
            "claim_id": claim.pk,
            "claim_number": claim.claim_number,
            "member_number": (
                claim.patient_insurance.member_number if claim.patient_insurance else ""
            ),
            "payer_slade_code": config.payer_slade_code,
        }
        response = self._run_idempotent(
            operation="healthcloud.submit_claim",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=lambda _payload: adapter.submit_claim(claim).raw_response,
            claim=claim,
        )
        claim.external_claim_id = str(response.get("id") or response.get("claim_id") or "")
        external_status = str(response.get("workflow_state") or response.get("status") or "")
        mapped_status = self._map_healthcloud_status_to_claim_status(external_status)
        claim.status = mapped_status or claim.Status.SUBMITTED
        claim.submission_date = timezone.now()
        claim.save(update_fields=["external_claim_id", "status", "submission_date", "updated_at"])
        return response

    def refresh_claim_status(
        self, *, claim: Any, facility: Any, organization: Any
    ) -> dict[str, Any]:
        if not getattr(claim, "external_claim_id", ""):
            raise InsuranceValidationError("Claim has no external_claim_id. Submit claim first.")

        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "check_claim_status")
        payload = {
            "claim_id": claim.pk,
            "external_claim_id": claim.external_claim_id,
            "requested_at": timezone.now().isoformat(),
        }
        response = self._run_idempotent(
            operation="healthcloud.check_claim_status",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=lambda _payload: adapter.check_claim_status(claim).raw_response,
            claim=claim,
        )

        external_status = str(response.get("workflow_state") or response.get("status") or "")
        mapped_status = self._map_healthcloud_status_to_claim_status(external_status)

        update_fields = ["updated_at"]
        if mapped_status and mapped_status != claim.status:
            claim.status = mapped_status
            update_fields.append("status")

        if (
            claim.status in {claim.Status.SUBMITTED, claim.Status.ACKNOWLEDGED}
            and not claim.submission_date
        ):
            claim.submission_date = timezone.now()
            update_fields.append("submission_date")

        if len(update_fields) > 1:
            claim.save(update_fields=update_fields)

        return response

    def submit_invoice(
        self,
        *,
        claim: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "submit_invoice")
        response = self._run_idempotent(
            operation="healthcloud.submit_invoice",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=adapter.submit_invoice,
            claim=claim,
        )
        return response

    def submit_credit_note(
        self,
        *,
        claim: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "submit_credit_note")
        response = self._run_idempotent(
            operation="healthcloud.submit_credit_note",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=adapter.submit_credit_note,
            claim=claim,
        )
        return response

    def upload_claim_attachment(
        self,
        *,
        claim: Any,
        facility: Any,
        organization: Any,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not getattr(claim, "external_claim_id", ""):
            raise InsuranceValidationError(
                "Submit claim to HealthCloud first to obtain external claim id before uploading attachments."
            )

        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "upload_claim_attachment")
        payload = dict(payload)
        payload["claim"] = payload.get("claim") or claim.external_claim_id
        response = self._run_idempotent(
            operation="healthcloud.upload_claim_attachment",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=adapter.upload_claim_attachment,
            claim=claim,
        )
        self._record_attachment_meta(
            claim=claim,
            attachment_type=str(payload.get("attachment_type") or "OTHER"),
            description=str(payload.get("description") or ""),
            source_name=str(payload.get("attachment") or ""),
            response=response,
        )
        return response

    def upload_claim_attachment_file(
        self,
        *,
        claim: Any,
        facility: Any,
        _organization: Any,
        file_obj: Any,
        attachment_type: str,
        description: str = "",
    ) -> dict[str, Any]:
        if not getattr(claim, "external_claim_id", ""):
            raise InsuranceValidationError(
                "Submit claim to HealthCloud first to obtain external claim id before uploading attachments."
            )

        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "upload_claim_attachment")

        payload = {
            "claim": claim.external_claim_id,
            "attachment_type": attachment_type,
            "description": description,
            "__file_obj__": file_obj,
        }
        attachment_response = adapter.upload_claim_attachment(payload)

        attachment_ref = str(
            attachment_response.get("id")
            or attachment_response.get("attachment_id")
            or attachment_response.get("guid")
            or attachment_response.get("url")
            or ""
        )

        self._record_attachment_meta(
            claim=claim,
            attachment_type=attachment_type,
            description=description,
            source_name=str(getattr(file_obj, "name", "attachment")),
            response=attachment_response,
        )

        return {
            "attachment_ref": attachment_ref,
            "attachment": attachment_response,
        }

    @staticmethod
    def _record_attachment_meta(
        *,
        claim: Any,
        attachment_type: str,
        description: str,
        source_name: str,
        response: dict[str, Any],
    ) -> None:
        attachment_ref = str(
            response.get("id")
            or response.get("attachment_id")
            or response.get("guid")
            or response.get("url")
            or source_name
        )
        if not attachment_ref:
            return

        existing = list(getattr(claim, "attachments_meta", []) or [])
        now_iso = timezone.now().isoformat()
        entry = {
            "filename": source_name or f"{attachment_type.lower()}_attachment",
            "url": attachment_ref,
            "content_type": attachment_type,
            "uploaded_at": now_iso,
            "description": description,
        }

        deduped = [item for item in existing if str(item.get("url") or "") != attachment_ref]
        claim.attachments_meta = [entry, *deduped][:100]
        claim.save(update_fields=["attachments_meta", "updated_at"])

    def get_claim_remittance(
        self,
        *,
        claim: Any,
        facility: Any,
        organization: Any,
    ) -> dict[str, Any]:
        config = _get_config(claim.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "get_claim_remittance")
        claim_ref = claim.external_claim_id or claim.pk
        payload = {
            "claim_id": claim_ref,
            "claim_number": claim.claim_number,
        }
        response = self._run_idempotent(
            operation="healthcloud.get_claim_remittance",
            facility=facility,
            organization=organization,
            payload=payload,
            runner=lambda _payload: adapter.get_claim_remittance(
                claim_ref,
                claim_number=claim.claim_number,
            ),
            claim=claim,
        )

        approved = response.get("approved_amount")
        balanced_paid = response.get("balanced_paid_amount")
        if approved is not None:
            claim.approved_amount = approved
        if balanced_paid is not None:
            claim.paid_amount = balanced_paid

        if balanced_paid is not None and approved is not None:
            try:
                if float(balanced_paid) >= float(approved):
                    claim.status = claim.Status.PAID
                elif float(balanced_paid) > 0:
                    claim.status = claim.Status.PARTIALLY_PAID
            except (ValueError, TypeError):
                pass

        claim.save(update_fields=["approved_amount", "paid_amount", "status", "updated_at"])
        return response

    @staticmethod
    def _extract_claim_rows(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if not isinstance(payload, dict):
            return []
        for key in ("claims", "results", "data", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
        # Some payers return a single claim object.
        if any(
            k in payload
            for k in (
                "claim_id",
                "claim_number",
                "provider_invoice_no",
                "approved_amount",
                "balanced_paid_amount",
            )
        ):
            return [payload]
        return []

    def get_remittance_claims(
        self,
        *,
        remittance: Any,
        facility: Any,
        organization: Any,
    ) -> dict[str, Any]:
        from hmis.apps.insurance.models import InsuranceClaim, InsuranceRemittanceLine

        config = _get_config(remittance.provider, facility)
        adapter = get_adapter(config)
        self._require_operation(adapter, "get_remittance_claims")

        remittance_reference = (
            str(getattr(remittance, "bank_reference", "") or "").strip()
            or str(getattr(remittance, "payment_reference", "") or "").strip()
            or str(getattr(remittance, "remittance_number", "") or "").strip()
        )
        if not remittance_reference:
            raise InsuranceValidationError("Remittance has no usable reference for drill-down.")

        request_payload = {
            "remittance_id": remittance.pk,
            "remittance_reference": remittance_reference,
        }

        response = self._run_idempotent(
            operation="healthcloud.get_remittance_claims",
            facility=facility,
            organization=organization,
            payload=request_payload,
            runner=lambda _payload: adapter.get_remittance_claims(remittance_reference),
            claim=None,
            preauth=None,
            authorization=None,
        )

        claim_rows = self._extract_claim_rows(response)
        touched = 0

        for row in claim_rows:
            claim_number = str(
                row.get("claim_number")
                or row.get("claim_id")
                or row.get("provider_invoice_no")
                or ""
            ).strip()
            if not claim_number:
                continue

            claim = (
                InsuranceClaim.objects.filter(
                    facility=facility,
                    claim_number=claim_number,
                ).first()
                or InsuranceClaim.objects.filter(
                    facility=facility,
                    external_claim_id=claim_number,
                ).first()
            )

            approved_amount = row.get("approved_amount")
            balanced_paid = row.get("balanced_paid_amount")
            proposed = row.get("proposed_amount")
            copay_amount = row.get("copay_amount")

            paid_amount = Decimal(
                str(balanced_paid if balanced_paid is not None else proposed or 0)
            )
            deductions = Decimal(str(copay_amount if copay_amount is not None else 0))
            net_amount = paid_amount

            InsuranceRemittanceLine.objects.update_or_create(
                remittance=remittance,
                claim_number=claim_number,
                defaults={
                    "claim": claim,
                    "member_number": str(row.get("member_number") or ""),
                    "paid_amount": paid_amount,
                    "deductions": deductions,
                    "net_amount": net_amount,
                    "notes": str(row.get("notes") or ""),
                },
            )

            if claim and approved_amount is not None:
                claim.approved_amount = approved_amount
                claim.paid_amount = paid_amount
                if paid_amount > 0:
                    claim.status = (
                        claim.Status.PAID
                        if paid_amount >= Decimal(str(approved_amount))
                        else claim.Status.PARTIALLY_PAID
                    )
                claim.save(update_fields=["approved_amount", "paid_amount", "status", "updated_at"])

            touched += 1

        if touched:
            remittance.reconcile()

        return {
            "remittance_reference": remittance_reference,
            "claims": claim_rows,
            "processed": touched,
            "local_lines": remittance.lines.count(),
        }


# ---------------------------------------------------------------------------
# Export service — CSV/PDF for manual claim submission
# ---------------------------------------------------------------------------


class InsuranceExportService:
    """Generate export files for manual claim submission."""

    @staticmethod
    def export_claims_csv(
        claims: Any,  # QuerySet[InsuranceClaim]
    ) -> str:
        """Export claims to CSV string for manual submission."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Claim Number",
                "Patient Name",
                "Member Number",
                "Service Date",
                "Claim Type",
                "Total Amount",
                "Status",
                "Diagnosis Codes",
            ]
        )
        for claim in claims.select_related("patient", "patient_insurance"):
            patient = claim.patient
            writer.writerow(
                [
                    claim.claim_number,
                    f"{patient.first_name} {patient.last_name}" if patient else "",
                    claim.patient_insurance.member_number if claim.patient_insurance else "",
                    claim.service_date.isoformat() if claim.service_date else "",
                    claim.claim_type,
                    str(claim.total_amount),
                    claim.status,
                    ", ".join(claim.diagnosis_codes or []),
                ]
            )
        return output.getvalue()

    @staticmethod
    def export_claim_detail_csv(claim: InsuranceClaim) -> str:
        """Export single claim with line items to CSV."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Claim Number", claim.claim_number])
        writer.writerow(["Status", claim.status])
        writer.writerow(["Total Amount", str(claim.total_amount)])
        writer.writerow([])
        writer.writerow(
            [
                "Service Code",
                "Description",
                "Quantity",
                "Unit Price",
                "Claimed Amount",
                "Tariff Code",
            ]
        )
        for item in claim.items.all():
            writer.writerow(
                [
                    item.service_code,
                    item.service_description,
                    item.quantity,
                    str(item.unit_price),
                    str(item.claimed_amount),
                    item.tariff_code or "",
                ]
            )
        return output.getvalue()
