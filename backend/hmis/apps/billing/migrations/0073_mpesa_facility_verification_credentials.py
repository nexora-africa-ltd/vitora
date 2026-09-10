# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Store facility-specific Daraja verification credentials.

Use manage.py migrate; no custom inputs. Global secrets are deliberately not copied.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing", "0072_billingautomationrule_billingautomationexecution_and_more")]

    operations = [
        migrations.AddField(
            model_name="facilitybillingconfig",
            name="mpesa_initiator_name",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="facilitybillingconfig",
            name="mpesa_security_credential_encrypted",
            field=models.TextField(blank=True, default=""),
        ),
    ]
