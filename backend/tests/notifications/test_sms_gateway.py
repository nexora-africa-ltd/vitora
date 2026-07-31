from unittest.mock import Mock, patch

import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.core.sms_gateway import SMSGateway


@pytest.fixture(autouse=True)
def enforce_mock_sms_backend(settings):
    settings.AT_USERNAME = ""
    settings.AT_API_KEY = ""
    settings.SMS_ENABLED = True
    settings.SMS_BACKEND = "hmis.apps.core.sms.backends.MockSMSBackend"


class TestSMSGatewayInitialization:
    """Tests for SMSGateway initialization."""

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_initialization_configures_sms_client(self, mock_get_client):
        """Should initialize SMS client via _get_sms_client."""
        mock_sms = Mock()
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()

        mock_get_client.assert_called_once()
        assert gateway._client == mock_sms

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_initialization_sets_sms_client(self, mock_get_client):
        """Should store SMS client reference after initialization."""
        mock_sms = Mock()
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()

        assert gateway._client is not None
        assert gateway._client == mock_sms


class TestSMSSending:
    """Tests for sending SMS reminders."""

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_send_reminder_with_valid_data(self, mock_get_client):
        """Should send SMS with correct parameters."""
        mock_sms = Mock()
        mock_sms.send = Mock(
            return_value={
                "SMSMessageData": {"Recipients": [{"status": "Success", "number": "+254712345678"}]}
            }
        )
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"
        message = "Your appointment is tomorrow at 10 AM"

        gateway.send_reminder(phone, message)

        mock_sms.send.assert_called_once_with(message, [phone], sender_id=gateway.sender_id)

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_send_reminder_uses_sender_id_from_settings(self, mock_get_client):
        """Should use SMS_SENDER_ID from Django settings."""
        mock_sms = Mock()
        mock_sms.send = Mock(
            return_value={
                "SMSMessageData": {"Recipients": [{"status": "Success", "number": "+254712345678"}]}
            }
        )
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        gateway.send_reminder("+254712345678", "Test message")

        call_kwargs = mock_sms.send.call_args[1]
        assert call_kwargs["sender_id"] == gateway.sender_id

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_send_reminder_with_international_format(self, mock_get_client):
        """Should handle phone numbers in international format."""
        mock_sms = Mock()
        mock_sms.send = Mock(
            return_value={
                "SMSMessageData": {"Recipients": [{"status": "Success", "number": "+254712345678"}]}
            }
        )
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"
        message = "Reminder"

        gateway.send_reminder(phone, message)

        # Verify phone number is passed as list
        call_args = mock_sms.send.call_args[0]
        assert call_args[1] == [phone]

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_send_reminder_wraps_phone_in_list(self, mock_get_client):
        """Should wrap single phone number in list for API call."""
        mock_sms = Mock()
        mock_sms.send = Mock(
            return_value={
                "SMSMessageData": {"Recipients": [{"status": "Success", "number": "+254712345678"}]}
            }
        )
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"

        gateway.send_reminder(phone, "Test")

        # Verify second argument is a list
        call_args = mock_sms.send.call_args[0]
        assert isinstance(call_args[1], list)
        assert len(call_args[1]) == 1


class TestSMSErrorHandling:
    """Tests for SMS sending error scenarios."""

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    @patch("hmis.apps.core.sms_gateway.logger")
    def test_send_reminder_handles_api_exception(self, mock_logger, mock_get_client):
        """Should log error and raise RuntimeError when API call fails."""
        mock_sms = Mock()
        mock_sms.send = Mock(side_effect=Exception("API error"))
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"

        with pytest.raises(RuntimeError, match="SMS reminder delivery failed"):
            gateway.send_reminder(phone, "Test message")

        mock_logger.error.assert_called_once()

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    @patch("hmis.apps.core.sms_gateway.logger")
    def test_send_reminder_logs_phone_number_on_failure(self, mock_logger, mock_get_client):
        """Should log recipient phone number when sending fails."""
        mock_sms = Mock()
        mock_sms.send = Mock(side_effect=Exception("Network error"))
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        phone = "+254712345678"

        with pytest.raises(RuntimeError):
            gateway.send_reminder(phone, "Test")

        # Verify phone number is in log message
        mock_logger.error.assert_called_once()
        call_args_str = str(mock_logger.error.call_args)
        assert phone in call_args_str

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_send_reminder_raises_on_failure(self, mock_get_client):
        """Should raise RuntimeError when send returns failure status."""
        mock_sms = Mock()
        # Return a response indicating failure (status is not "Success")
        mock_sms.send = Mock(
            return_value={
                "SMSMessageData": {"Recipients": [{"status": "Failed", "number": "+254712345678"}]}
            }
        )
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()

        with pytest.raises(RuntimeError, match="SMS reminder delivery failed"):
            gateway.send_reminder("+254712345678", "Test")


class TestSMSIntegration:
    """Integration-style tests for SMSGateway."""

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    def test_multiple_reminders_reuse_same_client(self, mock_get_client):
        """Should reuse same SMS client for multiple sends."""
        mock_sms = Mock()
        mock_sms.send = Mock(
            return_value={
                "SMSMessageData": {"Recipients": [{"status": "Success", "number": "+254712345678"}]}
            }
        )
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()
        gateway.send_reminder("+254712345678", "Message 1")
        gateway.send_reminder("+254798765432", "Message 2")

        # Verify send called twice
        assert mock_sms.send.call_count == 2

    @patch("hmis.apps.core.sms_gateway._get_sms_client")
    @patch("hmis.apps.core.sms_gateway.logger")
    def test_gateway_handles_empty_message(self, mock_logger, mock_get_client):
        """Should handle empty message string by returning failure."""
        mock_sms = Mock()
        mock_get_client.return_value = mock_sms

        gateway = SMSGateway()

        # Empty message should cause send to fail and raise RuntimeError
        with pytest.raises(RuntimeError):
            gateway.send_reminder("+254712345678", "")

        # The underlying send_sms returns False for empty messages
        mock_logger.warning.assert_called()


class TestSMSTestSafety:
    @override_settings(
        TESTING=True,
        SMS_ENABLED=True,
        SMS_BACKEND="hmis.apps.core.sms.backends.AfricasTalkingSMSBackend",
    )
    def test_testing_blocks_non_mock_backend(self):
        from hmis.apps.core import sms_gateway

        sms_gateway._initialized = False
        sms_gateway._sms_client = None

        assert sms_gateway._get_sms_client() is None

    @override_settings(
        TESTING=True, SMS_ENABLED=True, SMS_BACKEND="hmis.apps.core.sms.backends.MockSMSBackend"
    )
    @patch("hmis.apps.core.sms_gateway.import_string")
    def test_testing_allows_mock_backend(self, mock_import_string):
        from hmis.apps.core import sms_gateway

        backend_cls = Mock()
        backend_instance = Mock()
        backend_cls.return_value = backend_instance
        mock_import_string.return_value = backend_cls

        sms_gateway._initialized = False
        sms_gateway._sms_client = None

        client = sms_gateway._get_sms_client()

        assert client == backend_instance
        mock_import_string.assert_called_once_with("hmis.apps.core.sms.backends.MockSMSBackend")
