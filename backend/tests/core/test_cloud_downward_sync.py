# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for cloud-side downward sync signal (cloud → hub queueing)."""

from datetime import time

import pytest  # type: ignore
from django.apps import apps
from django.test import override_settings
from django.utils import timezone

from hmis.apps.core.models import SyncQueue
from hmis.apps.core.sync_registry import SYNC_REGISTRY, downward_sync_models
from hmis.apps.core.sync_signals import _CLOUD_ENVIRONMENTS, should_queue_downward_sync
from hmis.apps.core.sync_views import _build_downward_snapshot_changes


class TestShouldQueueDownwardSync:
    """Unit tests for the should_queue_downward_sync helper."""

    def test_all_registry_labels_resolve_to_installed_models(self):
        """Registered sync labels should not drift from Django app/model labels."""
        for model_label in SYNC_REGISTRY:
            app_label, model_name = model_label.split(".", 1)
            assert apps.get_model(app_label, model_name) is not None

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_returns_true_for_both_model_on_production(self):
        assert should_queue_downward_sync("core.Organization") is True

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="staging")
    def test_returns_true_for_both_model_on_staging(self):
        assert should_queue_downward_sync("core.Facility") is True

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_returns_true_for_down_model(self):
        assert should_queue_downward_sync("encounters.ICD10Code") is True

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_returns_true_for_bidirectional_patient_model(self):
        assert should_queue_downward_sync("patients.Patient") is True

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_returns_true_for_cloud_created_clinical_and_schedule_models(self):
        """Cloud-created clinical and operational rows should be pullable by hubs."""
        for model_label in (
            "encounters.Encounter",
            "triage.TriageAssessment",
            "pharmacy.Prescription",
            "clinics.ClinicSession",
            "clinics.ClinicSchedule",
            "scheduling.Resource",
            "scheduling.Schedule",
            "scheduling.Shift",
        ):
            assert should_queue_downward_sync(model_label) is True

    def test_downward_registry_includes_cloud_hub_clinical_switching_models(self):
        """Full down pulls should allow clinical and scheduling tables, not only references."""
        models = downward_sync_models()

        assert "encounters.Encounter" in models
        assert "triage.TriageAssessment" in models
        assert "pharmacy.Prescription" in models
        assert "clinics.ClinicSession" in models
        assert "clinics.ClinicSchedule" in models
        assert "scheduling.Schedule" in models
        assert "scheduling.Shift" in models

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_returns_true_for_tibabot_facility_key_model(self):
        assert should_queue_downward_sync("ai.TibaBotFacilityKey") is True

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="hub")
    def test_returns_false_on_hub(self):
        assert should_queue_downward_sync("core.Organization") is False

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="development")
    def test_returns_false_on_development(self):
        assert should_queue_downward_sync("core.Organization") is False

    @override_settings(SYNC_ENABLED=False, ENVIRONMENT="production")
    def test_returns_false_when_sync_disabled(self):
        assert should_queue_downward_sync("core.Organization") is False

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_returns_false_for_unregistered_model(self):
        assert should_queue_downward_sync("foo.Bar") is False


@pytest.mark.django_db
class TestCloudDownwardSyncSignal:
    """Integration tests for cloud-side downward sync signal."""

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_organization_save_creates_synced_entry(self, sample_organization):
        """Saving an Organization on cloud should create a SYNCED SyncQueue entry."""
        # Clear any entries from creation
        SyncQueue.objects.all().delete()

        # Update the org (triggers post_save)
        sample_organization.name = "Updated Org Name"
        sample_organization.save()

        entry = SyncQueue.objects.filter(
            model_name="core.Organization",
            record_id=sample_organization.pk,
        ).last()
        assert entry is not None
        assert entry.status == "SYNCED"
        assert entry.synced_at is not None
        assert entry.operation == "UPDATE"
        assert entry.data["name"] == "Updated Org Name"

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_organization_create_creates_synced_entry(self, db):
        """Creating an Organization on cloud should create a CREATE entry."""
        from hmis.apps.core.models import Organization

        org = Organization.objects.create(
            name="New Cloud Org",
            slug="new-cloud-org",
        )

        entry = SyncQueue.objects.filter(
            model_name="core.Organization",
            record_id=org.pk,
            operation="CREATE",
        ).last()
        assert entry is not None
        assert entry.status == "SYNCED"
        assert entry.synced_at is not None

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_user_save_creates_synced_entry(self, test_user):
        """auth.User changes on cloud should create downward sync entries."""
        SyncQueue.objects.all().delete()

        test_user.first_name = "CloudUpdated"
        test_user.save()

        entry = SyncQueue.objects.filter(
            model_name="auth.User",
            record_id=test_user.pk,
        ).last()
        assert entry is not None
        assert entry.status == "SYNCED"
        assert entry.operation == "UPDATE"

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_onboarding_completion_creates_sync_entry(self, sample_organization):
        """Onboarding completion on cloud should be pullable by hubs."""
        SyncQueue.objects.all().delete()

        sample_organization.onboarding_completed_at = timezone.now()
        sample_organization.save()

        entry = SyncQueue.objects.filter(
            model_name="core.Organization",
            record_id=sample_organization.pk,
        ).last()
        assert entry is not None
        assert entry.status == "SYNCED"
        assert entry.data.get("onboarding_completed_at") is not None

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="hub")
    def test_no_downward_entry_on_hub(self, sample_organization):
        """On hub environment, downward sync signal should NOT fire."""
        SyncQueue.objects.all().delete()

        sample_organization.name = "Hub Change"
        sample_organization.save()

        # Only upward entries should exist (if any), not downward SYNCED ones
        synced_entries = SyncQueue.objects.filter(
            model_name="core.Organization",
            status="SYNCED",
        )
        assert synced_entries.count() == 0

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_patient_save_creates_downward_entry(self, sample_patient):
        """Cloud patient changes should be pullable by activated hubs."""
        SyncQueue.objects.all().delete()

        sample_patient.first_name = "CloudEdit"
        sample_patient.save()

        entry = SyncQueue.objects.filter(
            model_name="patients.Patient",
            status="SYNCED",
        ).last()
        assert entry is not None
        assert entry.operation == "UPDATE"
        assert entry.data["first_name"] == "CloudEdit"

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_parent_scoped_clinic_schedule_save_creates_scoped_downward_entry(
        self, sample_facility
    ):
        """Cloud clinic schedules should queue with facility scope via their clinic."""
        from hmis.apps.clinics.models import Clinic, ClinicSchedule

        clinic = Clinic.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            name="Cloud OPD",
            clinic_type="GENERAL_OPD",
            code="CLOUD-OPD",
            status="ACTIVE",
        )
        SyncQueue.objects.all().delete()

        schedule = ClinicSchedule.objects.create(
            clinic=clinic,
            day_of_week=0,
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        entry = SyncQueue.objects.filter(
            model_name="clinics.ClinicSchedule",
            record_id=schedule.pk,
            status="SYNCED",
        ).last()
        assert entry is not None
        assert entry.facility == sample_facility
        assert entry.organization == sample_facility.organization
        assert entry.data["clinic"] == clinic.pk

    def test_full_downward_snapshot_includes_parent_scoped_clinic_schedule(self, sample_facility):
        """Full hub pulls should include clinic schedule rows scoped through Clinic."""
        from hmis.apps.clinics.models import Clinic, ClinicSchedule

        clinic = Clinic.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            name="Snapshot OPD",
            clinic_type="GENERAL_OPD",
            code="SNAP-OPD",
            status="ACTIVE",
        )
        schedule = ClinicSchedule.objects.create(
            clinic=clinic,
            day_of_week=1,
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        changes, has_more = _build_downward_snapshot_changes(
            tables={"clinics.ClinicSchedule"},
            facility=sample_facility,
            organization=sample_facility.organization,
            limit=10,
        )

        assert has_more is False
        assert any(
            change["table"] == "clinics.ClinicSchedule" and change["record_id"] == schedule.pk
            for change in changes
        )

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_tibabot_facility_key_save_creates_downward_entry(self, sample_facility):
        """Cloud-provisioned TibaBot keys should be pullable by facility hubs."""
        from hmis.apps.ai.models import TibaBotFacilityKey

        SyncQueue.objects.all().delete()

        key = TibaBotFacilityKey.objects.create(
            facility=sample_facility,
            api_key="tb_test_cloud_facility_key",
            key_hash="abc123",
            tibabot_facility_id="facility-001",
            scopes=["chat", "clinical"],
        )

        entry = SyncQueue.objects.filter(
            model_name="ai.TibaBotFacilityKey",
            record_id=key.pk,
            status="SYNCED",
        ).last()
        assert entry is not None
        assert entry.operation == "CREATE"
        assert entry.data["facility"] == sample_facility.pk
        assert entry.data["api_key"] == "tb_test_cloud_facility_key"
        assert entry.data["tibabot_facility_id"] == "facility-001"

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_from_sync_materializer_flag_prevents_loop(self, sample_organization):
        """Changes from hub push materialization should NOT be re-queued."""
        SyncQueue.objects.all().delete()

        # Simulate a materializer-originated save
        sample_organization._from_sync_materializer = True
        sample_organization.name = "From Hub Push"
        sample_organization.save()

        synced_entries = SyncQueue.objects.filter(
            model_name="core.Organization",
            status="SYNCED",
        )
        assert synced_entries.count() == 0

    @override_settings(SYNC_ENABLED=True, ENVIRONMENT="production")
    def test_delete_creates_synced_delete_entry(self, db):
        """Deleting a BOTH model on cloud creates a DELETE sync entry."""
        from hmis.apps.core.models import Organization

        org = Organization.objects.create(name="To Delete", slug="to-delete")
        org_pk = org.pk
        SyncQueue.objects.all().delete()

        org.delete()

        entry = SyncQueue.objects.filter(
            model_name="core.Organization",
            record_id=org_pk,
            operation="DELETE",
        ).last()
        assert entry is not None
        assert entry.status == "SYNCED"
        assert entry.synced_at is not None


@pytest.mark.django_db
class TestCloudEnvironments:
    """Verify that _CLOUD_ENVIRONMENTS constant is correct."""

    def test_cloud_environments_contains_production(self):
        assert "production" in _CLOUD_ENVIRONMENTS

    def test_cloud_environments_contains_staging(self):
        assert "staging" in _CLOUD_ENVIRONMENTS

    def test_cloud_environments_excludes_hub(self):
        assert "hub" not in _CLOUD_ENVIRONMENTS

    def test_cloud_environments_excludes_development(self):
        assert "development" not in _CLOUD_ENVIRONMENTS

    def test_cloud_environments_excludes_test(self):
        assert "test" not in _CLOUD_ENVIRONMENTS
