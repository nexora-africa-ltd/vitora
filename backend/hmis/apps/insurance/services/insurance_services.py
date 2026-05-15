"""High-level insurance service classes.

These orchestrate adapter calls, persist results back onto models,
and publish domain events. Views call these services rather than
interacting with adapters directly.
"""

from __future__ import annotations

import contextlib
import csv
import io
import logging
from datetime import date
from typing import TYPE_CHECKING, Any

from django.utils import timezone

if TYPE_CHECKING:
    from hmis.apps.insurance.models import (
        InsuranceClaim,
        InsurancePreauth,
        InsuranceProviderConfig,
        InsuranceRemittance,
        PatientInsurance,
    )

from .adapters import get_adapter
from .errors import InsuranceNotConfiguredError
from .results import ClaimResult, EligibilityResult, PreauthResult

logger = logging.getLogger(__name__)


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

        # Persist verification result
        if result.eligible:
            enrollment.verified_at = timezone.now()
            enrollment.status = "ACTIVE"
            update_fields = ["verified_at", "status", "updated_at"]
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
