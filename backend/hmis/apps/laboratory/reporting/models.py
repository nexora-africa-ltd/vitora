"""
L5: TAT Monitoring, SLA Targets, Workload & Productivity models.

These models persist TAT breakdowns and SLA definitions, enabling
trend analysis, breach detection, and monthly KPI reporting.
"""

import logging

from django.contrib.auth import get_user_model
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel

logger = logging.getLogger(__name__)

User = get_user_model()


class TATSLATarget(FacilityScopedModel):
    """SLA target for turnaround time per test and priority.

    Each facility can set different TAT targets for the same test
    depending on priority (e.g., STAT glucose = 1h, ROUTINE = 4h).
    """

    class Priority(models.TextChoices):
        ROUTINE = "ROUTINE", "Routine"
        URGENT = "URGENT", "Urgent"
        STAT = "STAT", "STAT"

    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.CASCADE,
        related_name="sla_targets",
    )
    priority = models.CharField(max_length=10, choices=Priority.choices)

    # Target minutes for each TAT segment (nullable = not tracked)
    target_order_to_collect_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Target minutes from order placed to specimen collected",
    )
    target_collect_to_receive_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Target minutes from specimen collected to lab receipt",
    )
    target_receive_to_result_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Target minutes from lab receipt to result entry",
    )
    target_result_to_verify_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Target minutes from result entry to verification",
    )
    target_total_minutes = models.PositiveIntegerField(
        help_text="Target minutes for total turnaround (order to verification/release)",
    )

    # Escalation
    breach_escalation_email = models.EmailField(
        blank=True,
        help_text="Email to notify on SLA breach (optional)",
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "TAT SLA Target"
        verbose_name_plural = "TAT SLA Targets"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "test", "priority"],
                name="unique_sla_target_per_facility_test_priority",
            ),
        ]
        ordering = ["test__name", "priority"]

    def __str__(self):
        return f"{self.test.code} [{self.priority}] -> {self.target_total_minutes}min"


class TATSnapshot(FacilityScopedModel):
    """Persistent TAT breakdown for a completed/released lab order.

    Created by signal when an order reaches COMPLETED status or queue is RELEASED.
    Stores each TAT segment in minutes for fast aggregation and trend analysis.
    """

    lab_order = models.OneToOneField(
        "laboratory.LabOrder",
        on_delete=models.CASCADE,
        related_name="tat_snapshot",
    )
    test = models.ForeignKey(
        "laboratory.TestCatalog",
        on_delete=models.SET_NULL,
        null=True,
        related_name="tat_snapshots",
    )
    priority = models.CharField(max_length=10, choices=TATSLATarget.Priority.choices)

    # Timestamps (denormalized from order/specimen/result for query speed)
    ordered_at = models.DateTimeField()
    collected_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    resulted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    # Computed TAT segments (minutes, null if timestamps missing)
    tat_order_to_collect = models.FloatField(
        null=True, blank=True, help_text="Minutes from order to collection"
    )
    tat_collect_to_receive = models.FloatField(
        null=True, blank=True, help_text="Minutes from collection to receipt"
    )
    tat_receive_to_result = models.FloatField(
        null=True, blank=True, help_text="Minutes from receipt to result entry"
    )
    tat_result_to_verify = models.FloatField(
        null=True, blank=True, help_text="Minutes from result entry to verification"
    )
    tat_total = models.FloatField(null=True, blank=True, help_text="Minutes total (order to final)")

    # SLA compliance
    sla_target = models.ForeignKey(
        TATSLATarget,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="snapshots",
    )
    is_breach = models.BooleanField(
        default=False, help_text="True if total TAT exceeded SLA target"
    )
    breach_minutes = models.FloatField(
        null=True, blank=True, help_text="Minutes over SLA target (positive = breach)"
    )

    # Who completed
    resulted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tat_resulted",
    )
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tat_verified",
    )

    snapshot_created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "TAT Snapshot"
        verbose_name_plural = "TAT Snapshots"
        ordering = ["-ordered_at"]
        indexes = [
            models.Index(fields=["facility", "ordered_at"]),
            models.Index(fields=["test", "priority"]),
            models.Index(fields=["is_breach"]),
            models.Index(fields=["ordered_at"]),
        ]

    def __str__(self):
        breach = " BREACH" if self.is_breach else ""
        total = f"{self.tat_total:.0f}min" if self.tat_total else "?"
        return f"{self.lab_order.order_number} {total}{breach}"

    @classmethod
    def create_from_order(cls, lab_order):
        """Create a TAT snapshot from a completed lab order.

        Gathers timestamps from order, specimen, result, and queue.
        Computes TAT segments and checks SLA compliance.
        """
        from hmis.apps.laboratory.models import LabQueue

        # Get primary test (first order item)
        first_item = lab_order.items.select_related("test").first()
        test = first_item.test if first_item else None
        priority = lab_order.priority or "ROUTINE"

        # Gather timestamps
        ordered_at = lab_order.ordered_at
        collected_at = lab_order.specimen_collected_at

        # Get specimen received_at
        received_at = None
        try:
            specimen = lab_order.specimens.first()
            if specimen:
                received_at = specimen.received_at
        except Exception:  # noqa: S110
            logger.debug("Could not fetch specimen for order %s", lab_order.pk)

        # Get result timestamps (from first result)
        resulted_at = None
        verified_at = None
        resulted_by = None
        verified_by_user = None
        if first_item:
            try:
                result = first_item.result
                resulted_at = result.entered_at
                verified_at = result.verified_at
                resulted_by = result.entered_by
                verified_by_user = result.verified_by
            except Exception:  # noqa: S110
                logger.debug("Could not fetch result for order %s", lab_order.pk)

        # Get queue released_at
        released_at = None
        try:
            queue = LabQueue.objects.get(lab_order=lab_order)
            released_at = queue.released_at
        except LabQueue.DoesNotExist:
            pass

        # Compute TAT segments (in minutes)
        def _minutes_between(start, end):
            if start and end:
                delta = (end - start).total_seconds() / 60.0
                return round(delta, 2) if delta >= 0 else None
            return None

        tat_order_to_collect = _minutes_between(ordered_at, collected_at)
        tat_collect_to_receive = _minutes_between(collected_at, received_at)
        tat_receive_to_result = _minutes_between(received_at, resulted_at)
        tat_result_to_verify = _minutes_between(resulted_at, verified_at)

        # Total = order to last available timestamp
        final_time = released_at or verified_at or resulted_at
        tat_total = _minutes_between(ordered_at, final_time)

        # Check SLA
        sla_target = None
        is_breach = False
        breach_minutes = None
        if test:
            sla_target = TATSLATarget.objects.filter(
                facility=lab_order.facility,
                test=test,
                priority=priority,
                is_active=True,
            ).first()
        if sla_target and tat_total is not None and tat_total > sla_target.target_total_minutes:
            is_breach = True
            breach_minutes = round(tat_total - sla_target.target_total_minutes, 2)

        snapshot, _created = cls.objects.update_or_create(
            lab_order=lab_order,
            defaults={
                "facility": lab_order.facility,
                "organization": lab_order.organization,
                "test": test,
                "priority": priority,
                "ordered_at": ordered_at,
                "collected_at": collected_at,
                "received_at": received_at,
                "resulted_at": resulted_at,
                "verified_at": verified_at,
                "released_at": released_at,
                "tat_order_to_collect": tat_order_to_collect,
                "tat_collect_to_receive": tat_collect_to_receive,
                "tat_receive_to_result": tat_receive_to_result,
                "tat_result_to_verify": tat_result_to_verify,
                "tat_total": tat_total,
                "sla_target": sla_target,
                "is_breach": is_breach,
                "breach_minutes": breach_minutes,
                "resulted_by": resulted_by,
                "verified_by": verified_by_user,
            },
        )
        return snapshot


class WorkloadSnapshot(FacilityScopedModel):
    """Daily workload summary per technician.

    Aggregated nightly (or on-demand) for fast KPI dashboards.
    """

    date = models.DateField()
    technician = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="workload_snapshots",
    )

    # Volume metrics
    tests_entered = models.PositiveIntegerField(default=0)
    tests_verified = models.PositiveIntegerField(default=0)
    specimens_collected = models.PositiveIntegerField(default=0)
    specimens_rejected = models.PositiveIntegerField(default=0)

    # Efficiency metrics
    avg_entry_time_minutes = models.FloatField(
        null=True, blank=True, help_text="Average time to enter result after receipt"
    )
    avg_verify_time_minutes = models.FloatField(
        null=True, blank=True, help_text="Average time to verify after entry"
    )

    # Critical value metrics
    critical_results_count = models.PositiveIntegerField(default=0)
    critical_notified_within_30min = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Workload Snapshot"
        verbose_name_plural = "Workload Snapshots"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "date", "technician"],
                name="unique_workload_per_facility_date_tech",
            ),
        ]
        ordering = ["-date", "technician__last_name"]
        indexes = [
            models.Index(fields=["facility", "date"]),
            models.Index(fields=["technician", "date"]),
        ]

    def __str__(self):
        name = self.technician.get_full_name() or self.technician.username
        return f"{name} {self.date}: {self.tests_entered}E/{self.tests_verified}V"

    @property
    def rejection_rate(self):
        total = self.specimens_collected + self.specimens_rejected
        if total == 0:
            return 0.0
        return round((self.specimens_rejected / total) * 100, 2)

    @property
    def critical_compliance_rate(self):
        if self.critical_results_count == 0:
            return 100.0
        return round((self.critical_notified_within_30min / self.critical_results_count) * 100, 2)
