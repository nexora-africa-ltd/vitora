from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clinics", "0016_facility_scoped_model_fix"),
        ("referrals", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="clinicalreferral",
            name="destination_clinic",
            field=models.ForeignKey(
                blank=True,
                help_text="Explicit clinic destination for clinic-routed referrals.",
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="incoming_referrals",
                to="clinics.clinic",
            ),
        ),
    ]
