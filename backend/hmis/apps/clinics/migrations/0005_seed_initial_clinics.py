from __future__ import annotations

from django.db import migrations


def seed_initial_clinics(apps, schema_editor) -> None:
    Clinic = apps.get_model("clinics", "Clinic")

    default_clinics = [
        {
            "code": "OPD-DEFAULT",
            "name": "General OPD",
            "clinic_type": "GENERAL_OPD",
            "description": "General outpatient department",
        },
        {
            "code": "EYE-DEFAULT",
            "name": "Eye Clinic",
            "clinic_type": "EYE",
            "description": "Eye/ophthalmology services",
        },
        {
            "code": "DENTAL-DEFAULT",
            "name": "Dental Clinic",
            "clinic_type": "DENTAL",
            "description": "Dental and oral health services",
        },
        {
            "code": "CCC-DEFAULT",
            "name": "Comprehensive Care Clinic",
            "clinic_type": "CCC",
            "description": "HIV comprehensive care clinic",
            "is_sensitive": True,
            "required_permission": "clinics.view_ccc_clinic",
        },
        # MCH (Maternal & Child Health) - seeded as core component clinics
        {
            "code": "ANC-DEFAULT",
            "name": "Antenatal Clinic",
            "clinic_type": "ANC",
            "description": "Antenatal care services",
        },
        {
            "code": "PNC-DEFAULT",
            "name": "Postnatal Clinic",
            "clinic_type": "PNC",
            "description": "Postnatal care services",
        },
        {
            "code": "FP-DEFAULT",
            "name": "Family Planning Clinic",
            "clinic_type": "FP",
            "description": "Family planning services",
        },
        {
            "code": "CWC-DEFAULT",
            "name": "Child Welfare Clinic",
            "clinic_type": "CWC",
            "description": "Child welfare and growth monitoring services",
        },
        {
            "code": "IMM-DEFAULT",
            "name": "Immunization Clinic",
            "clinic_type": "IMMUNIZATION",
            "description": "Childhood immunization services",
        },
    ]

    for clinic in default_clinics:
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
        ("clinics", "0004_monthly_clinic_report"),
    ]

    operations = [
        migrations.RunPython(seed_initial_clinics, reverse_code=migrations.RunPython.noop),
    ]
