from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("occupational_therapy", "0004_historicaloccupationaltherapyorder_origin_hub_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="ottreatmenttype",
            name="sha_claimable",
        ),
    ]
