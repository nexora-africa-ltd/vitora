# Generated migration for requisition_pdf and sample_type fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0009_add_cancellation_tracking'),
    ]

    operations = [
        migrations.AddField(
            model_name='laborder',
            name='requisition_pdf',
            field=models.FileField(blank=True, help_text='Generated PDF requisition form', null=True, upload_to='lab_requisitions/%Y/%m/'),
        ),
        migrations.AddField(
            model_name='laborder',
            name='sample_type',
            field=models.CharField(blank=True, help_text='Type of sample required (e.g., Blood, Urine)', max_length=100),
        ),
    ]
