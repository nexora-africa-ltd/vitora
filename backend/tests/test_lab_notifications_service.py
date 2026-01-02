"""
Tests for LabNotificationService (Phase 2.3).

Sprint 1.5-1.6 Track B: Lab Workflow
"""

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from hmis.apps.core.models import Notification
from hmis.apps.laboratory.models import LabOrder, LabResult
from hmis.apps.laboratory.services.notifications import LabNotificationService

User = get_user_model()


@pytest.mark.django_db
class TestLabNotificationService:
    """Test lab notification service."""
    
    def test_notification_created_for_completed_order(self, sample_lab_order):
        """Should create notification when results are ready."""
        service = LabNotificationService()
        
        notification = service.send_result_notification(sample_lab_order)
        
        assert notification is not None
        assert notification.user == sample_lab_order.encounter.clinician
        assert notification.notification_type == 'lab_result'
    
    def test_critical_priority_for_critical_results(self, sample_lab_order, sample_lab_result):
        """Should set critical priority when results contain critical values."""
        sample_lab_result.is_critical_result = True
        sample_lab_result.save()
        
        service = LabNotificationService()
        notification = service.send_result_notification(sample_lab_order)
        
        assert notification.priority == 'critical'
    
    def test_normal_priority_for_normal_results(self, sample_lab_order, sample_lab_result):
        """Should set normal priority when no critical results."""
        sample_lab_result.is_critical_result = False
        sample_lab_result.save()
        
        service = LabNotificationService()
        notification = service.send_result_notification(sample_lab_order)
        
        assert notification.priority == 'normal'
    
    def test_notification_contains_patient_info(self, sample_lab_order):
        """Should include patient name and MRN in notification."""
        service = LabNotificationService()
        notification = service.send_result_notification(sample_lab_order)
        
        assert sample_lab_order.patient.first_name in notification.message
        assert sample_lab_order.patient.mrn in notification.message
    
    def test_notification_contains_test_name(self, sample_lab_order, sample_test_catalog):
        """Should include test name in notification."""
        service = LabNotificationService()
        notification = service.send_result_notification(sample_lab_order)
        
        # Test name should be in title
        assert sample_test_catalog.name in notification.title
    
    def test_action_url_points_to_encounter(self, sample_lab_order):
        """Should provide action URL to view results."""
        service = LabNotificationService()
        notification = service.send_result_notification(sample_lab_order)
        
        expected_url = f"/encounters/{sample_lab_order.encounter.id}/lab/{sample_lab_order.id}/"
        assert notification.action_url == expected_url
    
    def test_email_sent_for_critical_results(self, sample_lab_order, sample_lab_result):
        """Should send email when critical results detected."""
        sample_lab_result.is_critical_result = True
        sample_lab_result.save()
        
        # Set clinician email
        sample_lab_order.encounter.clinician.email = 'clinician@example.com'
        sample_lab_order.encounter.clinician.save()
        
        service = LabNotificationService()
        service.send_result_notification(sample_lab_order)
        
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ['clinician@example.com']
    
    def test_no_email_for_normal_results(self, sample_lab_order, sample_lab_result):
        """Should not send email for normal results."""
        sample_lab_result.is_critical_result = False
        sample_lab_result.save()
        
        service = LabNotificationService()
        service.send_result_notification(sample_lab_order)
        
        assert len(mail.outbox) == 0
    
    def test_email_contains_critical_parameters(self, sample_lab_order, sample_lab_result):
        """Should list critical parameters in email."""
        sample_lab_result.is_critical_result = True
        sample_lab_result.parameter_name = "Hemoglobin"
        sample_lab_result.save()
        
        # Set clinician email
        sample_lab_order.encounter.clinician.email = 'clinician@example.com'
        sample_lab_order.encounter.clinician.save()
        
        service = LabNotificationService()
        service.send_result_notification(sample_lab_order)
        
        assert len(mail.outbox) == 1
        assert "Hemoglobin" in mail.outbox[0].body
    
    def test_multiple_critical_results_handled(self, sample_lab_order):
        """Should handle multiple critical results in one order."""
        # Create multiple critical results
        from hmis.apps.laboratory.models import LabOrderItem
        
        item = LabOrderItem.objects.filter(lab_order=sample_lab_order).first()
        
        LabResult.objects.create(
            order_item=item,
            parameter_name="Hemoglobin",
            value="5.0",
            unit="g/dL",
            flag="CRITICAL_LOW",
            is_critical_result=True
        )
        LabResult.objects.create(
            order_item=item,
            parameter_name="Potassium",
            value="7.5",
            unit="mmol/L",
            flag="CRITICAL_HIGH",
            is_critical_result=True
        )
        
        service = LabNotificationService()
        notification = service.send_result_notification(sample_lab_order)
        
        # Should mention critical values
        assert "Critical" in notification.message or "critical" in notification.message
        assert notification.priority == 'critical'
