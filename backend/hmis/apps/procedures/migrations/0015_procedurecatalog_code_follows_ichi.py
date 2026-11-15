# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Track whether seeded internal procedure codes follow their ICHI code.

Apply with ``python manage.py migrate``. Existing DHA-seeded rows whose internal
and ICHI codes already match are backfilled as linked.
"""

from django.db import migrations, models
from django.db.models import F


def mark_existing_ichi_linked(apps, schema_editor):
    """Backfill only canonical DHA rows whose two code values already match."""
    ProcedureCatalog = apps.get_model("procedures", "ProcedureCatalog")
    ProcedureCatalog.objects.filter(
        code=F("ichi_code"),
        ichi_code__gt="",
        ichi_owner="WHO",
        ichi_source="ICHI",
    ).update(code_follows_ichi=True)


class Migration(migrations.Migration):
    """Add the internal-code/ICHI linkage marker."""

    dependencies = [
        ("procedures", "0014_procedurecatalog_unspecified_body_system"),
    ]

    operations = [
        migrations.AddField(
            model_name="procedurecatalog",
            name="code_follows_ichi",
            field=models.BooleanField(
                default=False,
                help_text="Whether the internal code is automatically kept equal to the ICHI code.",
            ),
        ),
        migrations.RunPython(mark_existing_ichi_linked, migrations.RunPython.noop),
    ]
