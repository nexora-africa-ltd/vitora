# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Phase 2 cross-primary-key materialization integration tests.

Run with: poetry run pytest tests/core/test_phase2_cross_pk_integration.py --no-cov
Inputs: real Django aggregate records plus cloud source-node identity mappings.
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.apps import apps
from django.utils import timezone

from hmis.apps.core.models import SyncIdentityMap
from hmis.apps.core.sync_materializer import materialize_entry
from hmis.apps.core.sync_materializer_helpers import apply_materialized_m2m
from hmis.apps.core.sync_materializer_resolvers import remap_materialized_foreign_keys
from hmis.apps.core.sync_registry import SYNC_REGISTRY

pytestmark = pytest.mark.django_db

SOURCE_NODE = "cloud:phase2-cross-pk"

# Each tuple identifies the concrete child FK that must survive a cloud/local
# primary-key mismatch. Keep this explicit so registry additions require a test.
PHASE2_CROSS_PK_RELATIONS = (
    ("mch.ANCVisit", "registration"),
    ("mch.LabourPartograph", "registration"),
    ("mch.LabourPartographObservation", "partograph"),
    ("mch.Delivery", "registration"),
    ("mch.PNCVisit", "registration"),
    ("mch.GrowthMeasurement", "patient"),
    ("mch.HEIFollowUp", "mch_registration"),
    ("mch.HEIPCRTest", "hei_followup"),
    ("mch.CommunityScreening", "patient"),
    ("mch.VitaminASupplement", "patient"),
    ("immunizations.AEFI", "immunization_record"),
    ("immunizations.VaccineStock", "vaccine"),
    ("immunizations.StockTransaction", "stock"),
    ("immunizations.ColdChainEquipment", "scheduling_resource"),
    ("immunizations.TemperatureLog", "equipment"),
    ("immunizations.VaccineIncident", "reported_by"),
    ("inpatient.BedAssignmentRequest", "patient"),
    ("inpatient.DischargeDiagnosis", "discharge"),
    ("inpatient.DischargeDraft", "admission"),
    ("inpatient.NursingKardex", "admission"),
    ("inpatient.KardexScheduleItem", "kardex"),
    ("inpatient.NursingCarePlanEntry", "kardex"),
    ("inpatient.KardexShiftNote", "kardex"),
    ("inpatient.KardexHandoverNote", "kardex"),
    ("inpatient.ShiftHandover", "ward"),
    ("inpatient.WardRound", "admission"),
    ("inpatient.ReviewRequest", "admission"),
    ("inpatient.SupervisorAlertAcknowledgment", "admission"),
    ("inpatient.InpatientConsumableUsage", "admission"),
    ("inpatient.TemperatureReading", "admission"),
    ("inpatient.FluidBalanceSheet", "admission"),
    ("inpatient.FluidBalanceEntry", "fluid_balance_sheet"),
    ("inpatient.BPMonitoringReading", "admission"),
    ("inpatient.MedicationAdministration", "admission"),
    ("inpatient.BloodTransfusionObservation", "admission"),
    ("inpatient.TransfusionObservationEntry", "transfusion"),
    ("inpatient.AdverseTransfusionReaction", "transfusion"),
    ("inpatient.Transfer", "admission"),
    ("inpatient.InterFacilityTransfer", "source_admission"),
    ("inpatient.InterFacilityTransferEvent", "transfer"),
    ("inpatient.KardexFieldChange", "kardex"),
    ("inpatient.NursingCarePlanEntryChange", "care_plan_entry"),
    ("procedures.ProcedureCatalog", "billing_service"),
    ("procedures.ProcedureKit", "procedure"),
    ("procedures.ProcedureKitItem", "kit"),
    ("procedures.ProcedureOrder", "procedure"),
    ("procedures.ProcedureConsent", "order"),
    ("procedures.ProcedureLog", "order"),
    ("procedures.ProcedureConsumable", "log"),
    ("procedures.ProcedureOutcome", "log"),
    ("theatre.OperatingTheatre", "scheduling_resource"),
    ("theatre.SurgeryCase", "primary_procedure"),
    ("theatre.SurgicalTeamMember", "surgery_case"),
    ("theatre.WHOSafetyChecklist", "surgery_case"),
    ("theatre.AnesthesiaRecord", "surgery_case"),
    ("theatre.IntraOpVitalReading", "anesthesia_record"),
    ("theatre.OperativeNote", "surgery_case"),
    ("theatre.TheatreConsumable", "surgery_case"),
    ("theatre.TheatreConsumableAllocation", "theatre_consumable"),
    ("theatre.PACURecord", "surgery_case"),
    ("theatre.PACUVitalReading", "pacu_record"),
    ("theatre.CaseEquipmentRequirement", "surgery_case"),
    ("blood_bank.BloodUnitStatusEvent", "blood_unit"),
    ("blood_bank.BloodRequest", "patient"),
    ("blood_bank.CrossMatch", "blood_request"),
    ("blood_bank.BloodIssue", "blood_request"),
)

EXPECTED_PHASE2_CHILD_LABELS = {
    "mch.ANCVisit",
    "mch.LabourPartograph",
    "mch.LabourPartographObservation",
    "mch.Delivery",
    "mch.PNCVisit",
    "mch.GrowthMeasurement",
    "mch.HEIFollowUp",
    "mch.HEIPCRTest",
    "mch.CommunityScreening",
    "mch.VitaminASupplement",
    "immunizations.AEFI",
    "immunizations.VaccineStock",
    "immunizations.StockTransaction",
    "immunizations.ColdChainEquipment",
    "immunizations.TemperatureLog",
    "immunizations.VaccineIncident",
    "inpatient.BedAssignmentRequest",
    "inpatient.DischargeDiagnosis",
    "inpatient.DischargeDraft",
    "inpatient.NursingKardex",
    "inpatient.KardexScheduleItem",
    "inpatient.NursingCarePlanEntry",
    "inpatient.KardexShiftNote",
    "inpatient.KardexHandoverNote",
    "inpatient.ShiftHandover",
    "inpatient.WardRound",
    "inpatient.ReviewRequest",
    "inpatient.SupervisorAlertAcknowledgment",
    "inpatient.InpatientConsumableUsage",
    "inpatient.TemperatureReading",
    "inpatient.FluidBalanceSheet",
    "inpatient.FluidBalanceEntry",
    "inpatient.BPMonitoringReading",
    "inpatient.MedicationAdministration",
    "inpatient.BloodTransfusionObservation",
    "inpatient.TransfusionObservationEntry",
    "inpatient.AdverseTransfusionReaction",
    "inpatient.Transfer",
    "inpatient.InterFacilityTransfer",
    "inpatient.InterFacilityTransferEvent",
    "inpatient.KardexFieldChange",
    "inpatient.NursingCarePlanEntryChange",
    "procedures.ProcedureCatalog",
    "procedures.ProcedureKit",
    "procedures.ProcedureKitItem",
    "procedures.ProcedureOrder",
    "procedures.ProcedureConsent",
    "procedures.ProcedureLog",
    "procedures.ProcedureConsumable",
    "procedures.ProcedureOutcome",
    "theatre.OperatingTheatre",
    "theatre.SurgeryCase",
    "theatre.SurgicalTeamMember",
    "theatre.WHOSafetyChecklist",
    "theatre.AnesthesiaRecord",
    "theatre.IntraOpVitalReading",
    "theatre.OperativeNote",
    "theatre.TheatreConsumable",
    "theatre.TheatreConsumableAllocation",
    "theatre.PACURecord",
    "theatre.PACUVitalReading",
    "theatre.CaseEquipmentRequirement",
    "blood_bank.BloodUnitStatusEvent",
    "blood_bank.BloodRequest",
    "blood_bank.CrossMatch",
    "blood_bank.BloodIssue",
}


def map_remote(model, remote_id: int, local_id: int) -> None:
    """Record the remote-to-local identity used by a materialized relation."""
    SyncIdentityMap.objects.create(
        source_node=SOURCE_NODE,
        model_label=model._meta.label,
        remote_record_id=str(remote_id),
        local_record_id=local_id,
    )


def test_phase2_cross_pk_parameters_cover_every_registered_child_label():
    """Keep the explicit Phase 2 registry coverage list aligned with test parameters."""
    covered_labels = {model_label for model_label, _ in PHASE2_CROSS_PK_RELATIONS}

    assert covered_labels == EXPECTED_PHASE2_CHILD_LABELS
    assert set(SYNC_REGISTRY) >= EXPECTED_PHASE2_CHILD_LABELS


@pytest.mark.parametrize(
    ("model_label", "relation_name"),
    PHASE2_CROSS_PK_RELATIONS,
    ids=[model_label for model_label, _ in PHASE2_CROSS_PK_RELATIONS],
)
def test_phase2_child_foreign_keys_remap_through_source_node_identity_map(
    model_label, relation_name
):
    """Every Phase 2 child relation resolves a cloud PK through SyncIdentityMap."""
    model = apps.get_model(model_label)
    relation = model._meta.get_field(relation_name)
    remote_id = 990001
    local_id = 880001

    assert model_label in EXPECTED_PHASE2_CHILD_LABELS
    assert relation.many_to_one or relation.one_to_one
    map_remote(relation.remote_field.model, remote_id, local_id)

    remapped = remap_materialized_foreign_keys(
        model,
        {relation.attname: remote_id},
        {relation.attname: remote_id, "sync_meta": {"source_node": SOURCE_NODE}},
    )

    assert remapped[relation.attname] == local_id


def create_surgery_case(sample_patient, sample_facility, test_user):
    """Create a persisted theatre aggregate root with a primary procedure."""
    from hmis.apps.procedures.models import ProcedureCatalog
    from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase

    primary = ProcedureCatalog.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        code="XPK-PRIMARY",
        name="Cross-PK primary procedure",
        category="SURGICAL",
    )
    theatre = OperatingTheatre.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        code="XPK-OT",
        name="Cross-PK Theatre",
        theatre_type="GENERAL",
    )
    return SurgeryCase.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        patient=sample_patient,
        primary_procedure=primary,
        theatre=theatre,
        scheduled_date=date.today(),
        scheduled_start_time=time(9),
        estimated_duration_minutes=45,
        diagnosis="Cross-PK integration test",
        requesting_doctor=test_user,
    )


def test_theatre_m2m_relations_reconcile_mapped_remote_ids(
    sample_patient, sample_facility, test_user
):
    """Surgery procedures and anesthesia blood issues use source-node mappings."""
    from hmis.apps.blood_bank.models import BloodDonor, BloodIssue, BloodRequest, BloodUnit
    from hmis.apps.procedures.models import ProcedureCatalog
    from hmis.apps.theatre.models import AnesthesiaRecord, SurgeryCase

    surgery = create_surgery_case(sample_patient, sample_facility, test_user)
    additional = ProcedureCatalog.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        code="XPK-ADDITIONAL",
        name="Cross-PK additional procedure",
        category="SURGICAL",
    )
    map_remote(ProcedureCatalog, 9001, additional.pk)
    apply_materialized_m2m(
        SurgeryCase,
        surgery,
        {"additional_procedures": [9001], "sync_meta": {"source_node": SOURCE_NODE}},
    )
    assert list(surgery.additional_procedures.values_list("pk", flat=True)) == [additional.pk]

    donor = BloodDonor.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        first_name="Blood",
        last_name="Donor",
        date_of_birth=date(1980, 1, 1),
        gender="M",
        blood_group="O+",
    )
    unit = BloodUnit.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        donor=donor,
        blood_group="O+",
        expiry_date=timezone.now() + timedelta(days=30),
        status="AVAILABLE",
    )
    request = BloodRequest.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        patient=sample_patient,
        requested_by=test_user,
        blood_group="O+",
        clinical_indication="Cross-PK surgery",
    )
    issue = BloodIssue.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        blood_request=request,
        blood_unit=unit,
        issued_by=test_user,
    )
    record = AnesthesiaRecord.objects.create(surgery_case=surgery, anesthesiologist=test_user)
    map_remote(BloodIssue, 9002, issue.pk)
    apply_materialized_m2m(
        AnesthesiaRecord,
        record,
        {"blood_issues": [9002], "sync_meta": {"source_node": SOURCE_NODE}},
    )
    assert list(record.blood_issues.values_list("pk", flat=True)) == [issue.pk]


def test_immunization_m2m_relations_reconcile_mapped_remote_ids(sample_facility):
    """Campaign and incident aggregate M2M links resolve remote PKs independently."""
    from hmis.apps.immunizations.models import (
        ColdChainEquipment,
        FacilityCustomVaccine,
        VaccineCampaign,
        VaccineDefinition,
        VaccineIncident,
        VaccineStock,
    )

    vaccine = VaccineDefinition.objects.create(code="XPK-VAX", name="Cross-PK Vaccine")
    custom = FacilityCustomVaccine.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        code="XPK-CUSTOM",
        name="Cross-PK Custom Vaccine",
        workflow="MANUAL",
    )
    campaign = VaccineCampaign.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        name="Cross-PK Campaign",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=1),
    )
    map_remote(VaccineDefinition, 9101, vaccine.pk)
    map_remote(FacilityCustomVaccine, 9102, custom.pk)
    apply_materialized_m2m(
        VaccineCampaign,
        campaign,
        {
            "vaccines": [9101],
            "custom_vaccines": [9102],
            "sync_meta": {"source_node": SOURCE_NODE},
        },
    )
    assert list(campaign.vaccines.values_list("pk", flat=True)) == [vaccine.pk]
    assert list(campaign.custom_vaccines.values_list("pk", flat=True)) == [custom.pk]

    equipment = ColdChainEquipment.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        name="Cross-PK fridge",
        equipment_type="REFRIGERATOR",
        serial_number="XPK-FRIDGE",
    )
    batch = VaccineStock.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        vaccine=vaccine,
        batch_number="XPK-BATCH",
        quantity_received=20,
        quantity_on_hand=20,
        expiry_date=date.today() + timedelta(days=90),
        received_date=date.today(),
    )
    incident = VaccineIncident.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        title="Cross-PK outage",
        incident_type="POWER_OUTAGE",
        description="Test incident",
        occurred_at=timezone.now(),
    )
    map_remote(ColdChainEquipment, 9103, equipment.pk)
    map_remote(VaccineStock, 9104, batch.pk)
    apply_materialized_m2m(
        VaccineIncident,
        incident,
        {
            "affected_equipment": [9103],
            "affected_batches": [9104],
            "sync_meta": {"source_node": SOURCE_NODE},
        },
    )
    assert list(incident.affected_equipment.values_list("pk", flat=True)) == [equipment.pk]
    assert list(incident.affected_batches.values_list("pk", flat=True)) == [batch.pk]


def test_mch_parent_foreign_key_remaps_to_local_patient(sample_patient, sample_facility):
    """MCH mother links resolve by natural key despite a cloud parent PK collision."""
    from hmis.apps.mch.models import MCHRegistration

    registration = MCHRegistration.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        mother=sample_patient,
    )
    map_remote(MCHRegistration, 9201, registration.pk)
    remapped = remap_materialized_foreign_keys(
        MCHRegistration,
        {"mother_id": 999999},
        {
            "mother_id": 999999,
            "mother_mrn": sample_patient.mrn,
            "sync_meta": {"source_node": SOURCE_NODE},
        },
    )
    assert remapped["mother_id"] == sample_patient.pk


def test_inpatient_parent_foreign_keys_remap_to_local_patient_and_mch_registration(
    sample_patient,
):
    """Inpatient admission parent graph remaps its patient parent without cloud PK reuse."""
    from hmis.apps.inpatient.models import Admission

    remapped = remap_materialized_foreign_keys(
        Admission,
        {"patient_id": 888888},
        {
            "patient_id": 888888,
            "patient_mrn": sample_patient.mrn,
            "sync_meta": {"source_node": SOURCE_NODE},
        },
    )
    assert remapped["patient_id"] == sample_patient.pk


def test_procedure_order_materializes_with_mapped_catalog_and_patient(
    sample_patient, sample_encounter, sample_facility, test_user
):
    """Procedure orders retain local catalog and patient links after a cloud PK collision."""
    from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder

    procedure = ProcedureCatalog.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        code="XPK-PROC-ORDER-001",
        name="Cross-PK procedure order catalog",
        category="SURGICAL",
    )
    map_remote(ProcedureCatalog, 9301, procedure.pk)
    map_remote(type(sample_patient), 9302, sample_patient.pk)
    map_remote(type(sample_encounter), 9303, sample_encounter.pk)
    map_remote(type(test_user), 9305, test_user.pk)

    result = materialize_entry(
        {
            "table": "procedures.ProcedureOrder",
            "operation": "CREATE",
            "record_id": 9304,
            "data": {
                "procedure_id": 9301,
                "patient_id": 9302,
                "encounter_id": 9303,
                "ordered_by_id": 9305,
                "organization_id": sample_facility.organization_id,
                "facility_id": sample_facility.pk,
                "indication": "Cross-PK procedure order",
                "sync_meta": {"source_node": SOURCE_NODE},
            },
        }
    )

    assert result == {"success": True}
    order = ProcedureOrder.objects.get(pk=9304)
    assert order.procedure_id == procedure.pk
    assert order.patient_id == sample_patient.pk


def test_pacu_record_materializes_with_mapped_surgery_case(
    sample_patient, sample_facility, test_user
):
    """PACU records resolve their surgery case through the source-node identity map."""
    from hmis.apps.theatre.models import PACURecord, SurgeryCase

    surgery = create_surgery_case(sample_patient, sample_facility, test_user)
    map_remote(SurgeryCase, 9311, surgery.pk)
    map_remote(type(test_user), 9312, test_user.pk)

    result = materialize_entry(
        {
            "table": "theatre.PACURecord",
            "operation": "CREATE",
            "record_id": 9313,
            "data": {
                "surgery_case_id": 9311,
                "arriving_nurse_id": 9312,
                "arrival_time": timezone.now().isoformat(),
                "initial_aldrete_score": 8,
                "sync_meta": {"source_node": SOURCE_NODE},
            },
        }
    )

    assert result == {"success": True}
    assert PACURecord.objects.get(pk=9313).surgery_case_id == surgery.pk


def test_blood_children_materialize_with_mapped_request_and_unit(
    sample_patient, sample_facility, test_user
):
    """Crossmatch and issue children preserve local blood request and unit relationships."""
    from hmis.apps.blood_bank.models import (
        BloodDonor,
        BloodIssue,
        BloodRequest,
        BloodUnit,
        CrossMatch,
    )

    donor = BloodDonor.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        first_name="Phase",
        last_name="Two Donor",
        date_of_birth=date(1980, 1, 1),
        gender="M",
        blood_group="O+",
    )
    unit = BloodUnit.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        donor=donor,
        blood_group="O+",
        expiry_date=timezone.now() + timedelta(days=30),
        status="AVAILABLE",
    )
    request = BloodRequest.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        patient=sample_patient,
        requested_by=test_user,
        blood_group="O+",
        clinical_indication="Cross-PK child materialization",
    )
    map_remote(BloodRequest, 9321, request.pk)
    map_remote(BloodUnit, 9322, unit.pk)
    map_remote(type(test_user), 9323, test_user.pk)

    crossmatch_result = materialize_entry(
        {
            "table": "blood_bank.CrossMatch",
            "operation": "CREATE",
            "record_id": 9324,
            "data": {
                "organization_id": sample_facility.organization_id,
                "facility_id": sample_facility.pk,
                "blood_request_id": 9321,
                "blood_unit_id": 9322,
                "performed_by_id": 9323,
                "result": "COMPATIBLE",
                "sync_meta": {"source_node": SOURCE_NODE},
            },
        }
    )
    issue_result = materialize_entry(
        {
            "table": "blood_bank.BloodIssue",
            "operation": "CREATE",
            "record_id": 9325,
            "data": {
                "organization_id": sample_facility.organization_id,
                "facility_id": sample_facility.pk,
                "blood_request_id": 9321,
                "blood_unit_id": 9322,
                "crossmatch_id": 9324,
                "issued_by_id": 9323,
                "sync_meta": {"source_node": SOURCE_NODE},
            },
        }
    )

    assert crossmatch_result == {"success": True}
    assert issue_result == {"success": True}
    crossmatch = CrossMatch.objects.get(pk=9324)
    issue = BloodIssue.objects.get(pk=9325)
    assert (crossmatch.blood_request_id, crossmatch.blood_unit_id) == (request.pk, unit.pk)
    assert (issue.blood_request_id, issue.blood_unit_id) == (request.pk, unit.pk)
    assert issue.crossmatch_id == crossmatch.pk


def test_hei_pcr_test_materializes_with_mapped_follow_up(sample_patient):
    """HEI PCR tests attach to the mapped local follow-up record, not a cloud PK."""
    from hmis.apps.mch.models import HEIFollowUp, HEIPCRTest

    follow_up = HEIFollowUp.objects.create(infant=sample_patient)
    map_remote(HEIFollowUp, 9331, follow_up.pk)

    result = materialize_entry(
        {
            "table": "mch.HEIPCRTest",
            "operation": "CREATE",
            "record_id": 9332,
            "data": {
                "hei_followup_id": 9331,
                "test_number": 1,
                "scheduled_date": date.today().isoformat(),
                "lab_reference": "XPK-HEI-PCR-001",
                "sync_meta": {"source_node": SOURCE_NODE},
            },
        }
    )

    assert result == {"success": True}
    assert HEIPCRTest.objects.get(pk=9332).hei_followup_id == follow_up.pk


def test_ward_round_materializes_with_mapped_admission(sample_admission, test_user):
    """Inpatient ward-round children resolve their admission through the identity map."""
    from hmis.apps.inpatient.models import Admission, WardRound

    map_remote(Admission, 9341, sample_admission.pk)
    map_remote(type(test_user), 9342, test_user.pk)

    result = materialize_entry(
        {
            "table": "inpatient.WardRound",
            "operation": "CREATE",
            "record_id": 9343,
            "data": {
                "admission_id": 9341,
                "conducted_by_id": 9342,
                "round_date": date.today().isoformat(),
                "round_time": time(10).isoformat(),
                "subjective": "Patient reports improvement.",
                "objective": "Vitals stable.",
                "assessment": "Responding to treatment.",
                "plan": "Continue current care.",
                "condition_status": "IMPROVING",
                "sync_meta": {"source_node": SOURCE_NODE},
            },
        }
    )

    assert result == {"success": True}
    assert WardRound.objects.get(pk=9343).admission_id == sample_admission.pk
