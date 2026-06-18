"""Tests for hub-mode cloud credential fallback authentication."""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import authenticate, get_user_model
from django.test import override_settings

pytestmark = pytest.mark.django_db


class TestHubCloudAuthFallback:
    """Cloud credentials should unlock local hub placeholders only in hub mode."""

    @override_settings(
        ENVIRONMENT="hub",
        SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
        HUB_CLOUD_AUTH_ENABLED=True,
    )
    def test_successful_cloud_auth_activates_placeholder(
        self,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        User = get_user_model()
        placeholder = User.objects.create(
            pk=909,
            username="cloud.nurse",
            email="cloud.nurse@example.com",
            is_active=False,
        )
        placeholder.set_unusable_password()
        placeholder.save()

        response = MagicMock(status_code=200)
        response.json.return_value = {
            "access": "cloud-access",
            "refresh": "cloud-refresh",
            "user": {
                "id": 909,
                "username": "cloud.nurse",
                "email": "cloud.nurse@example.com",
                "first_name": "Cloud",
                "last_name": "Nurse",
                "role": sample_role.code,
            },
        }

        with patch("hmis.apps.core.backends.requests.post", return_value=response) as post:
            user = authenticate(username="cloud.nurse", password="CorrectPass123!")

        assert user is not None
        assert user.pk == 909
        assert user.is_active is True
        assert user.check_password("CorrectPass123!") is True
        assert user.first_name == "Cloud"
        assert user.staff_profile.organization == sample_organization
        assert user.staff_profile.primary_facility == sample_facility
        post.assert_called_once()
        assert post.call_args.args[0] == "https://api.vitora.digital/api/auth/login/"
        assert post.call_args.kwargs["json"] == {
            "username": "cloud.nurse",
            "password": "CorrectPass123!",
        }

    @override_settings(
        ENVIRONMENT="production", SYNC_SERVER_URL="https://api.vitora.digital/api/sync"
    )
    def test_cloud_auth_not_attempted_outside_hub(self):
        with patch("hmis.apps.core.backends.requests.post") as post:
            user = authenticate(username="missing", password="CorrectPass123!")

        assert user is None
        post.assert_not_called()

    @override_settings(
        ENVIRONMENT="hub",
        SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
        HUB_CLOUD_AUTH_ENABLED=True,
    )
    def test_failed_cloud_auth_leaves_placeholder_inactive(self):
        User = get_user_model()
        placeholder = User.objects.create(username="cloud.fail", is_active=False)
        placeholder.set_unusable_password()
        placeholder.save()

        response = MagicMock(status_code=401)
        with patch("hmis.apps.core.backends.requests.post", return_value=response):
            user = authenticate(username="cloud.fail", password="WrongPass123!")

        placeholder.refresh_from_db()
        assert user is None
        assert placeholder.is_active is False
        assert placeholder.has_usable_password() is False

    @override_settings(
        ENVIRONMENT="hub",
        SYNC_SERVER_URL="https://api.vitora.digital/api/sync",
        HUB_CLOUD_AUTH_ENABLED=True,
    )
    def test_cloud_id_collision_does_not_overwrite_local_user(self):
        User = get_user_model()
        local_user = User.objects.create_user(
            pk=919,
            username="local.admin",
            password="LocalPass123!",
            is_active=True,
        )

        response = MagicMock(status_code=200)
        response.json.return_value = {
            "user": {
                "id": 919,
                "username": "cloud.admin",
                "email": "cloud.admin@example.com",
                "first_name": "Cloud",
                "last_name": "Admin",
            },
        }

        with patch("hmis.apps.core.backends.requests.post", return_value=response):
            user = authenticate(username="cloud.admin", password="CorrectPass123!")

        local_user.refresh_from_db()
        assert user is not None
        assert user.pk != local_user.pk
        assert user.username == "cloud.admin"
        assert local_user.username == "local.admin"
        assert local_user.check_password("LocalPass123!") is True
