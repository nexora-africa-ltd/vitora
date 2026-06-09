"""
Celery tasks for background sync operations.

This module provides Celery tasks for processing the sync queue
and handling background synchronization.

Sprint 0.5: Offline Sync Logic
"""

import logging

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def calculate_retry_delay(retry_count: int, base_delay: int = 60) -> int:
    """
    Calculate exponential backoff delay for retries.

    Args:
        retry_count: Number of retries already attempted
        base_delay: Base delay in seconds (default: 60)

    Returns:
        int: Delay in seconds before next retry
    """
    # Exponential backoff: 60s, 120s, 240s, 480s...
    # Cap at 1 hour (3600 seconds)
    delay = base_delay * (2**retry_count)
    return min(delay, 3600)


def sync_to_server(
    operation: str, model_name: str, data: dict | None = None, record_id: int | None = None
) -> dict:
    """
    Wrapper to sync data to the server.

    This function is importable from tasks for mocking in tests.

    Args:
        operation: CREATE, UPDATE, or DELETE
        model_name: Name of the model
        data: Data to sync (optional for DELETE)
        record_id: ID of the record (optional for CREATE)

    Returns:
        dict: Sync result
    """
    from hmis.apps.core.sync import sync_to_server as _sync_to_server

    return _sync_to_server(
        operation=operation,
        model_name=model_name,
        data=data,
        record_id=record_id,
    )


def sync_entry_to_server(entry) -> dict:
    """
    Sync a SyncQueue entry to the server.

    This function is used for batch processing and is importable
    from tasks for mocking in tests.

    Args:
        entry: SyncQueue entry to sync

    Returns:
        dict: Sync result
    """
    return sync_to_server(
        operation=entry.operation,
        model_name=entry.model_name,
        data=entry.data,
        record_id=entry.record_id,
    )


@shared_task(
    bind=True,
    name="hmis.apps.core.tasks.process_sync_queue",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=3600,
    retry_jitter=True,
    max_retries=5,
)
def process_sync_queue(self, batch_size: int | None = None):
    """
    Process pending entries in the sync queue.

    This task fetches pending sync queue entries and attempts
    to sync them with the remote server.

    Args:
        batch_size: Number of entries to process (default from settings)

    Returns:
        dict: Summary of processed entries
    """
    from hmis.apps.core.sync import SyncManager, get_connectivity_checker

    logger.info("Starting sync queue processing task")

    # Check if sync is enabled
    if not getattr(settings, "SYNC_ENABLED", True):
        logger.info("Sync is disabled - skipping")
        return {"status": "disabled"}

    # Check connectivity
    checker = get_connectivity_checker()
    if not checker.check():
        logger.info("System is offline - rescheduling task")
        # Retry in 5 minutes
        raise self.retry(countdown=300)

    # Process the queue
    manager = SyncManager(connectivity_checker=checker)
    if batch_size:
        manager.batch_size = batch_size

    results = manager._process_entries()

    logger.info(
        f"Sync queue processing complete: "
        f"processed={results['processed']}, "
        f"succeeded={results['succeeded']}, "
        f"failed={results['failed']}, "
        f"conflicts={results['conflicts']}"
    )

    return results


@shared_task(
    name="hmis.apps.core.tasks.check_connectivity",
)
def check_connectivity():
    """
    Periodic task to check and record connectivity status.

    This task should be scheduled to run periodically
    (e.g., every minute) to track connectivity over time.

    Returns:
        dict: Current connectivity status
    """
    from hmis.apps.core.sync import ConnectivityChecker, ConnectivityMonitor

    logger.debug("Running connectivity check")

    monitor = ConnectivityMonitor(ConnectivityChecker())
    is_online = monitor.check_and_notify()
    monitor.record_status()

    return {
        "is_online": is_online,
        "latency_ms": monitor.checker.latency_ms,
    }


@shared_task(
    bind=True,
    name="hmis.apps.core.tasks.sync_single_entry",
    autoretry_for=(Exception,),
    max_retries=3,
)
def sync_single_entry(self, entry_id: int):
    """
    Sync a single queue entry.

    This task can be used to sync a specific entry,
    for example after manual conflict resolution.

    Args:
        entry_id: ID of the SyncQueue entry to sync

    Returns:
        dict: Sync result
    """
    from hmis.apps.core.models import SyncQueue
    from hmis.apps.core.sync import sync_to_server

    logger.info(f"Syncing single entry: {entry_id}")

    try:
        entry = SyncQueue.objects.get(id=entry_id)
    except SyncQueue.DoesNotExist:
        logger.error(f"SyncQueue entry {entry_id} not found")
        return {"success": False, "error": "Entry not found"}

    entry.mark_syncing()

    try:
        result = sync_to_server(
            operation=entry.operation,
            model_name=entry.model_name,
            record_id=entry.record_id,
            data=entry.data,
        )

        if result.get("conflict"):
            entry.mark_conflict()
        elif result.get("success"):
            entry.mark_synced()
        else:
            entry.mark_failed(result.get("error", "Unknown error"))

        return result

    except Exception as e:
        logger.error(f"Error syncing entry {entry_id}: {e}")
        entry.mark_failed(str(e))
        raise self.retry(countdown=calculate_retry_delay(self.request.retries)) from e


@shared_task(
    name="hmis.apps.core.tasks.cleanup_synced_entries",
)
def cleanup_synced_entries(days_old: int = 30):
    """
    Clean up old synced entries from the queue.

    This task removes sync queue entries that have been
    successfully synced more than `days_old` days ago.

    Args:
        days_old: Delete entries older than this many days

    Returns:
        dict: Cleanup summary
    """
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.core.models import SyncQueue

    logger.info(f"Cleaning up synced entries older than {days_old} days")

    cutoff_date = timezone.now() - timedelta(days=days_old)

    deleted_count, _ = SyncQueue.objects.filter(
        status="SYNCED",
        synced_at__lt=cutoff_date,
    ).delete()

    logger.info(f"Deleted {deleted_count} old synced entries")

    return {
        "deleted": deleted_count,
        "cutoff_date": cutoff_date.isoformat(),
    }


@shared_task(
    name="hmis.apps.core.tasks.retry_failed_entries",
)
def retry_failed_entries():
    """
    Reset failed entries for retry.

    This task resets entries that have failed but haven't
    exceeded the maximum retry count.

    Returns:
        dict: Retry summary
    """
    from hmis.apps.core.models import SyncQueue

    max_retries = getattr(settings, "SYNC_MAX_RETRIES", 3)

    logger.info("Resetting failed entries for retry")

    updated_count = SyncQueue.objects.filter(
        status="FAILED",
        retry_count__lt=max_retries,
    ).update(status="PENDING")

    logger.info(f"Reset {updated_count} failed entries for retry")

    return {"reset_count": updated_count}


@shared_task(
    name="hmis.apps.core.tasks.full_sync",
)
def full_sync():
    """
    Perform a full sync of all pending changes.

    This task processes all pending entries without batch limits.
    Use sparingly as it can be resource-intensive.

    Returns:
        dict: Full sync summary
    """
    from hmis.apps.core.models import SyncQueue
    from hmis.apps.core.sync import SyncManager, get_connectivity_checker

    logger.info("Starting full sync")

    checker = get_connectivity_checker()
    if not checker.check():
        logger.warning("Cannot perform full sync while offline")
        return {"status": "offline"}

    SyncQueue.objects.filter(status__in=["PENDING", "FAILED"]).count()

    # Process in batches but don't limit total
    manager = SyncManager(connectivity_checker=checker)
    total_results = {
        "processed": 0,
        "succeeded": 0,
        "failed": 0,
        "conflicts": 0,
    }

    while True:
        results = manager.process_pending_entries()

        if results["processed"] == 0:
            break

        for key in total_results:
            total_results[key] += results[key]

    logger.info(
        f"Full sync complete: {total_results['processed']} processed, "
        f"{total_results['succeeded']} succeeded"
    )

    return total_results


# =============================================================================
# Chronic Care Alert Tasks
# =============================================================================


@shared_task(name="core.send_overdue_appointment_alerts")
def send_overdue_appointment_alerts():
    """
    Send alerts for overdue clinic appointments.

    This task checks for enrollments that are overdue and sends
    alerts to patients and/or staff. Runs daily via Celery Beat.

    Returns:
        dict: Summary of alerts sent
    """
    from django.utils import timezone

    from hmis.apps.clinics.models import ClinicEnrollment

    logger.info("Checking for overdue appointments")

    today = timezone.localdate()
    results = {
        "checked": 0,
        "overdue_found": 0,
        "alerts_sent": 0,
        "errors": 0,
    }

    # Get active enrollments that are overdue and haven't had an alert in 7 days
    overdue_enrollments = ClinicEnrollment.objects.filter(
        status="ACTIVE",
        next_appointment__lt=today,
    ).select_related("patient", "clinic")

    results["checked"] = overdue_enrollments.count()

    for enrollment in overdue_enrollments:
        results["overdue_found"] += 1

        # Check if we should send an alert (not sent in last 7 days)
        should_alert = (
            enrollment.last_reminder_sent is None
            or (timezone.now() - enrollment.last_reminder_sent).days >= 7
        )

        if should_alert:
            try:
                # Send alert (placeholder - implement actual notification)
                _send_overdue_alert(enrollment)

                # Update tracking
                enrollment.last_reminder_sent = timezone.now()
                enrollment.missed_appointment_alerts += 1
                enrollment.save(update_fields=["last_reminder_sent", "missed_appointment_alerts"])

                results["alerts_sent"] += 1
                logger.info(
                    f"Sent overdue alert for enrollment {enrollment.id} "
                    f"(patient: {enrollment.patient.mrn}, clinic: {enrollment.clinic.name})"
                )
            except Exception as e:
                results["errors"] += 1
                logger.error(f"Failed to send alert for enrollment {enrollment.id}: {e}")

    logger.info(
        f"Overdue alert check complete: {results['overdue_found']} overdue, "
        f"{results['alerts_sent']} alerts sent"
    )

    return results


def _send_overdue_alert(enrollment):
    """
    Send an overdue appointment alert for an enrollment.

    This is a placeholder that can be extended to:
    - Send SMS via Africa's Talking
    - Send email notifications
    - Create in-app notifications
    - Notify clinic staff

    Args:
        enrollment: ClinicEnrollment instance
    """
    from hmis.apps.core.models import AuditLog

    # Log the alert for audit purposes
    AuditLog.log(
        action="overdue_appointment_alert",
        user=None,  # System-generated
        resource_type="ClinicEnrollment",
        resource_id=enrollment.id,
        ip_address="127.0.0.1",
        details={
            "patient_mrn": enrollment.patient.mrn,
            "patient_name": f"{enrollment.patient.first_name} {enrollment.patient.last_name}",
            "clinic": enrollment.clinic.name,
            "clinic_type": enrollment.clinic.clinic_type,
            "next_appointment": str(enrollment.next_appointment),
            "days_overdue": enrollment.days_overdue(),
            "alerts_count": enrollment.missed_appointment_alerts + 1,
        },
    )

    # TODO: Implement actual notification channels
    # - SMS: Use Africa's Talking API
    # - Email: Use Django email
    # - In-app: Create Notification model entry


@shared_task(name="core.send_upcoming_appointment_reminders")
def send_upcoming_appointment_reminders():
    """
    Send reminders for upcoming appointments (1-3 days before).

    Returns:
        dict: Summary of reminders sent
    """
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.clinics.models import ClinicEnrollment

    logger.info("Sending upcoming appointment reminders")

    today = timezone.localdate()
    reminder_window_start = today + timedelta(days=1)
    reminder_window_end = today + timedelta(days=3)

    results = {
        "checked": 0,
        "reminders_sent": 0,
        "errors": 0,
    }

    # Get active enrollments with appointments in the next 1-3 days
    upcoming = ClinicEnrollment.objects.filter(
        status="ACTIVE",
        next_appointment__gte=reminder_window_start,
        next_appointment__lte=reminder_window_end,
    ).select_related("patient", "clinic")

    results["checked"] = upcoming.count()

    for enrollment in upcoming:
        # Only send if not reminded recently (within 3 days)
        should_remind = (
            enrollment.last_reminder_sent is None
            or (timezone.now() - enrollment.last_reminder_sent).days >= 3
        )

        if should_remind:
            try:
                _send_appointment_reminder(enrollment)
                enrollment.last_reminder_sent = timezone.now()
                enrollment.save(update_fields=["last_reminder_sent"])
                results["reminders_sent"] += 1
            except Exception as e:
                results["errors"] += 1
                logger.error(f"Failed to send reminder for enrollment {enrollment.id}: {e}")

    logger.info(f"Appointment reminders complete: {results['reminders_sent']} sent")

    return results


def _send_appointment_reminder(enrollment):
    """
    Send an appointment reminder for an enrollment.

    Args:
        enrollment: ClinicEnrollment instance
    """
    from datetime import date

    from hmis.apps.core.models import AuditLog

    days_until = enrollment.days_to_edd() if enrollment.edd else None
    if days_until is None and enrollment.next_appointment:
        days_until = (enrollment.next_appointment - date.today()).days

    AuditLog.log(
        action="appointment_reminder",
        user=None,
        resource_type="ClinicEnrollment",
        resource_id=enrollment.id,
        ip_address="127.0.0.1",
        details={
            "patient_mrn": enrollment.patient.mrn,
            "clinic": enrollment.clinic.name,
            "next_appointment": str(enrollment.next_appointment),
            "days_until": days_until,
        },
    )


@shared_task(name="core.generate_defaulter_list")
def generate_defaulter_list(clinic_id: int | None = None):
    """
    Generate a list of defaulters for follow-up.

    A defaulter is a patient who has missed 2+ appointment cycles.

    Args:
        clinic_id: Optional clinic ID to filter by

    Returns:
        dict: Defaulter list summary
    """
    from django.utils import timezone

    from hmis.apps.clinics.models import ClinicEnrollment

    logger.info(f"Generating defaulter list (clinic_id={clinic_id})")

    today = timezone.localdate()

    queryset = ClinicEnrollment.objects.filter(
        status="ACTIVE",
        next_appointment__isnull=False,
    ).select_related("patient", "clinic")

    if clinic_id:
        queryset = queryset.filter(clinic_id=clinic_id)

    defaulters = []

    for enrollment in queryset:
        if enrollment.is_defaulter():
            defaulters.append(
                {
                    "enrollment_id": enrollment.id,
                    "patient_mrn": enrollment.patient.mrn,
                    "patient_name": f"{enrollment.patient.first_name} {enrollment.patient.last_name}",
                    "clinic": enrollment.clinic.name,
                    "clinic_type": enrollment.clinic.clinic_type,
                    "enrollment_number": enrollment.enrollment_number,
                    "next_appointment": str(enrollment.next_appointment),
                    "days_overdue": enrollment.days_overdue(),
                    "last_visit_date": (
                        str(enrollment.last_visit_date) if enrollment.last_visit_date else None
                    ),
                    "total_visits": enrollment.total_visits,
                    "phone": (
                        enrollment.patient.phone_number
                        if hasattr(enrollment.patient, "phone_number")
                        else None
                    ),
                }
            )

    logger.info(f"Found {len(defaulters)} defaulters")

    return {
        "generated_at": str(today),
        "clinic_id": clinic_id,
        "total_defaulters": len(defaulters),
        "defaulters": defaulters,
    }


# =============================================================================
# Audit Integrity Verification Tasks (DHA Gap #31)
# =============================================================================


@shared_task(name="core.verify_audit_chain_integrity")
def verify_audit_chain_integrity(count: int = 1000):
    """
    Periodic task to verify audit log hash chain integrity.

    Runs hourly via Celery Beat. Verifies the latest N entries
    and creates CRITICAL notifications for superusers on tamper detection.

    Args:
        count: Number of recent entries to verify (default 1000).

    Returns:
        dict: Verification result summary.
    """
    from hmis.apps.core.models import AuditLog, Notification
    from hmis.apps.core.services.audit_integrity import AuditIntegrityService

    logger.info(f"Starting audit chain integrity verification (last {count} entries)")

    service = AuditIntegrityService()
    result = service.verify_latest(count=count)

    # Log the verification result to the audit log itself
    AuditLog.log(
        action="audit_integrity_check",
        resource_type="AuditLog",
        details={
            "valid": result.valid,
            "entries_checked": result.entries_checked,
            "first_mismatch_seq": result.first_mismatch_seq,
            "errors": result.errors,
        },
    )

    if not result.valid:
        logger.critical(
            f"AUDIT CHAIN TAMPER DETECTED at seq {result.first_mismatch_seq}: "
            f"{result.first_mismatch_detail}"
        )

        # Notify all superusers
        from django.contrib.auth import get_user_model

        User = get_user_model()
        superusers = User.objects.filter(is_superuser=True, is_active=True)

        for user in superusers:
            Notification.objects.create(
                user=user,
                notification_type="audit_tamper_detected",
                priority=Notification.Priority.CRITICAL,
                title="Audit Log Tampering Detected",
                message=(
                    f"Hash chain integrity violation detected at sequence "
                    f"#{result.first_mismatch_seq}. {result.first_mismatch_detail}. "
                    f"Immediate investigation required."
                ),
                related_model="AuditLog",
                action_url="/admin/audit-integrity",
            )
    else:
        logger.info(f"Audit chain integrity verified: {result.entries_checked} entries OK")

    return {
        "valid": result.valid,
        "entries_checked": result.entries_checked,
        "first_mismatch_seq": result.first_mismatch_seq,
        "errors": result.errors,
    }


# ---------------------------------------------------------------------------
# HWR License Verification
# ---------------------------------------------------------------------------

_REGULATORS = ("KMPDC", "COC", "PPB", "NCK")


@shared_task(name="hmis.apps.core.tasks.verify_staff_hwr_licenses")
def verify_staff_hwr_licenses():
    """Weekly HWR license verification for all staff with a stored national ID.

    For each staff member whose role requires a license and who has
    ``hwr_national_id`` set, queries the ILM middleware to refresh
    ``license_number``, ``license_expiry``, ``license_verified``, and
    ``hwr_last_verified_at``.

    Publishes domain events for expired / expiring-soon licenses.
    """
    from datetime import date, timedelta

    from django.utils import timezone

    from hmis.apps.core.models import StaffProfile

    profiles = StaffProfile.objects.filter(
        hwr_national_id__gt="",
        employment_status="ACTIVE",
        primary_role__requires_license=True,
    ).select_related("user", "primary_role", "organization", "primary_facility")

    verified = 0
    failed = 0
    expired_count = 0
    expiring_soon_count = 0
    today = date.today()
    expiry_warning_threshold = today + timedelta(days=30)

    for profile in profiles:
        try:
            result = _verify_single_profile(profile)
            if result is None:
                failed += 1
                continue

            verified += 1
            profile.hwr_last_verified_at = timezone.now()

            if profile.license_expiry:
                if profile.license_expiry < today:
                    expired_count += 1
                    _publish_license_event(
                        "core.staff.license_expired",
                        profile,
                        {"days_overdue": (today - profile.license_expiry).days},
                    )
                elif profile.license_expiry <= expiry_warning_threshold:
                    expiring_soon_count += 1
                    _publish_license_event(
                        "core.staff.license_expiring_soon",
                        profile,
                        {"days_remaining": (profile.license_expiry - today).days},
                    )

            profile.save(
                update_fields=[
                    "license_number",
                    "license_expiry",
                    "license_verified",
                    "hwr_last_verified_at",
                ]
            )
        except Exception:
            failed += 1
            logger.exception(
                "HWR verification failed for staff %s (user=%s)",
                profile.pk,
                profile.user_id,
            )

    summary = (
        f"HWR verification complete: {verified} verified, {failed} failed, "
        f"{expired_count} expired, {expiring_soon_count} expiring soon"
    )
    logger.info(summary)
    return summary


def _verify_single_profile(profile):
    """Query ILM for a single staff profile and update license fields.

    Returns the ILM result on success, None on failure/not-found.
    """
    from hmis.apps.billing.services.dha_errors import DHAError
    from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

    service = IlmRegistriesService()

    for regulator in _REGULATORS:
        try:
            result = service.search_professional(
                identification_number=profile.hwr_national_id,
                identification_type="National ID",
                regulator=regulator,
                facility=profile.primary_facility,
                user=profile.user,
            )
            raw = result.payload
            if not raw or not isinstance(raw, dict):
                continue

            msg = raw.get("message") or raw
            licenses = msg.get("licenses", [])
            if not licenses:
                continue

            # Find the latest active license
            from datetime import datetime

            best_license = None
            best_end = None
            for lic in licenses:
                end_str = lic.get("license_end") or ""
                if not end_str or end_str == "None":
                    continue
                try:
                    end_date = datetime.strptime(end_str, "%Y-%m-%d").date()
                    if best_end is None or end_date > best_end:
                        best_end = end_date
                        best_license = lic
                except (ValueError, TypeError):
                    continue

            if best_license and best_end:
                profile.license_number = best_license.get(
                    "external_reference_id"
                ) or best_license.get("id", "")
                profile.license_expiry = best_end
                profile.license_verified = True
                return result

        except DHAError:
            continue
        except Exception:
            logger.exception("ILM error for regulator %s, staff %s", regulator, profile.pk)
            continue

    # None of the regulators returned a result
    profile.license_verified = False
    return None


def _publish_license_event(event_type: str, profile, extra: dict) -> None:
    """Publish a license-related domain event without breaking the task."""
    try:
        from hmis.apps.core.events import publish_event

        publish_event(
            event_type,
            "staff_profile",
            profile.pk,
            {
                "staff_id": profile.pk,
                "user_id": profile.user_id,
                "full_name": profile.get_full_name(),
                "license_number": profile.license_number,
                "license_expiry": str(profile.license_expiry) if profile.license_expiry else None,
                "organization_id": profile.organization_id,
                "facility_id": profile.primary_facility_id,
                **extra,
            },
        )
    except Exception:
        logger.exception("Failed to publish license event %s for staff %s", event_type, profile.pk)


@shared_task(
    name="hmis.apps.core.tasks.prune_sync_queue",
)
def prune_sync_queue():
    """
    Prune old and permanently-failed sync queue entries.

    - Marks entries with retry_count >= MAX_RETRIES as permanently FAILED.
    - Deletes SYNCED entries older than 24 hours.
    - Deletes FAILED entries older than 7 days.

    Runs every 6 hours via Celery Beat.
    """
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.core.models import SyncQueue

    max_retries = getattr(settings, "SYNC_MAX_RETRIES", 10)
    now = timezone.now()

    # Mark permanently failed
    pf_count = SyncQueue.objects.filter(
        status="PENDING",
        retry_count__gte=max_retries,
    ).update(status="FAILED", error_message="Max retries exceeded")

    # Delete old synced (24h)
    synced_deleted, _ = SyncQueue.objects.filter(
        status="SYNCED",
        synced_at__lt=now - timedelta(hours=24),
    ).delete()

    # Delete old failed (7 days)
    failed_deleted, _ = SyncQueue.objects.filter(
        status="FAILED",
        created_at__lt=now - timedelta(days=7),
    ).delete()

    logger.info(
        "Sync queue pruned: %d synced, %d failed deleted, %d marked permanently failed",
        synced_deleted,
        failed_deleted,
        pf_count,
    )

    return {
        "synced_deleted": synced_deleted,
        "failed_deleted": failed_deleted,
        "permanently_failed": pf_count,
    }
