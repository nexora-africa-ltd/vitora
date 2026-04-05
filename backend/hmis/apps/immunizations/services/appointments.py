"""
Scheduling integration for immunizations.

Creates vaccination appointments from ImmunizationRecord scheduled dates,
linking into the scheduling app's Appointment model.
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from hmis.apps.immunizations.models import ImmunizationRecord

logger = logging.getLogger(__name__)

EAT = ZoneInfo("Africa/Nairobi")

# Default vaccination appointment slot: morning clinic
DEFAULT_VACCINATION_START_TIME = time(9, 0)
DEFAULT_VACCINATION_DURATION_MINUTES = 15


def create_vaccination_appointment(
    record: ImmunizationRecord,
    *,
    resource=None,
    created_by=None,
):
    """Create a scheduling Appointment for an immunization record.

    Args:
        record: ImmunizationRecord with a scheduled_date.
        resource: Optional Resource (e.g., immunization clinic room).
                  If None, looks for one with code='IMM-CLINIC'.
        created_by: User who triggered the creation.

    Returns:
        Created Appointment, or None if no resource is available or
        if an appointment already exists for this record.
    """
    from hmis.apps.scheduling.models import Appointment, Resource

    # Don't create duplicates
    existing = Appointment.objects.filter(
        patient=record.patient,
        appointment_type="VACCINATION",
        scheduled_start__date=record.scheduled_date,
        status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
        reason__contains=record.vaccine.code,
    ).exists()
    if existing:
        logger.debug(
            "Vaccination appointment already exists for %s on %s",
            record.vaccine.code,
            record.scheduled_date,
        )
        return None

    # Resolve resource — scoped to the record's facility to prevent
    # cross-tenant leakage (each facility has its own IMM-CLINIC resource).
    if resource is None:
        resource = Resource.objects.filter(
            code="IMM-CLINIC",
            facility=record.facility,
            is_active=True,
        ).first()

    if resource is None:
        logger.warning(
            "No immunization clinic resource (code=IMM-CLINIC) found "
            "for facility %s. Skipping appointment creation for %s.",
            record.facility_id,
            record,
        )
        return None

    start_dt = datetime.combine(
        record.scheduled_date,
        DEFAULT_VACCINATION_START_TIME,
        tzinfo=EAT,
    )
    end_dt = start_dt + timedelta(minutes=DEFAULT_VACCINATION_DURATION_MINUTES)

    appointment = Appointment.objects.create(
        patient=record.patient,
        resource=resource,
        appointment_type="VACCINATION",
        scheduled_start=start_dt,
        scheduled_end=end_dt,
        priority="ROUTINE",
        reason=f"{record.vaccine.code} dose {record.dose_number}",
        notes=f"Auto-generated for {record.vaccine.name}",
        created_by=created_by,
        facility=record.facility,
        organization=record.organization,
    )

    logger.info(
        "Created vaccination appointment %s for %s on %s",
        appointment.appointment_number,
        record.vaccine.code,
        record.scheduled_date,
    )
    return appointment


def create_appointments_for_schedule(
    records: list[ImmunizationRecord],
    *,
    resource=None,
    created_by=None,
) -> list:
    """Create appointments for a batch of immunization records.

    Typically called after generate_kepi_schedule() or generate_adult_schedule().

    Returns:
        List of created Appointment instances (excludes None/skipped).
    """
    appointments = []
    for record in records:
        apt = create_vaccination_appointment(
            record,
            resource=resource,
            created_by=created_by,
        )
        if apt:
            appointments.append(apt)
    return appointments
