from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0049_interfacilitytransferevent"),
    ]

    operations = [
        migrations.AddField(
            model_name="interfacilitytransfer",
            name="destination_admission",
            field=models.ForeignKey(
                blank=True,
                help_text="Admission created at destination facility for this transfer workflow.",
                null=True,
                on_delete=models.SET_NULL,
                related_name="destination_interfacility_transfers",
                to="inpatient.admission",
            ),
        ),
    ]
