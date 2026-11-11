# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Expose a restricted, non-secret encryption posture for certification review.

Use via ``GET /api/core/security/encryption-status/`` with an authenticated
DHA evidence-reader session granted the dedicated permission. The response deliberately excludes keys,
connection strings, certificate material, and patient data.
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.kms import get_kms_provider
from hmis.apps.core.permissions import EncryptionEvidencePermission


class EncryptionStatusView(APIView):
    """Return the active encryption capability without exposing secrets."""

    permission_classes = [EncryptionEvidencePermission]

    def get(self, _request):
        """Return the runtime KMS health and configured encryption requirements."""
        try:
            provider = get_kms_provider()
            kms = {
                "status": "healthy" if provider.is_healthy() else "unhealthy",
                "provider": provider.__class__.__name__,
            }
        except (ImportError, OSError, RuntimeError, ValueError):
            kms = {"status": "unavailable", "provider": None}

        return Response(
            {
                "status": kms["status"],
                "kms": kms,
                "field_encryption": {
                    "legacy": "Fernet AES-128-CBC + HMAC-SHA256",
                    "current": "AES-256-GCM",
                    "organization_scoped_current_path": bool(
                        settings.ORGANIZATION_PII_ENCRYPTION_ENABLED
                    ),
                },
                "transport": {
                    "public_https_required": bool(getattr(settings, "SECURE_SSL_REDIRECT", False)),
                    "minimum_tls_version": "1.2",
                    "database_tls_required": bool(
                        settings.DATABASES["default"].get("OPTIONS", {}).get("sslmode")
                        in {"require", "verify-ca", "verify-full"}
                        or getattr(settings, "ENVIRONMENT", "") == "production"
                    ),
                    "external_mllp_tls_required": bool(
                        getattr(settings, "MLLP_USE_SSL", False)
                        and getattr(settings, "MLLP_SSL_VERIFY", False)
                    ),
                },
                "backups": {
                    "encryption_required": bool(
                        getattr(settings, "BACKUP_ENCRYPTION_REQUIRED", True)
                    ),
                    "algorithm": "GPG AES-256",
                },
                "media_storage": {
                    "backend": getattr(settings, "MEDIA_BACKEND", "local"),
                    "provider_managed_encryption_evidence_required": True,
                },
            }
        )
