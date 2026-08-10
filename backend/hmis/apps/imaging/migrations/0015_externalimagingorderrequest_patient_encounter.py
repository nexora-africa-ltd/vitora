from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("encounters", "0034_encounter_public_id_historicalencounter_public_id"),
        ("imaging", "0014_alter_imagingintegrationsettings_facility_and_more"),
        ("patients", "0027_alter_historicalpatient_identification_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="externalimagingorderrequest",
            name="encounter",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional encounter that generated this external imaging request",
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="external_imaging_requests",
                to="encounters.encounter",
            ),
        ),
        migrations.AddField(
            model_name="externalimagingorderrequest",
            name="patient",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional HMIS patient linked from encounter-originated request",
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="external_imaging_requests",
                to="patients.patient",
            ),
        ),
    ]
