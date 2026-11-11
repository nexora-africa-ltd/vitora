# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test the restricted, non-secret encryption status endpoint.

Run with: poetry run pytest tests/core/test_encryption_status_endpoint.py --no-cov
Inputs: authenticated API client and Django security settings.
"""

from unittest.mock import Mock, patch

import pytest
from django.contrib.auth.models import Permission
from rest_framework import status


@pytest.mark.django_db
class TestEncryptionStatusEndpoint:
    """Certification-safe encryption posture must be visible only to administrators."""

    def test_rejects_anonymous_requests(self, api_client):
        response = api_client.get("/api/core/security/encryption-status/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_rejects_non_administrator(self, authenticated_client):
        response = authenticated_client.get("/api/core/security/encryption-status/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_rejects_staff_without_evidence_permission(self, authenticated_client):
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        authenticated_client.force_authenticate(user=user)

        response = authenticated_client.get("/api/core/security/encryption-status/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @patch("hmis.apps.core.views_encryption_status.get_kms_provider")
    def test_returns_non_secret_encryption_posture(self, mock_provider, authenticated_client):
        user = authenticated_client.handler._force_user
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        permission = Permission.objects.get(codename="view_encryption_evidence")
        user.user_permissions.add(permission)
        authenticated_client.force_authenticate(user=user)
        mock_provider.return_value = Mock(is_healthy=Mock(return_value=True))
        mock_provider.return_value.__class__.__name__ = "AzureKeyVaultProvider"

        response = authenticated_client.get("/api/core/security/encryption-status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "healthy"
        assert response.data["kms"] == {
            "status": "healthy",
            "provider": "AzureKeyVaultProvider",
        }
        assert response.data["field_encryption"]["legacy"] == "Fernet AES-128-CBC + HMAC-SHA256"
        assert response.data["field_encryption"]["current"] == "AES-256-GCM"
        assert response.data["transport"]["minimum_tls_version"] == "1.2"
        assert response.data["backups"]["encryption_required"] is True
        assert "ENCRYPTION_KEY" not in str(response.data)
        assert "PII_HMAC_KEY" not in str(response.data)
