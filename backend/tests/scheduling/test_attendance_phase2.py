"""
Tests for Phase 2 & 3 attendance features.

Tests:
- Shift model: ABSENT status, late_minutes, overtime_minutes, break tracking,
  auto_clocked_out, clock_in_method, is_early_departure, actual_hours
- Celery tasks: mark_absent_shifts, auto_clock_out_stale_shifts
- API: attendance-trends, payroll-export, qr-clock-in, qr-token
- Domain events for new statuses
"""

from datetime import date, time, timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def my_resource(db, test_staff_profile, sample_facility):
    """Create a Resource linked to the test user's StaffProfile."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Test Attendance",
        resource_type="PERSON",
        code="ATT-001",
        is_active=True,
        staff_profile=test_staff_profile,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def scheduled_shift(db, my_resource, sample_facility):
    """Create a SCHEDULED shift for today 3 hours ago."""
    from hmis.apps.scheduling.models import Shift

    now = timezone.now()
    start = (now - timedelta(hours=3)).time().replace(second=0, microsecond=0)
    end = (now + timedelta(hours=5)).time().replace(second=0, microsecond=0)
    return Shift.objects.create(
        staff_resource=my_resource,
        shift_date=date.today(),
        start_time=start,
        end_time=end,
        shift_type="DAY",
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def completed_shifts_for_trends(db, my_resource, sample_facility):
    """Create completed shifts spanning 4 weeks for trends testing."""
    from hmis.apps.scheduling.models import Shift

    shifts = []
    for week_offset in range(4):
        for day_offset in range(5):  # Mon-Fri
            shift_date = date.today() - timedelta(weeks=week_offset, days=day_offset)
            if shift_date > date.today():
                continue
            sched_start = timezone.make_aware(
                timezone.datetime(shift_date.year, shift_date.month, shift_date.day, 7, 0)
            )
            late_by = timedelta(minutes=20) if day_offset == 0 else timedelta(minutes=3)
            s = Shift.objects.create(
                staff_resource=my_resource,
                shift_date=shift_date,
                start_time=time(7, 0),
                end_time=time(15, 0),
                shift_type="DAY",
                status="COMPLETED",
                started_at=sched_start + late_by,
                completed_at=sched_start + timedelta(hours=8, minutes=15),
                total_break_minutes=30,
                facility=sample_facility,
                organization=sample_facility.organization,
            )
            shifts.append(s)
    return shifts


# =============================================================================
# Model Tests
# =============================================================================


class TestShiftModelPhase2:
    """Tests for new Shift model fields and methods."""

    def test_mark_absent(self, scheduled_shift):
        """mark_absent() should transition SCHEDULED -> ABSENT."""
        scheduled_shift.mark_absent()
        scheduled_shift.refresh_from_db()
        assert scheduled_shift.status == "ABSENT"

    def test_cannot_mark_active_as_absent(self, scheduled_shift):
        """Cannot mark an ACTIVE shift as absent."""
        scheduled_shift.start_shift()
        with pytest.raises(ValueError):
            scheduled_shift.mark_absent()

    def test_late_minutes(self, scheduled_shift):
        """late_minutes should compute minutes after scheduled start."""
        now = timezone.now()
        scheduled_shift.status = "ACTIVE"
        scheduled_shift.started_at = now
        scheduled_shift.save()
        # started_at is ~3 hours after start_time
        assert scheduled_shift.late_minutes >= 170  # ~3 hours late

    def test_late_minutes_zero_if_not_started(self, scheduled_shift):
        """late_minutes is 0 for unstarted shifts."""
        assert scheduled_shift.late_minutes == 0

    def test_overtime_minutes(self, scheduled_shift):
        """overtime_minutes computes extra time beyond scheduled."""
        # 8h shift, worked 9h
        sched_start = timezone.make_aware(
            timezone.datetime.combine(scheduled_shift.shift_date, scheduled_shift.start_time)
        )
        scheduled_shift.status = "COMPLETED"
        scheduled_shift.started_at = sched_start
        scheduled_shift.completed_at = sched_start + timedelta(hours=9)
        scheduled_shift.total_break_minutes = 0
        scheduled_shift.save()
        # 9h worked - 8h scheduled = 60min overtime
        assert scheduled_shift.overtime_minutes == 60

    def test_auto_complete(self, scheduled_shift):
        """auto_complete() sets auto_clocked_out=True."""
        scheduled_shift.start_shift()
        scheduled_shift.auto_complete()
        scheduled_shift.refresh_from_db()
        assert scheduled_shift.status == "COMPLETED"
        assert scheduled_shift.auto_clocked_out is True
        assert scheduled_shift.completed_at is not None

    def test_break_duration_accumulated(self, scheduled_shift):
        """Resume accumulates break duration."""
        scheduled_shift.start_shift()
        scheduled_shift.take_break()
        # Simulate time passing
        scheduled_shift.break_started_at = timezone.now() - timedelta(minutes=15)
        scheduled_shift.save()
        scheduled_shift.resume_shift()
        scheduled_shift.refresh_from_db()
        assert scheduled_shift.total_break_minutes >= 14  # ~15 min

    def test_complete_from_break_accumulates(self, scheduled_shift):
        """complete_shift from ON_BREAK accumulates break duration."""
        scheduled_shift.start_shift()
        scheduled_shift.take_break()
        scheduled_shift.break_started_at = timezone.now() - timedelta(minutes=10)
        scheduled_shift.save()
        scheduled_shift.complete_shift()
        scheduled_shift.refresh_from_db()
        assert scheduled_shift.total_break_minutes >= 9
        assert scheduled_shift.break_started_at is None
        assert scheduled_shift.status == "COMPLETED"

    def test_clock_in_method_stored(self, scheduled_shift):
        """start_shift stores the clock-in method."""
        scheduled_shift.start_shift(method="QR_CODE")
        scheduled_shift.refresh_from_db()
        assert scheduled_shift.clock_in_method == "QR_CODE"

    def test_is_early_departure(self, my_resource, sample_facility):
        """is_early_departure detects clock-out >30min before end."""
        from hmis.apps.scheduling.models import Shift

        s = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="COMPLETED",
            started_at=timezone.make_aware(
                timezone.datetime.combine(date.today(), time(7, 0))
            ),
            completed_at=timezone.make_aware(
                timezone.datetime.combine(date.today(), time(18, 0))
            ),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert s.is_early_departure is True

    def test_not_early_departure_within_30min(self, my_resource, sample_facility):
        """Not early departure if within 30 minutes of end."""
        from hmis.apps.scheduling.models import Shift

        s = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="COMPLETED",
            started_at=timezone.make_aware(
                timezone.datetime.combine(date.today(), time(7, 0))
            ),
            completed_at=timezone.make_aware(
                timezone.datetime.combine(date.today(), time(18, 45))
            ),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert s.is_early_departure is False

    def test_actual_hours(self, my_resource, sample_facility):
        """actual_hours deducts break minutes from total."""
        from hmis.apps.scheduling.models import Shift

        start = timezone.make_aware(
            timezone.datetime.combine(date.today(), time(7, 0))
        )
        s = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(15, 0),
            shift_type="DAY",
            status="COMPLETED",
            started_at=start,
            completed_at=start + timedelta(hours=8),
            total_break_minutes=30,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert s.actual_hours == 7.5  # 8h - 30min


# =============================================================================
# Celery Task Tests
# =============================================================================


class TestCeleryTasks:
    """Tests for attendance automation Celery tasks."""

    def test_mark_absent_shifts(self, db, my_resource, sample_facility):
        """Should mark overdue SCHEDULED shifts as ABSENT."""
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import mark_absent_shifts

        # Create a shift that started 2 hours ago (past 1hr cutoff)
        now = timezone.now()
        shift_start = (now - timedelta(hours=2)).time().replace(second=0, microsecond=0)
        shift_end = (now + timedelta(hours=6)).time().replace(second=0, microsecond=0)
        shift = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="DAY",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = mark_absent_shifts()
        shift.refresh_from_db()
        assert shift.status == "ABSENT"
        assert result == 1

    def test_mark_absent_ignores_active_shifts(self, db, my_resource, sample_facility):
        """Should not touch ACTIVE shifts."""
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import mark_absent_shifts

        now = timezone.now()
        shift = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=(now - timedelta(hours=2)).time().replace(second=0, microsecond=0),
            end_time=(now + timedelta(hours=6)).time().replace(second=0, microsecond=0),
            shift_type="DAY",
            status="ACTIVE",
            started_at=now - timedelta(hours=1),
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = mark_absent_shifts()
        shift.refresh_from_db()
        assert shift.status == "ACTIVE"
        assert result == 0

    def test_mark_absent_ignores_off_days(self, db, my_resource, sample_facility):
        """Should not mark OFF/LEAVE shifts as absent."""
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import mark_absent_shifts

        now = timezone.now()
        Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=(now - timedelta(hours=2)).time().replace(second=0, microsecond=0),
            end_time=(now + timedelta(hours=6)).time().replace(second=0, microsecond=0),
            shift_type="LEAVE",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = mark_absent_shifts()
        assert result == 0

    def test_auto_clock_out_stale(self, db, my_resource, sample_facility):
        """Should auto-complete shifts 2+ hours past end time."""
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import auto_clock_out_stale_shifts

        now = timezone.now()
        # Shift ended 3 hours ago
        shift_start = (now - timedelta(hours=11)).time().replace(second=0, microsecond=0)
        shift_end = (now - timedelta(hours=3)).time().replace(second=0, microsecond=0)
        shift = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="DAY",
            status="ACTIVE",
            started_at=now - timedelta(hours=11),
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = auto_clock_out_stale_shifts()
        shift.refresh_from_db()
        assert shift.status == "COMPLETED"
        assert shift.auto_clocked_out is True
        assert result == 1

    def test_auto_clock_out_ignores_recent(self, db, my_resource, sample_facility):
        """Should not auto-complete shifts still within 2hr grace."""
        from hmis.apps.scheduling.models import Shift
        from hmis.apps.scheduling.tasks import auto_clock_out_stale_shifts

        now = timezone.localtime(timezone.now())
        # Shift ends 3 hours from now (well within grace period)
        shift_start = (now - timedelta(hours=5)).time().replace(second=0, microsecond=0)
        shift_end = (now + timedelta(hours=3)).time().replace(second=0, microsecond=0)
        shift = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=shift_start,
            end_time=shift_end,
            shift_type="DAY",
            status="ACTIVE",
            started_at=timezone.now() - timedelta(hours=5),
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = auto_clock_out_stale_shifts()
        shift.refresh_from_db()
        assert shift.status == "ACTIVE"
        assert result == 0


# =============================================================================
# API Endpoint Tests
# =============================================================================


class TestAttendanceTrends:
    """Tests for GET /api/scheduling/shifts/attendance-trends/."""

    def test_trends_no_resource(self, authenticated_client):
        """User with no resource gets empty list."""
        response = authenticated_client.get("/api/scheduling/shifts/attendance-trends/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_trends_with_data(self, authenticated_client, completed_shifts_for_trends):
        """Should return weekly trend data."""
        response = authenticated_client.get(
            "/api/scheduling/shifts/attendance-trends/?weeks=6"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 6
        # Each entry has the expected keys
        first = response.data[0]
        assert "week_start" in first
        assert "hours_worked" in first
        assert "shifts_completed" in first
        assert "on_time_rate" in first
        assert "late_count" in first
        assert "overtime_hours" in first

    def test_trends_unauthenticated(self, api_client):
        """Unauthenticated requests rejected."""
        response = api_client.get("/api/scheduling/shifts/attendance-trends/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestPayrollExport:
    """Tests for GET /api/scheduling/shifts/payroll-export/."""

    def test_payroll_export_csv(self, authenticated_client, completed_shifts_for_trends):
        """Should return a CSV file."""
        from_date = (date.today() - timedelta(days=30)).isoformat()
        to_date = date.today().isoformat()
        response = authenticated_client.get(
            f"/api/scheduling/shifts/payroll-export/?from_date={from_date}&to_date={to_date}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/csv"
        assert "attachment" in response["Content-Disposition"]
        # Verify CSV has header and data rows
        content = response.content.decode("utf-8")
        lines = content.strip().split("\n")
        assert len(lines) > 1  # header + at least 1 data row
        assert "Staff Name" in lines[0]

    def test_payroll_export_requires_dates(self, authenticated_client):
        """Should fail without from_date and to_date."""
        response = authenticated_client.get("/api/scheduling/shifts/payroll-export/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_payroll_export_unauthenticated(self, api_client):
        """Unauthenticated requests rejected."""
        response = api_client.get("/api/scheduling/shifts/payroll-export/?from_date=2026-01-01&to_date=2026-01-31")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestQRClockIn:
    """Tests for QR code clock-in endpoints."""

    def test_generate_qr_token(self, authenticated_client):
        """Should generate a rotating QR token for admins."""
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        from hmis.apps.scheduling.models import Shift

        ct = ContentType.objects.get_for_model(Shift)
        perm = Permission.objects.get(codename="manage_schedules", content_type=ct)
        authenticated_client.handler._force_user.user_permissions.add(perm)

        response = authenticated_client.get("/api/scheduling/shifts/qr-token/")
        assert response.status_code == status.HTTP_200_OK
        assert "qr_token" in response.data
        assert ":" in response.data["qr_token"]
        assert "valid_until" in response.data

    def test_qr_token_permission_denied(self, api_client):
        """Non-admin cannot generate QR token."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(
            username="noperm_user",
            email="noperm@example.com",
            password="testpass123",
        )
        api_client.force_authenticate(user=user)
        response = api_client.get("/api/scheduling/shifts/qr-token/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_qr_clock_in_success(self, authenticated_client, scheduled_shift, sample_facility):
        """Should clock in via valid QR token."""
        import hashlib

        from django.conf import settings as django_settings

        now = timezone.now()
        secret = getattr(django_settings, "SECRET_KEY", "vitora")
        token_hash = hashlib.sha256(
            f"{sample_facility.id}:{now.strftime('%Y-%m-%d:%H')}:{secret}".encode()
        ).hexdigest()[:16]
        qr_token = f"{sample_facility.id}:{token_hash}"

        response = authenticated_client.post(
            "/api/scheduling/shifts/qr-clock-in/",
            {"qr_token": qr_token},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"
        assert response.data["clock_in_method"] == "QR_CODE"

    def test_qr_clock_in_invalid_token(self, authenticated_client, scheduled_shift):
        """Should reject invalid QR token."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/qr-clock-in/",
            {"qr_token": "999:invalidhash"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_qr_clock_in_no_token(self, authenticated_client, scheduled_shift):
        """Should reject missing QR token."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/qr-clock-in/",
            {},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Domain Event Tests
# =============================================================================


class TestAttendanceDomainEvents:
    """Tests for domain events published on attendance actions."""

    def test_absent_shift_publishes_event(self, db, scheduled_shift, mocker):
        """mark_absent() should trigger SHIFT_ABSENT event."""
        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")
        scheduled_shift.mark_absent()
        # Find the call with ABSENT event
        calls = [c for c in mock_publish.call_args_list if "absent" in str(c).lower()]
        assert len(calls) >= 1

    def test_auto_complete_publishes_event(self, db, scheduled_shift, mocker):
        """auto_complete() should trigger event with auto_clocked_out flag."""
        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")
        scheduled_shift.start_shift()
        mock_publish.reset_mock()
        scheduled_shift.auto_complete()
        # Should have a COMPLETED event with auto_clocked_out in payload
        assert mock_publish.called

    def test_shift_serializer_includes_new_fields(self, authenticated_client, scheduled_shift):
        """Shift serializer should include new Phase 2/3 fields."""
        scheduled_shift.start_shift(method="MANUAL")
        response = authenticated_client.get(
            f"/api/scheduling/shifts/{scheduled_shift.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "total_break_minutes" in data
        assert "clock_in_method" in data
        assert "auto_clocked_out" in data
        assert "late_minutes" in data
        assert "overtime_minutes" in data
        assert "is_early_departure" in data
        assert "actual_hours" in data
        assert data["clock_in_method"] == "MANUAL"
