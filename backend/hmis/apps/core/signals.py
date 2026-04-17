"""
Signal handlers for core app.

These signals handle automatic audit logging when certain events occur.
Publishes domain events for cross-cutting observability.
"""

import logging

from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from hmis.apps.core.events import ClinicalEvents, CoreEvents, OrganizationEvents, publish_event

logger = logging.getLogger(__name__)


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

    publish_event(
        event_type=CoreEvents.USER_LOGGED_IN,
        aggregate_type="User",
        aggregate_id=user.id,
        payload={"username": user.username},
        user_id=user.id,
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

        publish_event(
            event_type=CoreEvents.USER_LOGGED_OUT,
            aggregate_type="User",
            aggregate_id=user.id,
            payload={"username": user.username},
            user_id=user.id,
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
# Unique Email Enforcement (application-level)
# =============================================================================


@receiver(pre_save, sender="auth.User")
def enforce_unique_email(sender, instance, **kwargs):
    """Reject saving a User with a duplicate non-empty email.

    This complements the DB-level partial unique index added in migration
    0034 and ensures uniqueness even when --no-migrations is used (tests).
    """
    if not instance.email:
        return

    from django.contrib.auth import get_user_model

    User = get_user_model()
    qs = User.objects.filter(email__iexact=instance.email)
    if instance.pk:
        qs = qs.exclude(pk=instance.pk)
    if qs.exists():
        from django.core.exceptions import ValidationError

        raise ValidationError({"email": "A user with this email already exists."})


# =============================================================================
# ActivityFeed Signals - Populate dashboard activity feed
# =============================================================================


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

        publish_event(
            event_type=CoreEvents.PATIENT_CREATED,
            aggregate_type="Patient",
            aggregate_id=instance.id,
            payload={"mrn": instance.mrn},
            user_id=getattr(getattr(instance, "registered_by", None), "id", None),
            facility_id=getattr(instance, "facility_id", None),
            organization_id=getattr(instance, "organization_id", None),
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

        publish_event(
            event_type=ClinicalEvents.ENCOUNTER_CREATED,
            aggregate_type="Encounter",
            aggregate_id=instance.id,
            payload={
                "encounter_type": instance.encounter_type,
                "patient_id": instance.patient_id,
            },
            user_id=getattr(getattr(instance, "created_by", None), "id", None),
            facility_id=getattr(instance, "facility_id", None),
            organization_id=getattr(instance, "organization_id", None),
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


# ---------------------------------------------------------------------------
# Department head → auto-assign department + supervisor role
# ---------------------------------------------------------------------------


@receiver(post_save, sender="core.Department")
def auto_assign_department_head(sender, instance, **kwargs):
    """When a department head is assigned, auto-add the department and SUPERVISOR role.

    - Adds the department to the staff's secondary_departments (if not their primary).
    - Adds the SUPERVISOR role to the staff's secondary_roles (if not their primary).
    """
    if not instance.head_id:
        return

    from .models import Role

    staff = instance.head

    # Add department as secondary (skip if it's already the primary)
    if staff.primary_department_id != instance.pk:
        staff.secondary_departments.add(instance)

    # Add SUPERVISOR role to secondary_roles
    supervisor_role = Role.objects.filter(code="SUPERVISOR", is_active=True).first()
    if supervisor_role and staff.primary_role_id != supervisor_role.pk:
        staff.secondary_roles.add(supervisor_role)

    # Auto-set the department head as supervisor for all staff in that department
    from .models import StaffProfile

    StaffProfile.objects.filter(
        primary_department=instance,
    ).exclude(pk=staff.pk).update(supervisor=staff)


# ---------------------------------------------------------------------------
# Supervisor FK changed → auto-assign SUPERVISOR role to the supervisor
# ---------------------------------------------------------------------------


@receiver(pre_save, sender="core.StaffProfile")
def track_supervisor_change(sender, instance, **kwargs):
    """Stash the old supervisor_id so post_save can detect changes."""
    if instance.pk:
        try:
            old = sender.objects.only("supervisor_id").get(pk=instance.pk)
            instance._old_supervisor_id = old.supervisor_id
        except sender.DoesNotExist:
            instance._old_supervisor_id = None
    else:
        instance._old_supervisor_id = None


@receiver(post_save, sender="core.StaffProfile")
def auto_supervisor_role(sender, instance, created, **kwargs):
    """When a staff member is assigned as someone's supervisor, grant them the SUPERVISOR role."""
    old_supervisor_id = getattr(instance, "_old_supervisor_id", None)

    if created or instance.supervisor_id == old_supervisor_id:
        return  # no change

    if not instance.supervisor_id:
        return  # supervisor was cleared, nothing to grant

    from .models import Role

    supervisor_profile = instance.supervisor
    supervisor_role = Role.objects.filter(code="SUPERVISOR", is_active=True).first()
    if supervisor_role and supervisor_profile.primary_role_id != supervisor_role.pk:
        supervisor_profile.secondary_roles.add(supervisor_role)


# ---------------------------------------------------------------------------
# Organization lifecycle events (activation / deactivation)
# ---------------------------------------------------------------------------


@receiver(pre_save, sender="core.Organization")
def stash_org_active_flag(sender, instance, **kwargs):
    """Stash the old is_active value so post_save can detect activation changes."""
    if instance.pk:
        try:
            old = sender.objects.only("is_active").get(pk=instance.pk)
            instance._old_is_active = old.is_active
        except sender.DoesNotExist:
            instance._old_is_active = None
    else:
        instance._old_is_active = None


@receiver(post_save, sender="core.Organization")
def publish_org_activation_event(sender, instance, created, **kwargs):
    """Publish ACTIVATED / DEACTIVATED event when Organization.is_active changes."""
    if created:
        return  # signup event is published explicitly in auth_views

    old_active = getattr(instance, "_old_is_active", None)
    if old_active is None or old_active == instance.is_active:
        return  # no change

    event_type = (
        OrganizationEvents.ORG_ACTIVATED
        if instance.is_active
        else OrganizationEvents.ORG_DEACTIVATED
    )
    publish_event(
        event_type=event_type,
        aggregate_type="Organization",
        aggregate_id=instance.id,
        payload={
            "org_name": instance.name,
            "slug": instance.slug,
            "is_active": instance.is_active,
            "is_verified": instance.is_verified,
        },
        organization_id=instance.id,
    )

    # Notify the org admin that their organization is now active.
    if instance.is_active:
        from hmis.apps.core.services.email_service import send_org_activated_email

        try:
            admin_profile = instance.staff_profiles.select_related("user").order_by("id").first()
            if admin_profile and admin_profile.user.email:
                send_org_activated_email(
                    to_email=admin_profile.user.email,
                    org_name=instance.name,
                    admin_name=admin_profile.user.get_full_name() or admin_profile.user.username,
                )
        except Exception:
            logger.exception("Failed to send org-activated email for org %s", instance.pk)
