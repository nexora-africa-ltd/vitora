"""Tests for L6.2 Critical Value Notifications."""

import pytest
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def critical_range(db, sample_test_catalog, sample_facility, sample_organization):
    """Create a critical value range for CBC."""
    from hmis.apps.laboratory.critical_values.models import CriticalValueRange

    return CriticalValueRange.objects.create(
        test=sample_test_catalog,
        critical_low=2.0,
        critical_high=20.0,
        panic_low=1.0,
        panic_high=25.0,
        notification_deadline_minutes=30,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def critical_notification(
    db, sample_lab_result, critical_range, sample_facility, sample_organization
):
    """Create a pending critical value notification."""
    from hmis.apps.laboratory.critical_values.models import CriticalValueNotification

    return CriticalValueNotification.objects.create(
        result=sample_lab_result,
        critical_range=critical_range,
        severity="CRITICAL",
        test_name="CBC",
        critical_value="1.5",
        patient_name="Jane Smith",
        facility=sample_facility,
        organization=sample_organization,
    )


class TestCriticalValueRangeAPI:
    """Tests for critical value range CRUD."""

    def test_list_ranges(self, authenticated_client, critical_range):
        response = authenticated_client.get("/api/lab/critical-values/ranges/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_range(self, authenticated_client, sample_test_catalog, sample_facility):
        data = {
            "test": sample_test_catalog.id,
            "critical_low": 3.0,
            "critical_high": 15.0,
            "panic_low": 2.0,
            "panic_high": 20.0,
            "notification_deadline_minutes": 15,
        }
        response = authenticated_client.post("/api/lab/critical-values/ranges/", data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_update_range(self, authenticated_client, critical_range):
        response = authenticated_client.patch(
            f"/api/lab/critical-values/ranges/{critical_range.id}/",
            {"notification_deadline_minutes": 15},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_seed_defaults(self, authenticated_client, sample_facility):
        response = authenticated_client.post("/api/lab/critical-values/ranges/seed_defaults/")
        assert response.status_code == status.HTTP_201_CREATED
        assert "created" in response.data


class TestCriticalValueNotificationAPI:
    """Tests for critical value notification workflow."""

    def test_list_notifications(self, authenticated_client, critical_notification):
        response = authenticated_client.get("/api/lab/critical-values/notifications/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_get_notification_detail(self, authenticated_client, critical_notification):
        response = authenticated_client.get(
            f"/api/lab/critical-values/notifications/{critical_notification.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PENDING"
        assert response.data["severity"] == "CRITICAL"

    def test_notify_action(self, authenticated_client, critical_notification):
        data = {
            "method": "PHONE_CALL",
            "notified_to_name": "Dr. Ochieng",
        }
        response = authenticated_client.post(
            f"/api/lab/critical-values/notifications/{critical_notification.id}/notify/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NOTIFIED"
        assert response.data["notified_to_name"] == "Dr. Ochieng"

    def test_cannot_notify_already_notified(
        self, authenticated_client, critical_notification, test_user
    ):
        # Manually set to NOTIFIED
        critical_notification.notify(
            notified_by=test_user,
            notified_to_name="Dr. A",
            method="PHONE_CALL",
        )
        data = {"method": "PHONE_CALL", "notified_to_name": "Dr. B"}
        response = authenticated_client.post(
            f"/api/lab/critical-values/notifications/{critical_notification.id}/notify/",
            data,
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_read_back_action(self, authenticated_client, critical_notification, test_user):
        # First notify
        critical_notification.notify(
            notified_by=test_user,
            notified_to_name="Dr. A",
            method="PHONE_CALL",
        )
        data = {"read_back_value": "1.5"}
        response = authenticated_client.post(
            f"/api/lab/critical-values/notifications/{critical_notification.id}/read_back/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["read_back_verified"] is True
        assert response.data["status"] == "READ_BACK"

    def test_acknowledge_action(self, authenticated_client, critical_notification, test_user):
        # First notify
        critical_notification.notify(
            notified_by=test_user,
            notified_to_name="Dr. A",
            method="PHONE_CALL",
        )
        response = authenticated_client.post(
            f"/api/lab/critical-values/notifications/{critical_notification.id}/acknowledge/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACKNOWLEDGED"

    def test_escalate_action(self, authenticated_client, critical_notification):
        data = {"notes": "Unable to reach attending"}
        response = authenticated_client.post(
            f"/api/lab/critical-values/notifications/{critical_notification.id}/escalate/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ESCALATED"

    def test_compliance_endpoint(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/lab/critical-values/notifications/compliance/")
        assert response.status_code == status.HTTP_200_OK
        assert "compliance_rate" in response.data
        assert "overdue_count" in response.data


class TestCriticalValueModels:
    """Tests for critical value model behaviour."""

    def test_is_critical_detection(self, critical_range):
        """Test critical range boundary detection."""
        assert critical_range.is_critical(1.5) is True  # Below critical_low
        assert critical_range.is_critical(22.0) is True  # Above critical_high
        assert critical_range.is_critical(10.0) is False  # Normal

    def test_is_panic_detection(self, critical_range):
        """Test panic range boundary detection."""
        assert critical_range.is_panic(0.5) is True  # Below panic_low
        assert critical_range.is_panic(26.0) is True  # Above panic_high
        assert critical_range.is_panic(1.5) is False  # Critical but not panic

    def test_notification_state_transitions(self, critical_notification, test_user):
        """Test full notification lifecycle."""
        assert critical_notification.status == "PENDING"

        # Notify
        critical_notification.notify(
            notified_by=test_user,
            notified_to_name="Dr. Smith",
            method="PHONE_CALL",
        )
        assert critical_notification.status == "NOTIFIED"
        assert critical_notification.notified_at is not None

        # Read back
        critical_notification.verify_read_back("1.5")
        assert critical_notification.status == "READ_BACK"
        assert critical_notification.read_back_verified is True

        # Acknowledge
        critical_notification.acknowledge()
        assert critical_notification.status == "ACKNOWLEDGED"
        assert critical_notification.acknowledged_at is not None

    def test_escalation(self, critical_notification, test_user):
        """Test escalation from pending."""
        critical_notification.escalate(
            escalated_to=test_user,
            notes="Clinician unreachable",
        )
        assert critical_notification.status == "ESCALATED"
        assert critical_notification.escalated_to == test_user

    def test_is_overdue_property(self, critical_notification):
        """Test overdue calculation."""
        # Just created — should not be overdue yet (within 30 min)
        assert critical_notification.is_overdue is False

        # Manually backdate detection
        from datetime import timedelta

        critical_notification.detected_at = timezone.now() - timedelta(minutes=45)
        critical_notification.save()
        assert critical_notification.is_overdue is True


class TestCriticalValueDomainEvents:
    """Tests for domain event publication."""

    def test_creation_publishes_event(
        self, db, mocker, sample_lab_result, critical_range, sample_facility, sample_organization
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.critical_values.signals.publish_event")
        from hmis.apps.laboratory.critical_values.models import CriticalValueNotification

        CriticalValueNotification.objects.create(
            result=sample_lab_result,
            critical_range=critical_range,
            severity="PANIC",
            test_name="K+",
            critical_value="7.5",
            patient_name="Test Patient",
            facility=sample_facility,
            organization=sample_organization,
        )

        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert "critical_notification.created" in call_args[0][0]
