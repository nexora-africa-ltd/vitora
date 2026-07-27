from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0068_alter_shaclaim_primary_diagnosis_code_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="shaclaimintervention",
            name="fund",
            field=models.CharField(
                blank=True,
                help_text="Top-level fund label from ILM interventions payload",
                max_length=128,
            ),
        ),
        migrations.AddField(
            model_name="shaclaimintervention",
            name="intervention_fund",
            field=models.CharField(
                blank=True,
                help_text="Intervention-specific fund label from ILM payload",
                max_length=128,
            ),
        ),
        migrations.AddField(
            model_name="shaclaimintervention",
            name="intervention_payload",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Raw ILM intervention payload preserved for future metadata needs",
            ),
        ),
        migrations.AddField(
            model_name="shaclaimintervention",
            name="schemes",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Applicable schemes from ILM payload",
            ),
        ),
        migrations.AddField(
            model_name="shaclaimintervention",
            name="supported_scheme",
            field=models.CharField(
                blank=True,
                help_text="Supported scheme label from ILM payload",
                max_length=128,
            ),
        ),
    ]
