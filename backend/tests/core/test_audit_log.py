"""
Tests for audit logging system.

Following TDD approach: Write tests FIRST, then implement.
Sprint 0.4: Security Baseline

The audit logging system tracks:
- User actions (create, read, update, delete)
- Access to sensitive data
- Authentication events (login, logout, failed attempts)
- System events (for Kenya Data Protection Act compliance)
"""

from datetime import datetime

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def api_client():
    """Provide Django REST framework API client."""
    return APIClient()


@pytest.fixture
def test_user(db, sample_organization, sample_facility):
    """Create a test user."""
    from tests.conftest import ensure_staff_profile

    user = User.objects.create_user(
        username="audituser",
        email="audit@example.com",
        password="auditpassword123",
    )
    ensure_staff_profile(user, sample_organization, sample_facility, employee_id="AUDIT-001")
    return user


@pytest.fixture
def sample_patient(db, sample_organization, sample_facility):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Audit",
        last_name="TestPatient",
        date_of_birth="1990-01-15",
        gender="M",
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


# ============================================================================
# Audit Log Model Tests
# ============================================================================


@pytest.mark.django_db
class TestAuditLogModel:
    """Tests for the AuditLog model."""

    def test_audit_log_creation(self, test_user, db):
        """
        Test that audit log entries can be created.

        GIVEN valid audit log data
        WHEN creating an audit log entry
        THEN the entry should be saved successfully
        """
        from hmis.apps.core.models import AuditLog

        log = AuditLog.objects.create(
            user=test_user,
            action="patient_view",
            resource_type="Patient",
            resource_id=1,
            ip_address="192.168.1.1",
            user_agent="Mozilla/5.0",
            details={"patient_mrn": "MRN-20251228-0001"},
        )

        assert log.id is not None
        assert log.user == test_user
        assert log.action == "patient_view"
        assert log.timestamp is not None

    def test_audit_log_timestamp_auto_generated(self, test_user, db):
        """
        Test that timestamp is automatically set on creation.

        GIVEN an audit log entry without timestamp
        WHEN saving the entry
        THEN timestamp should be auto-generated
        """
        from hmis.apps.core.models import AuditLog

        log = AuditLog.objects.create(
            user=test_user,
            action="test_action",
            resource_type="TestResource",
        )

        assert log.timestamp is not None
        assert log.timestamp <= datetime.now(log.timestamp.tzinfo)

    def test_audit_log_stores_ip_address(self, test_user, db):
        """
        Test that IP address is stored correctly.

        GIVEN an audit log with IP address
        WHEN saving the entry
        THEN IP address should be retrievable
        """
        from hmis.apps.core.models import AuditLog

        log = AuditLog.objects.create(
            user=test_user,
            action="login",
            resource_type="User",
            ip_address="10.0.0.1",
        )

        assert log.ip_address == "10.0.0.1"

    def test_audit_log_can_be_anonymous(self, db):
        """
        Test that audit logs can be created for anonymous users.

        GIVEN an audit log without user (anonymous action)
        WHEN saving the entry
        THEN the entry should be saved with null user
        """
        from hmis.apps.core.models import AuditLog

        log = AuditLog.objects.create(
            action="failed_login",
            resource_type="User",
            ip_address="192.168.1.100",
            details={"username": "unknown_user"},
        )

        assert log.id is not None
        assert log.user is None


# ============================================================================
# Patient Audit Tests
# ============================================================================


@pytest.mark.django_db
class TestPatientAuditLogs:
    """Tests for patient-related audit logs."""

    def test_patient_creation_is_logged(
        self, api_client, test_user, sample_county, sample_sub_county, db
    ):
        """
        Test that patient creation generates an audit log.

        GIVEN an authenticated user
        WHEN creating a new patient
        THEN an audit log entry should be created
        """
        from hmis.apps.core.models import AuditLog

        api_client.force_authenticate(user=test_user)
        url = reverse("patient-list")
        data = {
            "first_name": "New",
            "last_name": "Patient",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        initial_count = AuditLog.objects.filter(action="patient_create").count()

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        final_count = AuditLog.objects.filter(action="patient_create").count()
        assert final_count == initial_count + 1

        # Verify log details
        log = AuditLog.objects.filter(action="patient_create").latest("timestamp")
        assert log.user == test_user
        assert log.resource_type == "Patient"

    def test_patient_view_is_logged(self, api_client, test_user, sample_patient):
        """
        Test that viewing a patient generates an audit log.

        GIVEN an existing patient
        WHEN a user views the patient details
        THEN an audit log entry should be created
        """
        from hmis.apps.core.models import AuditLog

        api_client.force_authenticate(user=test_user)
        url = reverse("patient-detail", kwargs={"pk": sample_patient.id})

        initial_count = AuditLog.objects.filter(action="patient_view").count()

        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK

        final_count = AuditLog.objects.filter(action="patient_view").count()
        assert final_count == initial_count + 1

    def test_patient_update_is_logged(self, api_client, test_user, sample_patient):
        """
        Test that patient updates generate audit logs.

        GIVEN an existing patient
        WHEN a user updates the patient
        THEN an audit log entry should be created with changes
        """
        from hmis.apps.core.models import AuditLog

        api_client.force_authenticate(user=test_user)
        url = reverse("patient-detail", kwargs={"pk": sample_patient.id})
        data = {"phone_number": "+254722222222"}

        initial_count = AuditLog.objects.filter(action="patient_update").count()

        response = api_client.patch(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        final_count = AuditLog.objects.filter(action="patient_update").count()
        assert final_count == initial_count + 1

        # Verify log includes changed fields
        log = AuditLog.objects.filter(action="patient_update").latest("timestamp")
        assert "phone_number" in str(log.details)

    def test_patient_delete_is_logged(self, api_client, test_user, sample_patient):
        """
        Test that patient deletion generates audit logs.

        GIVEN an existing patient
        WHEN a user deletes the patient
        THEN an audit log entry should be created
        """
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Permission

        from hmis.apps.core.models import AuditLog

        User = get_user_model()
        perm = Permission.objects.get(codename="delete_patient")
        test_user.user_permissions.add(perm)
        test_user = User.objects.get(pk=test_user.pk)
        api_client.force_authenticate(user=test_user)
        url = reverse("patient-detail", kwargs={"pk": sample_patient.id})

        initial_count = AuditLog.objects.filter(action="patient_delete").count()
        patient_id = sample_patient.id

        response = api_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT

        final_count = AuditLog.objects.filter(action="patient_delete").count()
        assert final_count == initial_count + 1

        # Verify log includes deleted patient ID
        log = AuditLog.objects.filter(action="patient_delete").latest("timestamp")
        assert log.resource_id == patient_id


# ============================================================================
# Authentication Audit Tests
# ============================================================================


@pytest.mark.django_db
class TestAuthenticationAuditLogs:
    """Tests for authentication-related audit logs."""

    def test_successful_login_is_logged(self, api_client, test_user):
        """
        Test that successful logins are logged.

        GIVEN valid user credentials
        WHEN user logs in successfully
        THEN an audit log entry should be created
        """
        from hmis.apps.core.models import AuditLog

        url = reverse("token_obtain_pair")
        data = {"username": "audituser", "password": "auditpassword123"}

        initial_count = AuditLog.objects.filter(action="login_success").count()

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        final_count = AuditLog.objects.filter(action="login_success").count()
        assert final_count == initial_count + 1

        log = AuditLog.objects.filter(action="login_success").latest("timestamp")
        assert log.user == test_user

    def test_failed_login_is_logged(self, api_client, test_user):
        """
        Test that failed login attempts are logged.

        GIVEN invalid password
        WHEN user attempts to login
        THEN an audit log entry should be created for the failed attempt
        """
        from hmis.apps.core.models import AuditLog

        url = reverse("token_obtain_pair")
        data = {"username": "audituser", "password": "wrongpassword"}

        initial_count = AuditLog.objects.filter(action="login_failed").count()

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        final_count = AuditLog.objects.filter(action="login_failed").count()
        assert final_count == initial_count + 1

        log = AuditLog.objects.filter(action="login_failed").latest("timestamp")
        assert log.details.get("username") == "audituser"

    def test_nonexistent_user_login_attempt_is_logged(self, api_client, db):
        """
        Test that login attempts with non-existent username are logged.

        GIVEN non-existent username
        WHEN attempting to login
        THEN an audit log entry should be created
        """
        from hmis.apps.core.models import AuditLog

        url = reverse("token_obtain_pair")
        data = {"username": "nonexistent_user", "password": "somepassword"}

        response = api_client.post(url, data, format="json")

        assert AuditLog.objects.filter(
            action="login_failed",
            details__username="nonexistent_user",
        ).exists()


# ============================================================================
# Audit Log Query Tests
# ============================================================================


@pytest.mark.django_db
class TestAuditLogQueries:
    """Tests for querying audit logs."""

    def test_filter_audit_logs_by_user(self, test_user, db):
        """
        Test that audit logs can be filtered by user.

        GIVEN multiple audit log entries for different users
        WHEN filtering by specific user
        THEN only that user's logs should be returned
        """
        from hmis.apps.core.models import AuditLog

        other_user = User.objects.create_user(
            username="otheruser",
            password="otherpassword",
        )

        # Create logs for test_user
        AuditLog.objects.create(
            user=test_user,
            action="action1",
            resource_type="Test",
        )
        AuditLog.objects.create(
            user=test_user,
            action="action2",
            resource_type="Test",
        )

        # Create log for other_user
        AuditLog.objects.create(
            user=other_user,
            action="action3",
            resource_type="Test",
        )

        user_logs = AuditLog.objects.filter(user=test_user)
        assert user_logs.count() == 2

    def test_filter_audit_logs_by_action(self, test_user, db):
        """
        Test that audit logs can be filtered by action type.

        GIVEN multiple audit log entries with different actions
        WHEN filtering by specific action
        THEN only matching logs should be returned
        """
        from hmis.apps.core.models import AuditLog

        AuditLog.objects.create(
            user=test_user,
            action="patient_create",
            resource_type="Patient",
        )
        AuditLog.objects.create(
            user=test_user,
            action="patient_view",
            resource_type="Patient",
        )
        AuditLog.objects.create(
            user=test_user,
            action="patient_create",
            resource_type="Patient",
        )

        create_logs = AuditLog.objects.filter(action="patient_create")
        assert create_logs.count() == 2

    def test_filter_audit_logs_by_date_range(self, test_user, db):
        """
        Test that audit logs can be filtered by date range.

        GIVEN audit logs from different dates
        WHEN filtering by date range
        THEN only logs within range should be returned
        """
        from datetime import timedelta

        from django.utils import timezone

        from hmis.apps.core.models import AuditLog

        # Create log entries with explicit timestamp
        now = timezone.now()
        AuditLog.objects.create(
            user=test_user,
            action="test_action",
            resource_type="Test",
            timestamp=now,
        )

        # Filter by date range (today +/- 1 day to handle timezone issues)
        start_date = now - timedelta(days=1)
        end_date = now + timedelta(days=1)
        logs = AuditLog.objects.filter(timestamp__gte=start_date, timestamp__lte=end_date)

        assert logs.count() >= 1

    def test_audit_log_ordering(self, test_user, db):
        """
        Test that audit logs are ordered by timestamp descending.

        GIVEN multiple audit log entries
        WHEN querying logs
        THEN they should be ordered by timestamp (newest first)
        """
        import time

        from hmis.apps.core.models import AuditLog

        log1 = AuditLog.objects.create(
            user=test_user,
            action="first",
            resource_type="Test",
        )
        time.sleep(0.01)  # Small delay to ensure different timestamps
        log2 = AuditLog.objects.create(
            user=test_user,
            action="second",
            resource_type="Test",
        )

        logs = AuditLog.objects.all().order_by("-timestamp")
        assert logs[0].action == "second"


# ============================================================================
# Audit Log API Tests
# ============================================================================


@pytest.mark.django_db
class TestAuditLogAPI:
    """Tests for audit log API endpoints."""

    def test_admin_can_view_audit_logs(self, api_client, db):
        """
        Test that admin users can view audit logs.

        GIVEN an admin user
        WHEN accessing audit log endpoint
        THEN logs should be returned
        """
        from hmis.apps.core.models import AuditLog

        admin = User.objects.create_superuser(
            username="auditadmin",
            email="auditadmin@example.com",
            password="adminpassword123",
        )

        AuditLog.objects.create(
            user=admin,
            action="test_action",
            resource_type="Test",
        )

        api_client.force_authenticate(user=admin)
        url = reverse("auditlog-list")

        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    def test_non_admin_can_view_only_their_own_audit_logs(self, api_client, test_user, db):
        """
        Test that non-admin users can only view their own audit logs.

        GIVEN a non-admin user
        WHEN accessing audit log endpoint
        THEN only their own logs should be returned
        """
        from hmis.apps.core.models import AuditLog

        org = test_user.staff_profile.organization

        other_user = User.objects.create_user(
            username="otheraudituser",
            email="otheraudit@example.com",
            password="password123",
        )
        own_log = AuditLog.objects.create(
            user=test_user,
            action="patient_view",
            resource_type="Patient",
            organization=org,
        )
        AuditLog.objects.create(
            user=other_user,
            action="patient_update",
            resource_type="Patient",
            organization=org,
        )

        api_client.force_authenticate(user=test_user)
        url = reverse("auditlog-list")

        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["id"] == own_log.id

    def test_audit_logs_are_read_only(self, api_client, db):
        """
        Test that audit logs cannot be modified via API.

        GIVEN an admin user
        WHEN attempting to delete an audit log
        THEN operation should be denied
        """
        from hmis.apps.core.models import AuditLog

        admin = User.objects.create_superuser(
            username="auditadmin2",
            email="auditadmin2@example.com",
            password="adminpassword123",
        )

        log = AuditLog.objects.create(
            user=admin,
            action="test_action",
            resource_type="Test",
        )

        api_client.force_authenticate(user=admin)
        url = reverse("auditlog-detail", kwargs={"pk": log.id})

        response = api_client.delete(url)

        # Audit logs should not be deletable
        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        ]


# ============================================================================
# Kenya Data Protection Act Compliance Tests
# ============================================================================


@pytest.mark.django_db
class TestKenyaDPACompliance:
    """Tests for Kenya Data Protection Act compliance in audit logging."""

    def test_audit_log_captures_data_subject_access(self, api_client, test_user, sample_patient):
        """
        Test that data subject (patient) access is logged per Kenya DPA.

        GIVEN a patient record
        WHEN their data is accessed
        THEN the access must be logged with timestamp and accessor identity
        """
        from hmis.apps.core.models import AuditLog

        api_client.force_authenticate(user=test_user)
        url = reverse("patient-detail", kwargs={"pk": sample_patient.id})

        response = api_client.get(url)

        log = AuditLog.objects.filter(
            action="patient_view",
            resource_id=sample_patient.id,
        ).latest("timestamp")

        # Required for DPA compliance
        assert log.user is not None  # Who accessed
        assert log.timestamp is not None  # When accessed
        assert log.resource_id == sample_patient.id  # What was accessed

    def test_audit_log_includes_purpose_of_processing(self, test_user, db):
        """
        Test that audit logs can include processing purpose.

        GIVEN an audit log entry
        WHEN storing the entry
        THEN it should support purpose/reason field
        """
        from hmis.apps.core.models import AuditLog

        log = AuditLog.objects.create(
            user=test_user,
            action="patient_view",
            resource_type="Patient",
            resource_id=1,
            details={
                "purpose": "Clinical consultation",
                "legal_basis": "Legitimate interest - healthcare provision",
            },
        )

        assert log.details.get("purpose") == "Clinical consultation"

    def test_audit_retention_period(self, db):
        """
        Test that audit logs respect retention period (7 years per DPA).

        This test documents the requirement rather than enforcing deletion,
        as deletion would be handled by a scheduled task.
        """
        from hmis.apps.core.models import AuditLog

        # Verify that old logs are queryable (for the 7-year period)
        # In production, a scheduled task would archive/delete logs > 7 years
        # Create a log entry
        log = AuditLog.objects.create(
            action="retention_test",
            resource_type="Test",
        )

        # Verify it can be queried
        assert AuditLog.objects.filter(id=log.id).exists()

        # Note: Actual retention enforcement would be via management command
