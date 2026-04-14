"""
Django signals for the counselling module.

Handles:
- Clinic queue integration: Auto-route patients to counselling clinic
- Session completion: Auto-create billing items
- Mental health integration: Link to mental health encounters
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.counselling.models import CounsellingReferral, CounsellingSession

logger = logging.getLogger(__name__)


@receiver(post_save, sender=CounsellingReferral)
def route_to_counselling_clinic_on_acceptance(sender, instance, created, **kwargs):
    """
    Route patient to Counselling clinic queue when referral is accepted.

    This signal creates a clinic visit entry for queue management
    when a counselling referral is accepted.
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

        # Find counselling clinic - prefer by clinic_type first
        counselling_clinic = Clinic.objects.filter(
            clinic_type="COUNSELLING",
            status="ACTIVE",
        ).first()

        if not counselling_clinic:
            # Try mental health clinic for mental health referrals
            if hasattr(instance, "is_mental_health_related") and instance.is_mental_health_related:
                counselling_clinic = Clinic.objects.filter(
                    clinic_type="MENTAL_HEALTH",
                    status="ACTIVE",
                ).first()

        if not counselling_clinic:
            # Fall back to name-based lookup
            counselling_clinic = Clinic.objects.filter(
                name__icontains="Counselling",
                status__in=["ACTIVE", "active"],
            ).first()

        if not counselling_clinic:
            # Try alternate names
            counselling_clinic = Clinic.objects.filter(
                name__icontains="Counseling",  # US spelling
                status__in=["ACTIVE", "active"],
            ).first()

        if not counselling_clinic:
            # Try psychology clinic
            counselling_clinic = Clinic.objects.filter(
                name__icontains="Psychology",
                status__in=["ACTIVE", "active"],
            ).first()

        if not counselling_clinic:
            logger.info(
                f"No Counselling clinic found for referral {instance.referral_number}. "
                f"Patient will need to be manually routed."
            )
            return

        # Find an active clinic session for today
        today = date_module.today()
        clinic_session = ClinicSession.objects.filter(
            clinic=counselling_clinic,
            date=today,
            is_active=True,
        ).first()

        if not clinic_session:
            # Try to get or create a session for today
            clinic_session = counselling_clinic.get_current_session()

        if not clinic_session:
            logger.info(
                f"No active counselling clinic session for today. "
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

        # Adjust priority for certain referral reasons
        if hasattr(instance, "reason") and instance.reason in ["SUICIDAL", "GBV"]:
            priority = "EMERGENCY"  # Always highest priority

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
            chief_complaint=f"Counselling Referral: {reason_display}",
            notes=f"Counselling Referral: {instance.referral_number}\n"
            f"Reason: {reason_display}\n"
            f"Urgency: {urgency_display}",
        )

        # Link to referral
        instance.clinic_visit = clinic_visit
        instance.save(update_fields=["clinic_visit"])

        logger.info(
            f"Created clinic visit {clinic_visit.id} for counselling referral {instance.referral_number} "
            f"(Clinic: {counselling_clinic.name})"
        )

    except Exception as e:
        logger.error(
            f"Failed to create clinic visit for counselling referral {instance.referral_number}: {e}"
        )


@receiver(post_save, sender=CounsellingReferral)
def notify_urgent_referral(sender, instance, created, **kwargs):
    """
    Send notification for urgent/emergency referrals.

    This signal creates notifications for counselling staff
    when urgent referrals are created.
    """
    if not created:
        return

    if (
        instance.urgency not in ["URGENT", "EMERGENCY"]
        and not instance.requires_immediate_attention
    ):
        return

    # Log the urgent referral for monitoring
    logger.warning(
        f"URGENT counselling referral created: {instance.referral_number} - "
        f"Patient: {instance.patient.mrn} - "
        f"Reason: {instance.get_reason_display()} - "
        f"Urgency: {instance.get_urgency_display()}"
    )

    # TODO: Implement notification system integration
    # This would typically send:
    # - SMS/Email to on-call counsellors
    # - WebSocket notification to dashboard
    # - Push notification to mobile app


@receiver(post_save, sender=CounsellingSession)
def create_billing_item_on_session_completion(sender, instance, created, **kwargs):
    """
    Create billing invoice item when a counselling session is completed.

    This signal auto-generates billing entries for completed sessions
    linked to the patient's invoice.
    """
    # Only process completed sessions that haven't been billed
    if instance.status != "COMPLETED" or instance.is_billed:
        return

    # Check if referral has a counselling type with cost
    referral = instance.referral
    if not referral.counselling_type:
        return

    counselling_type = referral.counselling_type
    if counselling_type.cost_per_session <= 0:
        return

    try:
        from hmis.apps.billing.models import Invoice, InvoiceItem

        # Find or create invoice for the patient
        invoice = Invoice.objects.filter(
            patient=referral.patient,
            status="draft",
        ).first()

        if not invoice:
            # Create new invoice - find a system/staff user for created_by
            from django.contrib.auth import get_user_model

            User = get_user_model()
            system_user = (
                instance.therapist
                or referral.referred_by
                or User.objects.filter(is_staff=True).first()
            )
            invoice = Invoice.objects.create(
                patient=referral.patient,
                status="draft",
                created_by=system_user,
            )

        # Create invoice item
        InvoiceItem.objects.create(
            invoice=invoice,
            description=f"Counselling Session - {counselling_type.name}",
            quantity=1,
            unit_price=counselling_type.cost_per_session,
            item_type="service",
        )

        # Mark session as billed
        instance.is_billed = True
        instance.save(update_fields=["is_billed"])

        # Link invoice to referral if not already linked
        if not referral.invoice:
            referral.invoice = invoice
            referral.save(update_fields=["invoice"])

        logger.info(
            f"Created billing item for counselling session {instance.session_number} - "
            f"Amount: KES {counselling_type.cost_per_session}"
        )

    except Exception as e:
        logger.error(
            f"Failed to create billing item for counselling session {instance.session_number}: {e}"
        )


@receiver(post_save, sender=CounsellingSession)
def create_clinic_visit_for_session(sender, instance, created, **kwargs):
    """
    Create clinic visit for scheduled counselling sessions.

    This enables queue management for individual sessions.
    """
    if not created:
        return

    if instance.status != "SCHEDULED":
        return

    if instance.clinic_visit:
        return

    try:
        from hmis.apps.clinics.models import Clinic, ClinicVisit

        # Find counselling clinic
        counselling_clinic = Clinic.objects.filter(
            name__icontains="Counselling",
            status="active",
        ).first()

        if not counselling_clinic:
            counselling_clinic = Clinic.objects.filter(
                name__icontains="Counseling",
                status="active",
            ).first()

        if not counselling_clinic:
            return  # No clinic available

        # Create clinic visit for the session
        clinic_visit = ClinicVisit.objects.create(
            patient=instance.referral.patient,
            clinic=counselling_clinic,
            visit_type="follow_up",
            status="scheduled",
            scheduled_date=instance.scheduled_date,
            scheduled_time=instance.scheduled_time,
            priority=5,  # Normal priority for regular sessions
            notes=f"Counselling Session {instance.session_sequence} - "
            f"Referral: {instance.referral.referral_number}",
            created_by=instance.counsellor,
        )

        instance.clinic_visit = clinic_visit
        instance.save(update_fields=["clinic_visit"])

        logger.info(f"Created clinic visit for counselling session {instance.session_number}")

    except Exception as e:
        logger.error(
            f"Failed to create clinic visit for counselling session {instance.session_number}: {e}"
        )


@receiver(post_save, sender=CounsellingSession)
def alert_high_risk_session(sender, instance, **kwargs):
    """
    Generate alerts for high-risk counselling sessions.

    This signal monitors risk levels and triggers appropriate responses.
    """
    if instance.risk_level not in ["HIGH", "IMMINENT"]:
        return

    logger.critical(
        f"HIGH RISK ALERT - Counselling Session {instance.session_number}: "
        f"Patient: {instance.referral.patient.mrn} - "
        f"Risk Level: {instance.risk_level} - "
        f"Counsellor: {instance.counsellor.username if instance.counsellor else 'Unknown'}"
    )

    # TODO: Implement alert system integration
    # For imminent risk:
    # - Page supervisor/psychiatrist
    # - Create emergency intervention record
    # - Notify security if needed
