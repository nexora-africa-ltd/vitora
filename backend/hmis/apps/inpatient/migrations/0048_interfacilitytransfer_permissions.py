from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0047_interfacilitytransfer"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="interfacilitytransfer",
            options={
                "ordering": ["-created_at"],
                "permissions": [
                    ("submit_interfacility_transfer", "Can submit inter-facility transfer"),
                    ("accept_interfacility_transfer", "Can accept inter-facility transfer"),
                    ("reject_interfacility_transfer", "Can reject inter-facility transfer"),
                    ("dispatch_interfacility_transfer", "Can dispatch inter-facility transfer"),
                    (
                        "arrive_interfacility_transfer",
                        "Can mark inter-facility transfer as arrived",
                    ),
                    ("cancel_interfacility_transfer", "Can cancel inter-facility transfer"),
                ],
                "verbose_name": "Inter-facility Transfer",
                "verbose_name_plural": "Inter-facility Transfers",
            },
        ),
    ]
