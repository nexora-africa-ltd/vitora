"""
Django signals for the social work module.

Handles:
- Clinic queue integration: Auto-route patients to social work clinic
- Referral notifications for urgent cases
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.social_work.models import SocialWorkCase, SocialWorkReferral

logger = logging.getLogger(__name__)


@receiver(post_save, sender=SocialWorkReferral)
def route_to_sw_clinic_on_acceptance(sender, instance, created, **kwargs):
    """
    Route patient to Social Work clinic queue when referral is accepted.

    This signal creates a clinic visit entry for queue management
    when a social work referral is accepted.
    """
    # Only process when status changes to ACCEPTED
    if instance.status != "ACCEPTED" or not instance.accepted_at:
        return

    # Check if already has a clinic visit
    if instance.clinic_visit:
        return

    try:
        from datetime import date as date_module

        from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit

        # Find social work clinic - prefer by clinic_type first
        sw_clinic = Clinic.objects.filter(
            clinic_type="SOCIAL_WORK",
            status="ACTIVE",
        ).first()

        if not sw_clinic:
            # Fall back to name-based lookup
            sw_clinic = Clinic.objects.filter(
                name__icontains="Social Work",
                status__in=["ACTIVE", "active"],
            ).first()

        if not sw_clinic:
            # Try alternate names
            sw_clinic = Clinic.objects.filter(
                name__icontains="Social Services",
                status__in=["ACTIVE", "active"],
            ).first()

        if not sw_clinic:
            logger.info(
                f"No Social Work clinic found for referral {instance.referral_number}. "
                f"Patient will need to be manually routed."
            )
            return

        # Find an active clinic session for today
        today = date_module.today()
        clinic_session = ClinicSession.objects.filter(
            clinic=sw_clinic,
            date=today,
            is_active=True,
        ).first()

        if not clinic_session:
            # Try to get or create a session for today
            clinic_session = sw_clinic.get_current_session()

        if not clinic_session:
            logger.info(
                f"No active social work clinic session for today. "
                f"Referral {instance.referral_number} will need manual scheduling."
            )
            return

        # Set priority based on urgency
        priority_map = {
            "EMERGENCY": "EMERGENCY",
            "URGENT": "URGENT",
            "ROUTINE": "STANDARD",
        }
        priority = priority_map.get(instance.urgency, "STANDARD")

        reason_display = (
            instance.get_reason_display()
            if hasattr(instance, "get_reason_display")
            else str(instance.reason)
        )
        urgency_display = (
            instance.get_urgency_display()
            if hasattr(instance, "get_urgency_display")
            else str(instance.urgency)
        )

        clinic_visit = ClinicVisit.objects.create(
            session=clinic_session,
            patient=instance.patient,
            visit_type="REFERRAL",
            source="REFERRAL",
            priority=priority,
            queue_number=clinic_session.visits.count() + 1,
            chief_complaint=f"Social Work Referral: {reason_display}",
            notes=f"Social Work Referral: {instance.referral_number}\n"
            f"Reason: {reason_display}\n"
            f"Urgency: {urgency_display}",
        )

        # Link to referral
        instance.clinic_visit = clinic_visit
        instance.save(update_fields=["clinic_visit"])

        logger.info(
            f"Created clinic visit {clinic_visit.id} for SW referral {instance.referral_number} "
            f"(Clinic: {sw_clinic.name})"
        )

    except Exception as e:
        logger.error(
            f"Failed to create clinic visit for SW referral {instance.referral_number}: {e}"
        )


@receiver(post_save, sender=SocialWorkReferral)
def notify_urgent_referral(sender, instance, created, **kwargs):
    """
    Send notification for urgent/emergency referrals.

    This signal creates notifications for social work staff
    when urgent referrals are created.
    """
    if not created:
        return

    # Only notify for urgent/emergency referrals
    if instance.urgency not in ["URGENT", "EMERGENCY"]:
        return

    try:
        from hmis.apps.core.models import Notification

        # Only create notification if there's an assigned worker
        if not instance.assigned_worker_id:
            logger.info(
                f"No assigned worker for SW referral {instance.referral_number}. "
                f"Skipping notification."
            )
            return

        # Create notification for social work staff
        Notification.objects.create(
            title=f"{'🚨 EMERGENCY' if instance.urgency == 'EMERGENCY' else '⚠️ Urgent'} Social Work Referral",
            message=(
                f"New {instance.get_urgency_display()} referral for "
                f"{instance.patient.first_name} {instance.patient.last_name} ({instance.patient.mrn})\n"
                f"Reason: {instance.get_reason_display()}\n"
                f"Referral #: {instance.referral_number}"
            ),
            notification_type="alert" if instance.urgency == "EMERGENCY" else "warning",
            user=instance.assigned_worker,  # Will be None if unassigned
            related_model="social_work.SocialWorkReferral",
            related_id=instance.id,
        )

        logger.info(f"Created notification for urgent SW referral {instance.referral_number}")

    except Exception as e:
        logger.error(
            f"Failed to create notification for SW referral {instance.referral_number}: {e}"
        )


@receiver(post_save, sender=SocialWorkCase)
def mark_patient_sensitive_for_gbv(sender, instance, created, **kwargs):
    """
    Ensure patient is marked as sensitive for GBV/abuse cases.

    This provides an additional safety net beyond the model's save() method.
    """
    if not instance.is_sensitive:
        return

    try:
        patient = instance.patient
        if not patient.is_sensitive:
            patient.is_sensitive = True
            patient.save(update_fields=["is_sensitive"])
            logger.info(
                f"Marked patient {patient.mrn} as sensitive due to SW case {instance.case_number}"
            )
    except Exception as e:
        logger.error(f"Failed to mark patient as sensitive for case {instance.case_number}: {e}")


@receiver(post_save, sender=SocialWorkCase)
def notify_case_review_due(sender, instance, **kwargs):
    """
    Create notification when case review is due soon.

    Note: This would typically be run by a Celery task on a schedule,
    but is included here as a placeholder for the pattern.
    """
    from datetime import date, timedelta

    if not instance.next_review_date:
        return

    # Notify if review is due within 3 days
    if instance.next_review_date <= date.today() + timedelta(days=3):
        try:
            from hmis.apps.core.models import Notification

            if instance.assigned_worker:
                Notification.objects.get_or_create(
                    user=instance.assigned_worker,
                    related_model="social_work.SocialWorkCase",
                    related_id=instance.id,
                    defaults={
                        "title": "Case Review Due",
                        "message": f"Case {instance.case_number} review is due on {instance.next_review_date}",
                        "notification_type": "reminder",
                    },
                )
        except Exception as e:
            logger.error(f"Failed to create review reminder for case {instance.case_number}: {e}")
