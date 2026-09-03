# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Utility to sync a Role's permissions_matrix to its linked Django Group permissions.

Called automatically when a Role is saved via the API or Django admin.
Also used by the sync_role_permissions management command for bulk operations.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import TYPE_CHECKING

from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType

if TYPE_CHECKING:
    from hmis.apps.core.models import Role

logger = logging.getLogger(__name__)

# Mapping from permissions_matrix model names to Django (app_label, model_name)
MODEL_MAPPING: dict[str, tuple[str, str]] = {
    # django admin
    "LogEntry": ("admin", "logentry"),
    "Logentry": ("admin", "logentry"),
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
    # imaging — standalone
    "WalkInImagingPatient": ("imaging", "walkinimagingpatient"),
    "ExternalImagingOrderRequest": ("imaging", "externalimagingorderrequest"),
    # pharmacy
    "Prescription": ("pharmacy", "prescription"),
    "PrescriptionItem": ("pharmacy", "prescriptionitem"),
    "Dispensing": ("pharmacy", "dispensing"),
    "DrugDispensing": ("pharmacy", "dispensing"),
    "Drug": ("pharmacy", "drug"),
    "DrugCategory": ("pharmacy", "drugcategory"),
    "PharmacyInventory": ("pharmacy", "drug"),
    "StockBatch": ("pharmacy", "stockbatch"),
    "StockAdjustment": ("pharmacy", "stockadjustment"),
    "StockAlert": ("pharmacy", "stockalert"),
    "AlertSettings": ("pharmacy", "alertsettings"),
    # pharmacy — standalone
    "WalkInCustomer": ("pharmacy", "walkincustomer"),
    "ExternalPrescriptionRequest": ("pharmacy", "externalprescriptionrequest"),
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
    "SupplierBill": ("billing", "supplierbill"),
    "SupplierPayment": ("billing", "supplierpayment"),
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
    # sick notes
    "SickNote": ("sick_notes", "sicknote"),
    # insurance
    "InsuranceProvider": ("insurance", "insuranceprovider"),
    "InsurancePlan": ("insurance", "insuranceplan"),
    "PatientInsurance": ("insurance", "patientinsurance"),
    "InsuranceProviderConfig": ("insurance", "insuranceproviderconfig"),
    "InsuranceClaim": ("insurance", "insuranceclaim"),
    "InsuranceClaimItem": ("insurance", "insuranceclaimitem"),
    "InsurancePreauth": ("insurance", "insurancepreauth"),
    "InsuranceRemittance": ("insurance", "insuranceremittance"),
    "InsuranceRemittanceLine": ("insurance", "insuranceremittanceline"),
    "PayerTariff": ("insurance", "payertariff"),
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
    "TibaBotFacilityKey": ("ai", "tibabotfacilitykey"),
    "Tibabotfacilitykey": ("ai", "tibabotfacilitykey"),
    "AICareplanResult": ("ai", "aicareplanresult"),
    "AICarePlanResult": ("ai", "aicareplanresult"),
    "AICDSResult": ("ai", "aicdsresult"),
    "AIDischargeResult": ("ai", "aidischargeresult"),
    "AIICURiskResult": ("ai", "aiicuriskresult"),
    "AILabInterpretResult": ("ai", "ailabinterpretresult"),
    "AIAdvisoryOrderLink": ("ai", "aiadvisoryorderlink"),
    "Aiadvisoryorderlink": ("ai", "aiadvisoryorderlink"),
    "AIEGFRResult": ("ai", "aiegfrresult"),
    "Aiegfrresult": ("ai", "aiegfrresult"),
    "AIInvestigationSuggestResult": ("ai", "aiinvestigationsuggestresult"),
    "Aiinvestigationsuggestresult": ("ai", "aiinvestigationsuggestresult"),
    "AISurgicalChecklistSessionResult": ("ai", "aisurgicalchecklistsessionresult"),
    "Aisurgicalchecklistsessionresult": ("ai", "aisurgicalchecklistsessionresult"),
    "AISurgicalPostOpCarePlanResult": ("ai", "aisurgicalpostopcareplanresult"),
    "Aisurgicalpostopcareplanresult": ("ai", "aisurgicalpostopcareplanresult"),
    "AISurgicalPreOpAssessResult": ("ai", "aisurgicalpreopassessresult"),
    "Aisurgicalpreopassessresult": ("ai", "aisurgicalpreopassessresult"),
    "ChatSession": ("ai", "chatsession"),
    "ChatMessage": ("ai", "chatmessage"),
    # imaging extensions
    "DICOMSeries": ("imaging", "dicomseries"),
    "Dicomseries": ("imaging", "dicomseries"),
    "DICOMInstance": ("imaging", "dicominstance"),
    "Dicominstance": ("imaging", "dicominstance"),
    "ImagingEquipment": ("imaging", "imagingequipment"),
    "Imagingequipment": ("imaging", "imagingequipment"),
    "ImagingIntegrationSettings": ("imaging", "imagingintegrationsettings"),
    "Imagingintegrationsettings": ("imaging", "imagingintegrationsettings"),
    "ReportAmendment": ("imaging", "reportamendment"),
    "Reportamendment": ("imaging", "reportamendment"),
    "StudyShareLink": ("imaging", "studysharelink"),
    "Studysharelink": ("imaging", "studysharelink"),
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
    # sick notes
    "issue_sick_note",
    "revoke_sick_note",
    # insurance
    "verify_enrollment",
    "submit_insurance_claim",
    "approve_insurance_claim",
    "adjudicate_insurance_claim",
    "approve_insurance_preauth",
    "reconcile_remittance",
    # supplier bills
    "approve_supplierbill",
    # scheduling
    "approve_swap",
}

# Actions following {action}_{model} pattern (e.g. view_sensitive_patient)
MODEL_SUFFIXED_ACTIONS: set[str] = {
    "view_sensitive",
}


_DYNAMIC_MODEL_MAPPING_CACHE: dict[str, tuple[str, str] | None] = {}
_UNKNOWN_MODEL_WARNED: set[str] = set()


def _resolve_model_target(model_name: str) -> tuple[str, str] | None:
    """Resolve a matrix model key to (app_label, model) with dynamic fallback.

    If a key is not present in MODEL_MAPPING, try a ContentType lookup using the
    lower-cased model token so legacy matrix keys like `Aiadvisoryorderlink` can
    still resolve without noisy warnings.
    """
    mapped = MODEL_MAPPING.get(model_name)
    if mapped is not None:
        return mapped

    cached = _DYNAMIC_MODEL_MAPPING_CACHE.get(model_name)
    if model_name in _DYNAMIC_MODEL_MAPPING_CACHE:
        return cached

    normalized = (model_name or "").strip().lower()
    if not normalized:
        _DYNAMIC_MODEL_MAPPING_CACHE[model_name] = None
        return None

    matches = list(
        ContentType.objects.filter(model=normalized).values_list("app_label", "model").distinct()
    )
    if len(matches) == 1:
        resolved = matches[0]
        _DYNAMIC_MODEL_MAPPING_CACHE[model_name] = resolved
        logger.info(
            "sync_role_group_permissions: resolved unknown model %s to %s.%s via ContentType",
            model_name,
            resolved[0],
            resolved[1],
        )
        return resolved

    _DYNAMIC_MODEL_MAPPING_CACHE[model_name] = None
    if model_name not in _UNKNOWN_MODEL_WARNED:
        if len(matches) > 1:
            logger.warning(
                "sync_role_group_permissions: ambiguous model %s (matches=%s)",
                model_name,
                ",".join(f"{app}.{mdl}" for app, mdl in matches),
            )
        else:
            logger.warning("sync_role_group_permissions: unknown model %s", model_name)
        _UNKNOWN_MODEL_WARNED.add(model_name)

    return None


def _build_reverse_model_mapping() -> dict[tuple[str, str], str]:
    """Reverse of MODEL_MAPPING: (app_label, model) -> canonical matrix key.

    Several matrix keys can map to the same (app_label, model) (e.g.
    "Dispensing" and "DrugDispensing" both -> ("pharmacy", "dispensing")).
    We prefer the matrix key whose lowercased form equals the model name,
    falling back to the first key registered.
    """
    reverse: dict[tuple[str, str], str] = {}
    for matrix_key, target in MODEL_MAPPING.items():
        existing = reverse.get(target)
        if existing is None:
            reverse[target] = matrix_key
            continue
        # Prefer the key whose lowercased form matches the model name
        if existing.lower() != target[1] and matrix_key.lower() == target[1]:
            reverse[target] = matrix_key
    return reverse


REVERSE_MODEL_MAPPING: dict[tuple[str, str], str] = _build_reverse_model_mapping()


def get_matrix_key(app_label: str, model: str) -> str | None:
    """Return the canonical PascalCase matrix key for a Django (app_label, model) pair."""
    return REVERSE_MODEL_MAPPING.get((app_label, model))


# Reverse of ACTION_MAPPING: django CRUD verb -> matrix action key
REVERSE_ACTION_MAPPING: dict[str, str] = {v: k for k, v in ACTION_MAPPING.items()}


def get_matrix_action(codename: str, model: str) -> str | None:  # noqa: ARG001
    """Return the canonical matrix action key for a Django Permission codename.

    Inverse of the codename construction in sync_role_group_permissions:
    - Custom action codenames (CUSTOM_ACTIONS) -> codename itself
    - Model-suffixed actions (e.g. view_sensitive_patient) -> the prefix
    - Standard CRUD (add/view/change/delete) -> create/read/update/delete
    """
    if codename in CUSTOM_ACTIONS:
        return codename

    for prefix in MODEL_SUFFIXED_ACTIONS:
        if codename.startswith(prefix + "_"):
            return prefix

    separator_index = codename.find("_")
    if separator_index <= 0:
        return None

    django_action = codename[:separator_index]
    return REVERSE_ACTION_MAPPING.get(django_action)


def sync_role_group_permissions(role: Role) -> int:
    """Sync a Role's permissions_matrix to its linked Django Group.

    Returns the number of permissions set on the group.
    If the role has no linked django_group, does nothing and returns 0.
    """
    group = ensure_role_django_group(role)

    if not role.permissions_matrix:
        group.permissions.clear()
        return 0

    permissions_to_add = collect_permissions_for_role(role)

    group.permissions.set(permissions_to_add)
    return len(permissions_to_add)


def collect_permissions_for_role(role: Role) -> list[Permission]:
    """Resolve the Django Permission objects implied by a role matrix."""
    if not role.permissions_matrix:
        return []

    permissions_to_add: list[Permission] = []

    for model_name, actions in role.permissions_matrix.items():
        resolved_target = _resolve_model_target(model_name)
        if resolved_target is None:
            continue

        app_label, model = resolved_target

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
                perm = Permission.objects.get(
                    content_type__app_label=app_label,
                    content_type__model=model,
                    codename=codename,
                )
                permissions_to_add.append(perm)
            except Permission.DoesNotExist:
                logger.warning("sync_role_group_permissions: %s.%s not found", app_label, codename)
            except Permission.MultipleObjectsReturned:
                logger.warning(
                    "sync_role_group_permissions: multiple matches for %s.%s (model=%s)",
                    app_label,
                    codename,
                    model,
                )

    return permissions_to_add


def expected_role_permission_ids(role: Role) -> set[int]:
    """Return expected permission IDs for the role's current matrix."""
    return {perm.id for perm in collect_permissions_for_role(role)}


def ensure_role_django_group(role: Role) -> Group:
    """Ensure a Role has a linked Django Group, creating one if needed."""
    if role.django_group_id:
        return role.django_group

    base_name = (role.code or role.name or f"role-{role.pk}").strip()
    candidate = base_name
    suffix = 1
    while Group.objects.filter(name=candidate).exists():
        candidate = f"{base_name}-{suffix}"
        suffix += 1

    group = Group.objects.create(name=candidate)
    role.django_group = group
    role.save(update_fields=["django_group", "updated_at"])
    return group


def _unique_roles(roles: Iterable[Role]) -> list[Role]:
    """Return roles de-duplicated by PK while preserving order."""
    unique: list[Role] = []
    seen_ids: set[int] = set()
    for role in roles:
        role_id = getattr(role, "pk", None)
        if not role_id or role_id in seen_ids:
            continue
        seen_ids.add(role_id)
        unique.append(role)
    return unique


def sync_staff_profile_role_groups(profile) -> bool:
    """Sync a user's Django groups from StaffProfile and active OrgMembership roles.

    Returns True when group membership was updated.
    """
    from hmis.apps.core.models import Role

    if not getattr(profile, "user_id", None):
        return False

    user = profile.user
    role_group_ids = set(
        Role.objects.exclude(django_group__isnull=True).values_list("django_group_id", flat=True)
    )
    current_group_ids = set(user.groups.values_list("id", flat=True))

    target_roles: list[Role] = []
    if getattr(profile, "primary_role_id", None):
        target_roles.append(profile.primary_role)
    target_roles.extend(list(profile.secondary_roles.all()))

    active_memberships = profile.memberships.filter(status="ACTIVE").select_related("role")
    target_roles.extend(
        membership.role for membership in active_memberships if getattr(membership, "role_id", None)
    )

    target_group_ids: set[int] = set()
    for role in _unique_roles(target_roles):
        target_group_ids.add(ensure_role_django_group(role).id)

    next_group_ids = (current_group_ids - role_group_ids) | target_group_ids
    if next_group_ids == current_group_ids:
        return False

    user.groups.set(next_group_ids)
    return True


def reconcile_hub_rbac_state() -> dict[str, int]:
    """Reconcile role/group and user/group RBAC drift on hubs.

    Returns counters for observability and health reporting.
    """
    from hmis.apps.core.models import Role, StaffProfile

    roles_checked = 0
    role_groups_corrected = 0
    profiles_checked = 0
    profile_groups_corrected = 0

    roles = Role.objects.select_related("django_group").all().order_by("id")
    for role in roles:
        roles_checked += 1
        expected_ids = expected_role_permission_ids(role)

        if role.django_group_id:
            actual_ids = set(role.django_group.permissions.values_list("id", flat=True))
        else:
            actual_ids = set()

        if actual_ids != expected_ids:
            sync_role_group_permissions(role)
            role_groups_corrected += 1

    profiles = (
        StaffProfile.objects.select_related("user", "primary_role")
        .prefetch_related("secondary_roles", "memberships__role")
        .all()
    )
    for profile in profiles:
        profiles_checked += 1
        if sync_staff_profile_role_groups(profile):
            profile_groups_corrected += 1

    return {
        "roles_checked": roles_checked,
        "role_groups_corrected": role_groups_corrected,
        "profiles_checked": profiles_checked,
        "profile_groups_corrected": profile_groups_corrected,
    }
