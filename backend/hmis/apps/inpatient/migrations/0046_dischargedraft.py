from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0045_admission_public_id"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DischargeDraft",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "discharge_type",
                    models.CharField(
                        choices=[
                            ("NORMAL", "Normal Discharge"),
                            ("AGAINST_ADVICE", "Discharge Against Medical Advice"),
                            ("TRANSFERRED", "Transferred to Another Facility"),
                            ("DECEASED", "Deceased"),
                            ("ABSCONDED", "Absconded"),
                        ],
                        default="NORMAL",
                        max_length=20,
                    ),
                ),
                (
                    "diagnoses",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Draft diagnosis entries (PRIMARY/SECONDARY/COMPLICATION)",
                    ),
                ),
                ("procedures_performed", models.TextField(blank=True, default="")),
                ("treatment_summary", models.TextField(blank=True, default="")),
                ("discharge_medications", models.JSONField(blank=True, default=list)),
                (
                    "maternity_continuity_action",
                    models.CharField(
                        choices=[
                            ("NONE", "No Continuity Action"),
                            ("CONTINUE_POSTPARTUM_OBSERVATION", "Continue Postpartum Observation"),
                            ("SCHEDULE_EARLY_PNC", "Schedule Early PNC"),
                            ("ROUTE_TO_PNC_QUEUE", "Route To PNC Queue"),
                        ],
                        default="NONE",
                        max_length=40,
                    ),
                ),
                ("follow_up_date", models.DateField(blank=True, null=True)),
                ("follow_up_instructions", models.TextField(blank=True, default="")),
                ("referral_facility", models.CharField(blank=True, default="", max_length=255)),
                ("referral_reason", models.TextField(blank=True, default="")),
                ("patient_instructions", models.TextField(blank=True, default="")),
                ("generation_mode", models.CharField(blank=True, default="generate", max_length=20)),
                (
                    "admission",
                    models.OneToOneField(
                        help_text="Admission this draft discharge belongs to",
                        on_delete=models.CASCADE,
                        related_name="discharge_draft",
                        to="inpatient.admission",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="created_discharge_drafts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="updated_discharge_drafts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Discharge Draft",
                "verbose_name_plural": "Discharge Drafts",
                "ordering": ["-updated_at"],
            },
        ),
    ]
