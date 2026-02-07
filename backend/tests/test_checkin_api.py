"""
Tests for patient check-in API endpoints.

Sprint: Returning Patient Workflow - Sprint 1, Phase 1A
TDD: RED Phase - Writing tests before implementation.

These tests cover:
1. Patient lookup with clinical snapshot
2. Patient check-in to triage/clinic
3. Today's check-ins list for front desk
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework import status

# ============================================================================
# Patient Lookup Tests
# ============================================================================


class TestPatientLookupAPI:
    """Tests for patient lookup endpoint with clinical snapshot."""

    # -------------------------------------------------------------------------
    # Basic Lookup Tests
    # -------------------------------------------------------------------------

    def test_lookup_patient_by_mrn(self, authenticated_client, sample_patient):
        """
        GIVEN a patient exists in the system
        WHEN looking up by MRN
        THEN should return the patient with clinical snapshot
        """
        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": sample_patient.mrn},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mrn"] == sample_patient.mrn
        assert response.data["first_name"] == sample_patient.first_name
        assert response.data["last_name"] == sample_patient.last_name
        # Clinical snapshot should be present
        assert "clinical_snapshot" in response.data

    def test_lookup_patient_by_phone(self, authenticated_client, sample_patient_with_phone):
        """
        GIVEN a patient exists with phone number
        WHEN looking up by phone number
        THEN should return the patient
        """
        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": sample_patient_with_phone.phone_number},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_patient_with_phone.id

    def test_lookup_patient_by_national_id(
        self, authenticated_client, sample_patient_with_national_id
    ):
        """
        GIVEN a patient exists with national ID
        WHEN looking up by national ID
        THEN should return the patient
        """
        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": sample_patient_with_national_id.identification_number},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_patient_with_national_id.id

    def test_lookup_patient_by_partial_name(self, authenticated_client, sample_patient):
        """
        GIVEN a patient exists
        WHEN looking up by partial name
        THEN should return matching patients
        """
        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": sample_patient.first_name[:3]},
        )

        assert response.status_code == status.HTTP_200_OK
        # For partial name search, may return list
        assert response.data["id"] == sample_patient.id

    def test_lookup_patient_not_found(self, authenticated_client):
        """
        GIVEN no matching patient exists
        WHEN looking up by non-existent identifier
        THEN should return 404
        """
        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": "MRN-NONEXISTENT-0000"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_lookup_requires_query(self, authenticated_client):
        """
        GIVEN no query parameter
        WHEN calling lookup endpoint
        THEN should return 400
        """
        response = authenticated_client.get("/api/checkin/lookup/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "q" in str(response.data).lower() or "query" in str(response.data).lower()

    def test_lookup_requires_authentication(self, api_client, sample_patient):
        """
        GIVEN an unauthenticated client
        WHEN calling lookup endpoint
        THEN should return 401
        """
        response = api_client.get(
            "/api/checkin/lookup/",
            {"q": sample_patient.mrn},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # -------------------------------------------------------------------------
    # Clinical Snapshot Tests
    # -------------------------------------------------------------------------

    def test_lookup_includes_clinical_snapshot(
        self, authenticated_client, sample_patient_with_encounters
    ):
        """
        GIVEN a patient with encounter history
        WHEN looking up the patient
        THEN should include clinical snapshot with relevant data
        """
        patient = sample_patient_with_encounters

        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": patient.mrn},
        )

        assert response.status_code == status.HTTP_200_OK
        snapshot = response.data["clinical_snapshot"]

        # Snapshot should have expected fields
        assert "allergies" in snapshot
        assert "active_conditions" in snapshot
        assert "current_medications" in snapshot
        assert "last_visit_date" in snapshot
        assert "last_visit_clinic" in snapshot
        assert "pending_results" in snapshot
        assert "alerts" in snapshot

    def test_lookup_includes_last_visit_info(
        self, authenticated_client, sample_patient_with_recent_visit
    ):
        """
        GIVEN a patient with recent visit
        WHEN looking up the patient
        THEN should include last visit information
        """
        patient, last_encounter = sample_patient_with_recent_visit

        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": patient.mrn},
        )

        assert response.status_code == status.HTTP_200_OK
        snapshot = response.data["clinical_snapshot"]
        assert snapshot["last_visit_date"] is not None

    def test_lookup_includes_allergy_alerts(
        self, authenticated_client, sample_patient_with_allergies
    ):
        """
        GIVEN a patient with known allergies
        WHEN looking up the patient
        THEN should include allergy information in snapshot
        """
        patient = sample_patient_with_allergies

        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": patient.mrn},
        )

        assert response.status_code == status.HTTP_200_OK
        snapshot = response.data["clinical_snapshot"]
        assert len(snapshot["allergies"]) > 0
        # Should have alert for allergies
        assert any("allergy" in alert.lower() for alert in snapshot["alerts"])

    def test_lookup_includes_pending_results(
        self, authenticated_client, sample_patient_with_pending_labs
    ):
        """
        GIVEN a patient with pending lab results
        WHEN looking up the patient
        THEN should include pending results in snapshot
        """
        patient = sample_patient_with_pending_labs

        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": patient.mrn},
        )

        assert response.status_code == status.HTTP_200_OK
        snapshot = response.data["clinical_snapshot"]
        assert len(snapshot["pending_results"]) > 0

    def test_lookup_includes_visit_context(
        self, authenticated_client, sample_patient_with_chronic_conditions
    ):
        """
        GIVEN a patient with chronic conditions
        WHEN looking up the patient
        THEN should include suggested visit context
        """
        patient = sample_patient_with_chronic_conditions

        response = authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": patient.mrn},
        )

        assert response.status_code == status.HTTP_200_OK
        # Should suggest visit type based on history
        assert "suggested_visit_type" in response.data
        assert "suggested_visit_reason" in response.data
        # Returning patient with chronic conditions gets appropriate type
        assert response.data["suggested_visit_type"] in ["RETURN", "FOLLOW_UP"]


# ============================================================================
# Patient Check-in Tests
# ============================================================================


class TestPatientCheckinAPI:
    """Tests for patient check-in endpoint."""

    # -------------------------------------------------------------------------
    # Basic Check-in Tests
    # -------------------------------------------------------------------------

    def test_checkin_to_triage(
        self, authenticated_client, sample_patient
    ):
        """
        GIVEN a valid patient
        WHEN checking in to triage
        THEN should create check-in and return queue info
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "visit_reason": "FOLLOW_UP",
                "notes": "Monthly DM/HTN review",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "checkin_id" in response.data
        assert "queue_position" in response.data
        assert response.data["destination"] == "TRIAGE"

    def test_checkin_to_specific_clinic(
        self, authenticated_client, sample_patient, sample_clinic
    ):
        """
        GIVEN a valid patient and clinic
        WHEN checking in directly to clinic (skip triage)
        THEN should create check-in for that clinic
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": sample_clinic.id,
                "visit_reason": "REFILL_ONLY",
                "skip_triage": True,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["destination_clinic_id"] == sample_clinic.id
        assert response.data["skip_triage"] is True

    def test_checkin_auto_detects_returning_patient(
        self, authenticated_client, sample_patient_with_recent_visit
    ):
        """
        GIVEN a patient with previous visits
        WHEN checking in
        THEN should auto-detect as returning patient
        """
        patient, _ = sample_patient_with_recent_visit

        response = authenticated_client.post(
            f"/api/checkin/patients/{patient.id}/checkin/",
            {
                "destination": "TRIAGE",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Patient with recent visit (within 30 days) should be detected as FOLLOW_UP
        # Otherwise RETURN for returning patients
        assert response.data["visit_type"] in ["RETURN", "FOLLOW_UP"]

    def test_checkin_creates_encounter(
        self, authenticated_client, sample_patient
    ):
        """
        GIVEN a valid patient
        WHEN checking in
        THEN should create an encounter record
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "chief_complaint": "Routine checkup",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "encounter_id" in response.data
        assert response.data["encounter_id"] is not None

    def test_checkin_links_to_waiting_queue(
        self, authenticated_client, sample_patient
    ):
        """
        GIVEN a valid patient checking in to triage
        WHEN check-in is processed
        THEN should add patient to waiting queue
        """
        from hmis.apps.triage.models import WaitingQueue

        initial_count = WaitingQueue.objects.filter(patient=sample_patient).count()

        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "TRIAGE",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        final_count = WaitingQueue.objects.filter(patient=sample_patient).count()
        assert final_count == initial_count + 1

    def test_checkin_links_to_clinic_visit(
        self, authenticated_client, sample_patient, sample_clinic
    ):
        """
        GIVEN a valid patient checking in to clinic
        WHEN check-in is processed
        THEN should create clinic visit queue entry
        """
        from hmis.apps.clinics.models import ClinicVisit

        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": sample_clinic.id,
                "skip_triage": True,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "clinic_visit_id" in response.data
        
        # Verify clinic visit was created
        clinic_visit = ClinicVisit.objects.get(id=response.data["clinic_visit_id"])
        assert clinic_visit.patient == sample_patient

    def test_checkin_requires_authentication(self, api_client, sample_patient):
        """
        GIVEN an unauthenticated request
        WHEN checking in a patient
        THEN should return 401
        """
        response = api_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {"destination": "TRIAGE"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_checkin_invalid_patient(self, authenticated_client):
        """
        GIVEN a non-existent patient ID
        WHEN checking in
        THEN should return 404
        """
        response = authenticated_client.post(
            "/api/checkin/patients/99999/checkin/",
            {"destination": "TRIAGE"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_checkin_requires_destination(self, authenticated_client, sample_patient):
        """
        GIVEN no destination specified
        WHEN checking in
        THEN should return 400
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "destination" in str(response.data).lower()

    def test_checkin_invalid_clinic_destination(self, authenticated_client, sample_patient):
        """
        GIVEN an invalid clinic ID as destination
        WHEN checking in
        THEN should return 400
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {"destination": 99999},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # -------------------------------------------------------------------------
    # Duplicate Check-in Prevention Tests
    # -------------------------------------------------------------------------

    def test_checkin_warns_if_already_checked_in_today(
        self, authenticated_client, sample_patient_checked_in_today
    ):
        """
        GIVEN a patient already checked in today
        WHEN checking in again
        THEN should return warning but allow
        """
        patient = sample_patient_checked_in_today

        response = authenticated_client.post(
            f"/api/checkin/patients/{patient.id}/checkin/",
            {
                "destination": "TRIAGE",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "warning" in response.data
        assert "already" in response.data["warning"].lower()

    # -------------------------------------------------------------------------
    # Visit Type Auto-Detection Tests
    # -------------------------------------------------------------------------

    def test_checkin_new_patient_gets_new_visit_type(
        self, authenticated_client, sample_patient_no_history
    ):
        """
        GIVEN a patient with no previous visits
        WHEN checking in
        THEN should set visit_type to NEW
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient_no_history.id}/checkin/",
            {"destination": "TRIAGE"},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["visit_type"] == "NEW"

    def test_checkin_can_override_visit_type(
        self, authenticated_client, sample_patient_with_recent_visit
    ):
        """
        GIVEN a returning patient
        WHEN checking in with explicit visit_type
        THEN should use provided visit_type
        """
        patient, _ = sample_patient_with_recent_visit

        response = authenticated_client.post(
            f"/api/checkin/patients/{patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "visit_type": "EMERGENCY",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["visit_type"] == "EMERGENCY"

    # -------------------------------------------------------------------------
    # Skip Triage Logic Tests
    # -------------------------------------------------------------------------

    def test_checkin_skip_triage_for_refill(
        self, authenticated_client, sample_patient, sample_pharmacy_clinic
    ):
        """
        GIVEN a refill-only visit reason
        WHEN checking in
        THEN should skip triage
        """
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": sample_pharmacy_clinic.id,
                "visit_reason": "REFILL_ONLY",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["skip_triage"] is True

    def test_checkin_skip_triage_for_lab_review(
        self, authenticated_client, sample_patient_with_pending_labs, sample_lab_clinic
    ):
        """
        GIVEN a patient with pending lab results
        WHEN checking in for lab review
        THEN should skip triage
        """
        patient = sample_patient_with_pending_labs

        response = authenticated_client.post(
            f"/api/checkin/patients/{patient.id}/checkin/",
            {
                "destination": sample_lab_clinic.id,
                "visit_reason": "LAB_REVIEW",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["skip_triage"] is True

    # -------------------------------------------------------------------------
    # Linked Encounter Tests
    # -------------------------------------------------------------------------

    def test_checkin_follow_up_links_previous_encounter(
        self, authenticated_client, sample_patient_with_recent_visit
    ):
        """
        GIVEN a patient with recent encounter
        WHEN checking in as follow-up
        THEN should link to previous encounter
        """
        patient, prev_encounter = sample_patient_with_recent_visit

        response = authenticated_client.post(
            f"/api/checkin/patients/{patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "visit_reason": "FOLLOW_UP",
                "linked_encounter_id": prev_encounter.id,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data.get("linked_encounter_id") == prev_encounter.id


# ============================================================================
# Today's Check-ins List Tests
# ============================================================================


class TestTodayCheckinsAPI:
    """Tests for today's check-ins list endpoint."""

    def test_list_today_checkins(self, authenticated_client, sample_checkins_today):
        """
        GIVEN several check-ins today
        WHEN listing today's check-ins
        THEN should return all check-ins from today
        """
        response = authenticated_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == len(sample_checkins_today)

    def test_checkins_ordered_by_time(self, authenticated_client, sample_checkins_today):
        """
        GIVEN several check-ins today
        WHEN listing today's check-ins
        THEN should be ordered by check-in time (newest first)
        """
        response = authenticated_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_200_OK
        times = [c["checked_in_at"] for c in response.data["results"]]
        assert times == sorted(times, reverse=True)

    def test_checkins_include_patient_info(self, authenticated_client, sample_checkins_today):
        """
        GIVEN check-ins today
        WHEN listing today's check-ins
        THEN should include patient name and MRN
        """
        response = authenticated_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_200_OK
        first_checkin = response.data["results"][0]
        assert "patient_name" in first_checkin
        assert "patient_mrn" in first_checkin

    def test_checkins_include_destination(self, authenticated_client, sample_checkins_today):
        """
        GIVEN check-ins today
        WHEN listing today's check-ins
        THEN should include destination info
        """
        response = authenticated_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_200_OK
        first_checkin = response.data["results"][0]
        assert "destination" in first_checkin

    def test_checkins_excludes_yesterday(
        self, authenticated_client, sample_checkins_today, sample_checkin_yesterday
    ):
        """
        GIVEN check-ins from today and yesterday
        WHEN listing today's check-ins
        THEN should only include today's check-ins
        """
        response = authenticated_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_200_OK
        checkin_ids = [c["id"] for c in response.data["results"]]
        assert sample_checkin_yesterday.id not in checkin_ids

    def test_checkins_empty_list(self, authenticated_client):
        """
        GIVEN no check-ins today
        WHEN listing today's check-ins
        THEN should return empty list
        """
        response = authenticated_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"] == []

    def test_checkins_requires_authentication(self, api_client):
        """
        GIVEN unauthenticated request
        WHEN listing today's check-ins
        THEN should return 401
        """
        response = api_client.get("/api/checkin/today/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_checkins_filter_by_destination(
        self, authenticated_client, sample_checkins_today, sample_clinic
    ):
        """
        GIVEN check-ins to different destinations
        WHEN filtering by destination
        THEN should return only matching check-ins
        """
        response = authenticated_client.get(
            "/api/checkin/today/",
            {"destination_clinic": sample_clinic.id},
        )

        assert response.status_code == status.HTTP_200_OK
        for checkin in response.data["results"]:
            assert checkin.get("destination_clinic_id") == sample_clinic.id

    def test_checkins_filter_by_status(self, authenticated_client, sample_checkins_today):
        """
        GIVEN check-ins with different statuses
        WHEN filtering by status
        THEN should return only matching check-ins
        """
        response = authenticated_client.get(
            "/api/checkin/today/",
            {"status": "WAITING"},
        )

        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Audit Logging Tests
# ============================================================================


class TestCheckinAuditLogging:
    """Tests for audit logging of check-in actions."""

    def test_checkin_logs_audit(self, authenticated_client, sample_patient):
        """
        GIVEN a check-in action
        WHEN check-in is completed
        THEN should create audit log entry
        """
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.filter(action="patient_checkin").count()

        authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {"destination": "TRIAGE"},
        )

        final_count = AuditLog.objects.filter(action="patient_checkin").count()
        assert final_count == initial_count + 1

    def test_lookup_logs_audit(self, authenticated_client, sample_patient):
        """
        GIVEN a patient lookup action
        WHEN lookup is completed
        THEN should create audit log entry
        """
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.filter(action="patient_lookup").count()

        authenticated_client.get(
            "/api/checkin/lookup/",
            {"q": sample_patient.mrn},
        )

        final_count = AuditLog.objects.filter(action="patient_lookup").count()
        assert final_count == initial_count + 1
