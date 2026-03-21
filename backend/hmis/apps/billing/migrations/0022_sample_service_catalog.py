"""
No-op migration (formerly a data migration that seeded the service catalog).

The seed data has been moved to a management command to avoid polluting
the test database:

    python manage.py seed_service_catalog
    python manage.py seed_service_catalog --force     # overwrite existing
    python manage.py seed_service_catalog --dry-run   # preview only
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0021_change_imaging_order_on_delete"),
    ]

    operations = []

