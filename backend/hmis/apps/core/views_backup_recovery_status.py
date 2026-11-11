# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Expose non-secret SEC-BCK-001 backup and disaster-recovery evidence.

Use via ``GET /api/core/security/backup-recovery-status/`` with a platform
staff account granted ``core.view_backup_recovery_evidence``. The endpoint is
read-only: it never lists backup objects, starts restores, or exposes recovery
credentials, keys, locations, or backup payloads.
"""

from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.permissions import BackupRecoveryEvidencePermission


class BackupRecoveryStatusView(APIView):
    """Return the approved BCK-001 policy and latest verified drill metadata."""

    permission_classes = [BackupRecoveryEvidencePermission]

    def get(self, _request):
        """Return certification-safe backup and recovery control evidence."""
        return Response(
            {
                "control_id": "SEC-BCK-001",
                "backup_schedule": {
                    "frequency": "daily",
                    "scheduled_time_utc": "02:00",
                    "retention_days": 30,
                    "scope": "production PostgreSQL database and restore metadata",
                },
                "offsite_storage": {
                    "provider": "Azure Blob Storage",
                    "separate_from_application_runtime": True,
                    "private_access_required": True,
                    "server_side_encryption_required": True,
                    "transport_tls_minimum": "1.2",
                },
                "backup_protection": {
                    "application_encryption_required": True,
                    "application_encryption_algorithm": "GPG AES-256",
                    "integrity_check_required": "SHA-256",
                },
                "recovery_objectives": {
                    "rto_hours": 4,
                    "rpo_hours": 24,
                },
                "restore_validation": {
                    "frequency": "monthly",
                    "isolated_environment_required": True,
                    "checksum_verification_required": True,
                },
                "latest_verified_restore_drill": {
                    "evidence_environment": "production",
                    "completed_at": "2026-11-11T19:10:26Z",
                    "workflow_run_id": "43084560711",
                    "result": "success",
                    "verified_steps": [
                        "decrypt encrypted backup",
                        "verify SHA-256 checksum",
                        "restore into isolated PostgreSQL",
                        "verify restored migration metadata",
                    ],
                },
                "staging_validation": {
                    "backup_workflow": "Staging Daily Database Backup",
                    "restore_drill_workflow": "Staging Monthly Restore Drill",
                    "backup_container": "staging-db-backups",
                    "status": "pending_first_successful_drill",
                    "evidence_requirement": (
                        "Record the successful staging backup artifact and isolated "
                        "restore-drill result before claiming staging operational validation."
                    ),
                },
                "limitations": {
                    "does_not_trigger_backup_or_restore": True,
                    "does_not_expose_backup_inventory_or_contents": True,
                    "does_not_expose_credentials_or_encryption_material": True,
                },
            }
        )
