"""
Tests for Treatment Plan Module gaps - TDD approach for Sprint 1.1-1.2.

Closes gaps identified:
1. TreatmentPlanTemplate API endpoints
2. Apply template endpoint
3. Suggest templates by diagnosis
4. Validation tests (JSON format, follow-up date, approval)
5. Workflow tests (status transitions)
6. Missing model fields
"""

from datetime import date, timedelta
from decimal import Decimal
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def test_user(db):
    """Create test user."""
    return User.objects.create_user(username="treatmentuser", password="testpass123")


@pytest.fixture
def another_user(db):
    """Create another user for approval tests."""
    return User.objects.create_user(username="approver", password="testpass123")


@pytest.fixture
def authenticated_client(test_user):
    """Provide authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=test_user)
    return client


@pytest.fixture
def sample_patient(db):
    """Create sample patient."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth=date(1990, 5, 15),
        gender="M",
    )


@pytest.fixture
def sample_encounter(sample_patient):
    """Create sample encounter."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Follow-up visit",
    )


@pytest.fixture
def sample_icd10_code(db):
    """Create sample ICD-10 code."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="J18.9",
        description="Pneumonia, unspecified",
        category="Respiratory diseases",
        chapter=10,
    )


@pytest.fixture
def sample_template(test_user, sample_icd10_code):
    """Create sample treatment plan template."""
    from hmis.apps.encounters.models import TreatmentPlanTemplate

    template = TreatmentPlanTemplate.objects.create(
        name="Pneumonia Standard Treatment",
        description="Standard treatment protocol for pneumonia",
        default_medications='[{"name": "Amoxicillin", "dosage": "500mg", "frequency": "TDS"}]',
        default_procedures='[{"name": "Chest X-Ray", "notes": "PA view"}]',
        default_instructions="Complete full course of antibiotics. Rest and hydrate.",
        follow_up_days=7,
        department="Internal Medicine",
        created_by=test_user,
    )
    template.diagnosis_codes.add(sample_icd10_code)
    return template


@pytest.fixture
def sample_treatment_plan(sample_encounter):
    """Create sample treatment plan."""
    from hmis.apps.encounters.models import TreatmentPlan

    return TreatmentPlan.objects.create(
        encounter=sample_encounter,
        clinical_notes="Initial treatment plan",
        status="ACTIVE",
    )


# ============================================================================
# 1. TREATMENT PLAN TEMPLATE API TESTS
# ============================================================================


@pytest.mark.integration
class TestTreatmentPlanTemplateAPI:
    """Test TreatmentPlanTemplate API endpoints."""

    def test_list_templates(self, authenticated_client, sample_template):
        """Test GET /api/treatment-templates/ - List templates."""
        response = authenticated_client.get("/api/treatment-templates/")

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert any(t["name"] == "Pneumonia Standard Treatment" for t in results)

    def test_list_templates_filters_inactive(self, authenticated_client, test_user):
        """Test inactive templates are excluded by default."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        TreatmentPlanTemplate.objects.create(
            name="Active Template",
            is_active=True,
            created_by=test_user,
        )
        TreatmentPlanTemplate.objects.create(
            name="Inactive Template",
            is_active=False,
            created_by=test_user,
        )

        response = authenticated_client.get("/api/treatment-templates/")

        results = response.data.get("results", response.data)
        names = [t["name"] for t in results]
        assert "Active Template" in names
        assert "Inactive Template" not in names

    def test_create_template(self, authenticated_client, test_user):
        """Test POST /api/treatment-templates/ - Create template."""
        data = {
            "name": "New Protocol",
            "description": "A new treatment protocol",
            "default_medications": '[{"name": "Drug A", "dosage": "10mg"}]',
            "default_instructions": "Take as directed",
            "follow_up_days": 14,
            "department": "Cardiology",
        }

        response = authenticated_client.post(
            "/api/treatment-templates/",
            data=data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["name"] == "New Protocol"
        assert response.data["follow_up_days"] == 14

    def test_retrieve_template(self, authenticated_client, sample_template):
        """Test GET /api/treatment-templates/{id}/ - Retrieve template."""
        response = authenticated_client.get(f"/api/treatment-templates/{sample_template.id}/")

        assert response.status_code == 200
        assert response.data["name"] == "Pneumonia Standard Treatment"
        assert "diagnosis_codes" in response.data

    def test_update_template(self, authenticated_client, sample_template):
        """Test PATCH /api/treatment-templates/{id}/ - Update template."""
        data = {"follow_up_days": 10}

        response = authenticated_client.patch(
            f"/api/treatment-templates/{sample_template.id}/",
            data=data,
            format="json",
        )

        assert response.status_code == 200
        assert response.data["follow_up_days"] == 10

    def test_suggest_templates_by_diagnosis(self, authenticated_client, sample_template, sample_icd10_code):
        """Test GET /api/treatment-templates/suggest/?diagnosis=<code> - Suggest by diagnosis."""
        response = authenticated_client.get(
            f"/api/treatment-templates/suggest/?diagnosis={sample_icd10_code.code}"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert any(t["name"] == "Pneumonia Standard Treatment" for t in results)

    def test_suggest_templates_no_match(self, authenticated_client):
        """Test suggest returns empty when no matching diagnosis."""
        response = authenticated_client.get("/api/treatment-templates/suggest/?diagnosis=Z99.9")

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_template_requires_authentication(self):
        """Test template endpoints require authentication."""
        client = APIClient()  # Not authenticated

        response = client.get("/api/treatment-templates/")
        assert response.status_code == 401


# ============================================================================
# 2. APPLY TEMPLATE ENDPOINT TESTS
# ============================================================================


@pytest.mark.integration
class TestApplyTemplateEndpoint:
    """Test apply-template endpoint."""

    def test_apply_template_to_treatment_plan(
        self, authenticated_client, sample_encounter, sample_template
    ):
        """Test POST /api/encounters/{id}/treatment-plan/apply-template/."""
        from hmis.apps.encounters.models import TreatmentPlan

        # Create treatment plan first
        TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Initial notes",
        )

        data = {"template_id": sample_template.id}

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/apply-template/",
            data=data,
            format="json",
        )

        assert response.status_code == 200
        assert response.data["template"] == sample_template.id
        assert "Amoxicillin" in response.data["medications_json"]
        assert response.data["follow_up_instructions"] == sample_template.default_instructions

    def test_apply_template_creates_plan_if_not_exists(
        self, authenticated_client, sample_encounter, sample_template
    ):
        """Test apply-template creates treatment plan if none exists."""
        data = {"template_id": sample_template.id}

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/apply-template/",
            data=data,
            format="json",
        )

        assert response.status_code == 200
        assert response.data["template"] == sample_template.id

    def test_apply_template_sets_follow_up_date(
        self, authenticated_client, sample_encounter, sample_template
    ):
        """Test apply-template calculates follow-up date."""
        data = {"template_id": sample_template.id}

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/apply-template/",
            data=data,
            format="json",
        )

        expected_date = (date.today() + timedelta(days=7)).isoformat()
        assert response.data["follow_up_date"] == expected_date

    def test_apply_template_invalid_template_id(self, authenticated_client, sample_encounter):
        """Test apply-template with invalid template ID."""
        data = {"template_id": 99999}

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/apply-template/",
            data=data,
            format="json",
        )

        assert response.status_code == 404

    def test_apply_template_missing_template_id(self, authenticated_client, sample_encounter):
        """Test apply-template without template_id."""
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/apply-template/",
            data={},
            format="json",
        )

        assert response.status_code == 400


# ============================================================================
# 3. TREATMENT PLAN VALIDATION TESTS
# ============================================================================


@pytest.mark.unit
class TestTreatmentPlanValidation:
    """Test TreatmentPlan validation rules."""

    def test_medications_json_valid_format(self, sample_encounter):
        """Test medications_json accepts valid JSON."""
        from hmis.apps.encounters.models import TreatmentPlan

        valid_json = json.dumps([
            {"name": "Drug A", "dosage": "10mg", "frequency": "BD"},
            {"name": "Drug B", "dosage": "5mg", "frequency": "OD"},
        ])

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            medications_json=valid_json,
        )

        parsed = json.loads(plan.medications_json)
        assert len(parsed) == 2
        assert parsed[0]["name"] == "Drug A"

    def test_procedures_json_valid_format(self, sample_encounter):
        """Test procedures_json accepts valid JSON."""
        from hmis.apps.encounters.models import TreatmentPlan

        valid_json = json.dumps([
            {"name": "Blood Test", "notes": "FBC + RFT"},
            {"name": "X-Ray", "notes": "Chest PA"},
        ])

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            procedures_json=valid_json,
        )

        parsed = json.loads(plan.procedures_json)
        assert len(parsed) == 2

    def test_follow_up_date_can_be_today(self, sample_encounter):
        """Test follow-up date can be today."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            follow_up_date=date.today(),
        )

        assert plan.follow_up_date == date.today()

    def test_follow_up_date_can_be_future(self, sample_encounter):
        """Test follow-up date can be in the future."""
        from hmis.apps.encounters.models import TreatmentPlan

        future_date = date.today() + timedelta(days=30)
        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            follow_up_date=future_date,
        )

        assert plan.follow_up_date == future_date


# ============================================================================
# 4. TREATMENT PLAN WORKFLOW TESTS
# ============================================================================


@pytest.mark.unit
class TestTreatmentPlanWorkflow:
    """Test TreatmentPlan status workflow transitions."""

    def test_default_status_is_active(self, sample_encounter):
        """Test default status is ACTIVE."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="New plan",
        )

        assert plan.status == "ACTIVE"

    def test_active_to_completed_transition(self, sample_encounter):
        """Test transition from ACTIVE to COMPLETED."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            status="ACTIVE",
        )

        plan.status = "COMPLETED"
        plan.save()
        plan.refresh_from_db()

        assert plan.status == "COMPLETED"

    def test_active_to_cancelled_transition(self, sample_encounter):
        """Test transition from ACTIVE to CANCELLED."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            status="ACTIVE",
        )

        plan.status = "CANCELLED"
        plan.save()
        plan.refresh_from_db()

        assert plan.status == "CANCELLED"

    def test_completed_plan_cannot_be_reactivated(self, sample_encounter):
        """Test COMPLETED plan cannot go back to ACTIVE."""
        from hmis.apps.encounters.models import TreatmentPlan
        from django.core.exceptions import ValidationError

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            status="COMPLETED",
        )

        plan.status = "ACTIVE"
        with pytest.raises(ValidationError):
            plan.full_clean()

    def test_cancelled_plan_cannot_be_reactivated(self, sample_encounter):
        """Test CANCELLED plan cannot go back to ACTIVE."""
        from hmis.apps.encounters.models import TreatmentPlan
        from django.core.exceptions import ValidationError

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            status="CANCELLED",
        )

        plan.status = "ACTIVE"
        with pytest.raises(ValidationError):
            plan.full_clean()


# ============================================================================
# 5. MISSING MODEL FIELDS TESTS
# ============================================================================


@pytest.mark.unit
class TestTreatmentPlanModelFields:
    """Test TreatmentPlan has all required fields."""

    def test_has_procedures_json_field(self, sample_encounter):
        """Test TreatmentPlan has procedures_json field."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            procedures_json='[{"name": "ECG"}]',
        )

        assert plan.procedures_json == '[{"name": "ECG"}]'

    def test_has_diet_recommendations_field(self, sample_encounter):
        """Test TreatmentPlan has diet_recommendations field."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            diet_recommendations="Low sodium diet",
        )

        assert plan.diet_recommendations == "Low sodium diet"

    def test_has_activity_restrictions_field(self, sample_encounter):
        """Test TreatmentPlan has activity_restrictions field."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            activity_restrictions="Bed rest for 3 days",
        )

        assert plan.activity_restrictions == "Bed rest for 3 days"

    def test_has_referral_fields(self, sample_encounter):
        """Test TreatmentPlan has referral fields."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            referral_needed=True,
            referral_specialty="Cardiology",
            referral_notes="Refer for cardiac evaluation",
        )

        assert plan.referral_needed is True
        assert plan.referral_specialty == "Cardiology"
        assert plan.referral_notes == "Refer for cardiac evaluation"

    def test_has_created_by_field(self, sample_encounter, test_user):
        """Test TreatmentPlan has created_by field."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            created_by=test_user,
        )

        assert plan.created_by == test_user

    def test_has_approved_by_field(self, sample_encounter, test_user, another_user):
        """Test TreatmentPlan has approved_by field."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            created_by=test_user,
            approved_by=another_user,
        )

        assert plan.approved_by == another_user


# ============================================================================
# 6. REFERRAL FUNCTIONALITY TESTS
# ============================================================================


@pytest.mark.unit
class TestReferralFunctionality:
    """Test referral-related functionality."""

    def test_referral_needed_default_false(self, sample_encounter):
        """Test referral_needed defaults to False."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
        )

        assert plan.referral_needed is False

    def test_has_referral_property(self, sample_encounter):
        """Test has_referral property."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan_without = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            referral_needed=False,
        )
        assert plan_without.has_referral is False

    def test_referral_specialty_options(self, sample_encounter):
        """Test referral specialty can be set."""
        from hmis.apps.encounters.models import TreatmentPlan

        specialties = ["Cardiology", "Neurology", "Orthopedics", "Oncology"]

        for specialty in specialties:
            # Delete existing plan
            TreatmentPlan.objects.filter(encounter=sample_encounter).delete()

            plan = TreatmentPlan.objects.create(
                encounter=sample_encounter,
                referral_needed=True,
                referral_specialty=specialty,
            )
            assert plan.referral_specialty == specialty
