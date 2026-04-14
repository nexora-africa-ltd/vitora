"""
Celery tasks for Emergency Access escalation notifications.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)

User = get_user_model()


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
        logger.error(f"EmergencyAccess {emergency_access_id} not found")
        return {"status": "error", "message": "EmergencyAccess not found"}

    # Already sent escalation
    if emergency_access.escalation_sent:
        logger.info(f"Escalation already sent for EmergencyAccess {emergency_access_id}")
        return {"status": "skipped", "message": "Already sent"}

    # Get administrators to notify (superusers and those with approve permission)
    admins = User.objects.filter(
        is_active=True,
    ).filter(
        # Superusers OR users with approve permission
        is_superuser=True,
    ) | User.objects.filter(
        is_active=True,
        user_permissions__codename="approve_emergency_access",
    )
    admins = admins.distinct()

    # Prepare notification content
    patient_info = (
        f"{emergency_access.patient.first_name} {emergency_access.patient.last_name} ({emergency_access.patient.mrn})"
        if emergency_access.patient
        else "System-wide access"
    )

    subject = f"🚨 ALERT: Emergency Access Invoked by {emergency_access.user.username}"

    message = f"""
EMERGENCY ACCESS ALERT
======================

A user has invoked emergency (break-glass) access.

User: {emergency_access.user.username} ({emergency_access.user.first_name} {emergency_access.user.last_name})
Patient: {patient_info}
Reason: {emergency_access.get_reason_display()}
Details: {emergency_access.reason_details}
Requested At: {emergency_access.requested_at.strftime("%Y-%m-%d %H:%M:%S")}
Expires At: {emergency_access.expires_at.strftime("%Y-%m-%d %H:%M:%S")}
Duration: {emergency_access.duration_minutes} minutes
IP Address: {emergency_access.ip_address or "Unknown"}

ACTION REQUIRED:
- Review this emergency access request
- Verify the justification is appropriate
- Approve or revoke as needed

Review at: {getattr(settings, "SITE_URL", "http://localhost")}/admin/emergency-access/{emergency_access.id}/

---
Vitora HMIS - Emergency Access Monitoring
This is an automated alert. Do not reply to this email.
"""

    sms_message = f"🚨 VITORA ALERT: Emergency access by {emergency_access.user.username}. Reason: {emergency_access.reason}. Review required."

    emails_sent = 0
    sms_sent = 0
    errors = []

    # Send emails
    admin_emails = list(admins.exclude(email="").values_list("email", flat=True))
    if admin_emails:
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=admin_emails,
                fail_silently=False,
            )
            emails_sent = len(admin_emails)
            logger.info(f"Sent emergency access escalation email to {emails_sent} admins")
        except Exception as e:
            logger.exception(f"Failed to send escalation email: {e}")
            errors.append(f"Email: {str(e)}")
    else:
        logger.warning("No admin emails configured for emergency access escalation")

    # Send SMS (if configured)
    if getattr(settings, "AT_USERNAME", None) and getattr(settings, "AT_API_KEY", None):
        try:
            sms_gateway = SMSGateway()
            # Get admin phone numbers from staff profiles
            admin_phones = list(
                admins.exclude(staffprofile__phone_number="")
                .exclude(staffprofile__phone_number__isnull=True)
                .values_list("staffprofile__phone_number", flat=True)
            )
            for phone in admin_phones:
                try:
                    sms_gateway.send_reminder(phone, sms_message)
                    sms_sent += 1
                except Exception as e:
                    logger.warning(f"Failed to send SMS to {phone}: {e}")
            if sms_sent:
                logger.info(f"Sent emergency access escalation SMS to {sms_sent} admins")
        except Exception as e:
            logger.exception(f"Failed to initialize SMS gateway: {e}")
            errors.append(f"SMS: {str(e)}")

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
        logger.info(f"Expired {expired_count} emergency access records")

    return {"expired_count": expired_count}
