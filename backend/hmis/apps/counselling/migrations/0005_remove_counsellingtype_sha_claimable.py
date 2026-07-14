from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("counselling", "0004_counsellingreferral_origin_hub_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="counsellingtype",
            name="sha_claimable",
        ),
    ]
