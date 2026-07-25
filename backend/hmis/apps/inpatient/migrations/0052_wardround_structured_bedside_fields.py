from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inpatient", "0051_interfacility_event_types_discharge_summary"),
    ]

    operations = [
        migrations.AddField(
            model_name="wardround",
            name="blood_pressure",
            field=models.CharField(
                blank=True,
                help_text="Blood pressure (e.g., '120/80')",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="gcs_total",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="Glasgow Coma Scale total score (3-15)",
                null=True,
                validators=[MinValueValidator(3), MaxValueValidator(15)],
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="on_mechanical_ventilation",
            field=models.BooleanField(
                blank=True,
                help_text="Whether patient is currently mechanically ventilated",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="on_vasopressors",
            field=models.BooleanField(
                blank=True,
                help_text="Whether patient is currently on vasopressor support",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="pulse",
            field=models.IntegerField(
                blank=True,
                help_text="Pulse rate in BPM",
                null=True,
                validators=[MinValueValidator(0)],
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="respiratory_rate",
            field=models.IntegerField(
                blank=True,
                help_text="Respiratory rate in breaths/min",
                null=True,
                validators=[MinValueValidator(0)],
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="spo2",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Oxygen saturation percentage",
                max_digits=5,
                null=True,
                validators=[MinValueValidator(Decimal("0.0"))],
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="temperature",
            field=models.DecimalField(
                blank=True,
                decimal_places=1,
                help_text="Temperature in °C",
                max_digits=4,
                null=True,
                validators=[MinValueValidator(Decimal("30.0"))],
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="urine_output_ml_24h",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Estimated or measured total urine output in the last 24 hours (mL)",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="wardround",
            name="vasopressor_dose_mcg_kg_min",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                help_text="Current vasopressor dose in mcg/kg/min where known",
                max_digits=6,
                null=True,
                validators=[MinValueValidator(Decimal("0.000"))],
            ),
        ),
    ]
