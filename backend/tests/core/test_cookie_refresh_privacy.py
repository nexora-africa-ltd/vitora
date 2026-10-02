# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Exercise cookie refresh rotation and revocation with real JWTs.

Run: poetry run pytest tests/core/test_cookie_refresh_privacy.py --no-cov
Inputs: Django test settings and the test_user fixture; no live services.
"""

import pytest
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.tokens import RefreshToken

from hmis.apps.core.cookie_auth import CookieRefreshView


def refresh_cookie(token):
    request = APIRequestFactory().post("/api/auth/refresh/")
    request.COOKIES["vitora_refresh"] = token
    return CookieRefreshView.as_view()(request)


@pytest.mark.django_db
def test_refresh_rotates_cookie_and_rejects_replay(test_user):
    original = str(RefreshToken.for_user(test_user))
    response = refresh_cookie(original)
    assert response.status_code == 200
    assert response.data == {"refreshed": True}
    replacement = response.cookies["vitora_refresh"].value
    assert replacement != original
    assert response.cookies["vitora_refresh"]["httponly"]
    assert refresh_cookie(original).status_code == 401
    assert refresh_cookie(replacement).status_code == 200


@pytest.mark.django_db
def test_disabled_user_cannot_refresh_existing_cookie(test_user):
    original = str(RefreshToken.for_user(test_user))
    test_user.is_active = False
    test_user.save(update_fields=["is_active"])
    response = refresh_cookie(original)
    assert response.status_code == 401
    assert response.cookies["vitora_refresh"]["max-age"] == 0


@pytest.mark.django_db
def test_invalid_cookie_is_cleared():
    response = refresh_cookie("not-a-valid-token")
    assert response.status_code == 401
    assert response.cookies["vitora_access"]["max-age"] == 0
    assert response.cookies["vitora_refresh"]["max-age"] == 0


@pytest.mark.django_db
def test_rotation_disabled_does_not_extend_refresh_cookie(test_user, mocker):
    # SimpleJWT serializers retain their imported settings object; configure
    # that object rather than override_settings replacing the module global.
    mocker.patch("rest_framework_simplejwt.serializers.api_settings.ROTATE_REFRESH_TOKENS", False)
    original = str(RefreshToken.for_user(test_user))
    response = refresh_cookie(original)
    assert response.status_code == 200
    assert "vitora_access" in response.cookies
    assert "vitora_refresh" not in response.cookies
    RefreshToken(original)  # No blacklist side effect when rotation is disabled.
