from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0048_interfacilitytransfer_permissions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InterFacilityTransferEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("CREATED", "Created"),
                            ("SUBMITTED", "Submitted"),
                            ("ACCEPTED", "Accepted"),
                            ("REJECTED", "Rejected"),
                            ("DISPATCHED", "Dispatched"),
                            ("ARRIVED", "Arrived"),
                            ("AUTO_ADMITTED", "Auto Admitted"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        max_length=24,
                    ),
                ),
                ("from_status", models.CharField(blank=True, default="", max_length=24)),
                ("to_status", models.CharField(blank=True, default="", max_length=24)),
                ("occurred_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("note", models.TextField(blank=True, default="")),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="interfacility_transfer_timeline_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "transfer",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="timeline_events",
                        to="inpatient.interfacilitytransfer",
                    ),
                ),
            ],
            options={
                "verbose_name": "Inter-facility Transfer Event",
                "verbose_name_plural": "Inter-facility Transfer Events",
                "ordering": ["occurred_at", "id"],
            },
        ),
    ]
