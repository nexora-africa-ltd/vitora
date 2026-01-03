"""
Lab Notification Service.

Sends notifications to clinicians when lab results are ready,
with special handling for critical values.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.template.loader import render_to_string

from hmis.apps.core.models import Notification
from hmis.apps.laboratory.models import LabOrder

User = get_user_model()


class LabNotificationService:
    """Handle lab result notifications."""

    def send_result_notification(self, lab_order: LabOrder) -> Notification:
        """
        Send notification when results are ready.
        
        Creates in-app notification and optionally sends email for critical results.
        
        Args:
            lab_order: LabOrder instance with completed results
            
        Returns:
            Created Notification instance
        """
        # Use ordered_by as the clinician (Encounter model doesn't have a clinician field)
        clinician = lab_order.ordered_by
        patient = lab_order.patient

        # Check for critical results
        has_critical = self._has_critical_results(lab_order)

        # Determine priority
        priority = 'critical' if has_critical else 'normal'

        # Create in-app notification
        notification = Notification.objects.create(
            user=clinician,
            notification_type='lab_result',
            priority=priority,
            title=self._get_notification_title(lab_order, has_critical),
            message=self._get_notification_message(lab_order, has_critical),
            related_model='LabOrder',
            related_id=lab_order.id,
            action_url=f'/encounters/{lab_order.encounter.id}/lab/{lab_order.id}/'
        )

        # Send email for critical results
        if has_critical and clinician.email:
            self._send_critical_email(clinician, lab_order)

        return notification

    def _has_critical_results(self, lab_order: LabOrder) -> bool:
        """Check if order has any critical results."""
        # Check results through order items (result is OneToOne, not ManyToMany)
        for item in lab_order.items.all():
            if hasattr(item, 'result') and item.result.is_critical_result:
                return True
        return False

    def _get_notification_title(self, lab_order: LabOrder, has_critical: bool) -> str:
        """
        Generate notification title.
        
        Args:
            lab_order: LabOrder instance
            has_critical: Whether order has critical results
            
        Returns:
            Notification title string
        """
        # Get test name from first order item
        first_item = lab_order.items.first()
        test_name = first_item.test.name if first_item else "Lab Test"

        if has_critical:
            return f"🚨 CRITICAL: Lab Results Ready - {test_name}"
        return f"Lab Results Ready - {test_name}"

    def _get_notification_message(self, lab_order: LabOrder, has_critical: bool) -> str:
        """
        Generate notification message.
        
        Args:
            lab_order: LabOrder instance
            has_critical: Whether order has critical results
            
        Returns:
            Notification message string
        """
        patient = lab_order.patient
        patient_name = f"{patient.first_name} {patient.last_name}"

        message = f"Results for {patient_name} ({patient.mrn}) are now available."

        if has_critical:
            # Get critical parameter names (from test catalog via order item)
            critical_params = []
            for item in lab_order.items.all():
                if hasattr(item, 'result') and item.result.is_critical_result:
                    critical_params.append(item.test.name)

            if critical_params:
                params_str = ", ".join(critical_params)
                message += f"\n\n⚠️ Critical values detected: {params_str}"

        return message

    def _send_critical_email(self, clinician: User, lab_order: LabOrder) -> None:
        """
        Send email for critical lab results.
        
        Args:
            clinician: User to send email to
            lab_order: LabOrder with critical results
        """
        if not clinician.email:
            return

        patient = lab_order.patient
        patient_name = f"{patient.first_name} {patient.last_name}"
        clinician_name = clinician.get_full_name() or clinician.username

        # Get critical results
        critical_results = []
        for item in lab_order.items.all():
            if hasattr(item, 'result') and item.result.is_critical_result:
                result = item.result
                critical_results.append({
                    'parameter': item.test.name,
                    'value': result.get_formatted_value(),
                    'unit': item.test.result_unit or '',
                    'flag': result.result_flag,
                    'reference_range': result.reference_range_text or ''
                })

        # Get first test name
        first_item = lab_order.items.first()
        test_name = first_item.test.name if first_item else "Lab Test"

        # Prepare context
        context = {
            'clinician_name': clinician_name,
            'patient_name': patient_name,
            'patient_mrn': patient.mrn,
            'test_name': test_name,
            'order_number': lab_order.order_number,
            'critical_results': critical_results,
            'action_url': f"{settings.FRONTEND_URL}/encounters/{lab_order.encounter.id}/lab/{lab_order.id}/",
            'facility_name': getattr(settings, 'FACILITY_NAME', 'Vitora Health Facility'),
        }

        # Render email from template (or use simple text)
        subject = f"🚨 CRITICAL Lab Results - {patient_name} ({patient.mrn})"

        # Try to render from template, fallback to plain text
        try:
            html_message = render_to_string('laboratory/email/critical_result.html', context)
            plain_message = render_to_string('laboratory/email/critical_result.txt', context)
        except:
            # Fallback to plain text
            plain_message = f"""
CRITICAL LAB RESULTS ALERT

Dear Dr. {clinician_name},

CRITICAL lab results are now available for:

Patient: {patient_name} ({patient.mrn})
Test: {test_name}
Order: {lab_order.order_number}

Critical Values Detected:
{chr(10).join([f"- {r['parameter']}: {r['value']} {r['unit']} ({r['flag']})" for r in critical_results])}

Please review these results immediately.

View results: {context['action_url']}

{context['facility_name']}
"""
            html_message = None

        # Send email
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[clinician.email],
            html_message=html_message,
            fail_silently=True
        )
