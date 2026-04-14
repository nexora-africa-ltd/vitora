"""
Backfill scheduling resources and schedules for existing clinics.

For each Clinic that has a facility but no scheduling_resource:
  1. Create a scheduling.Resource (PLACE type)
  2. Link it via Clinic.scheduling_resource

For each ClinicSchedule whose clinic has a scheduling_resource:
  1. Create/update a scheduling.Schedule (RECURRING type) mirroring the hours

Usage:
    python manage.py sync_clinic_schedules             # Full backfill
    python manage.py sync_clinic_schedules --dry-run    # Preview only
    python manage.py sync_clinic_schedules --clinic OPD-DEFAULT  # Specific clinic
"""

from django.core.management.base import BaseCommand

from hmis.apps.clinics.models import Clinic, ClinicSchedule
from hmis.apps.scheduling.models import Resource, Schedule


class Command(BaseCommand):
    help = "Backfill scheduling resources and schedules for existing clinics."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without writing to the database.",
        )
        parser.add_argument(
            "--clinic",
            type=str,
            default=None,
            help="Only process a specific clinic by code.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        clinic_code = options.get("clinic")

        clinics = Clinic.objects.filter(facility__isnull=False)
        if clinic_code:
            clinics = clinics.filter(code=clinic_code)

        resources_created = 0
        schedules_created = 0
        schedules_updated = 0

        for clinic in clinics.select_related("facility", "organization", "scheduling_resource"):
            # Step 1: Ensure scheduling resource exists
            if not clinic.scheduling_resource_id:
                code = f"CLINIC-{clinic.code}"
                if dry_run:
                    self.stdout.write(
                        f"  [DRY-RUN] Would create Resource '{code}' for {clinic.name}"
                    )
                else:
                    resource = Resource.objects.create(
                        name=clinic.name,
                        resource_type="PLACE",
                        code=code,
                        is_active=clinic.status == "ACTIVE",
                        capacity=clinic.capacity,
                        facility=clinic.facility,
                        organization=clinic.organization,
                        description=f"Auto-created for clinic: {clinic.name}",
                    )
                    Clinic.objects.filter(pk=clinic.pk).update(scheduling_resource=resource)
                    clinic.scheduling_resource = resource
                    self.stdout.write(f"  Created Resource '{code}' for {clinic.name}")
                resources_created += 1

            resource = clinic.scheduling_resource
            if not resource:
                continue

            # Step 2: Sync ClinicSchedule → scheduling.Schedule
            for cs in ClinicSchedule.objects.filter(clinic=clinic):
                tag = f"clinic_schedule:{cs.pk}"
                existing = Schedule.objects.filter(
                    resource=resource,
                    schedule_type="RECURRING",
                    day_of_week=cs.day_of_week,
                    notes__contains=tag,
                ).first()

                if existing:
                    if dry_run:
                        self.stdout.write(
                            f"  [DRY-RUN] Would update Schedule #{existing.pk} "
                            f"({cs.get_day_of_week_display()} {cs.start_time}-{cs.end_time})"
                        )
                    else:
                        existing.start_time = cs.start_time
                        existing.end_time = cs.end_time
                        existing.is_active = cs.is_active
                        existing.max_appointments = cs.max_patients
                        existing.notes = f"{tag} — {cs.notes}".strip()
                        existing.save(
                            update_fields=[
                                "start_time",
                                "end_time",
                                "is_active",
                                "max_appointments",
                                "notes",
                                "updated_at",
                            ]
                        )
                        self.stdout.write(
                            f"  Updated Schedule #{existing.pk} "
                            f"({cs.get_day_of_week_display()} {cs.start_time}-{cs.end_time})"
                        )
                    schedules_updated += 1
                else:
                    if dry_run:
                        self.stdout.write(
                            f"  [DRY-RUN] Would create Schedule for {clinic.name} "
                            f"{cs.get_day_of_week_display()} {cs.start_time}-{cs.end_time}"
                        )
                    else:
                        Schedule.objects.create(
                            resource=resource,
                            schedule_type="RECURRING",
                            day_of_week=cs.day_of_week,
                            start_time=cs.start_time,
                            end_time=cs.end_time,
                            slot_duration_minutes=30,
                            buffer_minutes=0,
                            is_active=cs.is_active,
                            max_appointments=cs.max_patients,
                            notes=f"{tag} — {cs.notes}".strip(),
                        )
                        self.stdout.write(
                            f"  Created Schedule for {clinic.name} "
                            f"{cs.get_day_of_week_display()} {cs.start_time}-{cs.end_time}"
                        )
                    schedules_created += 1

        prefix = "[DRY-RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{prefix}Done: "
                f"{resources_created} resource(s), "
                f"{schedules_created} schedule(s) created, "
                f"{schedules_updated} schedule(s) updated."
            )
        )
