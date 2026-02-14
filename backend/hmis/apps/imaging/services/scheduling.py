"""
Imaging Scheduling Service.

Integrates the imaging module with the scheduling system (Phase 1-2 complete).
This service provides:
- Imaging resource management (rooms, scanners as scheduling.Resource)
- Appointment creation and linking for imaging orders
- Calendar availability views for radiology department
- Modality validation for resources
"""

from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from hmis.apps.scheduling.models import Appointment, Resource


class ImagingSchedulingService:
    """
    Service for integrating imaging orders with the scheduling system.

    Uses existing scheduling infrastructure (no redundancy).
    """

    # Modality to procedure time mapping (in minutes)
    MODALITY_DURATION = {
        "XR": 30,  # X-Ray: 30 minutes
        "US": 30,  # Ultrasound: 30 minutes
        "CT": 45,  # CT: 45 minutes
        "MRI": 60,  # MRI: 60 minutes
        "NM": 45,  # Nuclear Medicine: 45 minutes
        "MG": 30,  # Mammography: 30 minutes
        "FL": 30,  # Fluoroscopy: 30 minutes
        "OTHER": 30,  # Default: 30 minutes
    }

    NAIROBI_TZ = ZoneInfo("Africa/Nairobi")

    @staticmethod
    def get_imaging_resources(modality: str | None = None) -> list[Resource]:
        """
        Get imaging-specific resources (rooms/scanners).

        Args:
            modality: Optional filter by modality (XR, CT, MRI, etc.)

        Returns:
            List of imaging resources
        """
        qs = Resource.objects.filter(
            is_active=True,
            metadata__department="radiology",
        )

        resources = list(qs)

        if modality:
            # Filter by modality capability (Python-side for SQLite compatibility)
            resources = [r for r in resources if modality in r.metadata.get("modalities", [])]

        return resources

    @staticmethod
    def validate_resource_modality(resource: Resource, required_modality: str) -> bool:
        """
        Validate that a resource supports the required modality.

        Args:
            resource: The scheduling resource
            required_modality: The modality required by the imaging procedure

        Returns:
            True if resource supports the modality
        """
        modalities = resource.metadata.get("modalities", [])
        return required_modality in modalities

    @staticmethod
    def get_order_modality(imaging_order) -> str | None:
        """
        Get the primary modality for an imaging order.

        Args:
            imaging_order: ImagingOrder instance

        Returns:
            Primary modality code or None
        """
        first_item = imaging_order.items.first()
        if first_item:
            return first_item.procedure.modality
        return None

    @classmethod
    def get_slot_duration(cls, imaging_order) -> int:
        """
        Get the appropriate slot duration for an imaging order.

        Args:
            imaging_order: ImagingOrder instance

        Returns:
            Duration in minutes
        """
        modality = cls.get_order_modality(imaging_order)
        return cls.MODALITY_DURATION.get(modality, 30)

    @classmethod
    def _get_schedules_for_date(cls, resource: Resource, for_date) -> list:
        """Get applicable schedules for a resource on a date."""
        from django.db.models import Q

        return list(
            resource.get_schedules()
            .filter(
                Q(schedule_type="RECURRING", day_of_week=for_date.weekday())
                | Q(schedule_type="ONE_TIME", specific_date=for_date)
            )
            .filter(effective_from__lte=for_date)
            .filter(Q(effective_until__isnull=True) | Q(effective_until__gte=for_date))
        )

    @classmethod
    def _get_booked_appointments(
        cls,
        resource: Resource,
        for_date,
        exclude_appointment_id: int | None = None,
    ) -> list[Appointment]:
        """Get booked appointments for a resource on a date."""
        day_start = datetime.combine(for_date, time.min, tzinfo=cls.NAIROBI_TZ)
        day_end = datetime.combine(for_date, time.max, tzinfo=cls.NAIROBI_TZ)

        qs = Appointment.objects.filter(
            resource=resource,
            status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
            scheduled_start__gte=day_start,
            scheduled_start__lt=day_end,
        )

        if exclude_appointment_id:
            qs = qs.exclude(id=exclude_appointment_id)

        return list(qs.select_related("patient"))

    @classmethod
    def get_resource_availability(
        cls,
        resource: Resource,
        for_date=None,
    ) -> list[dict[str, Any]]:
        """
        Get available slots for an imaging resource on a specific date.

        Args:
            resource: The imaging resource
            for_date: Date to check (defaults to today)

        Returns:
            List of available slot dictionaries
        """
        if for_date is None:
            for_date = timezone.now().date()

        # Get all schedules for this date
        schedules = cls._get_schedules_for_date(resource, for_date)

        # Generate all possible slots
        all_slots = []
        for schedule in schedules:
            slots = schedule.get_available_slots(for_date)
            all_slots.extend(slots)

        if not all_slots:
            return []

        # Get existing appointments
        booked_appointments = cls._get_booked_appointments(resource, for_date)

        # Enrich slots with availability status
        enriched_slots = []
        for slot in all_slots:
            slot_start = datetime.combine(for_date, slot["start_time"], tzinfo=cls.NAIROBI_TZ)
            slot_end = datetime.combine(for_date, slot["end_time"], tzinfo=cls.NAIROBI_TZ)

            # Check if slot is booked
            appointment = None
            is_available = True
            for apt in booked_appointments:
                if apt.scheduled_start < slot_end and apt.scheduled_end > slot_start:
                    is_available = False
                    appointment = apt
                    break

            enriched_slots.append(
                {
                    "date": for_date.isoformat(),
                    "start_time": slot["start_time"].isoformat(),
                    "end_time": slot["end_time"].isoformat(),
                    "is_available": is_available,
                    "appointment": {
                        "id": appointment.id,
                        "patient_name": str(appointment.patient) if appointment.patient else None,
                        "appointment_number": appointment.appointment_number,
                        "status": appointment.status,
                    }
                    if appointment
                    else None,
                }
            )

        return enriched_slots

    @classmethod
    def get_weekly_availability(
        cls,
        resource: Resource,
        start_date=None,
    ) -> list[dict[str, Any]]:
        """
        Get weekly availability for an imaging resource.

        Args:
            resource: The imaging resource
            start_date: Start of the week (defaults to today)

        Returns:
            List of daily availability dictionaries
        """
        if start_date is None:
            start_date = timezone.now().date()

        weekly = []
        for day_offset in range(7):
            check_date = start_date + timedelta(days=day_offset)
            slots = cls.get_resource_availability(resource, check_date)
            weekly.append(
                {
                    "date": check_date.isoformat(),
                    "day_name": check_date.strftime("%A"),
                    "slots": slots,
                    "total_slots": len(slots),
                    "available_slots": sum(1 for s in slots if s["is_available"]),
                }
            )

        return weekly

    @classmethod
    def check_slot_available(
        cls,
        resource: Resource,
        slot_start: datetime,
        slot_end: datetime,
        exclude_appointment_id: int | None = None,
    ) -> bool:
        """
        Check if a specific slot is available for booking.

        Args:
            resource: The imaging resource
            slot_start: Slot start datetime
            slot_end: Slot end datetime
            exclude_appointment_id: Appointment to exclude (for rescheduling)

        Returns:
            True if slot is available
        """
        qs = Appointment.objects.filter(
            resource=resource,
            status__in=["CREATED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"],
            scheduled_start__lt=slot_end,
            scheduled_end__gt=slot_start,
        )

        if exclude_appointment_id:
            qs = qs.exclude(id=exclude_appointment_id)

        return not qs.exists()

    @classmethod
    @transaction.atomic
    def schedule_imaging_order(
        cls,
        imaging_order,
        resource: Resource,
        scheduled_datetime: datetime,
        user=None,  # noqa: ARG003 - Reserved for audit logging
    ) -> Appointment:
        """
        Schedule an imaging order by creating/updating a linked appointment.

        Args:
            imaging_order: ImagingOrder instance
            resource: Imaging resource (room/scanner)
            scheduled_datetime: When to schedule the appointment
            user: User making the scheduling request (for audit)

        Returns:
            Created or updated Appointment

        Raises:
            ValueError: If slot is not available or modality mismatch
        """
        # Validate modality compatibility
        order_modality = cls.get_order_modality(imaging_order)
        if order_modality and not cls.validate_resource_modality(resource, order_modality):
            supported = resource.metadata.get("modalities", [])
            raise ValueError(
                f"Resource {resource.code} does not support modality {order_modality}. "
                f"Supported modalities: {supported}"
            )

        # Calculate slot end time
        duration = cls.get_slot_duration(imaging_order)
        scheduled_end = scheduled_datetime + timedelta(minutes=duration)

        # Check availability (skip if rescheduling same order)
        existing_appt = getattr(imaging_order, "appointment", None)
        exclude_id = existing_appt.id if existing_appt else None

        if not cls.check_slot_available(resource, scheduled_datetime, scheduled_end, exclude_id):
            raise ValueError(
                f"Slot not available: {resource.name} at {scheduled_datetime.isoformat()}"
            )

        # Create or update appointment
        if existing_appt:
            # Update existing appointment
            existing_appt.resource = resource
            existing_appt.scheduled_start = scheduled_datetime
            existing_appt.scheduled_end = scheduled_end
            existing_appt.save()
            appointment = existing_appt
        else:
            # Create new appointment
            appointment = Appointment.objects.create(
                patient=imaging_order.patient,
                resource=resource,
                appointment_type="IMAGING",
                scheduled_start=scheduled_datetime,
                scheduled_end=scheduled_end,
                status="CONFIRMED",
                reason=f"Imaging: {imaging_order.order_number}",
                notes=imaging_order.clinical_indication,
            )

            # Link to imaging order
            imaging_order.appointment = appointment
            imaging_order.save(update_fields=["appointment"])

        # Update imaging order scheduled fields
        imaging_order.scheduled_datetime = scheduled_datetime
        imaging_order.scheduled_room = resource.name
        if imaging_order.status == "ORDERED":
            imaging_order.status = "SCHEDULED"
        imaging_order.save(update_fields=["scheduled_datetime", "scheduled_room", "status"])

        return appointment

    @classmethod
    def get_department_calendar(
        cls,
        for_date=None,
        modality: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get combined calendar view for all imaging resources.

        Args:
            for_date: Date to show (defaults to today)
            modality: Optional filter by modality

        Returns:
            List of resource calendars
        """
        if for_date is None:
            for_date = timezone.now().date()

        resources = cls.get_imaging_resources(modality)
        calendar_data = []

        for resource in resources:
            slots = cls.get_resource_availability(resource, for_date)
            calendar_data.append(
                {
                    "resource": {
                        "id": resource.id,
                        "code": resource.code,
                        "name": resource.name,
                        "resource_type": resource.resource_type,
                        "metadata": resource.metadata,
                    },
                    "slots": slots,
                    "total_slots": len(slots),
                    "available_slots": sum(1 for s in slots if s["is_available"]),
                    "booked_slots": sum(1 for s in slots if not s["is_available"]),
                }
            )

        return calendar_data
