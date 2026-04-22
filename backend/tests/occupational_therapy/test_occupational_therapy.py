"""
Tests for the Occupational Therapy module.

Tests cover:
- OTTreatmentType CRUD operations
- OccupationalTherapyOrder CRUD and workflow
- OTSession CRUD and workflow
- Status transitions
- Clinic queue integration
- Billing integration
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.occupational_therapy.models import (
    OccupationalTherapyOrder,
    OTSession,
    OTTreatmentType,
    generate_ot_order_number,
)

User = get_user_model()


# ==================== FIXTURES ====================


@pytest.fixture
def ot_treatment_type(db):
    """Create a sample OT treatment type."""
    return OTTreatmentType.objects.create(
        code="OT-ADL-001",
        name="ADL Assessment & Training",
        description="Activities of Daily Living assessment and training",
        category="ADL_TRAINING",
        typical_duration_minutes=45,
        recommended_sessions=8,
        recommended_frequency="2x per week",
        cost_per_session=Decimal("2500.00"),
        sha_claimable=True,
        sha_intervention_code="SHA-OT-001",
        is_active=True,
    )


@pytest.fixture
def ot_treatment_type_cognitive(db):
    """Create a cognitive rehabilitation treatment type."""
    return OTTreatmentType.objects.create(
        code="OT-COG-001",
        name="Cognitive Rehabilitation",
        description="Cognitive rehabilitation therapy",
        category="COGNITIVE_REHAB",
        typical_duration_minutes=60,
        recommended_sessions=12,
        recommended_frequency="3x per week",
        cost_per_session=Decimal("3000.00"),
        sha_claimable=True,
        is_active=True,
    )


@pytest.fixture
def ot_order(
    db,
    sample_patient,
    sample_encounter,
    test_user,
    ot_treatment_type,
    sample_facility,
    sample_organization,
):
    """Create a sample OT order."""
    return OccupationalTherapyOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        treatment_type=ot_treatment_type,
        ordered_by=test_user,
        assessment_type="INITIAL",
        referral_reason="ADL_SUPPORT",
        clinical_indication="Patient requires ADL training post-stroke",
        treatment_goals="Improve independence in self-care activities",
        total_sessions=8,
        frequency="2x per week",
        priority="ROUTINE",
        status="DRAFT",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def approved_ot_order(ot_order, test_user):
    """Create an approved OT order."""
    ot_order.status = "PENDING"
    ot_order.save()
    ot_order.update_status("APPROVED", user=test_user)
    return ot_order


@pytest.fixture
def ot_session(db, approved_ot_order, test_user):
    """Create a sample OT session."""
    return OTSession.objects.create(
        order=approved_ot_order,
        therapist=test_user,
        scheduled_date=date.today(),
    )


# ==================== MODEL TESTS ====================


class TestOTTreatmentTypeModel:
    """Tests for OTTreatmentType model."""

    def test_create_treatment_type(self, ot_treatment_type):
        """Should create treatment type with all fields."""
        assert ot_treatment_type.code == "OT-ADL-001"
        assert ot_treatment_type.name == "ADL Assessment & Training"
        assert ot_treatment_type.category == "ADL_TRAINING"
        assert ot_treatment_type.cost_per_session == Decimal("2500.00")
        assert ot_treatment_type.sha_claimable is True
        assert ot_treatment_type.is_active is True

    def test_treatment_type_str(self, ot_treatment_type):
        """Should return formatted string representation."""
        assert str(ot_treatment_type) == "OT-ADL-001 - ADL Assessment & Training"

    def test_unique_code_constraint(self, ot_treatment_type, db):
        """Should enforce unique code constraint."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            OTTreatmentType.objects.create(
                code="OT-ADL-001",  # Duplicate code
                name="Duplicate Treatment",
                category="ADL_TRAINING",
            )


class TestOccupationalTherapyOrderModel:
    """Tests for OccupationalTherapyOrder model."""

    def test_create_order(self, ot_order):
        """Should create order with auto-generated order number."""
        assert ot_order.order_number.startswith("OT-")
        assert ot_order.status == "DRAFT"
        assert ot_order.sessions_completed == 0
        assert ot_order.total_sessions == 8

    def test_order_number_format(self, ot_order):
        """Order number should follow OT-YYYYMMDD-XXXX format."""
        import re

        pattern = r"^OT-\d{8}-\d{4}$"
        assert re.match(pattern, ot_order.order_number)

    def test_total_cost_calculation(self, ot_order):
        """Should calculate total cost from treatment type and sessions."""
        expected_cost = Decimal("2500.00") * 8  # 8 sessions at 2500 each
        assert ot_order.total_cost == expected_cost

    def test_order_str(self, ot_order):
        """Should return formatted string representation."""
        assert ot_order.order_number in str(ot_order)

    def test_status_transitions(self, ot_order, test_user):
        """Should validate status transitions."""
        # DRAFT -> PENDING: valid
        ot_order.update_status("PENDING", user=test_user)
        assert ot_order.status == "PENDING"

        # PENDING -> APPROVED: valid
        ot_order.update_status("APPROVED", user=test_user)
        assert ot_order.status == "APPROVED"

        # APPROVED -> IN_PROGRESS: valid
        ot_order.update_status("IN_PROGRESS", user=test_user)
        assert ot_order.status == "IN_PROGRESS"

    def test_invalid_status_transition(self, ot_order, test_user):
        """Should reject invalid status transitions."""
        from django.core.exceptions import ValidationError

        # DRAFT -> COMPLETED: invalid
        with pytest.raises(ValidationError):
            ot_order.update_status("COMPLETED", user=test_user)

    def test_progress_percentage(self, ot_order):
        """Should calculate progress percentage correctly."""
        ot_order.sessions_completed = 4
        ot_order.save()
        assert ot_order.progress_percentage == 50.0

    def test_sessions_remaining(self, ot_order):
        """Should calculate remaining sessions correctly."""
        ot_order.sessions_completed = 3
        assert ot_order.sessions_remaining == 5

    def test_order_number_not_modified_on_update(self, ot_order):
        """Order number should not change on update."""
        original_number = ot_order.order_number
        ot_order.clinical_indication = "Updated indication"
        ot_order.save()
        ot_order.refresh_from_db()
        assert ot_order.order_number == original_number


class TestOTSessionModel:
    """Tests for OTSession model."""

    def test_create_session(self, ot_session):
        """Should create session with auto-generated session number."""
        assert ot_session.session_number == 1
        assert ot_session.status == "SCHEDULED"
        assert ot_session.is_billed is False

    def test_session_number_auto_increment(self, approved_ot_order, test_user):
        """Should auto-increment session numbers."""
        session1 = OTSession.objects.create(
            order=approved_ot_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        session2 = OTSession.objects.create(
            order=approved_ot_order,
            therapist=test_user,
            scheduled_date=date.today() + timedelta(days=3),
        )
        assert session1.session_number == 1
        assert session2.session_number == 2

    def test_complete_session(self, ot_session):
        """Should mark session as completed."""
        ot_session.complete_session()
        assert ot_session.status == "COMPLETED"
        assert ot_session.completed_at is not None
        assert ot_session.actual_date == date.today()

    def test_session_str(self, ot_session):
        """Should return formatted string representation."""
        assert "Session 1" in str(ot_session)

    def test_functional_improvement_calculation(self, ot_session):
        """Should calculate functional improvement correctly."""
        ot_session.pre_functional_status = "MOD_ASSIST"
        ot_session.post_functional_status = "MIN_ASSIST"
        ot_session.save()
        assert ot_session.functional_improvement == 1  # Improved by 1 level


class TestGenerateOTOrderNumber:
    """Tests for order number generation."""

    def test_generate_unique_order_numbers(
        self, db, sample_patient, sample_encounter, test_user, ot_treatment_type
    ):
        """Should generate unique sequential order numbers."""
        order1 = OccupationalTherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=ot_treatment_type,
            ordered_by=test_user,
            clinical_indication="Test 1",
            treatment_goals="Goal 1",
        )
        order2 = OccupationalTherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=ot_treatment_type,
            ordered_by=test_user,
            clinical_indication="Test 2",
            treatment_goals="Goal 2",
        )
        assert order1.order_number != order2.order_number
        # Second order should have higher sequence number
        seq1 = int(order1.order_number.split("-")[-1])
        seq2 = int(order2.order_number.split("-")[-1])
        assert seq2 > seq1


# ==================== API TESTS ====================


class TestOTTreatmentTypeAPI:
    """Tests for OTTreatmentType API endpoints."""

    def test_list_treatment_types(self, authenticated_client, ot_treatment_type):
        """Should list treatment types."""
        response = authenticated_client.get("/api/occupational-therapy/treatment-types/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_treatment_type(self, authenticated_client):
        """Should create a new treatment type."""
        data = {
            "code": "OT-HAND-001",
            "name": "Hand Therapy",
            "description": "Upper extremity rehabilitation",
            "category": "HAND_THERAPY",
            "typical_duration_minutes": 45,
            "cost_per_session": "2000.00",
            "sha_claimable": True,
        }
        response = authenticated_client.post("/api/occupational-therapy/treatment-types/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "OT-HAND-001"

    def test_retrieve_treatment_type(self, authenticated_client, ot_treatment_type):
        """Should retrieve a specific treatment type."""
        response = authenticated_client.get(
            f"/api/occupational-therapy/treatment-types/{ot_treatment_type.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "OT-ADL-001"

    def test_filter_by_category(
        self, authenticated_client, ot_treatment_type, ot_treatment_type_cognitive
    ):
        """Should filter treatment types by category."""
        response = authenticated_client.get(
            "/api/occupational-therapy/treatment-types/?category=COGNITIVE_REHAB"
        )
        assert response.status_code == status.HTTP_200_OK
        codes = [t["code"] for t in response.data["results"]]
        assert "OT-COG-001" in codes
        assert "OT-ADL-001" not in codes


class TestOccupationalTherapyOrderAPI:
    """Tests for OccupationalTherapyOrder API endpoints."""

    def test_list_orders(self, authenticated_client, ot_order):
        """Should list OT orders."""
        response = authenticated_client.get("/api/occupational-therapy/orders/")
        assert response.status_code == status.HTTP_200_OK

    def test_create_order(
        self, authenticated_client, sample_patient, sample_encounter, ot_treatment_type
    ):
        """Should create a new OT order."""
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "treatment_type": ot_treatment_type.id,
            "assessment_type": "INITIAL",
            "referral_reason": "STROKE_REHAB",
            "clinical_indication": "Post-stroke rehabilitation",
            "treatment_goals": "Improve ADL independence",
            "total_sessions": 10,
            "frequency": "2x per week",
            "priority": "URGENT",
        }
        response = authenticated_client.post("/api/occupational-therapy/orders/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["order_number"].startswith("OT-")
        assert response.data["status"] == "DRAFT"

    def test_retrieve_order(self, authenticated_client, ot_order):
        """Should retrieve a specific order."""
        response = authenticated_client.get(f"/api/occupational-therapy/orders/{ot_order.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_number"] == ot_order.order_number

    def test_approve_order(self, authenticated_client, ot_order):
        """Should approve a pending order."""
        # First transition to PENDING
        ot_order.status = "PENDING"
        ot_order.save()

        response = authenticated_client.post(
            f"/api/occupational-therapy/orders/{ot_order.id}/approve/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"

    def test_assign_therapist(self, authenticated_client, approved_ot_order, test_user):
        """Should assign therapist to order."""
        response = authenticated_client.post(
            f"/api/occupational-therapy/orders/{approved_ot_order.id}/assign_therapist/",
            {"assigned_therapist": test_user.id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_therapist"] == test_user.id

    def test_generate_sessions(self, authenticated_client, approved_ot_order, test_user):
        """Should generate scheduled sessions."""
        approved_ot_order.assigned_therapist = test_user
        approved_ot_order.save()

        response = authenticated_client.post(
            f"/api/occupational-therapy/orders/{approved_ot_order.id}/generate_sessions/",
            {"start_date": str(date.today())},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "sessions" in response.data
        assert len(response.data["sessions"]) == approved_ot_order.total_sessions

    def test_start_order(self, authenticated_client, approved_ot_order):
        """Should start an approved order."""
        response = authenticated_client.post(
            f"/api/occupational-therapy/orders/{approved_ot_order.id}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_cancel_order(self, authenticated_client, ot_order):
        """Should cancel an order."""
        response = authenticated_client.post(
            f"/api/occupational-therapy/orders/{ot_order.id}/cancel/",
            {"reason": "Patient declined treatment"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_filter_orders_by_patient(self, authenticated_client, ot_order, sample_patient):
        """Should filter orders by patient."""
        response = authenticated_client.get(
            f"/api/occupational-therapy/orders/?patient={sample_patient.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        for order in response.data["results"]:
            assert order["patient"] == sample_patient.id

    def test_filter_orders_by_patient_id_alias(
        self,
        authenticated_client,
        ot_order,
        ot_treatment_type,
        test_user,
        sample_county,
        sample_sub_county,
        sample_organization,
        sample_facility,
    ):
        """Should filter OT orders when frontend sends patient_id."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        other_patient = Patient.objects.create(
            first_name="Grace",
            last_name="Njeri",
            date_of_birth="1984-12-01",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )
        other_encounter = Encounter.objects.create(
            patient=other_patient,
            encounter_type="OPD",
            chief_complaint="ADL difficulty",
            organization=sample_organization,
            facility=sample_facility,
        )
        OccupationalTherapyOrder.objects.create(
            patient=other_patient,
            encounter=other_encounter,
            treatment_type=ot_treatment_type,
            ordered_by=test_user,
            assessment_type="INITIAL",
            referral_reason="ADL_SUPPORT",
            clinical_indication="Other patient OT order",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(
            f"/api/occupational-therapy/orders/?patient_id={ot_order.patient_id}"
        )

        assert response.status_code == status.HTTP_200_OK
        patient_ids = {item["patient"] for item in response.data["results"]}
        assert patient_ids == {ot_order.patient_id}

    def test_filter_orders_by_encounter_id_alias(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        ot_treatment_type,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """Should filter OT orders when frontend sends encounter_id."""
        from hmis.apps.encounters.models import Encounter

        target_order = OccupationalTherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=ot_treatment_type,
            ordered_by=test_user,
            assessment_type="INITIAL",
            referral_reason="ADL_SUPPORT",
            clinical_indication="Target encounter OT order",
            facility=sample_facility,
            organization=sample_organization,
        )
        other_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="ADL follow-up",
            organization=sample_organization,
            facility=sample_facility,
        )
        OccupationalTherapyOrder.objects.create(
            patient=sample_patient,
            encounter=other_encounter,
            treatment_type=ot_treatment_type,
            ordered_by=test_user,
            assessment_type="INITIAL",
            referral_reason="ADL_SUPPORT",
            clinical_indication="Other encounter OT order",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(
            f"/api/occupational-therapy/orders/?encounter_id={sample_encounter.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        order_ids = {item["id"] for item in response.data["results"]}
        assert order_ids == {target_order.id}


class TestOTSessionAPI:
    """Tests for OTSession API endpoints."""

    def test_list_sessions(self, authenticated_client, ot_session):
        """Should list OT sessions."""
        response = authenticated_client.get("/api/occupational-therapy/sessions/")
        assert response.status_code == status.HTTP_200_OK

    def test_create_session(self, authenticated_client, approved_ot_order, test_user):
        """Should create a new session."""
        data = {
            "order": approved_ot_order.id,
            "therapist": test_user.id,
            "scheduled_date": str(date.today()),
            "scheduled_time": "10:00",
        }
        response = authenticated_client.post("/api/occupational-therapy/sessions/", data)
        assert response.status_code == status.HTTP_201_CREATED
        # CreateSerializer returns minimal fields, verify order is in response
        assert response.data["order"] == approved_ot_order.id

    def test_start_session(self, authenticated_client, ot_session):
        """Should start a scheduled session."""
        response = authenticated_client.post(
            f"/api/occupational-therapy/sessions/{ot_session.id}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_complete_session(self, authenticated_client, ot_session):
        """Should complete a session with clinical notes."""
        ot_session.status = "IN_PROGRESS"
        ot_session.save()

        data = {
            "actual_date": str(date.today()),
            "duration_minutes": 45,
            "pre_functional_status": "MOD_ASSIST",
            "activities_performed": "ADL training - dressing, grooming",
            "adl_activities": "Practiced button fastening, shirt donning",
            "patient_response": "Good engagement, minimal frustration",
            "patient_engagement": "GOOD",
            "post_functional_status": "MIN_ASSIST",
            "outcome": "IMPROVED",
            "progress_notes": "Patient showed improvement in dressing skills",
            "home_activities": "Practice button board 2x daily",
        }
        response = authenticated_client.post(
            f"/api/occupational-therapy/sessions/{ot_session.id}/complete/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["outcome"] == "IMPROVED"

    def test_cancel_session(self, authenticated_client, ot_session):
        """Should cancel a scheduled session."""
        response = authenticated_client.post(
            f"/api/occupational-therapy/sessions/{ot_session.id}/cancel/",
            {"reason": "Patient unavailable"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_mark_no_show(self, authenticated_client, ot_session):
        """Should mark session as no-show."""
        response = authenticated_client.post(
            f"/api/occupational-therapy/sessions/{ot_session.id}/no_show/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NO_SHOW"

    def test_reschedule_session(self, authenticated_client, ot_session):
        """Should reschedule a session."""
        new_date = date.today() + timedelta(days=7)
        response = authenticated_client.post(
            f"/api/occupational-therapy/sessions/{ot_session.id}/reschedule/",
            {"scheduled_date": str(new_date), "scheduled_time": "14:00"},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "old_session" in response.data
        assert "new_session" in response.data
        assert response.data["old_session"]["status"] == "RESCHEDULED"


class TestAuthenticationRequired:
    """Tests to verify authentication is required."""

    def test_orders_require_auth(self, api_client):
        """Should reject unauthenticated requests to orders."""
        response = api_client.get("/api/occupational-therapy/orders/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_sessions_require_auth(self, api_client):
        """Should reject unauthenticated requests to sessions."""
        response = api_client.get("/api/occupational-therapy/sessions/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_treatment_types_require_auth(self, api_client):
        """Should reject unauthenticated requests to treatment types."""
        response = api_client.get("/api/occupational-therapy/treatment-types/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
