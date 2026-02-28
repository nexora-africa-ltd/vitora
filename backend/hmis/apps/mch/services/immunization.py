"""Immunization scheduling services for KEPI."""

from datetime import timedelta

from django.db import transaction

from hmis.apps.mch.models import ImmunizationRecord, Vaccine


def generate_immunization_schedule(patient):
    """
    Generate immunization records for a child based on active KEPI vaccines.

    Returns a list of ImmunizationRecord instances (created or existing),
    ordered by scheduled_date.
    """
    vaccines = Vaccine.objects.filter(is_active=True).order_by("standard_age_days", "code")
    if not vaccines.exists():
        return []

    records = []
    with transaction.atomic():
        for vaccine in vaccines:
            scheduled_date = patient.date_of_birth + timedelta(days=vaccine.standard_age_days)
            record, _ = ImmunizationRecord.objects.get_or_create(
                patient=patient,
                vaccine=vaccine,
                defaults={"scheduled_date": scheduled_date},
            )
            if record.scheduled_date != scheduled_date:
                # Keep scheduled date in sync with current vaccine definition.
                record.scheduled_date = scheduled_date
                record.save(update_fields=["scheduled_date"])
            records.append(record)

    return sorted(records, key=lambda r: (r.scheduled_date, r.vaccine.code))
