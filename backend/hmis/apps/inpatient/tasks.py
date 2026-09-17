# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Celery tasks for Inpatient module.

Provides background tasks for supervisor notifications on critical violations.
"""

import logging

from celery import shared_task
from django.contrib.auth import get_user_model
from django.db.models import Q

from hmis.apps.core.services.email_service import send_transactional_email

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
        logger.error("Admission %s not found for critical violation notification", admission_id)
        return {"status": "error", "message": f"Admission {admission_id} not found"}

    facility = admission.facility or admission.ward.facility
    # Restrict recipients to staff assigned to the admission facility. Permissions
    # can be granted directly or through a same-tenant Django group.
    supervisors = (
        User.objects.filter(
            is_active=True,
            email__isnull=False,
        )
        .exclude(email="")
        .filter(
            Q(staff_profile__primary_facility=facility)
            | Q(staff_profile__secondary_facilities=facility)
        )
        .filter(
            Q(user_permissions__codename="receive_critical_alerts")
            | Q(groups__permissions__codename="receive_critical_alerts")
        )
        .distinct()
    )

    if not supervisors.exists():
        logger.warning(
            "No supervisors with receive_critical_alerts permission found for admission %s",
            admission_id,
        )
        return {"status": "warning", "message": "No supervisors to notify", "emails_sent": 0}

    # Get critical violations only
    critical_violations = [
        v for v in admission.constraint_violations if v.get("severity") == "CRITICAL"
    ]

    if not critical_violations:
        logger.info("Admission %s has no CRITICAL violations, skipping notification", admission_id)
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
Admitted By: {admitted_by.get_full_name() if admitted_by else "Unknown"}
Admission Date: {admission.admission_date.strftime("%Y-%m-%d %H:%M")}

CRITICAL VIOLATIONS:
{violation_details}

Override Reason Given:
{admission.constraint_override_reason or "None provided"}

This admission requires your immediate review. Please verify the placement is clinically
appropriate or coordinate a transfer to an appropriate ward.

---
Vitora HMIS - Nexora Consulting Ltd
This is an automated notification. Do not reply to this email.
"""

    try:
        for supervisor in supervisors:
            result = send_transactional_email(
                subject=subject,
                html_body=message.replace("\n", "<br>"),
                to_email=supervisor.email,
                facility=facility,
            )
            if not result.get("accepted", False):
                raise RuntimeError(
                    "Critical ward violation email was not accepted by the provider."
                )
        logger.info(
            "Sent critical violation email for admission %s to %s supervisors",
            admission_id,
            supervisors.count(),
        )
        return {"status": "success", "emails_sent": supervisors.count()}
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ) as e:
        logger.exception("Failed to send critical violation email: %s", e)
        raise  # Let Celery retry
