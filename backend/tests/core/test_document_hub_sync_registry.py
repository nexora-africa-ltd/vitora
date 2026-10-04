# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for cloud-to-hub document model coverage. Run with pytest."""

from hmis.apps.core.sync_registry import is_downward_sync_model


def test_document_hub_models_are_available_for_downward_hub_sync():
    """Cloud document types shown in Document Hub must materialize on facility hubs."""
    for model_label in (
        "pharmacy.Prescription",
        "inpatient.Discharge",
        "imaging.RadiologyReport",
        "laboratory.DiagnosticReport",
        "sick_notes.SickNote",
        "referrals.ClinicalReferral",
        "billing.Invoice",
        "billing.SHAClaim",
        "billing.SHAPreauth",
        "billing.SHAClaimAttachment",
        "billing.CreditNote",
        "billing.Receipt",
        "billing.Payment",
        "core.DocumentSignature",
        "core.DocumentShare",
    ):
        assert is_downward_sync_model(model_label), model_label


def test_p0_parent_models_are_available_for_downward_hub_sync():
    """Registered clinical records must bring their already-supported FK parents to hubs."""
    for model_label in (
        "core.County",
        "core.SubCounty",
        "core.Ward",
        "laboratory.TestCatalog",
        "laboratory.Specimen",
        "billing.PaymentPoint",
        "billing.SHAMember",
        "pharmacy.StockBatch",
        "pharmacy.Dispensing",
        "inventory.StoreLocation",
        "inventory.Supplier",
        "inventory.PaymentTerm",
        "inventory.PurchaseOrder",
        "inventory.GoodsReceiptNote",
        "inpatient.AdmissionRecommendation",
        "mch.MCHRegistration",
        "blood_bank.BloodDonor",
        "blood_bank.BloodUnit",
        "theatre.TheatreEquipmentType",
        "encounters.TreatmentPlanTemplate",
        "immunizations.VaccineDefinition",
        "immunizations.FacilityCustomVaccine",
        "immunizations.OrganizationVaccineConfig",
        "immunizations.FacilityVaccineConfig",
        "immunizations.VaccineCampaign",
    ):
        assert is_downward_sync_model(model_label), model_label
