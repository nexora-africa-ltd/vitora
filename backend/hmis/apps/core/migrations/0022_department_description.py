from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0021_add_feature_flag_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="department",
            name="description",
            field=models.TextField(blank=True, help_text="Department description"),
        ),
    ]
