from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("encounters", "0027_facility_scoped_model_fix"),
        ("mch", "0011_alter_communityscreening_photo_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SocialHistoryObservation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning organization for this record.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="core.organization",
                    ),
                ),
                (
                    "facility",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning facility for this record.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="core.facility",
                    ),
                ),
                ("fhir_id", models.PositiveIntegerField(db_index=True, editable=False, unique=True)),
                (
                    "observation_type",
                    models.CharField(
                        choices=[
                            ("ALCOHOL_USE", "Alcohol use"),
                            ("TOBACCO_USE", "Tobacco use"),
                            ("OCCUPATION", "Occupation"),
                            ("LIFESTYLE", "Lifestyle"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("CURRENT", "Current use"),
                            ("FORMER", "Former use"),
                            ("NEVER", "Never used"),
                            ("UNKNOWN", "Unknown"),
                        ],
                        default="UNKNOWN",
                        max_length=20,
                    ),
                ),
                ("value_text", models.TextField(blank=True, default="")),
                ("effective_date", models.DateField(default=django.utils.timezone.localdate)),
                (
                    "encounter",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="social_history_observations",
                        to="encounters.encounter",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="social_history_observations",
                        to="patients.patient",
                    ),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="recorded_social_history_observations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-effective_date", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PregnancyObservation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning organization for this record.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="core.organization",
                    ),
                ),
                (
                    "facility",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning facility for this record.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="core.facility",
                    ),
                ),
                ("fhir_id", models.PositiveIntegerField(db_index=True, editable=False, unique=True)),
                (
                    "observation_type",
                    models.CharField(
                        choices=[
                            ("PREGNANCY_STATUS", "Pregnancy status"),
                            ("PREGNANCY_EXPECTED_DELIVERY_DATE", "Estimated delivery date"),
                            ("PREGNANCY_OUTCOME", "Pregnancy outcome"),
                        ],
                        max_length=40,
                    ),
                ),
                (
                    "status_value",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("PREGNANT", "Pregnant"),
                            ("POSTPARTUM", "Postpartum"),
                            ("NOT_PREGNANT", "Not pregnant"),
                            ("UNKNOWN", "Unknown"),
                            ("LIVE_BIRTH", "Live birth"),
                            ("STILLBIRTH", "Stillbirth"),
                            ("MISCARRIAGE", "Miscarriage"),
                            ("ABORTION", "Abortion"),
                            ("ECTOPIC", "Ectopic pregnancy"),
                        ],
                        default="",
                        max_length=20,
                    ),
                ),
                ("value_date", models.DateField(blank=True, null=True)),
                ("effective_date", models.DateField(default=django.utils.timezone.localdate)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "delivery",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pregnancy_observations",
                        to="mch.delivery",
                    ),
                ),
                (
                    "encounter",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pregnancy_observations",
                        to="encounters.encounter",
                    ),
                ),
                (
                    "mch_registration",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pregnancy_observations",
                        to="mch.mchregistration",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pregnancy_observations",
                        to="patients.patient",
                    ),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="recorded_pregnancy_observations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-effective_date", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="socialhistoryobservation",
            index=models.Index(fields=["fhir_id"], name="encounters__fhir_id_39ba5f_idx"),
        ),
        migrations.AddIndex(
            model_name="socialhistoryobservation",
            index=models.Index(fields=["patient", "observation_type"], name="encounters__patient__fa5a5d_idx"),
        ),
        migrations.AddIndex(
            model_name="pregnancyobservation",
            index=models.Index(fields=["fhir_id"], name="encounters__fhir_id_ee8ccd_idx"),
        ),
        migrations.AddIndex(
            model_name="pregnancyobservation",
            index=models.Index(fields=["patient", "observation_type"], name="encounters__patient__a5dfdc_idx"),
        ),
    ]
