"""
Utility to sync a Role's permissions_matrix to its linked Django Group permissions.

Called automatically when a Role is saved via the API or Django admin.
Also used by the sync_role_permissions management command for bulk operations.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.contrib.auth.models import Permission

if TYPE_CHECKING:
    from hmis.apps.core.models import Role

logger = logging.getLogger(__name__)

# Mapping from permissions_matrix model names to Django (app_label, model_name)
MODEL_MAPPING: dict[str, tuple[str, str]] = {
    # core
    "StaffProfile": ("core", "staffprofile"),
    "Role": ("core", "role"),
    "Department": ("core", "department"),
    "AuditLog": ("core", "auditlog"),
    "Facility": ("core", "facility"),
    "Organization": ("core", "organization"),
    "EmergencyAccess": ("core", "emergencyaccess"),
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
    # laboratory — standalone LIS
    "WalkInPatient": ("laboratory", "walkinpatient"),
    "ExternalOrderRequest": ("laboratory", "externalorderrequest"),
    # laboratory — QC
    "QCMaterial": ("laboratory", "qcmaterial"),
    "QCLot": ("laboratory", "qclot"),
    "QCResult": ("laboratory", "qcresult"),
    "EQASurvey": ("laboratory", "eqasurvey"),
    # laboratory — reflex / critical values
    "ReflexRule": ("laboratory", "reflexrule"),
    "CriticalValueRange": ("laboratory", "criticalvaluerange"),
    "CriticalValueNotification": ("laboratory", "criticalvaluenotification"),
    # laboratory — worksheets / analyzers / autoverify
    "WorksheetTemplate": ("laboratory", "worksheettemplate"),
    "LabelTemplate": ("laboratory", "labeltemplate"),
    "InstrumentChannel": ("laboratory", "instrumentchannel"),
    "AutoVerifyRule": ("laboratory", "autoverifyrule"),
    "DeltaCheckRule": ("laboratory", "deltacheckrule"),
    # imaging
    "ImagingOrder": ("imaging", "imagingorder"),
    "ImagingOrderItem": ("imaging", "imagingorderitem"),
    "ImagingProcedure": ("imaging", "imagingprocedure"),
    "RadiologyReport": ("imaging", "radiologyreport"),
    "ImagingReport": ("imaging", "radiologyreport"),
    "DICOMStudy": ("imaging", "dicomstudy"),
    # pharmacy
    "Prescription": ("pharmacy", "prescription"),
    "PrescriptionItem": ("pharmacy", "prescriptionitem"),
    "Dispensing": ("pharmacy", "dispensing"),
    "DrugDispensing": ("pharmacy", "dispensing"),
    "Drug": ("pharmacy", "drug"),
    "PharmacyInventory": ("pharmacy", "drug"),
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
    "AdmissionRecommendation": ("inpatient", "admissionrecommendation"),
    "ReviewRequest": ("inpatient", "reviewrequest"),
    "TemperatureReading": ("inpatient", "temperaturereading"),
    "FluidBalanceSheet": ("inpatient", "fluidbalancesheet"),
    "FluidBalanceEntry": ("inpatient", "fluidbalanceentry"),
    "BloodTransfusionObservation": ("inpatient", "bloodtransfusionobservation"),
    "BPMonitoringReading": ("inpatient", "bpmonitoringreading"),
    "MedicationAdministration": ("inpatient", "medicationadministration"),
    "AdverseTransfusionReaction": ("inpatient", "adversetransfusionreaction"),
    "DischargeTemplate": ("inpatient", "dischargetemplate"),
    # blood_bank
    "BloodDonor": ("blood_bank", "blooddonor"),
    "BloodUnit": ("blood_bank", "bloodunit"),
    "BloodRequest": ("blood_bank", "bloodrequest"),
    "CrossMatch": ("blood_bank", "crossmatch"),
    "BloodIssue": ("blood_bank", "bloodissue"),
    # dialysis
    "VascularAccess": ("dialysis", "vascularaccess"),
    "DialysisOrder": ("dialysis", "dialysisorder"),
    "DialysisSession": ("dialysis", "dialysissession"),
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
    "ProcedureCatalog": ("procedures", "procedurecatalog"),
    # theatre
    "OperatingTheatre": ("theatre", "operatingtheatre"),
    "SurgeryCase": ("theatre", "surgerycase"),
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
    # immunizations
    "VaccineDefinition": ("immunizations", "vaccinedefinition"),
    "VaccineCampaign": ("immunizations", "vaccinecampaign"),
    "AEFI": ("immunizations", "aefi"),
    "VaccineStock": ("immunizations", "vaccinestock"),
    "ColdChainEquipment": ("immunizations", "coldchainequipment"),
    "TemperatureLog": ("immunizations", "temperaturelog"),
    "VaccineIncident": ("immunizations", "vaccineincident"),
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
    "Intervention": ("social_work", "socialworkintervention"),
    # scheduling & checkin
    "Appointment": ("scheduling", "appointment"),
    "Schedule": ("scheduling", "schedule"),
    "Shift": ("scheduling", "shift"),
    "ShiftSwapRequest": ("scheduling", "shiftswaprequest"),
    "CheckIn": ("checkin", "checkin"),
    # inventory
    "Supplier": ("inventory", "supplier"),
    "PurchaseOrder": ("inventory", "purchaseorder"),
    "PurchaseOrderItem": ("inventory", "purchaseorderitem"),
    "GoodsReceiptNote": ("inventory", "goodsreceiptnote"),
    "GRNItem": ("inventory", "grnitem"),
    "StoreLocation": ("inventory", "storelocation"),
    "StockTransfer": ("inventory", "stocktransfer"),
    "TransferItem": ("inventory", "transferitem"),
    "WardStock": ("inventory", "wardstock"),
    "WardStockTransaction": ("inventory", "wardstocktransaction"),
    "StockCount": ("inventory", "stockcount"),
    "StockCountItem": ("inventory", "stockcountitem"),
    "ETIMSConfig": ("inventory", "etimsconfig"),
    "ETIMSInvoice": ("inventory", "etimsinvoice"),
    "ConsumptionRecord": ("inventory", "consumptionrecord"),
    "DemandForecast": ("inventory", "demandforecast"),
    "ReorderSuggestion": ("inventory", "reordersuggestion"),
    # ai
    "AICareplanResult": ("ai", "aicareplanresult"),
    "AICarePlanResult": ("ai", "aicareplanresult"),
    "AICDSResult": ("ai", "aicdsresult"),
    "AIDischargeResult": ("ai", "aidischargeresult"),
    "AIICURiskResult": ("ai", "aiicuriskresult"),
    "AILabInterpretResult": ("ai", "ailabinterpretresult"),
    "ChatSession": ("ai", "chatsession"),
    "ChatMessage": ("ai", "chatmessage"),
    # quality
    "QuarterlyReport": ("quality", "quarterlyreport"),
    "AnnualReport": ("quality", "annualreport"),
    "QualityMeasure": ("quality", "qualitymeasure"),
    "QualityMeasureResult": ("quality", "qualitymeasureresult"),
    # analytics
    "FacilityDailySummary": ("analytics", "facilitydailysummary"),
    "DepartmentMonthlySummary": ("analytics", "departmentmonthlysummary"),
    "DiagnosisTrend": ("analytics", "diagnosistrend"),
    "PatientDemographicSnapshot": ("analytics", "patientdemographicsnapshot"),
    # moh_reporting
    "MOH705Report": ("moh_reporting", "moh705report"),
    "MOH711Report": ("moh_reporting", "moh711report"),
    "MOH717Report": ("moh_reporting", "moh717report"),
}

# Standard CRUD action mapping
ACTION_MAPPING: dict[str, str] = {
    "create": "add",
    "read": "view",
    "update": "change",
    "delete": "delete",
}

# Custom permission codenames used as-is
CUSTOM_ACTIONS: set[str] = {
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
    "manage_theatre",
    "document_surgery",
    "manage_schedules",
    "manage_theatre_settings",
    "approve_purchase_order",
    "approve_stock_transfer",
    "approve_stock_count",
    "manage_etims",
    # blood_bank
    "manage_blood_bank",
    "issue_blood_unit",
    "perform_crossmatch",
    # dialysis
    "manage_dialysis",
    "perform_dialysis",
    # laboratory — standalone LIS
    "accept_order",
    "reject_order",
    # laboratory — critical values
    "acknowledge",
    # immunizations
    "submit_to_authorities",
    "follow_up",
    "issue",
    "resolve",
    "accept",
    "decline",
    "complete",
    "cancel",
    "record",
    "add_observation",
    "mark_reaction",
    "complete_transfusion",
    "submit_to_ppb",
    # quality / analytics / moh_reporting
    "regenerate",
    "export_sdmx",
    "import_csv",
    "export_csv",
    "submit_to_dhis2",
    # emergency access
    "approve_emergency_access",
    "revoke_emergency_access",
    "view_emergency_dashboard",
}

# Actions following {action}_{model} pattern (e.g. view_sensitive_patient)
MODEL_SUFFIXED_ACTIONS: set[str] = {
    "view_sensitive",
}


def sync_role_group_permissions(role: Role) -> int:
    """Sync a Role's permissions_matrix to its linked Django Group.

    Returns the number of permissions set on the group.
    If the role has no linked django_group, does nothing and returns 0.
    """
    if not role.django_group:
        return 0

    if not role.permissions_matrix:
        role.django_group.permissions.clear()
        return 0

    group = role.django_group
    permissions_to_add: list[Permission] = []

    for model_name, actions in role.permissions_matrix.items():
        if model_name not in MODEL_MAPPING:
            logger.warning("sync_role_group_permissions: unknown model %s", model_name)
            continue

        app_label, model = MODEL_MAPPING[model_name]

        for action, granted in actions.items():
            if not granted:
                continue

            if action in CUSTOM_ACTIONS:
                codename = action
            elif action in MODEL_SUFFIXED_ACTIONS:
                codename = f"{action}_{model}"
            else:
                django_action = ACTION_MAPPING.get(action)
                if django_action is None:
                    logger.warning(
                        "sync_role_group_permissions: unknown action '%s' for %s",
                        action,
                        model_name,
                    )
                    continue
                codename = f"{django_action}_{model}"

            try:
                perm = Permission.objects.get(content_type__app_label=app_label, codename=codename)
                permissions_to_add.append(perm)
            except Permission.DoesNotExist:
                logger.warning("sync_role_group_permissions: %s.%s not found", app_label, codename)

    group.permissions.set(permissions_to_add)
    return len(permissions_to_add)
