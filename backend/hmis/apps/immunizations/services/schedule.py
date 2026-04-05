"""Immunization scheduling services."""

from datetime import timedelta

from django.db import transaction

from hmis.apps.immunizations.models import ImmunizationRecord, VaccineDefinition


def generate_kepi_schedule(patient):
    """
    Generate immunization records for a child based on active KEPI vaccines.

    Creates SCHEDULED records for each KEPI vaccine, with scheduled_date
    calculated as DOB + standard_age_days. Idempotent — existing records
    are returned unchanged.

    Args:
        patient: Patient instance (should be a child).

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

    return sorted(records, key=lambda r: (r.scheduled_date, r.vaccine.code))


def generate_adult_schedule(patient, vaccine, start_date):
    """
    Generate a multi-dose schedule for an adult vaccine.

    Creates one ImmunizationRecord per dose, spaced by vaccine.interval_days.
    Idempotent — existing records are returned unchanged.

    Args:
        patient: Patient instance.
        vaccine: VaccineDefinition instance (should have total_doses > 1).
        start_date: Date for the first dose.

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

    return sorted(records, key=lambda r: r.dose_number)
