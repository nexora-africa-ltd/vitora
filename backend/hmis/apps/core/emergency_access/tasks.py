# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Celery tasks for Emergency Access escalation notifications.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.template import TemplateDoesNotExist, TemplateSyntaxError
from django.template.loader import render_to_string
from django.utils import timezone

from hmis.apps.core.services.email_service import send_transactional_email

logger = logging.getLogger(__name__)

User = get_user_model()


def _sanitize_log_field(value: object) -> str:
    text = str(value)
    return text.replace("\r", " ").replace("\n", " ")


def _get_tenant_approvers(organization):
    if organization is None:
        return User.objects.none()
    return (
        User.objects.filter(is_active=True, staff_profile__organization=organization)
        .filter(
            Q(is_superuser=True)
            | Q(user_permissions__codename="approve_emergency_access")
            | Q(groups__permissions__codename="approve_emergency_access")
        )
        .distinct()
    )


@shared_task(
    bind=True,
    name="hmis.apps.core.emergency_access.tasks.send_emergency_access_escalation",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
)
def send_emergency_access_escalation(self, emergency_access_id: int) -> dict:  # noqa: ARG001
    """
    Send escalation notifications for emergency access.

    This task sends email and SMS notifications to administrators
    when emergency access is invoked.

    Args:
        emergency_access_id: ID of the EmergencyAccess record

    Returns:
        dict: Result with counts of sent notifications
    """
    from hmis.apps.core.emergency_access.models import EmergencyAccess
    from hmis.apps.core.sms_gateway import SMSGateway

    try:
        emergency_access = EmergencyAccess.objects.select_related("user", "patient").get(
            id=emergency_access_id
        )
    except EmergencyAccess.DoesNotExist:
        logger.error("EmergencyAccess %s not found", emergency_access_id)
        return {"status": "error", "message": "EmergencyAccess not found"}

    # Already sent escalation
    if emergency_access.escalation_sent:
        logger.info("Escalation already sent for EmergencyAccess %s", emergency_access_id)
        return {"status": "skipped", "message": "Already sent"}

    organization = getattr(emergency_access.patient, "organization", None)
    if organization is None:
        organization = getattr(
            getattr(emergency_access.user, "staff_profile", None), "organization", None
        )
    if organization is None:
        logger.error(
            "Emergency access %s has no resolvable tenant; escalation suppressed",
            emergency_access_id,
        )
        return {"status": "error", "message": "No tenant resolved", "emails_sent": 0, "sms_sent": 0}

    facility = getattr(
        getattr(emergency_access.user, "staff_profile", None), "primary_facility", None
    )
    if facility is not None and facility.organization_id != organization.id:
        facility = None

    # Limit recipients to the emergency tenant; group permissions are equivalent
    # to direct permissions and avoid excluding role-managed administrators.
    admins = _get_tenant_approvers(organization)

    # Prepare notification content
    patient_info = (
        f"{emergency_access.patient.first_name} {emergency_access.patient.last_name} ({emergency_access.patient.mrn})"
        if emergency_access.patient
        else "System-wide access"
    )

    subject = f"🚨 ALERT: Emergency Access Invoked by {emergency_access.user.username}"

    context = {
        "username": emergency_access.user.username,
        "user_name": emergency_access.user.get_full_name(),
        "patient_info": patient_info,
        "reason": emergency_access.get_reason_display(),
        "reason_details": emergency_access.reason_details,
        "requested_at": emergency_access.requested_at.strftime("%Y-%m-%d %H:%M:%S"),
        "expires_at": emergency_access.expires_at.strftime("%Y-%m-%d %H:%M:%S"),
        "duration_minutes": emergency_access.duration_minutes,
        "ip_address": emergency_access.ip_address or "Unknown",
        "review_url": (
            f"{getattr(settings, 'SITE_URL', 'http://localhost')}/admin/emergency-access/"
            f"{emergency_access.id}/"
        ),
    }
    text_body = render_to_string("core/emergency_access/email/escalation.txt", context)
    try:
        html_body = render_to_string("core/emergency_access/email/escalation.html", context)
    except (TemplateDoesNotExist, TemplateSyntaxError) as exc:
        # The plain-text template is a safe delivery fallback; provider failures still retry.
        logger.warning("Emergency escalation HTML template unavailable: %s", type(exc).__name__)
        html_body = text_body.replace("\n", "<br>")

    sms_message = f"🚨 VITORA ALERT: Emergency access by {emergency_access.user.username}. Reason: {emergency_access.reason}. Review required."

    emails_sent = 0
    sms_sent = 0
    errors = []

    if admins.exclude(email="").exists():
        try:
            for admin in admins.exclude(email=""):
                result = send_transactional_email(
                    subject=subject,
                    html_body=html_body,
                    to_email=admin.email,
                    facility=facility,
                )
                if not result.get("accepted", False):
                    raise RuntimeError(
                        "Emergency escalation email was not accepted by the provider."
                    )
                emails_sent += 1
            logger.info("Sent emergency access escalation email to %d admins", emails_sent)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:
            logger.exception("Failed to send escalation email (%s)", type(exc).__name__)
            raise
    else:
        logger.warning("No admin emails configured for emergency access escalation")

    # Send SMS (if configured)
    if getattr(settings, "AT_USERNAME", None) and getattr(settings, "AT_API_KEY", None):
        try:
            sms_gateway = SMSGateway()
            # Get admin phone numbers from staff profiles
            admin_phones = [
                p.phone_number
                for p in (
                    sp
                    for u in admins
                    if hasattr(u, "staffprofile")
                    for sp in [u.staffprofile]
                    if sp.phone_number
                )
            ]
            for phone in admin_phones:
                try:
                    sms_gateway.send_reminder(phone, sms_message)
                    sms_sent += 1
                except (
                    AttributeError,
                    TypeError,
                    ValueError,
                    RuntimeError,
                    OSError,
                    AssertionError,
                    ImportError,
                ) as exc:
                    logger.warning(
                        "Failed to send SMS to %s (%s)",
                        _sanitize_log_field(phone),
                        type(exc).__name__,
                    )
            if sms_sent:
                logger.info("Sent emergency access escalation SMS to %d admins", sms_sent)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:
            logger.exception("Failed to initialize SMS gateway (%s)", type(exc).__name__)
            errors.append("SMS: gateway initialization failed")

    # Mark escalation as sent
    emergency_access.escalation_sent = True
    emergency_access.escalation_sent_at = timezone.now()
    emergency_access.save(update_fields=["escalation_sent", "escalation_sent_at"])

    return {
        "status": "success",
        "emails_sent": emails_sent,
        "sms_sent": sms_sent,
        "errors": errors,
    }


@shared_task(
    name="hmis.apps.core.emergency_access.tasks.expire_emergency_access",
)
def expire_emergency_access() -> dict:
    """
    Periodic task to expire emergency access records.

    Run this task periodically (e.g., every 5 minutes) to ensure
    emergency access records are marked as expired when they reach
    their expiration time.

    Returns:
        dict: Result with count of expired records
    """
    from hmis.apps.core.emergency_access.models import EmergencyAccess, EmergencyAccessStatus

    now = timezone.now()
    expired_count = EmergencyAccess.objects.filter(
        status=EmergencyAccessStatus.ACTIVE,
        expires_at__lt=now,
    ).update(status=EmergencyAccessStatus.EXPIRED)

    if expired_count:
        logger.info("Expired %d emergency access records", expired_count)

    return {"expired_count": expired_count}


@shared_task(name="hmis.apps.core.emergency_access.tasks.flag_overdue_emergency_access_reviews")
def flag_overdue_emergency_access_reviews() -> dict:
    """Detect and log emergency access records overdue for compliance review."""
    from hmis.apps.core.emergency_access.models import EmergencyAccess, EmergencyAccessStatus
    from hmis.apps.core.models import AuditLog

    now = timezone.now()
    overdue_records = EmergencyAccess.objects.select_related("user").filter(
        status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED],
        review_due_at__lt=now,
    )

    overdue_count = overdue_records.count()
    logged_count = 0

    for record in overdue_records:
        recently_logged = AuditLog.objects.filter(
            action="emergency_access_review_overdue",
            resource_type="EmergencyAccess",
            resource_id=record.id,
            timestamp__gte=now - timezone.timedelta(hours=24),
        ).exists()
        if recently_logged:
            continue

        AuditLog.log(
            action="emergency_access_review_overdue",
            user=record.user,
            resource_type="EmergencyAccess",
            resource_id=record.id,
            patient_id=record.patient_id,
            details={
                "status": record.status,
                "requested_at": record.requested_at.isoformat() if record.requested_at else "",
                "review_due_at": record.review_due_at.isoformat() if record.review_due_at else "",
                "hours_overdue": round(
                    max(0.0, (now - record.review_due_at).total_seconds() / 3600.0),
                    2,
                )
                if record.review_due_at
                else 0.0,
            },
        )
        logged_count += 1

    if overdue_count:
        logger.warning(
            "Detected %d overdue emergency-access review(s); logged %d alerts",
            overdue_count,
            logged_count,
        )

    return {"overdue_count": overdue_count, "logged_count": logged_count}


@shared_task(name="hmis.apps.core.emergency_access.tasks.send_emergency_access_daily_digest")
def send_emergency_access_daily_digest() -> dict:
    """Send a daily compliance digest to emergency-access approvers."""
    from hmis.apps.core.emergency_access.models import EmergencyAccess, EmergencyAccessStatus
    from hmis.apps.core.models import Organization

    now = timezone.now()
    today = timezone.localdate()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timezone.timedelta(days=1)

    orgs = Organization.objects.all()
    total_sent = 0

    for org in orgs:
        approvers = _get_tenant_approvers(org).exclude(email="")
        if not approvers.exists():
            continue

        org_records = EmergencyAccess.objects.filter(
            Q(user__staff_profile__organization=org)
            | Q(patient__organization=org)
            | Q(approver__staff_profile__organization=org)
        ).distinct()

        invoked_today = org_records.filter(
            requested_at__gte=day_start, requested_at__lt=day_end
        ).count()
        reviewed_today = org_records.filter(
            approved_at__gte=day_start, approved_at__lt=day_end
        ).count()
        pending_review = org_records.filter(
            status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED]
        ).count()
        overdue_reviews = org_records.filter(
            status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED],
            review_due_at__lt=now,
        ).count()

        subject = f"Emergency Access Daily Digest ({today.isoformat()})"
        html_body = (
            "<h3>Emergency Access Compliance Digest</h3>"
            f"<p>Organization: {org.name}</p>"
            f"<p>Date: {today.isoformat()}</p>"
            f"<ul><li>Invoked today: {invoked_today}</li>"
            f"<li>Reviewed today: {reviewed_today}</li>"
            f"<li>Pending review: {pending_review}</li>"
            f"<li>Overdue reviews: {overdue_reviews}</li></ul>"
        )

        for approver in approvers:
            result = send_transactional_email(
                subject=subject,
                html_body=html_body,
                to_email=approver.email,
                facility=getattr(
                    getattr(approver, "staff_profile", None), "primary_facility", None
                ),
            )
            if result.get("accepted", False):
                total_sent += 1

    if total_sent == 0:
        return {"status": "skipped", "emails_sent": 0}

    return {"status": "success", "emails_sent": total_sent}
