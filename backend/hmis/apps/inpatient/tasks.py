# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Celery tasks for Inpatient module.

Provides background tasks for supervisor notifications on critical violations.
"""

import logging

from celery import shared_task
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.template import TemplateDoesNotExist, TemplateSyntaxError
from django.template.loader import render_to_string

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

    patient = admission.patient
    ward = admission.ward
    admitted_by = admission.admitting_officer

    subject = f"CRITICAL WARD VIOLATION: {patient.first_name} {patient.last_name} - {ward.name}"

    context = {
        "patient_name": f"{patient.first_name} {patient.last_name}",
        "patient_mrn": patient.mrn,
        "ward_name": ward.name,
        "ward_code": ward.code,
        "bed_number": admission.bed.bed_number,
        "admitted_by": admitted_by.get_full_name() if admitted_by else "Unknown",
        "admission_date": admission.admission_date.strftime("%Y-%m-%d %H:%M"),
        "violations": [v.get("message", v.get("code")) for v in critical_violations],
        "override_reason": admission.constraint_override_reason or "None provided",
    }
    text_body = render_to_string("inpatient/email/critical_ward_violation.txt", context)
    try:
        html_body = render_to_string("inpatient/email/critical_ward_violation.html", context)
    except (TemplateDoesNotExist, TemplateSyntaxError) as exc:
        # The plain-text template is a safe delivery fallback; provider failures still retry.
        logger.warning("Critical ward violation HTML template unavailable: %s", type(exc).__name__)
        html_body = text_body.replace("\n", "<br>")

    try:
        for supervisor in supervisors:
            result = send_transactional_email(
                subject=subject,
                html_body=html_body,
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
