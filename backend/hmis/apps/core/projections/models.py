"""
Read-model Django models for projections.

These models store denormalized, pre-computed state derived from domain events.
They are the "materialized views" that power real-time dashboards.
"""

from django.db import models
from django.utils import timezone


class ClinicQueueStats(models.Model):
    """
    Denormalized clinic queue statistics per clinic per facility.

    Updated by ClinicQueueProjection when clinic visit events arrive.
    """

    facility_id = models.IntegerField(db_index=True)
    clinic_id = models.IntegerField(db_index=True)
    waiting_count = models.PositiveIntegerField(default=0)
    in_consultation_count = models.PositiveIntegerField(default=0)
    completed_today = models.PositiveIntegerField(default=0)
    no_show_today = models.PositiveIntegerField(default=0)
    avg_wait_seconds = models.PositiveIntegerField(
        default=0,
        help_text="Average wait time in seconds (registered → called)",
    )
    longest_wait_seconds = models.PositiveIntegerField(
        default=0,
        help_text="Longest current wait in seconds",
    )
    last_updated = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = [("facility_id", "clinic_id")]
        indexes = [
            models.Index(fields=["facility_id"], name="idx_cqs_facility"),
        ]
        verbose_name = "Clinic Queue Stats"
        verbose_name_plural = "Clinic Queue Stats"

    def __str__(self):
        return f"ClinicQueueStats(facility={self.facility_id}, clinic={self.clinic_id})"


class WardOccupancyStats(models.Model):
    """
    Denormalized ward occupancy statistics per ward.

    Updated by WardOccupancyProjection when inpatient events arrive.
    """

    facility_id = models.IntegerField(db_index=True)
    ward_id = models.IntegerField(db_index=True)
    total_beds = models.PositiveIntegerField(default=0)
    occupied_beds = models.PositiveIntegerField(default=0)
    available_beds = models.PositiveIntegerField(default=0)
    occupancy_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Occupancy percentage (0-100)",
    )
    admissions_today = models.PositiveIntegerField(default=0)
    discharges_today = models.PositiveIntegerField(default=0)
    last_updated = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = [("facility_id", "ward_id")]
        indexes = [
            models.Index(fields=["facility_id"], name="idx_wos_facility"),
        ]
        verbose_name = "Ward Occupancy Stats"
        verbose_name_plural = "Ward Occupancy Stats"

    def __str__(self):
        return f"WardOccupancyStats(facility={self.facility_id}, ward={self.ward_id})"


class PharmacyQueueStats(models.Model):
    """
    Denormalized pharmacy queue statistics per facility.

    Updated by PharmacyQueueProjection when prescription/dispensing events arrive.
    """

    facility_id = models.IntegerField(unique=True, db_index=True)
    pending_prescriptions = models.PositiveIntegerField(default=0)
    dispensed_today = models.PositiveIntegerField(default=0)
    critical_stock_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of drugs at zero stock",
    )
    low_stock_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of drugs below reorder level",
    )
    last_updated = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["facility_id"], name="idx_pqs_facility"),
        ]
        verbose_name = "Pharmacy Queue Stats"
        verbose_name_plural = "Pharmacy Queue Stats"

    def __str__(self):
        return f"PharmacyQueueStats(facility={self.facility_id})"


class RoomUtilizationStats(models.Model):
    """
    Denormalized room utilization statistics per room per day.

    Updated by RoomUtilizationProjection from scheduling shift and clinic visit
    events. Powers room operations dashboards without expensive live joins.
    """

    facility_id = models.IntegerField(db_index=True)
    room_id = models.IntegerField(db_index=True)
    clinic_id = models.IntegerField(null=True, blank=True, db_index=True)
    stat_date = models.DateField(db_index=True)
    staffed_minutes = models.PositiveIntegerField(default=0)
    consultation_minutes = models.PositiveIntegerField(default=0)
    utilization_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Consultation time / staffed time * 100",
    )
    visits_completed = models.PositiveIntegerField(default=0)
    no_show_count = models.PositiveIntegerField(default=0)
    avg_wait_to_room_minutes = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        help_text="Average minutes from registration to consultation start",
    )
    avg_consultation_minutes = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        help_text="Average minutes spent in consultation",
    )
    active_clinicians_count = models.PositiveIntegerField(default=0)
    last_updated = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = [("facility_id", "room_id", "stat_date")]
        indexes = [
            models.Index(fields=["facility_id", "stat_date"], name="idx_rus_facility_date"),
            models.Index(fields=["facility_id", "clinic_id"], name="idx_rus_facility_clinic"),
        ]
        verbose_name = "Room Utilization Stats"
        verbose_name_plural = "Room Utilization Stats"

    def __str__(self):
        return (
            f"RoomUtilizationStats(facility={self.facility_id}, room={self.room_id}, "
            f"date={self.stat_date})"
        )
