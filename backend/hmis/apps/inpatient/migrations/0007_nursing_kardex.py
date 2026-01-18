# Generated manually for NursingKardex models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("inpatient", "0006_wardround"),
    ]

    operations = [
        migrations.CreateModel(
            name="NursingKardex",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "nursing_problems",
                    models.TextField(blank=True, help_text="Identified nursing problems/diagnoses"),
                ),
                (
                    "interventions",
                    models.TextField(
                        blank=True, help_text="Nursing interventions and care activities"
                    ),
                ),
                (
                    "monitoring_requirements",
                    models.TextField(blank=True, help_text="What to monitor and how often"),
                ),
                (
                    "care_task_frequency",
                    models.TextField(
                        blank=True, help_text="Frequency of care tasks (e.g., 'Wound dressing BD')"
                    ),
                ),
                (
                    "fall_risk",
                    models.CharField(
                        choices=[("LOW", "Low"), ("MODERATE", "Moderate"), ("HIGH", "High")],
                        default="LOW",
                        help_text="Patient fall risk level",
                        max_length=20,
                    ),
                ),
                (
                    "pressure_sore_risk",
                    models.CharField(
                        choices=[("LOW", "Low"), ("MODERATE", "Moderate"), ("HIGH", "High")],
                        default="LOW",
                        help_text="Pressure sore risk level",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "admission",
                    models.OneToOneField(
                        help_text="One Kardex per admission",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="kardex",
                        to="inpatient.admission",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Nursing Kardexes",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="KardexShiftNote",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "shift",
                    models.CharField(
                        choices=[("DAY", "Day Shift"), ("NIGHT", "Night Shift")],
                        help_text="Which shift this note is from",
                        max_length=10,
                    ),
                ),
                (
                    "content",
                    models.TextField(
                        help_text="Shift note content - observations, care provided, patient status"
                    ),
                ),
                (
                    "timestamp",
                    models.DateTimeField(
                        auto_now_add=True, help_text="When this note was created (immutable)"
                    ),
                ),
                (
                    "kardex",
                    models.ForeignKey(
                        help_text="Kardex this note belongs to",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shift_notes",
                        to="inpatient.nursingkardex",
                    ),
                ),
                (
                    "nurse",
                    models.ForeignKey(
                        help_text="Nurse who created this note",
                        on_delete=django.db.models.deletion.PROTECT,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-timestamp"],
            },
        ),
        migrations.CreateModel(
            name="KardexHandoverNote",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "shift_ending",
                    models.CharField(help_text="Which shift is ending (DAY/NIGHT)", max_length=10),
                ),
                (
                    "pending_tasks",
                    models.TextField(help_text="Tasks that need completion in next shift"),
                ),
                (
                    "escalations",
                    models.TextField(
                        blank=True, help_text="Issues escalated to doctors or management"
                    ),
                ),
                (
                    "acknowledged_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="When incoming nurse acknowledged the handover",
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "incoming_nurse",
                    models.ForeignKey(
                        help_text="Nurse starting their shift",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="kardex_handovers_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "kardex",
                    models.ForeignKey(
                        help_text="Kardex this handover belongs to",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="handover_notes",
                        to="inpatient.nursingkardex",
                    ),
                ),
                (
                    "outgoing_nurse",
                    models.ForeignKey(
                        help_text="Nurse ending their shift",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="kardex_handovers_given",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="kardexshiftnote",
            index=models.Index(
                fields=["kardex", "-timestamp"], name="inpatient_k_kardex__7c8cd9_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="kardexshiftnote",
            index=models.Index(fields=["shift", "-timestamp"], name="inpatient_k_shift_8b38a4_idx"),
        ),
        migrations.AddIndex(
            model_name="kardexhandovernote",
            index=models.Index(
                fields=["kardex", "-created_at"], name="inpatient_k_kardex__a5f2e1_idx"
            ),
        ),
    ]
