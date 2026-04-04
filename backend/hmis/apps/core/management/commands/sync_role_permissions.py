"""
Management command to sync Role permissions_matrix to Django Group permissions.

This bridges the custom RBAC permissions_matrix with Django's built-in permission system.
"""

from django.contrib.auth.models import Permission
from django.core.management.base import BaseCommand

from hmis.apps.core.models import Role

# Mapping from permissions_matrix model names to Django app_label.model
MODEL_MAPPING = {
    # core
    "StaffProfile": ("core", "staffprofile"),
    "Role": ("core", "role"),
    "Department": ("core", "department"),
    "AuditLog": ("core", "auditlog"),
    # patients
    "Patient": ("patients", "patient"),
    "Allergy": ("patients", "allergy"),
    # encounters
    "Encounter": ("encounters", "encounter"),
    "Diagnosis": ("encounters", "diagnosis"),
    "TreatmentPlan": ("encounters", "treatmentplan"),
    # triage
    "TriageAssessment": ("triage", "triageassessment"),
    "TriageQueue": ("triage", "triagequeue"),
    # laboratory
    "LabOrder": ("laboratory", "laborder"),
    "LabResult": ("laboratory", "labresult"),
    "DiagnosticReport": ("laboratory", "diagnosticreport"),
    # imaging
    "ImagingOrder": ("imaging", "imagingorder"),
    "RadiologyReport": ("imaging", "radiologyreport"),
    # pharmacy
    "Prescription": ("pharmacy", "prescription"),
    "Dispensing": ("pharmacy", "dispensing"),
    "DrugDispensing": ("pharmacy", "dispensing"),
    "PharmacyInventory": ("pharmacy", "drug"),
    # inpatient
    "Admission": ("inpatient", "admission"),
    "Discharge": ("inpatient", "discharge"),
    "WardRound": ("inpatient", "wardround"),
    "Transfer": ("inpatient", "transfer"),
    # clinics
    "ClinicVisit": ("clinics", "clinicvisit"),
    "ClinicEnrollment": ("clinics", "clinicenrollment"),
    # billing
    "Invoice": ("billing", "invoice"),
    # procedures
    "ProcedureOrder": ("procedures", "procedureorder"),
    "ProcedureConsent": ("procedures", "procedureconsent"),
    "ProcedureLog": ("procedures", "procedurelog"),
    "ProcedureOutcome": ("procedures", "procedureoutcome"),
    # referrals
    "ClinicalReferral": ("referrals", "clinicalreferral"),
    # mch
    "MCHRegistration": ("mch", "mchregistration"),
    "ANCVisit": ("mch", "ancvisit"),
    "Delivery": ("mch", "delivery"),
    "LabourPartograph": ("mch", "labourpartograph"),
    "PNCVisit": ("mch", "pncvisit"),
    "ImmunizationRecord": ("mch", "immunizationrecord"),
    "HEIFollowUp": ("mch", "heifollowup"),
    # cds
    "CDSAlert": ("cds", "cdsalert"),
    # surveillance
    "NotifiableCase": ("surveillance", "notifiablecase"),
    "IDSRWeeklyReport": ("surveillance", "idsrweeklyreport"),
    "IHRNotification": ("surveillance", "ihrnotification"),
    # allied health
    "PhysiotherapyOrder": ("physiotherapy", "physiotherapyorder"),
    "NutritionConsultation": ("nutrition", "nutritionconsultation"),
    "OccupationalTherapyOrder": ("occupational_therapy", "occupationaltherapyorder"),
    "CounsellingReferral": ("counselling", "counsellingreferral"),
    "SocialWorkReferral": ("social_work", "socialworkreferral"),
    # scheduling & checkin
    "Appointment": ("scheduling", "appointment"),
    "CheckIn": ("checkin", "checkin"),
}

# Mapping from permissions_matrix actions to Django permission codenames
ACTION_MAPPING = {
    "create": "add",
    "read": "view",
    "update": "change",
    "delete": "delete",
    "view_sensitive": "view_sensitive",  # Custom permission
}


class Command(BaseCommand):
    """Sync Role permissions_matrix to Django Group permissions."""

    help = "Sync Role permissions_matrix to linked Django Groups"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))

        roles = Role.objects.filter(django_group__isnull=False)

        for role in roles:
            self.stdout.write(f"\nProcessing role: {role.name}")

            if not role.permissions_matrix:
                self.stdout.write(self.style.WARNING("  No permissions_matrix defined"))
                continue

            group = role.django_group
            permissions_to_add = []

            for model_name, actions in role.permissions_matrix.items():
                if model_name not in MODEL_MAPPING:
                    self.stdout.write(self.style.WARNING(f"  Unknown model: {model_name}"))
                    continue

                app_label, model = MODEL_MAPPING[model_name]

                for action, granted in actions.items():
                    if not granted:
                        continue

                    django_action = ACTION_MAPPING.get(action, action)
                    codename = f"{django_action}_{model}"

                    try:
                        perm = Permission.objects.get(
                            content_type__app_label=app_label, codename=codename
                        )
                        permissions_to_add.append(perm)
                        self.stdout.write(self.style.SUCCESS(f"  + {app_label}.{codename}"))
                    except Permission.DoesNotExist:
                        self.stdout.write(
                            self.style.WARNING(f"  ? {app_label}.{codename} (not found)")
                        )

            if not dry_run:
                # Clear existing and set new permissions
                group.permissions.set(permissions_to_add)
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  Synced {len(permissions_to_add)} permissions to group "{group.name}"'
                    )
                )
            else:
                self.stdout.write(f"  Would sync {len(permissions_to_add)} permissions")

        self.stdout.write(self.style.SUCCESS("\nDone!"))
