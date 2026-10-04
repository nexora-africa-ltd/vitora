# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for Phase 2 materialization safety and recovery state.

Run with: poetry run pytest tests/core/test_phase2_materialization_recovery.py --no-cov
Inputs: cloud sync entries, aggregate fixtures, and hub state files.
"""

from datetime import datetime
from unittest.mock import patch

import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.core.models import AuditLog, SyncDeferredMaterialization, SyncIdentityMap, SyncQueue
from hmis.apps.core.sync_materializer import materialize_entry, retry_deferred_materializations

pytestmark = pytest.mark.django_db


SOURCE_NODE = "cloud:phase2-recovery"


def test_materialized_encounter_replay_skips_local_event_billing_and_audit_side_effects(
    sample_patient, sample_facility, test_user
):
    """Inbound aggregate replays must not behave as locally-created encounters."""
    from hmis.apps.billing.models import Invoice
    from hmis.apps.encounters.models import Encounter

    entry = {
        "table": "encounters.Encounter",
        "operation": "CREATE",
        "record_id": 880001,
        "data": {
            "id": 880001,
            "patient_id": sample_patient.pk + 1000,
            "patient_mrn": sample_patient.mrn,
            "facility_id": sample_facility.pk + 1000,
            "facility_mfl_code": sample_facility.mfl_code,
            "organization_id": sample_facility.organization_id + 1000,
            "organization_slug": sample_facility.organization.slug,
            "created_by_id": test_user.pk + 1000,
            "created_by_username": test_user.username,
            "encounter_type": "OPD",
            "encounter_date": "2026-06-22",
            "chief_complaint": "Cloud materialized headache",
            "status": "CREATED",
            "sync_meta": {"source_node": SOURCE_NODE, "schema_version": 2},
        },
    }
    audit_count = AuditLog.objects.count()

    with (
        patch("hmis.apps.billing.signals.publish_event") as billing_event,
        patch("hmis.apps.encounters.signals.publish_event") as encounter_event,
    ):
        assert materialize_entry(entry) == {"success": True}
        assert materialize_entry(entry) == {"success": True}

    assert Encounter.objects.filter(pk=880001).count() == 1
    assert Invoice.objects.filter(encounter_id=880001).count() == 0
    assert AuditLog.objects.count() == audit_count
    assert SyncQueue.objects.filter(status="PENDING").count() == 0
    billing_event.assert_not_called()
    encounter_event.assert_not_called()
    assert (
        SyncIdentityMap.objects.get(
            source_node=SOURCE_NODE,
            model_label="encounters.Encounter",
            remote_record_id="880001",
        ).local_record_id
        == 880001
    )


def test_dependency_recovery_persists_then_resolves_deferred_identity_state(
    sample_patient, sample_encounter, sample_facility
):
    """A missing parent is durable recovery state and gains an identity map on retry."""
    from hmis.apps.encounters.models import Diagnosis, ICD10Code

    entry = {
        "table": "encounters.Diagnosis",
        "operation": "CREATE",
        "record_id": 880002,
        "data": {
            "id": 880002,
            "encounter_id": sample_encounter.pk,
            "encounter_patient_mrn": sample_patient.mrn,
            "encounter_facility_mfl_code": sample_facility.mfl_code,
            "encounter_date": sample_encounter.encounter_date.isoformat(),
            "encounter_type": sample_encounter.encounter_type,
            "encounter_chief_complaint": sample_encounter.chief_complaint,
            "icd10_code_id": 880003,
            "diagnosis_type": "PRIMARY",
            "certainty": "confirmed",
            "sync_meta": {"source_node": SOURCE_NODE, "schema_version": 2},
        },
    }

    result = materialize_entry(entry)

    assert result["success"] is False
    assert result["code"] == "DEPENDENCY_MISSING"
    deferred = SyncDeferredMaterialization.objects.get(
        source_node=SOURCE_NODE,
        model_label="encounters.Diagnosis",
        remote_record_id="880002",
    )
    assert deferred.status == SyncDeferredMaterialization.STATUS_PENDING
    assert deferred.payload == entry

    code = ICD10Code.objects.create(
        id=880003,
        code="Z88.0",
        description="Allergy status to penicillin",
        category="Factors influencing health status",
        chapter=21,
    )

    assert retry_deferred_materializations() == 1
    deferred.refresh_from_db()
    assert deferred.status == SyncDeferredMaterialization.STATUS_RESOLVED
    assert deferred.retry_count == 1
    assert Diagnosis.objects.get(pk=880002).icd10_code_id == code.pk
    assert (
        SyncIdentityMap.objects.get(
            source_node=SOURCE_NODE,
            model_label="encounters.Diagnosis",
            remote_record_id="880002",
        ).local_record_id
        == 880002
    )


def test_pulled_queue_record_and_watermarks_survive_worker_recovery(tmp_path):
    """Recovered workers retain synced pull evidence, timestamp, and full-pull cursor."""
    from hmis.apps.core.hub_sync import HubCloudSyncWorker

    timestamp = datetime(2026, 10, 3, 9, 45, 0)
    change = {
        "table": "encounters.Encounter",
        "operation": "UPDATE",
        "record_id": "880001",
        "data": {"id": 880001, "status": "CLOSED"},
    }

    with override_settings(
        SYNC_SERVER_URL="https://cloud.example.test/api/sync",
        HUB_ID="phase2-recovery-hub",
        HUB_FACILITY_ID="1",
        HUB_DATA_DIR=str(tmp_path),
    ):
        worker = HubCloudSyncWorker()
        worker._record_pulled_change(change)
        worker._record_pulled_change(change)
        worker._last_pull_timestamp = timestamp
        worker._full_pull_cursor = 77
        worker._save_state()

        recovered = HubCloudSyncWorker()

    queue_entry = SyncQueue.objects.get(
        model_name="encounters.Encounter",
        record_id=880001,
        status="SYNCED",
    )
    assert (
        SyncQueue.objects.filter(
            model_name="encounters.Encounter", record_id=880001, status="SYNCED"
        ).count()
        == 1
    )
    assert queue_entry.data == change["data"]
    assert recovered._last_pull_timestamp == timestamp
    assert recovered._full_pull_cursor == 77
