"""
Tests for laboratory services.

Tests for LabWorkflowService and LabAlertService that manage
lab order workflows and critical result notifications.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone

from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
from hmis.apps.laboratory.services import LabAlertService, LabWorkflowService
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.mark.django_db
class TestLabWorkflowService:
    """Tests for LabWorkflowService."""

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
    def lab_user(self):
        """Create a lab user."""
        return User.objects.create_user(username="labtech", password="testpass")

    def test_submit_order_validation(self, sample_order, lab_user):
        """Should submit order with validation."""
        # Add at least one test item
        test = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        LabOrderItem.objects.create(lab_order=sample_order, test=test, unit_cost=Decimal("100"))

        order = LabWorkflowService.submit_order(sample_order, lab_user)
        assert order.status == "ORDERED"

    def test_specimen_collection_recording(self, sample_order, lab_user):
        """Should record specimen collection."""
        sample_order.status = "ORDERED"
        sample_order.save()

        order = LabWorkflowService.collect_specimen(sample_order, lab_user)

        assert order.specimen_collected is True
        assert order.specimen_collected_by == lab_user
        assert order.status == "SPECIMEN_COLLECTED"

    def test_start_processing_transition(self, sample_order, lab_user):
        """Should start processing."""
        sample_order.status = "SPECIMEN_COLLECTED"
        sample_order.save()

        order = LabWorkflowService.start_processing(sample_order, lab_user)
        assert order.status == "IN_PROGRESS"

    def test_complete_order_transition(self, sample_order, lab_user):
        """Should complete order."""
        test = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        item = LabOrderItem.objects.create(
            lab_order=sample_order, test=test, unit_cost=Decimal("100")
        )

        # Add result
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.5"),
            entered_by=lab_user,
        )

        sample_order.status = "IN_PROGRESS"
        sample_order.save()

        order = LabWorkflowService.complete_order(sample_order, lab_user)
        assert order.status == "COMPLETED"
        assert order.completed_at is not None

    def test_all_results_required_for_completion(self, sample_order, lab_user):
        """Should require all results before completion."""
        test1 = TestCatalog.objects.create(
            code="TEST1",
            name="Test 1",
            short_name="T1",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )
        test2 = TestCatalog.objects.create(
            code="TEST2",
            name="Test 2",
            short_name="T2",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
        )

        item1 = LabOrderItem.objects.create(
            lab_order=sample_order, test=test1, unit_cost=Decimal("100")
        )
        item2 = LabOrderItem.objects.create(
            lab_order=sample_order, test=test2, unit_cost=Decimal("100")
        )

        # Only add result for item1
        LabResult.objects.create(
            order_item=item1,
            numeric_value=Decimal("5.5"),
            entered_by=lab_user,
        )

        sample_order.status = "IN_PROGRESS"
        sample_order.save()

        # Should not be able to complete yet
        with pytest.raises(Exception):  # ValidationError or similar
            LabWorkflowService.complete_order(sample_order, lab_user)

    def test_cancel_order_with_reason(self, sample_order, lab_user):
        """Should cancel order with reason."""
        order = LabWorkflowService.cancel_order(sample_order, lab_user, "Patient discharged")
        assert order.status == "CANCELLED"

    def test_reject_specimen_with_reason(self, sample_order, lab_user):
        """Should reject specimen with reason."""
        sample_order.status = "ORDERED"
        sample_order.save()

        order = LabWorkflowService.reject_specimen(sample_order, lab_user, "Hemolyzed sample")
        assert order.status == "REJECTED"

    def test_critical_result_detection(self, sample_order, lab_user):
        """Should detect critical results."""
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
        item = LabOrderItem.objects.create(
            lab_order=sample_order, test=test, unit_cost=Decimal("100")
        )

        # Create critical result
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("8.0"),  # Critically low
            entered_by=lab_user,
        )
        result.auto_flag_result()

        critical_results = LabAlertService.check_critical_results(sample_order)
        assert len(critical_results) > 0

    def test_invalid_transition_rejection(self, sample_order, lab_user):
        """Should reject invalid transitions."""
        # Try to go directly from DRAFT to COMPLETED
        with pytest.raises(Exception):
            sample_order.update_status("COMPLETED", lab_user)


@pytest.mark.django_db
class TestLabAlertService:
    """Tests for LabAlertService."""

    @pytest.fixture
    def sample_order_with_result(self):
        """Create a sample order with critical result."""
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
        )
        item = LabOrderItem.objects.create(lab_order=order, test=test, unit_cost=Decimal("100"))

        # Create critical result
        result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("8.0"),
            entered_by=user,
        )
        result.auto_flag_result()

        return order

    def test_check_critical_results(self, sample_order_with_result):
        """Should identify critical results."""
        alerts = LabAlertService.check_critical_results(sample_order_with_result)
        assert len(alerts) > 0
        assert "critical" in alerts[0].lower() or "low" in alerts[0].lower()

    def test_overdue_order_detection(self):
        """Should detect overdue orders."""
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

        # Create an old order
        order = LabOrder.objects.create(
            patient=patient,
            encounter=encounter,
            ordered_by=user,
            status="IN_PROGRESS",
        )

        # Manually set ordered_at to 48 hours ago
        order.ordered_at = timezone.now() - timedelta(hours=48)
        order.save()

        overdue = LabAlertService.get_overdue_orders(hours=24)
        assert order in overdue
