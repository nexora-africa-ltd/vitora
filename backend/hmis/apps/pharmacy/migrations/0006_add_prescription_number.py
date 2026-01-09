# Generated manually for prescription_number field

from django.db import migrations, models


def generate_prescription_numbers(apps, schema_editor):
    """Generate prescription numbers for existing prescriptions."""
    Prescription = apps.get_model('pharmacy', 'Prescription')
    from datetime import datetime
    
    # Group prescriptions by date
    prescriptions_by_date = {}
    for prescription in Prescription.objects.all().order_by('prescribed_at'):
        date_str = prescription.prescribed_at.strftime("%Y%m%d")
        if date_str not in prescriptions_by_date:
            prescriptions_by_date[date_str] = []
        prescriptions_by_date[date_str].append(prescription)
    
    # Assign sequential numbers for each date
    for date_str, prescriptions in prescriptions_by_date.items():
        for idx, prescription in enumerate(prescriptions, start=1):
            prescription.prescription_number = f"RX-{date_str}-{idx:04d}"
            prescription.save(update_fields=['prescription_number'])


class Migration(migrations.Migration):
    dependencies = [
        ("pharmacy", "0005_stockadjustment"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescription",
            name="prescription_number",
            field=models.CharField(
                default="RX-00000000-0000",
                editable=False,
                help_text="Prescription Number (auto-generated, format: RX-YYYYMMDD-XXXX)",
                max_length=50,
            ),
            preserve_default=False,
        ),
        migrations.RunPython(generate_prescription_numbers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="prescription",
            name="prescription_number",
            field=models.CharField(
                editable=False,
                help_text="Prescription Number (auto-generated, format: RX-YYYYMMDD-XXXX)",
                max_length=50,
                unique=True,
            ),
        ),
        migrations.AddIndex(
            model_name="prescription",
            index=models.Index(fields=["prescription_number"], name="pharmacy_pr_prescri_idx"),
        ),
        migrations.AddIndex(
            model_name="prescription",
            index=models.Index(fields=["status"], name="pharmacy_pr_status_idx"),
        ),
    ]
