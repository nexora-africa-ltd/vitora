# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test the read-only SEC-INT-001 DHA integrity-evidence endpoint.

Run with: poetry run pytest tests/core/test_data_integrity_status_endpoint.py --no-cov
Inputs: standard authenticated and unauthenticated API-client fixtures.
"""

import pytest
from django.contrib.auth.models import Permission
from rest_framework import status


@pytest.mark.django_db
class TestDataIntegrityStatusEndpoint:
    """SEC-INT-001 evidence must be safe, explicit, and permission-gated."""

    url = "/api/core/security/data-integrity-status/"

    def test_rejects_anonymous_requests(self, api_client):
        """Anonymous callers must not receive certification posture details."""
        response = api_client.get(self.url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_rejects_authenticated_user_without_permission(self, authenticated_client):
        """A normal authenticated account must not receive platform evidence."""
        response = authenticated_client.get(self.url)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_allows_evidence_reader_with_dedicated_permission(self, authenticated_client):
        """The non-staff DHA reader may view sanitized integrity evidence."""
        user = authenticated_client.handler._force_user
        permission = Permission.objects.get(codename="view_data_integrity_evidence")
        user.user_permissions.add(permission)

        response = authenticated_client.get(self.url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["control_id"] == "SEC-INT-001"
        assert response.data["validation"]["future_date_of_birth_rejected"] is True
        assert response.data["validation"]["malformed_national_id_rejected"] is True
        assert response.data["validation"]["negative_clinical_measurement_rejected"] is True
        assert (
            response.data["file_integrity"]["sha256_calculated_on_claim_attachment_upload"] is True
        )
        assert response.data["digital_signatures"]["verification_detects_modified_content"] is True
        assert response.data["referential_integrity"]["database_foreign_keys_enforced"] is True
        assert response.data["limitations"]["does_not_create_or_modify_records"] is True
        assert "DATABASE_URL" not in str(response.data)
        assert "PRIVATE_KEY" not in str(response.data)
