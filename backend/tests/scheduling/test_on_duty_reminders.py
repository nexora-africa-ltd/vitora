"""
Tests for Manager On-Duty widget endpoint and shift reminder Celery task.

Features tested:
- GET /api/scheduling/shifts/on-duty/ — live on-duty overview
- send_shift_reminders Celery task — notification creation
"""

from datetime import date, datetime, time, timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def _staff_with_profile(db, sample_person_resource, test_staff_profile):
    """Link the person resource to the test user's staff profile."""
    sample_person_resource.staff_profile = test_staff_profile
    sample_person_resource.save(update_fields=["staff_profile"])
    return sample_person_resource


@pytest.fixture
def fixed_local_now(monkeypatch):
    """Pin scheduling tests to a stable local time to avoid midnight boundary flakiness."""
    fixed_now = timezone.make_aware(
        datetime(2026, 4, 21, 9, 0),
        timezone.get_current_timezone(),
    )

    monkeypatch.setattr(
        "hmis.apps.scheduling.views.timezone.localtime", lambda *args, **kwargs: fixed_now
    )
    monkeypatch.setattr(
        "hmis.apps.scheduling.views.timezone.localdate", lambda *args, **kwargs: fixed_now.date()
    )
    monkeypatch.setattr(
        "hmis.apps.scheduling.tasks.timezone.now", lambda *args, **kwargs: fixed_now
    )
    monkeypatch.setattr(
        "hmis.apps.scheduling.tasks.timezone.localdate", lambda *args, **kwargs: fixed_now.date()
    )

    return fixed_now


@pytest.fixture
def today_shift_scheduled(
    db, sample_person_resource, sample_facility, sample_department, fixed_local_now
):
    """A SCHEDULED shift for today whose start_time is in the past (should show as late)."""
    from hmis.apps.scheduling.models import Shift

    now = fixed_local_now
    past_start = (now - timedelta(minutes=30)).time().replace(second=0, microsecond=0)
    future_end = (now + timedelta(hours=7)).time().replace(second=0, microsecond=0)

    return Shift.objects.create(
        staff_resource=sample_person_resource,
        shift_date=timezone.localdate(),
        start_time=past_start,
        end_time=future_end,
        shift_type="MORNING",
        department=sample_department,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def today_shift_active(
    db, sample_person_resource, sample_facility, sample_department, fixed_local_now
):
    """An ACTIVE shift for today (already clocked in)."""
    from hmis.apps.scheduling.models import Shift

    now = fixed_local_now
    past_start = (now - timedelta(hours=1)).time().replace(second=0, microsecond=0)
    future_end = (now + timedelta(hours=6)).time().replace(second=0, microsecond=0)

    return Shift.objects.create(
        staff_resource=sample_person_resource,
        shift_date=timezone.localdate(),
        start_time=past_start,
        end_time=future_end,
        shift_type="DAY",
        status="ACTIVE",
        started_at=now - timedelta(hours=1),
        department=sample_department,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def today_shift_upcoming(
    db, sample_person_resource, sample_facility, sample_department, fixed_local_now
):
    """A SCHEDULED shift for today whose start_time is in the future."""
    from hmis.apps.scheduling.models import Shift

    future_start_dt = fixed_local_now + timedelta(hours=3)
    future_end_dt = fixed_local_now + timedelta(hours=11)

    return Shift.objects.create(
        staff_resource=sample_person_resource,
        shift_date=future_start_dt.date(),
        start_time=future_start_dt.time().replace(second=0, microsecond=0),
        end_time=future_end_dt.time().replace(second=0, microsecond=0),
        shift_type="AFTERNOON",
        department=sample_department,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def today_shift_absent(
    db, sample_person_resource, sample_facility, sample_department, fixed_local_now
):
    """An ABSENT shift for today."""
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=sample_person_resource,
        shift_date=fixed_local_now.date(),
        start_time=time(6, 0),
        end_time=time(14, 0),
        shift_type="MORNING",
        status="ABSENT",
        department=sample_department,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# =============================================================================
# On-Duty Endpoint Tests
# =============================================================================


class TestOnDutyEndpoint:
    """Tests for GET /api/scheduling/shifts/on-duty/."""

    def test_returns_summary_structure(self, authenticated_client, sample_facility):
        """Should return expected response structure with summary counts."""
        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert "clocked_in" in response.data
        assert "late" in response.data
        assert "absent" in response.data
        assert "upcoming" in response.data
        assert "summary" in response.data
        assert "as_of" in response.data

        summary = response.data["summary"]
        assert "clocked_in" in summary
        assert "late" in summary
        assert "absent" in summary
        assert "upcoming" in summary
        assert "completed" in summary
        assert "total" in summary

    def test_active_shift_in_clocked_in(self, authenticated_client, today_shift_active):
        """ACTIVE shift should appear in clocked_in list."""
        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"]["clocked_in"] == 1
        assert response.data["clocked_in"][0]["shift_id"] == today_shift_active.id
        assert response.data["clocked_in"][0]["on_break"] is False

    def test_late_shift_classification(self, authenticated_client, today_shift_scheduled):
        """SCHEDULED shift past start_time should appear in late list."""
        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"]["late"] == 1
        late_entry = response.data["late"][0]
        assert late_entry["shift_id"] == today_shift_scheduled.id
        assert late_entry["minutes_overdue"] > 0

    def test_upcoming_shift_classification(self, authenticated_client, today_shift_upcoming):
        """SCHEDULED shift with future start_time should appear in upcoming."""
        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"]["upcoming"] == 1
        upcoming_entry = response.data["upcoming"][0]
        assert upcoming_entry["shift_id"] == today_shift_upcoming.id
        assert upcoming_entry["starts_in_minutes"] > 0

    def test_absent_shift_classification(self, authenticated_client, today_shift_absent):
        """ABSENT shift should appear in absent list."""
        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"]["absent"] == 1
        assert response.data["absent"][0]["shift_id"] == today_shift_absent.id

    def test_excludes_non_working_types(
        self, authenticated_client, sample_person_resource, sample_facility
    ):
        """OFF/LEAVE/REST shifts should not appear."""
        from hmis.apps.scheduling.models import Shift

        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=timezone.localdate(),
            start_time=time(8, 0),
            end_time=time(16, 0),
            shift_type="OFF",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"]["total"] == 0

    def test_excludes_cancelled_shifts(
        self, authenticated_client, sample_person_resource, sample_facility, sample_department
    ):
        """CANCELLED shifts should not appear."""
        from hmis.apps.scheduling.models import Shift

        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=timezone.localdate(),
            start_time=time(8, 0),
            end_time=time(16, 0),
            shift_type="DAY",
            status="CANCELLED",
            department=sample_department,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"]["total"] == 0

    def test_requires_manage_schedules_permission(self, api_client, test_user, sample_facility):
        """Should require manage_schedules permission."""
        from django.contrib.auth.models import Permission

        # Remove the auto-granted permission
        perm = Permission.objects.filter(
            codename="manage_schedules", content_type__app_label="scheduling"
        ).first()
        if perm:
            test_user.user_permissions.remove(perm)
            if hasattr(test_user, "_perm_cache"):
                del test_user._perm_cache
            if hasattr(test_user, "_user_perm_cache"):
                del test_user._user_perm_cache

        api_client.force_authenticate(user=test_user)
        response = api_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_returns_401(self, api_client):
        """Unauthenticated requests should return 401."""
        response = api_client.get("/api/scheduling/shifts/on-duty/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Shift Reminder Task Tests
# =============================================================================


class TestShiftReminderTask:
    """Tests for send_shift_reminders Celery task."""

    def test_creates_notification_for_upcoming_shift(
        self,
        db,
        _staff_with_profile,
        fixed_local_now,
        sample_facility,
        sample_department,
        sample_person_resource,
        test_user,
    ):
        """Should create a Notification for a shift starting in ~10 minutes."""
        from hmis.apps.core.models import Notification
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import send_shift_reminders

        shift_start = (
            (fixed_local_now + timedelta(minutes=10)).time().replace(second=0, microsecond=0)
        )
        shift_end = (fixed_local_now + timedelta(hours=8)).time().replace(second=0, microsecond=0)

        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=fixed_local_now.date(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="MORNING",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = send_shift_reminders()

        assert result == 1
        notification = Notification.objects.get(user=test_user, notification_type="shift_reminder")
        assert "starts" in notification.title.lower()
        assert notification.priority == "high"
        assert notification.related_model == "Shift"

    def test_skips_shifts_outside_window(
        self,
        db,
        _staff_with_profile,
        fixed_local_now,
        sample_facility,
        sample_department,
        sample_person_resource,
    ):
        """Should skip shifts starting >15min or <5min from now."""
        from hmis.apps.core.models import Notification
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import send_shift_reminders

        # Too far: 30 minutes from now
        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=fixed_local_now.date(),
            start_time=(fixed_local_now + timedelta(minutes=30))
            .time()
            .replace(second=0, microsecond=0),
            end_time=(fixed_local_now + timedelta(hours=8)).time().replace(second=0, microsecond=0),
            shift_type="DAY",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = send_shift_reminders()

        assert result == 0
        assert Notification.objects.filter(notification_type="shift_reminder").count() == 0

    def test_skips_already_notified_shift(
        self,
        db,
        _staff_with_profile,
        fixed_local_now,
        sample_facility,
        sample_department,
        sample_person_resource,
        test_user,
    ):
        """Should not create duplicate notifications for the same shift."""
        from hmis.apps.core.models import Notification
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import send_shift_reminders

        shift_start = (
            (fixed_local_now + timedelta(minutes=10)).time().replace(second=0, microsecond=0)
        )
        shift_end = (fixed_local_now + timedelta(hours=8)).time().replace(second=0, microsecond=0)

        shift = Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=fixed_local_now.date(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="MORNING",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        # Pre-create notification
        Notification.objects.create(
            user=test_user,
            notification_type="shift_reminder",
            title="Already sent",
            message="...",
            related_model="Shift",
            related_id=shift.id,
        )

        result = send_shift_reminders()

        assert result == 0
        assert Notification.objects.filter(notification_type="shift_reminder").count() == 1

    def test_skips_non_working_shift_types(
        self, db, _staff_with_profile, fixed_local_now, sample_facility, sample_person_resource
    ):
        """Should skip OFF/LEAVE/REST shift types."""
        from hmis.apps.core.models import Notification
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import send_shift_reminders

        shift_start = (
            (fixed_local_now + timedelta(minutes=10)).time().replace(second=0, microsecond=0)
        )
        shift_end = (fixed_local_now + timedelta(hours=8)).time().replace(second=0, microsecond=0)

        Shift.objects.create(
            staff_resource=sample_person_resource,
            shift_date=fixed_local_now.date(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="LEAVE",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = send_shift_reminders()

        assert result == 0
        assert Notification.objects.filter(notification_type="shift_reminder").count() == 0

    def test_skips_shift_without_staff_profile(
        self, db, fixed_local_now, sample_facility, sample_department
    ):
        """Should skip shifts where staff resource has no linked staff profile."""
        from hmis.apps.core.models import Notification
        from hmis.apps.scheduling.models import Resource, Shift
        from hmis.apps.scheduling.tasks import send_shift_reminders

        shift_start = (
            (fixed_local_now + timedelta(minutes=10)).time().replace(second=0, microsecond=0)
        )
        shift_end = (fixed_local_now + timedelta(hours=8)).time().replace(second=0, microsecond=0)

        resource = Resource.objects.create(
            name="No Profile Staff",
            resource_type="PERSON",
            code="NP-001",
            is_active=True,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        Shift.objects.create(
            staff_resource=resource,
            shift_date=fixed_local_now.date(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="MORNING",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = send_shift_reminders()

        assert result == 0
        assert Notification.objects.filter(notification_type="shift_reminder").count() == 0
