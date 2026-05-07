"""
Tests for DHIS2Config model, credential resolution, serializers, and API.
"""

import pytest  # type: ignore
from django.db import IntegrityError
from rest_framework import status

# =============================================================================
# Model Tests
# =============================================================================


class TestDHIS2ConfigModel:
    """Tests for the DHIS2Config model."""

    def test_create_dhis2_config(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Test KHIS",
            base_url="https://hiskenya.org",
            username="testuser",
            environment=DHIS2Config.Environment.PRODUCTION,
        )
        config.set_password("secret123")
        config.save()

        assert config.pk is not None
        assert config.name == "Test KHIS"
        assert config.api_url == "https://hiskenya.org"
        assert config.get_password() == "secret123"

    def test_password_is_encrypted_at_rest(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Enc Test",
            base_url="https://dhis2.example.org",
            username="admin",
        )
        config.set_password("my_plaintext_password")
        config.save()

        # _password in DB should NOT be the plaintext
        config.refresh_from_db()
        assert config._password != "my_plaintext_password"
        assert config._password != ""
        # But get_password() should decrypt
        assert config.get_password() == "my_plaintext_password"

    def test_empty_password_returns_empty(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="No Pass",
            base_url="https://dhis2.example.org",
            username="admin",
            _password="",
        )
        config.save()
        assert config.get_password() == ""

    def test_api_url_strips_trailing_slash(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Slash Test",
            base_url="https://hiskenya.org/",
            username="admin",
        )
        assert config.api_url == "https://hiskenya.org"

    def test_unique_active_config_per_org(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        DHIS2Config.objects.create(
            organization=sample_organization,
            name="First",
            base_url="https://a.org",
            username="u",
            _password="p",
            is_active=True,
        )
        with pytest.raises(IntegrityError):
            DHIS2Config.objects.create(
                organization=sample_organization,
                name="Second",
                base_url="https://b.org",
                username="u",
                _password="p",
                is_active=True,
            )

    def test_multiple_inactive_configs_allowed(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        DHIS2Config.objects.create(
            organization=sample_organization,
            name="Inactive 1",
            base_url="https://a.org",
            username="u",
            _password="p",
            is_active=False,
        )
        DHIS2Config.objects.create(
            organization=sample_organization,
            name="Inactive 2",
            base_url="https://b.org",
            username="u",
            _password="p",
            is_active=False,
        )
        assert DHIS2Config.objects.filter(organization=sample_organization).count() == 2

    def test_get_for_facility_returns_active_config(self, db, sample_organization, sample_facility):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config.objects.create(
            organization=sample_organization,
            name="Active",
            base_url="https://khis.org",
            username="u",
            _password="p",
            is_active=True,
        )
        result = DHIS2Config.get_for_facility(sample_facility)
        assert result is not None
        assert result.pk == config.pk

    def test_get_for_facility_returns_none_when_no_config(self, db, sample_facility):
        from hmis.apps.core.models import DHIS2Config

        result = DHIS2Config.get_for_facility(sample_facility)
        assert result is None

    def test_get_for_facility_returns_none_for_none_facility(self, db):
        from hmis.apps.core.models import DHIS2Config

        result = DHIS2Config.get_for_facility(None)
        assert result is None

    def test_str_representation(self, db, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Mombasa KHIS",
            base_url="https://khis.org",
            username="admin",
        )
        assert "Mombasa KHIS" in str(config)
        assert sample_organization.name in str(config)


# =============================================================================
# Facility dhis2_org_unit Tests
# =============================================================================


class TestFacilityDHIS2OrgUnit:
    """Tests for the dhis2_org_unit field on Facility."""

    def test_default_is_empty(self, db, sample_facility):
        assert sample_facility.dhis2_org_unit == ""

    def test_can_set_org_unit(self, db, sample_facility):
        sample_facility.dhis2_org_unit = "j7gkBfmQ3aT"
        sample_facility.save()
        sample_facility.refresh_from_db()
        assert sample_facility.dhis2_org_unit == "j7gkBfmQ3aT"


# =============================================================================
# Credential Resolution Tests
# =============================================================================


class TestResolveDHIS2Credentials:
    """Tests for resolve_dhis2_credentials helper."""

    def test_resolve_from_db_config(self, db, sample_organization, sample_facility):
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="DB Config",
            base_url="https://db.khis.org",
            username="db_user",
            environment=DHIS2Config.Environment.PRODUCTION,
        )
        config.set_password("db_pass")
        config.save()

        sample_facility.dhis2_org_unit = "ABC12345678"
        sample_facility.save()

        creds = resolve_dhis2_credentials(sample_facility)
        assert creds.source == "db"
        assert creds.base_url == "https://db.khis.org"
        assert creds.username == "db_user"
        assert creds.password == "db_pass"
        assert creds.org_unit == "ABC12345678"
        assert creds.is_configured is True

    def test_resolve_fallback_to_settings(self, db, sample_facility, settings):
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        settings.DHIS2_API_URL = "https://settings.khis.org"
        settings.DHIS2_USERNAME = "settings_user"
        settings.DHIS2_PASSWORD = "settings_pass"
        settings.DHIS2_ORG_UNIT = "GLOBAL_OU"

        creds = resolve_dhis2_credentials(sample_facility)
        assert creds.source == "settings"
        assert creds.base_url == "https://settings.khis.org"
        assert creds.username == "settings_user"
        assert creds.password == "settings_pass"

    def test_facility_org_unit_overrides_global(self, db, sample_facility, settings):
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        settings.DHIS2_ORG_UNIT = "GLOBAL_OU"
        sample_facility.dhis2_org_unit = "FACILITY_OU"
        sample_facility.save()

        creds = resolve_dhis2_credentials(sample_facility)
        assert creds.org_unit == "FACILITY_OU"

    def test_none_facility_returns_settings(self, db, settings):
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        settings.DHIS2_API_URL = "https://fallback.org"
        settings.DHIS2_USERNAME = "fb_user"
        settings.DHIS2_PASSWORD = "fb_pass"

        creds = resolve_dhis2_credentials(None)
        assert creds.source == "settings"
        assert creds.base_url == "https://fallback.org"

    def test_is_configured_false_when_empty(self, db, settings):
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        settings.DHIS2_API_URL = ""
        settings.DHIS2_USERNAME = ""
        settings.DHIS2_PASSWORD = ""

        creds = resolve_dhis2_credentials(None)
        assert creds.is_configured is False


# =============================================================================
# API Tests
# =============================================================================


@pytest.fixture
def admin_client(db, sample_organization, sample_facility):
    """Provide an admin-level API client for DHIS2Config tests."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    from tests.conftest import ensure_staff_profile

    User = get_user_model()
    admin = User.objects.create_superuser(
        username="dhis2admin",
        email="dhis2admin@test.co.ke",
        password="testpass123",
    )
    ensure_staff_profile(admin, sample_organization, sample_facility, "DHIS2-ADMIN")
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


class TestDHIS2ConfigAPI:
    """Tests for the DHIS2Config CRUD API."""

    def test_create_dhis2_config(self, admin_client, sample_organization):
        response = admin_client.post(
            "/api/dhis2-configs/",
            {
                "organization": sample_organization.pk,
                "name": "Mombasa KHIS",
                "base_url": "https://hiskenya.org",
                "username": "mombasa_user",
                "password": "mombasa_pass",
                "environment": "production",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Mombasa KHIS"
        assert response.data["base_url"] == "https://hiskenya.org"
        # Password should NOT appear in the response
        assert "password" not in response.data
        assert "_password" not in response.data

    def test_list_dhis2_configs(self, admin_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        DHIS2Config.objects.create(
            organization=sample_organization,
            name="Listed Config",
            base_url="https://listed.org",
            username="u",
            _password="p",
        )
        response = admin_client.get("/api/dhis2-configs/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert any(c["name"] == "Listed Config" for c in results)

    def test_retrieve_dhis2_config(self, admin_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config.objects.create(
            organization=sample_organization,
            name="Detail Config",
            base_url="https://detail.org",
            username="u",
            _password="p",
        )
        response = admin_client.get(f"/api/dhis2-configs/{config.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Detail Config"
        assert "password" not in response.data

    def test_update_dhis2_config(self, admin_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Before Update",
            base_url="https://old.org",
            username="old_user",
        )
        config.set_password("old_pass")
        config.save()

        response = admin_client.patch(
            f"/api/dhis2-configs/{config.pk}/",
            {"name": "After Update", "password": "new_pass"},
        )
        assert response.status_code == status.HTTP_200_OK
        config.refresh_from_db()
        assert config.name == "After Update"
        assert config.get_password() == "new_pass"

    def test_update_without_password_preserves_old(self, admin_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Keep Pass",
            base_url="https://keep.org",
            username="u",
        )
        config.set_password("original")
        config.save()

        response = admin_client.patch(
            f"/api/dhis2-configs/{config.pk}/",
            {"name": "Updated Name"},
        )
        assert response.status_code == status.HTTP_200_OK
        config.refresh_from_db()
        assert config.get_password() == "original"

    def test_delete_dhis2_config(self, admin_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config.objects.create(
            organization=sample_organization,
            name="To Delete",
            base_url="https://delete.org",
            username="u",
            _password="p",
        )
        response = admin_client.delete(f"/api/dhis2-configs/{config.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not DHIS2Config.objects.filter(pk=config.pk).exists()

    def test_non_admin_cannot_create(self, authenticated_client, sample_organization):
        response = authenticated_client.post(
            "/api/dhis2-configs/",
            {
                "organization": sample_organization.pk,
                "name": "Unauthorized",
                "base_url": "https://nope.org",
                "username": "u",
                "password": "p",
            },
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_admin_can_list(self, authenticated_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        DHIS2Config.objects.create(
            organization=sample_organization,
            name="Visible",
            base_url="https://visible.org",
            username="u",
            _password="p",
        )
        response = authenticated_client.get("/api/dhis2-configs/")
        assert response.status_code == status.HTTP_200_OK

    def test_non_admin_can_retrieve(self, authenticated_client, sample_organization):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config.objects.create(
            organization=sample_organization,
            name="Readable",
            base_url="https://readable.org",
            username="u",
            _password="p",
        )
        response = authenticated_client.get(f"/api/dhis2-configs/{config.pk}/")
        assert response.status_code == status.HTTP_200_OK


class TestDHIS2ConfigTestConnection:
    """Tests for the test-connection action."""

    def test_connection_success(self, admin_client, sample_organization, mocker):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Conn Test",
            base_url="https://dhis2.example.org",
            username="admin",
        )
        config.set_password("district")
        config.save()

        mock_resp = mocker.MagicMock()
        mock_resp.ok = True
        mock_resp.json.return_value = {
            "displayName": "Admin User",
            "serverVersion": "2.40",
        }
        mocker.patch("requests.get", return_value=mock_resp)

        response = admin_client.post(f"/api/dhis2-configs/{config.pk}/test-connection/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ok"
        assert response.data["dhis2_user"] == "Admin User"

    def test_connection_http_error(self, admin_client, sample_organization, mocker):
        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Fail Test",
            base_url="https://dhis2.example.org",
            username="admin",
        )
        config.set_password("wrong")
        config.save()

        mock_resp = mocker.MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_resp.reason = "Unauthorized"
        mocker.patch("requests.get", return_value=mock_resp)

        response = admin_client.post(f"/api/dhis2-configs/{config.pk}/test-connection/")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["status"] == "error"

    def test_connection_timeout(self, admin_client, sample_organization, mocker):
        import requests as http_requests

        from hmis.apps.core.models import DHIS2Config

        config = DHIS2Config(
            organization=sample_organization,
            name="Timeout Test",
            base_url="https://dhis2.example.org",
            username="admin",
        )
        config.set_password("pass")
        config.save()

        mocker.patch("requests.get", side_effect=http_requests.Timeout("timed out"))

        response = admin_client.post(f"/api/dhis2-configs/{config.pk}/test-connection/")
        assert response.status_code == status.HTTP_504_GATEWAY_TIMEOUT


# =============================================================================
# Facility API - dhis2_org_unit field presence
# =============================================================================


class TestFacilityDHIS2OrgUnitAPI:
    """Verify dhis2_org_unit appears in facility API responses."""

    def test_facility_detail_includes_dhis2_org_unit(self, authenticated_client, sample_facility):
        response = authenticated_client.get(f"/api/facilities/{sample_facility.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert "dhis2_org_unit" in response.data

    def test_facility_update_dhis2_org_unit(self, admin_client, sample_facility):
        response = admin_client.patch(
            f"/api/facilities/{sample_facility.pk}/",
            {"dhis2_org_unit": "j7gkBfmQ3aT"},
        )
        assert response.status_code == status.HTTP_200_OK
        sample_facility.refresh_from_db()
        assert sample_facility.dhis2_org_unit == "j7gkBfmQ3aT"
