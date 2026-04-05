"""Immunization scheduling services."""

import logging
from datetime import timedelta

from django.db import transaction

from hmis.apps.immunizations.models import ImmunizationRecord, VaccineDefinition

logger = logging.getLogger(__name__)


def generate_kepi_schedule(patient, *, create_appointments: bool = True, created_by=None):
    """
    Generate immunization records for a child based on active KEPI vaccines.

    Creates SCHEDULED records for each KEPI vaccine, with scheduled_date
    calculated as DOB + standard_age_days. Idempotent — existing records
    are returned unchanged.

    Args:
        patient: Patient instance (should be a child).
        create_appointments: If True, also creates scheduling Appointments
            for each generated record (requires IMM-CLINIC resource at patient's facility).
        created_by: User who triggered the generation (used for appointment audit).

    Returns:
        List of ImmunizationRecord instances, ordered by scheduled_date.
    """
    vaccines = VaccineDefinition.objects.filter(
        program="KEPI", is_active=True
    ).order_by("standard_age_days", "code")

    if not vaccines.exists():
        return []

    records = []
    with transaction.atomic():
        for vaccine in vaccines:
            scheduled_date = patient.date_of_birth + timedelta(
                days=vaccine.standard_age_days
            )
            record, _ = ImmunizationRecord.objects.get_or_create(
                patient=patient,
                vaccine=vaccine,
                dose_number=vaccine.dose_number,
                defaults={"scheduled_date": scheduled_date},
            )
            if record.status == "SCHEDULED" and record.scheduled_date != scheduled_date:
                record.scheduled_date = scheduled_date
                record.save(update_fields=["scheduled_date"])
            records.append(record)

    records = sorted(records, key=lambda r: (r.scheduled_date, r.vaccine.code))

    if create_appointments:
        _create_appointments_for_records(records, created_by=created_by)

    return records


def generate_adult_schedule(
    patient, vaccine, start_date, *, create_appointments: bool = True, created_by=None,
):
    """
    Generate a multi-dose schedule for an adult vaccine.

    Creates one ImmunizationRecord per dose, spaced by vaccine.interval_days.
    Idempotent — existing records are returned unchanged.

    Args:
        patient: Patient instance.
        vaccine: VaccineDefinition instance (should have total_doses > 1).
        start_date: Date for the first dose.
        create_appointments: If True, also creates scheduling Appointments.
        created_by: User who triggered the generation.

    Returns:
        List of ImmunizationRecord instances, ordered by dose_number.
    """
    total = vaccine.total_doses or 1
    interval = vaccine.interval_days or 28

    records = []
    with transaction.atomic():
        for dose_num in range(1, total + 1):
            dose_date = start_date + timedelta(days=interval * (dose_num - 1))
            record, _ = ImmunizationRecord.objects.get_or_create(
                patient=patient,
                vaccine=vaccine,
                dose_number=dose_num,
                defaults={"scheduled_date": dose_date},
            )
            # Set next_dose_date for all but the last dose
            if dose_num < total and not record.next_dose_date:
                record.next_dose_date = start_date + timedelta(
                    days=interval * dose_num
                )
                record.save(update_fields=["next_dose_date"])
            records.append(record)

    records = sorted(records, key=lambda r: r.dose_number)

    if create_appointments:
        _create_appointments_for_records(records, created_by=created_by)

    return records


def _create_appointments_for_records(records, *, created_by=None):
    """Create scheduling appointments for a batch of immunization records.

    Fails silently if the appointments service is unavailable or
    no IMM-CLINIC resource exists at the facility.
    """
    try:
        from hmis.apps.immunizations.services.appointments import (
            create_appointments_for_schedule,
        )

        scheduled_records = [r for r in records if r.status == "SCHEDULED"]
        if scheduled_records:
            appointments = create_appointments_for_schedule(
                scheduled_records, created_by=created_by,
            )
            logger.info(
                "Created %d vaccination appointments for %d scheduled records",
                len(appointments),
                len(scheduled_records),
            )
    except Exception:  # noqa: BLE001
        logger.warning(
            "Could not create vaccination appointments (scheduling may be unavailable)",
            exc_info=True,
        )
