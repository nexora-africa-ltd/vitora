import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0079_facility_level_subtype"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentShare",
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
                ("document_type", models.CharField(db_index=True, max_length=50)),
                ("document_id", models.BigIntegerField(db_index=True)),
                (
                    "permission",
                    models.CharField(
                        choices=[("VIEW", "View"), ("SIGN", "Sign")],
                        db_index=True,
                        default="VIEW",
                        max_length=10,
                    ),
                ),
                ("note", models.TextField(blank=True, default="")),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "revoked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="document_shares_revoked",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "shared_by",
                    models.ForeignKey(
                        help_text="User who shared the document",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="document_shares_sent",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "shared_with",
                    models.ForeignKey(
                        help_text="User who received access to the document",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="document_shares_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Document Share",
                "verbose_name_plural": "Document Shares",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="documentshare",
            index=models.Index(
                fields=["document_type", "document_id"],
                name="core_docume_documen_918fdd_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="documentshare",
            index=models.Index(
                fields=["shared_with", "permission"],
                name="core_docume_shared__3d1a91_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="documentshare",
            index=models.Index(fields=["shared_by"], name="core_docume_shared__267505_idx"),
        ),
        migrations.AddConstraint(
            model_name="documentshare",
            constraint=models.UniqueConstraint(
                condition=models.Q(("revoked_at__isnull", True)),
                fields=("document_type", "document_id", "shared_with"),
                name="unique_active_document_share",
            ),
        ),
    ]
