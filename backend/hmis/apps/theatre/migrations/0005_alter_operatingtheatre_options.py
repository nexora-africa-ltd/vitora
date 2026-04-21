from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("theatre", "0004_backfill_theatre_schedules"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="operatingtheatre",
            options={
                "ordering": ["code"],
                "permissions": [
                    (
                        "manage_theatre_settings",
                        "Can configure theatre setup and operating rooms",
                    )
                ],
                "verbose_name": "Operating Theatre",
                "verbose_name_plural": "Operating Theatres",
            },
        ),
    ]
