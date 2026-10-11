# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test config envelopes; run `poetry run pytest tests/licensing/test_cloud_config_envelope.py`.

Uses the standard organization/facility fixtures and activation endpoint inputs.
"""

import uuid
from datetime import timedelta

import jwt
import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from hmis.apps.licensing.models import Installation
from hmis.apps.licensing.tokens import (
    ALGORITHM,
    CLOUD_CONFIG_AUDIENCE,
    ISSUER,
    build_cloud_config_payload,
    get_private_key,
    sign_cloud_config_envelope,
    sign_license_token,
    verify_cloud_config_envelope,
    verify_license_token,
)


@pytest.fixture
def active_installation(db, sample_organization, sample_facility):
    """An active tenant-bound installation for signing tests."""
    return Installation.objects.create(
        installation_id=f"cloud-config-{uuid.uuid4()}",
        organization=sample_organization,
        facility=sample_facility,
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
    )


@pytest.fixture
def pending_installation(db, sample_organization, sample_facility):
    """A pending installation with the activation code consumed by this module."""
    return Installation.objects.create(
        installation_id=f"pending-cloud-config-{uuid.uuid4()}",
        organization=sample_organization,
        facility=sample_facility,
        activation_code="CLOUD-CONFIG-ACTIVATION-CODE",
        status=Installation.Status.PENDING,
    )


@pytest.mark.django_db
@override_settings(
    CLOUD_API_BASE_URL="https://cloud.example.test/",
    SYNC_SERVER_URL="https://cloud.example.test/api/sync/",
    ENVIRONMENT="staging",
    DJANGO_SECRET_KEY="must-not-appear",
    SHA_CLIENT_SECRET="must-not-appear",
)
def test_cloud_config_envelope_has_a_distinct_audience_and_type(active_installation):
    """Configuration envelopes cannot be accepted as license tokens, or vice versa."""
    config_token = sign_cloud_config_envelope(build_cloud_config_payload(active_installation))
    license_token = sign_license_token(
        {"installation_id": str(active_installation.installation_id)}
    )

    decoded = verify_cloud_config_envelope(config_token)

    assert decoded["token_type"] == "cloud_config"
    assert decoded["aud"] == "vitora-hub-cloud-config"
    with pytest.raises(Exception):
        verify_license_token(config_token)
    with pytest.raises(Exception):
        verify_cloud_config_envelope(license_token)

    wrong_type = jwt.encode(
        {
            **build_cloud_config_payload(active_installation),
            "iss": ISSUER,
            "aud": CLOUD_CONFIG_AUDIENCE,
            "token_type": "license",
            "iat": int(timezone.now().timestamp()),
            "exp": int((timezone.now() + timedelta(minutes=5)).timestamp()),
        },
        get_private_key(),
        algorithm=ALGORITHM,
    )
    with pytest.raises(jwt.InvalidTokenError, match="type"):
        verify_cloud_config_envelope(wrong_type)


@pytest.mark.django_db
@override_settings(
    CLOUD_API_BASE_URL="https://cloud.example.test/",
    SYNC_SERVER_URL="https://cloud.example.test/api/sync/",
    ENVIRONMENT="staging",
)
def test_cloud_config_envelope_binds_environment_and_tenant(active_installation):
    """Envelope claims identify the cloud environment and only its activated tenant."""
    decoded = verify_cloud_config_envelope(
        sign_cloud_config_envelope(build_cloud_config_payload(active_installation))
    )

    assert decoded["environment"] == "staging"
    assert decoded["installation_id"] == str(active_installation.installation_id)
    assert decoded["organization_id"] == active_installation.organization_id
    assert decoded["facility_id"] == active_installation.facility_id
    with pytest.raises(Exception):
        verify_cloud_config_envelope(
            sign_cloud_config_envelope(build_cloud_config_payload(active_installation)),
            organization_id=active_installation.organization_id + 1,
        )


@pytest.mark.django_db
@override_settings(
    CLOUD_API_BASE_URL="https://cloud.example.test/",
    SYNC_SERVER_URL="https://cloud.example.test/api/sync/",
    ENVIRONMENT="production",
    DJANGO_SECRET_KEY="must-not-appear",
    SHA_CLIENT_SECRET="must-not-appear",
    ENCRYPTION_KEY="must-not-appear",
)
def test_cloud_config_envelope_excludes_secrets(active_installation):
    """Only the approved nonsecret cloud configuration claims are signed."""
    decoded = verify_cloud_config_envelope(
        sign_cloud_config_envelope(build_cloud_config_payload(active_installation))
    )

    assert decoded["cloud_api_base_url"] == "https://cloud.example.test"
    assert decoded["sync_server_url"] == "https://cloud.example.test/api/sync"
    assert "must-not-appear" not in str(decoded)


@pytest.mark.django_db
@override_settings(
    CLOUD_API_BASE_URL="https://cloud.example.test/",
    SYNC_SERVER_URL="https://cloud.example.test/api/sync/",
    ENVIRONMENT="staging",
)
def test_activation_returns_signed_cloud_config_envelope(api_client, pending_installation):
    """Activation bootstrap includes a verifiable envelope for the activating hub."""
    response = api_client.post(
        "/api/licensing/activate/",
        {
            "installation_id": "cloud-config-test-hub",
            "activation_code": pending_installation.activation_code,
            "eula_accepted": True,
            "eula_version": "2026-07-31",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert "cloud_config_envelope" in response.data
    decoded = verify_cloud_config_envelope(response.data["cloud_config_envelope"])
    assert decoded["installation_id"] == "cloud-config-test-hub"
    assert decoded["organization_id"] == pending_installation.organization_id
