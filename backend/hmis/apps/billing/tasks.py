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
