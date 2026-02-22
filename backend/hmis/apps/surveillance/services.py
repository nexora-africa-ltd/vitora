"""
Service layer for Disease Surveillance.

Provides business logic for case creation, alert generation,
notification to county health offices, and outbreak detection.
"""

import logging
from datetime import timedelta
from typing import TYPE_CHECKING

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.encounters.models import Diagnosis

    from .models import NotifiableCase, NotifiableDisease

logger = logging.getLogger(__name__)


class SurveillanceService:
    """
    Service class for disease surveillance operations.

    Provides methods for:
    - Creating notifiable cases from diagnoses
    - Generating alerts for immediate diseases
    - Broadcasting WebSocket notifications
    - Checking outbreak thresholds
    - Sending SMS/email notifications
    """

    @classmethod
    def check_diagnosis_for_notifiable_disease(
        cls, diagnosis: "Diagnosis"
    ) -> "NotifiableDisease | None":
        """
        Check if a diagnosis matches any notifiable disease.

        Args:
            diagnosis: Diagnosis instance to check

        Returns:
            NotifiableDisease if match found, None otherwise
        """
        from .models import NotifiableDisease

        if not diagnosis.icd10_code:
            return None

        code = diagnosis.icd10_code.code.upper()

        # Check for exact match or prefix match
        diseases = NotifiableDisease.objects.filter(is_active=True)

        for disease in diseases:
            disease_codes = disease.get_icd10_code_list()
            for disease_code in disease_codes:
                # Exact match or code starts with disease code
                if code == disease_code or code.startswith(disease_code.rstrip(".")):
                    return disease

        return None

    @classmethod
    def create_case_from_diagnosis(
        cls,
        diagnosis: "Diagnosis",
        disease: "NotifiableDisease",
        reported_by: "User | None" = None,
    ) -> "NotifiableCase":
        """
        Create a NotifiableCase from a diagnosis.

        Args:
            diagnosis: Diagnosis that triggered the case
            disease: NotifiableDisease that was matched
            reported_by: User who triggered the case (usually diagnosing clinician)

        Returns:
            Created NotifiableCase instance
        """
        from .models import NotifiableCase, SurveillanceAlert

        encounter = diagnosis.encounter
        patient = encounter.patient

        # Check for existing case
        existing = NotifiableCase.objects.filter(
            patient=patient,
            encounter=encounter,
            disease=disease,
        ).first()

        if existing:
            logger.info(
                f"Case already exists for {disease.name} - patient {patient.mrn} - encounter {encounter.id}"
            )
            return existing

        # Create the case
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=patient,
            encounter=encounter,
            diagnosis=diagnosis,
            reported_by=reported_by or diagnosis.diagnosed_by,
            county=patient.county,
            sub_county=patient.sub_county,
        )

        logger.info(
            f"Created notifiable case for {disease.name} - patient {patient.mrn} "
            f"- category {disease.category}"
        )

        # Generate alert for immediate diseases
        if disease.is_immediate:
            cls.create_alert(
                case=case,
                alert_type=SurveillanceAlert.AlertType.NEW_CASE,
            )

        # Check outbreak thresholds
        cls.check_outbreak_thresholds(disease, patient.county)

        return case

    @classmethod
    def create_alert(
        cls,
        case: "NotifiableCase",
        alert_type: str,
        custom_message: str | None = None,
    ) -> "SurveillanceAlert":
        """
        Create a surveillance alert and broadcast via WebSocket.

        Args:
            case: NotifiableCase that triggered the alert
            alert_type: Type of alert (NEW_CASE, OVERDUE, OUTBREAK)
            custom_message: Optional custom message

        Returns:
            Created SurveillanceAlert instance
        """
        from .models import SurveillanceAlert

        # Generate message
        if custom_message:
            message = custom_message
        elif alert_type == SurveillanceAlert.AlertType.NEW_CASE:
            message = (
                f"New {case.disease.get_category_display()} case: "
                f"{case.disease.name} detected for patient {case.patient.mrn}"
            )
            if case.disease.is_immediate:
                message = f"⚠️ IMMEDIATE: {message}"
        elif alert_type == SurveillanceAlert.AlertType.OVERDUE:
            message = (
                f"⏰ OVERDUE: Notification deadline passed for "
                f"{case.disease.name} - patient {case.patient.mrn}"
            )
        elif alert_type == SurveillanceAlert.AlertType.OUTBREAK:
            message = (
                f"🚨 OUTBREAK ALERT: {case.disease.name} threshold exceeded "
                f"in {case.county.name if case.county else 'facility'}"
            )
        else:
            message = f"Alert for {case.disease.name} - {case.patient.mrn}"

        # Create alert record
        alert = SurveillanceAlert.objects.create(
            case=case,
            alert_type=alert_type,
            message=message,
        )

        # Broadcast via WebSocket
        cls.broadcast_alert(alert)

        # Send SMS/email for immediate diseases
        if case.disease.is_immediate and alert_type in [
            SurveillanceAlert.AlertType.NEW_CASE,
            SurveillanceAlert.AlertType.OUTBREAK,
        ]:
            cls.send_sms_alert(alert)
            cls.send_email_alert(alert)

        return alert

    @classmethod
    def broadcast_alert(cls, alert: "SurveillanceAlert") -> None:
        """
        Broadcast alert to WebSocket clients.

        Args:
            alert: SurveillanceAlert to broadcast
        """
        from .models import SurveillanceAlert

        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("No channel layer configured for WebSocket broadcast")
            return

        event_type_map = {
            SurveillanceAlert.AlertType.NEW_CASE: "surveillance_immediate_alert"
            if alert.case.disease.is_immediate
            else "surveillance_new_case",
            SurveillanceAlert.AlertType.OVERDUE: "surveillance_overdue_alert",
            SurveillanceAlert.AlertType.OUTBREAK: "surveillance_outbreak_alert",
            SurveillanceAlert.AlertType.CASE_UPDATE: "surveillance_new_case",
        }

        event_type = event_type_map.get(alert.alert_type, "surveillance_new_case")

        data = {
            "alert_id": alert.id,
            "case_id": alert.case.id,
            "disease_name": alert.case.disease.name,
            "disease_category": alert.case.disease.category,
            "patient_mrn": alert.case.patient.mrn,
            "county": alert.case.county.name if alert.case.county else None,
            "message": alert.message,
            "alert_type": alert.alert_type,
            "is_immediate": alert.case.disease.is_immediate,
            "notification_deadline": (
                alert.case.notification_deadline.isoformat()
                if alert.case.notification_deadline
                else None
            ),
            "timestamp": alert.created_at.isoformat(),
        }

        try:
            async_to_sync(channel_layer.group_send)(
                "surveillance_alerts",
                {
                    "type": event_type,
                    "data": data,
                },
            )
            alert.sent_via_websocket = True
            alert.save(update_fields=["sent_via_websocket"])
            logger.info(f"Broadcast surveillance alert {alert.id} via WebSocket")
        except Exception as e:
            logger.error(f"Failed to broadcast surveillance alert: {e}")

    @classmethod
    def send_sms_alert(cls, alert: "SurveillanceAlert") -> bool:
        """
        Send SMS alert for immediate reportable diseases.

        Args:
            alert: SurveillanceAlert to send

        Returns:
            True if SMS sent successfully
        """
        # Get county health officer phone from settings or county config
        # This is a placeholder implementation
        try:
            from hmis.apps.core.sms_gateway import send_sms

            county = alert.case.county
            if not county:
                logger.warning(f"No county for alert {alert.id}, skipping SMS")
                return False

            # TODO: Get county health officer phone from configuration
            # For now, use settings
            recipient = getattr(settings, "SURVEILLANCE_SMS_RECIPIENT", None)
            if not recipient:
                logger.info("No SURVEILLANCE_SMS_RECIPIENT configured")
                return False

            message = f"[Vitora HMIS] {alert.message}"

            success = send_sms(recipient, message)

            if success:
                alert.sent_via_sms = True
                alert.sms_recipient = recipient
                alert.save(update_fields=["sent_via_sms", "sms_recipient"])
                logger.info(f"Sent SMS alert {alert.id} to {recipient}")
            return success

        except Exception as e:
            logger.error(f"Failed to send SMS alert: {e}")
            return False

    @classmethod
    def send_email_alert(cls, alert: "SurveillanceAlert") -> bool:
        """
        Send email alert for immediate reportable diseases.

        Args:
            alert: SurveillanceAlert to send

        Returns:
            True if email sent successfully
        """
        try:
            from django.core.mail import send_mail

            county = alert.case.county
            if not county:
                logger.warning(f"No county for alert {alert.id}, skipping email")
                return False

            # TODO: Get county health officer email from configuration
            recipient = getattr(settings, "SURVEILLANCE_EMAIL_RECIPIENT", None)
            if not recipient:
                logger.info("No SURVEILLANCE_EMAIL_RECIPIENT configured")
                return False

            subject = f"[Vitora HMIS] {alert.get_alert_type_display()}: {alert.case.disease.name}"
            body = f"""
Disease Surveillance Alert
===========================

{alert.message}

Case Details:
- Disease: {alert.case.disease.name}
- Category: {alert.case.disease.get_category_display()}
- Patient MRN: {alert.case.patient.mrn}
- County: {county.name if county else 'N/A'}
- Detected: {alert.case.detected_at.strftime('%Y-%m-%d %H:%M')}
- Notification Deadline: {alert.case.notification_deadline.strftime('%Y-%m-%d %H:%M') if alert.case.notification_deadline else 'N/A'}

Please log in to Vitora HMIS to review and process this case.
"""

            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )

            alert.sent_via_email = True
            alert.email_recipient = recipient
            alert.save(update_fields=["sent_via_email", "email_recipient"])
            logger.info(f"Sent email alert {alert.id} to {recipient}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
            return False

    @classmethod
    def check_outbreak_thresholds(cls, disease: "NotifiableDisease", county=None) -> None:
        """
        Check if outbreak threshold is exceeded and create alert if so.

        Args:
            disease: NotifiableDisease to check
            county: County to check (optional)
        """
        from .models import OutbreakThreshold, SurveillanceAlert

        # Get relevant thresholds
        thresholds = OutbreakThreshold.objects.filter(
            disease=disease,
            is_active=True,
        )

        if county:
            # Check county-specific and national thresholds
            thresholds = thresholds.filter(models.Q(county=county) | models.Q(county__isnull=True))
        else:
            # Check only national threshold
            thresholds = thresholds.filter(county__isnull=True)

        for threshold in thresholds:
            exceeded, count = threshold.check_threshold()
            if exceeded:
                # Check if we already sent an outbreak alert recently
                recent_alert = SurveillanceAlert.objects.filter(
                    case__disease=disease,
                    alert_type=SurveillanceAlert.AlertType.OUTBREAK,
                    created_at__gte=timezone.now() - timedelta(hours=24),
                ).exists()

                if not recent_alert:
                    # Get most recent case to attach alert to
                    from .models import NotifiableCase

                    recent_case = NotifiableCase.objects.filter(
                        disease=disease,
                    ).order_by("-detected_at").first()

                    if recent_case:
                        cls.create_alert(
                            case=recent_case,
                            alert_type=SurveillanceAlert.AlertType.OUTBREAK,
                            custom_message=(
                                f"🚨 OUTBREAK THRESHOLD EXCEEDED: {count} cases of "
                                f"{disease.name} in {threshold.period_days} days "
                                f"(threshold: {threshold.case_threshold}) - "
                                f"{threshold.county.name if threshold.county else 'National'}"
                            ),
                        )
                        logger.warning(
                            f"Outbreak threshold exceeded: {disease.name} - "
                            f"{count}/{threshold.case_threshold} cases"
                        )

    @classmethod
    def check_overdue_cases(cls) -> list["NotifiableCase"]:
        """
        Check for cases that have passed notification deadline.

        Called periodically by Celery task to generate overdue alerts.

        Returns:
            List of newly overdue cases
        """
        from .models import NotifiableCase, NotificationStatus, SurveillanceAlert

        now = timezone.now()

        # Find cases that are overdue and don't have an overdue alert
        overdue_cases = NotifiableCase.objects.filter(
            notification_deadline__lt=now,
            notification_status=NotificationStatus.PENDING,
        ).exclude(
            alerts__alert_type=SurveillanceAlert.AlertType.OVERDUE
        )

        newly_overdue = []
        for case in overdue_cases:
            cls.create_alert(case=case, alert_type=SurveillanceAlert.AlertType.OVERDUE)
            newly_overdue.append(case)
            logger.warning(f"Case overdue: {case.disease.name} - {case.patient.mrn}")

        return newly_overdue
