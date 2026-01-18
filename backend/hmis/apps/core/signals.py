"""
Signal handlers for core app.

These signals handle automatic audit logging when certain events occur.
"""

from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver


@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    """Log successful user login."""
    from .models import AuditLog
    from .permissions import get_client_ip

    AuditLog.log(
        action="login_success",
        user=user,
        resource_type="User",
        resource_id=user.id,
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
        details={"username": user.username},
    )


@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    """Log user logout."""
    from .models import AuditLog
    from .permissions import get_client_ip

    if user:
        AuditLog.log(
            action="logout",
            user=user,
            resource_type="User",
            resource_id=user.id,
            ip_address=get_client_ip(request) if request else None,
            user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
            details={"username": user.username},
        )


@receiver(user_login_failed)
def log_user_login_failed(sender, credentials, request, **kwargs):
    """Log failed login attempt."""
    from .models import AuditLog
    from .permissions import get_client_ip

    AuditLog.log(
        action="login_failed",
        user=None,
        resource_type="User",
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
        details={"username": credentials.get("username", "unknown")},
    )


# =============================================================================
# ActivityFeed Signals - Populate dashboard activity feed
# =============================================================================

from django.db.models.signals import post_save


@receiver(post_save, sender="patients.Patient")
def patient_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when a patient is created."""
    if created:
        from .models import ActivityFeed

        ActivityFeed.log_activity(
            activity_type="patient",
            action="registered",
            title="New patient registered",
            description=f"{instance.first_name} {instance.last_name} ({instance.mrn})",
            user=getattr(instance, "registered_by", None),
            resource_type="Patient",
            resource_id=instance.id,
            metadata={
                "mrn": instance.mrn,
                "gender": instance.gender,
            },
        )


@receiver(post_save, sender="encounters.Encounter")
def encounter_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when an encounter is created."""
    if created:
        from .models import ActivityFeed

        patient_name = (
            f"{instance.patient.first_name} {instance.patient.last_name}"
            if instance.patient
            else "Unknown"
        )
        ActivityFeed.log_activity(
            activity_type="encounter",
            action="started",
            title=f"{instance.encounter_type} encounter started",
            description=f"Patient: {patient_name}",
            user=getattr(instance, "created_by", None),
            resource_type="Encounter",
            resource_id=instance.id,
            metadata={
                "encounter_type": instance.encounter_type,
                "patient_mrn": instance.patient.mrn if instance.patient else None,
            },
        )


@receiver(post_save, sender="triage.TriageAssessment")
def triage_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when triage assessment is completed."""
    # Only log when triage is completed (not on creation)
    if getattr(instance, "status", None) == "COMPLETED":
        from .models import ActivityFeed

        # Check if we already logged this completion (avoid duplicates)
        existing = ActivityFeed.objects.filter(
            resource_type="TriageAssessment",
            resource_id=instance.id,
            action="completed",
        ).exists()

        if existing:
            return

        patient_name = "Unknown"
        if hasattr(instance, "encounter") and instance.encounter and instance.encounter.patient:
            patient = instance.encounter.patient
            patient_name = f"{patient.first_name} {patient.last_name}"

        category = getattr(instance, "category", None) or "Unclassified"
        ActivityFeed.log_activity(
            activity_type="triage",
            action="completed",
            title=f"Triage completed: {category}",
            description=f"Patient: {patient_name}",
            user=getattr(instance, "assessed_by", None),
            resource_type="TriageAssessment",
            resource_id=instance.id,
            metadata={
                "category": category,
                "status": "COMPLETED",
            },
        )


@receiver(post_save, sender="laboratory.LabOrder")
def lab_order_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when lab order is created."""
    if created:
        from .models import ActivityFeed

        patient_name = "Unknown"
        if hasattr(instance, "encounter") and instance.encounter and instance.encounter.patient:
            patient = instance.encounter.patient
            patient_name = f"{patient.first_name} {patient.last_name}"

        ActivityFeed.log_activity(
            activity_type="lab",
            action="ordered",
            title="Lab test ordered",
            description=f"Patient: {patient_name}",
            user=getattr(instance, "ordered_by", None),
            resource_type="LabOrder",
            resource_id=instance.id,
        )


@receiver(post_save, sender="pharmacy.Prescription")
def prescription_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when prescription is created."""
    if created:
        from .models import ActivityFeed

        patient_name = "Unknown"
        if hasattr(instance, "encounter") and instance.encounter and instance.encounter.patient:
            patient = instance.encounter.patient
            patient_name = f"{patient.first_name} {patient.last_name}"

        ActivityFeed.log_activity(
            activity_type="pharmacy",
            action="prescribed",
            title="Prescription created",
            description=f"Patient: {patient_name}",
            user=getattr(instance, "prescribed_by", None),
            resource_type="Prescription",
            resource_id=instance.id,
        )


@receiver(post_save, sender="billing.Payment")
def payment_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when payment is received."""
    if created and getattr(instance, "status", None) == "COMPLETED":
        from .models import ActivityFeed

        ActivityFeed.log_activity(
            activity_type="billing",
            action="payment_received",
            title="Payment received",
            description=f"KES {instance.amount:,.0f}",
            user=getattr(instance, "received_by", None),
            resource_type="Payment",
            resource_id=instance.id,
            metadata={
                "amount": float(instance.amount),
                "payment_method": getattr(instance, "payment_method", None),
            },
        )


@receiver(post_save, sender="billing.Invoice")
def invoice_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when invoice is created."""
    if created:
        from .models import ActivityFeed

        patient_name = "Unknown"
        if hasattr(instance, "patient") and instance.patient:
            patient_name = f"{instance.patient.first_name} {instance.patient.last_name}"

        total = getattr(instance, "total_amount", 0) or 0
        ActivityFeed.log_activity(
            activity_type="billing",
            action="invoiced",
            title="Invoice generated",
            description=f"Patient: {patient_name} - KES {total:,.0f}",
            user=getattr(instance, "created_by", None),
            resource_type="Invoice",
            resource_id=instance.id,
            metadata={
                "total_amount": float(total),
            },
        )


@receiver(post_save, sender="pharmacy.StockAlert")
def stock_alert_activity_signal(sender, instance, created, **kwargs):
    """Create activity feed entry when stock alert is created."""
    if created:
        from .models import ActivityFeed

        item_name = "Unknown item"
        if hasattr(instance, "item") and instance.item:
            item_name = instance.item.name

        ActivityFeed.log_activity(
            activity_type="inventory",
            action="alert",
            title=f"Stock alert: {getattr(instance, 'alert_type', 'LOW_STOCK')}",
            description=item_name,
            user=None,
            resource_type="StockAlert",
            resource_id=instance.id,
            metadata={
                "alert_type": getattr(instance, "alert_type", None),
                "severity": getattr(instance, "severity", None),
            },
        )
