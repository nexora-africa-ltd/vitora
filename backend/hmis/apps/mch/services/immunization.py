# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Immunization scheduling services for KEPI."""

from datetime import date, datetime, timedelta

from django.db import transaction

from hmis.apps.mch.models import ImmunizationRecord, Vaccine


def _ensure_date(value):
    """Coerce a string or datetime to a date object."""
    if isinstance(value, str):
        return datetime.strptime(value, "%Y-%m-%d").date()
    if isinstance(value, datetime):
        return value.date()
    return value


def generate_immunization_schedule(patient):
    """
    Generate immunization records for a child based on active KEPI vaccines.

    Returns a list of ImmunizationRecord instances (created or existing),
    ordered by scheduled_date.
    """
    dob = _ensure_date(patient.date_of_birth)
    if not isinstance(dob, date):
        return []

    vaccines = Vaccine.objects.filter(is_active=True).order_by("standard_age_days", "code")
    if not vaccines.exists():
        return []

    records = []
    with transaction.atomic():
        for vaccine in vaccines:
            scheduled_date = dob + timedelta(days=vaccine.standard_age_days)
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
