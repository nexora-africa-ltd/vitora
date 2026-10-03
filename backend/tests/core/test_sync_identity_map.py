# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for source-node identity mapping during hub/cloud materialization.

Run with: poetry run pytest tests/core/test_sync_identity_map.py --no-cov
Inputs: sync payload metadata, SyncIdentityMap, and materialized registry records.
"""

import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.core.models import SyncIdentityMap
from hmis.apps.core.sync_materializer import materialize_entry
from hmis.apps.core.sync_materializer_helpers import apply_materialized_m2m
from hmis.apps.core.sync_registry import SyncDirection
from hmis.apps.core.sync_signals import add_sync_meta

pytestmark = pytest.mark.django_db


def test_hub_payload_metadata_uses_immutable_hub_source_node():
    """Hub-originated operations must carry a source namespace for identity maps."""
    with override_settings(ENVIRONMENT="hub", HUB_ID="hub-facility-001"):
        payload = add_sync_meta({}, direction=SyncDirection.BOTH, priority=4)

    assert payload["sync_meta"]["source_node"] == "hub:hub-facility-001"
    assert payload["sync_meta"]["schema_version"] == 2


def test_materialization_uses_source_identity_map_before_colliding_pk(sample_patient):
    """A remote PK must update its mapped local row, not an unrelated colliding PK."""
    SyncIdentityMap.objects.create(
        source_node="cloud",
        model_label="patients.Patient",
        remote_record_id="987654",
        local_record_id=sample_patient.pk,
    )
    result = materialize_entry(
        {
            "table": "patients.Patient",
            "operation": "UPDATE",
            "record_id": 987654,
            "data": {
                "id": 987654,
                "last_name": "MappedFromCloud",
                "sync_meta": {"source_node": "cloud", "schema_version": 2},
            },
        }
    )

    assert result == {"success": True}
    sample_patient.refresh_from_db()
    assert sample_patient.last_name == "MappedFromCloud"
    mapping = SyncIdentityMap.objects.get(
        source_node="cloud",
        model_label="patients.Patient",
        remote_record_id="987654",
    )
    assert mapping.local_record_id == sample_patient.pk


def test_m2m_reconciliation_uses_mapped_remote_ids(sample_facility):
    """Procedure clinic links must resolve source IDs rather than use remote PKs."""
    from hmis.apps.clinics.models import Clinic
    from hmis.apps.procedures.models import ProcedureCatalog

    clinic = Clinic.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        name="Mapped Procedure Clinic",
        code="MAP-PROC",
        clinic_type="GENERAL_OPD",
        status="ACTIVE",
    )
    procedure = ProcedureCatalog.objects.create(
        organization=sample_facility.organization,
        facility=sample_facility,
        code="MAP-PROC-001",
        name="Mapped Procedure",
    )
    SyncIdentityMap.objects.create(
        source_node="cloud",
        model_label="clinics.Clinic",
        remote_record_id="501",
        local_record_id=clinic.pk,
    )

    apply_materialized_m2m(
        ProcedureCatalog,
        procedure,
        {"default_clinics": [501], "sync_meta": {"source_node": "cloud"}},
    )

    assert list(procedure.default_clinics.values_list("pk", flat=True)) == [clinic.pk]
