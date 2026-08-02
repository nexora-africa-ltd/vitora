from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0083_facility_hdu_nbu_flags"),
        (
            "imaging",
            "0012_rename_imaging_rad_supersede_idx_imaging_rad_superse_750b23_idx",
        ),
    ]

    operations = [
        migrations.CreateModel(
            name="ImagingIntegrationSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("origin_hub_id", models.CharField(blank=True, db_index=True, max_length=64, null=True)),
                (
                    "origin_local_id",
                    models.BigIntegerField(
                        blank=True,
                        help_text="Primary key on source hub (for sync idempotency)",
                        null=True,
                    ),
                ),
                (
                    "listener_enabled",
                    models.BooleanField(
                        default=False,
                        help_text="Whether this facility expects inbound DICOM C-STORE pushes.",
                    ),
                ),
                (
                    "ae_title",
                    models.CharField(
                        default="VITORA",
                        help_text="DICOM Called AE Title for this facility listener.",
                        max_length=16,
                    ),
                ),
                (
                    "bind_host",
                    models.CharField(
                        default="0.0.0.0",
                        help_text="Host/interface the listener should bind to.",
                        max_length=255,
                    ),
                ),
                (
                    "port",
                    models.PositiveIntegerField(
                        default=11112,
                        help_text="TCP port for inbound DICOM associations.",
                        validators=[
                            django.core.validators.MinValueValidator(1),
                            django.core.validators.MaxValueValidator(65535),
                        ],
                    ),
                ),
                (
                    "allowed_peers",
                    models.TextField(
                        blank=True,
                        default="",
                        help_text="Comma-separated allow-list of calling AE titles. Empty means allow all.",
                    ),
                ),
                (
                    "notes",
                    models.TextField(
                        blank=True,
                        default="",
                        help_text="Operational notes for implementers (firewall, NAT, vendor details).",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "facility",
                    models.ForeignKey(
                        blank=True,
                        help_text="Facility (branch) where this record was created.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="imaging_imagingintegrationsettings_set",
                        to="core.facility",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning organization (tenant).",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="imaging_imagingintegrationsettings_set",
                        to="core.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "Imaging Integration Settings",
                "verbose_name_plural": "Imaging Integration Settings",
            },
        ),
        migrations.AddConstraint(
            model_name="imagingintegrationsettings",
            constraint=models.UniqueConstraint(
                fields=("facility",),
                name="unique_imaging_integration_settings_per_facility",
            ),
        ),
    ]
