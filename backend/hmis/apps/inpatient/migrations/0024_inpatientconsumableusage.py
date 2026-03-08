from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0016_historicalprescription"),
        ("inpatient", "0023_remove_temperaturereading_bowels_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InpatientConsumableUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("quantity_used", models.PositiveIntegerField(help_text="Quantity consumed from stock", validators=[django.core.validators.MinValueValidator(1)])),
                ("notes", models.TextField(blank=True, help_text="Optional usage notes")),
                ("used_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("is_reversed", models.BooleanField(default=False)),
                ("reversed_at", models.DateTimeField(blank=True, null=True)),
                ("reverse_reason", models.TextField(blank=True)),
                ("admission", models.ForeignKey(help_text="Admission where the consumable was used", on_delete=django.db.models.deletion.CASCADE, related_name="consumable_usages", to="inpatient.admission")),
                ("batch", models.ForeignKey(help_text="Stock batch debited for this usage", on_delete=django.db.models.deletion.PROTECT, related_name="inpatient_consumable_usages", to="pharmacy.stockbatch")),
                ("drug", models.ForeignKey(help_text="Consumable item used during admission", on_delete=django.db.models.deletion.PROTECT, related_name="inpatient_consumable_usages", to="pharmacy.drug")),
                ("reversed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reversed_inpatient_consumable_usages", to=settings.AUTH_USER_MODEL)),
                ("used_by", models.ForeignKey(help_text="User who recorded the consumable use", on_delete=django.db.models.deletion.PROTECT, related_name="recorded_inpatient_consumable_usages", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-used_at", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="inpatientconsumableusage",
            index=models.Index(fields=["admission", "-used_at"], name="inpatient_c_admissi_5a7b3b_idx"),
        ),
        migrations.AddIndex(
            model_name="inpatientconsumableusage",
            index=models.Index(fields=["drug", "-used_at"], name="inpatient_c_drug_id_d80a76_idx"),
        ),
        migrations.AddIndex(
            model_name="inpatientconsumableusage",
            index=models.Index(fields=["is_reversed"], name="inpatient_c_is_reve_4c48e3_idx"),
        ),
    ]