"""SMS Gateway module for sending SMS via Africa's Talking."""

import logging

import africastalking
from django.conf import settings

logger = logging.getLogger(__name__)


class SMSGateway:
    """
    Simple wrapper around the Africa's Talking SMS client used to send
    SMS messages.

    The gateway requires the following Django settings to be configured:

    * ``AT_USERNAME`` - Africa's Talking application username.
    * ``AT_API_KEY`` - API key for authenticating with Africa's Talking.
    * ``SMS_SENDER_ID`` - Sender ID to be used when sending SMS messages.
    """

    def __init__(self) -> None:
        """
        Initialize the Africa's Talking SMS client.

        This reads the Africa's Talking credentials from the Django
        settings module and configures the global SDK client:

        * ``settings.AT_USERNAME`` is used as the Africa's Talking username.
        * ``settings.AT_API_KEY`` is used as the Africa's Talking API key.

        After initialization, the Africa's Talking ``SMS`` service is stored
        on ``self.sms`` for use by instance methods such as ``send_reminder``.
        """
        africastalking.initialize(
            username=settings.AT_USERNAME,
            api_key=settings.AT_API_KEY,
        )
        self.sms = africastalking.SMS

    def send_reminder(self, phone: str, message: str) -> None:
        """
        Send an SMS reminder to a single recipient.

        Args:
            phone: The recipient's phone number in international format.
            message: The message body to send.

        Raises:
            RuntimeError: If the SMS delivery fails for any reason.

        The message is sent using the Africa's Talking SMS service configured
        in ``__init__``, with the sender ID taken from
        ``settings.SMS_SENDER_ID``. The underlying client is responsible for
        performing the HTTP request and raising any errors on failure.
        """
        try:
            self.sms.send(message, [phone], sender_id=settings.SMS_SENDER_ID)
        except Exception as exc:
            logger.exception("Failed to send SMS reminder to %s", phone)
            raise RuntimeError("SMS reminder delivery failed") from exc
