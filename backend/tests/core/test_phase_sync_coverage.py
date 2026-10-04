# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression coverage for Phase 1 and 2 dependency-closed sync workflows.

Run with: poetry run pytest tests/core/test_phase_sync_coverage.py --no-cov
Inputs: the declarative sync registry and registered Django model labels.
"""

from hmis.apps.core.sync_registry import (
    SYNC_EXCLUSIONS,
    is_downward_sync_model,
    is_upward_sync_model,
)


def test_phase_1_operational_workflows_are_bidirectional_or_cloud_mastered():
    """Phase 1 hubs must materialize patient-to-document workflow dependencies."""
    for model_label in (
        "patients.Allergy",
        "patients.DeathRecord",
        "encounters.EncounterStateHistory",
        "laboratory.LabQueue",
        "laboratory.ResultValidation",
        "pharmacy.StockAdjustment",
        "billing.InvoicePayer",
        "billing.SHAClaimItem",
        "billing.SHAClaimIntervention",
        "billing.SHARemittanceLine",
    ):
        assert is_upward_sync_model(model_label), model_label
        assert is_downward_sync_model(model_label), model_label

    for model_label in (
        "laboratory.LOINCCode",
        "laboratory.LabResultTemplate",
        "pharmacy.DrugCategory",
        "billing.SHATariff",
    ):
        assert is_downward_sync_model(model_label), model_label
        assert not is_upward_sync_model(model_label), model_label


def test_phase_2_operational_workflows_are_available_to_offline_hubs():
    """Phase 2 aggregate roots and clinical children must round-trip through hubs."""
    for model_label in (
        "mch.ANCVisit",
        "mch.LabourPartograph",
        "mch.LabourPartographObservation",
        "mch.Delivery",
        "mch.PNCVisit",
        "mch.HEIFollowUp",
        "mch.HEIPCRTest",
        "immunizations.AEFI",
        "immunizations.VaccineStock",
        "inpatient.NursingKardex",
        "inpatient.MedicationAdministration",
        "inpatient.AdverseTransfusionReaction",
        "procedures.ProcedureCatalog",
        "procedures.ProcedureOrder",
        "procedures.ProcedureConsent",
        "procedures.ProcedureLog",
        "procedures.ProcedureOutcome",
        "theatre.OperatingTheatre",
        "theatre.SurgeryCase",
        "theatre.AnesthesiaRecord",
        "theatre.PACURecord",
        "blood_bank.BloodRequest",
        "blood_bank.CrossMatch",
        "blood_bank.BloodIssue",
    ):
        assert is_upward_sync_model(model_label), model_label
        assert is_downward_sync_model(model_label), model_label


def test_phase_2_append_only_telemetry_is_hub_to_cloud():
    """Append-only monitoring records must be retained centrally without overwrite pulls."""
    for model_label in (
        "immunizations.StockTransaction",
        "immunizations.TemperatureLog",
        "inpatient.KardexFieldChange",
        "inpatient.NursingCarePlanEntryChange",
        "blood_bank.BloodUnitStatusEvent",
    ):
        assert is_upward_sync_model(model_label), model_label
        assert not is_downward_sync_model(model_label), model_label


def test_legacy_mch_immunization_models_are_explicitly_retired_from_sync():
    """Legacy vaccine records must not reintroduce a second authoritative graph."""
    for model_label in (
        "mch.Vaccine",
        "mch.ImmunizationRecord",
        "mch.AEFI",
        "mch.HistoricalImmunizationRecord",
        "mch.HistoricalAEFI",
    ):
        assert model_label in SYNC_EXCLUSIONS
