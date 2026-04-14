"""
Tests for Phase 4: Auto-Escalation & Alerts.

Covers:
- WaitTimeBreach model (create, acknowledge, escalate, resolve)
- Escalation model (create, resolve, dismiss)
- Celery tasks (wait time breach detection, auto-resolve)
- API endpoints (breaches, escalations, queue escalate action)
- Serializers

Sprint 1.5-1.6 Track E: Triage Module - Phase 4
"""

from datetime import timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def triage_permission(db, test_user):
    """Grant triage permissions to test user."""
    for codename in ["perform_triage", "view_triage_queue", "escalate_patient"]:
        try:
            perm = Permission.objects.get(codename=codename)
            test_user.user_permissions.add(perm)
        except Permission.DoesNotExist:
            pass
    test_user.save()
    # Force refresh permission cache
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.get(pk=test_user.pk)


@pytest.fixture
def triage_setup(db, sample_patient, test_user, triage_permission, sample_facility):
    """
    Create a complete triage setup: encounter → assessment → queue entry.
    Returns dict with all created objects.
    """
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.triage.models import TriageAssessment, TriageQueue

    now = timezone.now()

    encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="EMERGENCY",
        chief_complaint="Chest pain",
        facility=sample_facility,
    )

    assessment = TriageAssessment.objects.create(
        encounter=encounter,
        chief_complaint="Chest pain",
        chief_complaint_category="CHEST_PAIN",
        mental_status="A",
        mobility="AMBULATORY",
        assigned_area="ER_RESUS",
        triage_category="RED",
        auto_calculated_category="RED",
        arrival_time=now - timedelta(minutes=15),
        triage_start_time=now - timedelta(minutes=10),
        triage_end_time=now - timedelta(minutes=8),
        triaged_by=test_user,
    )

    queue_entry = TriageQueue.objects.create(
        triage_assessment=assessment,
        position=1,
        status="WAITING",
    )

    return {
        "patient": sample_patient,
        "encounter": encounter,
        "assessment": assessment,
        "queue_entry": queue_entry,
    }


@pytest.fixture
def orange_triage_setup(db, sample_county, sample_sub_county, test_user, triage_permission, sample_organization, sample_facility):
    """Create ORANGE category triage setup with 15-min wait (breached)."""
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient
    from hmis.apps.triage.models import TriageAssessment, TriageQueue

    now = timezone.now()

    patient = Patient.objects.create(
        first_name="Orange",
        last_name="Patient",
        date_of_birth="1990-01-01",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        registered_by=test_user,
        organization=sample_organization,
    )

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="EMERGENCY",
        chief_complaint="Difficulty breathing",
        facility=sample_facility,
    )

    assessment = TriageAssessment.objects.create(
        encounter=encounter,
        chief_complaint="Difficulty breathing",
        chief_complaint_category="DIFFICULTY_BREATHING",
        mental_status="A",
        mobility="WHEELCHAIR",
        assigned_area="ER_ACUTE",
        triage_category="ORANGE",
        auto_calculated_category="ORANGE",
        arrival_time=now - timedelta(minutes=15),  # Exceeds 10-min target
        triage_start_time=now - timedelta(minutes=12),
        triaged_by=test_user,
    )

    queue_entry = TriageQueue.objects.create(
        triage_assessment=assessment,
        position=2,
        status="WAITING",
    )

    return {
        "patient": patient,
        "encounter": encounter,
        "assessment": assessment,
        "queue_entry": queue_entry,
    }


# =============================================================================
# WaitTimeBreach Model Tests
# =============================================================================


@pytest.mark.django_db
class TestWaitTimeBreachModel:
    """Tests for the WaitTimeBreach model."""

    def test_create_breach(self, triage_setup):
        """Should create a wait time breach record."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
            assigned_area="ER_RESUS",
        )

        assert breach.status == "ACTIVE"
        assert breach.severity == "CRITICAL"
        assert breach.actual_wait_minutes == 15
        assert str(breach) == "Breach: RED (15m / target 0m) - ACTIVE"

    def test_acknowledge_breach(self, triage_setup, test_user):
        """Should acknowledge a breach and record user."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        breach.acknowledge(test_user, notes="Will prioritize")

        assert breach.status == "ACKNOWLEDGED"
        assert breach.acknowledged_by == test_user
        assert breach.acknowledged_at is not None
        assert breach.notes == "Will prioritize"

    def test_escalate_breach(self, triage_setup):
        """Should escalate a breach."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=20,
        )

        breach.escalate(notes="Critical - needs immediate attention")
        assert breach.status == "ESCALATED"

    def test_resolve_breach(self, triage_setup):
        """Should resolve a breach."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        breach.resolve()
        assert breach.status == "RESOLVED"

    def test_category_severity_mapping(self):
        """Should map triage categories to correct severity levels."""
        from hmis.apps.triage.models import WaitTimeBreach

        assert WaitTimeBreach.CATEGORY_SEVERITY_MAP["RED"] == "CRITICAL"
        assert WaitTimeBreach.CATEGORY_SEVERITY_MAP["ORANGE"] == "URGENT"
        assert WaitTimeBreach.CATEGORY_SEVERITY_MAP["YELLOW"] == "WARNING"
        assert WaitTimeBreach.CATEGORY_SEVERITY_MAP["GREEN"] == "INFO"
        assert WaitTimeBreach.CATEGORY_SEVERITY_MAP["BLUE"] == "INFO"


# =============================================================================
# Escalation Model Tests
# =============================================================================


@pytest.mark.django_db
class TestEscalationModel:
    """Tests for the Escalation model."""

    def test_create_escalation(self, triage_setup, test_user):
        """Should create an escalation record."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="CHARGE_NURSE",
            reason="Patient waiting too long",
            wait_time_at_escalation=15,
            triage_category="RED",
            assigned_area="ER_RESUS",
            escalated_by=test_user,
        )

        assert escalation.status == "PENDING"
        assert "Charge Nurse" in str(escalation)

    def test_mark_in_progress(self, triage_setup, test_user):
        """Should mark escalation as in progress."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="ADDITIONAL_STAFF",
            reason="Queue overloaded",
            escalated_by=test_user,
        )

        escalation.mark_in_progress()
        assert escalation.status == "IN_PROGRESS"

    def test_resolve_escalation(self, triage_setup, test_user):
        """Should resolve an escalation with notes."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="CHARGE_NURSE",
            reason="Patient needs urgent attention",
            escalated_by=test_user,
        )

        escalation.resolve(test_user, notes="Charge nurse attending")
        assert escalation.status == "RESOLVED"
        assert escalation.resolved_by == test_user
        assert escalation.resolved_at is not None
        assert escalation.resolution_notes == "Charge nurse attending"

    def test_dismiss_escalation(self, triage_setup, test_user):
        """Should dismiss an escalation."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="SUPERVISOR",
            reason="Test",
            escalated_by=test_user,
        )

        escalation.dismiss(test_user, notes="Not needed")
        assert escalation.status == "DISMISSED"
        assert escalation.resolved_by == test_user


# =============================================================================
# Celery Task Tests
# =============================================================================


@pytest.mark.django_db
class TestWaitTimeBreachTask:
    """Tests for the check_wait_time_breaches Celery task."""

    @patch("hmis.apps.triage.tasks._broadcast_breach_alerts")
    def test_detects_red_breach(self, mock_broadcast, triage_setup):
        """Should detect RED category breach (target 0 min, waited 15 min)."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import check_wait_time_breaches

        result = check_wait_time_breaches()

        assert result == 1
        breach = WaitTimeBreach.objects.first()
        assert breach is not None
        assert breach.triage_category == "RED"
        assert breach.severity == "CRITICAL"
        assert breach.target_wait_minutes == 0
        assert breach.actual_wait_minutes > 0
        assert breach.assigned_area == "ER_RESUS"
        mock_broadcast.assert_called_once()

    @patch("hmis.apps.triage.tasks._broadcast_breach_alerts")
    def test_detects_orange_breach(self, mock_broadcast, orange_triage_setup):
        """Should detect ORANGE category breach (target 10 min, waited 15 min)."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import check_wait_time_breaches

        result = check_wait_time_breaches()

        assert result == 1
        breach = WaitTimeBreach.objects.first()
        assert breach is not None
        assert breach.triage_category == "ORANGE"
        assert breach.severity == "URGENT"
        assert breach.target_wait_minutes == 10

    @patch("hmis.apps.triage.tasks._broadcast_breach_alerts")
    def test_no_duplicate_breaches(self, mock_broadcast, triage_setup):
        """Should not create duplicate breaches for the same queue entry."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import check_wait_time_breaches

        # First run: creates breach
        check_wait_time_breaches()
        assert WaitTimeBreach.objects.count() == 1

        # Second run: no duplicate
        result = check_wait_time_breaches()
        assert result == 0
        assert WaitTimeBreach.objects.count() == 1

    @patch("hmis.apps.triage.tasks._broadcast_breach_alerts")
    def test_no_breach_for_within_target(self, mock_broadcast, db, sample_patient, test_user, triage_permission, sample_facility):
        """Should not create breach if wait time is within target."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment, TriageQueue, WaitTimeBreach
        from hmis.apps.triage.tasks import check_wait_time_breaches

        now = timezone.now()

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Mild headache",
            facility=sample_facility,
        )

        assessment = TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint="Mild headache",
            chief_complaint_category="HEADACHE",
            mental_status="A",
            mobility="AMBULATORY",
            assigned_area="ER_FAST_TRACK",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            arrival_time=now - timedelta(minutes=5),  # Within 240 min target
            triage_start_time=now,
            triaged_by=test_user,
        )

        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="WAITING",
        )

        result = check_wait_time_breaches()
        assert result == 0
        assert WaitTimeBreach.objects.count() == 0

    @patch("hmis.apps.triage.tasks._broadcast_breach_alerts")
    def test_no_breach_for_with_clinician(self, mock_broadcast, triage_setup):
        """Should not check patients already WITH_CLINICIAN."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import check_wait_time_breaches

        triage_setup["queue_entry"].status = "WITH_CLINICIAN"
        triage_setup["queue_entry"].save(update_fields=["status"])

        result = check_wait_time_breaches()
        assert result == 0
        assert WaitTimeBreach.objects.count() == 0


@pytest.mark.django_db
class TestAutoResolveBreaches:
    """Tests for the auto_resolve_breaches Celery task."""

    def test_resolves_completed_patient_breach(self, triage_setup):
        """Should auto-resolve breach when queue entry is COMPLETED."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import auto_resolve_breaches

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        # Complete the queue entry
        triage_setup["queue_entry"].mark_completed()

        result = auto_resolve_breaches()
        assert result == 1
        breach.refresh_from_db()
        assert breach.status == "RESOLVED"

    def test_resolves_lwbs_patient_breach(self, triage_setup):
        """Should auto-resolve breach when patient left without being seen."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import auto_resolve_breaches

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        triage_setup["queue_entry"].mark_lwbs("Left due to long wait")

        result = auto_resolve_breaches()
        assert result == 1
        breach.refresh_from_db()
        assert breach.status == "RESOLVED"

    def test_keeps_active_breach_for_waiting_patient(self, triage_setup):
        """Should NOT resolve breach if patient is still waiting."""
        from hmis.apps.triage.models import WaitTimeBreach
        from hmis.apps.triage.tasks import auto_resolve_breaches

        WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        result = auto_resolve_breaches()
        assert result == 0


# =============================================================================
# WaitTimeBreach API Tests
# =============================================================================


@pytest.mark.django_db
class TestWaitTimeBreachAPI:
    """Tests for wait time breach API endpoints."""

    def test_list_breaches_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/triage/breaches/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_breaches(self, authenticated_client, triage_setup):
        """Should list all breaches."""
        from hmis.apps.triage.models import WaitTimeBreach

        WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        response = authenticated_client.get("/api/triage/breaches/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["severity"] == "CRITICAL"
        assert response.data["results"][0]["patient_name"] is not None

    def test_filter_active_only(self, authenticated_client, triage_setup):
        """Should filter to active-only breaches."""
        from hmis.apps.triage.models import WaitTimeBreach

        # Active breach
        WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
            status="ACTIVE",
        )

        # Resolved breach
        WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=20,
            status="RESOLVED",
        )

        response = authenticated_client.get("/api/triage/breaches/?active_only=true")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_acknowledge_breach(self, authenticated_client, triage_setup):
        """Should acknowledge a breach via API."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        response = authenticated_client.post(
            f"/api/triage/breaches/{breach.id}/acknowledge/",
            {"notes": "Acknowledged"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACKNOWLEDGED"

    def test_acknowledge_non_active_breach_fails(self, authenticated_client, triage_setup):
        """Should reject acknowledging a non-active breach."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
            status="RESOLVED",
        )

        response = authenticated_client.post(
            f"/api/triage/breaches/{breach.id}/acknowledge/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_resolve_breach_via_api(self, authenticated_client, triage_setup):
        """Should resolve a breach via API."""
        from hmis.apps.triage.models import WaitTimeBreach

        breach = WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        response = authenticated_client.post(
            f"/api/triage/breaches/{breach.id}/resolve/",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RESOLVED"

    def test_breach_summary(self, authenticated_client, triage_setup):
        """Should return breach summary with counts."""
        from hmis.apps.triage.models import WaitTimeBreach

        WaitTimeBreach.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            triage_category="RED",
            severity="CRITICAL",
            target_wait_minutes=0,
            actual_wait_minutes=15,
        )

        response = authenticated_client.get("/api/triage/breaches/summary/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_active"] == 1
        assert response.data["by_severity"]["CRITICAL"] == 1


# =============================================================================
# Escalation API Tests
# =============================================================================


@pytest.mark.django_db
class TestEscalationAPI:
    """Tests for escalation API endpoints."""

    def test_list_escalations_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/triage/escalations/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_escalate_from_queue(self, authenticated_client, triage_setup, test_user, triage_permission):
        """Should create escalation from queue entry."""
        # Grant view_triage_queue permission
        perm = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(perm)

        response = authenticated_client.post(
            f"/api/triage/queue/{triage_setup['queue_entry'].id}/escalate/",
            {
                "escalation_type": "CHARGE_NURSE",
                "reason": "Patient waiting too long in RED category",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["escalation_type"] == "CHARGE_NURSE"
        assert response.data["status"] == "PENDING"
        assert response.data["patient_name"] is not None
        assert response.data["triage_category"] == "RED"
        assert response.data["assigned_area"] == "ER_RESUS"
        assert response.data["wait_time_at_escalation"] is not None

    def test_escalate_creates_audit_log(self, authenticated_client, triage_setup, test_user, triage_permission):
        """Should create audit log entry on escalation."""
        from hmis.apps.core.models import AuditLog

        perm = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(perm)

        authenticated_client.post(
            f"/api/triage/queue/{triage_setup['queue_entry'].id}/escalate/",
            {
                "escalation_type": "ADDITIONAL_STAFF",
                "reason": "Queue overloaded",
            },
            format="json",
        )

        audit = AuditLog.objects.filter(action="patient_escalation").first()
        assert audit is not None
        assert audit.details["escalation_type"] == "ADDITIONAL_STAFF"

    def test_escalate_requires_reason(self, authenticated_client, triage_setup, test_user, triage_permission):
        """Should require reason for escalation."""
        perm = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(perm)

        response = authenticated_client.post(
            f"/api/triage/queue/{triage_setup['queue_entry'].id}/escalate/",
            {
                "escalation_type": "CHARGE_NURSE",
                # No reason
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_escalations(self, authenticated_client, triage_setup, test_user):
        """Should list escalation records."""
        from hmis.apps.triage.models import Escalation

        Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="CHARGE_NURSE",
            reason="Waiting too long",
            escalated_by=test_user,
        )

        response = authenticated_client.get("/api/triage/escalations/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["escalation_type"] == "CHARGE_NURSE"

    def test_filter_active_escalations(self, authenticated_client, triage_setup, test_user):
        """Should filter to active-only escalations."""
        from hmis.apps.triage.models import Escalation

        Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="CHARGE_NURSE",
            reason="Active",
            escalated_by=test_user,
            status="PENDING",
        )

        Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="SUPERVISOR",
            reason="Resolved one",
            escalated_by=test_user,
            status="RESOLVED",
        )

        response = authenticated_client.get("/api/triage/escalations/?active_only=true")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_resolve_escalation_via_api(self, authenticated_client, triage_setup, test_user):
        """Should resolve an escalation via API."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="CHARGE_NURSE",
            reason="Test",
            escalated_by=test_user,
        )

        response = authenticated_client.post(
            f"/api/triage/escalations/{escalation.id}/resolve/",
            {"resolution_notes": "Handled by charge nurse"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RESOLVED"

    def test_dismiss_escalation_via_api(self, authenticated_client, triage_setup, test_user):
        """Should dismiss an escalation via API."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="ADDITIONAL_STAFF",
            reason="Test",
            escalated_by=test_user,
        )

        response = authenticated_client.post(
            f"/api/triage/escalations/{escalation.id}/dismiss/",
            {"resolution_notes": "Not needed"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DISMISSED"

    def test_resolve_already_resolved_fails(self, authenticated_client, triage_setup, test_user):
        """Should reject resolving a resolved escalation."""
        from hmis.apps.triage.models import Escalation

        escalation = Escalation.objects.create(
            queue_entry=triage_setup["queue_entry"],
            triage_assessment=triage_setup["assessment"],
            patient=triage_setup["patient"],
            escalation_type="CHARGE_NURSE",
            reason="Test",
            escalated_by=test_user,
            status="RESOLVED",
        )

        response = authenticated_client.post(
            f"/api/triage/escalations/{escalation.id}/resolve/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
