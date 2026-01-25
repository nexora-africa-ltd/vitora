from __future__ import annotations

from django.db import migrations


def seed_additional_clinics(apps, schema_editor) -> None:
    Clinic = apps.get_model("clinics", "Clinic")

    additional_clinics = [
        {
            "code": "NUTRITION-DEFAULT",
            "name": "Nutrition Clinic",
            "clinic_type": "NUTRITION",
            "description": "Nutrition assessment and counselling services",
        },
        {
            "code": "ENT-DEFAULT",
            "name": "ENT Clinic",
            "clinic_type": "ENT",
            "description": "Ear, Nose and Throat services",
        },
        {
            "code": "SURGICAL-DEFAULT",
            "name": "Surgical Outpatient Clinic",
            "clinic_type": "SURGICAL",
            "description": "Surgical outpatient assessment and follow-up",
            "requires_referral": True,
        },
        {
            "code": "TB-DEFAULT",
            "name": "TB Clinic",
            "clinic_type": "TB",
            "description": "Tuberculosis assessment and treatment services",
            "requires_referral": True,
        },
        {
            "code": "DIABETIC-DEFAULT",
            "name": "Diabetic Clinic",
            "clinic_type": "DIABETIC",
            "description": "Diabetes care and NCD follow-up",
            "requires_referral": True,
        },
        {
            "code": "HYPERTENSION-DEFAULT",
            "name": "Hypertension Clinic",
            "clinic_type": "HYPERTENSION",
            "description": "Hypertension care and NCD follow-up",
            "requires_referral": True,
        },
        {
            "code": "GBV-DEFAULT",
            "name": "GBV Clinic",
            "clinic_type": "OTHER",
            "description": "Gender-Based Violence assessment and survivor care (Sensitive)",
            "is_sensitive": True,
            "required_permission": "patients.view_sensitive_patient",
            "requires_referral": True,
        },
    ]

    for clinic in additional_clinics:
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
        ("clinics", "0005_seed_initial_clinics"),
    ]

    operations = [
        migrations.RunPython(seed_additional_clinics, reverse_code=migrations.RunPython.noop),
    ]
