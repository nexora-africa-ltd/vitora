from __future__ import annotations

import os

from django.conf import settings
from django.db import migrations


def seed_specialty_and_procedure_clinics(apps, schema_editor) -> None:
    if os.getenv("DJANGO_ENV") == "test" or str(getattr(settings, "SETTINGS_MODULE", "")).endswith(
        ".test"
    ):
        return

    Clinic = apps.get_model("clinics", "Clinic")

    clinics = [
        {
            "code": "FILTER-DEFAULT",
            "name": "Filter/Screening Clinic",
            "clinic_type": "FILTER_CLINIC",
            "description": "Initial screening and routing of patients",
        },
        {
            "code": "ORTHO-DEFAULT",
            "name": "Orthopedic Clinic",
            "clinic_type": "ORTHO",
            "description": "Orthopedic outpatient assessment and follow-up",
            "requires_referral": True,
        },
        {
            "code": "PHYSIO-DEFAULT",
            "name": "Physiotherapy Clinic",
            "clinic_type": "PHYSIO",
            "description": "Physiotherapy assessment and rehabilitation sessions",
            "requires_referral": True,
        },
        {
            "code": "DERM-DEFAULT",
            "name": "Dermatology Clinic",
            "clinic_type": "DERM",
            "description": "Dermatology outpatient assessment",
            "requires_referral": True,
        },
        {
            "code": "MENTAL-DEFAULT",
            "name": "Mental Health Clinic",
            "clinic_type": "MENTAL_HEALTH",
            "description": "Mental health assessment and follow-up (Sensitive)",
            "is_sensitive": True,
            "required_permission": "clinics.view_mental_health_clinic",
            "requires_referral": True,
        },
        {
            "code": "ONCO-DEFAULT",
            "name": "Oncology Clinic",
            "clinic_type": "ONCOLOGY",
            "description": "Oncology follow-up and treatment coordination",
            "requires_referral": True,
            "requires_appointment": True,
            "accepts_walk_ins": False,
        },
        {
            "code": "DIALYSIS-DEFAULT",
            "name": "Dialysis Unit",
            "clinic_type": "DIALYSIS",
            "description": "Dialysis sessions and monitoring",
            "requires_referral": True,
            "requires_appointment": True,
            "accepts_walk_ins": False,
            "triage_required": False,
        },
        {
            "code": "PROCEDURE-DEFAULT",
            "name": "Procedure Room",
            "clinic_type": "PROCEDURE",
            "description": "Minor procedures and procedure documentation",
            "requires_referral": True,
            "triage_required": False,
        },
        {
            "code": "DRESSING-DEFAULT",
            "name": "Dressing/Wound Care",
            "clinic_type": "DRESSING",
            "description": "Wound care and dressing changes",
            "requires_referral": True,
            "triage_required": False,
        },
        {
            "code": "INJECTION-DEFAULT",
            "name": "Injection Room",
            "clinic_type": "INJECTION",
            "description": "Injection administration",
            "requires_referral": True,
            "triage_required": False,
        },
    ]

    for clinic in clinics:
        code = clinic["code"]
        defaults = {
            "name": clinic["name"],
            "clinic_type": clinic["clinic_type"],
            "description": clinic.get("description", ""),
            "location": clinic.get("location", ""),
            "floor": clinic.get("floor", ""),
            "capacity": clinic.get("capacity", 1),
            "status": clinic.get("status", "ACTIVE"),
            "requires_appointment": clinic.get("requires_appointment", False),
            "requires_referral": clinic.get("requires_referral", False),
            "accepts_walk_ins": clinic.get("accepts_walk_ins", True),
            "triage_required": clinic.get("triage_required", True),
            "eligibility_rules": clinic.get("eligibility_rules"),
            "default_service_fee": clinic.get("default_service_fee"),
            "sha_service_code": clinic.get("sha_service_code", ""),
            "dhis2_org_unit_id": clinic.get("dhis2_org_unit_id", ""),
            "moh_code": clinic.get("moh_code", ""),
            "default_clinical_template": clinic.get("default_clinical_template"),
            "is_sensitive": clinic.get("is_sensitive", False),
            "required_permission": clinic.get("required_permission", ""),
        }

        Clinic.objects.update_or_create(code=code, defaults=defaults)


class Migration(migrations.Migration):
    dependencies = [
        ("clinics", "0006_seed_additional_clinics"),
    ]

    operations = [
        migrations.RunPython(
            seed_specialty_and_procedure_clinics,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
