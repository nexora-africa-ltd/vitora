# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0074_add_facility_analytics_procedures"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffprofile",
            name="mfa_disabled",
            field=models.BooleanField(
                default=False,
                help_text="When True, MFA is administratively disabled for this user. Existing devices are NOT deleted — they remain dormant until re-enabled.",
            ),
        ),
    ]
