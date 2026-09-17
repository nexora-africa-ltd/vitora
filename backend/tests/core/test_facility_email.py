# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for facility-scoped SMTP configuration and email provider selection.

Run with: poetry run pytest tests/core/test_facility_email.py -q
Inputs: shared facility fixtures and mocked SMTP/Resend transports.
"""

from unittest.mock import MagicMock, patch

from hmis.apps.core.models import FacilityEmailConfig
from hmis.apps.core.services.email_service import SMTP_PROVIDER_PRESETS, send_transactional_email


class TestFacilityEmailConfig:
    """Facility SMTP credentials must remain encrypted and scoped."""

    def test_smtp_password_is_encrypted_at_rest(self, sample_facility):
        """The backing column must never contain the plaintext password."""
        config = FacilityEmailConfig.objects.create(
            facility=sample_facility,
            smtp_host="smtp.facility.test",
            smtp_username="notifications@facility.test",
            from_address="notifications@facility.test",
        )

        config.smtp_password = "app-password"
        config.save()

        assert config.smtp_password_encrypted != "app-password"
        assert config.smtp_password == "app-password"
        assert config.is_configured is True

    def test_blank_sender_addresses_fall_back_to_smtp_username(self, sample_facility):
        """SMTP credentials provide a safe sender default for simple provider setups."""
        config = FacilityEmailConfig.objects.create(
            facility=sample_facility,
            smtp_host="smtp.facility.test",
            smtp_username="notifications@facility.test",
        )
        config.smtp_password = "app-password"
        config.save()

        assert config.effective_from_address == "notifications@facility.test"
        assert config.effective_reply_to_address == "notifications@facility.test"

    def test_custom_email_is_exposed_as_a_facility_module(self, sample_facility):
        """Facility settings expose the Custom Email module for configuration."""
        assert sample_facility.modules["custom_email"] is False

        sample_facility.has_custom_email = True
        sample_facility.save()

        assert sample_facility.modules["custom_email"] is True
        assert "custom_email" in sample_facility.enabled_module_names

    def test_editing_healthy_connection_settings_requires_retest(self, sample_facility):
        """Connection or sender changes disable a previously healthy custom sender."""
        config = FacilityEmailConfig.objects.create(
            facility=sample_facility,
            custom_email_enabled=True,
            smtp_host="smtp.facility.test",
            smtp_username="notifications@facility.test",
            status=FacilityEmailConfig.Status.HEALTHY,
        )

        from hmis.apps.core.serializers_org_facility import FacilityEmailConfigSerializer

        serializer = FacilityEmailConfigSerializer(
            config, data={"from_display_name": "New Sender"}, partial=True
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()

        assert updated.status == FacilityEmailConfig.Status.UNHEALTHY
        assert updated.custom_email_enabled is False


def test_smtp_provider_presets_do_not_include_credentials():
    """Frontend presets provide connection metadata only, never secrets."""
    gmail = next(item for item in SMTP_PROVIDER_PRESETS if item["id"] == "gmail")

    assert gmail["smtp_host"] == "smtp.gmail.com"
    assert gmail["smtp_port"] == 587
    assert gmail["security_mode"] == "STARTTLS"
    assert not any("password" in key or "secret" in key for key in gmail)


class TestFacilityEmailProviderSelection:
    """Transactional email routes from the selected facility configuration."""

    @patch("hmis.apps.core.services.email_service.get_connection")
    def test_enabled_facility_smtp_never_uses_resend(
        self, mock_connection, sample_facility, settings
    ):
        """Custom Email routes only through this facility's SMTP account."""
        settings.RESEND_API_KEY = "resend-key"
        sample_facility.has_custom_email = True
        sample_facility.save()
        config = FacilityEmailConfig.objects.create(
            facility=sample_facility,
            custom_email_enabled=True,
            smtp_host="smtp.facility.test",
            smtp_port=587,
            smtp_username="notifications@facility.test",
            from_address="notifications@facility.test",
            status=FacilityEmailConfig.Status.HEALTHY,
        )
        config.smtp_password = "app-password"
        config.save()

        connection = MagicMock()
        connection.send_messages.return_value = 1
        mock_connection.return_value = connection

        result = send_transactional_email(
            subject="Facility test",
            html_body="<p>Test</p>",
            to_email="recipient@example.test",
            facility=sample_facility,
        )

        assert result["accepted"] is True
        assert result["provider"] == "smtp"
        mock_connection.assert_called_once()

    def test_missing_or_disabled_config_uses_resend_default(self, sample_facility, settings):
        """Facilities without Custom Email retain the shared default provider."""
        settings.RESEND_API_KEY = ""

        result = send_transactional_email(
            subject="Default test",
            html_body="<p>Test</p>",
            to_email="recipient@example.test",
            facility=sample_facility,
        )

        assert result["provider"] == "django"

    @patch("hmis.apps.core.services.email_service.get_connection")
    def test_facility_smtp_uses_display_name_in_from_header(self, mock_connection, sample_facility):
        """The configured sender name is included in the SMTP RFC 5322 From header."""
        sample_facility.has_custom_email = True
        sample_facility.save()
        config = FacilityEmailConfig.objects.create(
            facility=sample_facility,
            custom_email_enabled=True,
            smtp_host="smtp.facility.test",
            smtp_username="notifications@facility.test",
            from_display_name="Sample Clinic",
            status=FacilityEmailConfig.Status.HEALTHY,
        )
        config.smtp_password = "app-password"
        config.save()
        connection = MagicMock()
        connection.send_messages.return_value = 1
        mock_connection.return_value = connection

        send_transactional_email(
            subject="Facility test",
            html_body="<p>Test</p>",
            to_email="recipient@example.test",
            facility=sample_facility,
        )

        message = connection.send_messages.call_args.args[0][0]
        assert message.from_email == "Sample Clinic <notifications@facility.test>"
