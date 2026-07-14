from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("nutrition", "0004_historicalnutritionconsultation_origin_hub_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="nutritionconsultation",
            name="sha_claimable",
        ),
    ]
