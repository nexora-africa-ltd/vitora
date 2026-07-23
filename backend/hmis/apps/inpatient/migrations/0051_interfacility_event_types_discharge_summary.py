from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0050_interfacilitytransfer_destination_admission"),
    ]

    operations = [
        migrations.AlterField(
            model_name="interfacilitytransferevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("CREATED", "Created"),
                    ("SUBMITTED", "Submitted"),
                    ("ACCEPTED", "Accepted"),
                    ("REJECTED", "Rejected"),
                    ("DISPATCHED", "Dispatched"),
                    ("ARRIVED", "Arrived"),
                    ("AUTO_ADMITTED", "Auto Admitted"),
                    ("DISCHARGE_SUMMARY_REQUESTED", "Discharge Summary Requested"),
                    ("DISCHARGE_SUMMARY_SHARED", "Discharge Summary Shared"),
                    ("CANCELLED", "Cancelled"),
                ],
                max_length=40,
            ),
        ),
    ]
