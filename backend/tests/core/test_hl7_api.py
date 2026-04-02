"""Tests for HL7 message read-only API."""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.hl7.models import (
    HL7Message,
    HL7MessageDirection,
    HL7MessageStatus,
)
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.fixture
def admin_user(db):  # type: ignore[no-untyped-def]
    """Create an admin user."""
    return User.objects.create_superuser(
        username="hl7admin",
        password="testpass123",
        email="hl7admin@example.com",
    )


@pytest.fixture
def admin_client(admin_user, sample_organization, sample_facility):  # type: ignore[no-untyped-def]
    """Authenticated API client with admin privileges."""
    client = APIClient()
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def sample_hl7_messages(db):  # type: ignore[no-untyped-def]
    """Create sample HL7 messages for testing."""
    messages = []
    messages.append(
        HL7Message.objects.create(
            message_type="ADT^A01",
            direction=HL7MessageDirection.OUTBOUND,
            raw_message="MSH|^~\\&|VITORA|FACILITY|...",
            message_control_id="MSG-001",
            status=HL7MessageStatus.ACKNOWLEDGED,
            sent_at=timezone.now(),
            acknowledged_at=timezone.now(),
        )
    )
    messages.append(
        HL7Message.objects.create(
            message_type="ORM^O01",
            direction=HL7MessageDirection.OUTBOUND,
            raw_message="MSH|^~\\&|VITORA|FACILITY|...",
            message_control_id="MSG-002",
            status=HL7MessageStatus.FAILED,
            retry_count=2,
            last_error="Connection refused",
        )
    )
    messages.append(
        HL7Message.objects.create(
            message_type="ORU^R01",
            direction=HL7MessageDirection.INBOUND,
            raw_message="MSH|^~\\&|LIS|LAB|...",
            message_control_id="MSG-003",
            status=HL7MessageStatus.PENDING,
        )
    )
    return messages


@pytest.mark.django_db
class TestHL7MessageList:
    """Tests for HL7 message list endpoint."""

    def test_list_requires_auth(self, api_client):  # type: ignore[no-untyped-def]
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/hl7/messages/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_messages(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should return paginated list of HL7 messages."""
        response = authenticated_client.get("/api/hl7/messages/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 3

    def test_filter_by_status(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should filter by status."""
        response = authenticated_client.get("/api/hl7/messages/", {"status": "FAILED"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["message_control_id"] == "MSG-002"

    def test_filter_by_direction(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should filter by direction."""
        response = authenticated_client.get("/api/hl7/messages/", {"direction": "IN"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["message_control_id"] == "MSG-003"

    def test_filter_by_message_type(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should filter by message type (case-insensitive contains)."""
        response = authenticated_client.get("/api/hl7/messages/", {"message_type": "ADT"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_list_serializer_fields(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """List serializer should not include raw_message."""
        response = authenticated_client.get("/api/hl7/messages/")
        result = response.data["results"][0]
        assert "raw_message" not in result
        assert "message_type" in result
        assert "is_retryable" in result


@pytest.mark.django_db
class TestHL7MessageDetail:
    """Tests for HL7 message detail endpoint."""

    def test_get_detail(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should return full message detail including raw_message."""
        msg = sample_hl7_messages[0]
        response = authenticated_client.get(f"/api/hl7/messages/{msg.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["raw_message"] == msg.raw_message
        assert response.data["message_type"] == "ADT^A01"

    def test_detail_not_found(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should return 404 for non-existent message."""
        response = authenticated_client.get("/api/hl7/messages/99999/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestHL7MessageRetry:
    """Tests for HL7 message retry action."""

    def test_retry_requires_admin(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Non-admin users should not be able to retry messages."""
        msg = sample_hl7_messages[1]  # FAILED message
        response = authenticated_client.post(f"/api/hl7/messages/{msg.id}/retry/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_retry_failed_message(self, admin_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Admin should be able to retry a failed message."""
        msg = sample_hl7_messages[1]  # FAILED message
        response = admin_client.post(f"/api/hl7/messages/{msg.id}/retry/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PENDING"

    def test_retry_non_retryable(self, admin_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should reject retry on acknowledged (non-retryable) message."""
        msg = sample_hl7_messages[0]  # ACKNOWLEDGED message
        response = admin_client.post(f"/api/hl7/messages/{msg.id}/retry/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestHL7MessageStats:
    """Tests for HL7 message stats endpoint."""

    def test_stats(self, authenticated_client, sample_hl7_messages):  # type: ignore[no-untyped-def]
        """Should return correct message counts by status."""
        response = authenticated_client.get("/api/hl7/messages/stats/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] == 3
        assert response.data["acknowledged"] == 1
        assert response.data["failed"] == 1
        assert response.data["pending"] == 1
