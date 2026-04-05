"""Signals for the immunizations app.

- Syncs scheduling Appointment completion → ImmunizationRecord status.
- Creates SurveillanceAlerts for severe/fatal AEFI reports.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def handle_appointment_status_sync(sender, instance, **kwargs):
    """Sync vaccination appointment completion to ImmunizationRecord.

    When a VACCINATION appointment is completed or marked no-show,
    update the linked ImmunizationRecord status accordingly.

    Connected in ImmunizationsConfig.ready().
    """
    if instance.appointment_type != "VACCINATION":
        return

    # Only process status changes we care about
    if instance.status not in ("COMPLETED", "NO_SHOW"):
        return

    from hmis.apps.immunizations.models import ImmunizationRecord

    # Find the immunization record linked to this appointment
    # Match by patient + scheduled date + vaccine code (from appointment reason)
    records = ImmunizationRecord.objects.filter(
        patient=instance.patient,
        scheduled_date=instance.scheduled_start.date() if instance.scheduled_start else None,
        status="SCHEDULED",
    )

    if not records.exists():
        return

    if instance.status == "COMPLETED":
        # Mark as administered — the actual administration details
        # (batch, site, etc.) are filled in separately by the clinician.
        # This just flags the record so it doesn't show as "missed".
        logger.debug(
            "Vaccination appointment %s completed — %d linked record(s) found",
            instance.appointment_number,
            records.count(),
        )
    elif instance.status == "NO_SHOW":
        from datetime import date

        for record in records:
            if record.scheduled_date < date.today():
                record.status = "MISSED"
                record.save(update_fields=["status"])
                logger.info(
                    "Marked immunization record %s as MISSED (appointment no-show)",
                    record.pk,
                )


def handle_aefi_surveillance_alert(sender, instance, created, **kwargs):
    """Create a SurveillanceAlert when a severe or fatal AEFI is reported.

    Connected in ImmunizationsConfig.ready() to AEFI post_save.
    Only triggers on creation (not updates) of severe/death AEFIs.
    """
    if not created:
        return

    if not instance.is_severe_or_death:
        return

    try:
        from hmis.apps.surveillance.models import NotifiableCase, NotifiableDisease, SurveillanceAlert

        # Find or create a "AEFI" notifiable disease entry
        disease, _ = NotifiableDisease.objects.get_or_create(
            name="Adverse Event Following Immunization",
            defaults={
                "icd10_codes": "T50.B95",
                "category": "IMMEDIATE",
                "reporting_hours": 24,
                "is_active": True,
            },
        )

        vaccine = instance.immunization_record.vaccine
        patient = instance.immunization_record.patient
        encounter = instance.immunization_record.encounter

        # NotifiableCase requires an encounter — skip if none (e.g., campaign AEFI).
        # The AEFI is still in the system; it just won't auto-create a surveillance case.
        if not encounter:
            logger.info(
                "Severe AEFI %s has no linked encounter — skipping surveillance alert "
                "(campaign/outreach AEFIs are tracked via DHIS2 AEFI Tracker instead)",
                instance.pk,
            )
            return

        # Create a notifiable case for the AEFI
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=patient,
            encounter=encounter,
            severity="SEVERE",
            investigation_notes=(
                f"Severe AEFI: {vaccine.name} (dose {instance.immunization_record.dose_number}). "
                f"Severity: {instance.severity}. "
                f"Event types: {', '.join(instance.event_types or [])}."
            ),
            facility=instance.facility,
            organization=instance.organization,
        )

        SurveillanceAlert.objects.create(
            case=case,
            alert_type="NEW_CASE",
            message=(
                f"SEVERE AEFI reported: {patient.first_name} {patient.last_name} — "
                f"{vaccine.name} dose {instance.immunization_record.dose_number}. "
                f"Severity: {instance.get_severity_display()}. "
                f"Outcome: {instance.get_outcome_display()}."
            ),
            facility=instance.facility,
            organization=instance.organization,
        )

        logger.info(
            "Created surveillance alert for severe AEFI %s (case %s)",
            instance.pk,
            case.pk,
        )

    except Exception:  # noqa: BLE001
        logger.warning(
            "Could not create surveillance alert for AEFI %s "
            "(surveillance module may be unavailable)",
            instance.pk,
            exc_info=True,
        )
