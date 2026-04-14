from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.mch.models import MCHRegistration
from hmis.apps.scheduling.models import Appointment, Resource


def transition_registration_to_postnatal(registration: MCHRegistration) -> None:
    """Move a pregnancy record into postpartum tracking when continuity is activated."""
    if registration.status in {"POSTNATAL", "COMPLETED"}:
        return

    registration.status = "POSTNATAL"
    registration.save(update_fields=["status", "updated_at"])


def route_registration_to_pnc_queue(
    registration: MCHRegistration,
    *,
    user,
    routing_date: dt_date | None = None,
    clinic_id: int | None = None,
    notes: str = "",
) -> ClinicVisit:
    """Create or reuse a same-day PNC queue entry for a postpartum mother."""
    routing_date = routing_date or timezone.localdate()

    clinic_qs = Clinic.objects.filter(status="ACTIVE", clinic_type="PNC")
    clinic = clinic_qs.filter(id=clinic_id).first() if clinic_id else clinic_qs.first()
    if clinic is None:
        raise ValidationError(
            "No active PNC clinic found. Create one before routing postpartum patients."
        )

    session = ClinicSession.objects.filter(clinic=clinic, session_date=routing_date).first()
    if session is None:
        session = ClinicSession.objects.create(
            clinic=clinic,
            session_date=routing_date,
            status="OPEN",
            opened_at=timezone.now(),
        )

    existing_visit = (
        ClinicVisit.objects.filter(
            session=session,
            patient=registration.mother,
            source_module="MCH_PNC",
            source_record_id=registration.pk,
        )
        .order_by("id")
        .first()
    )
    if existing_visit is not None:
        return existing_visit

    max_queue = (
        ClinicVisit.objects.filter(session=session).aggregate(max_q=models.Max("queue_number"))[
            "max_q"
        ]
        or 0
    )

    return ClinicVisit.objects.create(
        session=session,
        patient=registration.mother,
        queue_number=max_queue + 1,
        status="REGISTERED",
        priority="STANDARD",
        visit_type="FOLLOW_UP",
        source="DIRECT",
        source_module="MCH_PNC",
        source_record_id=registration.pk,
        registered_by=user,
        chief_complaint=notes or f"Early PNC review - MCH: {registration.mch_number}",
        notes=notes,
    )


def schedule_registration_pnc_follow_up(
    registration: MCHRegistration,
    *,
    visit_date: dt_date,
    user=None,
    notes: str = "",
) -> Appointment:
    """Create or reuse an early PNC follow-up appointment for a postpartum mother."""
    resource = Resource.objects.filter(
        resource_type="PLACE",
        is_active=True,
        code__icontains="PNC",
    ).first()
    if resource is None:
        resource = Resource.objects.filter(resource_type="PLACE", is_active=True).first()
    if resource is None:
        raise ValidationError(
            "No scheduling resource found. Configure a PNC resource before scheduling early PNC."
        )

    existing_appointment = (
        Appointment.objects.filter(
            patient=registration.mother,
            scheduled_start__date=visit_date,
            appointment_type="FOLLOW_UP",
            status__in=["CREATED", "CONFIRMED"],
        )
        .order_by("id")
        .first()
    )
    if existing_appointment is not None:
        return existing_appointment

    import zoneinfo

    tz = zoneinfo.ZoneInfo("Africa/Nairobi")
    start_dt = datetime.combine(visit_date, time(8, 0), tzinfo=tz)
    end_dt = start_dt + timedelta(minutes=30)

    appointment = Appointment(
        patient=registration.mother,
        resource=resource,
        appointment_type="FOLLOW_UP",
        scheduled_start=start_dt,
        scheduled_end=end_dt,
        reason=f"Early PNC follow-up - MCH: {registration.mch_number}",
        notes=notes or f"Scheduled from maternity discharge for {registration.mch_number}",
        priority="URGENT" if registration.is_high_risk else "ROUTINE",
        status="CREATED",
        created_by=user,
    )
    appointment.save()
    return appointment
