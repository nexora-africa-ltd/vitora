"""
Tests for TreatmentPlanTemplate model - Sprint 1.1-1.2.

Tests cover:
1. TreatmentPlanTemplate model creation
2. Template with diagnosis codes (M2M)
3. is_active default
4. String representation
5. TreatmentPlan integration with templates
"""

from datetime import date, timedelta

import pytest # type: ignore
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Local Fixtures
# ============================================================================


@pytest.fixture
def template_test_user(db):
    """Create a test user for template tests."""
    return User.objects.create_user(username="templatedoc", password="testpass123")


@pytest.fixture
def template_sample_patient(db):
    """Create a sample patient for template tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Template",
        last_name="Test",
        date_of_birth=date(1985, 3, 20),
        gender="M",
    )


@pytest.fixture
def template_sample_encounter(db, template_sample_patient):
    """Create a sample encounter for template tests."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=template_sample_patient,
        encounter_type="OPD",
        chief_complaint="Template test complaint",
    )


@pytest.fixture
def template_sample_icd10_code(db):
    """Create a sample ICD-10 code for template tests."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="A00.0",
        description="Cholera due to Vibrio cholerae",
        category="Certain infectious diseases",
        chapter=1,
    )


# ============================================================================
# TreatmentPlanTemplate Model Tests
# ============================================================================


@pytest.mark.unit
class TestTreatmentPlanTemplateModel:
    """Test TreatmentPlanTemplate model implementation."""

    def test_treatment_plan_template_exists(self):
        """Test TreatmentPlanTemplate model exists."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        assert TreatmentPlanTemplate is not None

    def test_create_treatment_plan_template(self, db, template_test_user):
        """Test creating a treatment plan template."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Respiratory Infection Template",
            description="Standard template for respiratory infections",
            default_medications='[{"name": "Amoxicillin", "dosage": "500mg", "frequency": "TDS"}]',
            default_instructions="Rest, fluids, complete antibiotic course",
            follow_up_days=7,
            department="General Medicine",
            created_by=template_test_user,
        )
        assert template.id is not None
        assert template.name == "Respiratory Infection Template"

    def test_template_with_diagnosis_codes(
        self, db, template_test_user, template_sample_icd10_code
    ):
        """Test template can be linked to diagnosis codes."""
        from hmis.apps.encounters.models import ICD10Code, TreatmentPlanTemplate

        code2 = ICD10Code.objects.create(
            code="J06.9",
            description="Acute upper respiratory infection",
            category="Respiratory",
            chapter=10,
        )

        template = TreatmentPlanTemplate.objects.create(
            name="URI Template",
            description="Template for upper respiratory infections",
            follow_up_days=5,
            created_by=template_test_user,
        )
        template.diagnosis_codes.add(template_sample_icd10_code, code2)

        assert template.diagnosis_codes.count() == 2

    def test_template_is_active_default(self, db, template_test_user):
        """Test template is_active defaults to True."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Active Template",
            created_by=template_test_user,
        )
        assert template.is_active is True

    def test_template_string_representation(self, db, template_test_user):
        """Test template __str__ method."""
        from hmis.apps.encounters.models import TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Malaria Treatment",
            created_by=template_test_user,
        )
        assert str(template) == "Malaria Treatment"


# ============================================================================
# TreatmentPlan with Template Integration Tests
# ============================================================================


@pytest.mark.unit
class TestTreatmentPlanWithTemplate:
    """Test TreatmentPlan integration with templates."""

    def test_treatment_plan_has_template_fk(self, template_sample_encounter):
        """Test TreatmentPlan has template foreign key."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=template_sample_encounter,
            clinical_notes="Test plan",
        )
        assert hasattr(plan, "template")

    def test_treatment_plan_apply_template_method(
        self, template_sample_encounter, template_test_user
    ):
        """Test TreatmentPlan.apply_template() method."""
        from hmis.apps.encounters.models import TreatmentPlan, TreatmentPlanTemplate

        template = TreatmentPlanTemplate.objects.create(
            name="Apply Test Template",
            default_medications='[{"name": "Paracetamol", "dosage": "500mg"}]',
            default_instructions="Take with water",
            follow_up_days=14,
            created_by=template_test_user,
        )

        plan = TreatmentPlan.objects.create(
            encounter=template_sample_encounter,
            clinical_notes="Before template",
        )
        plan.apply_template(template)

        assert plan.template == template
        assert "Paracetamol" in plan.medications_json
        assert plan.follow_up_instructions == "Take with water"
        assert plan.follow_up_date == date.today() + timedelta(days=14)
