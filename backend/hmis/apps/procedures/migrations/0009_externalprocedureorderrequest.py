from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("encounters", "0034_encounter_public_id_historicalencounter_public_id"),
        ("patients", "0027_alter_historicalpatient_identification_type_and_more"),
        ("procedures", "0008_procedurecatalog_origin_hub_id_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ExternalProcedureOrderRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("origin_hub_id", models.CharField(blank=True, db_index=True, help_text="Hub ID where this record was originally created (null = cloud-created).", max_length=100, null=True)),
                ("origin_local_id", models.BigIntegerField(blank=True, db_index=True, help_text="Original PK on the source hub (for dedup on cloud receipt).", null=True)),
                ("request_number", models.CharField(editable=False, help_text="Auto-generated request number (EXTPROC-YYYYMMDD-XXXX)", max_length=24, unique=True)),
                ("priority", models.CharField(choices=[("EMERGENCY", "Emergency — Immediate"), ("URGENT", "Urgent — Within 24 hours"), ("ROUTINE", "Routine — Scheduled"), ("ELECTIVE", "Elective — Non-urgent")], default="ROUTINE", max_length=20)),
                ("indication", models.TextField(help_text="Clinical indication / reason for external procedure request")),
                ("clinical_notes", models.TextField(blank=True, default="")),
                ("body_site", models.CharField(blank=True, default="", max_length=100)),
                ("laterality", models.CharField(choices=[("LEFT", "Left"), ("RIGHT", "Right"), ("BILATERAL", "Bilateral"), ("NA", "Not Applicable")], default="NA", max_length=20)),
                ("sending_facility", models.CharField(blank=True, default="", help_text="External destination facility/provider", max_length=200)),
                ("referring_clinician", models.CharField(blank=True, default="", max_length=200)),
                ("status", models.CharField(choices=[("RECEIVED", "Received"), ("ACCEPTED", "Accepted"), ("REJECTED", "Rejected")], default="RECEIVED", max_length=20)),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="external_procedure_requests_created", to=settings.AUTH_USER_MODEL)),
                ("encounter", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="external_procedure_requests", to="encounters.encounter")),
                ("facility", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.facility")),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.organization")),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="external_procedure_requests", to="patients.patient")),
                ("procedure", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="external_requests", to="procedures.procedurecatalog")),
                ("procedure_order", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="external_requests", to="procedures.procedureorder")),
                ("processed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="external_procedure_requests_processed", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="externalprocedureorderrequest",
            index=models.Index(fields=["request_number"], name="procedures_e_request__f43bc4_idx"),
        ),
        migrations.AddIndex(
            model_name="externalprocedureorderrequest",
            index=models.Index(fields=["facility", "status"], name="procedures_e_facilit_079366_idx"),
        ),
        migrations.AddIndex(
            model_name="externalprocedureorderrequest",
            index=models.Index(fields=["encounter", "status"], name="procedures_e_encount_51f5d8_idx"),
        ),
        migrations.AddIndex(
            model_name="externalprocedureorderrequest",
            index=models.Index(fields=["patient", "status"], name="procedures_e_patient_fa4f2e_idx"),
        ),
    ]
