# Generated manually for cancellation tracking fields

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('laboratory', '0007_add_lab_result_attachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='laborder',
            name='cancellation_reason',
            field=models.TextField(blank=True, help_text='Reason for cancellation'),
        ),
        migrations.AddField(
            model_name='laborder',
            name='cancelled_by',
            field=models.ForeignKey(
                blank=True,
                help_text='User who cancelled the order',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='cancelled_lab_orders',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='laborder',
            name='cancelled_at',
            field=models.DateTimeField(blank=True, help_text='When order was cancelled', null=True),
        ),
    ]
