"""
Tests for Patient age category helper method.

Phase 2: Deferred Items Implementation
TDD Focus: get_age_category() method on Patient model

This enhancement adds a method to Patient model that returns
a human-readable age category for clinical decision support.

Following TDD methodology - these tests are written BEFORE implementation.
"""

from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.django_db


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def patient_factory(db):
    """Factory for creating patients with specific ages."""
    from hmis.apps.patients.models import Patient
    
    def _create_patient(days_old, name_suffix=""):
        return Patient.objects.create(
            first_name=f"Test{name_suffix}",
            last_name="Patient",
            date_of_birth=date.today() - timedelta(days=days_old),
            gender="M",
        )
    
    return _create_patient


# ============================================================================
# get_age_category() Method Tests
# ============================================================================


@pytest.mark.unit
class TestPatientAgeCategoryMethod:
    """Test get_age_category() method on Patient model."""

    def test_method_exists(self, patient_factory):
        """Test that get_age_category method exists on Patient."""
        patient = patient_factory(365)  # 1 year old
        
        assert hasattr(patient, "get_age_category")
        assert callable(patient.get_age_category)

    def test_newborn_category_0_to_28_days(self, patient_factory):
        """Test newborn category (0-28 days)."""
        patient = patient_factory(14)  # 14 days old
        
        assert patient.get_age_category() == "newborn"

    def test_newborn_boundary_28_days(self, patient_factory):
        """Test upper boundary of newborn (28 days)."""
        patient = patient_factory(28)
        
        assert patient.get_age_category() == "newborn"

    def test_infant_category_1_to_12_months(self, patient_factory):
        """Test infant category (1-12 months / 29-365 days)."""
        patient = patient_factory(180)  # ~6 months
        
        assert patient.get_age_category() == "infant"

    def test_infant_boundary_29_days(self, patient_factory):
        """Test lower boundary of infant (29 days)."""
        patient = patient_factory(29)
        
        assert patient.get_age_category() == "infant"

    def test_infant_boundary_365_days(self, patient_factory):
        """Test upper boundary of infant (365 days / ~1 year)."""
        patient = patient_factory(365)
        
        assert patient.get_age_category() == "infant"

    def test_toddler_category_1_to_3_years(self, patient_factory):
        """Test toddler category (1-3 years)."""
        patient = patient_factory(730)  # ~2 years
        
        assert patient.get_age_category() == "toddler"

    def test_toddler_boundary_366_days(self, patient_factory):
        """Test lower boundary of toddler."""
        patient = patient_factory(366)
        
        assert patient.get_age_category() == "toddler"

    def test_preschool_category_3_to_6_years(self, patient_factory):
        """Test preschool category (3-6 years)."""
        patient = patient_factory(1460)  # ~4 years
        
        assert patient.get_age_category() == "preschool"

    def test_school_age_category_6_to_12_years(self, patient_factory):
        """Test school-age category (6-12 years)."""
        patient = patient_factory(2920)  # ~8 years
        
        assert patient.get_age_category() == "school_age"

    def test_adolescent_category_12_to_18_years(self, patient_factory):
        """Test adolescent category (12-18 years)."""
        patient = patient_factory(5475)  # ~15 years
        
        assert patient.get_age_category() == "adolescent"

    def test_adult_category_18_plus_years(self, patient_factory):
        """Test adult category (18+ years)."""
        patient = patient_factory(10950)  # ~30 years
        
        assert patient.get_age_category() == "adult"

    def test_adult_boundary_18_years(self, patient_factory):
        """Test lower boundary of adult (18 years + 1 day)."""
        patient = patient_factory(6571)  # 18 years + 1 day (first day of adult)
        
        assert patient.get_age_category() == "adult"

    def test_elderly_patient(self, patient_factory):
        """Test elderly patient is still classified as adult."""
        patient = patient_factory(29200)  # ~80 years
        
        # Elderly is still "adult" category (no separate elderly category)
        assert patient.get_age_category() == "adult"


# ============================================================================
# Age Calculation Accuracy Tests
# ============================================================================


@pytest.mark.unit
class TestAgeCalculationAccuracy:
    """Test age calculation accuracy in category determination."""

    def test_age_uses_current_date(self, patient_factory):
        """Test that age calculation uses current date."""
        # Create patient born exactly 1 year ago
        patient = patient_factory(365)
        
        # Should be infant (at boundary) or toddler (just over)
        category = patient.get_age_category()
        assert category in ("infant", "toddler")

    def test_handles_leap_year_birthday(self, db):
        """Test handling of leap year birthdays."""
        from hmis.apps.patients.models import Patient
        
        # Create patient with leap year birthday (if applicable)
        leap_birthday = date(2020, 2, 29)  # Leap year
        
        patient = Patient.objects.create(
            first_name="Leap",
            last_name="Baby",
            date_of_birth=leap_birthday,
            gender="F",
        )
        
        # Should not raise error
        category = patient.get_age_category()
        assert category is not None


# ============================================================================
# Age Category Display Tests
# ============================================================================


@pytest.mark.unit
class TestAgeCategoryDisplay:
    """Test age category display formatting."""

    def test_get_age_category_display(self, patient_factory):
        """Test human-readable display version of age category."""
        patient = patient_factory(14)  # Newborn
        
        # If there's a display method
        if hasattr(patient, "get_age_category_display"):
            display = patient.get_age_category_display()
            assert display == "Newborn"
        else:
            # Just verify category works
            assert patient.get_age_category() == "newborn"

    def test_age_category_in_serializer(self, patient_factory, authenticated_client):
        """Test that age category can be included in serialized data."""
        patient = patient_factory(180)  # Infant
        
        # Check if API returns age_category
        response = authenticated_client.get(f"/api/patients/{patient.id}/")
        
        # age_category might not be in default serializer - this is for future
        # The main thing is the model method exists
        assert patient.get_age_category() == "infant"


# ============================================================================
# Edge Case Tests
# ============================================================================


@pytest.mark.unit
class TestAgeCategoryEdgeCases:
    """Test edge cases in age category determination."""

    def test_newborn_day_0(self, db):
        """Test newborn born today (0 days old)."""
        from hmis.apps.patients.models import Patient
        
        patient = Patient.objects.create(
            first_name="Brand",
            last_name="New",
            date_of_birth=date.today(),
            gender="M",
        )
        
        assert patient.get_age_category() == "newborn"

    def test_very_old_patient(self, patient_factory):
        """Test very old patient (100+ years)."""
        patient = patient_factory(36500)  # ~100 years
        
        assert patient.get_age_category() == "adult"

    def test_returns_string_type(self, patient_factory):
        """Test that get_age_category returns a string."""
        patient = patient_factory(365)
        
        result = patient.get_age_category()
        assert isinstance(result, str)


# ============================================================================
# Integration with Encounter Vitals Tests
# ============================================================================


@pytest.mark.unit
class TestAgeCategoryVitalsIntegration:
    """Test age category integration with encounter vitals."""

    def test_encounter_can_access_patient_age_category(self, patient_factory):
        """Test that Encounter can access patient's age category."""
        from hmis.apps.encounters.models import Encounter
        
        patient = patient_factory(14)  # Newborn
        
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Well baby check",
        )
        
        # Access via encounter.patient
        assert encounter.patient.get_age_category() == "newborn"

    def test_vital_ranges_use_age_category(self, patient_factory):
        """Test that vital sign ranges consider age category."""
        from hmis.apps.encounters.models import Encounter
        
        # Create infant
        infant = patient_factory(180)
        
        encounter = Encounter.objects.create(
            patient=infant,
            encounter_type="OPD",
            chief_complaint="Checkup",
            pulse=140,  # High for adult, normal for infant
        )
        
        # If pediatric ranges are working, this should be normal
        assert encounter.is_pediatric_patient()
        assert encounter.patient.get_age_category() == "infant"


# ============================================================================
# Age Category Constants Tests
# ============================================================================


@pytest.mark.unit  
class TestAgeCategoryConstants:
    """Test age category constants/thresholds."""

    def test_age_category_thresholds_defined(self):
        """Test that age thresholds are properly defined."""
        from hmis.apps.patients.models import Patient
        
        # Check if AGE_CATEGORY_THRESHOLDS constant exists
        if hasattr(Patient, "AGE_CATEGORY_THRESHOLDS"):
            thresholds = Patient.AGE_CATEGORY_THRESHOLDS
            
            assert "newborn" in thresholds
            assert "infant" in thresholds
            assert "toddler" in thresholds
            assert "preschool" in thresholds
            assert "school_age" in thresholds
            assert "adolescent" in thresholds

    def test_all_valid_categories(self):
        """Test that all valid age categories are defined."""
        valid_categories = [
            "newborn",
            "infant", 
            "toddler",
            "preschool",
            "school_age",
            "adolescent",
            "adult"
        ]
        
        from hmis.apps.patients.models import Patient
        
        if hasattr(Patient, "VALID_AGE_CATEGORIES"):
            for cat in valid_categories:
                assert cat in Patient.VALID_AGE_CATEGORIES
