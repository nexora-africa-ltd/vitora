# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core sync registry for Vitora HMIS.

What this file is for:
- Implement sync registry logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class SyncDirection(Enum):
    """Supported sync directions for registered models."""

    UP = "up"
    DOWN = "down"
    BOTH = "both"


@dataclass(frozen=True)
class SyncRegistryEntry:
    """Configuration for one syncable model."""

    direction: SyncDirection
    priority: int
    exclude_fields: tuple[str, ...] = field(default_factory=tuple)
    batch_size: int | None = None
    conflict_policy: str | None = None


@dataclass(frozen=True)
class SyncExclusion:
    """A deliberate decision to keep a tenant-scoped model out of hub sync."""

    reason: str
    replacement_strategy: str
    planned_phase: int | None = None


# Stable direct fields used only to bootstrap relation remapping before a
# source-node identity map exists. Append-only rows deliberately stay out of
# this map and rely on SyncIdentityMap after first materialization.
SYNC_NATURAL_IDENTITY_FIELDS: dict[str, tuple[str, ...]] = {
    "mch.MCHRegistration": ("mch_number",),
    "mch.HEIFollowUp": ("hei_number",),
    "inpatient.Admission": ("admission_number",),
    "inpatient.InterFacilityTransfer": ("transfer_number",),
    "procedures.ProcedureCatalog": ("code",),
    "procedures.ProcedureOrder": ("order_number",),
    "theatre.SurgeryCase": ("case_number",),
    "blood_bank.BloodDonor": ("donor_number",),
    "blood_bank.BloodUnit": ("unit_number",),
    "blood_bank.BloodRequest": ("request_number",),
    "immunizations.VaccineDefinition": ("code",),
    "immunizations.ColdChainEquipment": ("serial_number",),
}


def _exclusions(
    reason: str,
    replacement_strategy: str,
    *model_labels: str,
    planned_phase: int | None = None,
) -> dict[str, SyncExclusion]:
    """Create explicit, consistently documented exclusions for named models."""
    exclusion = SyncExclusion(
        reason=reason,
        replacement_strategy=replacement_strategy,
        planned_phase=planned_phase,
    )
    return dict.fromkeys(model_labels, exclusion)


SYNC_REGISTRY: dict[str, SyncRegistryEntry] = {
    # Core identity
    "core.Organization": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=1,
        conflict_policy="REMOTE_WINS",
    ),
    "core.Facility": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=2,
        conflict_policy="REMOTE_WINS",
    ),
    "core.Role": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=3,
        conflict_policy="REMOTE_WINS",
    ),
    "core.Department": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=3,
        conflict_policy="REMOTE_WINS",
    ),
    "core.StaffProfile": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=4,
        conflict_policy="LAST_WRITE_WINS",
    ),
    "core.OrgMembership": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=5,
        conflict_policy="LAST_WRITE_WINS",
    ),
    "auth.User": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=3,
        conflict_policy="LAST_WRITE_WINS",
        exclude_fields=("last_login",),
    ),
    # Global reference hierarchy and facility masters required by clinical FK graphs.
    "core.County": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=1),
    "core.SubCounty": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=2),
    "core.Ward": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=2),
    # Clinical data
    "patients.Patient": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "patients.EmergencyContact": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.Encounter": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "encounters.Diagnosis": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.TreatmentPlan": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.Medication": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "triage.TriageAssessment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.Clinic": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "clinics.ClinicRoom": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicSchedule": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicStaff": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicSession": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicVisit": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "clinics.ClinicEnrollment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "pharmacy.Prescription": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "pharmacy.PrescriptionItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "pharmacy.StockBatch": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "pharmacy.Dispensing": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "laboratory.LabOrder": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "laboratory.LabOrderItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "laboratory.LabResult": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "laboratory.TestCatalog": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "laboratory.Specimen": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "laboratory.DiagnosticReport": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.Invoice": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "billing.InvoiceItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.Payment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.PaymentPoint": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "billing.SHAMember": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "inventory.StoreLocation": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "inventory.Supplier": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "inventory.PaymentTerm": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "inventory.PurchaseOrder": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "inventory.GoodsReceiptNote": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.Receipt": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.CreditNote": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.SHAClaim": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.SHAPreauth": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.SHAClaimAttachment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "scheduling.Resource": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "scheduling.Schedule": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "scheduling.ScheduleBreak": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "scheduling.Appointment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "scheduling.Shift": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "scheduling.SchedulingSettings": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "scheduling.StaffConstraint": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "inpatient.Ward": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "inpatient.Bed": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "inpatient.Admission": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "inpatient.AdmissionRecommendation": SyncRegistryEntry(
        direction=SyncDirection.BOTH, priority=4
    ),
    "inpatient.Discharge": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "referrals.ClinicalReferral": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "sick_notes.SickNote": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "immunizations.ImmunizationRecord": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=4,
    ),
    "immunizations.VaccineDefinition": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=3),
    "immunizations.FacilityCustomVaccine": SyncRegistryEntry(
        direction=SyncDirection.BOTH, priority=3
    ),
    "immunizations.OrganizationVaccineConfig": SyncRegistryEntry(
        direction=SyncDirection.BOTH, priority=3
    ),
    "immunizations.FacilityVaccineConfig": SyncRegistryEntry(
        direction=SyncDirection.BOTH, priority=4
    ),
    "immunizations.VaccineCampaign": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "mch.MCHRegistration": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "blood_bank.BloodDonor": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "blood_bank.BloodUnit": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "theatre.TheatreEquipmentType": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "encounters.TreatmentPlanTemplate": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=3),
    "imaging.ImagingOrder": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "imaging.RadiologyReport": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    # Reference data (downward only in this phase, not auto-queued from hub)
    "encounters.ICD10Code": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "pharmacy.Drug": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "clinical_templates.ClinicalTemplate": SyncRegistryEntry(
        direction=SyncDirection.DOWN,
        priority=5,
    ),
    "billing.ServiceCategory": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "billing.Service": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "ai.TibaBotFacilityKey": SyncRegistryEntry(
        direction=SyncDirection.DOWN,
        priority=5,
        conflict_policy="REMOTE_WINS",
    ),
    "core.DocumentSignature": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "core.DocumentShare": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    # Compliance/audit
    "core.AuditLog": SyncRegistryEntry(direction=SyncDirection.UP, priority=5, batch_size=500),
}

# Phase 1 and 2 dependency-closed workflows. File/blob-bearing attachment
# models remain excluded until Phase 4 implements encrypted content transfer.
SYNC_REGISTRY.update(
    {
        # Phase 1: patient, encounter, laboratory, billing, and pharmacy.
        "patients.Allergy": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "patients.DeathRecord": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "encounters.EncounterStateHistory": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "encounters.VitalFlagSuggestionAction": SyncRegistryEntry(
            direction=SyncDirection.UP, priority=5
        ),
        "laboratory.LOINCCode": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=2),
        "laboratory.LabQueue": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "laboratory.LabResultTemplate": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=3),
        "laboratory.ResultValidation": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "pharmacy.DrugCategory": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=2),
        "pharmacy.StockAdjustment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "billing.InvoicePayer": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "billing.SHATariff": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=3),
        "billing.SHAClaimItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "billing.SHAClaimIntervention": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "billing.SHARemittanceLine": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        # Phase 2: MCH maternal and child health. Legacy MCH immunization
        # tables remain excluded; immunizations.* is the authoritative graph.
        "mch.ANCVisit": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.LabourPartograph": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.LabourPartographObservation": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "mch.Delivery": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.PNCVisit": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.GrowthMeasurement": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.HEIFollowUp": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.HEIPCRTest": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "mch.CommunityScreening": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "mch.VitaminASupplement": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "immunizations.AEFI": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "immunizations.VaccineStock": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "immunizations.StockTransaction": SyncRegistryEntry(direction=SyncDirection.UP, priority=5),
        "immunizations.ColdChainEquipment": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=4
        ),
        "immunizations.TemperatureLog": SyncRegistryEntry(direction=SyncDirection.UP, priority=5),
        "immunizations.VaccineIncident": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        # Phase 2: inpatient care continuum.
        "inpatient.BedAssignmentRequest": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=4
        ),
        "inpatient.DischargeDiagnosis": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.DischargeDraft": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.NursingKardex": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "inpatient.KardexScheduleItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.NursingCarePlanEntry": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.KardexShiftNote": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.KardexHandoverNote": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.ShiftHandover": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.WardRound": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.ReviewRequest": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.SupervisorAlertAcknowledgment": SyncRegistryEntry(
            direction=SyncDirection.UP, priority=5
        ),
        "inpatient.InpatientConsumableUsage": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.TemperatureReading": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.FluidBalanceSheet": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.FluidBalanceEntry": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.BPMonitoringReading": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.MedicationAdministration": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.BloodTransfusionObservation": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.TransfusionObservationEntry": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.AdverseTransfusionReaction": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.Transfer": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "inpatient.InterFacilityTransfer": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.InterFacilityTransferEvent": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "inpatient.KardexFieldChange": SyncRegistryEntry(direction=SyncDirection.UP, priority=5),
        "inpatient.NursingCarePlanEntryChange": SyncRegistryEntry(
            direction=SyncDirection.UP, priority=5
        ),
        # Phase 2: procedures, theatre, and blood bank.
        "procedures.ProcedureCatalog": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
        "procedures.ProcedureKit": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "procedures.ProcedureKitItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "procedures.ProcedureOrder": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "procedures.ProcedureConsent": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "procedures.ProcedureLog": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "procedures.ProcedureConsumable": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "procedures.ProcedureOutcome": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.OperatingTheatre": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
        "theatre.SurgeryCase": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "theatre.SurgicalTeamMember": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.WHOSafetyChecklist": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.AnesthesiaRecord": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.IntraOpVitalReading": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.OperativeNote": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.TheatreConsumable": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.TheatreConsumableAllocation": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "theatre.PACURecord": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.PACUVitalReading": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "theatre.CaseEquipmentRequirement": SyncRegistryEntry(
            direction=SyncDirection.BOTH, priority=5
        ),
        "blood_bank.BloodUnitStatusEvent": SyncRegistryEntry(
            direction=SyncDirection.UP, priority=5
        ),
        "blood_bank.BloodRequest": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
        "blood_bank.CrossMatch": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
        "blood_bank.BloodIssue": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    }
)


# Every concrete tenant-scoped model must appear here or in SYNC_REGISTRY. These
# exclusions are intentional gaps, not an implicit fallback: they make phased
# dependency closure auditable and force a new model to declare its offline plan.
SYNC_EXCLUSIONS: dict[str, SyncExclusion] = {
    **_exclusions(
        "Legacy MCH immunization tables have been superseded by the standalone immunizations domain.",
        "Run migrate_mch_immunizations, then use immunizations.VaccineDefinition, ImmunizationRecord, and AEFI as the authoritative graph.",
        "mch.Vaccine",
        "mch.ImmunizationRecord",
        "mch.AEFI",
        "mch.HistoricalImmunizationRecord",
        "mch.HistoricalAEFI",
    ),
    **_exclusions(
        "Historical tables are local audit projections and must not be independently synchronized.",
        "Synchronize the authoritative source model and preserve its history at the receiving node without replaying revisions.",
        "mch.HistoricalANCVisit",
        "mch.HistoricalDelivery",
        "mch.HistoricalGrowthMeasurement",
        "mch.HistoricalHEIFollowUp",
        "mch.HistoricalLabourPartograph",
        "mch.HistoricalLabourPartographObservation",
        "mch.HistoricalMCHRegistration",
        "mch.HistoricalPNCVisit",
        "inpatient.HistoricalAdmission",
        "immunizations.HistoricalAEFI",
        "immunizations.HistoricalImmunizationRecord",
        "immunizations.HistoricalVaccineIncident",
    ),
    **_exclusions(
        "Discharge templates and externally submitted procedure requests are cloud-managed configuration or integration records.",
        "Materialize the clinical discharge or procedure record on hubs; retrieve template and external-request details from cloud when online.",
        "inpatient.DischargeTemplate",
        "procedures.ExternalProcedureOrderRequest",
    ),
    **_exclusions(
        "Derived AI output can be recomputed from its source clinical record.",
        "Keep the source workflow synced; regenerate results or query cloud when online.",
        "ai.AIAdvisoryOrderLink",
        "ai.AICDSResult",
        "ai.AICarePlanResult",
        "ai.AIDischargeResult",
        "ai.AIEGFRResult",
        "ai.AIICURiskResult",
        "ai.AIInvestigationSuggestResult",
        "ai.AILabInterpretResult",
        "ai.AISurgicalChecklistSessionResult",
        "ai.AISurgicalPostOpCarePlanResult",
        "ai.AISurgicalPreOpAssessResult",
        "ai.ChatSession",
    ),
    **_exclusions(
        "Analytics projections are derived read models rather than clinical source records.",
        "Rebuild projections from synchronized source data after restore or reconnect.",
        "analytics.DepartmentMonthlySummary",
        "analytics.DiagnosisTrend",
        "analytics.FacilityDailySummary",
        "analytics.PatientDemographicSnapshot",
    ),
    **_exclusions(
        "SHA workflow transport state requires a connected DHA integration and is not hub-authoritative.",
        "Preserve source billing records; resume DHA exchange from cloud after connectivity returns.",
        "billing.ConsentToken",
        "billing.PatientContact",
        "billing.PreauthRequest",
        "billing.SHACoverageSnapshot",
        "billing.SHADhaPrescription",
        "billing.SHAEmergencyClaim",
        "billing.SHAOtpRequest",
        "billing.SHAOtpWhitelistRequest",
        "billing.SHARemittance",
        "billing.SHAUpload",
        planned_phase=3,
    ),
    **_exclusions(
        "Supplier settlement workflows are not yet dependency-closed on hubs.",
        "Retain cloud records and reconcile from synchronized invoices until inventory phase coverage ships.",
        "billing.SupplierBill",
        "billing.SupplierPayment",
        planned_phase=3,
    ),
    **_exclusions(
        "Decision-support alerts are derived from synchronized clinical data.",
        "Re-evaluate rules locally when supported or regenerate from cloud source records.",
        "cds.CDSAlert",
    ),
    **_exclusions(
        "Check-in and comment collaboration workflows lack their parent dependency closure.",
        "Use the synchronized encounter and clinic workflow; queueing will be added with its parent graph.",
        "checkin.CheckIn",
        "comments.ClinicalComment",
        planned_phase=3,
    ),
    **_exclusions(
        "Facility integration configuration contains connection secrets or cloud-only endpoints.",
        "Provision configuration through activation or protected hub configuration, never general sync.",
        "core.DHIS2Config",
        "core.FacilityEmailConfig",
        "hl7.HL7Endpoint",
        "hl7.HL7Message",
    ),
    **_exclusions(
        "Counselling, rehabilitation, and nutrition workflows are outside the current phased sync scope.",
        "Keep records cloud-authoritative until their complete parent and event graphs are implemented.",
        "counselling.CounsellingReferral",
        "dialysis.DialysisOrder",
        "dialysis.DialysisSession",
        "dialysis.VascularAccess",
        "nutrition.NutritionConsultation",
        "occupational_therapy.OccupationalTherapyOrder",
        "physiotherapy.PhysiotherapyOrder",
    ),
    **_exclusions(
        "Encounter history projections are derived or lack a standalone dependency-closed workflow.",
        "Reconstruct from the synchronized encounter record and retain source data in cloud.",
        "encounters.ChronicCondition",
        "encounters.CurrentMedication",
        "encounters.FamilyHistory",
        "encounters.PastSurgery",
        "encounters.PregnancyObservation",
        "encounters.SocialHistoryObservation",
        "encounters.VitalFlagSuggestion",
    ),
    **_exclusions(
        "Standalone imaging intake and equipment configuration are not dependency-closed with DICOM media.",
        "Sync report-level clinical documents; keep images and equipment integrations cloud-managed.",
        "imaging.ExternalImagingOrderRequest",
        "imaging.ImagingEquipment",
        "imaging.ImagingIntegrationSettings",
        "imaging.ImagingProcedure",
        "imaging.WalkInImagingPatient",
        planned_phase=4,
    ),
    **_exclusions(
        "Insurance integrations require payer-specific external state and reconciliation dependencies.",
        "Preserve source clinical and billing data; complete claims and payer state in cloud when online.",
        "insurance.FacilitySladeCredential",
        "insurance.InsuranceBalanceReservation",
        "insurance.InsuranceClaim",
        "insurance.InsuranceExternalSync",
        "insurance.InsuranceOutboundCall",
        "insurance.InsurancePlan",
        "insurance.InsurancePreauth",
        "insurance.InsuranceProvider",
        "insurance.InsuranceProviderConfig",
        "insurance.InsuranceRemittance",
        "insurance.InsuranceVisitAuthorization",
        "insurance.PatientInsurance",
        "insurance.PayerTariff",
        planned_phase=3,
    ),
    **_exclusions(
        "Inventory operational workflows are scheduled for a dependency-closed inventory release.",
        "Keep the currently synchronized master and procurement records; run inventory operations in cloud until phase 3.",
        "inventory.ConsumptionRecord",
        "inventory.DemandForecast",
        "inventory.ETIMSConfig",
        "inventory.ETIMSDailyReport",
        "inventory.ETIMSInvoice",
        "inventory.ReorderSuggestion",
        "inventory.StockCount",
        "inventory.StockTransfer",
        "inventory.WardStock",
        planned_phase=3,
    ),
    **_exclusions(
        "Laboratory quality, analyzer, and operational-support records need their complete instrument dependency graph.",
        "Sync orders, specimens, results, reports, and catalogues; retain instrument and QA workflows in cloud.",
        "laboratory.AnalyzerMessage",
        "laboratory.Antibiogram",
        "laboratory.AntibioticSensitivity",
        "laboratory.AutoVerifyConfig",
        "laboratory.AutoVerifyLog",
        "laboratory.AutoVerifyRule",
        "laboratory.CriticalValueNotification",
        "laboratory.CriticalValueRange",
        "laboratory.CultureResult",
        "laboratory.DeltaCheckResult",
        "laboratory.DeltaCheckRule",
        "laboratory.EQASample",
        "laboratory.EQASubmission",
        "laboratory.EQASurvey",
        "laboratory.ExternalOrderRequest",
        "laboratory.ExternalPatientIdentifierCrosswalk",
        "laboratory.InboundIngestionEvent",
        "laboratory.Instrument",
        "laboratory.InstrumentChannel",
        "laboratory.LabBarcodeConfig",
        "laboratory.LabWorkflowSettings",
        "laboratory.LabelPrintJob",
        "laboratory.LabelPrintJobItem",
        "laboratory.LabelTemplate",
        "laboratory.LaboratoryAlertSettings",
        "laboratory.QCLot",
        "laboratory.QCMaterial",
        "laboratory.QCResult",
        "laboratory.QCRule",
        "laboratory.QCRuleViolation",
        "laboratory.QCTarget",
        "laboratory.ReferralLab",
        "laboratory.ReflexExecution",
        "laboratory.ReflexRule",
        "laboratory.ResultCommentTemplate",
        "laboratory.ResultDeliveryLog",
        "laboratory.SpecimenRejectionReason",
        "laboratory.TATSLATarget",
        "laboratory.TATSnapshot",
        "laboratory.WalkInPatient",
        "laboratory.WorkloadSnapshot",
        "laboratory.Worksheet",
        "laboratory.WorksheetItem",
        "laboratory.WorksheetTemplate",
    ),
    **_exclusions(
        "MOH reports are generated outputs, not source clinical data.",
        "Recompute reports from synchronized source records or submit from cloud.",
        "moh_reporting.MOH705Report",
        "moh_reporting.MOH711Report",
        "moh_reporting.MOH717Report",
    ),
    **_exclusions(
        "Pharmacy alert and external-prescription workflows are not yet closed around inventory availability.",
        "Sync prescriptions, items, batches, and dispensing; complete external and alert workflows in cloud.",
        "pharmacy.AlertSettings",
        "pharmacy.ExternalPrescriptionRequest",
        "pharmacy.StockAlert",
        "pharmacy.WalkInCustomer",
        planned_phase=1,
    ),
    **_exclusions(
        "Quality, scheduling extensions, surveillance, theatre, and social-work workflows are pending their phase dependency closure.",
        "Keep their cloud records authoritative; use only explicitly registered parent records on hubs.",
        "quality.FacilitySDMXConfiguration",
        "scheduling.AssignmentRule",
        "scheduling.DepartmentRosterSettings",
        "scheduling.DepartmentShiftConfig",
        "scheduling.ShiftSwapRequest",
        "scheduling.ShiftTypeConfig",
        "scheduling.ShiftVacancy",
        "shr.SHRConsentVisit",
        "social_work.SocialWorkReferral",
        "surveillance.ContactTracingContact",
        "surveillance.ContactTracingFollowUp",
        "surveillance.CountyNotificationDelivery",
        "surveillance.IHRNotification",
        "surveillance.NotifiableCase",
        "surveillance.SurveillanceAlert",
        "surveillance.SurveillanceFacilitySettings",
        "triage.ERBed",
        planned_phase=3,
    ),
}


def get_registry_entry(model_label: str) -> SyncRegistryEntry | None:
    """Return the sync registry entry for a model label, if registered."""
    return SYNC_REGISTRY.get(model_label)


def is_upward_sync_model(model_label: str) -> bool:
    """Return whether a model should auto-queue upward changes from a hub."""
    entry = get_registry_entry(model_label)
    return bool(entry and entry.direction in {SyncDirection.UP, SyncDirection.BOTH})


def is_downward_sync_model(model_label: str) -> bool:
    """Return whether a model can be pulled downward from cloud to hub."""
    entry = get_registry_entry(model_label)
    return bool(entry and entry.direction in {SyncDirection.DOWN, SyncDirection.BOTH})


def downward_sync_models() -> set[str]:
    """Return all registry labels allowed in cloud-to-hub pulls."""
    return {
        model_label
        for model_label, entry in SYNC_REGISTRY.items()
        if entry.direction in {SyncDirection.DOWN, SyncDirection.BOTH}
    }
