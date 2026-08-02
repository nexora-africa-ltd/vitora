import pytest

from hmis.apps.imaging.management.commands.dicom_scp_listener import resolve_listener_config
from hmis.apps.imaging.models import ImagingIntegrationSettings


@pytest.mark.django_db
class TestDICOMListenerConfigResolution:
    def test_falls_back_to_environment_defaults(self, settings):
        settings.DICOM_SCP_AE_TITLE = "ENV_AE"
        settings.DICOM_SCP_PORT = 21112
        settings.DICOM_SCP_BIND_HOST = "127.0.0.1"
        settings.DICOM_SCP_ALLOWED_PEERS = ["ENV_XR", "ENV_US"]

        ae_title, port, bind, allowed_peers = resolve_listener_config(
            {"ae_title": None, "port": None, "bind": None}
        )

        assert ae_title == "ENV_AE"
        assert port == 21112
        assert bind == "127.0.0.1"
        assert allowed_peers == {"ENV_XR", "ENV_US"}

    def test_uses_db_profile_when_present(self, settings, sample_facility):
        settings.DICOM_SCP_AE_TITLE = "ENV_AE"
        settings.DICOM_SCP_PORT = 11112
        settings.DICOM_SCP_BIND_HOST = "127.0.0.1"
        settings.DICOM_SCP_ALLOWED_PEERS = ["ENV_ONLY"]

        ImagingIntegrationSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            listener_enabled=True,
            ae_title="DB_AE",
            bind_host="10.10.10.20",
            port=31112,
            allowed_peers="XR_ROOM_1,US_ROOM_2",
        )

        ae_title, port, bind, allowed_peers = resolve_listener_config(
            {"ae_title": None, "port": None, "bind": None}
        )

        assert ae_title == "DB_AE"
        assert port == 31112
        assert bind == "10.10.10.20"
        assert allowed_peers == {"XR_ROOM_1", "US_ROOM_2"}

    def test_cli_overrides_db_profile(self, settings, sample_facility):
        settings.DICOM_SCP_AE_TITLE = "ENV_AE"
        settings.DICOM_SCP_PORT = 11112
        settings.DICOM_SCP_BIND_HOST = "127.0.0.1"

        ImagingIntegrationSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            listener_enabled=True,
            ae_title="DB_AE",
            bind_host="10.10.10.20",
            port=31112,
            allowed_peers="XR_ROOM_1",
        )

        ae_title, port, bind, _allowed_peers = resolve_listener_config(
            {"ae_title": "CLI_AE", "port": 41112, "bind": "192.168.1.5"}
        )

        assert ae_title == "CLI_AE"
        assert port == 41112
        assert bind == "192.168.1.5"

    def test_ae_hint_without_matching_db_profile_uses_env(self, settings, sample_facility):
        settings.DICOM_SCP_AE_TITLE = "ENV_AE"
        settings.DICOM_SCP_PORT = 51112
        settings.DICOM_SCP_BIND_HOST = "127.0.0.1"
        settings.DICOM_SCP_ALLOWED_PEERS = ["ENV_XR"]

        ImagingIntegrationSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            listener_enabled=True,
            ae_title="DB_AE",
            bind_host="10.10.10.20",
            port=31112,
            allowed_peers="XR_ROOM_1",
        )

        ae_title, port, bind, allowed_peers = resolve_listener_config(
            {"ae_title": "OTHER_AE", "port": None, "bind": None}
        )

        assert ae_title == "OTHER_AE"
        assert port == 51112
        assert bind == "127.0.0.1"
        assert allowed_peers == {"ENV_XR"}
