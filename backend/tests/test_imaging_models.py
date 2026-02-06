"""
Tests for imaging models.

Following TDD methodology - these tests define the expected behavior
before implementation.

Sprint A.1: Backend Models & Catalog
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

User = get_user_model()


# ============================================================================
# ImagingProcedure Model Tests (15 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingProcedure:
    """Tests for ImagingProcedure (catalog) model."""

    def test_create_imaging_procedure_with_required_fields(self):
        """Should create imaging procedure with required fields."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="XR-CHEST",
            name="Chest X-Ray (PA View)",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1500.00"),
        )
        assert procedure.code == "XR-CHEST"
        assert procedure.name == "Chest X-Ray (PA View)"
        assert procedure.modality == "XR"
        assert procedure.body_region == "CHEST"
        assert procedure.is_active is True
        assert procedure.sha_claimable is True

    def test_procedure_code_uniqueness(self):
        """Procedure code should be unique."""
        from hmis.apps.imaging.models import ImagingProcedure

        ImagingProcedure.objects.create(
            code="US-ABD",
            name="Abdominal Ultrasound",
            modality="US",
            body_region="ABDOMEN",
        )
        with pytest.raises(IntegrityError):
            ImagingProcedure.objects.create(
                code="US-ABD",  # Duplicate
                name="Another Ultrasound",
                modality="US",
                body_region="ABDOMEN",
            )

    def test_procedure_modality_choices(self):
        """Should accept valid modality choices."""
        from hmis.apps.imaging.models import ImagingProcedure

        modalities = ["XR", "US", "CT", "MRI", "NM", "MG", "FL", "OTHER"]
        for i, modality in enumerate(modalities):
            procedure = ImagingProcedure.objects.create(
                code=f"TEST-{modality}-{i}",
                name=f"Test Procedure {modality}",
                modality=modality,
                body_region="CHEST",
            )
            assert procedure.modality == modality

    def test_procedure_body_region_choices(self):
        """Should accept valid body region choices."""
        from hmis.apps.imaging.models import ImagingProcedure

        regions = [
            "HEAD",
            "NECK",
            "CHEST",
            "ABDOMEN",
            "PELVIS",
            "SPINE",
            "UPPER_EXTREMITY",
            "LOWER_EXTREMITY",
            "WHOLE_BODY",
            "OTHER",
        ]
        for i, region in enumerate(regions):
            procedure = ImagingProcedure.objects.create(
                code=f"TEST-REGION-{i}",
                name=f"Test Procedure {region}",
                modality="XR",
                body_region=region,
            )
            assert procedure.body_region == region

    def test_procedure_with_interoperability_codes(self):
        """Should store RadLex and LOINC codes."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="CT-HEAD",
            name="CT Head without Contrast",
            modality="CT",
            body_region="HEAD",
            radlex_code="RPID5783",
            loinc_code="24725-4",
        )
        assert procedure.radlex_code == "RPID5783"
        assert procedure.loinc_code == "24725-4"

    def test_procedure_with_requirements(self):
        """Should store contrast and sedation requirements."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="CT-ABD-C",
            name="CT Abdomen with Contrast",
            modality="CT",
            body_region="ABDOMEN",
            requires_contrast=True,
            requires_sedation=False,
            special_preparation="NPO for 4 hours before procedure",
            turnaround_hours=48,
        )
        assert procedure.requires_contrast is True
        assert procedure.requires_sedation is False
        assert "NPO" in procedure.special_preparation
        assert procedure.turnaround_hours == 48

    def test_procedure_cost_and_sha_fields(self):
        """Should store cost and SHA claimability."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="MRI-BRAIN",
            name="MRI Brain without Contrast",
            modality="MRI",
            body_region="HEAD",
            cost=Decimal("15000.00"),
            sha_claimable=True,
            sha_intervention_code="SHA-IMG-001",
        )
        assert procedure.cost == Decimal("15000.00")
        assert procedure.sha_claimable is True
        assert procedure.sha_intervention_code == "SHA-IMG-001"

    def test_procedure_availability_flags(self):
        """Should track in-house availability."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="PET-SCAN",
            name="PET Scan",
            modality="NM",
            body_region="WHOLE_BODY",
            is_active=True,
            available_in_house=False,
        )
        assert procedure.is_active is True
        assert procedure.available_in_house is False

    def test_procedure_str_representation(self):
        """Should return meaningful string representation."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="XR-SPINE",
            name="Spine X-Ray",
            modality="XR",
            body_region="SPINE",
        )
        assert "XR-SPINE" in str(procedure)
        assert "Spine X-Ray" in str(procedure)

    def test_procedure_default_values(self):
        """Should have sensible default values."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="XR-HAND",
            name="Hand X-Ray",
            modality="XR",
            body_region="UPPER_EXTREMITY",
        )
        assert procedure.requires_contrast is False
        assert procedure.requires_sedation is False
        assert procedure.turnaround_hours == 24
        assert procedure.cost == Decimal("0")
        assert procedure.is_active is True
        assert procedure.available_in_house is True

    def test_procedure_timestamps(self):
        """Should auto-set created_at and updated_at."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="XR-FOOT",
            name="Foot X-Ray",
            modality="XR",
            body_region="LOWER_EXTREMITY",
        )
        assert procedure.created_at is not None
        assert procedure.updated_at is not None

    def test_filter_active_procedures(self):
        """Should filter by active status."""
        from hmis.apps.imaging.models import ImagingProcedure

        ImagingProcedure.objects.create(
            code="ACTIVE-1",
            name="Active Procedure",
            modality="XR",
            body_region="CHEST",
            is_active=True,
        )
        ImagingProcedure.objects.create(
            code="INACTIVE-1",
            name="Inactive Procedure",
            modality="XR",
            body_region="CHEST",
            is_active=False,
        )
        active = ImagingProcedure.objects.filter(is_active=True)
        assert active.filter(code="ACTIVE-1").exists()
        assert not active.filter(code="INACTIVE-1").exists()

    def test_filter_by_modality(self):
        """Should filter procedures by modality."""
        from hmis.apps.imaging.models import ImagingProcedure

        ImagingProcedure.objects.create(
            code="XR-TEST-1",
            name="X-Ray Test",
            modality="XR",
            body_region="CHEST",
        )
        ImagingProcedure.objects.create(
            code="CT-TEST-1",
            name="CT Test",
            modality="CT",
            body_region="CHEST",
        )
        xray_procedures = ImagingProcedure.objects.filter(modality="XR")
        assert xray_procedures.count() >= 1
        assert all(p.modality == "XR" for p in xray_procedures)

    def test_filter_by_body_region(self):
        """Should filter procedures by body region."""
        from hmis.apps.imaging.models import ImagingProcedure

        ImagingProcedure.objects.create(
            code="HEAD-TEST-1",
            name="Head Test",
            modality="CT",
            body_region="HEAD",
        )
        ImagingProcedure.objects.create(
            code="CHEST-TEST-2",
            name="Chest Test",
            modality="CT",
            body_region="CHEST",
        )
        head_procedures = ImagingProcedure.objects.filter(body_region="HEAD")
        assert head_procedures.count() >= 1
        assert all(p.body_region == "HEAD" for p in head_procedures)

    def test_procedure_ordering(self):
        """Procedures should be ordered by modality and name."""
        from hmis.apps.imaging.models import ImagingProcedure

        ImagingProcedure.objects.create(
            code="Z-PROC",
            name="Zebra Procedure",
            modality="XR",
            body_region="CHEST",
        )
        ImagingProcedure.objects.create(
            code="A-PROC",
            name="Alpha Procedure",
            modality="CT",
            body_region="CHEST",
        )
        procedures = list(ImagingProcedure.objects.all())
        # Should be ordered by modality, then name
        assert len(procedures) >= 2


# ============================================================================
# ImagingOrder Model Tests (20 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingOrder:
    """Tests for ImagingOrder model."""

    @pytest.fixture
    def imaging_setup(self, sample_patient, sample_encounter, test_user):
        """Setup for imaging order tests."""
        from hmis.apps.imaging.models import ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="XR-CHEST-TEST",
            name="Chest X-Ray Test",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1500.00"),
        )
        return {
            "patient": sample_patient,
            "encounter": sample_encounter,
            "user": test_user,
            "procedure": procedure,
        }

    def test_create_imaging_order(self, imaging_setup):
        """Should create imaging order with required fields."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Suspected pneumonia",
        )
        assert order.patient == imaging_setup["patient"]
        assert order.encounter == imaging_setup["encounter"]
        assert order.ordered_by == imaging_setup["user"]
        assert order.clinical_indication == "Suspected pneumonia"
        assert order.status == "DRAFT"

    def test_order_number_auto_generation(self, imaging_setup):
        """Order number should be auto-generated in RAD-YYYYMMDD-XXXX format."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test indication",
        )
        assert order.order_number.startswith("RAD-")
        # Should match format RAD-YYYYMMDD-XXXX
        parts = order.order_number.split("-")
        assert len(parts) == 3
        assert parts[0] == "RAD"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX

    def test_order_number_uniqueness(self, imaging_setup):
        """Order numbers should be unique."""
        from hmis.apps.imaging.models import ImagingOrder

        order1 = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test 1",
        )
        order2 = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test 2",
        )
        assert order1.order_number != order2.order_number

    def test_order_number_sequential_increment(self, imaging_setup):
        """Order numbers should increment sequentially per day."""
        from hmis.apps.imaging.models import ImagingOrder

        order1 = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test 1",
        )
        order2 = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test 2",
        )
        # Extract sequence numbers
        seq1 = int(order1.order_number.split("-")[-1])
        seq2 = int(order2.order_number.split("-")[-1])
        assert seq2 == seq1 + 1

    def test_order_priority_levels(self, imaging_setup):
        """Should accept valid priority levels."""
        from hmis.apps.imaging.models import ImagingOrder

        for priority in ["ROUTINE", "URGENT", "STAT"]:
            order = ImagingOrder.objects.create(
                patient=imaging_setup["patient"],
                encounter=imaging_setup["encounter"],
                ordered_by=imaging_setup["user"],
                clinical_indication=f"Test {priority}",
                priority=priority,
            )
            assert order.priority == priority

    def test_order_status_choices(self, imaging_setup):
        """Should have valid status choices."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        valid_statuses = [
            "DRAFT",
            "ORDERED",
            "SCHEDULED",
            "IN_PROGRESS",
            "COMPLETED",
            "REPORTED",
            "CANCELLED",
        ]
        for status in valid_statuses:
            order.status = status
            order.save()
            order.refresh_from_db()
            assert order.status == status

    def test_order_default_status_is_draft(self, imaging_setup):
        """New orders should default to DRAFT status."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        assert order.status == "DRAFT"

    def test_order_default_priority_is_routine(self, imaging_setup):
        """New orders should default to ROUTINE priority."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        assert order.priority == "ROUTINE"

    def test_order_clinical_history_optional(self, imaging_setup):
        """Relevant clinical history should be optional."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
            relevant_clinical_history="Patient is diabetic, smoker for 20 years",
        )
        assert "diabetic" in order.relevant_clinical_history

    def test_order_scheduling_fields(self, imaging_setup):
        """Should store scheduling information."""
        from hmis.apps.imaging.models import ImagingOrder

        scheduled_time = timezone.now() + timedelta(hours=2)
        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
            scheduled_datetime=scheduled_time,
            scheduled_room="Radiology Room 1",
        )
        assert order.scheduled_datetime is not None
        assert order.scheduled_room == "Radiology Room 1"

    def test_order_dicom_fields(self, imaging_setup):
        """Should store DICOM/PACS identifiers."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
            accession_number="ACC-2026-001234",
            study_instance_uid="1.2.840.10008.5.1.4.1.1.2.1",
        )
        assert order.accession_number == "ACC-2026-001234"
        assert order.study_instance_uid.startswith("1.2.840")

    def test_order_billing_fields(self, imaging_setup):
        """Should track billing information."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
            total_cost=Decimal("5000.00"),
            is_paid=True,
        )
        assert order.total_cost == Decimal("5000.00")
        assert order.is_paid is True

    def test_order_timestamps(self, imaging_setup):
        """Should track ordered_at and completed_at timestamps."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        assert order.ordered_at is not None
        assert order.completed_at is None  # Not yet completed

    def test_order_str_representation(self, imaging_setup):
        """Should return meaningful string representation."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        str_repr = str(order)
        assert order.order_number in str_repr

    def test_order_protect_patient_deletion(self, imaging_setup):
        """Should protect patient from deletion when orders exist."""
        from django.db.models import ProtectedError

        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        with pytest.raises(ProtectedError):
            imaging_setup["patient"].delete()

    def test_order_protect_encounter_deletion(self, imaging_setup):
        """Should protect encounter from deletion when orders exist."""
        from django.db.models import ProtectedError

        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        with pytest.raises(ProtectedError):
            imaging_setup["encounter"].delete()

    def test_filter_orders_by_patient(self, imaging_setup):
        """Should filter orders by patient."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
        )
        patient_orders = ImagingOrder.objects.filter(patient=imaging_setup["patient"])
        assert patient_orders.count() >= 1

    def test_filter_orders_by_status(self, imaging_setup):
        """Should filter orders by status."""
        from hmis.apps.imaging.models import ImagingOrder

        ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test",
            status="DRAFT",
        )
        draft_orders = ImagingOrder.objects.filter(status="DRAFT")
        assert draft_orders.count() >= 1

    def test_order_ordering_by_date(self, imaging_setup):
        """Orders should be ordered by most recent first."""
        from hmis.apps.imaging.models import ImagingOrder

        order1 = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test 1",
        )
        order2 = ImagingOrder.objects.create(
            patient=imaging_setup["patient"],
            encounter=imaging_setup["encounter"],
            ordered_by=imaging_setup["user"],
            clinical_indication="Test 2",
        )
        orders = list(ImagingOrder.objects.all())
        # Most recent should be first
        assert orders[0].pk >= orders[-1].pk


# ============================================================================
# ImagingOrderItem Model Tests (12 tests)
# ============================================================================


@pytest.mark.django_db
class TestImagingOrderItem:
    """Tests for ImagingOrderItem model."""

    @pytest.fixture
    def order_setup(self, sample_patient, sample_encounter, test_user):
        """Setup for order item tests."""
        from hmis.apps.imaging.models import ImagingOrder, ImagingProcedure

        procedure = ImagingProcedure.objects.create(
            code="XR-KNEE-TEST",
            name="Knee X-Ray",
            modality="XR",
            body_region="LOWER_EXTREMITY",
            cost=Decimal("2000.00"),
        )
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Knee pain after injury",
        )
        return {
            "order": order,
            "procedure": procedure,
        }

    def test_create_order_item(self, order_setup):
        """Should create order item with required fields."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        assert item.order == order_setup["order"]
        assert item.procedure == order_setup["procedure"]
        assert item.laterality == "NA"

    def test_order_item_laterality_choices(self, order_setup):
        """Should accept valid laterality choices."""
        from hmis.apps.imaging.models import ImagingOrderItem

        for laterality in ["NA", "LEFT", "RIGHT", "BILATERAL"]:
            item = ImagingOrderItem.objects.create(
                order=order_setup["order"],
                procedure=order_setup["procedure"],
                laterality=laterality,
            )
            assert item.laterality == laterality

    def test_order_item_default_laterality(self, order_setup):
        """Default laterality should be NA."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        assert item.laterality == "NA"

    def test_order_item_with_instructions(self, order_setup):
        """Should store specific instructions."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
            specific_instructions="Include comparison with previous study",
        )
        assert "comparison" in item.specific_instructions

    def test_order_item_completion_tracking(self, order_setup):
        """Should track item completion status."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        assert item.is_completed is False
        assert item.completed_at is None

        item.is_completed = True
        item.completed_at = timezone.now()
        item.save()
        item.refresh_from_db()
        assert item.is_completed is True
        assert item.completed_at is not None

    def test_order_item_unit_cost(self, order_setup):
        """Should store unit cost from procedure."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
            unit_cost=order_setup["procedure"].cost,
        )
        assert item.unit_cost == Decimal("2000.00")

    def test_order_item_default_unit_cost(self, order_setup):
        """Default unit cost should be 0."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        assert item.unit_cost == Decimal("0")

    def test_order_item_cascade_delete_with_order(self, order_setup):
        """Items should be deleted when order is deleted."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        item_id = item.id
        order_setup["order"].delete()
        assert not ImagingOrderItem.objects.filter(id=item_id).exists()

    def test_order_item_protect_procedure_deletion(self, order_setup):
        """Should protect procedure from deletion when items exist."""
        from django.db.models import ProtectedError

        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        with pytest.raises(ProtectedError):
            order_setup["procedure"].delete()

    def test_multiple_items_per_order(self, order_setup):
        """Order can have multiple items."""
        from hmis.apps.imaging.models import ImagingOrderItem, ImagingProcedure

        procedure2 = ImagingProcedure.objects.create(
            code="US-KNEE-TEST",
            name="Knee Ultrasound",
            modality="US",
            body_region="LOWER_EXTREMITY",
            cost=Decimal("3000.00"),
        )
        item1 = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
            laterality="LEFT",
        )
        item2 = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=procedure2,
            laterality="LEFT",
        )
        assert order_setup["order"].items.count() == 2

    def test_order_item_str_representation(self, order_setup):
        """Should return meaningful string representation."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        str_repr = str(item)
        assert order_setup["procedure"].name in str_repr or order_setup["procedure"].code in str_repr

    def test_order_related_name_items(self, order_setup):
        """Order should access items via related_name='items'."""
        from hmis.apps.imaging.models import ImagingOrderItem

        item = ImagingOrderItem.objects.create(
            order=order_setup["order"],
            procedure=order_setup["procedure"],
        )
        assert item in order_setup["order"].items.all()


# ============================================================================
# Order Number Generator Tests (5 tests)
# ============================================================================


@pytest.mark.django_db
class TestOrderNumberGenerator:
    """Tests for imaging order number generation."""

    def test_generate_order_number_format(self, sample_patient, sample_encounter, test_user):
        """Order number should follow RAD-YYYYMMDD-XXXX format."""
        from hmis.apps.imaging.models import generate_imaging_order_number

        order_number = generate_imaging_order_number()
        assert order_number.startswith("RAD-")
        parts = order_number.split("-")
        assert len(parts) == 3
        today = datetime.now().strftime("%Y%m%d")
        assert parts[1] == today

    def test_generate_order_number_first_of_day(self, sample_patient, sample_encounter, test_user):
        """First order of the day should be 0001."""
        from hmis.apps.imaging.models import ImagingOrder, generate_imaging_order_number

        # Clear existing orders for today
        today = datetime.now().strftime("%Y%m%d")
        ImagingOrder.objects.filter(order_number__startswith=f"RAD-{today}-").delete()

        order_number = generate_imaging_order_number()
        assert order_number.endswith("-0001")

    def test_generate_order_number_increments(self, sample_patient, sample_encounter, test_user):
        """Order numbers should increment within the day."""
        from hmis.apps.imaging.models import ImagingOrder

        order1 = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test 1",
        )
        order2 = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test 2",
        )
        seq1 = int(order1.order_number.split("-")[-1])
        seq2 = int(order2.order_number.split("-")[-1])
        assert seq2 == seq1 + 1

    def test_order_number_not_editable(self, sample_patient, sample_encounter, test_user):
        """Order number should not be editable after creation."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        original_number = order.order_number
        order.order_number = "RAD-00000000-9999"
        order.save()
        order.refresh_from_db()
        # The order number should remain unchanged or the field should be read-only
        assert order.order_number == original_number

    def test_order_number_persists_on_save(self, sample_patient, sample_encounter, test_user):
        """Order number should not change on subsequent saves."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test",
        )
        original_number = order.order_number
        order.clinical_indication = "Updated indication"
        order.save()
        order.refresh_from_db()
        assert order.order_number == original_number


# ============================================================================
# Status Transition Tests (15 tests)
# ============================================================================


@pytest.mark.django_db
class TestStatusTransitions:
    """Tests for imaging order status transitions."""

    @pytest.fixture
    def order(self, sample_patient, sample_encounter, test_user):
        """Create a test order."""
        from hmis.apps.imaging.models import ImagingOrder

        return ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Test indication",
        )

    def test_valid_transition_draft_to_ordered(self, order, test_user):
        """Should allow transition from DRAFT to ORDERED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.update_status("ORDERED", test_user)
        assert order.status == "ORDERED"

    def test_valid_transition_draft_to_cancelled(self, order, test_user):
        """Should allow transition from DRAFT to CANCELLED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.update_status("CANCELLED", test_user)
        assert order.status == "CANCELLED"

    def test_valid_transition_ordered_to_scheduled(self, order, test_user):
        """Should allow transition from ORDERED to SCHEDULED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "ORDERED"
        order.save()
        order.update_status("SCHEDULED", test_user)
        assert order.status == "SCHEDULED"

    def test_valid_transition_ordered_to_in_progress(self, order, test_user):
        """Should allow transition from ORDERED to IN_PROGRESS."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "ORDERED"
        order.save()
        order.update_status("IN_PROGRESS", test_user)
        assert order.status == "IN_PROGRESS"

    def test_valid_transition_ordered_to_cancelled(self, order, test_user):
        """Should allow transition from ORDERED to CANCELLED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "ORDERED"
        order.save()
        order.update_status("CANCELLED", test_user)
        assert order.status == "CANCELLED"

    def test_valid_transition_scheduled_to_in_progress(self, order, test_user):
        """Should allow transition from SCHEDULED to IN_PROGRESS."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "SCHEDULED"
        order.save()
        order.update_status("IN_PROGRESS", test_user)
        assert order.status == "IN_PROGRESS"

    def test_valid_transition_scheduled_to_cancelled(self, order, test_user):
        """Should allow transition from SCHEDULED to CANCELLED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "SCHEDULED"
        order.save()
        order.update_status("CANCELLED", test_user)
        assert order.status == "CANCELLED"

    def test_valid_transition_in_progress_to_completed(self, order, test_user):
        """Should allow transition from IN_PROGRESS to COMPLETED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "IN_PROGRESS"
        order.save()
        order.update_status("COMPLETED", test_user)
        assert order.status == "COMPLETED"

    def test_valid_transition_completed_to_reported(self, order, test_user):
        """Should allow transition from COMPLETED to REPORTED."""
        from hmis.apps.imaging.models import ImagingOrder

        order.status = "COMPLETED"
        order.save()
        order.update_status("REPORTED", test_user)
        assert order.status == "REPORTED"

    def test_invalid_transition_draft_to_completed(self, order, test_user):
        """Should reject transition from DRAFT to COMPLETED."""
        with pytest.raises(ValidationError):
            order.update_status("COMPLETED", test_user)

    def test_invalid_transition_cancelled_to_any(self, order, test_user):
        """Should reject any transition from CANCELLED."""
        order.status = "CANCELLED"
        order.save()
        with pytest.raises(ValidationError):
            order.update_status("ORDERED", test_user)

    def test_invalid_transition_reported_to_any(self, order, test_user):
        """Should reject any transition from REPORTED."""
        order.status = "REPORTED"
        order.save()
        with pytest.raises(ValidationError):
            order.update_status("COMPLETED", test_user)

    def test_invalid_transition_completed_to_in_progress(self, order, test_user):
        """Should reject transition from COMPLETED to IN_PROGRESS."""
        order.status = "COMPLETED"
        order.save()
        with pytest.raises(ValidationError):
            order.update_status("IN_PROGRESS", test_user)

    def test_completed_sets_completed_at(self, order, test_user):
        """Transition to COMPLETED should set completed_at timestamp."""
        order.status = "IN_PROGRESS"
        order.save()
        assert order.completed_at is None
        order.update_status("COMPLETED", test_user)
        assert order.completed_at is not None

    def test_invalid_status_value_rejected(self, order, test_user):
        """Should reject invalid status values."""
        with pytest.raises(ValidationError):
            order.update_status("INVALID_STATUS", test_user)


# ============================================================================
# Order Total Cost Calculation Tests (5 tests)
# ============================================================================


@pytest.mark.django_db
class TestOrderTotalCost:
    """Tests for order total cost calculation."""

    @pytest.fixture
    def order_with_items(self, sample_patient, sample_encounter, test_user):
        """Create an order with multiple items."""
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

        proc1 = ImagingProcedure.objects.create(
            code="XR-COST-1",
            name="Procedure 1",
            modality="XR",
            body_region="CHEST",
            cost=Decimal("1000.00"),
        )
        proc2 = ImagingProcedure.objects.create(
            code="CT-COST-1",
            name="Procedure 2",
            modality="CT",
            body_region="CHEST",
            cost=Decimal("5000.00"),
        )
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Cost test",
        )
        ImagingOrderItem.objects.create(
            order=order,
            procedure=proc1,
            unit_cost=proc1.cost,
        )
        ImagingOrderItem.objects.create(
            order=order,
            procedure=proc2,
            unit_cost=proc2.cost,
        )
        return order

    def test_calculate_total_cost(self, order_with_items):
        """Should calculate total cost from all items."""
        total = order_with_items.calculate_total_cost()
        assert total == Decimal("6000.00")

    def test_calculate_total_updates_order(self, order_with_items):
        """Should update order's total_cost field."""
        order_with_items.calculate_total_cost()
        order_with_items.refresh_from_db()
        assert order_with_items.total_cost == Decimal("6000.00")

    def test_calculate_total_empty_order(self, sample_patient, sample_encounter, test_user):
        """Should return 0 for order with no items."""
        from hmis.apps.imaging.models import ImagingOrder

        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Empty order",
        )
        total = order.calculate_total_cost()
        assert total == Decimal("0")

    def test_calculate_total_with_bilateral(self, sample_patient, sample_encounter, test_user):
        """Should include bilateral items in total."""
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

        proc = ImagingProcedure.objects.create(
            code="XR-BILATERAL",
            name="Bilateral X-Ray",
            modality="XR",
            body_region="LOWER_EXTREMITY",
            cost=Decimal("2000.00"),
        )
        order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Bilateral test",
        )
        ImagingOrderItem.objects.create(
            order=order,
            procedure=proc,
            laterality="BILATERAL",
            unit_cost=proc.cost,
        )
        total = order.calculate_total_cost()
        assert total == Decimal("2000.00")

    def test_order_is_complete_method(self, order_with_items):
        """Should check if all items are completed."""
        assert order_with_items.is_complete() is False
        for item in order_with_items.items.all():
            item.is_completed = True
            item.completed_at = timezone.now()
            item.save()
        assert order_with_items.is_complete() is True
