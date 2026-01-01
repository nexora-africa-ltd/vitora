"""
Tests for laboratory models.

Following TDD methodology - these tests define the expected behavior
before implementation.
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from hmis.apps.laboratory.models import (
    TestCatalog,
    LOINCCode,
    LabOrder,
    LabOrderItem,
    LabResult,
    generate_lab_order_number,
)
from hmis.apps.patients.models import Patient
from hmis.apps.encounters.models import Encounter

User = get_user_model()


@pytest.mark.django_db
class TestTestCatalog:
    """Tests for TestCatalog model."""

    def test_create_test_catalog(self):
        """Should create test catalog with required fields."""
        test = TestCatalog.objects.create(
            code="CBC",
            name="Complete Blood Count",
            short_name="CBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="PANEL",
            cost=Decimal("500.00"),
        )
        assert test.code == "CBC"
        assert test.name == "Complete Blood Count"
        assert test.is_active is True
        assert test.sha_claimable is True

    def test_code_uniqueness(self):
        """Test code should be unique."""
        TestCatalog.objects.create(
            code="RBS",
            name="Random Blood Sugar",
            short_name="RBS",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        with pytest.raises(Exception):  # Integrity error
            TestCatalog.objects.create(
                code="RBS",  # Duplicate
                name="Another Test",
                short_name="RBS2",
                category="CHEMISTRY",
                specimen_type="BLOOD",
                result_type="NUMERIC",
            )

    def test_loinc_code_assignment(self):
        """Should allow LOINC code assignment."""
        test = TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            loinc_code="718-7",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        assert test.loinc_code == "718-7"

    def test_get_normal_range_by_gender(self):
        """Should return appropriate normal range based on patient gender."""
        test = TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            result_unit="g/dL",
            normal_range_male="13.0-17.0",
            normal_range_female="12.0-15.0",
        )
        
        # Create male patient
        male_patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        assert test.get_normal_range(male_patient) == "13.0-17.0"
        
        # Create female patient
        female_patient = Patient.objects.create(
            first_name="Jane",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="F",
        )
        assert test.get_normal_range(female_patient) == "12.0-15.0"

    def test_is_result_abnormal_detection(self):
        """Should detect abnormal results."""
        test = TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            result_unit="g/dL",
            normal_range_male="13.0-17.0",
        )
        
        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        
        # Normal value
        assert test.is_result_abnormal(15.0, patient) is False
        
        # Low value
        assert test.is_result_abnormal(10.0, patient) is True
        
        # High value
        assert test.is_result_abnormal(20.0, patient) is True

    def test_panel_component_relationships(self):
        """Should support panel with component tests."""
        # Create component tests
        component1 = TestCatalog.objects.create(
            code="WBC",
            name="White Blood Cell Count",
            short_name="WBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        component2 = TestCatalog.objects.create(
            code="RBC",
            name="Red Blood Cell Count",
            short_name="RBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        
        # Create panel test
        panel = TestCatalog.objects.create(
            code="CBC",
            name="Complete Blood Count",
            short_name="CBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="PANEL",
            is_panel=True,
        )
        panel.panel_components.add(component1, component2)
        
        components = panel.get_panel_tests()
        assert components.count() == 2
        assert component1 in components
        assert component2 in components

    def test_in_house_vs_external_designation(self):
        """Should designate tests as in-house or external."""
        in_house_test = TestCatalog.objects.create(
            code="MPS",
            name="Malaria Parasites",
            short_name="MPS",
            category="PARASITOLOGY",
            specimen_type="BLOOD",
            result_type="TEXT",
            available_in_house=True,
        )
        assert in_house_test.available_in_house is True
        
        external_test = TestCatalog.objects.create(
            code="VL",
            name="Viral Load",
            short_name="VL",
            category="MOLECULAR",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            available_in_house=False,
            external_lab_partner="KEMRI",
        )
        assert external_test.available_in_house is False
        assert external_test.external_lab_partner == "KEMRI"

    def test_active_inactive_filtering(self):
        """Should support active/inactive status."""
        active_test = TestCatalog.objects.create(
            code="TEST1",
            name="Active Test",
            short_name="TEST1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            is_active=True,
        )
        inactive_test = TestCatalog.objects.create(
            code="TEST2",
            name="Inactive Test",
            short_name="TEST2",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            is_active=False,
        )
        
        active_tests = TestCatalog.objects.filter(is_active=True)
        assert active_test in active_tests
        assert inactive_test not in active_tests

    def test_cost_and_sha_claimability(self):
        """Should track cost and SHA claimability."""
        test = TestCatalog.objects.create(
            code="RBS",
            name="Random Blood Sugar",
            short_name="RBS",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("300.00"),
            sha_claimable=True,
        )
        assert test.cost == Decimal("300.00")
        assert test.sha_claimable is True


@pytest.mark.django_db
class TestLabOrder:
    """Tests for LabOrder model."""

    @pytest.fixture
    def sample_patient(self):
        """Create a sample patient."""
        return Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )

    @pytest.fixture
    def sample_encounter(self, sample_patient):
        """Create a sample encounter."""
        return Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )

    @pytest.fixture
    def lab_user(self):
        """Create a lab technician user."""
        return User.objects.create_user(username="labtech", password="testpass")

    def test_order_number_auto_generated(self, sample_encounter, lab_user):
        """Lab order number should be auto-generated."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        assert order.order_number.startswith("LAB-")
        assert len(order.order_number) == 17  # LAB-YYYYMMDD-XXXX

    def test_order_number_uniqueness(self, sample_encounter, lab_user):
        """Order numbers should be unique."""
        order1 = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        order2 = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        assert order1.order_number != order2.order_number

    def test_status_workflow_valid_transition(self, sample_encounter, lab_user):
        """Valid status transitions should succeed."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        # DRAFT -> ORDERED
        order.update_status("ORDERED", lab_user)
        assert order.status == "ORDERED"
        
        # ORDERED -> SPECIMEN_COLLECTED
        order.update_status("SPECIMEN_COLLECTED", lab_user)
        assert order.status == "SPECIMEN_COLLECTED"
        
        # SPECIMEN_COLLECTED -> IN_PROGRESS
        order.update_status("IN_PROGRESS", lab_user)
        assert order.status == "IN_PROGRESS"
        
        # IN_PROGRESS -> COMPLETED
        order.update_status("COMPLETED", lab_user)
        assert order.status == "COMPLETED"
        assert order.completed_at is not None

    def test_status_workflow_invalid_transition(self, sample_encounter, lab_user):
        """Invalid status transitions should raise error."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        # Cannot skip from DRAFT to COMPLETED
        with pytest.raises(ValidationError):
            order.update_status("COMPLETED", lab_user)

    def test_specimen_collection_recording(self, sample_encounter, lab_user):
        """Should record specimen collection details."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            status="ORDERED",
        )
        
        order.mark_specimen_collected(lab_user)
        
        assert order.specimen_collected is True
        assert order.specimen_collected_at is not None
        assert order.specimen_collected_by == lab_user
        assert order.status == "SPECIMEN_COLLECTED"

    def test_external_lab_designation(self, sample_encounter, lab_user):
        """Should support external lab orders."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            order_type="EXTERNAL",
            external_lab="Lancet Kenya",
        )
        
        assert order.order_type == "EXTERNAL"
        assert order.external_lab == "Lancet Kenya"

    def test_priority_level_assignment(self, sample_encounter, lab_user):
        """Should support different priority levels."""
        stat_order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            priority="STAT",
        )
        assert stat_order.priority == "STAT"

    def test_clinical_notes_attachment(self, sample_encounter, lab_user):
        """Should allow clinical notes."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            clinical_notes="Patient has history of anemia",
        )
        assert order.clinical_notes == "Patient has history of anemia"

    def test_total_cost_calculation(self, sample_encounter, lab_user):
        """Should calculate total cost from items."""
        test1 = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        test2 = TestCatalog.objects.create(
            code="TEST2",
            name="Test 2",
            short_name="T2",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        LabOrderItem.objects.create(lab_order=order, test=test1, unit_cost=test1.cost)
        LabOrderItem.objects.create(lab_order=order, test=test2, unit_cost=test2.cost)
        
        total = order.calculate_total_cost()
        assert total == Decimal("300.00")
        assert order.total_cost == Decimal("300.00")

    def test_ordered_by_user_tracking(self, sample_encounter, lab_user):
        """Should track who ordered the tests."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        assert order.ordered_by == lab_user

    def test_status_change_audit(self, sample_encounter, lab_user):
        """Should track status changes."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        order.update_status("ORDERED", lab_user)
        assert order.status_changed_by == lab_user
        assert order.status_changed_at is not None

    def test_in_house_vs_external_routing(self, sample_encounter, lab_user):
        """Should route to in-house or external labs."""
        in_house_order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            order_type="IN_HOUSE",
        )
        assert in_house_order.order_type == "IN_HOUSE"

    def test_order_cancellation(self, sample_encounter, lab_user):
        """Should allow order cancellation."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        order.update_status("CANCELLED", lab_user)
        assert order.status == "CANCELLED"

    def test_order_rejection_with_reason(self, sample_encounter, lab_user):
        """Should support order rejection."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            status="ORDERED",
        )
        
        order.update_status("REJECTED", lab_user)
        assert order.status == "REJECTED"

    def test_turnaround_time_calculation(self, sample_encounter, lab_user):
        """Should calculate turnaround time."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
            status="IN_PROGRESS",
        )
        
        order.update_status("COMPLETED", lab_user)
        turnaround = order.get_turnaround_time()
        
        assert turnaround is not None
        assert isinstance(turnaround, timedelta)

    def test_pending_results_identification(self, sample_encounter, lab_user):
        """Should identify tests without results."""
        test = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        item = LabOrderItem.objects.create(lab_order=order, test=test, unit_cost=Decimal("100"))
        
        pending = order.get_pending_results()
        assert item in pending

    def test_completion_detection(self, sample_encounter, lab_user):
        """Should detect when all results are in."""
        test = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=lab_user,
        )
        
        item = LabOrderItem.objects.create(lab_order=order, test=test, unit_cost=Decimal("100"))
        
        # No results yet
        assert order.is_complete() is False
        
        # Add result
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=lab_user,
        )
        
        # Now complete
        assert order.is_complete() is True


@pytest.mark.django_db
class TestLabOrderItem:
    """Tests for LabOrderItem model."""

    @pytest.fixture
    def sample_order(self):
        """Create a sample lab order."""
        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        user = User.objects.create_user(username="testuser", password="testpass")
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        return LabOrder.objects.create(
            patient=patient,
            encounter=encounter,
            ordered_by=user,
        )

    @pytest.fixture
    def sample_test(self):
        """Create a sample test catalog entry."""
        return TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("150.00"),
        )

    def test_item_creation_with_test_reference(self, sample_order, sample_test):
        """Should create order item with test reference."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        assert item.test == sample_test
        assert item.lab_order == sample_order

    def test_cost_snapshot_from_catalog(self, sample_order, sample_test):
        """Should snapshot cost from catalog on creation."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            # unit_cost should auto-populate
        )
        assert item.unit_cost == sample_test.cost

    def test_status_transitions(self, sample_order, sample_test):
        """Should support status transitions."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
            status="PENDING",
        )
        
        item.status = "IN_PROGRESS"
        item.save()
        assert item.status == "IN_PROGRESS"
        
        item.status = "COMPLETED"
        item.save()
        assert item.status == "COMPLETED"

    def test_link_to_parent_order(self, sample_order, sample_test):
        """Should link to parent order."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        assert item.lab_order == sample_order
        assert item in sample_order.items.all()

    def test_multiple_items_per_order(self, sample_order):
        """Should support multiple items in one order."""
        test1 = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        test2 = TestCatalog.objects.create(
            code="TEST2",
            name="Test 2",
            short_name="T2",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("200.00"),
        )
        
        item1 = LabOrderItem.objects.create(lab_order=sample_order, test=test1, unit_cost=test1.cost)
        item2 = LabOrderItem.objects.create(lab_order=sample_order, test=test2, unit_cost=test2.cost)
        
        assert sample_order.items.count() == 2
        assert item1 in sample_order.items.all()
        assert item2 in sample_order.items.all()

    def test_item_cancellation(self, sample_order, sample_test):
        """Should allow item cancellation."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        
        item.status = "CANCELLED"
        item.save()
        assert item.status == "CANCELLED"

    def test_result_linkage(self, sample_order, sample_test):
        """Should link to result."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        
        user = User.objects.create_user(username="labtech", password="testpass")
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=user,
        )
        
        assert item.result == result
        assert item.has_result() is True

    def test_special_instructions_override(self, sample_order, sample_test):
        """Should allow special instructions."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
            special_instructions="Run test twice for confirmation",
        )
        assert item.special_instructions == "Run test twice for confirmation"

    def test_cascade_delete_behavior(self, sample_order, sample_test):
        """Should cascade delete with order."""
        item = LabOrderItem.objects.create(
            lab_order=sample_order,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        item_id = item.id
        
        sample_order.delete()
        
        # Item should be deleted
        assert not LabOrderItem.objects.filter(id=item_id).exists()


@pytest.mark.django_db
class TestLabResult:
    """Tests for LabResult model."""

    @pytest.fixture
    def sample_order_item(self):
        """Create a sample order item."""
        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        user = User.objects.create_user(username="testuser", password="testpass")
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        order = LabOrder.objects.create(
            patient=patient,
            encounter=encounter,
            ordered_by=user,
        )
        test = TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            result_unit="g/dL",
            normal_range_male="13.0-17.0",
            cost=Decimal("200.00"),
        )
        return LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
        )

    @pytest.fixture
    def lab_user(self):
        """Create a lab user."""
        return User.objects.create_user(username="labtech", password="testpass")

    def test_numeric_result_storage(self, sample_order_item, lab_user):
        """Should store numeric values."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("14.5"),
            entered_by=lab_user,
        )
        assert result.numeric_value == Decimal("14.5")

    def test_text_result_storage(self, sample_order_item, lab_user):
        """Should store text values."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            text_value="No parasites seen",
            entered_by=lab_user,
        )
        assert result.text_value == "No parasites seen"

    def test_option_result_storage(self, sample_order_item, lab_user):
        """Should store option values."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            option_value="Positive",
            entered_by=lab_user,
        )
        assert result.option_value == "Positive"

    def test_auto_flag_normal_result(self, sample_order_item, lab_user):
        """Should flag normal results."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("15.0"),  # Within 13-17
            entered_by=lab_user,
        )
        result.auto_flag_result()
        assert result.result_flag == "NORMAL"

    def test_auto_flag_abnormal_low(self, sample_order_item, lab_user):
        """Should flag low results."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("12.5"),  # Below 13
            entered_by=lab_user,
        )
        result.auto_flag_result()
        assert result.result_flag == "LOW"

    def test_auto_flag_abnormal_high(self, sample_order_item, lab_user):
        """Should flag high results."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("17.5"),  # Above 17
            entered_by=lab_user,
        )
        result.auto_flag_result()
        assert result.result_flag == "HIGH"

    def test_auto_flag_critical_low(self, sample_order_item, lab_user):
        """Should flag critically low results."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("10.0"),  # Critical low
            entered_by=lab_user,
        )
        result.auto_flag_result()
        assert result.result_flag == "CRITICAL_LOW"
        assert result.is_critical() is True

    def test_auto_flag_critical_high(self, sample_order_item, lab_user):
        """Should flag critically high results."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("20.0"),  # Critical high
            entered_by=lab_user,
        )
        result.auto_flag_result()
        assert result.result_flag == "CRITICAL_HIGH"
        assert result.is_critical() is True

    def test_interpretation_notes(self, sample_order_item, lab_user):
        """Should allow interpretation notes."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("10.5"),
            interpretation="Severe anemia, transfusion may be required",
            entered_by=lab_user,
        )
        assert "anemia" in result.interpretation

    def test_verification_workflow(self, sample_order_item, lab_user):
        """Should support verification workflow."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("14.5"),
            entered_by=lab_user,
        )
        
        assert result.verification_status == "UNVERIFIED"
        
        pathologist = User.objects.create_user(username="pathologist", password="testpass")
        result.verify(pathologist)
        
        assert result.verification_status == "VERIFIED"
        assert result.verified_by == pathologist
        assert result.verified_at is not None

    def test_external_result_attachment(self, sample_order_item, lab_user):
        """Should support external result attachments."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            is_external_result=True,
            external_result_date=date.today(),
            entered_by=lab_user,
        )
        assert result.is_external_result is True
        assert result.external_result_date == date.today()

    def test_one_result_per_order_item(self, sample_order_item, lab_user):
        """Should enforce one-to-one relationship."""
        LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("14.5"),
            entered_by=lab_user,
        )
        
        # Trying to create another result should fail
        with pytest.raises(Exception):  # Integrity error
            LabResult.objects.create(
                order_item=sample_order_item,
                numeric_value=Decimal("15.0"),
                entered_by=lab_user,
            )

    def test_result_with_unit_formatting(self, sample_order_item, lab_user):
        """Should format result with unit."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("14.5"),
            entered_by=lab_user,
        )
        formatted = result.get_formatted_value()
        assert "14.5" in formatted
        assert "g/dL" in formatted

    def test_entered_by_tracking(self, sample_order_item, lab_user):
        """Should track who entered the result."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=Decimal("14.5"),
            entered_by=lab_user,
        )
        assert result.entered_by == lab_user
        assert result.entered_at is not None


@pytest.mark.django_db
class TestLOINCCode:
    """Tests for LOINC code model."""

    def test_create_loinc_code(self):
        """Should create LOINC code entry."""
        loinc = LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        assert loinc.code == "718-7"
        assert loinc.component == "Hemoglobin"

    def test_code_uniqueness(self):
        """LOINC code should be unique."""
        LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        with pytest.raises(Exception):  # Integrity error
            LOINCCode.objects.create(
                code="718-7",  # Duplicate
                component="Another",
                property="MCnc",
                time_aspect="Pt",
                system="Bld",
                scale_type="Qn",
                long_common_name="Different",
                short_name="Different",
            )

    def test_component_search(self):
        """Should search by component."""
        LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        results = LOINCCode.objects.filter(component__icontains="Hemoglobin")
        assert results.count() >= 1

    def test_short_name_lookup(self):
        """Should look up by short name."""
        loinc = LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        found = LOINCCode.objects.get(short_name="Hb Bld")
        assert found == loinc

    def test_long_name_lookup(self):
        """Should look up by long common name."""
        loinc = LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        found = LOINCCode.objects.filter(long_common_name__icontains="Hemoglobin").first()
        assert found == loinc

    def test_system_specimen_filtering(self):
        """Should filter by system (specimen type)."""
        LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",  # Blood
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        blood_tests = LOINCCode.objects.filter(system="Bld")
        assert blood_tests.count() >= 1

    def test_scale_type_filtering(self):
        """Should filter by scale type."""
        LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",  # Quantitative
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        quantitative = LOINCCode.objects.filter(scale_type="Qn")
        assert quantitative.count() >= 1

    def test_test_catalog_loinc_linking(self):
        """Should link to test catalog."""
        loinc = LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
            long_common_name="Hemoglobin [Mass/volume] in Blood",
            short_name="Hb Bld",
        )
        
        test = TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            loinc_code=loinc.code,
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        
        assert test.loinc_code == loinc.code
