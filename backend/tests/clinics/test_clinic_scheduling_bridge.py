"""
Tests for Clinic ↔ Scheduling bridge.

Tests:
- Auto-creation of scheduling.Resource when a Clinic is created with a facility
- Sync of ClinicSchedule to scheduling.Schedule on create/update/delete
- Tenant-scoping of ScheduleViewSet
- Backfill management command (sync_clinic_schedules)
"""

from datetime import time

import pytest  # type: ignore
from rest_framework import status


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def clinic_with_facility(db, sample_facility):
    """Clinic with a facility — triggers auto-resource creation."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Test Clinic",
        clinic_type="GENERAL_OPD",
        code="TEST-OPD-001",
        status="ACTIVE",
        capacity=3,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def clinic_schedule(db, clinic_with_facility):
    """ClinicSchedule linked to a clinic that has a scheduling resource."""
    from hmis.apps.clinics.models import ClinicSchedule

    # Refresh to pick up auto-created scheduling_resource
    clinic_with_facility.refresh_from_db()
    return ClinicSchedule.objects.create(
        clinic=clinic_with_facility,
        day_of_week=0,  # Monday
        start_time=time(8, 0),
        end_time=time(17, 0),
        max_patients=40,
        is_active=True,
    )


# =============================================================================
# Auto-creation of scheduling.Resource
# =============================================================================


class TestClinicResourceAutoCreation:
    """Tests for Clinic → scheduling.Resource auto-creation signal."""

    def test_resource_created_on_clinic_save(self, clinic_with_facility):
        """Should auto-create a PLACE resource when clinic is created with a facility."""
        from hmis.apps.scheduling.models import Resource

        clinic_with_facility.refresh_from_db()
        assert clinic_with_facility.scheduling_resource_id is not None

        resource = clinic_with_facility.scheduling_resource
        assert resource.resource_type == "PLACE"
        assert resource.code == f"CLINIC-{clinic_with_facility.code}"
        assert resource.name == clinic_with_facility.name
        assert resource.is_active is True
        assert resource.capacity == clinic_with_facility.capacity
        assert resource.facility == clinic_with_facility.facility

    def test_no_resource_created_without_facility(self, db):
        """Should NOT create a resource if clinic has no facility."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.scheduling.models import Resource

        before_count = Resource.objects.count()
        Clinic.objects.create(
            name="Unfacilitied Clinic",
            clinic_type="DENTAL",
            code="NOFAC-001",
            status="ACTIVE",
        )
        assert Resource.objects.count() == before_count

    def test_resource_name_synced_on_clinic_update(self, clinic_with_facility):
        """Should update resource name when clinic name changes."""
        clinic_with_facility.refresh_from_db()
        clinic_with_facility.name = "Updated Clinic Name"
        clinic_with_facility.save()

        clinic_with_facility.scheduling_resource.refresh_from_db()
        assert clinic_with_facility.scheduling_resource.name == "Updated Clinic Name"

    def test_resource_deactivated_when_clinic_closed(self, clinic_with_facility):
        """Should deactivate resource when clinic status is not ACTIVE."""
        clinic_with_facility.refresh_from_db()
        clinic_with_facility.status = "TEMPORARILY_CLOSED"
        clinic_with_facility.save()

        clinic_with_facility.scheduling_resource.refresh_from_db()
        assert clinic_with_facility.scheduling_resource.is_active is False


# =============================================================================
# ClinicSchedule ↔ scheduling.Schedule sync
# =============================================================================


class TestClinicScheduleSync:
    """Tests for ClinicSchedule → scheduling.Schedule sync signals."""

    def test_schedule_created_on_clinic_schedule_save(self, clinic_schedule):
        """Should create a scheduling.Schedule when ClinicSchedule is saved."""
        from hmis.apps.scheduling.models import Schedule

        clinic_schedule.clinic.refresh_from_db()
        resource = clinic_schedule.clinic.scheduling_resource

        schedules = Schedule.objects.filter(resource=resource, schedule_type="RECURRING")
        assert schedules.count() == 1

        sched = schedules.first()
        assert sched.day_of_week == 0
        assert sched.start_time == time(8, 0)
        assert sched.end_time == time(17, 0)
        assert sched.is_active is True
        assert sched.max_appointments == 40
        assert f"clinic_schedule:{clinic_schedule.pk}" in sched.notes

    def test_schedule_updated_on_clinic_schedule_change(self, clinic_schedule):
        """Should update scheduling.Schedule when ClinicSchedule times change."""
        from hmis.apps.scheduling.models import Schedule

        clinic_schedule.start_time = time(9, 0)
        clinic_schedule.end_time = time(16, 0)
        clinic_schedule.save()

        clinic_schedule.clinic.refresh_from_db()
        resource = clinic_schedule.clinic.scheduling_resource
        sched = Schedule.objects.get(
            resource=resource,
            notes__contains=f"clinic_schedule:{clinic_schedule.pk}",
        )
        assert sched.start_time == time(9, 0)
        assert sched.end_time == time(16, 0)

    def test_schedule_deactivated_on_clinic_schedule_delete(self, clinic_schedule):
        """Should deactivate scheduling.Schedule when ClinicSchedule is deleted."""
        from hmis.apps.scheduling.models import Schedule

        clinic_schedule.clinic.refresh_from_db()
        resource = clinic_schedule.clinic.scheduling_resource
        cs_pk = clinic_schedule.pk
        clinic_schedule.delete()

        sched = Schedule.objects.get(
            resource=resource,
            notes__contains=f"clinic_schedule:{cs_pk}",
        )
        assert sched.is_active is False

    def test_multiple_days_synced(self, clinic_with_facility):
        """Should create separate schedules for each day."""
        from hmis.apps.clinics.models import ClinicSchedule
        from hmis.apps.scheduling.models import Schedule

        clinic_with_facility.refresh_from_db()

        for day in range(5):  # Mon-Fri
            ClinicSchedule.objects.create(
                clinic=clinic_with_facility,
                day_of_week=day,
                start_time=time(8, 0),
                end_time=time(17, 0),
            )

        resource = clinic_with_facility.scheduling_resource
        assert Schedule.objects.filter(resource=resource, schedule_type="RECURRING").count() == 5


# =============================================================================
# ScheduleViewSet tenant scoping
# =============================================================================


class TestScheduleViewSetTenantScoping:
    """Tests that ScheduleViewSet returns only facility-scoped schedules."""

    def test_list_returns_facility_schedules(self, authenticated_client, clinic_schedule):
        """Should return schedules for the user's facility."""
        response = authenticated_client.get("/api/scheduling/schedules/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        # The clinic_schedule fixture triggers a synced Schedule
        assert len(results) >= 1

    def test_list_excludes_other_facility_schedules(
        self, authenticated_client, clinic_schedule, sample_organization,
        sample_county, sample_sub_county,
    ):
        """Should NOT return schedules from another facility."""
        from hmis.apps.clinics.models import Clinic, ClinicSchedule
        from hmis.apps.core.models import Facility
        from hmis.apps.scheduling.models import Schedule

        # Create another facility + clinic in the same org
        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="88888",
            level="2",
            ownership="GOK",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            is_active=True,
        )
        other_clinic = Clinic.objects.create(
            name="Other Clinic",
            clinic_type="DENTAL",
            code="OTHER-DENTAL",
            status="ACTIVE",
            facility=other_facility,
            organization=sample_organization,
        )
        other_clinic.refresh_from_db()

        ClinicSchedule.objects.create(
            clinic=other_clinic,
            day_of_week=2,
            start_time=time(9, 0),
            end_time=time(15, 0),
        )

        # The authenticated user is scoped to sample_facility, not other_facility
        response = authenticated_client.get("/api/scheduling/schedules/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)

        # All returned schedules should belong to sample_facility's resources
        other_resource = other_clinic.scheduling_resource
        for sched in results:
            assert sched["resource"] != other_resource.id


# =============================================================================
# Management command: sync_clinic_schedules
# =============================================================================


class TestSyncClinicSchedulesCommand:
    """Tests for the sync_clinic_schedules management command."""

    def test_backfill_creates_resource_and_schedules(self, db, sample_facility):
        """Should create resource + schedules for a clinic without scheduling_resource."""
        from io import StringIO

        from django.core.management import call_command

        from hmis.apps.clinics.models import Clinic, ClinicSchedule
        from hmis.apps.scheduling.models import Resource, Schedule

        # Create clinic without triggering signal (simulate pre-existing data)
        from hmis.apps.scheduling.models import Resource

        clinic = Clinic(
            name="Legacy Clinic",
            clinic_type="GENERAL_OPD",
            code="LEGACY-001",
            status="ACTIVE",
            capacity=2,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        clinic._skip_resource_sync = True
        clinic.save()

        # Verify signal was skipped
        clinic.refresh_from_db()
        assert clinic.scheduling_resource_id is None

        # Add a ClinicSchedule (also without triggering sync)
        cs = ClinicSchedule(
            clinic=clinic,
            day_of_week=0,
            start_time=time(8, 0),
            end_time=time(17, 0),
            max_patients=30,
        )
        cs._skip_schedule_sync = True
        cs.save()

        out = StringIO()
        call_command("sync_clinic_schedules", "--clinic=LEGACY-001", stdout=out)

        clinic.refresh_from_db()
        assert clinic.scheduling_resource_id is not None
        assert Resource.objects.filter(code="CLINIC-LEGACY-001").exists()
        assert Schedule.objects.filter(
            resource=clinic.scheduling_resource,
            day_of_week=0,
        ).exists()

        output = out.getvalue()
        assert "Created Resource" in output
        assert "Created Schedule" in output

    def test_dry_run_does_not_write(self, db, sample_facility):
        """Dry run should preview without creating objects."""
        from io import StringIO

        from django.core.management import call_command

        from hmis.apps.clinics.models import Clinic
        from hmis.apps.scheduling.models import Resource

        clinic = Clinic(
            name="DryRun Clinic",
            clinic_type="DENTAL",
            code="DRYRUN-001",
            status="ACTIVE",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        clinic._skip_resource_sync = True
        clinic.save()

        before = Resource.objects.count()
        out = StringIO()
        call_command("sync_clinic_schedules", "--dry-run", "--clinic=DRYRUN-001", stdout=out)

        assert Resource.objects.count() == before
        assert "[DRY-RUN]" in out.getvalue()
