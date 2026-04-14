"""
Tests for ER Bed Board API (Phase 3).

Tests the ERBed model, serializers, and API endpoints for
the Emergency Department bed board feature.
"""

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.encounters.models import Encounter
from hmis.apps.triage.models import ERBed, TriageAssessment

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def er_bed(db):
    """Create a single available ER bed."""
    return ERBed.objects.create(
        zone="ER_RESUS",
        bed_number="R-01",
        status="AVAILABLE",
    )


@pytest.fixture
def er_beds(db):
    """Create a set of ER beds across zones."""
    beds = []
    zone_configs = [
        ("ER_RESUS", ["R-01", "R-02", "R-03", "R-04"]),
        ("ER_ACUTE", ["A-01", "A-02", "A-03"]),
        ("TRAUMA", ["T-01", "T-02"]),
    ]
    for zone, numbers in zone_configs:
        for num in numbers:
            beds.append(ERBed.objects.create(zone=zone, bed_number=num, status="AVAILABLE"))
    return beds


@pytest.fixture
def triage_assessment(db, sample_patient, test_user, sample_facility):
    """Create a triage assessment for bed assignment tests."""
    encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="EMERGENCY",
        encounter_date=timezone.now().date(),
        chief_complaint="Chest pain",
        facility=sample_facility,
    )
    return TriageAssessment.objects.create(
        encounter=encounter,
        chief_complaint="Chest pain",
        chief_complaint_category="CHEST_PAIN",
        mental_status="A",
        mobility="AMBULATORY",
        triage_category="RED",
        assigned_area="ER_RESUS",
        arrival_time=timezone.now(),
        triage_start_time=timezone.now(),
        triaged_by=test_user,
    )


# =============================================================================
# MODEL TESTS
# =============================================================================


class TestERBedModel:
    """Tests for the ERBed model methods and properties."""

    def test_create_er_bed(self, er_bed):
        """Should create an ER bed with default status."""
        assert er_bed.zone == "ER_RESUS"
        assert er_bed.bed_number == "R-01"
        assert er_bed.status == "AVAILABLE"
        assert er_bed.current_patient is None
        assert er_bed.is_available is True

    def test_str_representation(self, er_bed):
        """Should return a readable string."""
        assert "Resuscitation" in str(er_bed)
        assert "R-01" in str(er_bed)

    def test_unique_together_zone_bed_number(self, er_bed):
        """Should enforce uniqueness of zone + bed_number."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            ERBed.objects.create(zone="ER_RESUS", bed_number="R-01")

    def test_assign_patient(self, er_bed, sample_patient, test_user):
        """Should assign a patient and transition to OCCUPIED."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        er_bed.refresh_from_db()
        assert er_bed.status == "OCCUPIED"
        assert er_bed.current_patient == sample_patient
        assert er_bed.is_available is False
        assert er_bed.patient_name == f"{sample_patient.first_name} {sample_patient.last_name}"
        assert er_bed.patient_mrn == sample_patient.mrn

    def test_assign_patient_with_triage(self, er_bed, sample_patient, triage_assessment, test_user):
        """Should store triage assessment reference."""
        er_bed.assign_patient(
            patient=sample_patient,
            triage_assessment=triage_assessment,
            user=test_user,
        )

        er_bed.refresh_from_db()
        assert er_bed.current_triage_assessment == triage_assessment
        assert er_bed.triage_category == "RED"

    def test_assign_patient_to_occupied_bed_fails(
        self, er_bed, sample_patient, test_user, sample_organization
    ):
        """Should raise ValueError when bed is not available."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first()
        sub_county = SubCounty.objects.first()
        another_patient = Patient.objects.create(
            first_name="Jane",
            last_name="Doe",
            date_of_birth="1990-01-01",
            gender="F",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        with pytest.raises(ValueError, match="must be AVAILABLE"):
            er_bed.assign_patient(patient=another_patient, user=test_user)

    def test_release_patient(self, er_bed, sample_patient, test_user):
        """Should release patient and transition to CLEANING by default."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)
        er_bed.release(user=test_user)

        er_bed.refresh_from_db()
        assert er_bed.status == "CLEANING"
        assert er_bed.current_patient is None
        assert er_bed.current_triage_assessment is None

    def test_release_patient_skip_cleaning(self, er_bed, sample_patient, test_user):
        """Should transition directly to AVAILABLE when mark_cleaning=False."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)
        er_bed.release(user=test_user, mark_cleaning=False)

        er_bed.refresh_from_db()
        assert er_bed.status == "AVAILABLE"

    def test_release_unoccupied_bed_fails(self, er_bed, test_user):
        """Should raise ValueError when releasing non-occupied bed."""
        with pytest.raises(ValueError, match="must be OCCUPIED"):
            er_bed.release(user=test_user)

    def test_mark_available(self, er_bed, sample_patient, test_user):
        """Should transition to AVAILABLE from CLEANING."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)
        er_bed.release(user=test_user)  # → CLEANING
        er_bed.mark_available(user=test_user)

        er_bed.refresh_from_db()
        assert er_bed.status == "AVAILABLE"

    def test_mark_available_from_occupied_fails(self, er_bed, sample_patient, test_user):
        """Should not allow marking available while occupied."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        with pytest.raises(ValueError, match="still occupied"):
            er_bed.mark_available(user=test_user)

    def test_mark_out_of_service(self, er_bed, test_user):
        """Should transition to OUT_OF_SERVICE with reason."""
        er_bed.mark_out_of_service(user=test_user, reason="Broken rail")

        er_bed.refresh_from_db()
        assert er_bed.status == "OUT_OF_SERVICE"
        assert er_bed.notes == "Broken rail"

    def test_mark_out_of_service_from_occupied_fails(self, er_bed, sample_patient, test_user):
        """Should not take occupied bed out of service."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        with pytest.raises(ValueError, match="still occupied"):
            er_bed.mark_out_of_service(user=test_user, reason="Maintenance")

    def test_occupied_duration_minutes(self, er_bed, sample_patient, test_user):
        """Should return duration when bed is occupied."""
        assert er_bed.occupied_duration_minutes is None  # Not occupied

        er_bed.assign_patient(patient=sample_patient, user=test_user)
        duration = er_bed.occupied_duration_minutes
        assert duration is not None
        assert duration >= 0

    def test_patient_name_empty_when_no_patient(self, er_bed):
        """Should return empty string when no patient."""
        assert er_bed.patient_name == ""
        assert er_bed.patient_mrn == ""
        assert er_bed.triage_category == ""


# =============================================================================
# API TESTS
# =============================================================================


class TestERBedAPI:
    """Tests for ER Bed API endpoints."""

    # -------------------------------------------------------------------------
    # LIST
    # -------------------------------------------------------------------------

    def test_list_beds(self, authenticated_client, er_beds):
        """Should list all ER beds."""
        response = authenticated_client.get("/api/triage/er-beds/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 9  # 4 + 3 + 2

    def test_list_beds_filter_by_zone(self, authenticated_client, er_beds):
        """Should filter beds by zone."""
        response = authenticated_client.get("/api/triage/er-beds/?zone=ER_RESUS")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 4

    def test_list_beds_filter_by_status(
        self, authenticated_client, er_beds, sample_patient, test_user
    ):
        """Should filter beds by status."""
        # Occupy one bed
        er_beds[0].assign_patient(patient=sample_patient, user=test_user)

        response = authenticated_client.get("/api/triage/er-beds/?status=OCCUPIED")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_list_beds_unauthenticated(self, api_client, er_beds):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/triage/er-beds/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # -------------------------------------------------------------------------
    # CREATE
    # -------------------------------------------------------------------------

    def test_create_bed(self, authenticated_client):
        """Should create a new ER bed."""
        data = {"zone": "ER_RESUS", "bed_number": "R-01"}
        response = authenticated_client.post("/api/triage/er-beds/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["zone"] == "ER_RESUS"
        assert response.data["bed_number"] == "R-01"
        assert response.data["status"] == "AVAILABLE"

    def test_create_duplicate_bed_fails(self, authenticated_client, er_bed):
        """Should reject duplicate zone + bed_number."""
        data = {"zone": "ER_RESUS", "bed_number": "R-01"}
        response = authenticated_client.post("/api/triage/er-beds/", data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # -------------------------------------------------------------------------
    # DETAIL
    # -------------------------------------------------------------------------

    def test_get_bed_detail(self, authenticated_client, er_bed):
        """Should return bed detail with computed fields."""
        response = authenticated_client.get(f"/api/triage/er-beds/{er_bed.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["bed_number"] == "R-01"
        assert response.data["zone_display"] == "ER - Resuscitation"
        assert response.data["status_display"] == "Available"
        assert response.data["is_available"] is True
        assert response.data["patient_name"] == ""

    # -------------------------------------------------------------------------
    # ASSIGN PATIENT
    # -------------------------------------------------------------------------

    def test_assign_patient_to_bed(self, authenticated_client, er_bed, sample_patient):
        """Should assign patient to available bed."""
        data = {"patient": sample_patient.id}
        response = authenticated_client.post(f"/api/triage/er-beds/{er_bed.id}/assign/", data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "OCCUPIED"
        assert response.data["current_patient"] == sample_patient.id
        assert response.data["patient_name"] != ""

    def test_assign_patient_with_triage(
        self, authenticated_client, er_bed, sample_patient, triage_assessment
    ):
        """Should assign patient with triage assessment reference."""
        data = {
            "patient": sample_patient.id,
            "triage_assessment": triage_assessment.id,
        }
        response = authenticated_client.post(f"/api/triage/er-beds/{er_bed.id}/assign/", data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_category"] == "RED"

    def test_assign_patient_to_occupied_bed_returns_400(
        self, authenticated_client, er_bed, sample_patient, test_user
    ):
        """Should return 400 when bed is already occupied."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        data = {"patient": sample_patient.id}
        response = authenticated_client.post(f"/api/triage/er-beds/{er_bed.id}/assign/", data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    # -------------------------------------------------------------------------
    # RELEASE
    # -------------------------------------------------------------------------

    def test_release_patient(self, authenticated_client, er_bed, sample_patient, test_user):
        """Should release patient and transition to CLEANING."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        response = authenticated_client.post(
            f"/api/triage/er-beds/{er_bed.id}/release/", {"mark_cleaning": True}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CLEANING"
        assert response.data["current_patient"] is None

    def test_release_patient_skip_cleaning(
        self, authenticated_client, er_bed, sample_patient, test_user
    ):
        """Should release and mark available when mark_cleaning=False."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        response = authenticated_client.post(
            f"/api/triage/er-beds/{er_bed.id}/release/", {"mark_cleaning": False}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "AVAILABLE"

    def test_release_available_bed_returns_400(self, authenticated_client, er_bed):
        """Should return 400 when releasing non-occupied bed."""
        response = authenticated_client.post(f"/api/triage/er-beds/{er_bed.id}/release/", {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # -------------------------------------------------------------------------
    # UPDATE STATUS
    # -------------------------------------------------------------------------

    def test_mark_bed_available(self, authenticated_client, er_bed, sample_patient, test_user):
        """Should transition from CLEANING to AVAILABLE."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)
        er_bed.release(user=test_user)  # → CLEANING

        response = authenticated_client.post(
            f"/api/triage/er-beds/{er_bed.id}/update-status/",
            {"status": "AVAILABLE"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "AVAILABLE"

    def test_mark_bed_out_of_service(self, authenticated_client, er_bed):
        """Should transition to OUT_OF_SERVICE with reason."""
        response = authenticated_client.post(
            f"/api/triage/er-beds/{er_bed.id}/update-status/",
            {"status": "OUT_OF_SERVICE", "reason": "Equipment failure"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "OUT_OF_SERVICE"
        assert response.data["notes"] == "Equipment failure"

    def test_mark_occupied_bed_available_returns_400(
        self, authenticated_client, er_bed, sample_patient, test_user
    ):
        """Should block marking occupied bed as available."""
        er_bed.assign_patient(patient=sample_patient, user=test_user)

        response = authenticated_client.post(
            f"/api/triage/er-beds/{er_bed.id}/update-status/",
            {"status": "AVAILABLE"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # -------------------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------------------

    def test_bed_board_summary(self, authenticated_client, er_beds, sample_patient, test_user):
        """Should return zone summary with occupancy stats."""
        # Occupy 2 beds in RESUS
        er_beds[0].assign_patient(patient=sample_patient, user=test_user)
        er_beds[1].status = "CLEANING"
        er_beds[1].save()

        response = authenticated_client.get("/api/triage/er-beds/summary/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3  # 3 zones with beds

        # Find RESUS zone
        resus = next(z for z in response.data if z["zone"] == "ER_RESUS")
        assert resus["total_beds"] == 4
        assert resus["occupied"] == 1
        assert resus["cleaning"] == 1
        assert resus["available"] == 2
        assert resus["occupancy_rate"] == 25.0

    # -------------------------------------------------------------------------
    # BOARD (grouped by zone)
    # -------------------------------------------------------------------------

    def test_bed_board_grouped(self, authenticated_client, er_beds):
        """Should return beds grouped by zone."""
        response = authenticated_client.get("/api/triage/er-beds/board/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3  # 3 zones

        # Each zone group should have beds
        for zone_group in response.data:
            assert "zone" in zone_group
            assert "zone_display" in zone_group
            assert "beds" in zone_group
            assert len(zone_group["beds"]) > 0

    def test_bed_board_filter_by_zone(self, authenticated_client, er_beds):
        """Should filter board view by specific zone."""
        response = authenticated_client.get("/api/triage/er-beds/board/?zone=TRAUMA")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["zone"] == "TRAUMA"
        assert len(response.data[0]["beds"]) == 2

    # -------------------------------------------------------------------------
    # SUGGEST BED ENDPOINT
    # -------------------------------------------------------------------------

    def test_suggest_bed_returns_available(self, authenticated_client, er_beds):
        """Should return the first available bed in the requested zone."""
        response = authenticated_client.get("/api/triage/er-beds/suggest/?zone=ER_RESUS")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["zone"] == "ER_RESUS"
        assert response.data["bed_number"] == "R-01"
        assert response.data["is_available"] is True

    def test_suggest_bed_skips_occupied(self, authenticated_client, er_beds, sample_patient):
        """Should skip occupied beds and return next available."""
        # Occupy R-01
        bed_r01 = ERBed.objects.get(zone="ER_RESUS", bed_number="R-01")
        bed_r01.assign_patient(patient=sample_patient)

        response = authenticated_client.get("/api/triage/er-beds/suggest/?zone=ER_RESUS")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["bed_number"] == "R-02"

    def test_suggest_bed_zone_required(self, authenticated_client, er_beds):
        """Should return 400 if zone is missing."""
        response = authenticated_client.get("/api/triage/er-beds/suggest/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "zone" in response.data["error"].lower()

    def test_suggest_bed_invalid_zone(self, authenticated_client, er_beds):
        """Should return 400 for invalid zone code."""
        response = authenticated_client.get("/api/triage/er-beds/suggest/?zone=INVALID")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid" in response.data["error"].lower()

    def test_suggest_bed_none_available(self, authenticated_client, sample_patient, db):
        """Should return 404 when no beds are available in zone."""
        bed = ERBed.objects.create(zone="TRAUMA", bed_number="T-01", status="AVAILABLE")
        bed.assign_patient(patient=sample_patient)

        response = authenticated_client.get("/api/triage/er-beds/suggest/?zone=TRAUMA")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data["available"] == 0

    def test_suggest_bed_skips_out_of_service(self, authenticated_client, db):
        """Should not suggest OOS beds."""
        ERBed.objects.create(zone="ER_ACUTE", bed_number="A-01", status="OUT_OF_SERVICE")
        ERBed.objects.create(zone="ER_ACUTE", bed_number="A-02", status="AVAILABLE")

        response = authenticated_client.get("/api/triage/er-beds/suggest/?zone=ER_ACUTE")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["bed_number"] == "A-02"


# =============================================================================
# AUTO-RELEASE ON ENCOUNTER CLOSE / CANCEL
# =============================================================================


class TestERBedAutoRelease:
    """Tests for automatic ER bed release when encounters are closed/cancelled."""

    @pytest.fixture
    def occupied_bed_with_encounter(self, db, sample_patient, test_user, sample_facility):
        """Create an occupied bed linked to a patient with an active encounter."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=timezone.now().date(),
            chief_complaint="Trauma",
            status="IN_PROGRESS",
            facility=sample_facility,
        )
        bed = ERBed.objects.create(
            zone="ER_RESUS",
            bed_number="R-01",
            status="AVAILABLE",
        )
        bed.assign_patient(patient=sample_patient, user=test_user)
        return bed, encounter

    def test_auto_release_on_encounter_closed(self, occupied_bed_with_encounter):
        """Should auto-release ER bed when encounter status changes to CLOSED."""
        bed, encounter = occupied_bed_with_encounter

        # Close the encounter — the signal should fire
        encounter.status = "CLOSED"
        encounter.save()

        bed.refresh_from_db()
        assert bed.status == "CLEANING"
        assert bed.current_patient is None

    def test_auto_release_on_encounter_cancelled(self, occupied_bed_with_encounter):
        """Should auto-release ER bed when encounter status changes to CANCELLED."""
        bed, encounter = occupied_bed_with_encounter

        encounter.status = "CANCELLED"
        encounter.save()

        bed.refresh_from_db()
        assert bed.status == "CLEANING"
        assert bed.current_patient is None

    def test_no_release_on_non_terminal_status(self, occupied_bed_with_encounter):
        """Should NOT release bed for non-terminal status transitions."""
        bed, encounter = occupied_bed_with_encounter

        encounter.status = "ON_HOLD"
        encounter.save()

        bed.refresh_from_db()
        assert bed.status == "OCCUPIED"
        assert bed.current_patient is not None

    def test_no_release_when_no_occupied_bed(self, db, sample_patient, test_user, sample_facility):
        """Should gracefully do nothing if patient has no occupied ER bed."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=timezone.now().date(),
            chief_complaint="Minor injury",
            status="IN_PROGRESS",
            facility=sample_facility,
        )

        # Close without any bed — should not raise
        encounter.status = "CLOSED"
        encounter.save()

    def test_idempotent_on_already_closed(self, occupied_bed_with_encounter):
        """Should not fail if encounter is saved again while already CLOSED."""
        bed, encounter = occupied_bed_with_encounter

        encounter.status = "CLOSED"
        encounter.save()

        bed.refresh_from_db()
        assert bed.status == "CLEANING"

        # Save again — should not attempt double-release
        encounter.chief_complaint = "Updated complaint"
        encounter.save()

        bed.refresh_from_db()
        assert bed.status == "CLEANING"

    def test_creates_audit_log(self, occupied_bed_with_encounter):
        """Should create an audit log entry for the auto-release."""
        from hmis.apps.core.models import AuditLog

        bed, encounter = occupied_bed_with_encounter
        initial_count = AuditLog.objects.filter(action="er_bed_auto_release").count()

        encounter.status = "CLOSED"
        encounter.save()

        assert AuditLog.objects.filter(action="er_bed_auto_release").count() == initial_count + 1
        log = AuditLog.objects.filter(action="er_bed_auto_release").latest("timestamp")
        assert log.resource_id == encounter.pk
        assert log.details["beds_released"] == 1
