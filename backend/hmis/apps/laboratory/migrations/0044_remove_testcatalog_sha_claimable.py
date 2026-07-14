from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0043_alter_laborder_order_number_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="testcatalog",
            name="sha_claimable",
        ),
    ]
