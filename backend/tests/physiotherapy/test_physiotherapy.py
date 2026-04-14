"""
Tests for the physiotherapy module.

Following TDD methodology - comprehensive tests for:
- PhysiotherapyTreatmentType model (catalog)
- PhysiotherapyOrder model (referrals)
- PhysiotherapySession model (treatment sessions)
- API endpoints and business logic

DHA Compliance Phase 2 - Allied Health Modules
Target: 25+ unit tests
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import status

User = get_user_model()


# ============================================================================
# PhysiotherapyTreatmentType Model Tests (5 tests)
# ============================================================================


@pytest.mark.django_db
class TestPhysiotherapyTreatmentType:
    """Tests for PhysiotherapyTreatmentType (catalog) model."""

    def test_create_treatment_type_with_required_fields(self):
        """Should create treatment type with required fields."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        treatment_type = PhysiotherapyTreatmentType.objects.create(
            code="PT-MSK-001",
            name="Manual Therapy - Spine",
            category="MUSCULOSKELETAL",
            cost_per_session=Decimal("1500.00"),
        )
        assert treatment_type.code == "PT-MSK-001"
        assert treatment_type.name == "Manual Therapy - Spine"
        assert treatment_type.category == "MUSCULOSKELETAL"
        assert treatment_type.is_active is True
        assert treatment_type.sha_claimable is True

    def test_treatment_type_code_uniqueness(self):
        """Treatment type code should be unique."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        PhysiotherapyTreatmentType.objects.create(
            code="PT-NEURO-001",
            name="Neurological Rehabilitation",
            category="NEUROLOGICAL",
        )
        with pytest.raises(IntegrityError):
            PhysiotherapyTreatmentType.objects.create(
                code="PT-NEURO-001",  # Duplicate
                name="Another Neuro Treatment",
                category="NEUROLOGICAL",
            )

    def test_treatment_type_category_choices(self):
        """Should accept valid category choices."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        categories = [
            "MUSCULOSKELETAL",
            "NEUROLOGICAL",
            "CARDIORESPIRATORY",
            "PEDIATRIC",
            "SPORTS",
        ]
        for i, category in enumerate(categories):
            treatment_type = PhysiotherapyTreatmentType.objects.create(
                code=f"TEST-{category}-{i}",
                name=f"Test Treatment {category}",
                category=category,
            )
            assert treatment_type.category == category

    def test_treatment_type_default_values(self):
        """Should have correct default values."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        treatment_type = PhysiotherapyTreatmentType.objects.create(
            code="PT-DEFAULT-001",
            name="Default Test",
            category="OTHER",
        )
        assert treatment_type.typical_duration_minutes == 30
        assert treatment_type.recommended_sessions == 6
        assert treatment_type.recommended_frequency == "2x per week"
        assert treatment_type.cost_per_session == Decimal("0.00")

    def test_treatment_type_str_representation(self):
        """Should return correct string representation."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        treatment_type = PhysiotherapyTreatmentType.objects.create(
            code="PT-STR-001",
            name="Strength Training",
            category="SPORTS",
        )
        assert str(treatment_type) == "PT-STR-001 - Strength Training"


# ============================================================================
# PhysiotherapyOrder Model Tests (10 tests)
# ============================================================================


@pytest.mark.django_db
class TestPhysiotherapyOrder:
    """Tests for PhysiotherapyOrder model."""

    @pytest.fixture
    def treatment_type(self):
        """Create a treatment type for testing."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        return PhysiotherapyTreatmentType.objects.create(
            code="PT-TEST-001",
            name="Test Treatment",
            category="MUSCULOSKELETAL",
            cost_per_session=Decimal("1000.00"),
        )

    def test_create_order_auto_generates_order_number(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should auto-generate order number on creation."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Post-surgery rehabilitation",
        )
        assert order.order_number.startswith("PHYSIO-")
        assert len(order.order_number.split("-")) == 3

    def test_order_number_cannot_be_modified(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Order number should not change on update."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test indication",
        )
        original_number = order.order_number

        order.clinical_indication = "Updated indication"
        order.order_number = "PHYSIO-99999999-9999"  # Attempt to change
        order.save()

        order.refresh_from_db()
        assert order.order_number == original_number

    def test_order_calculates_total_cost(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should calculate total cost based on sessions and treatment type."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            total_sessions=10,
        )
        # 10 sessions * 1000 per session = 10000
        assert order.total_cost == Decimal("10000.00")

    def test_order_status_transitions_valid(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should allow valid status transitions."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            status="DRAFT",
        )

        # DRAFT -> PENDING
        order.update_status("PENDING", user=test_user)
        assert order.status == "PENDING"

        # PENDING -> APPROVED
        order.update_status("APPROVED", user=test_user)
        assert order.status == "APPROVED"

        # APPROVED -> IN_PROGRESS
        order.update_status("IN_PROGRESS", user=test_user)
        assert order.status == "IN_PROGRESS"

        # IN_PROGRESS -> COMPLETED
        order.update_status("COMPLETED", user=test_user)
        assert order.status == "COMPLETED"
        assert order.completed_at is not None

    def test_order_status_transition_invalid(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should reject invalid status transitions."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            status="DRAFT",
        )

        # DRAFT -> COMPLETED (invalid - must go through intermediate steps)
        with pytest.raises(ValidationError):
            order.update_status("COMPLETED", user=test_user)

    def test_order_sessions_remaining_property(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should calculate remaining sessions correctly."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            total_sessions=10,
            sessions_completed=4,
        )
        assert order.sessions_remaining == 6

    def test_order_progress_percentage_property(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should calculate progress percentage correctly."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            total_sessions=10,
            sessions_completed=3,
        )
        assert order.progress_percentage == 30.0

    def test_order_default_values(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should have correct default values."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        assert order.status == "DRAFT"
        assert order.priority == "ROUTINE"
        assert order.total_sessions == 6
        assert order.sessions_completed == 0
        assert order.frequency == "2x per week"
        assert order.is_paid is False

    def test_order_str_representation(
        self, sample_patient, sample_encounter, test_user, treatment_type
    ):
        """Should return correct string representation."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        assert sample_patient.first_name in str(order) or order.order_number in str(order)


# ============================================================================
# PhysiotherapySession Model Tests (7 tests)
# ============================================================================


@pytest.mark.django_db
class TestPhysiotherapySession:
    """Tests for PhysiotherapySession model."""

    @pytest.fixture
    def treatment_type(self):
        """Create a treatment type for testing."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        return PhysiotherapyTreatmentType.objects.create(
            code="PT-SESSION-001",
            name="Session Test Treatment",
            category="MUSCULOSKELETAL",
            cost_per_session=Decimal("1000.00"),
        )

    @pytest.fixture
    def physio_order(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        treatment_type,
        sample_facility,
        sample_organization,
    ):
        """Create a physiotherapy order for testing."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test indication",
            status="APPROVED",
            facility=sample_facility,
            organization=sample_organization,
        )
        return order

    def test_create_session_auto_generates_session_number(self, physio_order, test_user):
        """Should auto-generate session number on creation."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        assert session.session_number == 1

    def test_session_numbers_increment(self, physio_order, test_user):
        """Session numbers should auto-increment."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session1 = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        session2 = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today() + timedelta(days=3),
        )
        assert session1.session_number == 1
        assert session2.session_number == 2

    def test_session_order_uniqueness(self, physio_order, test_user):
        """Session number should be unique within an order."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            session_number=1,
            scheduled_date=date.today(),
        )
        with pytest.raises(IntegrityError):
            PhysiotherapySession.objects.create(
                order=physio_order,
                therapist=test_user,
                session_number=1,  # Duplicate within same order
                scheduled_date=date.today(),
            )

    def test_session_complete_updates_order(self, physio_order, test_user):
        """Completing a session should update order progress."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        session.complete_session(user=test_user)

        physio_order.refresh_from_db()
        assert session.status == "COMPLETED"
        assert session.completed_at is not None
        assert physio_order.sessions_completed == 1

    def test_session_pain_improvement_calculation(self, physio_order, test_user):
        """Should calculate pain improvement correctly."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
            pre_pain_score=7,
            post_pain_score=4,
        )
        # Negative value indicates improvement (pain reduced)
        assert session.pain_improvement == -3

    def test_session_default_status(self, physio_order, test_user):
        """Should have SCHEDULED as default status."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        assert session.status == "SCHEDULED"

    def test_session_str_representation(self, physio_order, test_user):
        """Should return correct string representation."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        assert "Session 1" in str(session)


# ============================================================================
# PhysiotherapyOrder API Tests (8 tests)
# ============================================================================


@pytest.mark.django_db
class TestPhysiotherapyOrderAPI:
    """Tests for PhysiotherapyOrder API endpoints."""

    @pytest.fixture
    def treatment_type(self):
        """Create a treatment type for testing."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        return PhysiotherapyTreatmentType.objects.create(
            code="PT-API-001",
            name="API Test Treatment",
            category="MUSCULOSKELETAL",
            cost_per_session=Decimal("1500.00"),
        )

    @pytest.fixture
    def order_data(self, sample_patient, sample_encounter, treatment_type):
        """Sample order data for API tests."""
        return {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "treatment_type": treatment_type.id,
            "referral_reason": "POST_INJURY",
            "clinical_indication": "Post ACL reconstruction rehabilitation",
            "total_sessions": 12,
            "frequency": "3x per week",
            "treatment_goals": "Restore knee mobility and strength",
            "priority": "ROUTINE",
        }

    def test_create_order_success(self, authenticated_client, order_data):
        """Should create order via API."""
        response = authenticated_client.post("/api/physiotherapy/orders/", order_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["order_number"].startswith("PHYSIO-")
        assert response.data["status"] == "DRAFT"

    def test_create_order_without_auth_fails(self, api_client, order_data):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/physiotherapy/orders/", order_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_orders(
        self, authenticated_client, sample_patient, sample_encounter, treatment_type, test_user
    ):
        """Should list orders."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test 1",
        )
        PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test 2",
        )

        response = authenticated_client.get("/api/physiotherapy/orders/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 2

    def test_retrieve_order(
        self, authenticated_client, sample_patient, sample_encounter, treatment_type, test_user
    ):
        """Should retrieve single order."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
        )

        response = authenticated_client.get(f"/api/physiotherapy/orders/{order.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_number"] == order.order_number

    def test_update_order_status_action(
        self, authenticated_client, sample_patient, sample_encounter, treatment_type, test_user
    ):
        """Should update order status via action endpoint."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            status="DRAFT",
        )

        response = authenticated_client.post(
            f"/api/physiotherapy/orders/{order.id}/update_status/",
            {"status": "PENDING", "notes": "Submitting for approval"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PENDING"

    def test_approve_order_action(
        self, authenticated_client, sample_patient, sample_encounter, treatment_type, test_user
    ):
        """Should approve pending order."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            status="PENDING",
        )

        response = authenticated_client.post(f"/api/physiotherapy/orders/{order.id}/approve/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPROVED"

    def test_assign_therapist_action(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        treatment_type,
        test_user,
        another_user,
    ):
        """Should assign therapist to order."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        order = PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            status="APPROVED",
        )

        response = authenticated_client.post(
            f"/api/physiotherapy/orders/{order.id}/assign_therapist/",
            {"assigned_therapist": another_user.id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_therapist"] == another_user.id

    def test_filter_orders_by_status(
        self, authenticated_client, sample_patient, sample_encounter, treatment_type, test_user
    ):
        """Should filter orders by status."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Draft order",
            status="DRAFT",
        )
        PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Pending order",
            status="PENDING",
        )

        response = authenticated_client.get("/api/physiotherapy/orders/?status=pending")
        assert response.status_code == status.HTTP_200_OK
        for order in response.data["results"]:
            assert order["status"] == "PENDING"


# ============================================================================
# PhysiotherapySession API Tests (5 tests)
# ============================================================================


@pytest.mark.django_db
class TestPhysiotherapySessionAPI:
    """Tests for PhysiotherapySession API endpoints."""

    @pytest.fixture
    def treatment_type(self):
        """Create a treatment type for testing."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        return PhysiotherapyTreatmentType.objects.create(
            code="PT-SESSION-API-001",
            name="Session API Test",
            category="MUSCULOSKELETAL",
            cost_per_session=Decimal("1000.00"),
        )

    @pytest.fixture
    def physio_order(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        treatment_type,
        sample_facility,
        sample_organization,
    ):
        """Create a physiotherapy order for testing."""
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        return PhysiotherapyOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            treatment_type=treatment_type,
            ordered_by=test_user,
            clinical_indication="Test",
            status="APPROVED",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_create_session(self, authenticated_client, physio_order, test_user):
        """Should create session via API."""
        response = authenticated_client.post(
            "/api/physiotherapy/sessions/",
            {
                "order": physio_order.id,
                "therapist": test_user.id,
                "scheduled_date": str(date.today()),
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["session_number"] == 1

    def test_start_session_action(self, authenticated_client, physio_order, test_user):
        """Should start a scheduled session."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )

        response = authenticated_client.post(f"/api/physiotherapy/sessions/{session.id}/start/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_complete_session_action(self, authenticated_client, physio_order, test_user):
        """Should complete session with documentation."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
            status="IN_PROGRESS",
        )

        response = authenticated_client.post(
            f"/api/physiotherapy/sessions/{session.id}/complete/",
            {
                "pre_pain_score": 6,
                "post_pain_score": 3,
                "interventions": "Manual therapy, exercises",
                "outcome": "IMPROVED",
                "progress_notes": "Good response to treatment",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["outcome"] == "IMPROVED"

    def test_cancel_session_action(self, authenticated_client, physio_order, test_user):
        """Should cancel a scheduled session."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        session = PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )

        response = authenticated_client.post(
            f"/api/physiotherapy/sessions/{session.id}/cancel/",
            {"reason": "Patient requested reschedule"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_today_sessions_action(self, authenticated_client, physio_order, test_user):
        """Should list today's scheduled sessions."""
        from hmis.apps.physiotherapy.models import PhysiotherapySession

        # Create today's session
        PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today(),
        )
        # Create tomorrow's session
        PhysiotherapySession.objects.create(
            order=physio_order,
            therapist=test_user,
            scheduled_date=date.today() + timedelta(days=1),
        )

        response = authenticated_client.get("/api/physiotherapy/sessions/today/")
        assert response.status_code == status.HTTP_200_OK
        # Only today's sessions should be returned
        for session in response.data:
            assert session["scheduled_date"] == str(date.today())


# ============================================================================
# PhysiotherapyTreatmentType API Tests (3 tests)
# ============================================================================


@pytest.mark.django_db
class TestPhysiotherapyTreatmentTypeAPI:
    """Tests for PhysiotherapyTreatmentType API endpoints."""

    def test_list_treatment_types(self, authenticated_client):
        """Should list active treatment types."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        PhysiotherapyTreatmentType.objects.create(
            code="PT-LIST-001",
            name="List Test 1",
            category="MUSCULOSKELETAL",
        )
        PhysiotherapyTreatmentType.objects.create(
            code="PT-LIST-002",
            name="List Test 2",
            category="NEUROLOGICAL",
        )

        response = authenticated_client.get("/api/physiotherapy/treatment-types/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 2

    def test_filter_treatment_types_by_category(self, authenticated_client):
        """Should filter treatment types by category."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        PhysiotherapyTreatmentType.objects.create(
            code="PT-FILTER-MSK",
            name="MSK Treatment",
            category="MUSCULOSKELETAL",
        )
        PhysiotherapyTreatmentType.objects.create(
            code="PT-FILTER-NEURO",
            name="Neuro Treatment",
            category="NEUROLOGICAL",
        )

        response = authenticated_client.get(
            "/api/physiotherapy/treatment-types/?category=musculoskeletal"
        )
        assert response.status_code == status.HTTP_200_OK
        for item in response.data["results"]:
            assert item["category"] == "MUSCULOSKELETAL"

    def test_search_treatment_types(self, authenticated_client):
        """Should search treatment types by name or code."""
        from hmis.apps.physiotherapy.models import PhysiotherapyTreatmentType

        PhysiotherapyTreatmentType.objects.create(
            code="PT-SEARCH-001",
            name="Spinal Mobilization",
            category="MUSCULOSKELETAL",
        )

        response = authenticated_client.get("/api/physiotherapy/treatment-types/?search=spinal")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1
        assert "Spinal" in response.data["results"][0]["name"]
