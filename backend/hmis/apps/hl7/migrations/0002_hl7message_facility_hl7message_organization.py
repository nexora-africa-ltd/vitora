import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0040_add_has_inventory_to_facility"),
        ("hl7", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="hl7message",
            name="facility",
            field=models.ForeignKey(
                blank=True,
                help_text="Facility this message belongs to.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="hl7_messages",
                to="core.facility",
            ),
        ),
        migrations.AddField(
            model_name="hl7message",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Organization (auto-set from facility).",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="hl7_messages",
                to="core.organization",
            ),
        ),
    ]
