"""Add a unique constraint on auth_user.email (non-empty values only).

Django's built-in User model does not enforce unique emails. Since we now
support login-by-email (EmailOrUsernameBackend), we need to guarantee
uniqueness at the database level.

The partial unique index only covers non-empty emails so that multiple
users with email='' are allowed (Django admin sometimes creates users
without emails).
"""

from django.db import migrations


def create_unique_email_index(apps, schema_editor):
    """Create a case-insensitive unique partial index on auth_user.email."""
    vendor = schema_editor.connection.vendor
    if vendor == "sqlite":
        # SQLite: LOWER() in index + partial index via WHERE
        schema_editor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS unique_user_email "
            "ON auth_user (LOWER(email)) "
            "WHERE email != '';"
        )
    else:
        # PostgreSQL / others
        schema_editor.execute(
            "CREATE UNIQUE INDEX unique_user_email "
            "ON auth_user (LOWER(email)) "
            "WHERE email != '';"
        )


def drop_unique_email_index(apps, schema_editor):
    schema_editor.execute("DROP INDEX IF EXISTS unique_user_email;")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0033_add_secondary_organizations_to_staffprofile"),
    ]

    operations = [
        migrations.RunPython(create_unique_email_index, drop_unique_email_index),
    ]
