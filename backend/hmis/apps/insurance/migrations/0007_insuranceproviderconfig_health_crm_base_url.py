"""Add Health CRM host field to provider config.

Use: applied automatically via `python manage.py migrate`.
Inputs: none.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("insurance", "0006_insurancevisitauthorization_eligibility_payload_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="insuranceproviderconfig",
            name="health_crm_base_url",
            field=models.URLField(
                blank=True,
                help_text="Health CRM host for identity profile and health ID APIs",
            ),
        ),
    ]
