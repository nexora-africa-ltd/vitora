"""Signals for the MCH module."""

import logging
from datetime import date

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.mch.models import ANCVisit, Delivery, HEIFollowUp, PNCVisit

logger = logging.getLogger(__name__)


# Maximum age in days for auto-generating KEPI immunization schedule (5 years)
MAX_KEPI_AGE_DAYS = 5 * 365


@receiver(post_save, sender="patients.Patient")
def auto_generate_immunization_schedule(sender, instance, created, **kwargs):
    """
    Auto-generate KEPI immunization schedule for children ≤5 years.

    Triggered on Patient creation. Only generates schedule if:
    - Patient was just created
    - Patient has a date_of_birth
    - Patient is ≤5 years old
    - Active Vaccine records exist in the database
    """
    if not created or not instance.date_of_birth:
        return

    # Handle date_of_birth as string or date object
    dob = instance.date_of_birth
    if isinstance(dob, str):
        from datetime import datetime

        try:
            dob = datetime.strptime(dob, "%Y-%m-%d").date()
        except ValueError:
            return

    age_days = (date.today() - dob).days
    if age_days < 0 or age_days > MAX_KEPI_AGE_DAYS:
        return

    try:
        from hmis.apps.mch.services.immunization import generate_immunization_schedule

        records = generate_immunization_schedule(instance)
        if records:
            logger.info(
                "Auto-generated %d immunization records for patient %s (age %d days)",
                len(records),
                instance.id,
                age_days,
            )
    except Exception as exc:
        # Don't prevent patient creation if immunization scheduling fails
        logger.warning(
            "Failed to auto-generate immunization schedule for patient %s: %s",
            instance.id,
            exc,
        )


@receiver(post_save, sender=Delivery)
def create_baby_patient_on_delivery(sender, instance, created, **kwargs):
    """Create baby patient record when a delivery is completed."""
    if instance.status != "COMPLETED" or instance.baby_patient:
        return

    try:
        from hmis.apps.patients.models import Patient

        mother = instance.registration.mother
        baby_first_name = f"Baby of {mother.first_name}"

        baby = Patient.objects.create(
            first_name=baby_first_name,
            last_name=mother.last_name,
            date_of_birth=instance.delivery_date,
            gender=instance.baby_gender or "O",
            county=mother.county,
            sub_county=mother.sub_county,
            ward=mother.ward,
            registered_by=instance.delivered_by or instance.registration.registered_by,
        )

        instance.baby_patient = baby
        instance.save(update_fields=["baby_patient"])

        registration = instance.registration
        if not registration.baby:
            registration.baby = baby
            registration.save(update_fields=["baby"])

        logger.info("Created baby patient %s for delivery %s", baby.id, instance.id)

    except Exception as exc:
        logger.error("Failed to create baby patient for delivery %s: %s", instance.id, exc)


@receiver(post_save, sender=HEIFollowUp)
def auto_enroll_confirmed_positive_to_ccc(sender, instance, **kwargs):
    """
    Auto-enroll HIV-positive infants to CCC clinic.

    When HEI status changes to CONFIRMED_POSITIVE, automatically create
    a CCC clinic enrollment for the infant.
    """
    if instance.status != "CONFIRMED_POSITIVE":
        return

    try:
        from hmis.apps.clinics.models import Clinic, ClinicEnrollment

        # Check if already enrolled in CCC
        existing_ccc = ClinicEnrollment.objects.filter(
            patient=instance.infant,
            clinic__clinic_type="CCC",
            status="ACTIVE",
        ).exists()

        if existing_ccc:
            logger.info(
                "Infant %s already enrolled in CCC, skipping auto-enrollment",
                instance.infant.id,
            )
            return

        # Find an active CCC clinic
        ccc_clinic = Clinic.objects.filter(
            clinic_type="CCC",
            status="ACTIVE",
        ).first()

        if not ccc_clinic:
            logger.warning(
                "No active CCC clinic found for auto-enrollment of HEI %s",
                instance.hei_number,
            )
            return

        # Create CCC enrollment
        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=instance.infant,
            enrollment_date=date.today(),
            status="ACTIVE",
            enrolled_by=instance.enrolled_by,
            enrollment_data={
                "source": "HEI_AUTO_ENROLLMENT",
                "hei_number": instance.hei_number,
                "mother_mch_number": (
                    instance.mch_registration.mch_number
                    if instance.mch_registration
                    else None
                ),
            },
        )

        logger.info(
            "Auto-enrolled infant %s to CCC clinic %s (enrollment %s) from HEI %s",
            instance.infant.id,
            ccc_clinic.code,
            enrollment.id,
            instance.hei_number,
        )

    except Exception as exc:
        # Don't prevent HEI save if CCC enrollment fails
        logger.error(
            "Failed to auto-enroll HEI %s infant to CCC: %s",
            instance.hei_number,
            exc,
        )


# =============================================================================
# MCH Billing Automation Signals
# =============================================================================


@receiver(post_save, sender=ANCVisit)
def auto_create_anc_visit_invoice(sender, instance, created, **kwargs):
    """
    Auto-create invoice for ANC visit.

    Respects Linda Jamii exemption - no invoice created for beneficiaries.
    """
    if not created:
        return

    try:
        from hmis.apps.mch.services.billing import create_anc_visit_invoice

        invoice = create_anc_visit_invoice(instance)
        if invoice:
            logger.info(
                "Auto-created invoice %s for ANC visit %s",
                invoice.invoice_number,
                instance.id,
            )
    except Exception as exc:
        # Don't prevent visit creation if billing fails
        logger.warning(
            "Failed to auto-create invoice for ANC visit %s: %s",
            instance.id,
            exc,
        )


@receiver(post_save, sender=PNCVisit)
def auto_create_pnc_visit_invoice(sender, instance, created, **kwargs):
    """
    Auto-create invoice for PNC visit.

    Respects Linda Jamii exemption - no invoice created for beneficiaries.
    """
    if not created:
        return

    try:
        from hmis.apps.mch.services.billing import create_pnc_visit_invoice

        invoice = create_pnc_visit_invoice(instance)
        if invoice:
            logger.info(
                "Auto-created invoice %s for PNC visit %s",
                invoice.invoice_number,
                instance.id,
            )
    except Exception as exc:
        # Don't prevent visit creation if billing fails
        logger.warning(
            "Failed to auto-create invoice for PNC visit %s: %s",
            instance.id,
            exc,
        )


@receiver(post_save, sender=Delivery)
def auto_create_delivery_invoice(sender, instance, created, **kwargs):
    """
    Auto-create invoice for delivery when completed.

    Respects Linda Jamii exemption - no invoice created for beneficiaries.
    Only creates invoice when delivery status is COMPLETED.
    """
    if instance.status != "COMPLETED":
        return

    # Check if invoice already exists for this delivery (avoid duplicates)
    # We use the notes field to detect existing invoices
    mch_number = instance.registration.mch_number
    from hmis.apps.billing.models import Invoice

    existing = Invoice.objects.filter(
        patient=instance.registration.mother,
        notes__icontains=f"Delivery - MCH: {mch_number}",
    ).exists()

    if existing:
        return

    try:
        from hmis.apps.mch.services.billing import create_delivery_invoice

        invoice = create_delivery_invoice(instance)
        if invoice:
            logger.info(
                "Auto-created invoice %s for delivery %s",
                invoice.invoice_number,
                instance.id,
            )
    except Exception as exc:
        # Don't prevent delivery save if billing fails
        logger.warning(
            "Failed to auto-create invoice for delivery %s: %s",
            instance.id,
            exc,
        )
