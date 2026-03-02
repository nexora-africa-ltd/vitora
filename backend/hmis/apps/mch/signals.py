"""Signals for the MCH module."""

import logging
from datetime import date, datetime, time, timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.mch.models import ANCVisit, Delivery, HEIFollowUp, MCHRegistration, PNCVisit

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


@receiver(post_save, sender=MCHRegistration)
def auto_create_anc_enrollment(sender, instance, created, **kwargs):
    """
    Auto-create ANC ClinicEnrollment when MCH registration is created.

    If the registration is created WITHOUT a linked anc_enrollment,
    automatically finds/creates an active ANC clinic and creates the
    ClinicEnrollment record, then links it back to the MCH registration.
    """
    if not created or instance.anc_enrollment:
        return

    try:
        from hmis.apps.clinics.models import Clinic, ClinicEnrollment

        # Find an active ANC clinic
        anc_clinic = Clinic.objects.filter(
            clinic_type="ANC",
            status="ACTIVE",
        ).first()

        if not anc_clinic:
            logger.warning(
                "No active ANC clinic found for auto-enrollment of MCH %s",
                instance.mch_number,
            )
            return

        # Create ANC enrollment linked to the mother
        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=instance.mother,
            enrollment_date=instance.registration_date or date.today(),
            status="ACTIVE",
            enrolled_by=instance.registered_by,
            enrollment_data={
                "source": "MCH_AUTO_ENROLLMENT",
                "mch_number": instance.mch_number,
            },
            high_risk_pregnancy=instance.is_high_risk,
            high_risk_factors=instance.risk_factors or "",
        )

        # Link enrollment back to MCH registration
        instance.anc_enrollment = enrollment
        instance.save(update_fields=["anc_enrollment"])

        logger.info(
            "Auto-created ANC enrollment %s for MCH registration %s (mother %s)",
            enrollment.id,
            instance.mch_number,
            instance.mother.id,
        )

    except Exception as exc:
        # Don't prevent MCH registration if ANC enrollment fails
        logger.error(
            "Failed to auto-create ANC enrollment for MCH %s: %s",
            instance.mch_number,
            exc,
        )


@receiver(post_save, sender=Delivery)
def auto_transition_mch_to_delivered(sender, instance, created, **kwargs):
    """
    Auto-transition MCH registration status to DELIVERED when delivery is completed.

    Only transitions if the registration is currently ACTIVE.
    """
    if instance.status != "COMPLETED":
        return

    try:
        registration = instance.registration
        if registration.status == "ACTIVE":
            registration.status = "DELIVERED"
            registration.save(update_fields=["status"])
            logger.info(
                "Auto-transitioned MCH %s to DELIVERED after delivery %s",
                registration.mch_number,
                instance.id,
            )
    except Exception as exc:
        logger.error(
            "Failed to auto-transition MCH registration for delivery %s: %s",
            instance.id,
            exc,
        )


@receiver(post_save, sender=ANCVisit)
def auto_create_anc_appointment(sender, instance, **kwargs):
    """
    Auto-create a scheduling Appointment when an ANC visit has next_visit_date.

    Creates a FOLLOW_UP appointment for the mother so antenatal visits
    appear on the facility-wide scheduling calendar.
    """
    if not instance.next_visit_date:
        return

    try:
        from hmis.apps.scheduling.models import Appointment, Resource

        patient = instance.registration.mother

        # Skip if an appointment already exists for this patient on this date
        existing = Appointment.objects.filter(
            patient=patient,
            scheduled_start__date=instance.next_visit_date,
            appointment_type="FOLLOW_UP",
            status__in=["CREATED", "CONFIRMED"],
        ).exists()

        if existing:
            return

        # Find an ANC resource (PLACE type) or any available resource
        resource = Resource.objects.filter(
            resource_type="PLACE",
            is_active=True,
            code__icontains="ANC",
        ).first()

        if not resource:
            resource = Resource.objects.filter(
                resource_type="PLACE",
                is_active=True,
            ).first()

        if not resource:
            logger.warning(
                "No scheduling resource found for ANC appointment (MCH %s)",
                instance.registration.mch_number,
            )
            return

        # Create appointment at 08:00 with 30-min slot
        import zoneinfo

        tz = zoneinfo.ZoneInfo("Africa/Nairobi")
        start_dt = datetime.combine(
            instance.next_visit_date, time(8, 0), tzinfo=tz
        )
        end_dt = start_dt + timedelta(minutes=30)

        appointment = Appointment(
            patient=patient,
            resource=resource,
            appointment_type="FOLLOW_UP",
            scheduled_start=start_dt,
            scheduled_end=end_dt,
            reason=(
                f"ANC follow-up visit - MCH: {instance.registration.mch_number}, "
                f"Visit {instance.visit_number + 1}"
            ),
            notes=f"Auto-created from ANC visit {instance.visit_number}",
            priority="ROUTINE",
            status="CREATED",
            created_by=instance.conducted_by,
        )
        appointment.save()

        logger.info(
            "Auto-created appointment %s for ANC next visit on %s (MCH %s)",
            appointment.appointment_number,
            instance.next_visit_date,
            instance.registration.mch_number,
        )

    except Exception as exc:
        # Don't prevent ANC visit save if appointment creation fails
        logger.warning(
            "Failed to auto-create ANC appointment for visit %s: %s",
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


# =============================================================================
# Immunization → Scheduling Integration
# =============================================================================


@receiver(post_save, sender="mch.ImmunizationRecord")
def auto_create_immunization_appointment(sender, instance, created, **kwargs):
    """
    Auto-create a scheduling Appointment for scheduled immunizations.

    When an ImmunizationRecord is created (or updated) with SCHEDULED status
    and a scheduled_date, creates a VACCINATION appointment so it appears
    on the facility-wide scheduling calendar.
    """
    if instance.status != "SCHEDULED" or not instance.scheduled_date:
        return

    # Only create for future dates
    if instance.scheduled_date <= date.today():
        return

    try:
        from hmis.apps.scheduling.models import Appointment, Resource

        patient = instance.patient

        # Skip if appointment already exists
        existing = Appointment.objects.filter(
            patient=patient,
            scheduled_start__date=instance.scheduled_date,
            appointment_type="VACCINATION",
            reason__icontains=instance.vaccine.name if instance.vaccine else "",
            status__in=["CREATED", "CONFIRMED"],
        ).exists()

        if existing:
            return

        # Find a suitable resource
        resource = Resource.objects.filter(
            resource_type="PLACE",
            is_active=True,
            code__icontains="IMM",
        ).first()

        if not resource:
            resource = Resource.objects.filter(
                resource_type="PLACE",
                is_active=True,
                code__icontains="CWC",
            ).first()

        if not resource:
            resource = Resource.objects.filter(
                resource_type="PLACE",
                is_active=True,
            ).first()

        if not resource:
            logger.warning(
                "No scheduling resource found for immunization appointment (patient %s)",
                patient.id,
            )
            return

        import zoneinfo

        tz = zoneinfo.ZoneInfo("Africa/Nairobi")
        start_dt = datetime.combine(
            instance.scheduled_date, time(8, 0), tzinfo=tz
        )
        end_dt = start_dt + timedelta(minutes=15)

        vaccine_name = instance.vaccine.name if instance.vaccine else "Vaccination"
        appointment = Appointment(
            patient=patient,
            resource=resource,
            appointment_type="VACCINATION",
            scheduled_start=start_dt,
            scheduled_end=end_dt,
            reason=f"{vaccine_name} (Dose {instance.dose_number or ''})",
            notes=f"Auto-created from KEPI immunization schedule",
            priority="ROUTINE",
            status="CREATED",
        )
        appointment.save()

        logger.info(
            "Auto-created vaccination appointment %s for %s on %s (patient %s)",
            appointment.appointment_number,
            vaccine_name,
            instance.scheduled_date,
            patient.id,
        )

    except Exception as exc:
        logger.warning(
            "Failed to auto-create immunization appointment for record %s: %s",
            instance.id,
            exc,
        )
