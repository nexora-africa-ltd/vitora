"""
Celery tasks for Inpatient module.

Provides background tasks for supervisor notifications on critical violations.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

User = get_user_model()


@shared_task(
    bind=True,
    name="hmis.apps.inpatient.tasks.notify_supervisors_critical_violation",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=3600,
    retry_jitter=True,
    max_retries=3,
)
def notify_supervisors_critical_violation(self, admission_id: int) -> dict:  # noqa: ARG001
    """
    Send email notifications to supervisors about a critical ward violation.

    This task is triggered when:
    - An admission is created with CRITICAL constraint violations overridden
    - e.g., Isolation-required patient placed in non-isolation ward

    Args:
        admission_id: ID of the Admission with critical violations

    Returns:
        dict: Result containing number of notifications sent
    """
    from hmis.apps.inpatient.models import Admission

    try:
        admission = Admission.objects.select_related(
            "patient", "ward", "bed", "admitting_officer"
        ).get(id=admission_id)
    except Admission.DoesNotExist:
        logger.error(f"Admission {admission_id} not found for critical violation notification")
        return {"status": "error", "message": f"Admission {admission_id} not found"}

    # Get all users with receive_critical_alerts permission
    supervisors = User.objects.filter(
        user_permissions__codename="receive_critical_alerts",
        is_active=True,
        email__isnull=False,
    ).exclude(email="").distinct()

    if not supervisors.exists():
        logger.warning(
            f"No supervisors with receive_critical_alerts permission found for admission {admission_id}"
        )
        return {"status": "warning", "message": "No supervisors to notify", "emails_sent": 0}

    # Get critical violations only
    critical_violations = [
        v for v in admission.constraint_violations if v.get("severity") == "CRITICAL"
    ]

    if not critical_violations:
        logger.info(f"Admission {admission_id} has no CRITICAL violations, skipping notification")
        return {"status": "skipped", "message": "No critical violations", "emails_sent": 0}

    # Build email content
    violation_details = "\n".join(
        f"  - {v.get('message', v.get('code'))}" for v in critical_violations
    )

    patient = admission.patient
    ward = admission.ward
    admitted_by = admission.admitting_officer

    subject = f"CRITICAL WARD VIOLATION: {patient.first_name} {patient.last_name} - {ward.name}"

    message = f"""
CRITICAL WARD COMPATIBILITY VIOLATION

Patient: {patient.first_name} {patient.last_name}
MRN: {patient.mrn}
Ward: {ward.name} ({ward.code})
Bed: {admission.bed.bed_number}
Admitted By: {admitted_by.get_full_name() if admitted_by else 'Unknown'}
Admission Date: {admission.admission_date.strftime('%Y-%m-%d %H:%M')}

CRITICAL VIOLATIONS:
{violation_details}

Override Reason Given:
{admission.constraint_override_reason or 'None provided'}

This admission requires your immediate review. Please verify the placement is clinically
appropriate or coordinate a transfer to an appropriate ward.

---
Vitora HMIS - Nexora Africa Ltd
This is an automated notification. Do not reply to this email.
"""

    # Collect supervisor emails
    supervisor_emails = list(supervisors.values_list("email", flat=True))

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=supervisor_emails,
            fail_silently=False,
        )
        logger.info(
            f"Sent critical violation email for admission {admission_id} to {len(supervisor_emails)} supervisors"
        )
        return {"status": "success", "emails_sent": len(supervisor_emails)}
    except Exception as e:
        logger.exception(f"Failed to send critical violation email: {e}")
        raise  # Let Celery retry
