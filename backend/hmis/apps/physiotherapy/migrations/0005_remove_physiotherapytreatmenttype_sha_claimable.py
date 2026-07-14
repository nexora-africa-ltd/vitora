from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("physiotherapy", "0004_historicalphysiotherapyorder_origin_hub_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="physiotherapytreatmenttype",
            name="sha_claimable",
        ),
    ]
