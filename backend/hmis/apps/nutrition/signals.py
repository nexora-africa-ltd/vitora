"""
Django signals for the nutrition module.

Handles:
- Billing integration: Auto-create invoice items when consultations are completed
- Clinic queue integration: Auto-route patients to nutrition clinic
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.nutrition.models import NutritionConsultation

logger = logging.getLogger(__name__)


@receiver(post_save, sender=NutritionConsultation)
def create_invoice_item_for_completed_consultation(sender, instance, created, **kwargs):
    """
    Create invoice item when a nutrition consultation is completed.

    This signal creates a billing invoice item for completed consultations,
    linking the nutrition service to the patient's invoice.
    """
    # Only process completed consultations that haven't been billed
    if instance.status != "COMPLETED" or instance.invoice:
        return

    try:
        from hmis.apps.billing.models import Invoice, InvoiceItem, Service

        # Get or create invoice for the encounter/patient
        # Try to find an existing draft/pending invoice for this patient
        invoice = Invoice.objects.filter(
            patient=instance.patient,
            status__in=["draft", "pending", "proforma"],
        ).first()

        if not invoice:
            # No existing invoice - skip billing (will be handled manually)
            logger.info(
                f"No invoice found for nutrition consultation {instance.consultation_number}. "
                f"Billing will need to be done manually."
            )
            return

        # Find nutrition service
        service = Service.objects.filter(
            code__icontains="NUT",
            is_active=True,
        ).first()

        if not service:
            # Try to find a general nutrition service
            service = Service.objects.filter(
                name__icontains="Nutrition",
                is_active=True,
            ).first()

        # Determine price (could be from service or a default consultation fee)
        unit_price = service.price if service and hasattr(service, "price") else Decimal("500.00")

        # Create invoice item
        invoice_item = InvoiceItem.objects.create(
            invoice=invoice,
            service=service,
            description=f"Nutrition Consultation - {instance.consultation_number}",
            quantity=1,
            unit_price=unit_price,
        )

        # Link invoice to consultation
        instance.invoice = invoice
        instance.save(update_fields=["invoice"])

        # Recalculate invoice totals
        invoice.calculate_totals()

        logger.info(
            f"Created invoice item {invoice_item.id} for nutrition consultation "
            f"{instance.consultation_number}"
        )

    except ImportError:
        logger.warning("Billing module not available. Skipping invoice item creation.")
    except Exception as e:
        logger.error(f"Error creating invoice item for nutrition consultation: {e}")


@receiver(post_save, sender=NutritionConsultation)
def route_to_nutrition_clinic(sender, instance, created, **kwargs):
    """
    Route patient to nutrition clinic when consultation is created/approved.

    This integrates with the clinic queue system to manage patient flow.
    """
    if not created:
        return

    try:
        from datetime import date as date_module

        from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit

        # Find nutrition clinic - prefer by clinic_type first
        nutrition_clinic = Clinic.objects.filter(
            clinic_type="NUTRITION",
            status="ACTIVE",
        ).first()

        if not nutrition_clinic:
            # Fall back to code-based lookup
            nutrition_clinic = Clinic.objects.filter(
                code__icontains="NUT",
                status__in=["ACTIVE", "active"],
            ).first()

        if not nutrition_clinic:
            # Fall back to name-based lookup
            nutrition_clinic = Clinic.objects.filter(
                name__icontains="Nutrition",
                status__in=["ACTIVE", "active"],
            ).first()

        if not nutrition_clinic:
            logger.info(
                f"No nutrition clinic found for consultation {instance.consultation_number}."
            )
            return

        # Link to clinic visit if not already linked
        if not instance.clinic_visit:
            # Find an active clinic session for today
            today = date_module.today()
            clinic_session = ClinicSession.objects.filter(
                clinic=nutrition_clinic,
                session_date=today,
                status="OPEN",
            ).first()

            if not clinic_session:
                # Try to get or create a session for today
                clinic_session = nutrition_clinic.get_current_session()

            if not clinic_session:
                logger.info(
                    f"No active nutrition clinic session for today. "
                    f"Consultation {instance.consultation_number} will need manual scheduling."
                )
                return

            # Get or create a clinic visit for this consultation
            clinic_visit, created = ClinicVisit.objects.get_or_create(
                session=clinic_session,
                patient=instance.patient,
                defaults={
                    "visit_type": "REFERRAL",
                    "source": "REFERRAL",
                    "priority": (
                        "STANDARD"
                        if not instance.priority or instance.priority == "ROUTINE"
                        else "URGENT"
                    ),
                    "queue_number": clinic_session.visits.count() + 1,
                    "chief_complaint": f"Nutrition referral: {instance.referral_reason}",
                    "notes": f"Nutrition consultation: {instance.consultation_number}",
                },
            )
            instance.clinic_visit = clinic_visit
            instance.save(update_fields=["clinic_visit"])

            logger.info(
                f"Created clinic visit {clinic_visit.id} for nutrition consultation "
                f"{instance.consultation_number}"
            )

    except ImportError:
        logger.warning("Clinics module not available. Skipping clinic queue routing.")
    except Exception as e:
        logger.error(f"Error routing to nutrition clinic: {e}")
