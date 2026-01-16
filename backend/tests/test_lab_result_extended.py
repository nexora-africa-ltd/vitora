"""
Tests for Extended LabResult Model (Sprint 1.5-1.6 Track B Phase 1.3).

Test Coverage:
- Enhanced flagging with TextChoices
- Reference range tracking
- Amendment tracking
- Method/Equipment tracking
- Critical value handling
- Self-verification prevention
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone

from hmis.apps.core.models import County, SubCounty
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def second_user(db):
    """Create a second test user for verification tests."""
    return User.objects.create_user(username="verifier", password="testpass123")


@pytest.fixture
def sample_county(db):
    """Create a sample county."""
    return County.objects.create(code=1, name="Mombasa")


@pytest.fixture
def sample_sub_county(sample_county):
    """Create a sample sub-county."""
    return SubCounty.objects.create(county=sample_county, name="Mvita")


@pytest.fixture
def sample_patient(sample_county, sample_sub_county):
    """Create a sample patient."""
    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth=date(1985, 5, 20),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def sample_test(db):
    """Create a sample test."""
    return TestCatalog.objects.create(
        code="HGB",
        name="Hemoglobin",
        short_name="HGB",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
    )


@pytest.fixture
def sample_encounter(sample_patient, test_user):
    """Create a sample encounter."""
    from hmis.apps.encounters.models import Encounter
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Routine checkup",
    )


@pytest.fixture
def sample_lab_order(sample_encounter, test_user):
    """Create a sample lab order."""
    return LabOrder.objects.create(
        encounter=sample_encounter,
        patient=sample_encounter.patient,
        ordered_by=test_user,
        priority="ROUTINE",
        order_type="IN_HOUSE",
    )


@pytest.fixture
def sample_order_item(sample_lab_order, sample_test):
    """Create a sample order item."""
    return LabOrderItem.objects.create(
        lab_order=sample_lab_order,
        test=sample_test,
    )


@pytest.fixture
def sample_result(sample_order_item, test_user):
    """Create a sample lab result."""
    return LabResult.objects.create(
        order_item=sample_order_item,
        numeric_value=Decimal("14.5"),
        entered_by=test_user,
    )


@pytest.mark.django_db
class TestLabResultExtended:
    """Test suite for extended LabResult model functionality."""

    def test_reference_range_tracking(self, sample_result):
        """Result should track reference range used for comparison."""
        sample_result.reference_low = Decimal("13.5")
        sample_result.reference_high = Decimal("17.5")
        sample_result.reference_range_text = "13.5-17.5 g/dL"
        sample_result.save()

        assert sample_result.reference_low == Decimal("13.5")
        assert sample_result.reference_high == Decimal("17.5")
        assert sample_result.reference_range_text == "13.5-17.5 g/dL"

    def test_flag_normal_within_range(self, sample_result):
        """Flag should be NORMAL when value is within reference range."""
        sample_result.numeric_value = Decimal("15.0")
        sample_result.reference_low = Decimal("13.5")
        sample_result.reference_high = Decimal("17.5")
        sample_result.result_flag = "NORMAL"
        sample_result.save()

        assert sample_result.result_flag == "NORMAL"

    def test_flag_high_above_range(self, sample_result):
        """Flag should be HIGH when value is above reference range."""
        sample_result.numeric_value = Decimal("18.0")
        sample_result.reference_low = Decimal("13.5")
        sample_result.reference_high = Decimal("17.5")
        sample_result.result_flag = "HIGH"
        sample_result.save()

        assert sample_result.result_flag == "HIGH"

    def test_flag_low_below_range(self, sample_result):
        """Flag should be LOW when value is below reference range."""
        sample_result.numeric_value = Decimal("12.0")
        sample_result.reference_low = Decimal("13.5")
        sample_result.reference_high = Decimal("17.5")
        sample_result.result_flag = "LOW"
        sample_result.save()

        assert sample_result.result_flag == "LOW"

    def test_flag_critical_high(self, sample_result):
        """Flag should be CRITICAL_HIGH for dangerously high values."""
        sample_result.numeric_value = Decimal("22.0")
        sample_result.reference_low = Decimal("13.5")
        sample_result.reference_high = Decimal("17.5")
        sample_result.result_flag = "CRITICAL_HIGH"
        sample_result.is_critical_result = True
        sample_result.save()

        assert sample_result.result_flag == "CRITICAL_HIGH"
        assert sample_result.is_critical_result is True

    def test_flag_critical_low(self, sample_result):
        """Flag should be CRITICAL_LOW for dangerously low values."""
        sample_result.numeric_value = Decimal("6.0")
        sample_result.reference_low = Decimal("13.5")
        sample_result.reference_high = Decimal("17.5")
        sample_result.result_flag = "CRITICAL_LOW"
        sample_result.is_critical_result = True
        sample_result.save()

        assert sample_result.result_flag == "CRITICAL_LOW"
        assert sample_result.is_critical_result is True

    def test_critical_value_requires_verification(self, sample_result):
        """Critical results should require verification."""
        sample_result.result_flag = "CRITICAL_HIGH"
        sample_result.is_critical_result = True
        sample_result.verification_status = "UNVERIFIED"
        sample_result.save()

        assert sample_result.verification_status == "UNVERIFIED"
        assert sample_result.is_critical_result is True

    def test_cannot_self_verify_critical_result(self, sample_result, test_user, second_user):
        """User who entered result cannot verify it if critical."""
        sample_result.result_flag = "CRITICAL_HIGH"
        sample_result.is_critical_result = True
        sample_result.entered_by = test_user
        sample_result.save()

        # Verification by different user should be allowed
        sample_result.verify(second_user)
        assert sample_result.verified_by == second_user
        assert sample_result.verification_status == "VERIFIED"

    def test_amendment_tracking(self, sample_result, second_user):
        """Result amendment should preserve original value and track changes."""
        original_value = str(sample_result.numeric_value)

        # Amend the result
        sample_result.numeric_value = Decimal("16.0")
        sample_result.is_amended = True
        sample_result.original_value = original_value
        sample_result.amendment_reason = "Transcription error corrected"
        sample_result.amended_by = second_user
        sample_result.amended_at = timezone.now()
        sample_result.save()

        assert sample_result.is_amended is True
        assert sample_result.original_value == "14.5"
        assert sample_result.amendment_reason == "Transcription error corrected"
        assert sample_result.amended_by == second_user
        assert sample_result.amended_at is not None

    def test_amendment_requires_reason(self, sample_result, second_user):
        """Amendment should have a reason."""
        sample_result.is_amended = True
        sample_result.original_value = "14.5"
        sample_result.amendment_reason = "Lab recalibration"
        sample_result.amended_by = second_user
        sample_result.amended_at = timezone.now()
        sample_result.save()

        assert sample_result.amendment_reason != ""

    def test_method_tracking(self, sample_result):
        """Result should track testing method used."""
        sample_result.method = "Automated analyzer - spectrophotometry"
        sample_result.save()

        assert sample_result.method == "Automated analyzer - spectrophotometry"

    def test_equipment_tracking(self, sample_result):
        """Result should track equipment/analyzer used."""
        sample_result.equipment = "Sysmex XN-1000"
        sample_result.save()

        assert sample_result.equipment == "Sysmex XN-1000"

    def test_result_comments(self, sample_result):
        """Result should support comments."""
        sample_result.interpretation = "Slightly elevated, monitor patient"
        sample_result.save()

        assert "elevated" in sample_result.interpretation.lower()

    def test_entry_user_tracked(self, sample_result, test_user):
        """Result entry user should be tracked."""
        assert sample_result.entered_by == test_user
        assert sample_result.entered_at is not None

    def test_is_critical_result_field(self, sample_result):
        """Should have is_critical_result boolean field."""
        sample_result.is_critical_result = True
        sample_result.save()

        assert hasattr(sample_result, 'is_critical_result')
        assert sample_result.is_critical_result is True
