# Generated migration for AlertSettings model

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pharmacy', '0005_stockadjustment'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlertSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('low_stock_threshold', models.IntegerField(default=100, help_text='Generate alert when stock falls below this quantity')),
                ('expiry_warning_days', models.IntegerField(default=90, help_text='Days before expiry to generate warning alert')),
                ('expiry_critical_days', models.IntegerField(default=30, help_text='Days before expiry to generate critical alert')),
                ('enable_email_notifications', models.BooleanField(default=False, help_text='Enable email notifications for critical alerts')),
                ('notification_email_recipients', models.TextField(blank=True, help_text='Comma-separated list of email addresses to notify')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='alert_settings_updates', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Alert Settings',
                'verbose_name_plural': 'Alert Settings',
            },
        ),
    ]
