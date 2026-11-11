# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create one-time WebSocket tickets.

Applied by: python manage.py migrate
Inputs: no runtime arguments; creates the core WebSocketTicket table.
"""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0102_syncdeferredmaterialization"),
    ]

    operations = [
        migrations.CreateModel(
            name="WebSocketTicket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="websocket_tickets", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name="websocketticket",
            index=models.Index(fields=["expires_at", "consumed_at"], name="core_websoc_expires_0f9b37_idx"),
        ),
    ]
