# Generated migration for Notification model

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_alter_role_category"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                (
                    "id",
                    models.BigAutoField(primary_key=True, serialize=False),
                ),
                (
                    "notification_type",
                    models.CharField(
                        db_index=True,
                        help_text="Category of notification (e.g., 'lab_result', 'appointment')",
                        max_length=50,
                    ),
                ),
                (
                    "priority",
                    models.CharField(
                        choices=[
                            ("low", "Low"),
                            ("normal", "Normal"),
                            ("high", "High"),
                            ("critical", "Critical"),
                        ],
                        db_index=True,
                        default="normal",
                        help_text="Urgency level - critical notifications may trigger emails",
                        max_length=20,
                    ),
                ),
                (
                    "title",
                    models.CharField(help_text="Short notification title", max_length=200),
                ),
                (
                    "message",
                    models.TextField(help_text="Full notification message"),
                ),
                (
                    "related_model",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Model name this notification relates to (e.g., 'LabOrder')",
                        max_length=50,
                    ),
                ),
                (
                    "related_id",
                    models.BigIntegerField(
                        blank=True,
                        help_text="ID of the related object",
                        null=True,
                    ),
                ),
                (
                    "action_url",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="URL for user action (e.g., view results)",
                        max_length=500,
                    ),
                ),
                (
                    "is_read",
                    models.BooleanField(
                        db_index=True,
                        default=False,
                        help_text="Whether notification has been read",
                    ),
                ),
                (
                    "read_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="When notification was marked as read",
                        null=True,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        auto_now_add=True,
                        db_index=True,
                        help_text="When notification was created",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        help_text="User receiving this notification",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Notification",
                "verbose_name_plural": "Notifications",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(
                fields=["user", "is_read", "-created_at"],
                name="core_notifi_user_id_3f3d8f_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(
                fields=["user", "notification_type"],
                name="core_notifi_user_id_af65cd_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(
                fields=["priority", "-created_at"],
                name="core_notifi_priorit_7f3856_idx",
            ),
        ),
    ]
