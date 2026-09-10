# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create auditable subscription billing periods.

Apply with: python manage.py migrate
Inputs: no command arguments; records are created by platform billing workflows.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("core", "0090_add_laboratory_license_fields")]

    operations = [
        migrations.CreateModel(
            name="SubscriptionPeriod",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("billing_interval", models.CharField(choices=[("MONTHLY", "Monthly"), ("ANNUAL", "Annual")], max_length=10)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default="KES", max_length=3)),
                ("period_start", models.DateTimeField()),
                ("period_end", models.DateTimeField()),
                ("status", models.CharField(choices=[("PENDING", "Pending payment"), ("PAID", "Paid"), ("VOID", "Void")], default="PENDING", max_length=10)),
                ("payment_reference", models.CharField(blank=True, max_length=100, unique=True)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("confirmed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="subscription_periods", to="core.organization")),
                ("plan", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="subscription_periods", to="core.subscriptionplan")),
            ],
            options={"ordering": ["-period_end"]},
        ),
        migrations.AddConstraint(
            model_name="subscriptionperiod",
            constraint=models.CheckConstraint(condition=models.Q(period_end__gt=models.F("period_start")), name="subscription_period_end_after_start"),
        ),
    ]
