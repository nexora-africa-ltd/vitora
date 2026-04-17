import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0040_add_has_inventory_to_facility"),
        ("laboratory", "0019_seed_loinc_codes"),
    ]

    operations = [
        migrations.AddField(
            model_name="instrument",
            name="facility",
            field=models.ForeignKey(
                blank=True,
                help_text="Facility where this instrument is located.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="instruments",
                to="core.facility",
            ),
        ),
        migrations.AddField(
            model_name="instrument",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Organization (auto-set from facility).",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="instruments",
                to="core.organization",
            ),
        ),
    ]
