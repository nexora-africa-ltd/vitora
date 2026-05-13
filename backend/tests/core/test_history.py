"""
Tests for model history tracking (django-simple-history).

Sprint 1.D: Audit & Integrity Enhancements (DHA Compliance)

Tests cover:
- History tracking on Patient, Encounter, Prescription, Diagnosis models
- Field-level change tracking via get_field_changes()
- History API endpoints
- HistoryMixin methods
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.contrib.auth.models import User
from rest_framework import status

from hmis.apps.core.history import (
    HistoryMixin,
    get_field_changes,
    get_full_history,
    get_history_diff,
)
from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code
from hmis.apps.patients.models import Patient
from hmis.apps.pharmacy.models import Prescription


@pytest.fixture
def history_user(db):
    """Create a user for history tracking tests."""
    return User.objects.create_user(
        username="history_test_user",
        password="test123",
        first_name="History",
        last_name="Tester",
    )


@pytest.fixture
def test_patient(db, sample_county, sample_sub_county, history_user, sample_organization):
    """Create a patient for testing history."""
    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1990, 5, 15),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        phone_number="0712345678",
        registered_by=history_user,
        organization=sample_organization,
    )


@pytest.fixture
def test_encounter(db, test_patient, history_user, sample_facility):
    """Create an encounter for testing history."""
    return Encounter.objects.create(
        patient=test_patient,
        encounter_type="OPD",
        encounter_date=date.today(),
        chief_complaint="Headache and fever",
        temperature=37.5,
        pulse=80,
        created_by=history_user,
        facility=sample_facility,
    )


@pytest.fixture
def icd10_code(db):
    """Create an ICD-10 code for testing."""
    return ICD10Code.objects.create(
        code="J18.9",
        description="Pneumonia, unspecified organism",
        chapter=10,  # Chapter X: Diseases of the respiratory system
        category="Pneumonia",
    )


class TestHistoryCreation:
    """Test that history records are created automatically."""

    def test_patient_history_created_on_save(self, test_patient):
        """Patient creation should create a history record."""
        assert test_patient.history.count() == 1
        history_record = test_patient.history.first()
        assert history_record.history_type == "+"  # Created
        assert history_record.first_name == "John"

    def test_patient_history_updated_on_change(self, test_patient):
        """Updating patient should create another history record."""
        test_patient.first_name = "Johnny"
        test_patient.save()

        assert test_patient.history.count() == 2
        latest_history = test_patient.history.first()
        assert latest_history.history_type == "~"  # Updated
        assert latest_history.first_name == "Johnny"

    def test_encounter_history_created_on_save(self, test_encounter):
        """Encounter creation should create a history record."""
        assert test_encounter.history.count() == 1
        history_record = test_encounter.history.first()
        assert history_record.history_type == "+"
        assert history_record.chief_complaint == "Headache and fever"

    def test_encounter_history_updated_on_change(self, test_encounter):
        """Updating encounter should create another history record."""
        test_encounter.chief_complaint = "Headache and high fever"
        test_encounter.temperature = 38.5
        test_encounter.save()

        assert test_encounter.history.count() == 2
        latest_history = test_encounter.history.first()
        assert latest_history.history_type == "~"
        assert latest_history.chief_complaint == "Headache and high fever"
        assert float(latest_history.temperature) == 38.5


class TestGetFieldChanges:
    """Test the get_field_changes utility function."""

    def test_detects_field_changes(self, test_patient):
        """Should detect which fields changed between versions."""
        # Update the patient
        test_patient.first_name = "Johnny"
        test_patient.phone_number = "0700999888"
        test_patient.save()

        history = list(test_patient.history.all())
        assert len(history) == 2

        changes = get_field_changes(history[1], history[0])

        assert "first_name" in changes
        assert changes["first_name"]["old"] == "John"
        assert changes["first_name"]["new"] == "Johnny"
        # Phase D: PII tracked via HMAC; get_field_changes maps hmac→logical name
        # but values are one-way hashes, so we just verify the change is detected
        assert "phone_number" in changes

    def test_ignores_excluded_fields(self, test_patient):
        """Should not include excluded fields like timestamps."""
        test_patient.first_name = "Jane"
        test_patient.save()

        history = list(test_patient.history.all())
        changes = get_field_changes(history[1], history[0])

        # These should be excluded by default
        assert "id" not in changes
        assert "history_id" not in changes
        assert "history_date" not in changes
        assert "created_at" not in changes
        assert "updated_at" not in changes

    def test_handles_null_old_record_for_creation(self, test_patient):
        """Should handle None old_record (creation case)."""
        history = test_patient.history.first()
        changes = get_field_changes(None, history)

        # Should show all non-null fields as new
        assert "first_name" in changes
        assert changes["first_name"]["old"] is None
        assert changes["first_name"]["new"] == "John"

    def test_handles_fk_changes(self, test_encounter, icd10_code, history_user):
        """Should handle foreign key changes."""
        # Create a diagnosis
        diagnosis = Diagnosis.objects.create(
            encounter=test_encounter,
            icd10_code=icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=history_user,
        )

        # Update it
        diagnosis.diagnosis_type = "SECONDARY"
        diagnosis.save()

        history = list(diagnosis.history.all())
        changes = get_field_changes(history[1], history[0])

        assert "diagnosis_type" in changes
        assert changes["diagnosis_type"]["old"] == "PRIMARY"
        assert changes["diagnosis_type"]["new"] == "SECONDARY"


class TestGetHistoryDiff:
    """Test the get_history_diff function."""

    def test_returns_diff_for_latest_version(self, test_patient):
        """Should return diff for the most recent version."""
        test_patient.first_name = "Jane"
        test_patient.save()

        diff = get_history_diff(test_patient)

        assert diff["version_id"] is not None
        assert diff["history_type"] == "~"
        assert "history_date" in diff
        assert "changes" in diff
        assert "first_name" in diff["changes"]

    def test_returns_diff_for_specific_version(self, test_patient):
        """Should return diff for a specific version."""
        test_patient.first_name = "Jane"
        test_patient.save()
        test_patient.last_name = "Smith"
        test_patient.save()

        # Get the middle version
        history = list(test_patient.history.all())
        middle_version_id = history[1].history_id

        diff = get_history_diff(test_patient, version_id=middle_version_id)

        assert diff["version_id"] == middle_version_id
        # Change should be first_name, not last_name
        assert "first_name" in diff["changes"]
        assert "last_name" not in diff["changes"]

    def test_raises_error_for_invalid_version_id(self, test_patient):
        """Should raise ValueError for nonexistent version."""
        with pytest.raises(ValueError, match="Version 999999 not found"):
            get_history_diff(test_patient, version_id=999999)

    def test_raises_error_for_model_without_history(self, db):
        """Should raise ValueError for model without history tracking."""
        icd10 = ICD10Code.objects.create(
            code="A00",
            description="Cholera",
            chapter=1,  # Chapter I: Certain infectious and parasitic diseases
            category="Intestinal infectious diseases",
        )

        with pytest.raises(ValueError, match="does not have history tracking enabled"):
            get_history_diff(icd10)


class TestGetFullHistory:
    """Test the get_full_history function."""

    def test_returns_all_versions(self, test_patient):
        """Should return all versions in reverse chronological order."""
        # Make several updates
        test_patient.first_name = "Jane"
        test_patient.save()
        test_patient.last_name = "Smith"
        test_patient.save()
        test_patient.phone_number = "0711111111"
        test_patient.save()

        history = get_full_history(test_patient)

        assert len(history) == 4  # 1 create + 3 updates
        # First item should be most recent
        assert history[0]["history_type"] == "updated"
        # Last item should be creation
        assert history[-1]["history_type"] == "created"

    def test_respects_limit(self, test_patient):
        """Should limit the number of versions returned."""
        # Make several updates
        for i in range(5):
            test_patient.phone_number = f"070000000{i}"
            test_patient.save()

        history = get_full_history(test_patient, limit=3)

        assert len(history) == 3

    def test_includes_user_info(self, test_patient, history_user):
        """Should include user info in history records."""
        # Update with a user (via middleware in real usage)
        test_patient.first_name = "UpdatedName"
        test_patient._history_user = history_user  # Simulate middleware
        test_patient.save()

        history = get_full_history(test_patient, limit=1)

        # Note: history_user may be None if middleware not active in tests
        assert "history_user" in history[0]
        assert "history_user_id" in history[0]


class TestHistoryMixin:
    """Test the HistoryMixin methods."""

    def test_get_last_changes(self, test_patient):
        """get_last_changes should return diff for latest version."""
        test_patient.first_name = "UpdatedFirst"
        test_patient.save()

        changes = test_patient.get_last_changes()

        assert "changes" in changes
        assert "first_name" in changes["changes"]

    def test_get_change_history(self, test_patient):
        """get_change_history should return full history."""
        test_patient.first_name = "Change1"
        test_patient.save()
        test_patient.first_name = "Change2"
        test_patient.save()

        history = test_patient.get_change_history()

        assert len(history) == 3

    def test_get_version_count(self, test_patient):
        """get_version_count should return number of versions."""
        count_before = test_patient.get_version_count()
        assert count_before == 1

        test_patient.first_name = "NewName"
        test_patient.save()

        count_after = test_patient.get_version_count()
        assert count_after == 2


class TestPrescriptionHistory:
    """Test history tracking on Prescription model."""

    @pytest.fixture
    def test_prescription(
        self, test_patient, test_encounter, history_user, sample_facility, sample_organization
    ):
        """Create a prescription for testing."""
        return Prescription.objects.create(
            patient=test_patient,
            encounter=test_encounter,
            prescribed_by=history_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            clinical_notes="Take with food",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_prescription_history_created(self, test_prescription):
        """Prescription should have history tracking."""
        assert test_prescription.history.count() == 1

    def test_prescription_status_change_tracked(self, test_prescription):
        """Status changes should be tracked."""
        test_prescription.status = "DISPENSED"
        test_prescription.save()

        history = list(test_prescription.history.all())
        changes = get_field_changes(history[1], history[0])

        assert "status" in changes
        assert changes["status"]["old"] == "PENDING"
        assert changes["status"]["new"] == "DISPENSED"


class TestDiagnosisHistory:
    """Test history tracking on Diagnosis model."""

    @pytest.fixture
    def test_diagnosis(self, test_encounter, icd10_code, history_user):
        """Create a diagnosis for testing."""
        return Diagnosis.objects.create(
            encounter=test_encounter,
            icd10_code=icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=history_user,
            notes="Initial diagnosis",
        )

    def test_diagnosis_history_created(self, test_diagnosis):
        """Diagnosis should have history tracking."""
        assert test_diagnosis.history.count() == 1

    def test_diagnosis_type_change_tracked(self, test_diagnosis):
        """Diagnosis type changes should be tracked."""
        test_diagnosis.diagnosis_type = "SECONDARY"
        test_diagnosis.save()

        history = list(test_diagnosis.history.all())
        changes = get_field_changes(history[1], history[0])

        assert "diagnosis_type" in changes
        assert changes["diagnosis_type"]["old"] == "PRIMARY"
        assert changes["diagnosis_type"]["new"] == "SECONDARY"

    def test_notes_update_tracked(self, test_diagnosis):
        """Notes updates should be tracked."""
        test_diagnosis.notes = "Updated diagnosis notes"
        test_diagnosis.save()

        changes = test_diagnosis.get_last_changes()

        assert "notes" in changes["changes"]


class TestHistoryAPIEndpoints:
    """Test the history API endpoints."""

    def test_patient_history_endpoint(self, authenticated_client, test_patient):
        """GET /api/patients/{id}/history/ should return history."""
        # Update patient to create history
        test_patient.first_name = "UpdatedName"
        test_patient.save()

        response = authenticated_client.get(f"/api/patients/{test_patient.id}/history/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2
        assert "version_id" in response.data[0]
        assert "changes" in response.data[0]

    def test_patient_history_count_endpoint(self, authenticated_client, test_patient):
        """GET /api/patients/{id}/history-count/ should return count."""
        response = authenticated_client.get(f"/api/patients/{test_patient.id}/history-count/")

        assert response.status_code == status.HTTP_200_OK
        assert "count" in response.data
        assert response.data["count"] >= 1

    def test_encounter_history_endpoint(self, authenticated_client, test_encounter):
        """GET /api/encounters/{id}/history/ should return history."""
        # Update encounter to create history
        test_encounter.chief_complaint = "Updated complaint"
        test_encounter.save()

        response = authenticated_client.get(f"/api/encounters/{test_encounter.id}/history/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2

    def test_history_with_limit_param(self, authenticated_client, test_patient):
        """History endpoint should respect limit parameter."""
        # Create multiple updates
        for i in range(5):
            test_patient.phone_number = f"070000000{i}"
            test_patient.save()

        response = authenticated_client.get(f"/api/patients/{test_patient.id}/history/?limit=3")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3

    def test_history_requires_authentication(self, api_client, test_patient):
        """History endpoint should require authentication."""
        response = api_client.get(f"/api/patients/{test_patient.id}/history/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestHistoryAuditIntegration:
    """Test that history access is logged in audit trail."""

    def test_history_view_creates_audit_log(self, authenticated_client, test_patient):
        """Viewing history should create an audit log entry."""
        from hmis.apps.core.models import AuditLog

        # Count existing logs
        initial_count = AuditLog.objects.filter(action="view_history").count()

        # Access history
        authenticated_client.get(f"/api/patients/{test_patient.id}/history/")

        # Verify audit log created
        final_count = AuditLog.objects.filter(action="view_history").count()
        assert final_count == initial_count + 1

        # Check audit log details
        log = AuditLog.objects.filter(action="view_history").latest("timestamp")
        assert log.resource_type == "Patient"
        assert log.resource_id == test_patient.id
