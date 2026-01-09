"""
Tests for ExternalLabRequisition PDF generator (Phase 2.2).

Sprint 1.5-1.6 Track B: Lab Workflow
"""

from io import BytesIO

import pytest # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.laboratory.services.requisition import ExternalLabRequisition

User = get_user_model()


@pytest.mark.django_db
class TestExternalLabRequisition:
    """Test external lab requisition PDF generation."""

    def test_requisition_only_for_external_orders(self, sample_lab_order):
        """Should raise error for non-external orders."""
        sample_lab_order.order_type = 'IN_HOUSE'
        sample_lab_order.save()

        with pytest.raises(ValueError, match="Requisition only for external orders"):
            ExternalLabRequisition(sample_lab_order)

    def test_generate_pdf_returns_bytesio(self, sample_lab_order):
        """Should return BytesIO buffer with PDF content."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        pdf_buffer = requisition.generate_pdf()

        assert isinstance(pdf_buffer, BytesIO)
        assert pdf_buffer.tell() == 0  # Seeked to beginning
        assert len(pdf_buffer.getvalue()) > 0  # Has content

    def test_pdf_contains_patient_information(self, sample_lab_order):
        """Should include patient name, MRN, DOB in context."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        context = requisition._build_context()

        # Check context has patient info (PDF content is compressed)
        assert sample_lab_order.patient.first_name in context['patient_name']
        assert context['patient_mrn'] == sample_lab_order.patient.mrn

    def test_pdf_contains_facility_information(self, sample_lab_order):
        """Should include facility name and contact info."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        context = requisition._build_context()

        assert 'facility_name' in context
        assert 'facility_phone' in context

    def test_pdf_contains_test_information(self, sample_lab_order, sample_test_catalog):
        """Should include test name and code."""
        from hmis.apps.laboratory.models import LabOrderItem

        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        # Create order item with test
        LabOrderItem.objects.create(
            lab_order=sample_lab_order,
            test=sample_test_catalog,
            unit_cost=sample_test_catalog.cost
        )

        requisition = ExternalLabRequisition(sample_lab_order)
        context = requisition._build_context()

        assert 'test_name' in context
        assert context['test_name'] == sample_test_catalog.name

    def test_pdf_contains_clinical_information(self, sample_lab_order):
        """Should include ordering clinician and diagnosis."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.clinical_notes = "Patient presents with fever"
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        context = requisition._build_context()

        assert 'clinician_name' in context
        assert 'clinical_notes' in context

    def test_priority_highlighted(self, sample_lab_order):
        """Should highlight STAT/URGENT priority."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        # Update existing queue entry with STAT priority (fixture already created one)
        queue = sample_lab_order.queue_entry
        queue.priority = 'STAT'
        queue.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        context = requisition._build_context()

        assert context['priority'] == 'STAT'

    def test_requisition_number_on_pdf(self, sample_lab_order):
        """Should include unique requisition number."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        context = requisition._build_context()

        assert 'requisition_number' in context
        assert context['requisition_number'] == sample_lab_order.order_number

    def test_save_pdf_to_order(self, sample_lab_order):
        """Should save PDF to order's requisition_pdf field."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        requisition.save_to_order()

        sample_lab_order.refresh_from_db()
        assert sample_lab_order.requisition_pdf
        assert sample_lab_order.requisition_pdf.name.endswith('.pdf')

    def test_pdf_filename_format(self, sample_lab_order):
        """Should use format: requisition_{order_number}.pdf."""
        sample_lab_order.order_type = 'EXTERNAL'
        sample_lab_order.save()

        requisition = ExternalLabRequisition(sample_lab_order)
        requisition.save_to_order()

        sample_lab_order.refresh_from_db()
        # Django may add unique suffix to filename, check base pattern
        base_filename = f"requisition_{sample_lab_order.order_number}"
        assert base_filename in sample_lab_order.requisition_pdf.name
        assert sample_lab_order.requisition_pdf.name.endswith('.pdf')
