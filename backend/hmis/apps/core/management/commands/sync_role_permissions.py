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
    "Facility": ("core", "facility"),
    "Organization": ("core", "organization"),
    # patients
    "Patient": ("patients", "patient"),
    "Allergy": ("patients", "allergy"),
    "DeathRecord": ("patients", "deathrecord"),
    "EmergencyContact": ("patients", "emergencycontact"),
    # encounters
    "Encounter": ("encounters", "encounter"),
    "Diagnosis": ("encounters", "diagnosis"),
    "TreatmentPlan": ("encounters", "treatmentplan"),
    # triage
    "TriageAssessment": ("triage", "triageassessment"),
    "TriageQueue": ("triage", "triagequeue"),
    "Escalation": ("triage", "escalation"),
    # laboratory
    "LabOrder": ("laboratory", "laborder"),
    "LabOrderItem": ("laboratory", "laborderitem"),
    "LabResult": ("laboratory", "labresult"),
    "Specimen": ("laboratory", "specimen"),
    "DiagnosticReport": ("laboratory", "diagnosticreport"),
    "TestCatalog": ("laboratory", "testcatalog"),
    "Instrument": ("laboratory", "instrument"),
    # imaging
    "ImagingOrder": ("imaging", "imagingorder"),
    "ImagingOrderItem": ("imaging", "imagingorderitem"),
    "ImagingProcedure": ("imaging", "imagingprocedure"),
    "RadiologyReport": ("imaging", "radiologyreport"),
    "ImagingReport": ("imaging", "radiologyreport"),  # Alias used by Radiologist role
    "DICOMStudy": ("imaging", "dicomstudy"),
    # pharmacy
    "Prescription": ("pharmacy", "prescription"),
    "PrescriptionItem": ("pharmacy", "prescriptionitem"),
    "Dispensing": ("pharmacy", "dispensing"),
    "DrugDispensing": ("pharmacy", "dispensing"),  # Legacy alias
    "Drug": ("pharmacy", "drug"),
    "PharmacyInventory": ("pharmacy", "drug"),  # Legacy alias
    "StockBatch": ("pharmacy", "stockbatch"),
    "StockAdjustment": ("pharmacy", "stockadjustment"),
    "StockAlert": ("pharmacy", "stockalert"),
    # inpatient
    "Admission": ("inpatient", "admission"),
    "Discharge": ("inpatient", "discharge"),
    "WardRound": ("inpatient", "wardround"),
    "Transfer": ("inpatient", "transfer"),
    "NursingKardex": ("inpatient", "nursingkardex"),
    "NursingCarePlanEntry": ("inpatient", "nursingcareplanentry"),
    "ShiftHandover": ("inpatient", "shifthandover"),
    "InpatientWard": ("inpatient", "ward"),
    "Bed": ("inpatient", "bed"),
    # clinics
    "Clinic": ("clinics", "clinic"),
    "ClinicVisit": ("clinics", "clinicvisit"),
    "ClinicEnrollment": ("clinics", "clinicenrollment"),
    "ClinicSession": ("clinics", "clinicsession"),
    # billing
    "Invoice": ("billing", "invoice"),
    "InvoiceItem": ("billing", "invoiceitem"),
    "Payment": ("billing", "payment"),
    "Receipt": ("billing", "receipt"),
    "CreditNote": ("billing", "creditnote"),
    "Service": ("billing", "service"),
    "ServiceCategory": ("billing", "servicecategory"),
    "SHAClaim": ("billing", "shaclaim"),
    "SHAMember": ("billing", "shamember"),
    "SHATariff": ("billing", "shatariff"),
    "FacilityBillingConfig": ("billing", "facilitybillingconfig"),
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
    "GrowthMeasurement": ("mch", "growthmeasurement"),
    # cds
    "CDSAlert": ("cds", "cdsalert"),
    "CDSRule": ("cds", "cdsrule"),
    # surveillance
    "NotifiableCase": ("surveillance", "notifiablecase"),
    "NotifiableDisease": ("surveillance", "notifiabledisease"),
    "IDSRWeeklyReport": ("surveillance", "idsrweeklyreport"),
    "IHRNotification": ("surveillance", "ihrnotification"),
    "SurveillanceAlert": ("surveillance", "surveillancealert"),
    # allied health — physiotherapy
    "PhysiotherapyOrder": ("physiotherapy", "physiotherapyorder"),
    "PhysiotherapySession": ("physiotherapy", "physiotherapysession"),
    "PhysiotherapyTreatmentType": ("physiotherapy", "physiotherapytreatmenttype"),
    # allied health — nutrition
    "NutritionConsultation": ("nutrition", "nutritionconsultation"),
    "DietPlan": ("nutrition", "dietplan"),
    # allied health — occupational therapy
    "OccupationalTherapyOrder": ("occupational_therapy", "occupationaltherapyorder"),
    "OTSession": ("occupational_therapy", "otsession"),
    "OTTreatmentType": ("occupational_therapy", "ottreatmenttype"),
    # allied health — counselling
    "CounsellingReferral": ("counselling", "counsellingreferral"),
    "CounsellingSession": ("counselling", "counsellingsession"),
    "CounsellingType": ("counselling", "counsellingtype"),
    # allied health — social work
    "SocialWorkReferral": ("social_work", "socialworkreferral"),
    "SocialWorkCase": ("social_work", "socialworkcase"),
    "CaseNote": ("social_work", "casenote"),
    "SocialWorkIntervention": ("social_work", "socialworkintervention"),
    "Intervention": ("social_work", "socialworkintervention"),  # Alias
    # scheduling & checkin
    "Appointment": ("scheduling", "appointment"),
    "Schedule": ("scheduling", "schedule"),
    "CheckIn": ("checkin", "checkin"),
}

# Mapping from permissions_matrix actions to Django permission codenames
ACTION_MAPPING = {
    "create": "add",
    "read": "view",
    "update": "change",
    "delete": "delete",
}

# Custom permission actions that are passed through as-is (codename used directly)
# These match Meta.permissions codenames on the models.
CUSTOM_ACTIONS = {
    "perform_triage",
    "view_triage_queue",
    "override_triage_category",
    "escalate_patient",
    "certify_death",
    "release_body",
    "void_death_record",
    "accept_referral",
    "decline_referral",
    "view_sensitive_referral",
    "view_sensitive_mch_registration",
    "view_sensitive_hei_followup",
    "receive_critical_alerts",
    "submit_sha_claim",
    "approve_sha_claim",
    "appeal_sha_claim",
    "view_ccc_clinic",
    "view_mental_health_clinic",
    "manage_clinic_staff",
    "manage_clinic_schedule",
    "approve_physiotherapy_order",
    "assign_physiotherapy_therapist",
    "approve_ot_order",
    "assign_ot_therapist",
    "view_sensitive_counselling_referral",
    "view_sensitive_counselling_session",
    "accept_sw_referral",
    "assign_social_worker",
    "view_sensitive_sw_referral",
    "close_sw_case",
    "view_sensitive_sw_case",
    "supervise_sw_case",
    "escalate_ihr_to_county",
    "escalate_ihr_to_national",
    "notify_ihr_to_who",
}

# Actions that follow the Django pattern: {action}_{model} (like view_sensitive_patient)
MODEL_SUFFIXED_ACTIONS = {
    "view_sensitive",
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

                    if action in CUSTOM_ACTIONS:
                        # Custom permissions use codename as-is
                        codename = action
                    elif action in MODEL_SUFFIXED_ACTIONS:
                        # Model-suffixed custom perms: e.g. view_sensitive → view_sensitive_patient
                        codename = f"{action}_{model}"
                    else:
                        # Standard CRUD: map to Django's add/view/change/delete prefix
                        django_action = ACTION_MAPPING.get(action)
                        if django_action is None:
                            self.stdout.write(
                                self.style.WARNING(
                                    f"  ? Unknown action '{action}' for {model_name}"
                                )
                            )
                            continue
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
