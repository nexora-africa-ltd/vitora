"""Tests for the Dialysis module."""

from datetime import date, timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.dialysis.models import (
    AccessStatus,
    AccessType,
    DialysisOrder,
    DialysisSession,
    DialysisType,
    OrderFrequency,
    OrderStatus,
    SessionStatus,
    VascularAccess,
)

# =============================================================================
# Model Tests
# =============================================================================


class TestVascularAccessModel:
    """Tests for VascularAccess model."""

    def test_create_vascular_access(self, db, sample_patient, sample_facility):
        access = VascularAccess.objects.create(
            patient=sample_patient,
            access_type=AccessType.AVF,
            status=AccessStatus.ACTIVE,
            site="Left forearm",
            placed_date=date.today() - timedelta(days=90),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert access.pk is not None
        assert str(access) == f"{sample_patient} - Arteriovenous Fistula (Left forearm)"


class TestDialysisOrderModel:
    """Tests for DialysisOrder model."""

    def test_create_order(self, db, sample_patient, test_user, sample_facility):
        order = DialysisOrder.objects.create(
            patient=sample_patient,
            ordered_by=test_user,
            dialysis_type=DialysisType.HEMODIALYSIS,
            frequency=OrderFrequency.THRICE_WEEKLY,
            target_duration_minutes=240,
            blood_flow_rate=300,
            dialysate_flow_rate=500,
            clinical_indication="CKD Stage 5",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert order.pk is not None
        assert order.status == OrderStatus.ACTIVE


class TestDialysisSessionModel:
    """Tests for DialysisSession model."""

    def test_auto_generates_session_number(self, db, sample_patient, sample_facility):
        session = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert session.session_number.startswith("DS-")

    def test_session_number_sequential(self, db, sample_patient, sample_facility):
        s1 = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        s2 = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert s1.session_number.endswith("-0001")
        assert s2.session_number.endswith("-0002")

    def test_start_session(self, db, sample_patient, test_user, sample_facility):
        session = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            status=SessionStatus.SCHEDULED,
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        session.start(user=test_user)
        session.refresh_from_db()
        assert session.status == SessionStatus.IN_PROGRESS
        assert session.start_time is not None
        assert session.performed_by == test_user

    def test_complete_session(self, db, sample_patient, test_user, sample_facility):
        session = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            status=SessionStatus.IN_PROGRESS,
            start_time=timezone.now() - timedelta(hours=4),
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        session.complete()
        session.refresh_from_db()
        assert session.status == SessionStatus.COMPLETED
        assert session.end_time is not None
        assert session.actual_duration_minutes is not None
        assert session.actual_duration_minutes >= 239  # ~4 hours

    def test_abort_session(self, db, sample_patient, sample_facility):
        session = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            status=SessionStatus.IN_PROGRESS,
            start_time=timezone.now() - timedelta(hours=1),
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        session.abort(reason="Hypotension")
        session.refresh_from_db()
        assert session.status == SessionStatus.ABORTED
        assert session.end_time is not None
        assert "Hypotension" in session.complications

    def test_auto_calculates_duration(self, db, sample_patient, sample_facility):
        """Duration auto-calculated from start/end time on save."""
        start = timezone.now() - timedelta(hours=3, minutes=30)
        end = timezone.now()
        session = DialysisSession.objects.create(
            patient=sample_patient,
            dialysis_type=DialysisType.HEMODIALYSIS,
            status=SessionStatus.COMPLETED,
            start_time=start,
            end_time=end,
            scheduled_date=date.today(),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert session.actual_duration_minutes == 210  # 3.5 hours


# =============================================================================
# API Tests
# =============================================================================


@pytest.fixture
def vascular_access(db, sample_patient, sample_facility, test_user):
    return VascularAccess.objects.create(
        patient=sample_patient,
        access_type=AccessType.AVF,
        status=AccessStatus.ACTIVE,
        site="Left forearm",
        placed_date=date.today() - timedelta(days=90),
        placed_by=test_user,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def dialysis_order(db, sample_patient, test_user, sample_facility, vascular_access):
    return DialysisOrder.objects.create(
        patient=sample_patient,
        ordered_by=test_user,
        vascular_access=vascular_access,
        dialysis_type=DialysisType.HEMODIALYSIS,
        frequency=OrderFrequency.THRICE_WEEKLY,
        target_duration_minutes=240,
        blood_flow_rate=300,
        dialysate_flow_rate=500,
        clinical_indication="CKD Stage 5",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def dialysis_session(db, sample_patient, dialysis_order, sample_facility):
    return DialysisSession.objects.create(
        patient=sample_patient,
        order=dialysis_order,
        dialysis_type=DialysisType.HEMODIALYSIS,
        status=SessionStatus.SCHEDULED,
        scheduled_date=date.today(),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


class TestVascularAccessAPI:
    """Tests for Vascular Access API endpoints."""

    def test_list_accesses(self, authenticated_client, vascular_access):
        response = authenticated_client.get("/api/dialysis/accesses/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_access(self, authenticated_client, sample_patient):
        data = {
            "patient": sample_patient.pk,
            "access_type": "AVG",
            "site": "Right upper arm",
            "placed_date": str(date.today()),
        }
        response = authenticated_client.post("/api/dialysis/accesses/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["access_type"] == "AVG"

    def test_create_access_unauthenticated(self, api_client, sample_patient):
        data = {
            "patient": sample_patient.pk,
            "access_type": "AVG",
            "site": "Right upper arm",
            "placed_date": str(date.today()),
        }
        response = api_client.post("/api/dialysis/accesses/", data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_access(self, authenticated_client, vascular_access):
        response = authenticated_client.get(f"/api/dialysis/accesses/{vascular_access.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["site"] == "Left forearm"

    def test_filter_by_patient(self, authenticated_client, vascular_access, sample_patient):
        response = authenticated_client.get(f"/api/dialysis/accesses/?patient={sample_patient.pk}")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


class TestDialysisOrderAPI:
    """Tests for Dialysis Order API endpoints."""

    def test_list_orders(self, authenticated_client, dialysis_order):
        response = authenticated_client.get("/api/dialysis/orders/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_order(self, authenticated_client, sample_patient, vascular_access):
        data = {
            "patient": sample_patient.pk,
            "vascular_access": vascular_access.pk,
            "dialysis_type": "HEMODIALYSIS",
            "frequency": "THRICE_WEEKLY",
            "target_duration_minutes": 240,
            "blood_flow_rate": 350,
            "dialysate_flow_rate": 500,
            "clinical_indication": "ESRD on maintenance HD",
            "start_date": str(date.today()),
        }
        response = authenticated_client.post("/api/dialysis/orders/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "ACTIVE"

    def test_suspend_order(self, authenticated_client, dialysis_order):
        response = authenticated_client.post(f"/api/dialysis/orders/{dialysis_order.pk}/suspend/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SUSPENDED"

    def test_suspend_non_active_order_fails(self, authenticated_client, dialysis_order):
        """Cannot suspend an already suspended order."""
        dialysis_order.status = OrderStatus.SUSPENDED
        dialysis_order.save(update_fields=["status"])
        response = authenticated_client.post(f"/api/dialysis/orders/{dialysis_order.pk}/suspend/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_resume_order(self, authenticated_client, dialysis_order):
        dialysis_order.status = OrderStatus.SUSPENDED
        dialysis_order.save(update_fields=["status"])
        response = authenticated_client.post(f"/api/dialysis/orders/{dialysis_order.pk}/resume/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"

    def test_resume_non_suspended_order_fails(self, authenticated_client, dialysis_order):
        """Cannot resume an order that is not suspended."""
        response = authenticated_client.post(f"/api/dialysis/orders/{dialysis_order.pk}/resume/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestDialysisSessionAPI:
    """Tests for Dialysis Session API endpoints."""

    def test_list_sessions(self, authenticated_client, dialysis_session):
        response = authenticated_client.get("/api/dialysis/sessions/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_session(self, authenticated_client, sample_patient, dialysis_order):
        data = {
            "patient": sample_patient.pk,
            "order": dialysis_order.pk,
            "dialysis_type": "HEMODIALYSIS",
            "scheduled_date": str(date.today()),
            "blood_flow_rate": 300,
            "dialysate_flow_rate": 500,
            "uf_goal_ml": 2000,
            "pre_weight_kg": 75.5,
            "pre_bp": "150/95",
            "pre_pulse": 82,
        }
        response = authenticated_client.post("/api/dialysis/sessions/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["session_number"].startswith("DS-")
        assert response.data["status"] == "SCHEDULED"

    def test_start_session(self, authenticated_client, dialysis_session):
        response = authenticated_client.post(f"/api/dialysis/sessions/{dialysis_session.pk}/start/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"
        assert response.data["start_time"] is not None

    def test_start_non_scheduled_session_fails(self, authenticated_client, dialysis_session):
        """Cannot start a session that is already in progress."""
        dialysis_session.status = SessionStatus.IN_PROGRESS
        dialysis_session.start_time = timezone.now()
        dialysis_session.save(update_fields=["status", "start_time"])
        response = authenticated_client.post(f"/api/dialysis/sessions/{dialysis_session.pk}/start/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_complete_session(self, authenticated_client, dialysis_session):
        # First start the session
        dialysis_session.status = SessionStatus.IN_PROGRESS
        dialysis_session.start_time = timezone.now() - timedelta(hours=4)
        dialysis_session.save(update_fields=["status", "start_time"])

        response = authenticated_client.post(
            f"/api/dialysis/sessions/{dialysis_session.pk}/complete/",
            {
                "post_weight_kg": "72.0",
                "post_bp": "130/85",
                "post_pulse": 76,
                "uf_achieved_ml": 2100,
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"

    def test_complete_non_in_progress_fails(self, authenticated_client, dialysis_session):
        """Cannot complete a scheduled session."""
        response = authenticated_client.post(
            f"/api/dialysis/sessions/{dialysis_session.pk}/complete/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_abort_session(self, authenticated_client, dialysis_session):
        dialysis_session.status = SessionStatus.IN_PROGRESS
        dialysis_session.start_time = timezone.now() - timedelta(hours=1)
        dialysis_session.save(update_fields=["status", "start_time"])

        response = authenticated_client.post(
            f"/api/dialysis/sessions/{dialysis_session.pk}/abort/",
            {"reason": "Severe hypotension"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ABORTED"

    def test_abort_non_in_progress_fails(self, authenticated_client, dialysis_session):
        """Cannot abort a scheduled session."""
        response = authenticated_client.post(
            f"/api/dialysis/sessions/{dialysis_session.pk}/abort/",
            {"reason": "Test"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_filter_sessions_by_patient(
        self, authenticated_client, dialysis_session, sample_patient
    ):
        response = authenticated_client.get(f"/api/dialysis/sessions/?patient={sample_patient.pk}")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_filter_sessions_by_date(self, authenticated_client, dialysis_session):
        response = authenticated_client.get(
            f"/api/dialysis/sessions/?scheduled_date={date.today()}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
