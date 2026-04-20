from datetime import date

from django.db import migrations


def backfill_theatre_schedules(apps, schema_editor):
    OperatingTheatre = apps.get_model("theatre", "OperatingTheatre")
    Schedule = apps.get_model("scheduling", "Schedule")

    for theatre in OperatingTheatre.objects.select_related("scheduling_resource").all():
        if not theatre.scheduling_resource_id:
            continue

        for day_of_week in range(7):
            tag = f"operating_theatre:{theatre.pk}:day:{day_of_week}"
            schedule = Schedule.objects.filter(
                resource_id=theatre.scheduling_resource_id,
                schedule_type="RECURRING",
                day_of_week=day_of_week,
                notes__contains=tag,
            ).first()
            if schedule:
                schedule.start_time = theatre.operating_hours_start
                schedule.end_time = theatre.operating_hours_end
                schedule.slot_duration_minutes = theatre.slot_duration_minutes
                schedule.buffer_minutes = 0
                schedule.is_active = theatre.is_active
                schedule.notes = f"{tag} — synced from operating theatre {theatre.code}"
                schedule.save(
                    update_fields=[
                        "start_time",
                        "end_time",
                        "slot_duration_minutes",
                        "buffer_minutes",
                        "is_active",
                        "notes",
                        "updated_at",
                    ]
                )
            else:
                Schedule.objects.create(
                    resource_id=theatre.scheduling_resource_id,
                    schedule_type="RECURRING",
                    day_of_week=day_of_week,
                    start_time=theatre.operating_hours_start,
                    end_time=theatre.operating_hours_end,
                    slot_duration_minutes=theatre.slot_duration_minutes,
                    buffer_minutes=0,
                    effective_from=date.today(),
                    is_active=theatre.is_active,
                    notes=f"{tag} — synced from operating theatre {theatre.code}",
                )


class Migration(migrations.Migration):
    dependencies = [
        ("theatre", "0003_operatingtheatre_scheduling_resource"),
        ("scheduling", "0017_add_emergency_clockin_fields"),
    ]

    operations = [
        migrations.RunPython(backfill_theatre_schedules, migrations.RunPython.noop),
    ]
