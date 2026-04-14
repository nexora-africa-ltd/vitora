"""
Tests for the nutrition module.

Following TDD methodology - comprehensive tests for:
- NutritionConsultation model (assessments)
- DietPlan model (meal plans)
- API endpoints and business logic

DHA Compliance Phase 2 - Allied Health Modules
Target: 20+ unit tests
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status

User = get_user_model()


# ============================================================================
# NutritionConsultation Model Tests (10 tests)
# ============================================================================


@pytest.mark.django_db
class TestNutritionConsultation:
    """Tests for NutritionConsultation model."""

    def test_create_consultation_auto_generates_number(self, sample_patient, test_user):
        """Should auto-generate consultation number on creation."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="DIABETES",
            referred_by=test_user,
        )
        assert consultation.consultation_number.startswith("NUT-")
        assert len(consultation.consultation_number.split("-")) == 3

    def test_consultation_number_cannot_be_modified(self, sample_patient, test_user):
        """Consultation number should not change on update."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="WEIGHT_MANAGEMENT",
            referred_by=test_user,
        )
        original_number = consultation.consultation_number

        consultation.referral_notes = "Updated notes"
        consultation.save()

        consultation.refresh_from_db()
        assert consultation.consultation_number == original_number

    def test_consultation_calculates_bmi(self, sample_patient, test_user):
        """Should calculate BMI from weight and height."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="GENERAL",
            weight=Decimal("70.0"),
            height=Decimal("175.0"),
            referred_by=test_user,
        )
        # BMI = 70 / (1.75^2) = 22.9
        assert float(consultation.bmi) == pytest.approx(22.9, rel=0.01)
        assert consultation.bmi_classification == "NORMAL"

    def test_consultation_bmi_classification_underweight(self, sample_patient, test_user):
        """Should classify underweight correctly."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="MALNUTRITION",
            weight=Decimal("45.0"),
            height=Decimal("175.0"),
            referred_by=test_user,
        )
        # BMI = 45 / (1.75^2) = 14.7 (severe underweight)
        assert float(consultation.bmi) < 16.0
        assert consultation.bmi_classification == "UNDERWEIGHT_SEVERE"

    def test_consultation_bmi_classification_obese(self, sample_patient, test_user):
        """Should classify obese correctly."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="WEIGHT_MANAGEMENT",
            weight=Decimal("120.0"),
            height=Decimal("170.0"),
            referred_by=test_user,
        )
        # BMI = 120 / (1.70^2) = 41.5 (obese class III)
        assert consultation.bmi_classification == "OBESE_CLASS_III"

    def test_consultation_calculates_waist_hip_ratio(self, sample_patient, test_user):
        """Should calculate waist-hip ratio."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="CARDIOVASCULAR",
            waist_circumference=Decimal("85.0"),
            hip_circumference=Decimal("100.0"),
            referred_by=test_user,
        )
        # WHR = 85 / 100 = 0.85
        assert float(consultation.waist_hip_ratio) == pytest.approx(0.85, rel=0.01)

    def test_consultation_status_transitions_valid(self, sample_patient, test_user):
        """Should allow valid status transitions."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="GENERAL",
            status="DRAFT",
            referred_by=test_user,
        )

        # DRAFT -> PENDING is valid
        assert consultation.can_transition_to("PENDING")
        consultation.transition_status("PENDING")
        assert consultation.status == "PENDING"

        # PENDING -> IN_PROGRESS is valid
        assert consultation.can_transition_to("IN_PROGRESS")
        consultation.transition_status("IN_PROGRESS")
        assert consultation.status == "IN_PROGRESS"

        # IN_PROGRESS -> COMPLETED is valid
        assert consultation.can_transition_to("COMPLETED")
        consultation.transition_status("COMPLETED")
        assert consultation.status == "COMPLETED"
        assert consultation.completed_at is not None

    def test_consultation_status_transitions_invalid(self, sample_patient, test_user):
        """Should reject invalid status transitions."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="GENERAL",
            status="COMPLETED",
            referred_by=test_user,
        )

        # COMPLETED -> anything is invalid
        assert not consultation.can_transition_to("DRAFT")
        assert not consultation.can_transition_to("IN_PROGRESS")

        with pytest.raises(ValidationError):
            consultation.transition_status("DRAFT")

    def test_consultation_muac_classification(self, sample_patient, test_user):
        """Should return correct MUAC classification."""
        from hmis.apps.nutrition.models import NutritionConsultation

        # Severe malnutrition
        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="MALNUTRITION",
            mid_upper_arm_circumference=Decimal("17.0"),
            referred_by=test_user,
        )
        assert consultation.get_muac_classification() == "SEVERE_MALNUTRITION"

        # Well nourished
        consultation.mid_upper_arm_circumference = Decimal("25.0")
        consultation.save()
        assert consultation.get_muac_classification() == "WELL_NOURISHED"

    def test_consultation_sync_anthropometrics_from_encounter(
        self, sample_patient, sample_encounter, test_user
    ):
        """Should sync weight/height from linked encounter."""
        from hmis.apps.nutrition.models import NutritionConsultation

        # Set encounter vitals
        sample_encounter.weight = Decimal("75.0")
        sample_encounter.height = Decimal("180.0")
        sample_encounter.save()

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            referral_reason="GENERAL",
            referred_by=test_user,
        )

        # No weight/height initially
        assert consultation.weight is None
        assert consultation.height is None

        # Sync from encounter
        updated = consultation.sync_anthropometrics_from_encounter()
        assert updated is True
        assert consultation.weight == Decimal("75.0")
        assert consultation.height == Decimal("180.0")
        assert consultation.bmi is not None


# ============================================================================
# DietPlan Model Tests (8 tests)
# ============================================================================


@pytest.mark.django_db
class TestDietPlan:
    """Tests for DietPlan model."""

    def test_create_diet_plan_auto_generates_number(self, sample_patient, test_user):
        """Should auto-generate plan number on creation."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Diabetic Diet Plan",
            plan_type="DIABETIC",
            created_by=test_user,
        )
        assert plan.plan_number.startswith("DIET-")
        assert len(plan.plan_number.split("-")) == 3

    def test_diet_plan_is_active_property(self, sample_patient, test_user):
        """Should correctly determine if plan is active."""
        from hmis.apps.nutrition.models import DietPlan

        today = date.today()

        # Active plan
        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Active Plan",
            plan_type="WEIGHT_LOSS",
            status="ACTIVE",
            start_date=today - timedelta(days=7),
            end_date=today + timedelta(days=30),
            created_by=test_user,
        )
        assert plan.is_active is True

        # Inactive due to status
        plan.status = "DRAFT"
        plan.save()
        assert plan.is_active is False

        # Inactive due to date
        plan.status = "ACTIVE"
        plan.end_date = today - timedelta(days=1)
        plan.save()
        assert plan.is_active is False

    def test_diet_plan_days_remaining(self, sample_patient, test_user):
        """Should calculate days remaining correctly."""
        from hmis.apps.nutrition.models import DietPlan

        today = date.today()

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Test Plan",
            plan_type="GENERAL_HEALTHY",
            start_date=today,
            end_date=today + timedelta(days=14),
            created_by=test_user,
        )
        assert plan.days_remaining == 14

        # No end date
        plan.end_date = None
        plan.save()
        assert plan.days_remaining is None

    def test_diet_plan_activate(self, sample_patient, test_user):
        """Should activate a draft plan."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Draft Plan",
            plan_type="HIGH_PROTEIN",
            status="DRAFT",
            created_by=test_user,
        )

        assert plan.activated_at is None
        plan.activate(user=test_user)

        plan.refresh_from_db()
        assert plan.status == "ACTIVE"
        assert plan.activated_at is not None

    def test_diet_plan_cannot_activate_completed(self, sample_patient, test_user):
        """Should not allow activating completed plans."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Completed Plan",
            plan_type="RENAL",
            status="COMPLETED",
            created_by=test_user,
        )

        with pytest.raises(ValidationError):
            plan.activate(user=test_user)

    def test_diet_plan_discontinue(self, sample_patient, test_user):
        """Should discontinue an active plan."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Active Plan",
            plan_type="CARDIAC",
            status="ACTIVE",
            created_by=test_user,
        )

        plan.discontinue(reason="Patient non-compliant", user=test_user)

        plan.refresh_from_db()
        assert plan.status == "DISCONTINUED"
        assert plan.discontinued_at is not None
        assert plan.discontinuation_reason == "Patient non-compliant"

    def test_diet_plan_cannot_discontinue_completed(self, sample_patient, test_user):
        """Should not allow discontinuing completed plans."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Completed Plan",
            plan_type="LOW_SODIUM",
            status="COMPLETED",
            created_by=test_user,
        )

        with pytest.raises(ValidationError):
            plan.discontinue(reason="Test", user=test_user)

    def test_diet_plan_str_representation(self, sample_patient, test_user):
        """Should return correct string representation."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Weight Management Plan",
            plan_type="WEIGHT_LOSS",
            created_by=test_user,
        )
        assert "Weight Management Plan" in str(plan)
        assert plan.plan_number in str(plan)


# ============================================================================
# API Tests (5 tests)
# ============================================================================


@pytest.mark.django_db
class TestNutritionConsultationAPI:
    """Tests for NutritionConsultation API endpoints."""

    def test_create_consultation_authenticated(self, authenticated_client, sample_patient):
        """Should create consultation when authenticated."""
        response = authenticated_client.post(
            "/api/nutrition/consultations/",
            {
                "patient": sample_patient.id,
                "referral_reason": "DIABETES",
                "priority": "ROUTINE",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["consultation_number"].startswith("NUT-")
        assert response.data["referral_reason"] == "DIABETES"

    def test_create_consultation_unauthenticated(self, api_client, sample_patient):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/nutrition/consultations/",
            {
                "patient": sample_patient.id,
                "referral_reason": "GENERAL",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_update_consultation_status(self, authenticated_client, sample_patient):
        """Should update consultation status."""
        from hmis.apps.nutrition.models import NutritionConsultation

        consultation = NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="GENERAL",
            status="DRAFT",
        )

        response = authenticated_client.post(
            f"/api/nutrition/consultations/{consultation.id}/update_status/",
            {"status": "IN_PROGRESS"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_list_consultations(self, authenticated_client, sample_patient, test_user):
        """Should list consultations."""
        from hmis.apps.nutrition.models import NutritionConsultation

        # Create multiple consultations
        for i in range(3):
            NutritionConsultation.objects.create(
                patient=sample_patient,
                referral_reason="GENERAL",
                referred_by=test_user,
            )

        response = authenticated_client.get("/api/nutrition/consultations/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 3

    def test_filter_consultations_by_status(self, authenticated_client, sample_patient, test_user):
        """Should filter consultations by status."""
        from hmis.apps.nutrition.models import NutritionConsultation

        NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="GENERAL",
            status="DRAFT",
            referred_by=test_user,
        )
        NutritionConsultation.objects.create(
            patient=sample_patient,
            referral_reason="DIABETES",
            status="COMPLETED",
            referred_by=test_user,
        )

        response = authenticated_client.get("/api/nutrition/consultations/?status=DRAFT")
        assert response.status_code == status.HTTP_200_OK
        for consultation in response.data["results"]:
            assert consultation["status"] == "DRAFT"


@pytest.mark.django_db
class TestDietPlanAPI:
    """Tests for DietPlan API endpoints."""

    def test_create_diet_plan(self, authenticated_client, sample_patient):
        """Should create diet plan when authenticated."""
        response = authenticated_client.post(
            "/api/nutrition/diet-plans/",
            {
                "patient": sample_patient.id,
                "name": "Test Diet Plan",
                "plan_type": "DIABETIC",
                "target_calories": 1800,
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["plan_number"].startswith("DIET-")
        assert response.data["name"] == "Test Diet Plan"

    def test_activate_diet_plan(self, authenticated_client, sample_patient, test_user):
        """Should activate a diet plan."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Draft Plan",
            plan_type="WEIGHT_LOSS",
            status="DRAFT",
            created_by=test_user,
        )

        response = authenticated_client.post(f"/api/nutrition/diet-plans/{plan.id}/activate/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"

    def test_discontinue_diet_plan(self, authenticated_client, sample_patient, test_user):
        """Should discontinue a diet plan with reason."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Active Plan",
            plan_type="RENAL",
            status="ACTIVE",
            created_by=test_user,
        )

        response = authenticated_client.post(
            f"/api/nutrition/diet-plans/{plan.id}/discontinue/",
            {"reason": "Patient requested dietary change"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DISCONTINUED"
        assert "Patient requested" in response.data["discontinuation_reason"]

    def test_discontinue_requires_reason(self, authenticated_client, sample_patient, test_user):
        """Should require reason when discontinuing."""
        from hmis.apps.nutrition.models import DietPlan

        plan = DietPlan.objects.create(
            patient=sample_patient,
            name="Active Plan",
            plan_type="CARDIAC",
            status="ACTIVE",
            created_by=test_user,
        )

        response = authenticated_client.post(
            f"/api/nutrition/diet-plans/{plan.id}/discontinue/",
            {"reason": "short"},  # Too short
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
