"""
Tests for Laboratory Result Template Model (Sprint 1.5-1.6 Track B Phase 1.2).

Test Coverage:
- LabResultTemplate model for reference ranges
- Reference range retrieval by patient demographics
- Critical value thresholds
- Panel parameter ordering
"""

import pytest
from datetime import date
from decimal import Decimal
from django.core.exceptions import ValidationError

from hmis.apps.laboratory.models import LabResultTemplate
from hmis.apps.patients.models import Patient
from hmis.apps.core.models import County, SubCounty


@pytest.fixture
def sample_county(db):
    """Create a sample county."""
    return County.objects.create(code=1, name="Mombasa")


@pytest.fixture
def sample_sub_county(sample_county):
    """Create a sample sub-county."""
    return SubCounty.objects.create(county=sample_county, name="Mvita")


@pytest.fixture
def adult_male_patient(sample_county, sample_sub_county):
    """Create an adult male patient."""
    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1985, 5, 20),  # ~40 years old
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def adult_female_patient(sample_county, sample_sub_county):
    """Create an adult female patient."""
    return Patient.objects.create(
        first_name="Jane",
        last_name="Smith",
        date_of_birth=date(1990, 3, 15),  # ~35 years old
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def pediatric_patient(sample_county, sample_sub_county):
    """Create a pediatric patient."""
    return Patient.objects.create(
        first_name="Tommy",
        last_name="Jones",
        date_of_birth=date(2015, 8, 10),  # ~10 years old
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.mark.django_db
class TestLabResultTemplate:
    """Test suite for LabResultTemplate model."""

    def test_template_creation(self):
        """Template can be created with reference ranges."""
        template = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin",
            unit="g/dL",
            reference_ranges={
                "adult_male": {"low": 13.5, "high": 17.5},
                "adult_female": {"low": 12.0, "high": 16.0},
                "pediatric": {"low": 11.0, "high": 14.0},
            },
            critical_low=Decimal("7.0"),
            critical_high=Decimal("20.0"),
        )
        
        assert template.id is not None
        assert template.test_code == "CBC"
        assert template.parameter_name == "Hemoglobin"
        assert "adult_male" in template.reference_ranges

    def test_get_reference_adult_male(self, adult_male_patient):
        """Should return male reference range for adult male patient."""
        template = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin",
            unit="g/dL",
            reference_ranges={
                "adult_male": {"low": 13.5, "high": 17.5},
                "adult_female": {"low": 12.0, "high": 16.0},
                "pediatric": {"low": 11.0, "high": 14.0},
            },
        )
        
        low, high = template.get_reference_range(adult_male_patient)
        
        assert low == 13.5
        assert high == 17.5

    def test_get_reference_adult_female(self, adult_female_patient):
        """Should return female reference range for adult female patient."""
        template = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin",
            unit="g/dL",
            reference_ranges={
                "adult_male": {"low": 13.5, "high": 17.5},
                "adult_female": {"low": 12.0, "high": 16.0},
                "pediatric": {"low": 11.0, "high": 14.0},
            },
        )
        
        low, high = template.get_reference_range(adult_female_patient)
        
        assert low == 12.0
        assert high == 16.0

    def test_get_reference_pediatric(self, pediatric_patient):
        """Should return pediatric reference range for child patient."""
        template = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin",
            unit="g/dL",
            reference_ranges={
                "adult_male": {"low": 13.5, "high": 17.5},
                "adult_female": {"low": 12.0, "high": 16.0},
                "pediatric": {"low": 11.0, "high": 14.0},
            },
        )
        
        low, high = template.get_reference_range(pediatric_patient)
        
        assert low == 11.0
        assert high == 14.0

    def test_get_reference_fallback(self, adult_male_patient):
        """Should fallback to default range if category missing."""
        template = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="WBC",
            parameter_name="White Blood Cells",
            unit="×10⁹/L",
            reference_ranges={
                "default": {"low": 4.5, "high": 11.0},
            },
        )
        
        low, high = template.get_reference_range(adult_male_patient)
        
        # Should fallback to default since adult_male not present
        assert low == 4.5
        assert high == 11.0

    def test_critical_values(self):
        """Critical thresholds should be stored and retrieved."""
        template = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin",
            unit="g/dL",
            reference_ranges={
                "default": {"low": 12.0, "high": 16.0},
            },
            critical_low=Decimal("7.0"),
            critical_high=Decimal("20.0"),
        )
        
        assert template.critical_low == Decimal("7.0")
        assert template.critical_high == Decimal("20.0")

    def test_panel_parameters_ordered(self):
        """Panel parameters should be ordered by display_order."""
        # Create parameters with different display orders
        param1 = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="PLT",
            parameter_name="Platelets",
            unit="×10⁹/L",
            display_order=3,
            reference_ranges={"default": {"low": 150, "high": 400}},
        )
        
        param2 = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="WBC",
            parameter_name="White Blood Cells",
            unit="×10⁹/L",
            display_order=1,
            reference_ranges={"default": {"low": 4.5, "high": 11.0}},
        )
        
        param3 = LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="HGB",
            parameter_name="Hemoglobin",
            unit="g/dL",
            display_order=2,
            reference_ranges={"default": {"low": 12.0, "high": 16.0}},
        )
        
        # Get all CBC parameters
        cbc_params = list(LabResultTemplate.objects.filter(test_code="CBC"))
        
        # Should be ordered by display_order
        assert cbc_params[0].parameter_code == "WBC"  # display_order=1
        assert cbc_params[1].parameter_code == "HGB"  # display_order=2
        assert cbc_params[2].parameter_code == "PLT"  # display_order=3

    def test_test_code_parameter_uniqueness(self):
        """Test code + parameter code should be unique together."""
        LabResultTemplate.objects.create(
            test_code="CBC",
            test_name="Complete Blood Count",
            parameter_code="WBC",
            parameter_name="White Blood Cells",
            unit="×10⁹/L",
            reference_ranges={"default": {"low": 4.5, "high": 11.0}},
        )
        
        # Attempting to create duplicate should fail
        from django.db import IntegrityError
        
        with pytest.raises(IntegrityError):
            LabResultTemplate.objects.create(
                test_code="CBC",
                test_name="Complete Blood Count",
                parameter_code="WBC",  # Same code
                parameter_name="White Blood Cell Count",
                unit="×10⁹/L",
                reference_ranges={"default": {"low": 4.0, "high": 10.0}},
            )
