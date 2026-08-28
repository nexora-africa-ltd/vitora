# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing sha automation ops for Vitora HMIS.

What this file is for:
- Implement sha automation ops logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.sha_automation_shared import *  # noqa: F403
from hmis.apps.billing.sha_automation_shared import (
    _resolve_fr_code,
    _sha_automation_handled_exceptions,
)


class SHAClaimAutomationOpsMixin:
    @classmethod
    def fetch_and_reconcile_remittances(cls, facility_id: int | None = None) -> dict:
        """
        Fetch remittances from DHA and reconcile against local claims.

        If facility_id is None, processes all facilities with SHA integration.

        Returns:
            Dict with 'facilities_processed', 'remittances_fetched', 'claims_reconciled'.
        """
        from hmis.apps.billing.services.sha_remittance import SHARemittanceService
        from hmis.apps.core.models import Facility

        result = {"facilities_processed": 0, "remittances_fetched": 0, "claims_reconciled": 0}

        try:
            if facility_id:
                facilities = Facility.objects.filter(pk=facility_id)
            else:
                # All facilities with MFL codes (SHA-enabled)
                facilities = Facility.objects.exclude(Q(mfl_code="") | Q(mfl_code__isnull=True))

            service = SHARemittanceService()

            for facility in facilities:
                try:
                    # Resolve DHA FR code for remittance fetch
                    fr_code = _resolve_fr_code(facility) or facility.mfl_code or ""
                    remittances = service.fetch_remittances(
                        facility_code=fr_code,
                        facility=facility,
                    )
                    result["facilities_processed"] += 1
                    result["remittances_fetched"] += len(remittances)

                    # Reconciliation happens inside fetch_remittances
                    for remittance in remittances:
                        result["claims_reconciled"] += getattr(remittance, "reconciled_count", 0)

                except _sha_automation_handled_exceptions() as e:
                    logger.warning(
                        "Remittance fetch failed for facility %s: %s",
                        facility.mfl_code,
                        str(e),
                    )

            return result

        except _sha_automation_handled_exceptions() as e:
            logger.exception("Remittance fetch and reconcile failed")
            return {**result, "error": str(e)}

    # -------------------------------------------------------------------------
    # 6. Smart query response workflow
    # -------------------------------------------------------------------------

    @classmethod
    def handle_claim_query(cls, claim_id: int) -> dict:
        """
        Handle a claim that received a QUERY status from SHA.

        Actions:
        - Assign the query to the encounter's clinician
        - Calculate response deadline (14 days)
        - Publish high-priority notification
        - Pre-populate available data for response

        Returns:
            Dict with assignment and deadline info.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.core.events import publish_event

        try:
            claim = SHAClaim.objects.select_related(
                "encounter", "encounter__created_by", "facility"
            ).get(pk=claim_id)

            # Calculate deadline (14 days from query)
            query_raised_at = claim.updated_at  # When status changed to QUERY
            deadline = query_raised_at + timedelta(days=14)
            hours_remaining = (deadline - timezone.now()).total_seconds() / 3600

            # Assign to encounter clinician
            assigned_to = None
            if claim.encounter and claim.encounter.created_by:
                assigned_to = claim.encounter.created_by

            # Publish high-priority notification event
            publish_event(
                event_type="billing.sha_claim.query_assigned",
                aggregate_type="SHAClaim",
                aggregate_id=claim.pk,
                payload={
                    "claim_number": claim.claim_number,
                    "claim_id": claim.pk,
                    "assigned_to_id": assigned_to.pk if assigned_to else None,
                    "assigned_to_name": assigned_to.get_full_name() if assigned_to else None,
                    "deadline": deadline.isoformat(),
                    "hours_remaining": round(hours_remaining, 1),
                    "patient_name": str(claim.patient) if claim.patient else "",
                    "priority": "high",
                    "trigger": "claim_query_received",
                },
                facility_id=claim.facility_id,
            )

            return {
                "status": "assigned",
                "assigned_to": assigned_to.get_full_name() if assigned_to else None,
                "deadline": deadline.isoformat(),
                "hours_remaining": round(hours_remaining, 1),
            }

        except _sha_automation_handled_exceptions() as e:
            logger.exception("Handle claim query failed for claim %s", claim_id)
            return {"status": "error", "reason": str(e)}

    @classmethod
    def escalate_overdue_queries(cls) -> dict:
        """
        Escalate queries approaching deadline (< 48h remaining).

        Notifies facility admin and publishes escalation event.

        Returns:
            Dict with 'escalated' count.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.core.events import publish_event

        escalated = 0
        now = timezone.now()
        cutoff_48h = now + timedelta(hours=48)

        query_claims = SHAClaim.objects.filter(
            status=SHAClaim.ClaimStatus.QUERY,
        ).select_related("facility")

        for claim in query_claims:
            deadline = claim.time_barring_deadline
            if deadline and now < deadline <= cutoff_48h:
                hours_remaining = (deadline - now).total_seconds() / 3600

                publish_event(
                    event_type="billing.sha_claim.query_escalated",
                    aggregate_type="SHAClaim",
                    aggregate_id=claim.pk,
                    payload={
                        "claim_number": claim.claim_number,
                        "claim_id": claim.pk,
                        "hours_remaining": round(hours_remaining, 1),
                        "deadline": deadline.isoformat(),
                        "priority": "critical",
                    },
                    facility_id=claim.facility_id,
                )
                escalated += 1

        return {"escalated": escalated}

    # -------------------------------------------------------------------------
    # 7. Batch validation and bulk submission
    # -------------------------------------------------------------------------

    @classmethod
    def batch_validate_claims(cls, facility_id: int) -> dict:
        """
        Validate all draft claims for a facility in batch.

        Returns:
            Summary dict with ready/invalid/missing_docs counts and details.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        claims = SHAClaim.objects.filter(
            facility_id=facility_id,
            status=SHAClaim.ClaimStatus.DRAFT,
        ).select_related("patient", "encounter", "sha_member")

        from hmis.apps.core.models import Facility

        facility = Facility.objects.filter(pk=facility_id).first()
        service = SHAClaimsService(facility=facility)
        ready = []
        invalid = []
        missing_docs = []

        for claim in claims:
            is_valid, errors = service.validate_claim(claim)
            if is_valid:
                ready.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "patient_name": str(claim.patient),
                        "claimed_amount": str(claim.claimed_amount or 0),
                    }
                )
            else:
                # Categorize errors
                doc_errors = [e for e in errors if "document" in e.lower()]
                if doc_errors:
                    missing_docs.append(
                        {
                            "id": claim.pk,
                            "claim_number": claim.claim_number,
                            "patient_name": str(claim.patient),
                            "missing_documents": doc_errors,
                        }
                    )
                else:
                    invalid.append(
                        {
                            "id": claim.pk,
                            "claim_number": claim.claim_number,
                            "patient_name": str(claim.patient),
                            "errors": errors,
                        }
                    )

        return {
            "total": len(ready) + len(invalid) + len(missing_docs),
            "ready": len(ready),
            "invalid": len(invalid),
            "missing_docs": len(missing_docs),
            "ready_claims": ready,
            "invalid_claims": invalid,
            "missing_docs_claims": missing_docs,
            "total_claimable_amount": str(sum(Decimal(c["claimed_amount"]) for c in ready)),
        }

    @classmethod
    def bulk_submit_claims(cls, claim_ids: list[int], user=None) -> dict:
        """
        Submit multiple validated claims in bulk.

        Only submits claims that pass validation. Skips invalid ones.

        Args:
            claim_ids: List of SHAClaim PKs to submit
            user: User performing the submission (for audit)

        Returns:
            Dict with 'submitted', 'failed', 'skipped' counts and details.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()
        submitted = []
        failed = []
        skipped = []

        claims = SHAClaim.objects.filter(
            pk__in=claim_ids,
            status__in=[SHAClaim.ClaimStatus.DRAFT, SHAClaim.ClaimStatus.VALIDATED],
        )

        for claim in claims:
            try:
                is_valid, errors = service.validate_claim(claim)
                if not is_valid:
                    skipped.append(
                        {
                            "id": claim.pk,
                            "claim_number": claim.claim_number,
                            "errors": errors,
                        }
                    )
                    continue

                result = service.submit_claim(claim, user or cls._get_system_user())
                submitted.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "status": result.get("status", "submitted"),
                    }
                )
            except _sha_automation_handled_exceptions() as e:
                failed.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "error": str(e),
                    }
                )

        return {
            "submitted": len(submitted),
            "failed": len(failed),
            "skipped": len(skipped),
            "submitted_claims": submitted,
            "failed_claims": failed,
            "skipped_claims": skipped,
        }

    # -------------------------------------------------------------------------
    # 8. Eligibility pre-check and caching
    # -------------------------------------------------------------------------

    @classmethod
    def cache_patient_eligibility(cls, patient_id: int, facility_id: int | None = None) -> dict:
        """
        Pre-check and cache SHA eligibility for a patient.

        Called when a patient is registered or updated with National ID.
        Stores the result in SHAEligibilityCheck model for quick lookup.

        Returns:
            Dict with eligibility status and expiry.
        """
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
        from hmis.apps.core.models import Facility
        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(pk=patient_id)

            # Need an active SHA member record for eligibility check
            sha_member = SHAMember.objects.filter(
                patient=patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "skipped", "reason": "No active SHA membership"}

            facility = None
            if facility_id:
                facility = Facility.objects.filter(pk=facility_id).first()

            service = SHAEligibilityService()
            from hmis.apps.core.utils import get_system_user

            system_user = get_system_user()
            result = service.check_eligibility(
                sha_member=sha_member,
                user=system_user,
                force_refresh=True,
                facility=facility,
            )

            return {
                "status": "checked",
                "eligible": getattr(result, "is_eligible", False),
                "checked_at": timezone.now().isoformat(),
                "valid_until": (timezone.now() + timedelta(hours=24)).isoformat(),
            }

        except _sha_automation_handled_exceptions() as e:
            logger.warning("Eligibility pre-check failed for patient %s: %s", patient_id, e)
            return {"status": "error", "reason": str(e)}

    # -------------------------------------------------------------------------
    # 9. Auto-submit preauth for routine procedures
    # -------------------------------------------------------------------------

    @classmethod
    def auto_submit_preauth(cls, encounter_id: int, procedure_type: str) -> dict:
        """
        Automatically submit preauth for routine procedure types.

        Routine types that are almost always approved:
        - Normal delivery (maternity)
        - Routine imaging (X-ray, ultrasound)
        - Standard lab panels

        Returns:
            Dict with preauth status.
        """
        from hmis.apps.billing.models import ConsentToken, SHAMember, SHAPreauth
        from hmis.apps.billing.services.ilm_preauth_service import IlmPreauthService
        from hmis.apps.encounters.models import Encounter

        ROUTINE_TYPES = {"normal_delivery", "routine_imaging", "standard_labs", "consultation"}

        if procedure_type not in ROUTINE_TYPES:
            return {"status": "skipped", "reason": f"Not a routine type: {procedure_type}"}

        try:
            encounter = Encounter.objects.select_related("patient", "facility").get(pk=encounter_id)

            # Get SHA member
            sha_member = SHAMember.objects.filter(
                patient=encounter.patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "not_eligible"}

            # Check for existing preauth
            existing = SHAPreauth.objects.filter(
                patient=encounter.patient,
                encounter=encounter,
                status__in=[
                    SHAPreauth.Status.SUBMITTED,
                    SHAPreauth.Status.APPROVED,
                ],
            ).exists()

            if existing:
                return {"status": "already_exists"}

            # Find valid consent token
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            consent_token = ConsentToken.objects.filter(
                sha_member=sha_member,
                created_at__gte=today_start,
                status=ConsentToken.ConsentStatus.VALIDATED,
            ).first()

            if not consent_token:
                return {"status": "no_consent"}

            # Create and submit preauth
            service = IlmPreauthService()
            preauth_type = cls._map_procedure_to_preauth_type(procedure_type)

            result = service.create_preauth(
                consent_token=consent_token.token,
                facility=encounter.facility,
                user=None,
                preauth_type=preauth_type,
                patient=encounter.patient,
                encounter=encounter,
            )

            return {
                "status": "submitted",
                "preauth_id": result.pk if hasattr(result, "pk") else None,
            }

        except _sha_automation_handled_exceptions() as e:
            logger.warning("Auto-preauth failed for encounter %s: %s", encounter_id, e)
            return {"status": "error", "reason": str(e)}

    @classmethod
    def _map_procedure_to_preauth_type(cls, procedure_type: str) -> str:
        """Map a routine procedure type to SHA preauth type."""
        mapping = {
            "normal_delivery": "normal",
            "routine_imaging": "imaging",
            "standard_labs": "normal",
            "consultation": "normal",
        }
        return mapping.get(procedure_type, "normal")

    # -------------------------------------------------------------------------
    # 10. End-of-day claims digest
    # -------------------------------------------------------------------------

    @classmethod
    def generate_daily_digest(cls, facility_id: int) -> dict:
        """
        Generate end-of-day claims summary for a facility.

        Returns:
            Comprehensive digest with counts, amounts, and action items.
        """
        from hmis.apps.billing.models import SHAClaim

        today = date.today()
        now = timezone.now()

        # Claims created today
        created_today = SHAClaim.objects.filter(
            facility_id=facility_id,
            created_at__date=today,
        )

        # Claims submitted today
        submitted_today = SHAClaim.objects.filter(
            facility_id=facility_id,
            submitted_at__date=today,
        )

        # Pending submission (draft/validated)
        pending = SHAClaim.objects.filter(
            facility_id=facility_id,
            status__in=[SHAClaim.ClaimStatus.DRAFT, SHAClaim.ClaimStatus.VALIDATED],
        )

        # Approaching time-bar deadline (< 24h)
        time_bar_risk = []
        emergency_drafts = SHAClaim.objects.filter(
            facility_id=facility_id,
            status__in=[
                SHAClaim.ClaimStatus.DRAFT,
                SHAClaim.ClaimStatus.VALIDATED,
            ],
            claim_type=SHAClaim.ClaimType.EMERGENCY,
        )
        for claim in emergency_drafts:
            deadline = claim.time_barring_deadline
            if deadline and (deadline - now).total_seconds() < 86400:
                time_bar_risk.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "hours_remaining": round((deadline - now).total_seconds() / 3600, 1),
                    }
                )

        # Claims with QUERY status
        queries = SHAClaim.objects.filter(
            facility_id=facility_id,
            status=SHAClaim.ClaimStatus.QUERY,
        )

        # Revenue summary
        pending_amount = pending.aggregate(total=Sum("claimed_amount"))["total"] or Decimal("0")
        approved_today = SHAClaim.objects.filter(
            facility_id=facility_id,
            status__in=[SHAClaim.ClaimStatus.APPROVED, SHAClaim.ClaimStatus.PAID],
            updated_at__date=today,
        ).aggregate(total=Sum("approved_amount"))["total"] or Decimal("0")

        return {
            "date": today.isoformat(),
            "facility_id": facility_id,
            "summary": {
                "created_today": created_today.count(),
                "submitted_today": submitted_today.count(),
                "pending_submission": pending.count(),
                "pending_amount": str(pending_amount),
                "approved_today_amount": str(approved_today),
                "queries_outstanding": queries.count(),
                "time_bar_risk_count": len(time_bar_risk),
            },
            "action_items": {
                "time_bar_risk": time_bar_risk,
                "queries": [
                    {
                        "id": c.pk,
                        "claim_number": c.claim_number,
                        "patient": str(c.patient),
                    }
                    for c in queries[:10]
                ],
                "unsubmitted_drafts": pending.count(),
            },
        }

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    @classmethod
    def _get_system_user(cls):
        """Get or create system user for automated actions."""
        from hmis.apps.core.utils import get_system_user

        return get_system_user()
