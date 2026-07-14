from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("imaging", "0009_externalimagingorderrequest_origin_hub_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="imagingprocedure",
            name="sha_claimable",
        ),
    ]
