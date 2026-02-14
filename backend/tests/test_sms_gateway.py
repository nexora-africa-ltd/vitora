from unittest.mock import MagicMock, Mock, patch

import pytest  # type: ignore
from django.conf import settings

from hmis.apps.core.sms_gateway import SMSGateway


class TestSMSGatewayInitialization:
    """Tests for SMSGateway initialization."""

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_initialization_configures_africastalking(self, mock_at):
        """Should initialize Africa's Talking with credentials from settings."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()

        mock_at.initialize.assert_called_once_with(
            username=settings.AT_USERNAME,
            api_key=settings.AT_API_KEY,
        )
        assert gateway.sms == mock_sms

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_initialization_sets_sms_service(self, mock_at):
        """Should store SMS service reference after initialization."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()

        assert gateway.sms is not None
        assert gateway.sms == mock_sms


class TestSMSSending:
    """Tests for sending SMS reminders."""

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_send_reminder_with_valid_data(self, mock_at):
        """Should send SMS with correct parameters."""
        mock_sms = Mock()
        mock_sms.send = Mock(return_value={"status": "success"})
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"
        message = "Your appointment is tomorrow at 10 AM"

        gateway.send_reminder(phone, message)

        mock_sms.send.assert_called_once_with(message, [phone], sender_id=settings.SMS_SENDER_ID)

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_send_reminder_uses_sender_id_from_settings(self, mock_at):
        """Should use SMS_SENDER_ID from Django settings."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        gateway.send_reminder("+254712345678", "Test message")

        call_kwargs = mock_sms.send.call_args[1]
        assert call_kwargs["sender_id"] == settings.SMS_SENDER_ID

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_send_reminder_with_international_format(self, mock_at):
        """Should handle phone numbers in international format."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"
        message = "Reminder"

        gateway.send_reminder(phone, message)

        # Verify phone number is passed as list
        call_args = mock_sms.send.call_args[0]
        assert call_args[1] == [phone]

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_send_reminder_wraps_phone_in_list(self, mock_at):
        """Should wrap single phone number in list for API call."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"

        gateway.send_reminder(phone, "Test")

        # Verify second argument is a list
        call_args = mock_sms.send.call_args[0]
        assert isinstance(call_args[1], list)
        assert len(call_args[1]) == 1


class TestSMSErrorHandling:
    """Tests for SMS sending error scenarios."""

    @patch("hmis.apps.core.sms_gateway.africastalking")
    @patch("hmis.apps.core.sms_gateway.logger")
    def test_send_reminder_handles_api_exception(self, mock_logger, mock_at):
        """Should log and raise RuntimeError when API call fails."""
        mock_sms = Mock()
        mock_sms.send = Mock(side_effect=Exception("API error"))
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"

        with pytest.raises(RuntimeError, match="SMS reminder delivery failed"):
            gateway.send_reminder(phone, "Test message")

        mock_logger.exception.assert_called_once()

    @patch("hmis.apps.core.sms_gateway.africastalking")
    @patch("hmis.apps.core.sms_gateway.logger")
    def test_send_reminder_logs_phone_number_on_failure(self, mock_logger, mock_at):
        """Should log recipient phone number when sending fails."""
        mock_sms = Mock()
        mock_sms.send = Mock(side_effect=Exception("Network error"))
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"

        with pytest.raises(RuntimeError):
            gateway.send_reminder(phone, "Test")

        # Verify phone number is in log message args
        # logger.exception is called with format string and args
        mock_logger.exception.assert_called_once()
        call_args = mock_logger.exception.call_args[0]
        assert phone in call_args  # phone is passed as argument to format string

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_send_reminder_preserves_original_exception(self, mock_at):
        """Should chain original exception when raising RuntimeError."""
        original_error = ValueError("Invalid phone format")
        mock_sms = Mock()
        mock_sms.send = Mock(side_effect=original_error)
        mock_at.SMS = mock_sms

        gateway = SMSGateway()

        with pytest.raises(RuntimeError) as exc_info:
            gateway.send_reminder("+254712345678", "Test")

        assert exc_info.value.__cause__ == original_error


class TestSMSIntegration:
    """Integration-style tests for SMSGateway."""

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_multiple_reminders_reuse_same_client(self, mock_at):
        """Should reuse same SMS client for multiple sends."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        gateway.send_reminder("+254712345678", "Message 1")
        gateway.send_reminder("+254798765432", "Message 2")

        # Verify initialization called only once
        assert mock_at.initialize.call_count == 1
        # Verify send called twice
        assert mock_sms.send.call_count == 2

    @patch("hmis.apps.core.sms_gateway.africastalking")
    def test_gateway_handles_empty_message(self, mock_at):
        """Should handle empty message string."""
        mock_sms = Mock()
        mock_at.SMS = mock_sms

        gateway = SMSGateway()
        gateway.send_reminder("+254712345678", "")

        mock_sms.send.assert_called_once()
        call_args = mock_sms.send.call_args[0]
        assert call_args[0] == ""
