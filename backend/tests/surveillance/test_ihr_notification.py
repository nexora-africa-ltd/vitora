"""
Unit tests for IHR (International Health Regulations) Notification module.

Tests for IHRNotification model, serializers, views, and escalation workflow.
Covers the complete notification pipeline: facility → county → MOH → WHO.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def ihr_disease(db):
    """Create an IHR-notifiable disease."""
    from hmis.apps.surveillance.models import NotifiableDisease

    return NotifiableDisease.objects.create(
        name="Cholera",
        icd10_codes="A00,A00.0,A00.1,A00.9",
        category="IMMEDIATE",
        reporting_hours=24,
        description="Acute watery diarrhoeal disease",
        is_ihr_notifiable=True,
        is_active=True,
    )


@pytest.fixture
def non_ihr_disease(db):
    """Create a non-IHR-notifiable disease."""
    from hmis.apps.surveillance.models import NotifiableDisease

    return NotifiableDisease.objects.create(
        name="Malaria",
        icd10_codes="B50,B50.0",
        category="WEEKLY",
        reporting_hours=168,
        description="Plasmodium infection",
        is_ihr_notifiable=False,
        is_active=True,
    )


@pytest.fixture
def sample_notifiable_case(db, ihr_disease, sample_patient, sample_encounter):
    """Create a sample notifiable case for IHR testing."""
    from hmis.apps.surveillance.models import NotifiableCase

    return NotifiableCase.objects.create(
        disease=ihr_disease,
        patient=sample_patient,
        encounter=sample_encounter,
        severity="SEVERE",
        outcome="ACTIVE",
    )


@pytest.fixture
def ihr_notification(db, ihr_disease, sample_notifiable_case, sample_patient, test_user):
    """Create a sample IHR notification."""
    from hmis.apps.surveillance.models import IHRNotification

    return IHRNotification.objects.create(
        disease=ihr_disease,
        case=sample_notifiable_case,
        patient=sample_patient,
        event_description="Cluster of severe watery diarrhoea cases detected",
        event_date=date.today(),
        urgency="URGENT",
        cases_count=5,
        deaths_count=1,
        affected_area="Mombasa port area",
        reported_by=test_user,
        risk_assessment="High risk of spread due to poor water sanitation",
        response_measures="Water sampling initiated, contact tracing ongoing",
    )


@pytest.fixture
def ihr_notification_data(ihr_disease, sample_notifiable_case, sample_patient, sample_county):
    """IHR notification data for API tests."""
    return {
        "disease": ihr_disease.id,
        "case": sample_notifiable_case.id,
        "patient": sample_patient.id,
        "event_description": "Suspected cholera outbreak at coastal area",
        "event_date": str(date.today()),
        "urgency": "URGENT",
        "cases_count": 3,
        "deaths_count": 0,
        "affected_area": "Coastal region",
        "county": sample_county.id,
        "risk_assessment": "Moderate risk",
        "response_measures": "Investigation underway",
    }


# ============================================================================
# IHRNotification Model Tests
# ============================================================================


class TestIHRNotificationModel:
    """Tests for IHRNotification model."""

    def test_create_ihr_notification(self, ihr_notification):
        """Should create an IHR notification with valid data."""
        assert ihr_notification.id is not None
        assert ihr_notification.disease.name == "Cholera"
        assert ihr_notification.urgency == "URGENT"
        assert ihr_notification.status == "DRAFT"
        assert ihr_notification.cases_count == 5
        assert ihr_notification.deaths_count == 1

    def test_notification_reference(self, ihr_notification):
        """Should return formatted notification reference."""
        ref = ihr_notification.notification_reference
        assert ref.startswith("IHR-")
        assert len(ref) > 4

    def test_str_representation(self, ihr_notification):
        """Should return formatted string representation."""
        result = str(ihr_notification)
        assert "Cholera" in result
        assert "Draft" in result
        assert "Urgent" in result

    def test_default_status_is_draft(self, ihr_disease, test_user):
        """Should default to DRAFT status."""
        from hmis.apps.surveillance.models import IHRNotification

        notification = IHRNotification.objects.create(
            disease=ihr_disease,
            event_description="Test event",
            event_date=date.today(),
            reported_by=test_user,
        )
        assert notification.status == "DRAFT"

    def test_auto_populate_county_from_case(
        self, ihr_disease, sample_notifiable_case, sample_county, test_user
    ):
        """Should auto-populate county from case on save."""
        from hmis.apps.surveillance.models import IHRNotification

        # Ensure the case has a county
        sample_notifiable_case.county = sample_county
        sample_notifiable_case.save()

        notification = IHRNotification.objects.create(
            disease=ihr_disease,
            case=sample_notifiable_case,
            event_description="Test event",
            event_date=date.today(),
            reported_by=test_user,
        )
        assert notification.county == sample_county

    def test_auto_populate_county_from_patient(
        self, ihr_disease, sample_patient, sample_county, test_user
    ):
        """Should auto-populate county from patient when no case."""
        from hmis.apps.surveillance.models import IHRNotification

        notification = IHRNotification.objects.create(
            disease=ihr_disease,
            patient=sample_patient,
            event_description="Test event",
            event_date=date.today(),
            reported_by=test_user,
        )
        assert notification.county == sample_patient.county

    def test_is_escalated_property(self, ihr_notification):
        """Should return False for DRAFT status."""
        assert ihr_notification.is_escalated is False

    def test_is_escalated_after_county_submission(self, ihr_notification, test_user):
        """Should return True after county submission."""
        ihr_notification.submit_to_county(user=test_user)
        assert ihr_notification.is_escalated is True

    def test_is_who_notified_property(self, ihr_notification):
        """Should return False before WHO notification."""
        assert ihr_notification.is_who_notified is False

    def test_hours_since_detection(self, ihr_notification):
        """Should return hours since detection."""
        hours = ihr_notification.hours_since_detection
        assert hours is not None
        assert hours >= 0

    def test_is_overdue_not_overdue_when_recent(self, ihr_notification):
        """Should not be overdue when recently created."""
        assert ihr_notification.is_overdue is False

    def test_is_overdue_after_24h(self, ihr_disease, test_user):
        """Should be overdue after 24 hours without WHO notification."""
        from hmis.apps.surveillance.models import IHRNotification

        notification = IHRNotification.objects.create(
            disease=ihr_disease,
            event_description="Old event",
            event_date=date.today() - timedelta(days=2),
            reported_by=test_user,
            report_date=timezone.now() - timedelta(hours=25),
        )
        assert notification.is_overdue is True

    def test_is_not_overdue_when_who_notified(self, ihr_disease, test_user):
        """Should not be overdue if WHO has been notified."""
        from hmis.apps.surveillance.models import IHRNotification

        notification = IHRNotification.objects.create(
            disease=ihr_disease,
            event_description="Old event",
            event_date=date.today() - timedelta(days=2),
            reported_by=test_user,
            report_date=timezone.now() - timedelta(hours=25),
            status="NOTIFIED_WHO",
        )
        assert notification.is_overdue is False


# ============================================================================
# Escalation Workflow Tests
# ============================================================================


class TestIHRWorkflow:
    """Tests for IHR notification escalation workflow."""

    def test_submit_to_county(self, ihr_notification, test_user):
        """Should submit notification to county."""
        ihr_notification.submit_to_county(user=test_user, notes="Urgent review needed")

        assert ihr_notification.status == "SUBMITTED_COUNTY"
        assert ihr_notification.county_notified_at is not None
        assert ihr_notification.county_reviewed_by == test_user
        assert ihr_notification.county_notes == "Urgent review needed"

    def test_escalate_to_national(self, ihr_notification, test_user):
        """Should escalate to MOH National IHR Focal Point."""
        ihr_notification.submit_to_county(user=test_user)
        ihr_notification.escalate_to_national(user=test_user, notes="Meets IHR criteria")

        assert ihr_notification.status == "ESCALATED_NATIONAL"
        assert ihr_notification.national_notified_at is not None
        assert ihr_notification.national_reviewed_by == test_user
        assert ihr_notification.national_notes == "Meets IHR criteria"

    def test_notify_who(self, ihr_notification, test_user):
        """Should mark as notified to WHO."""
        ihr_notification.submit_to_county(user=test_user)
        ihr_notification.escalate_to_national(user=test_user)
        ihr_notification.notify_who(reference_number="WHO-2026-1234")

        assert ihr_notification.status == "NOTIFIED_WHO"
        assert ihr_notification.who_notified_at is not None
        assert ihr_notification.who_reference_number == "WHO-2026-1234"
        assert ihr_notification.is_who_notified is True

    def test_acknowledge_who(self, ihr_notification, test_user):
        """Should record WHO acknowledgement."""
        ihr_notification.submit_to_county(user=test_user)
        ihr_notification.escalate_to_national(user=test_user)
        ihr_notification.notify_who()
        ihr_notification.acknowledge_who()

        assert ihr_notification.status == "ACKNOWLEDGED"
        assert ihr_notification.who_acknowledged_at is not None

    def test_close_notification(self, ihr_notification, test_user):
        """Should close the notification."""
        ihr_notification.close(notes="Event resolved, no further transmission")

        assert ihr_notification.status == "CLOSED"
        assert ihr_notification.resolved_at is not None
        assert "Event resolved" in ihr_notification.resolution_notes

    def test_reject_notification(self, ihr_notification, test_user):
        """Should reject the notification."""
        ihr_notification.reject(user=test_user, notes="Not IHR-reportable after review")

        assert ihr_notification.status == "REJECTED"
        assert ihr_notification.resolved_at is not None
        assert "Not IHR-reportable" in ihr_notification.resolution_notes

    def test_full_escalation_pipeline(self, ihr_notification, test_user):
        """Should support full escalation pipeline: DRAFT → COUNTY → NATIONAL → WHO → ACK → CLOSED."""
        assert ihr_notification.status == "DRAFT"

        ihr_notification.submit_to_county(user=test_user)
        assert ihr_notification.status == "SUBMITTED_COUNTY"

        ihr_notification.escalate_to_national(user=test_user)
        assert ihr_notification.status == "ESCALATED_NATIONAL"

        ihr_notification.notify_who(reference_number="WHO-KE-2026-001")
        assert ihr_notification.status == "NOTIFIED_WHO"

        ihr_notification.acknowledge_who()
        assert ihr_notification.status == "ACKNOWLEDGED"

        ihr_notification.close(notes="Outbreak contained")
        assert ihr_notification.status == "CLOSED"
        assert ihr_notification.resolved_at is not None


# ============================================================================
# Serializer Validation Tests
# ============================================================================


class TestIHRSerializerValidation:
    """Tests for IHR notification serializer validation."""

    def test_validate_disease_must_be_ihr_notifiable(self, non_ihr_disease, sample_patient):
        """Should reject disease that is not IHR-notifiable."""
        from hmis.apps.surveillance.serializers import IHRNotificationCreateSerializer

        data = {
            "disease": non_ihr_disease.id,
            "event_description": "Test event",
            "event_date": str(date.today()),
            "urgency": "ROUTINE",
        }
        serializer = IHRNotificationCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "disease" in serializer.errors

    def test_validate_ihr_notifiable_disease_accepted(self, ihr_disease):
        """Should accept IHR-notifiable disease."""
        from hmis.apps.surveillance.serializers import IHRNotificationCreateSerializer

        data = {
            "disease": ihr_disease.id,
            "event_description": "Test event",
            "event_date": str(date.today()),
            "urgency": "URGENT",
        }
        serializer = IHRNotificationCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_list_serializer_fields(self, ihr_notification):
        """Should include correct fields in list serializer."""
        from hmis.apps.surveillance.serializers import IHRNotificationListSerializer

        serializer = IHRNotificationListSerializer(ihr_notification)
        data = serializer.data

        assert "id" in data
        assert "disease_name" in data
        assert "urgency" in data
        assert "status" in data
        assert "notification_reference" in data
        assert "is_overdue" in data
        assert "hours_since_detection" in data
        assert "cases_count" in data
        assert "deaths_count" in data

    def test_detail_serializer_fields(self, ihr_notification):
        """Should include full fields in detail serializer."""
        from hmis.apps.surveillance.serializers import IHRNotificationSerializer

        serializer = IHRNotificationSerializer(ihr_notification)
        data = serializer.data

        assert "disease_name" in data
        assert "disease_category" in data
        assert "patient_name" in data
        assert "patient_mrn" in data
        assert "county_name" in data
        assert "reported_by_name" in data
        assert "notification_reference" in data
        assert "is_escalated" in data
        assert "is_who_notified" in data
        assert "hours_since_detection" in data
        assert "is_overdue" in data
        assert "annex2_criteria" in data
        assert "risk_assessment" in data
        assert "response_measures" in data


# ============================================================================
# API Endpoint Tests
# ============================================================================


class TestIHRNotificationAPI:
    """Tests for IHR Notification API endpoints."""

    def test_list_ihr_notifications(self, authenticated_client, ihr_notification):
        """Should list IHR notifications."""
        response = authenticated_client.get("/api/surveillance/ihr/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_ihr_notification(self, authenticated_client, ihr_notification_data):
        """Should create IHR notification via API."""
        response = authenticated_client.post(
            "/api/surveillance/ihr/",
            ihr_notification_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["urgency"] == "URGENT"

    def test_create_ihr_notification_without_auth_fails(self, api_client, ihr_notification_data):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/surveillance/ihr/",
            ihr_notification_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_ihr_notification_with_non_ihr_disease_fails(
        self, authenticated_client, non_ihr_disease
    ):
        """Should reject non-IHR disease."""
        data = {
            "disease": non_ihr_disease.id,
            "event_description": "Test event",
            "event_date": str(date.today()),
            "urgency": "ROUTINE",
        }
        response = authenticated_client.post(
            "/api/surveillance/ihr/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disease" in response.data

    def test_get_ihr_notification_detail(self, authenticated_client, ihr_notification):
        """Should retrieve IHR notification detail."""
        response = authenticated_client.get(f"/api/surveillance/ihr/{ihr_notification.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["disease_name"] == "Cholera"
        assert response.data["notification_reference"] == f"IHR-{ihr_notification.id:04d}"

    def test_submit_to_county(self, authenticated_client, ihr_notification):
        """Should submit notification to county via API."""
        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/submit_to_county/",
            {"notes": "Review needed"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SUBMITTED_COUNTY"
        assert response.data["county_notified_at"] is not None

    def test_submit_to_county_invalid_status(self, authenticated_client, ihr_notification, test_user):
        """Should reject county submission from wrong status."""
        ihr_notification.submit_to_county(user=test_user)  # Already submitted

        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/submit_to_county/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_escalate_to_national(self, authenticated_client, ihr_notification, test_user):
        """Should escalate to national via API."""
        ihr_notification.submit_to_county(user=test_user)

        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/escalate_to_national/",
            {"notes": "Meets Annex 2 criteria"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ESCALATED_NATIONAL"

    def test_escalate_to_national_requires_county_first(
        self, authenticated_client, ihr_notification
    ):
        """Should reject national escalation without county submission."""
        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/escalate_to_national/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_notify_who(self, authenticated_client, ihr_notification, test_user):
        """Should notify WHO via API."""
        ihr_notification.submit_to_county(user=test_user)
        ihr_notification.escalate_to_national(user=test_user)

        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/notify_who/",
            {"reference_number": "WHO-KE-2026-001"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NOTIFIED_WHO"
        assert response.data["who_reference_number"] == "WHO-KE-2026-001"

    def test_notify_who_requires_national_first(self, authenticated_client, ihr_notification):
        """Should reject WHO notification without national escalation."""
        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/notify_who/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_acknowledge_who(self, authenticated_client, ihr_notification, test_user):
        """Should record WHO acknowledgement via API."""
        ihr_notification.submit_to_county(user=test_user)
        ihr_notification.escalate_to_national(user=test_user)
        ihr_notification.notify_who()

        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/acknowledge_who/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACKNOWLEDGED"

    def test_close_notification(self, authenticated_client, ihr_notification):
        """Should close notification via API."""
        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/close/",
            {"notes": "Contained"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CLOSED"

    def test_reject_notification(self, authenticated_client, ihr_notification):
        """Should reject notification via API."""
        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/reject/",
            {"notes": "Not IHR criteria"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REJECTED"

    def test_reject_already_closed_fails(self, authenticated_client, ihr_notification):
        """Should not reject already closed notification."""
        ihr_notification.close()

        response = authenticated_client.post(
            f"/api/surveillance/ihr/{ihr_notification.id}/reject/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_overdue_notifications(self, authenticated_client, ihr_disease, test_user):
        """Should list overdue IHR notifications."""
        from hmis.apps.surveillance.models import IHRNotification

        # Create an overdue notification
        IHRNotification.objects.create(
            disease=ihr_disease,
            event_description="Old event",
            event_date=date.today() - timedelta(days=2),
            reported_by=test_user,
            report_date=timezone.now() - timedelta(hours=30),
        )

        response = authenticated_client.get("/api/surveillance/ihr/overdue/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_ihr_dashboard(self, authenticated_client, ihr_notification):
        """Should return IHR dashboard statistics."""
        response = authenticated_client.get("/api/surveillance/ihr/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        assert "total" in response.data
        assert "pending" in response.data
        assert "overdue" in response.data
        assert "by_urgency" in response.data
        assert "by_disease" in response.data

    def test_filter_by_status(self, authenticated_client, ihr_notification):
        """Should filter notifications by status."""
        response = authenticated_client.get("/api/surveillance/ihr/?status=DRAFT")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert all(r["status"] == "DRAFT" for r in results)

    def test_filter_by_urgency(self, authenticated_client, ihr_notification):
        """Should filter notifications by urgency."""
        response = authenticated_client.get("/api/surveillance/ihr/?urgency=URGENT")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert all(r["urgency"] == "URGENT" for r in results)

    def test_search_by_disease_name(self, authenticated_client, ihr_notification):
        """Should search notifications by disease name."""
        response = authenticated_client.get("/api/surveillance/ihr/?search=Cholera")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
