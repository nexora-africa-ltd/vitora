# Generated migration for ShiftHandover model

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("inpatient", "0007_nursing_kardex"),
    ]

    operations = [
        migrations.CreateModel(
            name="ShiftHandover",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("shift_date", models.DateField(help_text="Date of the shift")),
                (
                    "shift_ending",
                    models.CharField(
                        choices=[
                            ("DAY", "Day Shift (07:00-15:00)"),
                            ("EVENING", "Evening Shift (15:00-23:00)"),
                            ("NIGHT", "Night Shift (23:00-07:00)"),
                        ],
                        help_text="Shift that is ending",
                        max_length=10,
                    ),
                ),
                (
                    "total_patients",
                    models.PositiveIntegerField(help_text="Total patient count in ward"),
                ),
                (
                    "critical_patients",
                    models.PositiveIntegerField(
                        default=0, help_text="Number of critical/unstable patients"
                    ),
                ),
                (
                    "new_admissions",
                    models.PositiveIntegerField(
                        default=0, help_text="Number of new admissions during shift"
                    ),
                ),
                (
                    "discharges_pending",
                    models.PositiveIntegerField(
                        default=0, help_text="Number of pending discharges"
                    ),
                ),
                (
                    "general_notes",
                    models.TextField(blank=True, help_text="General shift notes and observations"),
                ),
                (
                    "acknowledged_at",
                    models.DateTimeField(
                        blank=True, help_text="When incoming nurse acknowledged handover", null=True
                    ),
                ),
                (
                    "incoming_nurse",
                    models.ForeignKey(
                        help_text="Nurse receiving handover",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="handovers_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "outgoing_nurse",
                    models.ForeignKey(
                        help_text="Nurse handing over shift",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="handovers_given",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "ward",
                    models.ForeignKey(
                        help_text="Ward where handover occurs",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shift_handovers",
                        to="inpatient.ward",
                    ),
                ),
            ],
            options={
                "ordering": ["-shift_date", "-created_at"],
                "unique_together": {("ward", "shift_date", "shift_ending")},
                "indexes": [
                    models.Index(
                        fields=["ward", "-shift_date"], name="inpatient_s_ward_id_b8e4df_idx"
                    ),
                    models.Index(
                        fields=["shift_date", "shift_ending"], name="inpatient_s_shift_d_30e72f_idx"
                    ),
                ],
            },
        ),
    ]
