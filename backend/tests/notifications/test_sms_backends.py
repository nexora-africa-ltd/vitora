import pytest
from django.test import override_settings

from hmis.apps.core.sms.backends import AfricasTalkingSMSBackend, MockSMSBackend


class TestMockSMSBackend:
    def test_send_returns_success_for_all_recipients(self):
        backend = MockSMSBackend()

        response = backend.send(
            "Test message",
            ["+254712345678", "+254798765432"],
            sender_id="VitoraHMIS",
        )

        recipients = response["SMSMessageData"]["Recipients"]
        assert len(recipients) == 2
        assert all(r["status"] == "Success" for r in recipients)


class TestAfricasTalkingBackend:
    @override_settings(AT_USERNAME="", AT_API_KEY="")
    def test_requires_credentials(self):
        with pytest.raises(ValueError, match="AT_USERNAME and AT_API_KEY"):
            AfricasTalkingSMSBackend()
