import pytest
from rest_framework import status

from hmis.apps.imaging.models import ImagingIntegrationSettings


@pytest.mark.django_db
class TestImagingIntegrationSettingsAPI:
    def test_current_requires_auth(self, api_client):
        response = api_client.get("/api/imaging/settings/current/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_current_get_or_create(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/imaging/settings/current/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ae_title"] == "VITORA"
        assert response.data["port"] == 11112
        assert ImagingIntegrationSettings.objects.filter(facility=sample_facility).count() == 1

    def test_patch_updates_settings(self, authenticated_client, sample_facility):
        settings_obj = ImagingIntegrationSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.patch(
            f"/api/imaging/settings/{settings_obj.id}/",
            {
                "listener_enabled": True,
                "ae_title": "XRAY_GATE",
                "port": 12121,
                "allowed_peers": "MODALITY_A, modality_a, US_ROOM_1 ",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        settings_obj.refresh_from_db()
        assert settings_obj.listener_enabled is True
        assert settings_obj.ae_title == "XRAY_GATE"
        assert settings_obj.port == 12121
        assert settings_obj.allowed_peers == "MODALITY_A,US_ROOM_1"

    def test_patch_rejects_invalid_ae_title(self, authenticated_client, sample_facility):
        settings_obj = ImagingIntegrationSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.patch(
            f"/api/imaging/settings/{settings_obj.id}/",
            {"ae_title": "invalid ae title"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "ae_title" in response.data
