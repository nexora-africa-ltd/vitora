# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Add the dedicated Django permission used to authorize Vitora FHIR API access.

Apply with:
    python manage.py migrate
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0113_smartoauthclienttenantbinding"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="smartoauthclienttenantbinding",
            options={
                "permissions": [("access_fhir_api", "Can access the FHIR API")],
                "verbose_name": "SMART OAuth client tenant binding",
                "verbose_name_plural": "SMART OAuth client tenant bindings",
            },
        ),
    ]
