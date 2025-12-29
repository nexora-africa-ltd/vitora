"""
Tests for Django Admin registrations - Sprint 1.1-1.2.

Tests cover:
1. ICD10Code admin registration
2. Diagnosis inline on Encounter admin
3. TreatmentPlan inline on Encounter admin
4. TreatmentPlanTemplate admin registration
5. Admin list_display and search_fields
"""

import pytest

pytestmark = pytest.mark.django_db


# ============================================================================
# Admin Registration Tests
# ============================================================================


@pytest.mark.unit
class TestAdminRegistrations:
    """Test Django Admin registrations for new models."""

    def test_icd10code_admin_registered(self):
        """Test ICD10Code is registered in admin."""
        from django.contrib import admin

        from hmis.apps.encounters.models import ICD10Code

        assert ICD10Code in admin.site._registry

    def test_diagnosis_admin_accessible_via_encounter(self):
        """Test Diagnosis is accessible as inline on Encounter admin."""
        from django.contrib import admin

        from hmis.apps.encounters.models import Encounter

        admin_instance = admin.site._registry.get(Encounter)
        assert admin_instance is not None

        # Check for DiagnosisInline
        inline_names = [inline.__name__ for inline in admin_instance.inlines]
        assert "DiagnosisInline" in inline_names

    def test_treatment_plan_admin_accessible_via_encounter(self):
        """Test TreatmentPlan is accessible as inline on Encounter admin."""
        from django.contrib import admin

        from hmis.apps.encounters.models import Encounter

        admin_instance = admin.site._registry.get(Encounter)
        assert admin_instance is not None

        # Check for TreatmentPlanInline
        inline_names = [inline.__name__ for inline in admin_instance.inlines]
        assert "TreatmentPlanInline" in inline_names

    def test_treatment_plan_template_admin_registered(self):
        """Test TreatmentPlanTemplate is registered in admin."""
        from django.contrib import admin

        from hmis.apps.encounters.models import TreatmentPlanTemplate

        assert TreatmentPlanTemplate in admin.site._registry

    def test_icd10code_admin_list_display(self):
        """Test ICD10CodeAdmin has appropriate list_display."""
        from django.contrib import admin

        from hmis.apps.encounters.models import ICD10Code

        admin_instance = admin.site._registry.get(ICD10Code)
        assert "code" in admin_instance.list_display
        assert "is_billable" in admin_instance.list_display
        assert "is_active" in admin_instance.list_display

    def test_icd10code_admin_search_fields(self):
        """Test ICD10CodeAdmin has search fields."""
        from django.contrib import admin

        from hmis.apps.encounters.models import ICD10Code

        admin_instance = admin.site._registry.get(ICD10Code)
        assert "code" in admin_instance.search_fields
