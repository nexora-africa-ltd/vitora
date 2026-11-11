# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Service layer for Disease Surveillance.

Provides business logic for case creation, alert generation,
notification to county health offices, and outbreak detection.
"""

import logging
from datetime import date, timedelta
from typing import TYPE_CHECKING

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.core import signing
from django.db import models
from django.template import TemplateDoesNotExist, TemplateSyntaxError
from django.template.loader import render_to_string
from django.utils import timezone

from hmis.apps.core.services.email_service import send_transactional_email
from hmis.apps.core.sms_gateway import send_sms

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.encounters.models import Diagnosis

    from .models import (
        CountyNotificationDelivery,
        IDSRWeeklyReport,
        NotifiableCase,
        NotifiableDisease,
        SurveillanceAlert,
        SurveillanceFacilitySettings,
    )

logger = logging.getLogger(__name__)


def _display_user_name(user) -> str:
    """Return best-effort display name for staff context."""
    if not user:
        return "System"
    full_name = " ".join(part for part in [user.first_name, user.last_name] if part).strip()
    return full_name or user.username or "System"


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

    COUNTY_ACK_TOKEN_SALT = "surveillance.county_ack"  # noqa: S105 - signing namespace, not a secret
    COUNTY_ACK_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

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
                "Case already exists for %s - patient %s - encounter %s",
                disease.name,
                patient.mrn,
                encounter.id,
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
            "Created notifiable case for %s - patient %s - category %s",
            disease.name,
            patient.mrn,
            disease.category,
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

    @staticmethod
    def _resolve_facility_settings(case: "NotifiableCase") -> "SurveillanceFacilitySettings | None":
        """Return active facility settings for a case, if configured."""
        from .models import SurveillanceFacilitySettings

        if not case.facility_id:
            return None
        return (
            SurveillanceFacilitySettings.objects.filter(
                facility_id=case.facility_id,
                is_active=True,
            )
            .order_by("-updated_at")
            .first()
        )

    @staticmethod
    def _fallback_surveillance_config() -> dict[str, object]:
        """Fallback to env-based configuration when facility settings are missing."""
        return {
            "notify_via_sms": bool(getattr(settings, "SURVEILLANCE_SMS_RECIPIENT", "")),
            "notify_via_email": bool(getattr(settings, "SURVEILLANCE_EMAIL_RECIPIENT", "")),
            "sms_recipient": getattr(settings, "SURVEILLANCE_SMS_RECIPIENT", ""),
            "email_recipient": getattr(settings, "SURVEILLANCE_EMAIL_RECIPIENT", ""),
            "max_retry_attempts": int(getattr(settings, "SURVEILLANCE_MAX_RETRY_ATTEMPTS", 3)),
            "retry_backoff_minutes": int(
                getattr(settings, "SURVEILLANCE_RETRY_BACKOFF_MINUTES", 15)
            ),
            "include_patient_identifiers": False,
        }

    @classmethod
    def _county_notification_config(cls, case: "NotifiableCase") -> dict[str, object]:
        """Resolve effective county notification config for a case."""
        facility_settings = cls._resolve_facility_settings(case)
        if facility_settings:
            return {
                "notify_via_sms": facility_settings.notify_via_sms,
                "notify_via_email": facility_settings.notify_via_email,
                "sms_recipient": facility_settings.sms_recipient or "",
                "email_recipient": facility_settings.email_recipient or "",
                "max_retry_attempts": facility_settings.max_retry_attempts,
                "retry_backoff_minutes": facility_settings.retry_backoff_minutes,
                "include_patient_identifiers": facility_settings.include_patient_identifiers,
            }
        return cls._fallback_surveillance_config()

    @classmethod
    def _build_county_notification_message(
        cls,
        case: "NotifiableCase",
        notes: str = "",
        include_patient_identifiers: bool = False,
        triggered_by=None,
        ack_url: str = "",
    ) -> tuple[str, str]:
        """Build county notification text and HTML email bodies."""
        deadline = (
            case.notification_deadline.strftime("%Y-%m-%d %H:%M")
            if case.notification_deadline
            else "N/A"
        )
        detected = case.detected_at.strftime("%Y-%m-%d %H:%M")
        reported = case.created_at.strftime("%Y-%m-%d %H:%M") if case.created_at else "N/A"
        facility_name = case.facility.name if case.facility else "N/A"
        facility_code = (
            getattr(case.facility, "mfl_code", "") or getattr(case.facility, "code", "") or "N/A"
        )
        county_name = case.county.name if case.county else "N/A"
        sub_county_name = case.sub_county.name if case.sub_county else "N/A"
        reporter_name = _display_user_name(case.reported_by)
        notifier_name = _display_user_name(triggered_by)
        icd_codes = cls._encounter_icd10_codes(case)
        context = {
            "case_id": case.id,
            "disease_name": case.disease.name,
            "icd_codes": icd_codes or "N/A",
            "category": case.disease.get_category_display(),
            "severity": case.get_severity_display(),
            "detected": detected,
            "reported": reported,
            "deadline": deadline,
            "county_name": county_name,
            "sub_county_name": sub_county_name,
            "facility_name": facility_name,
            "facility_code": facility_code,
            "reporter_name": reporter_name,
            "notifier_name": notifier_name,
            "laboratory_confirmed": case.laboratory_confirmed,
            "outcome": case.get_outcome_display(),
            "patient_mrn": case.patient.mrn if include_patient_identifiers else "",
            "notes": notes.strip(),
            "ack_url": ack_url,
        }
        text_body = render_to_string("surveillance/email/county_notification.txt", context)
        try:
            html_body = render_to_string("surveillance/email/county_notification.html", context)
        except (TemplateDoesNotExist, TemplateSyntaxError) as exc:
            logger.warning("County notification HTML template unavailable: %s", type(exc).__name__)
            html_body = text_body.replace("\n", "<br>")
        return text_body, html_body

    @staticmethod
    def _encounter_icd10_codes(case: "NotifiableCase") -> str:
        """Return the actual ICD-10 diagnoses recorded on the case encounter."""
        if not case.encounter_id:
            return ""

        codes: list[str] = []
        seen: set[str] = set()
        for diagnosis in case.encounter.diagnoses.select_related("icd10_code").order_by(
            "created_at"
        ):
            if not diagnosis.icd10_code_id:
                continue
            code = diagnosis.icd10_code.code.strip().upper()
            if code and code not in seen:
                seen.add(code)
                codes.append(code)
        return ", ".join(codes)

    @classmethod
    def build_county_ack_token(cls, delivery: "CountyNotificationDelivery") -> str:
        """Build signed token for county acknowledgement links."""
        payload = {
            "delivery_id": delivery.id,
            "case_id": delivery.case_id,
        }
        return signing.dumps(payload, salt=cls.COUNTY_ACK_TOKEN_SALT, compress=True)

    @classmethod
    def build_county_ack_url(
        cls,
        delivery: "CountyNotificationDelivery",
        base_url: str = "",
    ) -> str:
        """Build public acknowledgement URL for county recipients."""
        token = cls.build_county_ack_token(delivery)
        resolved_base_url = (
            (base_url or "").rstrip("/")
            or str(getattr(settings, "CLOUD_API_BASE_URL", "") or "").rstrip("/")
            or str(getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
        )
        if resolved_base_url:
            return f"{resolved_base_url}/api/surveillance/county-ack/{token}/"
        return f"/api/surveillance/county-ack/{token}/"

    @classmethod
    def acknowledge_county_from_token(cls, token: str) -> tuple["NotifiableCase | None", str]:
        """Acknowledge county receipt using signed token payload."""
        from .models import (
            CountyNotificationDelivery,
            CountyNotificationDeliveryStatus,
            NotificationStatus,
        )

        try:
            payload = signing.loads(
                token,
                salt=cls.COUNTY_ACK_TOKEN_SALT,
                max_age=cls.COUNTY_ACK_TOKEN_MAX_AGE_SECONDS,
            )
        except signing.BadSignature:
            return None, "invalid"
        except signing.SignatureExpired:
            return None, "expired"

        delivery_id = int(payload.get("delivery_id") or 0)
        case_id = int(payload.get("case_id") or 0)
        if not delivery_id or not case_id:
            return None, "invalid"

        delivery = (
            CountyNotificationDelivery.objects.select_related("case")
            .filter(id=delivery_id, case_id=case_id)
            .first()
        )
        if not delivery:
            return None, "not_found"

        case = delivery.case
        if case.notification_status != NotificationStatus.ACKNOWLEDGED:
            case.mark_acknowledged()

        now = timezone.now()
        delivery.provider_event = "county_acknowledged"
        if delivery.status != CountyNotificationDeliveryStatus.DELIVERED:
            delivery.status = CountyNotificationDeliveryStatus.DELIVERED
            delivery.delivered_at = now
            delivery.terminal_status_at = now
        delivery.save(
            update_fields=[
                "status",
                "provider_event",
                "delivered_at",
                "terminal_status_at",
                "updated_at",
            ]
        )
        return case, "ok"

    @classmethod
    def _mark_delivery_result(
        cls,
        delivery: "CountyNotificationDelivery",
        success: bool,
        error: str = "",
        status_override: str | None = None,
        provider_event: str = "",
    ) -> None:
        """Update delivery attempt state and schedule retry when needed."""
        from .models import CountyNotificationDeliveryStatus

        now = timezone.now()
        delivery.attempt_count += 1
        delivery.last_attempt_at = now
        delivery.last_error = (error or "").strip()

        if success:
            delivery.status = status_override or CountyNotificationDeliveryStatus.SENT
            delivery.sent_at = now
            if delivery.status == CountyNotificationDeliveryStatus.DELIVERED:
                delivery.delivered_at = now
                delivery.terminal_status_at = now
            else:
                delivery.delivered_at = None
                delivery.terminal_status_at = None
            delivery.next_retry_at = None
        else:
            delivery.delivered_at = None
            if delivery.attempt_count < delivery.max_retry_attempts:
                delivery.status = CountyNotificationDeliveryStatus.RETRY_SCHEDULED
                delivery.terminal_status_at = None
                delivery.next_retry_at = now + timedelta(
                    minutes=max(1, delivery.retry_backoff_minutes)
                )
            else:
                delivery.status = CountyNotificationDeliveryStatus.FAILED
                delivery.next_retry_at = None
                delivery.terminal_status_at = now
            delivery.sent_at = None

        if provider_event:
            delivery.provider_event = provider_event

        delivery.save(
            update_fields=[
                "status",
                "attempt_count",
                "last_attempt_at",
                "next_retry_at",
                "last_error",
                "sent_at",
                "delivered_at",
                "terminal_status_at",
                "provider_event",
                "updated_at",
            ]
        )

    @classmethod
    def _dispatch_delivery(
        cls,
        delivery: "CountyNotificationDelivery",
        text_message: str,
        html_message: str,
        subject: str,
    ) -> None:
        """Attempt immediate dispatch for a single county delivery record."""
        try:
            if delivery.channel == "SMS":
                success = bool(send_sms(delivery.recipient or "", text_message))
                cls._mark_delivery_result(
                    delivery, success, "SMS gateway send failed." if not success else ""
                )
                return

            if delivery.channel == "EMAIL":
                headers = {"X-Vitora-Delivery-ID": str(delivery.id)}
                tags = [
                    {"name": "feature", "value": "surveillance"},
                    {"name": "delivery_id", "value": str(delivery.id)},
                ]
                email_result = send_transactional_email(
                    subject=subject,
                    html_body=html_message,
                    to_email=delivery.recipient or "",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    headers=headers,
                    tags=tags,
                    facility=delivery.facility,
                )
                accepted = bool(email_result.get("accepted", False))
                provider = str(email_result.get("provider") or "")
                provider_message_id = str(email_result.get("provider_message_id") or "")
                terminal_state = str(email_result.get("terminal_state") or "")

                delivery.provider = provider
                delivery.provider_message_id = provider_message_id
                delivery.save(update_fields=["provider", "provider_message_id", "updated_at"])

                status_override = None
                provider_event = "accepted"
                if terminal_state == "delivered":
                    status_override = "DELIVERED"
                    provider_event = "delivered"

                cls._mark_delivery_result(
                    delivery,
                    accepted,
                    "Email transport did not accept message." if not accepted else "",
                    status_override=status_override,
                    provider_event=provider_event,
                )
                return

            cls._mark_delivery_result(delivery, False, f"Unsupported channel: {delivery.channel}")
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            cls._mark_delivery_result(delivery, False, str(e))

    @classmethod
    def notify_county(
        cls,
        case: "NotifiableCase",
        triggered_by=None,
        notes: str = "",
        ack_base_url: str = "",
    ) -> list["CountyNotificationDelivery"]:
        """Dispatch county notification channels and persist delivery records."""
        from .models import CountyNotificationChannel, CountyNotificationDelivery

        config = cls._county_notification_config(case)
        include_patient_identifiers = bool(config.get("include_patient_identifiers", False))
        subject = f"County Disease Surveillance Notification: {case.disease.name}"

        deliveries: list[CountyNotificationDelivery] = []
        channel_targets = [
            (
                CountyNotificationChannel.SMS,
                bool(config.get("notify_via_sms")),
                str(config.get("sms_recipient") or "").strip(),
            ),
            (
                CountyNotificationChannel.EMAIL,
                bool(config.get("notify_via_email")),
                str(config.get("email_recipient") or "").strip(),
            ),
        ]

        for channel, enabled, recipient in channel_targets:
            if not enabled:
                continue

            delivery = CountyNotificationDelivery.objects.create(
                case=case,
                channel=channel,
                facility_id=case.facility_id,
                organization_id=case.organization_id,
                recipient=recipient,
                max_retry_attempts=int(config.get("max_retry_attempts") or 3),
                retry_backoff_minutes=int(config.get("retry_backoff_minutes") or 15),
                triggered_by=triggered_by,
            )
            deliveries.append(delivery)

            if not recipient:
                delivery.last_error = (
                    "Channel enabled but recipient is not configured for this facility."
                )
                delivery.status = "FAILED"
                delivery.save(update_fields=["status", "last_error", "updated_at"])
                continue

            ack_url = (
                cls.build_county_ack_url(delivery, base_url=ack_base_url)
                if channel == CountyNotificationChannel.EMAIL
                else ""
            )
            text_message, html_message = cls._build_county_notification_message(
                case,
                notes=notes,
                include_patient_identifiers=include_patient_identifiers,
                triggered_by=triggered_by,
                ack_url=ack_url,
            )

            cls._dispatch_delivery(
                delivery,
                text_message=text_message,
                html_message=html_message,
                subject=subject,
            )

        return deliveries

    @classmethod
    def retry_case_county_notifications(
        cls, case: "NotifiableCase", ack_base_url: str = ""
    ) -> list["CountyNotificationDelivery"]:
        """Retry failed/scheduled county notifications for a case."""
        from .models import CountyNotificationDelivery, CountyNotificationDeliveryStatus

        deliveries = list(
            CountyNotificationDelivery.objects.filter(
                case=case,
                status__in=[
                    CountyNotificationDeliveryStatus.RETRY_SCHEDULED,
                    CountyNotificationDeliveryStatus.FAILED,
                ],
            )
        )

        include_patient_identifiers = bool(
            cls._county_notification_config(case).get("include_patient_identifiers", False)
        )
        subject = f"[Vitora HMIS] County Notification: {case.disease.name}"
        for delivery in deliveries:
            if delivery.attempt_count >= delivery.max_retry_attempts:
                continue
            ack_url = (
                cls.build_county_ack_url(delivery, base_url=ack_base_url)
                if delivery.channel == "EMAIL"
                else ""
            )
            text_message, html_message = cls._build_county_notification_message(
                case,
                include_patient_identifiers=include_patient_identifiers,
                ack_url=ack_url,
            )
            cls._dispatch_delivery(
                delivery,
                text_message=text_message,
                html_message=html_message,
                subject=subject,
            )
        return deliveries

    @classmethod
    def has_case_delivery_success(cls, case: "NotifiableCase") -> bool:
        """Return True when at least one county transport accepted the notification."""
        from .models import CountyNotificationChannel, CountyNotificationDeliveryStatus

        deliveries = case.county_notification_deliveries.all()
        return deliveries.filter(
            models.Q(
                channel=CountyNotificationChannel.SMS,
                status__in=[
                    CountyNotificationDeliveryStatus.SENT,
                    CountyNotificationDeliveryStatus.DELIVERED,
                ],
            )
            | models.Q(
                channel=CountyNotificationChannel.EMAIL,
                status__in=[
                    CountyNotificationDeliveryStatus.DELIVERED,
                ],
            )
        ).exists()

    @classmethod
    def apply_email_webhook_status(
        cls,
        *,
        provider_message_id: str,
        event_type: str,
        payload: dict | None = None,
    ) -> "CountyNotificationDelivery | None":
        """Apply provider terminal status for surveillance email deliveries."""
        del payload
        from .models import CountyNotificationDelivery, CountyNotificationDeliveryStatus

        normalized = (event_type or "").strip().lower()
        if not provider_message_id:
            return None

        delivery = (
            CountyNotificationDelivery.objects.filter(
                channel="EMAIL",
                provider_message_id=provider_message_id,
            )
            .order_by("-created_at")
            .first()
        )
        if not delivery:
            return None

        now = timezone.now()
        # Provider events can arrive out of order. A successful delivery is
        # terminal and must never be regressed by a later failure/bounce event.
        if delivery.status == CountyNotificationDeliveryStatus.DELIVERED:
            return delivery
        delivery.provider_event = normalized
        if normalized == "email.delivered":
            delivery.status = CountyNotificationDeliveryStatus.DELIVERED
            delivery.delivered_at = now
            delivery.terminal_status_at = now
            delivery.last_error = ""
        elif normalized in {"email.bounced", "email.complained"}:
            delivery.status = CountyNotificationDeliveryStatus.BOUNCED
            delivery.terminal_status_at = now
            delivery.next_retry_at = None
            delivery.last_error = "Provider reported bounce/complaint."
        elif normalized in {"email.delivery_delayed", "email.failed"}:
            delivery.status = CountyNotificationDeliveryStatus.FAILED
            delivery.terminal_status_at = now
            delivery.next_retry_at = None
            delivery.last_error = "Provider reported delivery failure."
        else:
            return delivery

        delivery.save(
            update_fields=[
                "status",
                "provider_event",
                "delivered_at",
                "terminal_status_at",
                "next_retry_at",
                "last_error",
                "updated_at",
            ]
        )
        return delivery

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
            SurveillanceAlert.AlertType.NEW_CASE: (
                "surveillance_immediate_alert"
                if alert.case.disease.is_immediate
                else "surveillance_new_case"
            ),
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
            logger.info("Broadcast surveillance alert %s via WebSocket", alert.id)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.error("Failed to broadcast surveillance alert: %s", e)

    @classmethod
    def send_sms_alert(cls, alert: "SurveillanceAlert") -> bool:
        """
        Send SMS alert for immediate reportable diseases.

        Args:
            alert: SurveillanceAlert to send

        Returns:
            True if SMS sent successfully
        """
        try:
            county = alert.case.county
            if not county:
                logger.warning("No county for alert %s, skipping SMS", alert.id)
                return False

            config = cls._county_notification_config(alert.case)
            recipient = str(config.get("sms_recipient") or "").strip()
            if not recipient:
                recipient = str(getattr(settings, "SURVEILLANCE_SMS_RECIPIENT", "") or "").strip()
            if not recipient:
                logger.info("No SURVEILLANCE_SMS_RECIPIENT configured")
                return False

            message = f"[Vitora HMIS] {alert.message}"

            success = send_sms(recipient, message)

            if success:
                alert.sent_via_sms = True
                alert.sms_recipient = recipient
                alert.save(update_fields=["sent_via_sms", "sms_recipient_encrypted"])
                logger.info("Sent SMS alert %s to %s", alert.id, recipient)
            return success

        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.error("Failed to send SMS alert: %s", e)
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
            county = alert.case.county
            if not county:
                logger.warning("No county for alert %s, skipping email", alert.id)
                return False

            config = cls._county_notification_config(alert.case)
            recipient = str(config.get("email_recipient") or "").strip()
            if not recipient:
                recipient = str(getattr(settings, "SURVEILLANCE_EMAIL_RECIPIENT", "") or "").strip()
            if not recipient:
                logger.info("No SURVEILLANCE_EMAIL_RECIPIENT configured")
                return False

            subject = f"[Vitora HMIS] {alert.get_alert_type_display()}: {alert.case.disease.name}"
            context = {
                "alert_message": alert.message,
                "alert_type": alert.get_alert_type_display(),
                "case_id": alert.case.id,
                "disease_name": alert.case.disease.name,
                "category": alert.case.disease.get_category_display(),
                "patient_mrn": alert.case.patient.mrn,
                "county_name": county.name,
                "detected": alert.case.detected_at.strftime("%Y-%m-%d %H:%M"),
                "deadline": (
                    alert.case.notification_deadline.strftime("%Y-%m-%d %H:%M")
                    if alert.case.notification_deadline
                    else "N/A"
                ),
            }
            text_body = render_to_string("surveillance/email/immediate_alert.txt", context)
            try:
                html_body = render_to_string("surveillance/email/immediate_alert.html", context)
            except (TemplateDoesNotExist, TemplateSyntaxError) as exc:
                logger.warning("Immediate alert HTML template unavailable: %s", type(exc).__name__)
                html_body = text_body.replace("\n", "<br>")

            result = send_transactional_email(
                subject=subject,
                html_body=html_body,
                to_email=recipient,
                facility=alert.case.facility,
            )
            if not result.get("accepted", False):
                raise RuntimeError(
                    "Immediate surveillance alert email was not accepted by the provider."
                )

            alert.sent_via_email = True
            alert.email_recipient = recipient
            alert.save(update_fields=["sent_via_email", "email_recipient_encrypted"])
            logger.info("Sent email alert %s to %s", alert.id, recipient)
            return True

        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.error("Failed to send email alert: %s", e)
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

                    recent_case = (
                        NotifiableCase.objects.filter(
                            disease=disease,
                        )
                        .order_by("-detected_at")
                        .first()
                    )

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
                            "Outbreak threshold exceeded: %s - %s/%s cases",
                            disease.name,
                            count,
                            threshold.case_threshold,
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
        ).exclude(alerts__alert_type=SurveillanceAlert.AlertType.OVERDUE)

        newly_overdue = []
        for case in overdue_cases:
            cls.create_alert(case=case, alert_type=SurveillanceAlert.AlertType.OVERDUE)
            newly_overdue.append(case)
            logger.warning("Case overdue: %s - %s", case.disease.name, case.patient.mrn)

        return newly_overdue


class IDSRReportingService:
    """
    Service class for IDSR Weekly Report generation.

    Provides methods for:
    - Calculating epidemiological weeks (ISO 8601)
    - Generating weekly reports from NotifiableCase data
    - Aggregating disease summaries by age group
    - Preparing DHIS2 payloads for submission
    """

    @staticmethod
    def get_epi_week(reference_date=None) -> tuple[int, int, "date", "date"]:
        """
        Calculate epidemiological week for a given date.

        Uses ISO 8601 week numbering:
        - Week 1 is the week containing the first Thursday
        - Weeks run Monday to Sunday

        Args:
            reference_date: Date to calculate week for (default: today)

        Returns:
            Tuple of (epi_year, epi_week, week_start, week_end)
        """

        if reference_date is None:
            reference_date = timezone.localdate()
        elif isinstance(reference_date, str):
            from datetime import datetime

            reference_date = datetime.strptime(reference_date, "%Y-%m-%d").date()

        # ISO calendar: (year, week, weekday)
        iso_cal = reference_date.isocalendar()
        epi_year = iso_cal[0]
        epi_week = iso_cal[1]

        # Calculate week start (Monday) and end (Sunday)
        # weekday() returns 0=Monday, 6=Sunday
        days_since_monday = reference_date.weekday()
        week_start = reference_date - timedelta(days=days_since_monday)
        week_end = week_start + timedelta(days=6)

        return (epi_year, epi_week, week_start, week_end)

    @staticmethod
    def get_previous_epi_week(reference_date=None) -> tuple[int, int, "date", "date"]:
        """
        Get the previous epidemiological week.

        Used for generating reports at end of week (Sunday midnight).

        Args:
            reference_date: Reference date (default: today)

        Returns:
            Tuple of (epi_year, epi_week, week_start, week_end)
        """
        if reference_date is None:
            reference_date = timezone.localdate()

        # Go back 7 days to get previous week
        previous_date = reference_date - timedelta(days=7)
        return IDSRReportingService.get_epi_week(previous_date)

    @classmethod
    def generate_weekly_report(
        cls,
        epi_year: int,
        epi_week: int,
        week_start: "date",
        week_end: "date",
        facility,
        generated_by=None,
    ) -> "IDSRWeeklyReport":
        """
        Generate or update an IDSR weekly report.

        Aggregates all NotifiableCase records within the week period
        and creates per-disease summaries.

        Args:
            epi_year: Epidemiological year
            epi_week: Epidemiological week number
            week_start: Monday of the week
            week_end: Sunday of the week
            facility: Facility whose cases and DHIS2 configuration are used
            generated_by: User generating the report

        Returns:
            Created or updated IDSRWeeklyReport instance
        """
        from datetime import datetime

        from django.db import transaction

        from .models import (
            IDSRDiseaseSummary,
            IDSRReportStatus,
            IDSRWeeklyReport,
            NotifiableCase,
            NotifiableCategory,
        )

        if facility is None:
            raise ValueError("A facility is required to generate an IDSR weekly report.")

        facility_code = facility.mfl_code
        facility_name = facility.name
        county = facility.county

        # Convert week_end to datetime for comparison with detected_at
        week_start_dt = datetime.combine(week_start, datetime.min.time())
        week_end_dt = datetime.combine(week_end, datetime.max.time())

        # Make timezone-aware
        from django.conf import settings

        if settings.USE_TZ:
            from django.utils import timezone as tz

            week_start_dt = tz.make_aware(week_start_dt)
            week_end_dt = tz.make_aware(week_end_dt)

        # Query cases for this week
        cases_queryset = NotifiableCase.objects.select_related(
            "disease", "patient", "county"
        ).filter(
            facility=facility,
            detected_at__gte=week_start_dt,
            detected_at__lte=week_end_dt,
        )

        if county:
            cases_queryset = cases_queryset.filter(county=county)

        cases = list(cases_queryset)

        with transaction.atomic():
            # Create or update the weekly report
            report, created = IDSRWeeklyReport.objects.update_or_create(
                epi_year=epi_year,
                epi_week=epi_week,
                facility_ref=facility,
                defaults={
                    "organization": facility.organization,
                    "facility_code": facility_code,
                    "facility_name": facility_name,
                    "week_start_date": week_start,
                    "week_end_date": week_end,
                    "county": county,
                    "generated_by": generated_by,
                    "status": IDSRReportStatus.DRAFT,
                },
            )

            # Clear existing summaries if regenerating
            if not created:
                report.disease_summaries.all().delete()

            # Aggregate by disease
            disease_data = {}
            total_deaths = 0
            immediate_cases = 0
            lab_confirmed_cases = 0

            for case in cases:
                disease_id = case.disease_id
                if disease_id not in disease_data:
                    disease_data[disease_id] = {
                        "disease": case.disease,
                        "cases_under_5": 0,
                        "cases_5_and_above": 0,
                        "deaths_under_5": 0,
                        "deaths_5_and_above": 0,
                        "lab_confirmed": 0,
                        "is_outbreak": False,
                    }

                # Calculate age at detection
                patient_age = cls._calculate_age(
                    case.patient.date_of_birth, case.detected_at.date()
                )

                if patient_age < 5:
                    disease_data[disease_id]["cases_under_5"] += 1
                    if case.outcome == "DECEASED":
                        disease_data[disease_id]["deaths_under_5"] += 1
                        total_deaths += 1
                else:
                    disease_data[disease_id]["cases_5_and_above"] += 1
                    if case.outcome == "DECEASED":
                        disease_data[disease_id]["deaths_5_and_above"] += 1
                        total_deaths += 1

                if case.laboratory_confirmed:
                    disease_data[disease_id]["lab_confirmed"] += 1
                    lab_confirmed_cases += 1

                if case.disease.category == NotifiableCategory.IMMEDIATE:
                    immediate_cases += 1

            # Check for outbreaks
            outbreak_diseases = []
            for disease_id, data in disease_data.items():
                from .models import OutbreakThreshold

                threshold = OutbreakThreshold.objects.filter(
                    disease_id=disease_id,
                    is_active=True,
                ).first()

                if threshold:
                    total_cases = data["cases_under_5"] + data["cases_5_and_above"]
                    if total_cases >= threshold.case_threshold:
                        data["is_outbreak"] = True
                        outbreak_diseases.append(data["disease"].name)

            # Create disease summaries
            for _disease_id, data in disease_data.items():
                IDSRDiseaseSummary.objects.create(
                    report=report,
                    disease=data["disease"],
                    cases_under_5=data["cases_under_5"],
                    cases_5_and_above=data["cases_5_and_above"],
                    deaths_under_5=data["deaths_under_5"],
                    deaths_5_and_above=data["deaths_5_and_above"],
                    lab_confirmed=data["lab_confirmed"],
                    is_outbreak=data["is_outbreak"],
                )

            # Update report summary
            report.total_cases = len(cases)
            report.total_deaths = total_deaths
            report.immediate_cases = immediate_cases
            report.lab_confirmed_cases = lab_confirmed_cases
            report.outbreak_declared = len(outbreak_diseases) > 0
            report.outbreak_diseases = ",".join(outbreak_diseases)
            report.save()

            logger.info(
                "Generated IDSR report W%02d/%s: %s cases, %s diseases",
                epi_week,
                epi_year,
                len(cases),
                len(disease_data),
            )

        return report

    @staticmethod
    def _calculate_age(date_of_birth, reference_date) -> int:
        """Calculate age in years from date of birth."""
        if not date_of_birth:
            return 0
        years = reference_date.year - date_of_birth.year
        if (reference_date.month, reference_date.day) < (
            date_of_birth.month,
            date_of_birth.day,
        ):
            years -= 1
        return max(0, years)

    @classmethod
    def generate_previous_week_report(cls, facility, generated_by=None) -> "IDSRWeeklyReport":
        """
        Generate IDSR report for the previous epidemiological week.

        Called by Celery task on Sunday midnight.

        Args:
            generated_by: User or None for system

        Returns:
            Generated IDSRWeeklyReport
        """
        epi_year, epi_week, week_start, week_end = cls.get_previous_epi_week()
        return cls.generate_weekly_report(
            epi_year=epi_year,
            epi_week=epi_week,
            week_start=week_start,
            week_end=week_end,
            facility=facility,
            generated_by=generated_by,
        )

    @classmethod
    def prepare_dhis2_payload(cls, report: "IDSRWeeklyReport") -> dict:
        """
        Prepare DHIS2 DataValueSet payload for submission.

        Formats the IDSR report data according to Kenya KHIS
        data element structure using configured DHIS2 mappings.

        Args:
            report: IDSRWeeklyReport to submit

        Returns:
            DHIS2 API payload dict
        """
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        from .dhis2_mappings import get_data_element_uid, get_environment

        # DHIS2 period format for weekly: YYYY"W"WW (e.g., 2026W08)
        period = f"{report.epi_year}W{report.epi_week:02d}"

        # Resolve org unit from per-facility config or global fallback
        facility = report.facility_ref
        creds = resolve_dhis2_credentials(facility)
        org_unit = creds.org_unit if creds.org_unit else report.facility_code

        # Get current environment for mapping lookups
        environment = get_environment()

        data_values = []
        unmapped_diseases = []

        # Map disease summaries to actual DHIS2 data elements using mappings
        for summary in report.disease_summaries.select_related("disease"):
            disease_name = summary.disease.name

            # Build data values for each indicator (only if value > 0 and mapping exists)
            indicator_mapping = [
                ("cases_under_5", summary.cases_under_5),
                ("cases_5_and_above", summary.cases_5_and_above),
                ("deaths_under_5", summary.deaths_under_5),
                ("deaths_5_and_above", summary.deaths_5_and_above),
            ]

            for indicator_type, value in indicator_mapping:
                if value > 0:
                    uid = get_data_element_uid(disease_name, indicator_type, environment)
                    if uid:
                        data_values.append(
                            {
                                "dataElement": uid,
                                "period": period,
                                "orgUnit": org_unit,
                                "value": value,
                            }
                        )
                    else:
                        # Track unmapped diseases for debugging
                        unmapped_diseases.append(f"{disease_name}/{indicator_type}")

        if unmapped_diseases:
            logger.warning(
                "Unmapped DHIS2 data elements for report %s: %s%s",
                report.id,
                ", ".join(unmapped_diseases[:10]),
                "..." if len(unmapped_diseases) > 10 else "",
            )

        return {
            "dataValues": data_values,
            "period": period,
            "orgUnit": org_unit,
            "completeDate": timezone.localdate().isoformat(),
            "_metadata": {
                "report_id": report.id,
                "environment": environment,
                "unmapped_count": len(unmapped_diseases),
            },
        }

    @classmethod
    def validate_dhis2_submission(cls, report: "IDSRWeeklyReport") -> dict:
        """Validate configuration and MOH 505 mappings before any DHIS2 write."""
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        from .dhis2_mappings import validate_mappings

        facility = report.facility_ref
        credentials = resolve_dhis2_credentials(facility)
        errors: list[str] = []
        if not credentials.is_configured:
            errors.append("DHIS2/KHIS endpoint credentials are not configured.")
        if not credentials.org_unit:
            errors.append("The facility DHIS2/KHIS organisation unit is not configured.")

        mapping_validation = validate_mappings(credentials.environment)
        if not mapping_validation["valid"]:
            errors.append("Required MOH 505 data-element mappings are incomplete.")

        payload = cls.prepare_dhis2_payload(report)
        if payload["_metadata"]["unmapped_count"]:
            errors.append("The report contains positive values with no DHIS2/KHIS mapping.")

        return {
            "valid": not errors,
            "errors": errors,
            "mapping_validation": mapping_validation,
            "payload": payload,
        }

    @staticmethod
    def _is_successful_dhis2_import(response_data: dict) -> bool:
        """Return whether DHIS2 accepted the complete DataValueSet import."""
        summary = response_data.get("importSummary", response_data)
        status = str(summary.get("status", "")).upper()
        import_count = summary.get("importCount", {}) or {}
        rejected = int(import_count.get("rejected", 0) or 0)
        conflicts = summary.get("conflicts", []) or []
        return status in {"SUCCESS", "OK"} and rejected == 0 and not conflicts

    @classmethod
    def submit_to_dhis2(cls, report: "IDSRWeeklyReport", trigger: str = "manual") -> dict:
        """
        Submit IDSR report to DHIS2.

        Args:
            report: Approved IDSRWeeklyReport to submit

        Returns:
            DHIS2 API response dict
        """
        import requests

        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        if report.status != "APPROVED":
            raise ValueError("Report must be approved before submission")

        facility = report.facility_ref
        creds = resolve_dhis2_credentials(facility)
        validation = cls.validate_dhis2_submission(report)
        payload = validation.pop("payload")

        from .models import IDSRSubmissionAttempt, IDSRSubmissionAttemptStatus

        attempt = IDSRSubmissionAttempt.objects.create(
            report=report,
            facility=facility,
            organization=report.organization,
            trigger=trigger,
            attempt_number=report.submission_attempts.count() + 1,
            request_payload=payload,
            validation_response=validation,
            attempted_at=timezone.now(),
        )

        if not validation["valid"]:
            response_data = {"status": "error", "errors": validation["errors"]}
            attempt.status = IDSRSubmissionAttemptStatus.VALIDATION_FAILED
            attempt.response = response_data
            attempt.error_message = " ".join(validation["errors"])
            attempt.completed_at = timezone.now()
            attempt.save(
                update_fields=["status", "response", "error_message", "completed_at", "updated_at"]
            )
            report.mark_failed(response_data)
            return response_data

        try:
            dry_run = requests.post(
                f"{creds.base_url}/api/dataValueSets?dryRun=true",
                json=payload,
                auth=(creds.username, creds.password),
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            dry_run_data = dry_run.json() if dry_run.text else {}
            attempt.validation_response = {**validation, "staging": dry_run_data}
            if not dry_run.ok or not cls._is_successful_dhis2_import(dry_run_data):
                response_data = {"status": "error", "validation": dry_run_data}
                attempt.status = IDSRSubmissionAttemptStatus.VALIDATION_FAILED
                attempt.response = response_data
                attempt.http_status = dry_run.status_code
                attempt.error_message = "DHIS2/KHIS staging validation rejected the payload."
                attempt.completed_at = timezone.now()
                attempt.save(
                    update_fields=[
                        "status",
                        "response",
                        "validation_response",
                        "http_status",
                        "error_message",
                        "completed_at",
                        "updated_at",
                    ]
                )
                report.mark_failed(response_data)
                return response_data

            response = requests.post(
                f"{creds.base_url}/api/dataValueSets",
                json=payload,
                auth=(creds.username, creds.password),
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            response_data = response.json() if response.text else {}

            attempt.response = response_data
            attempt.http_status = response.status_code
            attempt.completed_at = timezone.now()
            if response.ok and cls._is_successful_dhis2_import(response_data):
                report.mark_submitted(response_data)
                attempt.status = IDSRSubmissionAttemptStatus.SUBMITTED
                logger.info("Submitted IDSR report %s to DHIS2", report.id)
            else:
                report.mark_failed(response_data)
                attempt.status = (
                    IDSRSubmissionAttemptStatus.RETRY_SCHEDULED
                    if trigger == "automated" and attempt.attempt_number < 3
                    else IDSRSubmissionAttemptStatus.FAILED
                )
                if attempt.status == IDSRSubmissionAttemptStatus.RETRY_SCHEDULED:
                    attempt.next_retry_at = timezone.now() + timedelta(minutes=15)
                attempt.error_message = "DHIS2/KHIS rejected the submission response."
                logger.error("DHIS2 submission failed: %s", response.status_code)
            attempt.save(
                update_fields=[
                    "status",
                    "response",
                    "http_status",
                    "error_message",
                    "completed_at",
                    "next_retry_at",
                    "validation_response",
                    "updated_at",
                ]
            )

            return response_data

        except requests.RequestException as e:
            error_response = {"status": "error", "message": str(e)}
            report.mark_failed(error_response)
            attempt.status = (
                IDSRSubmissionAttemptStatus.RETRY_SCHEDULED
                if trigger == "automated" and attempt.attempt_number < 3
                else IDSRSubmissionAttemptStatus.FAILED
            )
            if attempt.status == IDSRSubmissionAttemptStatus.RETRY_SCHEDULED:
                attempt.next_retry_at = timezone.now() + timedelta(minutes=15)
            attempt.response = error_response
            attempt.error_message = str(e)
            attempt.completed_at = timezone.now()
            attempt.save(
                update_fields=[
                    "status",
                    "response",
                    "error_message",
                    "completed_at",
                    "next_retry_at",
                    "updated_at",
                ]
            )
            logger.error("DHIS2 request failed: %s", e)
            return error_response


# -----------------------------------------------------------------------------
# Module-level convenience functions (for easier imports)
# -----------------------------------------------------------------------------


def generate_dhis2_payload(report: "IDSRWeeklyReport") -> dict:
    """
    Generate DHIS2 DataValueSet payload from an IDSR report.

    This is a convenience wrapper around IDSRReportingService.prepare_dhis2_payload.

    Args:
        report: IDSRWeeklyReport to generate payload for

    Returns:
        DHIS2 API payload dict ready for submission

    Example:
        >>> from hmis.apps.surveillance.services import generate_dhis2_payload
        >>> report = IDSRWeeklyReport.objects.latest('created_at')
        >>> payload = generate_dhis2_payload(report)
        >>> print(json.dumps(payload, indent=2))
    """
    return IDSRReportingService.prepare_dhis2_payload(report)


def submit_report_to_dhis2(report: "IDSRWeeklyReport") -> dict:
    """
    Submit an approved IDSR report to DHIS2.

    This is a convenience wrapper around IDSRReportingService.submit_to_dhis2.

    Args:
        report: Approved IDSRWeeklyReport to submit

    Returns:
        DHIS2 API response dict
    """
    return IDSRReportingService.submit_to_dhis2(report)
