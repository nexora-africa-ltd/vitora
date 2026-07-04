# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Billing Celery tasks for scheduled automation.

Tasks:
- apply_daily_bed_charges: Midnight — charge active IPD admissions
- flag_overdue_invoices: 6 AM daily — mark past-due invoices
- submit_pending_sha_claims: Hourly — batch submit SHA claims to SHA API
- poll_preauth_statuses: Every 5 min — poll DHA for preauth decision updates
- refresh_sha_interventions: Weekly — re-scrape OCL intervention catalog
"""

import logging

from celery import shared_task


@shared_task(name="hmis.apps.billing.tasks.apply_daily_bed_charges")
def apply_daily_bed_charges():
    """Apply daily bed charges to all active inpatient admissions."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.apply_daily_bed_charges()


@shared_task(name="hmis.apps.billing.tasks.flag_overdue_invoices")
def flag_overdue_invoices():
    """Flag pending invoices past their due date as overdue."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.flag_overdue_invoices()


@shared_task(name="hmis.apps.billing.tasks.submit_pending_sha_claims")
def submit_pending_sha_claims():
    """Batch-submit draft SHA claims to the SHA API."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.submit_pending_sha_claims()


@shared_task(name="hmis.apps.billing.tasks.poll_sha_claim_statuses")
def poll_sha_claim_statuses():
    """Poll SHA API for status updates on submitted claims."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.poll_sha_claim_statuses()


@shared_task(name="hmis.apps.billing.tasks.poll_preauth_statuses")
def poll_preauth_statuses():
    """Poll DHA API for pre-authorization decision updates on pending requests."""
    from hmis.apps.billing.models import PreauthRequest
    from hmis.apps.billing.services.sha_preauth import SHAPreauthService

    logger = logging.getLogger(__name__)
    pending = PreauthRequest.objects.filter(
        decision=PreauthRequest.PreauthDecision.PENDING,
    ).select_related("claim", "sha_member")

    polled = 0
    errors = 0
    for preauth in pending:
        try:
            service = SHAPreauthService()
            service.poll_status(preauth)
            polled += 1
        except Exception:
            errors += 1
            logger.exception("Failed to poll preauth %s", preauth.preauth_reference)

    result = f"Polled {polled} preauth request(s), {errors} error(s)"
    logger.info(result)
    return result


@shared_task(name="hmis.apps.billing.tasks.poll_ilm_preauth_statuses")
def poll_ilm_preauth_statuses():
    """Poll DHA ILM API for status updates on submitted SHAPreauth records.

    Runs every 5 minutes to keep ILM preauth statuses fresh.
    Checks both overall preauth status and doctor consent state.
    """
    from hmis.apps.billing.models import SHAPreauth
    from hmis.apps.billing.services.dha_errors import DHAError
    from hmis.apps.billing.services.ilm_preauth_service import IlmPreauthService

    logger = logging.getLogger(__name__)
    # Poll submitted preauths that haven't been decided yet
    pending = SHAPreauth.objects.filter(
        status=SHAPreauth.Status.SUBMITTED,
    ).select_related("patient")

    polled = 0
    errors = 0
    updated = 0
    service = IlmPreauthService()

    for preauth in pending[:100]:  # Cap at 100 per run to avoid timeouts
        try:
            result = service.fetch_preauth(
                consent_token=preauth.consent_token,
                facility=preauth.facility,
                user=None,
                preauth=preauth,
            )
            polled += 1

            # Check if DHA returned updated status
            dha_data = result.payload
            if isinstance(dha_data, dict):
                new_status = dha_data.get("status", "")
                if (
                    new_status
                    and new_status in dict(SHAPreauth.Status.choices)
                    and new_status != preauth.status
                ):
                    preauth.status = new_status
                    if new_status in ("approved", "denied"):
                        from django.utils import timezone

                        preauth.decided_at = timezone.now()
                    preauth.save(update_fields=["status", "decided_at", "updated_at"])
                    updated += 1

                # Also update doctor consent state
                new_consent = dha_data.get("doctor_consent_state", "")
                if new_consent and new_consent != preauth.doctor_consent_state:
                    preauth.doctor_consent_state = new_consent
                    preauth.save(update_fields=["doctor_consent_state", "updated_at"])
        except DHAError:
            errors += 1
            logger.warning("DHA error polling ILM preauth %s", preauth.pk)
        except Exception:
            errors += 1
            logger.exception("Failed to poll ILM preauth %s", preauth.pk)

    result_msg = f"ILM preauths: polled {polled}, updated {updated}, errors {errors}"
    logger.info(result_msg)
    return result_msg


@shared_task(name="hmis.apps.billing.tasks.refresh_sha_interventions")
def refresh_sha_interventions():
    """Re-scrape SHA benefits/interventions from OCL API weekly."""
    from django.core.management import call_command

    call_command("refresh_interventions")


@shared_task(name="hmis.apps.billing.tasks.flag_time_barring_claims")
def flag_time_barring_claims():
    """
    Flag claims approaching or past their time-barring deadline.

    Runs every 30 minutes via Celery beat.

    Logic:
    - Emergency claims (ECCIF): 24h window from service_date
    - Query claims: 14-day window from when query was raised
    - Emits warning event when within 25% of remaining time
    - Auto-transitions to pseudo-TIME_BARRED status when past cutoff

    Note: DHA enforces TIME_BARRED server-side, but local flagging
    gives the facility time to act before the hard cutoff.
    """
    from django.db.models import Q
    from django.utils import timezone

    from hmis.apps.billing.models import SHAClaim
    from hmis.apps.core.events import BillingEvents, publish_event

    logger = logging.getLogger(__name__)
    now = timezone.now()

    # Find emergency claims that haven't been submitted yet
    emergency_claims = SHAClaim.objects.filter(
        Q(is_emergency_claim=True) | Q(claim_type=SHAClaim.ClaimType.EMERGENCY),
        status__in=[
            SHAClaim.ClaimStatus.DRAFT,
            SHAClaim.ClaimStatus.VALIDATED,
            SHAClaim.ClaimStatus.PENDING_SUBMISSION,
        ],
    )

    # Find claims with QUERY status (awaiting attachments)
    query_claims = SHAClaim.objects.filter(
        status=SHAClaim.ClaimStatus.QUERY,
    )

    warned = 0
    time_barred = 0

    for claim in list(emergency_claims) + list(query_claims):
        deadline = claim.time_barring_deadline
        if deadline is None:
            continue

        remaining_hours = (deadline - now).total_seconds() / 3600

        if remaining_hours <= 0:
            # Past deadline — emit time-barred event
            time_barred += 1
            publish_event(
                BillingEvents.SHA_CLAIM_TIME_BARRED,
                {
                    "claim_id": claim.pk,
                    "claim_number": claim.claim_number,
                    "claim_type": claim.claim_type,
                    "deadline": deadline.isoformat(),
                    "facility_id": claim.facility_id,
                },
            )
        elif remaining_hours <= 6:  # Within 25% of 24h = 6h
            # Approaching deadline — emit warning
            warned += 1
            publish_event(
                BillingEvents.SHA_CLAIM_TIME_BAR_WARNING,
                {
                    "claim_id": claim.pk,
                    "claim_number": claim.claim_number,
                    "claim_type": claim.claim_type,
                    "hours_remaining": round(remaining_hours, 1),
                    "deadline": deadline.isoformat(),
                    "facility_id": claim.facility_id,
                },
            )

    result = f"Time-barring check: {warned} warning(s), {time_barred} time-barred"
    logger.info(result)
    return result


@shared_task(name="hmis.apps.billing.tasks.refresh_otp_whitelist_statuses")
def refresh_otp_whitelist_statuses():
    """
    Poll DHA for status updates on PENDING/REQUESTED OTP whitelist requests.

    Runs every 10 minutes via Celery beat. Updates local status and publishes
    a domain event when a whitelist request transitions to APPROVED/REJECTED.
    """
    from hmis.apps.billing.models import SHAOtpWhitelistRequest
    from hmis.apps.billing.services.ilm_lifecycle_service import IlmLifecycleService
    from hmis.apps.core.events import BillingEvents, publish_event

    logger = logging.getLogger(__name__)

    pending = SHAOtpWhitelistRequest.objects.filter(
        status=SHAOtpWhitelistRequest.Status.REQUESTED,
    ).select_related("facility")

    updated = 0
    errors = 0

    for request in pending:
        try:
            service = IlmLifecycleService(facility=request.facility)
            result = service.list_otp_whitelist_status(
                beneficiary_cr_id=request.beneficiary_cr_id,
                guid=request.dha_guid,
                facility=request.facility,
            )
            if not isinstance(result.payload, dict):
                continue

            # DHA returns status in different shapes; normalize
            dha_status = (
                result.payload.get("status", "") or result.payload.get("whitelist_status", "")
            ).lower()

            new_status = None
            if dha_status in ("approved", "active", "whitelisted"):
                new_status = SHAOtpWhitelistRequest.Status.APPROVED
            elif dha_status in ("rejected", "denied", "expired"):
                new_status = SHAOtpWhitelistRequest.Status.REJECTED

            if new_status and new_status != request.status:
                old_status = request.status
                request.status = new_status
                request.response_payload = result.payload
                request.save(update_fields=["status", "response_payload"])
                updated += 1

                publish_event(
                    BillingEvents.DHA_OTP_WHITELIST_STATUS_CHANGED,
                    {
                        "whitelist_id": request.pk,
                        "beneficiary_cr_id": request.beneficiary_cr_id,
                        "old_status": old_status,
                        "new_status": new_status,
                        "dha_guid": request.dha_guid,
                        "facility_id": request.facility_id,
                    },
                )
        except Exception:
            errors += 1
            logger.exception("Failed to poll whitelist status for %s", request.beneficiary_cr_id)

    result_msg = (
        f"OTP whitelist refresh: {updated} updated, {errors} error(s) "
        f"(of {pending.count()} pending)"
    )
    logger.info(result_msg)
    return result_msg


# =============================================================================
# SHA Claims Workflow Automation Tasks
# =============================================================================


@shared_task(
    name="hmis.apps.billing.tasks.auto_start_visit",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def auto_start_visit(self, encounter_id: int):
    """
    Auto-start DHA visit for a SHA-eligible encounter.

    Triggered by encounter creation signal. Retries up to 3 times
    if consent is not yet available (may be pending OTP validation).
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.auto_start_visit(encounter_id)
    logger = logging.getLogger(__name__)
    logger.info("Auto-start visit for encounter %s: %s", encounter_id, result.get("status"))

    # Retry if consent not yet available (OTP may still be pending validation)
    if result.get("status") == "no_consent" and self.request.retries < self.max_retries:
        logger.info(
            "Consent not yet available for encounter %s, retrying (%d/%d)",
            encounter_id,
            self.request.retries + 1,
            self.max_retries,
        )
        raise self.retry(countdown=60 * (self.request.retries + 1))

    return result


@shared_task(
    name="hmis.apps.billing.tasks.auto_trigger_consent",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=2,
)
def auto_trigger_consent(patient_id: int, facility_id: int):
    """
    Auto-send OTP consent when SHA-eligible patient is queued for clinic.

    Triggered by clinic queue addition. Has retry logic for transient failures.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.auto_trigger_consent(patient_id, facility_id)
    logger = logging.getLogger(__name__)
    logger.info("Auto-consent for patient %s: %s", patient_id, result.get("status"))
    return result


@shared_task(name="hmis.apps.billing.tasks.auto_populate_interventions")
def auto_populate_interventions(encounter_id: int, claim_id: int):
    """
    Auto-suggest and attach SHA interventions based on clinical actions.

    Triggered after lab orders, prescriptions, or diagnoses are recorded.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    logger = logging.getLogger(__name__)

    suggestions = SHAClaimAutomationService.suggest_interventions_for_encounter(encounter_id)
    if suggestions:
        result = SHAClaimAutomationService.auto_attach_interventions(claim_id, suggestions)
        logger.info(
            "Auto-interventions for claim %s: %d attached, %d skipped",
            claim_id,
            result.get("attached", 0),
            result.get("skipped", 0),
        )
        return result

    return {"attached": 0, "skipped": 0, "reason": "no_suggestions"}


@shared_task(name="hmis.apps.billing.tasks.auto_attach_documents")
def auto_attach_documents(claim_id: int):
    """
    Auto-attach existing digital documents to a SHA claim.

    Triggered when lab results are verified or clinical notes are finalized.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.auto_attach_documents(claim_id)
    logger = logging.getLogger(__name__)
    logger.info("Auto-attach docs for claim %s: %d attached", claim_id, result.get("attached", 0))
    return result


@shared_task(name="hmis.apps.billing.tasks.fetch_and_reconcile_remittances")
def fetch_and_reconcile_remittances():
    """
    Fetch SHA remittances from DHA and auto-reconcile against local claims.

    Runs daily at 6 AM via Celery beat. Processes all SHA-enabled facilities.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.fetch_and_reconcile_remittances()
    logger = logging.getLogger(__name__)
    logger.info(
        "Remittance fetch: %d facilities, %d remittances, %d claims reconciled",
        result.get("facilities_processed", 0),
        result.get("remittances_fetched", 0),
        result.get("claims_reconciled", 0),
    )
    return result


@shared_task(name="hmis.apps.billing.tasks.escalate_overdue_queries")
def escalate_overdue_queries():
    """
    Escalate SHA claims with QUERY status approaching deadline (< 48h).

    Runs every 4 hours. Publishes critical-priority notifications.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.escalate_overdue_queries()
    logger = logging.getLogger(__name__)
    logger.info("Query escalation: %d claims escalated", result.get("escalated", 0))
    return result


@shared_task(name="hmis.apps.billing.tasks.cache_patient_eligibility")
def cache_patient_eligibility(patient_id: int, facility_id: int | None = None):
    """
    Pre-check and cache SHA eligibility for a patient.

    Triggered when patient is registered/updated with National ID.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.cache_patient_eligibility(patient_id, facility_id)
    logger = logging.getLogger(__name__)
    logger.info("Eligibility cache for patient %s: %s", patient_id, result.get("status"))
    return result


@shared_task(name="hmis.apps.billing.tasks.generate_daily_claims_digest")
def generate_daily_claims_digest():
    """
    Generate end-of-day SHA claims digest for all facilities.

    Runs daily at 6 PM. Publishes digest events for dashboard/notifications.
    """
    from django.db.models import Q

    from hmis.apps.billing.sha_automation import SHAClaimAutomationService
    from hmis.apps.core.events import publish_event
    from hmis.apps.core.models import Facility

    logger = logging.getLogger(__name__)
    facilities = Facility.objects.exclude(Q(mfl_code="") | Q(mfl_code__isnull=True))

    for facility in facilities:
        try:
            digest = SHAClaimAutomationService.generate_daily_digest(facility.pk)

            publish_event(
                event_type="billing.sha_claims.daily_digest",
                aggregate_type="Facility",
                aggregate_id=facility.pk,
                payload=digest,
                facility_id=facility.pk,
            )
        except Exception:
            logger.exception("Daily digest failed for facility %s", facility.pk)

    return f"Generated digests for {facilities.count()} facilities"


@shared_task(name="hmis.apps.billing.tasks.auto_submit_preauth")
def auto_submit_preauth(encounter_id: int, procedure_type: str):
    """
    Auto-submit preauth for routine procedures on encounter creation.

    Triggered by clinical order signals for known routine procedure types.
    """
    from hmis.apps.billing.sha_automation import SHAClaimAutomationService

    result = SHAClaimAutomationService.auto_submit_preauth(encounter_id, procedure_type)
    logger = logging.getLogger(__name__)
    logger.info(
        "Auto-preauth for encounter %s (%s): %s",
        encounter_id,
        procedure_type,
        result.get("status"),
    )
    return result
