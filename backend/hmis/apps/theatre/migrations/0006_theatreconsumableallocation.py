from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0023_facility_scoped_model_fix"),
        ("theatre", "0005_alter_operatingtheatre_options"),
    ]

    operations = [
        migrations.CreateModel(
            name="TheatreConsumableAllocation",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("quantity_used", models.PositiveIntegerField()),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "batch",
                    models.ForeignKey(
                        on_delete=models.deletion.PROTECT,
                        related_name="theatre_allocations",
                        to="pharmacy.stockbatch",
                    ),
                ),
                (
                    "theatre_consumable",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="allocations",
                        to="theatre.theatreconsumable",
                    ),
                ),
            ],
            options={
                "verbose_name": "Theatre Consumable Allocation",
                "verbose_name_plural": "Theatre Consumable Allocations",
                "ordering": ["created_at", "batch__expiry_date"],
            },
        ),
    ]
