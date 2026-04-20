from django.db import migrations, models


def backfill_theatre_scheduling_resources(apps, schema_editor):
    OperatingTheatre = apps.get_model("theatre", "OperatingTheatre")
    Resource = apps.get_model("scheduling", "Resource")

    for theatre in OperatingTheatre.objects.select_related("facility", "organization").all():
        if theatre.scheduling_resource_id or not theatre.facility_id:
            continue

        code = f"THEATRE-{theatre.code}"
        if Resource.objects.filter(code=code, facility_id=theatre.facility_id).exists():
            code = f"THEATRE-{theatre.pk}"

        resource = Resource.objects.create(
            name=theatre.name,
            resource_type="PLACE",
            code=code,
            is_active=theatre.is_active,
            capacity=1,
            description=theatre.maintenance_notes or theatre.equipment_notes or theatre.location,
            facility_id=theatre.facility_id,
            organization_id=theatre.organization_id,
            metadata={
                "synced_from": "operating_theatre",
                "source_code": theatre.code,
                "theatre_type": theatre.theatre_type,
                "location": theatre.location,
            },
        )
        theatre.scheduling_resource_id = resource.pk
        theatre.save(update_fields=["scheduling_resource"])


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0017_add_emergency_clockin_fields"),
        ("theatre", "0002_alter_operatingtheatre_operating_hours_end_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="operatingtheatre",
            name="scheduling_resource",
            field=models.ForeignKey(
                blank=True,
                help_text="Linked scheduling PLACE resource for integrated theatre scheduling.",
                limit_choices_to={"resource_type": "PLACE"},
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="operating_theatres",
                to="scheduling.resource",
            ),
        ),
        migrations.RunPython(
            backfill_theatre_scheduling_resources,
            migrations.RunPython.noop,
        ),
    ]
