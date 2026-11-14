# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Add the Django permission for FHIR write operations.

Apply with:
    python manage.py migrate
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0114_smartoauthclienttenantbinding_fhir_permission"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="smartoauthclienttenantbinding",
            options={
                "permissions": [
                    ("access_fhir_api", "Can access the FHIR API"),
                    ("write_fhir_api", "Can write to the FHIR API"),
                ],
                "verbose_name": "SMART OAuth client tenant binding",
                "verbose_name_plural": "SMART OAuth client tenant bindings",
            },
        ),
    ]
