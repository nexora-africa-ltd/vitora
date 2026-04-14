"""
Unit tests for Emergency Access (break-glass) functionality.

Tests for DHA Compliance: Emergency Access Procedures (P1 Required)
Kenya Data Protection Act 2019: Section 32 (Vital Interests)

Sprint: Phase 1 - DHA Compliance
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.emergency_access.models import (
    EmergencyAccess,
    EmergencyAccessReason,
    EmergencyAccessStatus,
)
from hmis.apps.core.models import AuditLog
from tests.conftest import ensure_staff_profile

User = get_user_model()


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def admin_user(db):
    """Create an admin user with emergency access permissions."""
    user = User.objects.create_user(
        username="admin_ea",
        email="admin_ea@vitora.local",
        password="testpass123",
        is_superuser=True,
    )
    return user


@pytest.fixture
def regular_user(db):
    """Create a regular user."""
    return User.objects.create_user(
        username="regular_ea",
        email="regular_ea@vitora.local",
        password="testpass123",
    )


@pytest.fixture
def user_with_approve_permission(db):
    """Create a user with emergency access approval permission."""
    user = User.objects.create_user(
        username="approver_ea",
        email="approver_ea@vitora.local",
        password="testpass123",
    )
    permission = Permission.objects.get(codename="approve_emergency_access")
    user.user_permissions.add(permission)
    return user


@pytest.fixture
def authenticated_admin_client(admin_user, sample_organization, sample_facility):
    """API client authenticated as admin."""
    client = APIClient()
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def authenticated_regular_client(regular_user, sample_organization, sample_facility):
    """API client authenticated as regular user."""
    client = APIClient()
    ensure_staff_profile(regular_user, sample_organization, sample_facility)
    client.force_authenticate(user=regular_user)
    return client


@pytest.fixture
def authenticated_approver_client(
    user_with_approve_permission, sample_organization, sample_facility
):
    """API client authenticated as approver."""
    client = APIClient()
    ensure_staff_profile(user_with_approve_permission, sample_organization, sample_facility)
    client.force_authenticate(user=user_with_approve_permission)
    return client


@pytest.fixture
def sample_emergency_access(regular_user, sample_patient):
    """Create a sample emergency access record."""
    return EmergencyAccess.objects.create(
        user=regular_user,
        patient=sample_patient,
        reason=EmergencyAccessReason.LIFE_THREATENING,
        reason_details="Patient arrived unconscious with severe trauma. Need immediate access.",
        duration_minutes=240,
    )


# ============================================================================
# Model Tests
# ============================================================================


class TestEmergencyAccessModel:
    """Tests for EmergencyAccess model."""

    def test_create_emergency_access(self, regular_user, sample_patient, db):
        """Should create emergency access record with required fields."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            patient=sample_patient,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Critical emergency requiring immediate access.",
            duration_minutes=60,
        )

        assert ea.id is not None
        assert ea.user == regular_user
        assert ea.patient == sample_patient
        assert ea.reason == EmergencyAccessReason.LIFE_THREATENING
        assert ea.status == EmergencyAccessStatus.ACTIVE
        assert ea.expires_at is not None

    def test_auto_set_expires_at(self, regular_user, db):
        """Should auto-calculate expires_at from requested_at and duration."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.UNCONSCIOUS_PATIENT,
            reason_details="Patient unable to provide consent.",
            duration_minutes=120,
        )

        expected_expiry = ea.requested_at + timedelta(minutes=120)
        # Allow small delta for save timing
        assert abs((ea.expires_at - expected_expiry).total_seconds()) < 2

    def test_is_active_property(self, regular_user, db):
        """Should correctly compute is_active property."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency situation.",
            duration_minutes=60,
        )

        assert ea.is_active is True
        assert ea.is_expired is False
        assert ea.remaining_minutes > 0
        assert ea.remaining_minutes <= 60

    def test_is_active_false_when_revoked(self, regular_user, admin_user, db):
        """Should return is_active=False when revoked."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )

        ea.revoke(admin_user, "Access no longer needed")

        assert ea.is_active is False
        assert ea.status == EmergencyAccessStatus.REVOKED

    def test_is_expired_property(self, regular_user, db):
        """Should correctly compute is_expired property."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=1,
        )
        # Manually set expires_at to past
        ea.expires_at = timezone.now() - timedelta(minutes=5)
        ea.save()

        assert ea.is_expired is True
        assert ea.remaining_minutes == 0

    def test_check_expired_updates_status(self, regular_user, db):
        """Should update status to EXPIRED when check_expired is called on expired access."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=1,
        )
        ea.expires_at = timezone.now() - timedelta(minutes=5)
        ea.save()

        result = ea.check_expired()

        assert result is True
        ea.refresh_from_db()
        assert ea.status == EmergencyAccessStatus.EXPIRED

    def test_mark_reviewed(self, regular_user, admin_user, db):
        """Should correctly mark access as reviewed."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )

        ea.mark_reviewed(admin_user, "Verified appropriate use")

        assert ea.status == EmergencyAccessStatus.REVIEWED
        assert ea.approver == admin_user
        assert ea.approved_at is not None
        assert ea.approval_notes == "Verified appropriate use"

    def test_revoke_access(self, regular_user, admin_user, db):
        """Should correctly revoke access."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )

        ea.revoke(admin_user, "Inappropriate use detected")

        assert ea.status == EmergencyAccessStatus.REVOKED
        assert ea.revoked_by == admin_user
        assert ea.revoked_at is not None
        assert ea.revocation_reason == "Inappropriate use detected"

    def test_get_active_for_user(self, regular_user, admin_user, db):
        """Should return only active access for specific user."""
        # Create active access for regular_user
        EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )
        # Create expired access for regular_user
        expired = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.MEDICATION_EMERGENCY,
            reason_details="Medication needed.",
            duration_minutes=1,
        )
        expired.expires_at = timezone.now() - timedelta(hours=1)
        expired.save()

        # Create active access for admin_user
        EmergencyAccess.objects.create(
            user=admin_user,
            reason=EmergencyAccessReason.DISASTER_RESPONSE,
            reason_details="Disaster.",
            duration_minutes=60,
        )

        active = EmergencyAccess.get_active_for_user(regular_user)

        assert active.count() == 1
        assert active.first().reason == EmergencyAccessReason.LIFE_THREATENING

    def test_has_active_access(self, regular_user, sample_patient, db):
        """Should correctly check if user has active access."""
        assert EmergencyAccess.has_active_access(regular_user) is False

        EmergencyAccess.objects.create(
            user=regular_user,
            patient=sample_patient,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )

        assert EmergencyAccess.has_active_access(regular_user) is True
        assert EmergencyAccess.has_active_access(regular_user, sample_patient) is True

    def test_string_representation(self, regular_user, sample_patient, db):
        """Should return meaningful string representation."""
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            patient=sample_patient,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )

        str_repr = str(ea)

        assert regular_user.username in str_repr
        assert sample_patient.mrn in str_repr


# ============================================================================
# Serializer Tests
# ============================================================================


class TestEmergencyAccessSerializers:
    """Tests for EmergencyAccess serializers."""

    def test_create_serializer_validates_reason_details_length(self, db):
        """Should reject reason_details shorter than 10 characters."""
        from hmis.apps.core.emergency_access.serializers import EmergencyAccessCreateSerializer

        serializer = EmergencyAccessCreateSerializer(
            data={
                "reason": EmergencyAccessReason.LIFE_THREATENING,
                "reason_details": "Short",
                "duration_minutes": 60,
            }
        )

        assert serializer.is_valid() is False
        assert "reason_details" in serializer.errors

    def test_create_serializer_validates_duration_range(self, db):
        """Should validate duration is between 15 and 1440 minutes."""
        from hmis.apps.core.emergency_access.serializers import EmergencyAccessCreateSerializer

        # Too short
        serializer = EmergencyAccessCreateSerializer(
            data={
                "reason": EmergencyAccessReason.LIFE_THREATENING,
                "reason_details": "This is a valid reason for emergency access.",
                "duration_minutes": 5,  # Less than 15
            }
        )
        assert serializer.is_valid() is False

        # Too long
        serializer = EmergencyAccessCreateSerializer(
            data={
                "reason": EmergencyAccessReason.LIFE_THREATENING,
                "reason_details": "This is a valid reason for emergency access.",
                "duration_minutes": 2000,  # More than 1440
            }
        )
        assert serializer.is_valid() is False

    def test_create_serializer_validates_patient_mrn(self, db):
        """Should reject invalid patient MRN."""
        from hmis.apps.core.emergency_access.serializers import EmergencyAccessCreateSerializer

        serializer = EmergencyAccessCreateSerializer(
            data={
                "reason": EmergencyAccessReason.LIFE_THREATENING,
                "reason_details": "This is a valid reason for emergency access.",
                "duration_minutes": 60,
                "patient_mrn": "INVALID-MRN-12345",
            }
        )

        assert serializer.is_valid() is False
        assert "patient_mrn" in serializer.errors


# ============================================================================
# API Tests
# ============================================================================


class TestEmergencyAccessAPI:
    """Tests for EmergencyAccess API endpoints."""

    @patch("hmis.apps.core.emergency_access.views.send_emergency_access_escalation.delay")
    def test_create_emergency_access_success(
        self, mock_escalation, authenticated_regular_client, db
    ):
        """Should create emergency access and trigger escalation."""
        url = reverse("emergency-access-list")
        data = {
            "reason": EmergencyAccessReason.LIFE_THREATENING,
            "reason_details": "Patient arrived in critical condition, need immediate access.",
            "duration_minutes": 120,
        }

        response = authenticated_regular_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["reason"] == EmergencyAccessReason.LIFE_THREATENING
        assert response.data["is_active"] is True
        mock_escalation.assert_called_once()

    def test_create_emergency_access_unauthenticated_fails(self, db):
        """Should reject unauthenticated requests."""
        client = APIClient()
        url = reverse("emergency-access-list")
        data = {
            "reason": EmergencyAccessReason.LIFE_THREATENING,
            "reason_details": "Emergency access needed.",
            "duration_minutes": 60,
        }

        response = client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_emergency_access_logs_audit(
        self, authenticated_regular_client, regular_user, db
    ):
        """Should create audit log entry when emergency access is invoked."""
        url = reverse("emergency-access-list")
        initial_audit_count = AuditLog.objects.filter(action="emergency_access_invoke").count()

        with patch("hmis.apps.core.emergency_access.views.send_emergency_access_escalation.delay"):
            authenticated_regular_client.post(
                url,
                {
                    "reason": EmergencyAccessReason.LIFE_THREATENING,
                    "reason_details": "Critical emergency situation.",
                    "duration_minutes": 60,
                },
                format="json",
            )

        assert (
            AuditLog.objects.filter(action="emergency_access_invoke").count()
            == initial_audit_count + 1
        )
        audit_log = AuditLog.objects.filter(action="emergency_access_invoke").latest("timestamp")
        assert audit_log.user == regular_user
        assert audit_log.resource_type == "EmergencyAccess"

    def test_list_own_emergency_access(
        self, authenticated_regular_client, regular_user, admin_user, db
    ):
        """Regular user should only see their own emergency access."""
        # Create access for regular user
        EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )
        # Create access for admin user
        EmergencyAccess.objects.create(
            user=admin_user,
            reason=EmergencyAccessReason.DISASTER_RESPONSE,
            reason_details="Disaster.",
            duration_minutes=60,
        )

        url = reverse("emergency-access-list")
        response = authenticated_regular_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        # Should only see their own
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["user"] == regular_user.id

    def test_admin_can_see_all_emergency_access(
        self, authenticated_admin_client, regular_user, admin_user, db
    ):
        """Admin should see all emergency access records."""
        EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )
        EmergencyAccess.objects.create(
            user=admin_user,
            reason=EmergencyAccessReason.DISASTER_RESPONSE,
            reason_details="Disaster.",
            duration_minutes=60,
        )

        url = reverse("emergency-access-list")
        response = authenticated_admin_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 2

    def test_review_approve_emergency_access(
        self, authenticated_admin_client, sample_emergency_access, db
    ):
        """Admin should be able to approve emergency access."""
        url = reverse("emergency-access-review", args=[sample_emergency_access.id])

        response = authenticated_admin_client.post(
            url,
            {"action": "approve", "notes": "Verified legitimate emergency."},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == EmergencyAccessStatus.REVIEWED

        # Check audit log
        audit_log = AuditLog.objects.filter(action="emergency_access_approved").latest("timestamp")
        assert audit_log.resource_id == sample_emergency_access.id

    def test_review_revoke_emergency_access(
        self, authenticated_admin_client, sample_emergency_access, db
    ):
        """Admin should be able to revoke emergency access."""
        url = reverse("emergency-access-review", args=[sample_emergency_access.id])

        response = authenticated_admin_client.post(
            url,
            {"action": "revoke", "notes": "Inappropriate access detected."},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == EmergencyAccessStatus.REVOKED

        # Check audit log
        audit_log = AuditLog.objects.filter(action="emergency_access_revoked").latest("timestamp")
        assert audit_log.resource_id == sample_emergency_access.id

    def test_regular_user_cannot_review(
        self, authenticated_regular_client, sample_emergency_access, admin_user, db
    ):
        """Regular user should not be able to review emergency access."""
        # Create another user's emergency access
        other_ea = EmergencyAccess.objects.create(
            user=admin_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )

        url = reverse("emergency-access-review", args=[other_ea.id])
        response = authenticated_regular_client.post(
            url,
            {"action": "approve", "notes": "Test"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_dashboard_stats_for_admin(
        self, authenticated_admin_client, sample_emergency_access, db
    ):
        """Admin should be able to get dashboard statistics."""
        url = reverse("emergency-access-dashboard-stats")
        response = authenticated_admin_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert "total_active" in response.data
        assert "total_pending_review" in response.data
        assert "total_today" in response.data
        assert "by_reason" in response.data
        assert "by_status" in response.data

    def test_dashboard_stats_forbidden_for_regular_user(self, authenticated_regular_client, db):
        """Regular user should not be able to access dashboard stats."""
        url = reverse("emergency-access-dashboard-stats")
        response = authenticated_regular_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_my_active_endpoint(self, authenticated_regular_client, regular_user, db):
        """Should return current user's active emergency access."""
        # Create active access
        EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=60,
        )
        # Create expired access
        expired = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.MEDICATION_EMERGENCY,
            reason_details="Medication emergency.",
            duration_minutes=1,
        )
        expired.expires_at = timezone.now() - timedelta(hours=1)
        expired.save()

        url = reverse("emergency-access-my-active")
        response = authenticated_regular_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["reason"] == EmergencyAccessReason.LIFE_THREATENING


# ============================================================================
# Task Tests
# ============================================================================


class TestEmergencyAccessTasks:
    """Tests for Emergency Access Celery tasks."""

    @patch("hmis.apps.core.sms_gateway.SMSGateway")
    @patch("hmis.apps.core.emergency_access.tasks.send_mail")
    def test_send_escalation_sends_email(
        self, mock_send_mail, mock_sms_class, sample_emergency_access, admin_user, db
    ):
        """Should send escalation email to admins."""
        from hmis.apps.core.emergency_access.tasks import send_emergency_access_escalation

        # Run the task synchronously
        result = send_emergency_access_escalation(sample_emergency_access.id)

        assert result["status"] == "success"
        mock_send_mail.assert_called_once()
        call_kwargs = mock_send_mail.call_args[1]
        assert "EMERGENCY ACCESS ALERT" in call_kwargs["message"]
        assert sample_emergency_access.user.username in call_kwargs["message"]

    @patch("hmis.apps.core.emergency_access.tasks.send_mail")
    def test_send_escalation_marks_sent(
        self, mock_send_mail, sample_emergency_access, admin_user, db
    ):
        """Should mark escalation_sent after sending."""
        from hmis.apps.core.emergency_access.tasks import send_emergency_access_escalation

        assert sample_emergency_access.escalation_sent is False

        send_emergency_access_escalation(sample_emergency_access.id)

        sample_emergency_access.refresh_from_db()
        assert sample_emergency_access.escalation_sent is True
        assert sample_emergency_access.escalation_sent_at is not None

    @patch("hmis.apps.core.emergency_access.tasks.send_mail")
    def test_send_escalation_skips_if_already_sent(
        self, mock_send_mail, sample_emergency_access, admin_user, db
    ):
        """Should skip if escalation already sent."""
        from hmis.apps.core.emergency_access.tasks import send_emergency_access_escalation

        sample_emergency_access.escalation_sent = True
        sample_emergency_access.save()

        result = send_emergency_access_escalation(sample_emergency_access.id)

        assert result["status"] == "skipped"
        mock_send_mail.assert_not_called()

    def test_expire_emergency_access_task(self, regular_user, db):
        """Should expire active records past their expiration time."""
        from hmis.apps.core.emergency_access.tasks import expire_emergency_access

        # Create expired but still ACTIVE record
        ea = EmergencyAccess.objects.create(
            user=regular_user,
            reason=EmergencyAccessReason.LIFE_THREATENING,
            reason_details="Emergency.",
            duration_minutes=1,
        )
        ea.expires_at = timezone.now() - timedelta(hours=1)
        ea.save()

        result = expire_emergency_access()

        assert result["expired_count"] >= 1
        ea.refresh_from_db()
        assert ea.status == EmergencyAccessStatus.EXPIRED
