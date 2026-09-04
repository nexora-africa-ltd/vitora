# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Migration for standalone subscription tier codes.

What this file is for:
- Expands tier/resolved plan choices and field lengths to support standalone plan codes.

How to use it:
- Applied automatically via Django migrations.

Supported inputs/args:
- `python manage.py migrate` (no custom args).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0087_country_facility_country_code_facility_district_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="organization",
            name="subscription_tier",
            field=models.CharField(
                choices=[
                    ("FREE", "Free"),
                    ("BASIC", "Basic"),
                    ("PROFESSIONAL", "Professional"),
                    ("ENTERPRISE", "Enterprise"),
                    ("LIS_STANDALONE", "Standalone Laboratory"),
                    ("PHARMACY_STANDALONE", "Standalone Pharmacy"),
                    ("IMAGING_STANDALONE", "Standalone Imaging"),
                    ("DIAGNOSTIC_STANDALONE", "Standalone Diagnostic Centre"),
                ],
                default="FREE",
                editable=False,
                help_text="Derived from subscription_plan.code — do not set directly.",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="pricingquotesnapshot",
            name="resolved_plan",
            field=models.CharField(
                choices=[
                    ("BASIC", "Basic"),
                    ("PROFESSIONAL", "Professional"),
                    ("ENTERPRISE", "Enterprise"),
                    ("LIS_STANDALONE", "Standalone Laboratory"),
                    ("PHARMACY_STANDALONE", "Standalone Pharmacy"),
                    ("IMAGING_STANDALONE", "Standalone Imaging"),
                    ("DIAGNOSTIC_STANDALONE", "Standalone Diagnostic Centre"),
                    ("CUSTOM", "Custom"),
                ],
                default="CUSTOM",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="subscriptionplan",
            name="code",
            field=models.CharField(
                choices=[
                    ("FREE", "Free"),
                    ("BASIC", "Basic"),
                    ("PROFESSIONAL", "Professional"),
                    ("ENTERPRISE", "Enterprise"),
                    ("LIS_STANDALONE", "Standalone Laboratory"),
                    ("PHARMACY_STANDALONE", "Standalone Pharmacy"),
                    ("IMAGING_STANDALONE", "Standalone Imaging"),
                    ("DIAGNOSTIC_STANDALONE", "Standalone Diagnostic Centre"),
                ],
                help_text="Unique tier code (matches Organization.subscription_tier).",
                max_length=32,
                unique=True,
            ),
        ),
    ]
