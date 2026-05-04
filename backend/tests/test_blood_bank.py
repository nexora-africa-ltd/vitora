"""Tests for the Blood Bank module."""

from datetime import date, timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.blood_bank.models import (
    BloodComponent,
    BloodDonor,
    BloodGroup,
    BloodIssue,
    BloodRequest,
    BloodUnit,
    CrossMatch,
    CrossMatchResult,
    RequestStatus,
    RequestUrgency,
    TransfusionReaction,
    UnitStatus,
)

# =============================================================================
# Model Tests
# =============================================================================


class TestBloodDonorModel:
    """Tests for BloodDonor model."""

    def test_auto_generates_donor_number(self, db, sample_facility):
        donor = BloodDonor.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert donor.donor_number.startswith("BD-")
        assert len(donor.donor_number) > 10

    def test_donor_number_sequential(self, db, sample_facility):
        """Second donor on same day gets next sequence number."""
        d1 = BloodDonor.objects.create(
            first_name="A",
            last_name="B",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.A_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        d2 = BloodDonor.objects.create(
            first_name="C",
            last_name="D",
            date_of_birth=date(1991, 1, 1),
            gender="F",
            blood_group=BloodGroup.B_NEG,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        # d1 should end in 0001, d2 in 0002
        assert d1.donor_number.endswith("-0001")
        assert d2.donor_number.endswith("-0002")

    def test_eligible_to_donate_no_previous(self, db, sample_facility):
        """Donor with no previous donation is eligible."""
        donor = BloodDonor.objects.create(
            first_name="New",
            last_name="Donor",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_NEG,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert donor.eligible_to_donate is True

    def test_eligible_to_donate_recent_donation(self, db, sample_facility):
        """Donor who donated recently is NOT eligible (< 56 days)."""
        donor = BloodDonor.objects.create(
            first_name="Recent",
            last_name="Donor",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.A_POS,
            last_donation_date=date.today() - timedelta(days=30),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert donor.eligible_to_donate is False

    def test_eligible_to_donate_old_donation(self, db, sample_facility):
        """Donor who donated > 56 days ago IS eligible."""
        donor = BloodDonor.objects.create(
            first_name="Old",
            last_name="Donor",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.AB_POS,
            last_donation_date=date.today() - timedelta(days=60),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert donor.eligible_to_donate is True


class TestBloodUnitModel:
    """Tests for BloodUnit model."""

    def test_auto_generates_unit_number(self, db, sample_facility):
        donor = BloodDonor.objects.create(
            first_name="D",
            last_name="O",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit = BloodUnit.objects.create(
            donor=donor,
            blood_group=BloodGroup.O_POS,
            component=BloodComponent.WHOLE_BLOOD,
            expiry_date=timezone.now() + timedelta(days=35),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert unit.unit_number.startswith("BU-")

    def test_is_expired_false(self, db, sample_facility):
        donor = BloodDonor.objects.create(
            first_name="D",
            last_name="O",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit = BloodUnit.objects.create(
            donor=donor,
            blood_group=BloodGroup.O_POS,
            expiry_date=timezone.now() + timedelta(days=35),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert unit.is_expired is False

    def test_is_expired_true(self, db, sample_facility):
        donor = BloodDonor.objects.create(
            first_name="D",
            last_name="O",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit = BloodUnit.objects.create(
            donor=donor,
            blood_group=BloodGroup.O_POS,
            expiry_date=timezone.now() - timedelta(days=1),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert unit.is_expired is True

    def test_mark_available(self, db, sample_facility):
        donor = BloodDonor.objects.create(
            first_name="D",
            last_name="O",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit = BloodUnit.objects.create(
            donor=donor,
            blood_group=BloodGroup.O_POS,
            status=UnitStatus.TESTING,
            expiry_date=timezone.now() + timedelta(days=35),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit.mark_available()
        unit.refresh_from_db()
        assert unit.status == UnitStatus.AVAILABLE
        assert unit.all_screens_negative is True

    def test_quarantine(self, db, sample_facility):
        donor = BloodDonor.objects.create(
            first_name="D",
            last_name="O",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.O_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit = BloodUnit.objects.create(
            donor=donor,
            blood_group=BloodGroup.O_POS,
            status=UnitStatus.TESTING,
            expiry_date=timezone.now() + timedelta(days=35),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit.quarantine("HIV positive")
        unit.refresh_from_db()
        assert unit.status == UnitStatus.QUARANTINED
        assert "HIV positive" in unit.notes


class TestBloodRequestModel:
    """Tests for BloodRequest model."""

    def test_auto_generates_request_number(self, db, sample_facility, sample_patient, test_user):
        req = BloodRequest.objects.create(
            patient=sample_patient,
            requested_by=test_user,
            blood_group=BloodGroup.A_POS,
            component=BloodComponent.PACKED_RBC,
            urgency=RequestUrgency.URGENT,
            clinical_indication="Acute anemia",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert req.request_number.startswith("BR-")

    def test_cancel_request(self, db, sample_facility, sample_patient, test_user):
        req = BloodRequest.objects.create(
            patient=sample_patient,
            requested_by=test_user,
            blood_group=BloodGroup.A_POS,
            clinical_indication="Surgery prep",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        req.cancel("Patient discharged")
        req.refresh_from_db()
        assert req.status == RequestStatus.CANCELLED
        assert "Patient discharged" in req.notes


class TestBloodIssueModel:
    """Tests for BloodIssue model."""

    def test_complete_transfusion(self, db, sample_facility, sample_patient, test_user):
        donor = BloodDonor.objects.create(
            first_name="D",
            last_name="O",
            date_of_birth=date(1990, 1, 1),
            gender="M",
            blood_group=BloodGroup.A_POS,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        unit = BloodUnit.objects.create(
            donor=donor,
            blood_group=BloodGroup.A_POS,
            status=UnitStatus.AVAILABLE,
            expiry_date=timezone.now() + timedelta(days=35),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        request = BloodRequest.objects.create(
            patient=sample_patient,
            requested_by=test_user,
            blood_group=BloodGroup.A_POS,
            units_requested=1,
            clinical_indication="Surgery",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        issue = BloodIssue.objects.create(
            blood_request=request,
            blood_unit=unit,
            issued_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        # Unit should be marked ISSUED on save
        unit.refresh_from_db()
        assert unit.status == UnitStatus.ISSUED

        issue.complete_transfusion(reaction=TransfusionReaction.NONE, details="")
        issue.refresh_from_db()
        assert issue.transfusion_completed_at is not None
        assert issue.transfusion_reaction == TransfusionReaction.NONE

        # Request should be marked TRANSFUSED since 1 unit requested and 1 completed
        request.refresh_from_db()
        assert request.status == RequestStatus.TRANSFUSED


# =============================================================================
# API Tests
# =============================================================================


@pytest.fixture
def blood_donor(db, sample_facility):
    return BloodDonor.objects.create(
        first_name="Test",
        last_name="Donor",
        date_of_birth=date(1985, 6, 15),
        gender="M",
        blood_group=BloodGroup.O_POS,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def blood_unit(db, blood_donor, sample_facility):
    return BloodUnit.objects.create(
        donor=blood_donor,
        blood_group=BloodGroup.O_POS,
        component=BloodComponent.WHOLE_BLOOD,
        status=UnitStatus.AVAILABLE,
        expiry_date=timezone.now() + timedelta(days=35),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def blood_request(db, sample_patient, test_user, sample_facility):
    return BloodRequest.objects.create(
        patient=sample_patient,
        requested_by=test_user,
        blood_group=BloodGroup.O_POS,
        component=BloodComponent.WHOLE_BLOOD,
        units_requested=2,
        urgency=RequestUrgency.URGENT,
        clinical_indication="Major surgery",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


class TestBloodDonorAPI:
    """Tests for Blood Donor API endpoints."""

    def test_list_donors(self, authenticated_client, blood_donor):
        response = authenticated_client.get("/api/blood-bank/donors/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_donor(self, authenticated_client, sample_facility):
        data = {
            "first_name": "Alice",
            "last_name": "Wanjiku",
            "date_of_birth": "1992-03-10",
            "gender": "F",
            "blood_group": "B+",
        }
        response = authenticated_client.post("/api/blood-bank/donors/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["donor_number"].startswith("BD-")
        assert response.data["first_name"] == "Alice"

    def test_create_donor_unauthenticated(self, api_client):
        data = {
            "first_name": "Alice",
            "last_name": "Wanjiku",
            "date_of_birth": "1992-03-10",
            "gender": "F",
            "blood_group": "B+",
        }
        response = api_client.post("/api/blood-bank/donors/", data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_donor(self, authenticated_client, blood_donor):
        response = authenticated_client.get(f"/api/blood-bank/donors/{blood_donor.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == blood_donor.pk

    def test_filter_donors_by_blood_group(self, authenticated_client, blood_donor):
        response = authenticated_client.get("/api/blood-bank/donors/?blood_group=O%2B")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


class TestBloodUnitAPI:
    """Tests for Blood Unit API endpoints."""

    def test_list_units(self, authenticated_client, blood_unit):
        response = authenticated_client.get("/api/blood-bank/units/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_unit(self, authenticated_client, blood_donor):
        data = {
            "donor": blood_donor.pk,
            "blood_group": "O+",
            "component": "PACKED_RBC",
            "expiry_date": (timezone.now() + timedelta(days=42)).isoformat(),
            "volume_ml": 300,
        }
        response = authenticated_client.post("/api/blood-bank/units/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["unit_number"].startswith("BU-")
        # Donor's total_donations should increase
        blood_donor.refresh_from_db()
        assert blood_donor.total_donations == 1

    def test_mark_available_from_testing(self, authenticated_client, sample_facility, blood_donor):
        """Can mark a TESTING unit as AVAILABLE."""
        unit = BloodUnit.objects.create(
            donor=blood_donor,
            blood_group=BloodGroup.O_POS,
            status=UnitStatus.TESTING,
            expiry_date=timezone.now() + timedelta(days=35),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.post(f"/api/blood-bank/units/{unit.pk}/mark_available/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "AVAILABLE"

    def test_mark_available_wrong_status(self, authenticated_client, blood_unit):
        """Cannot mark AVAILABLE unit as available (already is)."""
        response = authenticated_client.post(
            f"/api/blood-bank/units/{blood_unit.pk}/mark_available/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_quarantine_unit(self, authenticated_client, blood_unit):
        response = authenticated_client.post(
            f"/api/blood-bank/units/{blood_unit.pk}/quarantine/",
            {"reason": "QC failure"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "QUARANTINED"

    def test_filter_units_by_status(self, authenticated_client, blood_unit):
        response = authenticated_client.get("/api/blood-bank/units/?status=AVAILABLE")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


class TestBloodRequestAPI:
    """Tests for Blood Request API endpoints."""

    def test_list_requests(self, authenticated_client, blood_request):
        response = authenticated_client.get("/api/blood-bank/requests/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_request(self, authenticated_client, sample_patient):
        data = {
            "patient": sample_patient.pk,
            "blood_group": "A-",
            "component": "FFP",
            "units_requested": 3,
            "urgency": "EMERGENCY",
            "clinical_indication": "DIC with active bleeding",
        }
        response = authenticated_client.post("/api/blood-bank/requests/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["request_number"].startswith("BR-")
        assert response.data["urgency"] == "EMERGENCY"

    def test_cancel_request(self, authenticated_client, blood_request):
        response = authenticated_client.post(
            f"/api/blood-bank/requests/{blood_request.pk}/cancel/",
            {"reason": "Surgery postponed"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_issued_request_fails(self, authenticated_client, blood_request):
        """Cannot cancel an already-issued request."""
        blood_request.status = RequestStatus.ISSUED
        blood_request.save(update_fields=["status"])
        response = authenticated_client.post(
            f"/api/blood-bank/requests/{blood_request.pk}/cancel/",
            {"reason": "Too late"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestCrossMatchAPI:
    """Tests for CrossMatch API endpoints."""

    def test_create_crossmatch(self, authenticated_client, blood_request, blood_unit):
        data = {
            "blood_request": blood_request.pk,
            "blood_unit": blood_unit.pk,
            "method": "Gel card",
        }
        response = authenticated_client.post("/api/blood-bank/crossmatches/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["result"] == "PENDING"

    def test_record_compatible_result(
        self, authenticated_client, blood_request, blood_unit, test_user
    ):
        xm = CrossMatch.objects.create(
            blood_request=blood_request,
            blood_unit=blood_unit,
            performed_by=test_user,
            facility=blood_request.facility,
            organization=blood_request.organization,
        )
        # Set request to CROSSMATCH_PENDING to test status transition
        blood_request.status = RequestStatus.CROSSMATCH_PENDING
        blood_request.save(update_fields=["status"])

        response = authenticated_client.post(
            f"/api/blood-bank/crossmatches/{xm.pk}/record_result/",
            {"result": "COMPATIBLE"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["result"] == "COMPATIBLE"
        # Request should move to READY
        blood_request.refresh_from_db()
        assert blood_request.status == RequestStatus.READY

    def test_record_invalid_result(
        self, authenticated_client, blood_request, blood_unit, test_user
    ):
        xm = CrossMatch.objects.create(
            blood_request=blood_request,
            blood_unit=blood_unit,
            performed_by=test_user,
            facility=blood_request.facility,
            organization=blood_request.organization,
        )
        response = authenticated_client.post(
            f"/api/blood-bank/crossmatches/{xm.pk}/record_result/",
            {"result": "INVALID_VALUE"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestBloodIssueAPI:
    """Tests for Blood Issue API endpoints."""

    def test_create_issue(self, authenticated_client, blood_request, blood_unit):
        data = {
            "blood_request": blood_request.pk,
            "blood_unit": blood_unit.pk,
        }
        response = authenticated_client.post("/api/blood-bank/issues/", data)
        assert response.status_code == status.HTTP_201_CREATED
        # Unit status should change to ISSUED
        blood_unit.refresh_from_db()
        assert blood_unit.status == UnitStatus.ISSUED

    def test_complete_transfusion(
        self, authenticated_client, blood_request, blood_unit, test_user, sample_facility
    ):
        issue = BloodIssue.objects.create(
            blood_request=blood_request,
            blood_unit=blood_unit,
            issued_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.post(
            f"/api/blood-bank/issues/{issue.pk}/complete-transfusion/",
            {"reaction": "NONE", "details": ""},
        )
        assert response.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.transfusion_completed_at is not None

    def test_complete_transfusion_with_reaction(
        self, authenticated_client, blood_request, blood_unit, test_user, sample_facility
    ):
        issue = BloodIssue.objects.create(
            blood_request=blood_request,
            blood_unit=blood_unit,
            issued_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.post(
            f"/api/blood-bank/issues/{issue.pk}/complete-transfusion/",
            {"reaction": "FEBRILE", "details": "Fever and chills 30min post-start"},
        )
        assert response.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.transfusion_reaction == TransfusionReaction.FEBRILE
        assert "Fever and chills" in issue.reaction_details
