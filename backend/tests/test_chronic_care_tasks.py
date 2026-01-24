"""
Tests for Chronic Care Alert Celery Tasks.

These tests verify the automated alert system for overdue appointments,
upcoming appointment reminders, and defaulter list generation.

Sprint 2.4: Chronic Care Enrollment Enhancements
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def alert_test_user(db):
    """Create a user for alert tests."""
    return User.objects.create_user(
        username="alert_test_user",
        email="alert@test.com",
        password="testpass123",
        first_name="Alert",
        last_name="Tester",
    )


@pytest.fixture
def ccc_clinic_for_alerts(db):
    """Create a CCC clinic for alert tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="CCC Alert Test Clinic",
        clinic_type="CCC",
        code="CCC-ALERT-TEST",
        description="CCC clinic for alert testing",
    )


@pytest.fixture
def anc_clinic_for_alerts(db):
    """Create an ANC clinic for alert tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Alert Test Clinic",
        clinic_type="ANC",
        code="ANC-ALERT-TEST",
        description="ANC clinic for alert testing",
    )


@pytest.fixture
def sample_patient_for_alerts(db):
    """Create a sample patient for alert tests."""
    from hmis.apps.core.models import County, SubCounty
    from hmis.apps.patients.models import Patient

    county = County.objects.first() or County.objects.create(code=1, name="Alert Test County")
    sub_county = SubCounty.objects.filter(county=county).first() or SubCounty.objects.create(
        county=county, name="Alert Test SubCounty"
    )

    return Patient.objects.create(
        first_name="Alert",
        last_name="Patient",
        date_of_birth=date(1990, 1, 1),
        gender="F",
        county=county,
        sub_county=sub_county,
    )


# ============================================================================
# Test Class: Overdue Appointment Alerts Task
# ============================================================================


@pytest.mark.django_db
class TestSendOverdueAppointmentAlerts:
    """Tests for send_overdue_appointment_alerts Celery task."""

    def test_identifies_overdue_enrollments(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should identify enrollments with past appointments."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_overdue_appointment_alerts

        # Create an overdue enrollment
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-OVERDUE-ALERT-1",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=10),
            enrolled_by=alert_test_user,
        )

        result = send_overdue_appointment_alerts()

        assert result["checked"] >= 1
        assert result["overdue_found"] >= 1

    def test_sends_alert_for_overdue_enrollment(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should send alert and update tracking fields."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_overdue_appointment_alerts

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-OVERDUE-ALERT-2",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=10),
            enrolled_by=alert_test_user,
            last_reminder_sent=None,  # Never sent
            missed_appointment_alerts=0,
        )

        result = send_overdue_appointment_alerts()

        # Refresh from database
        enrollment.refresh_from_db()

        assert result["alerts_sent"] >= 1
        assert enrollment.last_reminder_sent is not None
        assert enrollment.missed_appointment_alerts == 1

    def test_does_not_resend_within_7_days(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should not send alert if already sent within 7 days."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_overdue_appointment_alerts

        # Enrollment with recent alert
        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-OVERDUE-ALERT-3",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=10),
            enrolled_by=alert_test_user,
            last_reminder_sent=timezone.now() - timedelta(days=3),  # 3 days ago
            missed_appointment_alerts=1,
        )

        initial_alert_count = enrollment.missed_appointment_alerts

        result = send_overdue_appointment_alerts()

        # Refresh and verify no new alert
        enrollment.refresh_from_db()
        assert enrollment.missed_appointment_alerts == initial_alert_count

    def test_ignores_inactive_enrollments(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should only check ACTIVE enrollments."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_overdue_appointment_alerts

        # Create an inactive overdue enrollment
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-INACTIVE-1",
            enrollment_date=date.today() - timedelta(days=60),
            status="COMPLETED",  # Not active
            next_appointment=date.today() - timedelta(days=30),
            enrolled_by=alert_test_user,
        )

        result = send_overdue_appointment_alerts()

        # Should not find the inactive enrollment
        assert result["overdue_found"] == 0

    def test_creates_audit_log_for_alert(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should create audit log entry for each alert."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.models import AuditLog
        from hmis.apps.core.tasks import send_overdue_appointment_alerts

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-AUDIT-ALERT-1",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=10),
            enrolled_by=alert_test_user,
        )

        initial_count = AuditLog.objects.filter(action="overdue_appointment_alert").count()

        send_overdue_appointment_alerts()

        new_count = AuditLog.objects.filter(action="overdue_appointment_alert").count()
        assert new_count > initial_count


# ============================================================================
# Test Class: Upcoming Appointment Reminders Task
# ============================================================================


@pytest.mark.django_db
class TestSendUpcomingAppointmentReminders:
    """Tests for send_upcoming_appointment_reminders Celery task."""

    def test_identifies_upcoming_appointments(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should identify enrollments with appointments in 1-3 days."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_upcoming_appointment_reminders

        # Create enrollment with appointment in 2 days
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-UPCOMING-1",
            enrollment_date=date.today(),
            status="ACTIVE",
            next_appointment=date.today() + timedelta(days=2),
            enrolled_by=alert_test_user,
        )

        result = send_upcoming_appointment_reminders()

        assert result["checked"] >= 1
        assert result["reminders_sent"] >= 1

    def test_ignores_appointments_too_far(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should ignore appointments more than 3 days away."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_upcoming_appointment_reminders

        # Create enrollment with appointment in 7 days
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-FAR-1",
            enrollment_date=date.today(),
            status="ACTIVE",
            next_appointment=date.today() + timedelta(days=7),
            enrolled_by=alert_test_user,
        )

        result = send_upcoming_appointment_reminders()

        # Should not include the far appointment
        assert result["checked"] == 0

    def test_ignores_todays_appointments(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should ignore appointments scheduled for today."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_upcoming_appointment_reminders

        # Create enrollment with appointment today
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-TODAY-1",
            enrollment_date=date.today() - timedelta(days=30),
            status="ACTIVE",
            next_appointment=date.today(),  # Today
            enrolled_by=alert_test_user,
        )

        result = send_upcoming_appointment_reminders()

        # Should not include today's appointment
        assert result["checked"] == 0

    def test_does_not_resend_within_3_days(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should not send reminder if already sent within 3 days."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_upcoming_appointment_reminders

        # Enrollment with recent reminder
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-RECENT-REMIND-1",
            enrollment_date=date.today(),
            status="ACTIVE",
            next_appointment=date.today() + timedelta(days=2),
            enrolled_by=alert_test_user,
            last_reminder_sent=timezone.now() - timedelta(days=1),  # 1 day ago
        )

        result = send_upcoming_appointment_reminders()

        # Should not resend
        assert result["reminders_sent"] == 0


# ============================================================================
# Test Class: Generate Defaulter List Task
# ============================================================================


@pytest.mark.django_db
class TestGenerateDefaulterList:
    """Tests for generate_defaulter_list Celery task."""

    def test_identifies_defaulters(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should identify patients who missed 2+ appointment cycles."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import generate_defaulter_list

        # Create a defaulter (65 days overdue with 30 day interval = 2+ cycles)
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-DEFAULTER-LIST-1",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=65),
            enrolled_by=alert_test_user,
        )

        result = generate_defaulter_list()

        assert result["total_defaulters"] >= 1
        assert len(result["defaulters"]) >= 1

    def test_defaulter_list_contains_required_fields(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Defaulter list entries should contain required tracking fields."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import generate_defaulter_list

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-DEFAULTER-FIELDS-1",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=70),
            last_visit_date=date.today() - timedelta(days=100),
            total_visits=5,
            enrolled_by=alert_test_user,
        )

        result = generate_defaulter_list()

        assert result["total_defaulters"] >= 1

        defaulter = result["defaulters"][0]
        assert "enrollment_id" in defaulter
        assert "patient_mrn" in defaulter
        assert "patient_name" in defaulter
        assert "clinic" in defaulter
        assert "clinic_type" in defaulter
        assert "enrollment_number" in defaulter
        assert "next_appointment" in defaulter
        assert "days_overdue" in defaulter
        assert "total_visits" in defaulter

    def test_filter_by_clinic_id(
        self,
        ccc_clinic_for_alerts,
        anc_clinic_for_alerts,
        sample_patient_for_alerts,
        alert_test_user,
    ):
        """Task should filter defaulters by clinic_id when provided."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import generate_defaulter_list

        # Create defaulter in CCC clinic
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-FILTER-1",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=65),
            enrolled_by=alert_test_user,
        )

        # Create defaulter in ANC clinic
        ClinicEnrollment.objects.create(
            clinic=anc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="ANC-FILTER-1",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=65),
            enrolled_by=alert_test_user,
        )

        # Filter by CCC clinic
        result = generate_defaulter_list(clinic_id=ccc_clinic_for_alerts.pk)

        assert result["clinic_id"] == ccc_clinic_for_alerts.pk
        for defaulter in result["defaulters"]:
            assert defaulter["clinic"] == ccc_clinic_for_alerts.name

    def test_excludes_non_defaulters(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should not include patients who are overdue but not defaulters."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import generate_defaulter_list

        # Create overdue but not defaulter (only 45 days overdue with 30 day interval)
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-NOT-DEFAULTER-1",
            enrollment_date=date.today() - timedelta(days=90),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=45),  # < 2 cycles
            enrolled_by=alert_test_user,
        )

        result = generate_defaulter_list()

        # Should not include this enrollment
        assert result["total_defaulters"] == 0

    def test_excludes_inactive_enrollments(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task should not include inactive enrollments."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import generate_defaulter_list

        # Create inactive enrollment that would be a defaulter
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-INACTIVE-DEF-1",
            enrollment_date=date.today() - timedelta(days=180),
            status="TRANSFERRED_OUT",  # Not active
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=90),
            enrolled_by=alert_test_user,
        )

        result = generate_defaulter_list()

        # Should not include the inactive enrollment
        assert result["total_defaulters"] == 0

    def test_result_includes_generated_timestamp(
        self, ccc_clinic_for_alerts, sample_patient_for_alerts, alert_test_user
    ):
        """Task result should include generation timestamp."""
        from hmis.apps.core.tasks import generate_defaulter_list

        result = generate_defaulter_list()

        assert "generated_at" in result
        assert result["generated_at"] == str(date.today())


# ============================================================================
# Test Class: Task Integration
# ============================================================================


@pytest.mark.django_db
class TestChronicCareTasksIntegration:
    """Integration tests for chronic care alert tasks."""

    def test_multiple_clinics_processed(
        self,
        ccc_clinic_for_alerts,
        anc_clinic_for_alerts,
        sample_patient_for_alerts,
        alert_test_user,
    ):
        """Tasks should process enrollments from multiple clinic types."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.core.tasks import send_overdue_appointment_alerts

        # Create overdue in CCC
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="CCC-MULTI-1",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=10),
            enrolled_by=alert_test_user,
        )

        # Create overdue in ANC
        ClinicEnrollment.objects.create(
            clinic=anc_clinic_for_alerts,
            patient=sample_patient_for_alerts,
            enrollment_number="ANC-MULTI-1",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=10),
            enrolled_by=alert_test_user,
        )

        result = send_overdue_appointment_alerts()

        assert result["overdue_found"] >= 2
        assert result["alerts_sent"] >= 2

    def test_task_handles_empty_queue(self):
        """Tasks should handle case with no enrollments gracefully."""
        from hmis.apps.core.tasks import (
            generate_defaulter_list,
            send_overdue_appointment_alerts,
            send_upcoming_appointment_reminders,
        )

        # Run on empty database
        overdue_result = send_overdue_appointment_alerts()
        upcoming_result = send_upcoming_appointment_reminders()
        defaulter_result = generate_defaulter_list()

        assert overdue_result["checked"] == 0
        assert overdue_result["alerts_sent"] == 0

        assert upcoming_result["checked"] == 0
        assert upcoming_result["reminders_sent"] == 0

        assert defaulter_result["total_defaulters"] == 0
