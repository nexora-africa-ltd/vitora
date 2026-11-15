# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add an explicit review-needed body-system choice for DHA seed concepts.

Apply with ``python manage.py migrate``. Existing rows are unchanged; rerunning
the facility seed command reconciles ambiguous DHA concepts to ``UNSPECIFIED``.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    """Persist the expanded ProcedureCatalog body-system choices."""

    dependencies = [
        ("procedures", "0013_procedurecatalog_facility_scoped_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="procedurecatalog",
            name="body_system",
            field=models.CharField(
                choices=[
                    ("UNSPECIFIED", "Unspecified (requires review)"),
                    ("INTEGUMENTARY", "Integumentary (Skin)"),
                    ("MUSCULOSKELETAL", "Musculoskeletal"),
                    ("RESPIRATORY", "Respiratory"),
                    ("CARDIOVASCULAR", "Cardiovascular"),
                    ("DIGESTIVE", "Digestive"),
                    ("URINARY", "Urinary"),
                    ("REPRODUCTIVE", "Reproductive"),
                    ("NERVOUS", "Nervous"),
                    ("ENDOCRINE", "Endocrine"),
                    ("LYMPHATIC", "Lymphatic"),
                    ("SENSORY", "Sensory (Eye/Ear)"),
                    ("DENTAL", "Dental"),
                    ("GENERAL", "General/Multiple"),
                ],
                default="GENERAL",
                max_length=20,
            ),
        ),
    ]
