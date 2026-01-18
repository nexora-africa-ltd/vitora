# Generated manually for triage app

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("encounters", "0001_initial"),  # Assuming encounters has initial migration
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TriageVitalThreshold",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "vital_type",
                    models.CharField(
                        choices=[
                            ("SPO2", "Oxygen Saturation (%)"),
                            ("SYSTOLIC_BP", "Systolic Blood Pressure (mmHg)"),
                            ("DIASTOLIC_BP", "Diastolic Blood Pressure (mmHg)"),
                            ("HEART_RATE", "Heart Rate (bpm)"),
                            ("TEMPERATURE", "Temperature (°C)"),
                            ("RESPIRATORY_RATE", "Respiratory Rate (breaths/min)"),
                        ],
                        help_text="Type of vital sign",
                        max_length=30,
                        unique=True,
                    ),
                ),
                (
                    "critical_low",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Value below this triggers critical alert",
                        max_digits=6,
                        null=True,
                    ),
                ),
                (
                    "warning_low",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Value below this triggers warning",
                        max_digits=6,
                        null=True,
                    ),
                ),
                (
                    "warning_high",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Value above this triggers warning",
                        max_digits=6,
                        null=True,
                    ),
                ),
                (
                    "critical_high",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Value above this triggers critical alert",
                        max_digits=6,
                        null=True,
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(default=True, help_text="Whether this threshold is active"),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Triage Vital Threshold",
                "verbose_name_plural": "Triage Vital Thresholds",
                "ordering": ["vital_type"],
            },
        ),
        migrations.CreateModel(
            name="TriageAssessment",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("chief_complaint", models.TextField(help_text="Primary reason for visit")),
                (
                    "chief_complaint_category",
                    models.CharField(
                        choices=[
                            ("CHEST_PAIN", "Chest Pain"),
                            ("DIFFICULTY_BREATHING", "Difficulty Breathing"),
                            ("TRAUMA", "Trauma/Injury"),
                            ("FEVER", "Fever"),
                            ("ABDOMINAL_PAIN", "Abdominal Pain"),
                            ("HEADACHE", "Headache"),
                            ("ALTERED_CONSCIOUSNESS", "Altered Consciousness"),
                            ("BLEEDING", "Bleeding"),
                            ("POISONING", "Poisoning/Overdose"),
                            ("OBSTETRIC", "Obstetric Emergency"),
                            ("PEDIATRIC", "Pediatric Emergency"),
                            ("OTHER", "Other"),
                        ],
                        help_text="Chief complaint category",
                        max_length=50,
                    ),
                ),
                (
                    "pain_score",
                    models.IntegerField(
                        blank=True,
                        help_text="Pain level 0-10",
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(0),
                            django.core.validators.MaxValueValidator(10),
                        ],
                    ),
                ),
                (
                    "mental_status",
                    models.CharField(
                        choices=[
                            ("A", "Alert"),
                            ("V", "Responds to Voice"),
                            ("P", "Responds to Pain"),
                            ("U", "Unresponsive"),
                        ],
                        help_text="AVPU mental status scale",
                        max_length=1,
                    ),
                ),
                (
                    "mobility",
                    models.CharField(
                        choices=[
                            ("AMBULATORY", "Ambulatory"),
                            ("WHEELCHAIR", "Wheelchair"),
                            ("STRETCHER", "Stretcher"),
                            ("IMMOBILE", "Immobile/Carried"),
                        ],
                        help_text="Patient mobility status",
                        max_length=20,
                    ),
                ),
                (
                    "arrival_mode",
                    models.CharField(
                        choices=[
                            ("WALK_IN", "Walk-in"),
                            ("AMBULANCE", "Ambulance"),
                            ("POLICE", "Police"),
                            ("REFERRAL", "Referral from another facility"),
                            ("OTHER", "Other"),
                        ],
                        default="WALK_IN",
                        help_text="How patient arrived",
                        max_length=20,
                    ),
                ),
                (
                    "allergies_noted",
                    models.TextField(
                        blank=True,
                        default="",
                        help_text="Allergies noted at triage (snapshot from patient record)",
                    ),
                ),
                (
                    "triage_category",
                    models.CharField(
                        choices=[
                            ("RED", "Emergency - Immediate"),
                            ("ORANGE", "Very Urgent - <10 min"),
                            ("YELLOW", "Urgent - <60 min"),
                            ("GREEN", "Standard - <240 min"),
                            ("BLUE", "Non-Urgent/Referral"),
                        ],
                        help_text="Final triage category",
                        max_length=10,
                    ),
                ),
                (
                    "auto_calculated_category",
                    models.CharField(
                        choices=[
                            ("RED", "Emergency - Immediate"),
                            ("ORANGE", "Very Urgent - <10 min"),
                            ("YELLOW", "Urgent - <60 min"),
                            ("GREEN", "Standard - <240 min"),
                            ("BLUE", "Non-Urgent/Referral"),
                        ],
                        help_text="System-suggested category before nurse override",
                        max_length=10,
                    ),
                ),
                (
                    "category_override_reason",
                    models.TextField(
                        blank=True,
                        default="",
                        help_text="Required if nurse overrides system suggestion",
                    ),
                ),
                (
                    "assigned_area",
                    models.CharField(
                        choices=[
                            ("ER_RESUS", "ER - Resuscitation"),
                            ("ER_ACUTE", "ER - Acute Care"),
                            ("ER_FAST_TRACK", "ER - Fast Track"),
                            ("OBSERVATION", "Observation Unit"),
                            ("OPD", "Outpatient Department"),
                            ("TRAUMA", "Trauma Bay"),
                            ("PEDIATRIC_ER", "Pediatric ER"),
                            ("MATERNITY", "Maternity/Labor"),
                            ("SPECIALTY", "Specialty Clinic"),
                        ],
                        help_text="Care area assignment",
                        max_length=30,
                    ),
                ),
                (
                    "arrival_time",
                    models.DateTimeField(help_text="When patient arrived at facility"),
                ),
                (
                    "triage_start_time",
                    models.DateTimeField(help_text="When triage assessment began"),
                ),
                (
                    "triage_end_time",
                    models.DateTimeField(blank=True, help_text="When triage completed", null=True),
                ),
                (
                    "seen_by_clinician_time",
                    models.DateTimeField(
                        blank=True, help_text="When patient was seen by clinician", null=True
                    ),
                ),
                (
                    "alerts",
                    models.JSONField(
                        blank=True, default=list, help_text="List of critical alerts generated"
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "assigned_clinician",
                    models.ForeignKey(
                        blank=True,
                        help_text="Clinician assigned to this patient",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="triage_assignments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "encounter",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="triage_assessment",
                        to="encounters.encounter",
                    ),
                ),
                (
                    "triaged_by",
                    models.ForeignKey(
                        help_text="User who performed triage",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="triage_assessments_performed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Triage Assessment",
                "verbose_name_plural": "Triage Assessments",
                "ordering": ["-arrival_time"],
                "permissions": [
                    ("perform_triage", "Can perform triage assessments"),
                    ("view_triage_queue", "Can view triage queue"),
                    ("override_triage_category", "Can override triage category"),
                ],
            },
        ),
        migrations.CreateModel(
            name="TriageQueue",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "position",
                    models.IntegerField(help_text="Queue position (auto-calculated by priority)"),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("WAITING", "Waiting"),
                            ("CALLED", "Called"),
                            ("WITH_CLINICIAN", "With Clinician"),
                            ("COMPLETED", "Completed"),
                            ("LEFT_WITHOUT_BEING_SEEN", "Left Without Being Seen (LWBS)"),
                        ],
                        default="WAITING",
                        max_length=30,
                    ),
                ),
                ("called_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "called_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="queue_calls",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "triage_assessment",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="queue_entry",
                        to="triage.triageassessment",
                    ),
                ),
            ],
            options={
                "verbose_name": "Triage Queue Entry",
                "verbose_name_plural": "Triage Queue Entries",
                "ordering": [
                    "triage_assessment__triage_category",
                    "triage_assessment__arrival_time",
                ],
            },
        ),
    ]
