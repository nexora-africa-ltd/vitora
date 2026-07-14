from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("mch", "0012_historicalmchregistration_origin_hub_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="mchregistration",
            name="sha_claimable",
        ),
    ]
