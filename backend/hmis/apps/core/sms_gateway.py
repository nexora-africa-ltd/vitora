"""
SMS Gateway module for sending SMS via Africa's Talking.

Provides both a class-based interface (SMSGateway) for advanced use cases
and simple module-level functions (send_sms, send_bulk_sms) for convenience.

Configuration required in Django settings:
    AT_USERNAME: Africa's Talking application username
    AT_API_KEY: API key for authenticating with Africa's Talking
    SMS_SENDER_ID: Sender ID to be used when sending SMS messages (optional)
    SMS_ENABLED: Whether SMS sending is enabled (default: True in production)
"""

import logging
from typing import TYPE_CHECKING

from django.conf import settings

logger = logging.getLogger(__name__)

# Lazy initialization flag
_sms_client = None
_initialized = False


def _get_sms_client():
    """
    Get the Africa's Talking SMS client, initializing if needed.

    Returns:
        The africastalking.SMS service or None if not configured.
    """
    global _sms_client, _initialized

    if _initialized:
        return _sms_client

    _initialized = True

    # Safety: never use real SMS client during tests.
    if getattr(settings, "TESTING", False):
        logger.info("SMS sending disabled (TESTING=True)")
        return None

    # Check if SMS is enabled
    if not getattr(settings, "SMS_ENABLED", True):
        logger.info("SMS sending is disabled (SMS_ENABLED=False)")
        return None

    # Check for required settings
    username = getattr(settings, "AT_USERNAME", None)
    api_key = getattr(settings, "AT_API_KEY", None)

    if not username or not api_key:
        logger.warning(
            "Africa's Talking credentials not configured. "
            "Set AT_USERNAME and AT_API_KEY in settings."
        )
        return None

    try:
        import africastalking

        africastalking.initialize(username=username, api_key=api_key)
        _sms_client = africastalking.SMS
        logger.info("Africa's Talking SMS client initialized successfully")
        return _sms_client
    except ImportError:
        logger.warning("africastalking package not installed. Run: pip install africastalking")
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Africa's Talking client: {e}")
        return None


def send_sms(phone: str, message: str, sender_id: str | None = None) -> bool:
    """
    Send an SMS to a single recipient.

    Args:
        phone: Recipient phone number in international format (e.g., +254712345678)
        message: Message body to send (max 160 chars for single SMS)
        sender_id: Optional sender ID (defaults to settings.SMS_SENDER_ID)

    Returns:
        True if the SMS was sent successfully, False otherwise.

    Example:
        >>> from hmis.apps.core.sms_gateway import send_sms
        >>> send_sms("+254712345678", "Your appointment is confirmed")
        True
    """
    if not phone or not message:
        logger.warning("send_sms called with empty phone or message")
        return False

    # Normalize phone number
    phone = _normalize_phone(phone)

    client = _get_sms_client()
    if not client:
        logger.warning(f"SMS not sent (client not configured): {phone}")
        return False

    sender = sender_id or getattr(settings, "SMS_SENDER_ID", None)

    try:
        response = client.send(message, [phone], sender_id=sender)
        # Africa's Talking returns a dict with 'SMSMessageData'
        if response and "SMSMessageData" in response:
            recipients = response["SMSMessageData"].get("Recipients", [])
            if recipients and recipients[0].get("status") == "Success":
                logger.info(f"SMS sent successfully to {phone}")
                return True
            else:
                status = recipients[0].get("status") if recipients else "Unknown"
                logger.warning(f"SMS delivery failed for {phone}: {status}")
                return False
        logger.info(f"SMS submitted to {phone}")
        return True
    except Exception as e:
        logger.error(f"Failed to send SMS to {phone}: {e}")
        return False


def send_bulk_sms(
    phones: list[str], message: str, sender_id: str | None = None
) -> dict[str, bool]:
    """
    Send an SMS to multiple recipients.

    Args:
        phones: List of phone numbers in international format
        message: Message body to send
        sender_id: Optional sender ID (defaults to settings.SMS_SENDER_ID)

    Returns:
        Dictionary mapping phone numbers to success status.

    Example:
        >>> from hmis.apps.core.sms_gateway import send_bulk_sms
        >>> results = send_bulk_sms(["+254712345678", "+254798765432"], "Alert!")
        >>> results
        {"+254712345678": True, "+254798765432": True}
    """
    if not phones or not message:
        logger.warning("send_bulk_sms called with empty phones or message")
        return {}

    # Normalize all phone numbers
    phones = [_normalize_phone(p) for p in phones if p]

    client = _get_sms_client()
    if not client:
        logger.warning(f"Bulk SMS not sent (client not configured): {len(phones)} recipients")
        return {phone: False for phone in phones}

    sender = sender_id or getattr(settings, "SMS_SENDER_ID", None)

    try:
        response = client.send(message, phones, sender_id=sender)
        results = {}

        if response and "SMSMessageData" in response:
            recipients = response["SMSMessageData"].get("Recipients", [])
            for recipient in recipients:
                phone = recipient.get("number", "")
                status = recipient.get("status") == "Success"
                results[phone] = status

        # Mark any missing phones as failed
        for phone in phones:
            if phone not in results:
                results[phone] = False

        success_count = sum(1 for v in results.values() if v)
        logger.info(f"Bulk SMS: {success_count}/{len(phones)} sent successfully")
        return results

    except Exception as e:
        logger.error(f"Failed to send bulk SMS: {e}")
        return {phone: False for phone in phones}


def _normalize_phone(phone: str) -> str:
    """
    Normalize a phone number to international format.

    Handles common Kenyan phone number formats:
    - 0712345678 -> +254712345678
    - 254712345678 -> +254712345678
    - +254712345678 -> +254712345678

    Args:
        phone: Phone number to normalize

    Returns:
        Phone number in international format with + prefix.
    """
    phone = phone.strip().replace(" ", "").replace("-", "")

    if phone.startswith("0") and len(phone) == 10:
        # Kenyan local format: 0712345678
        phone = "+254" + phone[1:]
    elif phone.startswith("254") and not phone.startswith("+"):
        phone = "+" + phone
    elif not phone.startswith("+"):
        # Assume it's a Kenyan number without country code
        phone = "+254" + phone

    return phone


class SMSGateway:
    """
    Class-based SMS gateway for advanced use cases.

    Use this class when you need:
    - Custom sender IDs per instance
    - Batch operations with shared state
    - Integration with dependency injection

    For simple use cases, prefer the module-level functions:
    - send_sms(phone, message)
    - send_bulk_sms(phones, message)

    The gateway requires the following Django settings:
        AT_USERNAME: Africa's Talking application username
        AT_API_KEY: API key for authenticating with Africa's Talking
        SMS_SENDER_ID: Sender ID (optional, can be overridden per instance)
    """

    def __init__(self, sender_id: str | None = None) -> None:
        """
        Initialize the SMS gateway.

        Args:
            sender_id: Optional sender ID to use for all messages.
                      Defaults to settings.SMS_SENDER_ID.
        """
        self.sender_id = sender_id or getattr(settings, "SMS_SENDER_ID", None)
        self._client = _get_sms_client()

    @property
    def is_configured(self) -> bool:
        """Return True if the SMS client is properly configured."""
        return self._client is not None

    def send(self, phone: str, message: str) -> bool:
        """
        Send an SMS to a single recipient.

        Args:
            phone: Recipient phone number in international format.
            message: Message body to send.

        Returns:
            True if sent successfully, False otherwise.
        """
        return send_sms(phone, message, sender_id=self.sender_id)

    def send_bulk(self, phones: list[str], message: str) -> dict[str, bool]:
        """
        Send an SMS to multiple recipients.

        Args:
            phones: List of phone numbers.
            message: Message body to send.

        Returns:
            Dictionary mapping phone numbers to success status.
        """
        return send_bulk_sms(phones, message, sender_id=self.sender_id)

    def send_reminder(self, phone: str, message: str) -> None:
        """
        Send an SMS reminder to a single recipient.

        Args:
            phone: The recipient's phone number in international format.
            message: The message body to send.

        Raises:
            RuntimeError: If the SMS delivery fails for any reason.

        This method maintains backwards compatibility with the original
        SMSGateway.send_reminder() method signature.
        """
        success = self.send(phone, message)
        if not success:
            raise RuntimeError("SMS reminder delivery failed")

    def send_surveillance_alert(
        self, phone: str, disease_name: str, patient_mrn: str, county: str
    ) -> bool:
        """
        Send a disease surveillance alert SMS.

        Args:
            phone: County health officer phone number.
            disease_name: Name of the notifiable disease.
            patient_mrn: Patient MRN for reference.
            county: County name.

        Returns:
            True if sent successfully.
        """
        message = (
            f"[Vitora HMIS Alert]\n"
            f"Notifiable disease: {disease_name}\n"
            f"Patient: {patient_mrn}\n"
            f"County: {county}\n"
            f"Please log in for details."
        )
        return self.send(phone, message)

    def send_appointment_reminder(
        self, phone: str, patient_name: str, date: str, time: str, clinic: str
    ) -> bool:
        """
        Send an appointment reminder SMS.

        Args:
            phone: Patient phone number.
            patient_name: Patient's name.
            date: Appointment date (formatted string).
            time: Appointment time (formatted string).
            clinic: Clinic name.

        Returns:
            True if sent successfully.
        """
        message = (
            f"Dear {patient_name}, reminder: Your appointment at {clinic} "
            f"is scheduled for {date} at {time}. "
            f"Please arrive 15 minutes early."
        )
        return self.send(phone, message)

    def send_lab_result_notification(
        self, phone: str, patient_name: str, test_name: str
    ) -> bool:
        """
        Send notification that lab results are ready.

        Args:
            phone: Patient phone number.
            patient_name: Patient's name.
            test_name: Name of the test.

        Returns:
            True if sent successfully.
        """
        message = (
            f"Dear {patient_name}, your {test_name} results are ready. "
            f"Please visit the facility or contact your healthcare provider."
        )
        return self.send(phone, message)

    def send_prescription_ready(
        self, phone: str, patient_name: str, pharmacy_name: str
    ) -> bool:
        """
        Send notification that prescription is ready for pickup.

        Args:
            phone: Patient phone number.
            patient_name: Patient's name.
            pharmacy_name: Pharmacy name.

        Returns:
            True if sent successfully.
        """
        message = (
            f"Dear {patient_name}, your prescription is ready for pickup "
            f"at {pharmacy_name}. Please bring your ID."
        )
        return self.send(phone, message)
