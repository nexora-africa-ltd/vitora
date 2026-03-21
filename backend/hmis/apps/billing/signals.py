"""
Billing signals for Vitora HMIS.

This module contains Django signals for billing integration:
- Auto-create draft invoice when encounter is created
- Auto-finalize invoice and create SHA claim on discharge
- Auto-bill admission fee on inpatient admission
- Update invoice totals when items are added/modified
"""

import logging

from datetime import date, timedelta

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.billing.models import Invoice
from hmis.apps.encounters.models import Encounter

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Encounter)
def create_invoice_for_encounter(sender, instance, created, **kwargs):
    """
    Auto-create a draft invoice when an encounter is created.

    Business Rules:
    1. Only create invoice for new encounters
    2. Reuse existing draft invoice for the same patient from today
    3. Link the invoice to the encounter
    """
    if not created:
        return

    # Check if patient already has a draft invoice from today
    existing_invoice = Invoice.objects.filter(
        patient=instance.patient,
        invoice_date=date.today(),
        status=Invoice.Status.DRAFT,
        encounter__isnull=True,  # Not linked to another encounter
    ).first()

    if existing_invoice:
        # Link existing invoice to this encounter
        existing_invoice.encounter = instance
        existing_invoice.save(update_fields=["encounter", "updated_at"])
    else:
        # Create new draft invoice for the encounter
        # Get or create a system user for auto-created invoices
        from django.contrib.auth import get_user_model

        User = get_user_model()

        # Try to get the system user or first superuser
        system_user, _ = User.objects.get_or_create(
            username="system",
            defaults={
                "email": "system@vitora.local",
                "is_active": True,
            },
        )
        if not system_user:
            # Create a system user if none exists
            system_user = User.objects.create_user(
                username="system",
                email="system@vitora.local",
                is_active=True,
            )

        Invoice.objects.create(
            patient=instance.patient,
            encounter=instance,
            invoice_date=date.today(),
            due_date=date.today()
            + timedelta(days=getattr(settings, "BILLING_DEFAULT_DUE_DAYS", 30)),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=system_user,
        )


def handle_discharge_billing(sender, instance, created, **kwargs):
    """Auto-finalize invoice and create SHA claim on patient discharge."""
    if not created:
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_discharge(instance)
    except Exception:
        logger.exception(
            "Billing agent: discharge billing failed for discharge %s", instance.id
        )


def handle_admission_billing(sender, instance, created, **kwargs):
    """Auto-bill admission fee and first bed night on admission."""
    if not created:
        return

    try:
        from hmis.apps.billing.agent import BillingAgentService

        BillingAgentService.handle_admission_created(instance)
    except Exception:
        logger.exception(
            "Billing agent: admission billing failed for admission %s", instance.id
        )
