"""
Tests for Laboratory Queue Management (Sprint 1.5-1.6 Track B).

Test Coverage:
- LabQueue model creation and auto-generated queue numbers
- Queue prioritization and status workflow
- Technician assignment and sample tracking
- Turnaround time calculation
"""

from datetime import datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.models import (
    LabOrder,
    LabOrderItem,
    TestCatalog,
)
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def sample_patient(db):
    """Create a sample patient for testing."""
    from hmis.apps.core.models import County, SubCounty

    county = County.objects.create(code=1, name="Mombasa")
    sub_county = SubCounty.objects.create(county=county, name="Mvita")

    return Patient.objects.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth="1985-05-20",
        gender="F",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def sample_user(db):
    """Create a sample user for testing."""
    return User.objects.create_user(
        username="testdoctor",
        email="doctor@test.com",
        password="testpass123",
    )


@pytest.fixture
def lab_technician(db):
    """Create a lab technician user."""
    return User.objects.create_user(
        username="labtechnician",
        email="labtech@test.com",
        password="testpass123",
    )


@pytest.fixture
def sample_encounter(sample_patient, sample_user):
    """Create a sample encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Routine checkup",
    )


@pytest.fixture
def sample_test(db):
    """Create a sample lab test."""
    return TestCatalog.objects.create(
        code="CBC",
        name="Complete Blood Count",
        short_name="CBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
        cost=500.00,
    )


@pytest.fixture
def sample_lab_order(sample_patient, sample_encounter, sample_user, sample_test):
    """Create a sample lab order with an item."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=sample_user,
        order_type="IN_HOUSE",
        priority="ROUTINE",
        status="ORDERED",
    )
    LabOrderItem.objects.create(
        lab_order=order,
        test=sample_test,
        unit_cost=sample_test.cost,
    )
    return order


@pytest.mark.django_db
class TestLabQueueModel:
    """Test suite for LabQueue model."""

    def test_queue_entry_creation(self, sample_lab_order):
        """Queue entry should be created with lab order."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
            priority="ROUTINE",
        )

        assert queue.id is not None
        assert queue.lab_order == sample_lab_order
        assert queue.queue_status == "PENDING"  # Default status

    def test_queue_number_auto_generated(self, sample_lab_order):
        """Queue number should be auto-generated in LAB-YYYYMMDD-XXXX format."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        assert queue.queue_number is not None
        assert queue.queue_number.startswith("LAB-")
        # Format: LAB-YYYYMMDD-XXXX (17 characters)
        today = datetime.now().strftime("%Y%m%d")
        assert today in queue.queue_number
        assert len(queue.queue_number) == 17  # LAB-YYYYMMDD-XXXX

    def test_queue_number_uniqueness(self, sample_lab_order, sample_patient, sample_encounter, sample_user, sample_test):
        """Each queue number must be unique."""
        from hmis.apps.laboratory.models import LabQueue

        # Create first queue entry
        queue1 = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        # Create second lab order
        order2 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=sample_user,
            order_type="IN_HOUSE",
        )
        LabOrderItem.objects.create(
            lab_order=order2,
            test=sample_test,
            unit_cost=sample_test.cost,
        )

        # Create second queue entry
        queue2 = LabQueue.objects.create(
            lab_order=order2,
            sample_type="blood",
        )

        assert queue1.queue_number != queue2.queue_number

    def test_priority_ordering(self, sample_patient, sample_encounter, sample_user, sample_test):
        """STAT > Urgent > Routine priority ordering."""
        from hmis.apps.laboratory.models import LabQueue

        # Create orders with different priorities
        orders = []
        for priority in ["ROUTINE", "URGENT", "STAT"]:
            order = LabOrder.objects.create(
                patient=sample_patient,
                encounter=sample_encounter,
                ordered_by=sample_user,
                order_type="IN_HOUSE",
                priority=priority,
            )
            LabOrderItem.objects.create(
                lab_order=order,
                test=sample_test,
                unit_cost=sample_test.cost,
            )
            queue = LabQueue.objects.create(
                lab_order=order,
                sample_type="blood",
                priority=priority,
            )
            orders.append(queue)

        # Get ordered queue (default ordering is by priority, then created_at)
        queued_items = list(LabQueue.objects.all())

        # STAT should be first, ROUTINE should be last
        assert queued_items[0].priority == "STAT"
        assert queued_items[-1].priority == "ROUTINE"

    def test_assign_technician(self, sample_lab_order, lab_technician):
        """Technician can be assigned to queue entry."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        queue.assign_to(lab_technician)

        queue.refresh_from_db()
        assert queue.assigned_technician == lab_technician

    def test_collect_sample(self, sample_lab_order, sample_user):
        """Sample collection should be recorded."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        sample_id = "SAMPLE-001"
        queue.collect_sample(sample_user, sample_id)

        queue.refresh_from_db()
        assert queue.queue_status == "COLLECTED"
        assert queue.collected_by == sample_user
        assert queue.sample_id == sample_id
        assert queue.collected_at is not None

    def test_sample_id_recorded(self, sample_lab_order, sample_user):
        """Barcode/tube ID should be stored."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        barcode = "BC12345678"
        queue.collect_sample(sample_user, barcode)

        queue.refresh_from_db()
        assert queue.sample_id == barcode

    def test_start_processing(self, sample_lab_order, lab_technician):
        """Status should change to processing."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
            queue_status="COLLECTED",
        )

        queue.start_processing()

        queue.refresh_from_db()
        assert queue.queue_status == "PROCESSING"
        assert queue.processing_started_at is not None

    def test_submit_for_review(self, sample_lab_order):
        """Status should change to review."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
            queue_status="PROCESSING",
        )

        queue.submit_for_review()

        queue.refresh_from_db()
        assert queue.queue_status == "REVIEW"
        assert queue.processing_completed_at is not None

    def test_release_results(self, sample_lab_order, sample_user):
        """Results should be released and order completed."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
            queue_status="REVIEW",
        )

        queue.release_results(sample_user)

        queue.refresh_from_db()
        assert queue.queue_status == "RELEASED"
        assert queue.reviewed_by == sample_user
        assert queue.reviewed_at is not None
        assert queue.released_at is not None

    def test_reject_sample(self, sample_lab_order):
        """Sample rejection should be recorded with reason."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        reason = "Hemolyzed sample"
        queue.reject_sample(reason)

        queue.refresh_from_db()
        assert queue.rejection_reason == reason

    def test_turnaround_time_calculation(self, sample_lab_order, sample_user):
        """TAT should be correctly calculated from order to release."""
        from hmis.apps.laboratory.models import LabQueue

        queue = LabQueue.objects.create(
            lab_order=sample_lab_order,
            sample_type="blood",
        )

        # Simulate time passing
        queue.created_at = timezone.now() - timedelta(hours=2)
        queue.save()

        queue.release_results(sample_user)

        tat = queue.get_turnaround_time()
        assert tat is not None
        assert tat.total_seconds() > 0

    def test_queue_filtering_by_status(self, sample_patient, sample_encounter, sample_user, sample_test):
        """Should be able to filter queue by status."""
        from hmis.apps.laboratory.models import LabQueue

        # Create multiple queue entries with different statuses
        statuses = ["PENDING", "COLLECTED", "PROCESSING"]
        for status in statuses:
            order = LabOrder.objects.create(
                patient=sample_patient,
                encounter=sample_encounter,
                ordered_by=sample_user,
                order_type="IN_HOUSE",
            )
            LabOrderItem.objects.create(
                lab_order=order,
                test=sample_test,
                unit_cost=sample_test.cost,
            )
            LabQueue.objects.create(
                lab_order=order,
                sample_type="blood",
                queue_status=status,
            )

        # Filter by status
        pending = LabQueue.objects.filter(queue_status="PENDING")
        processing = LabQueue.objects.filter(queue_status="PROCESSING")

        assert pending.count() == 1
        assert processing.count() == 1

    def test_queue_filtering_by_technician(self, sample_patient, sample_encounter, sample_user, sample_test, lab_technician):
        """Should be able to filter queue by assigned technician."""
        from hmis.apps.laboratory.models import LabQueue

        # Create queue entry assigned to technician
        order1 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=sample_user,
            order_type="IN_HOUSE",
        )
        LabOrderItem.objects.create(
            lab_order=order1,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        queue1 = LabQueue.objects.create(
            lab_order=order1,
            sample_type="blood",
            assigned_technician=lab_technician,
        )

        # Create queue entry without assignment
        order2 = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=sample_user,
            order_type="IN_HOUSE",
        )
        LabOrderItem.objects.create(
            lab_order=order2,
            test=sample_test,
            unit_cost=sample_test.cost,
        )
        LabQueue.objects.create(
            lab_order=order2,
            sample_type="blood",
        )

        # Filter by technician
        assigned = LabQueue.objects.filter(assigned_technician=lab_technician)

        assert assigned.count() == 1
        assert assigned.first().id == queue1.id
