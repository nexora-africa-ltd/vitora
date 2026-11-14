# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Expose non-secret SEC-INT-001 data-validation and integrity evidence.

Use via ``GET /api/core/security/data-integrity-status/`` with an authenticated
DHA evidence-reader session granted ``core.view_data_integrity_evidence``.
The response is read-only and describes implemented controls; it neither
creates test data nor returns clinical, cryptographic, database, or file data.
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.permissions import DataIntegrityEvidencePermission


class DataIntegrityStatusView(APIView):
    """Return certification-safe SEC-INT-001 evidence for implemented controls."""

    permission_classes = [DataIntegrityEvidencePermission]

    def get(self, _request):
        """Return read-only metadata for validation and integrity mechanisms."""
        return Response(
            {
                "control_id": "SEC-INT-001",
                "validation": {
                    "future_date_of_birth_rejected": True,
                    "malformed_national_id_rejected": True,
                    "negative_clinical_measurement_rejected": True,
                    "national_id_format": "7 or 8 legacy decimal digits, or 14-digit Maisha Namba",
                    "cross_field_validation_enforced": True,
                    "duplicate_patient_detection_enforced": True,
                    "api_validation_failure_status": 400,
                },
                "file_integrity": {
                    "sha256_calculated_on_claim_attachment_upload": True,
                    "checksum_persisted_with_attachment": True,
                    "allowed_content_types": [
                        "application/pdf",
                        "image/jpeg",
                        "image/png",
                        "image/tiff",
                    ],
                    "maximum_attachment_size_bytes": 10 * 1024 * 1024,
                },
                "digital_signatures": {
                    "enabled": True,
                    "algorithm": "RSA PKCS#1 v1.5 with SHA-256",
                    "certificate_model": "X.509 user certificate",
                    "verification_detects_modified_content": True,
                    "verification_checks_certificate_status": True,
                    "signed_document_types": [
                        "LabResult",
                        "Prescription",
                        "Discharge",
                        "RadiologyReport",
                        "DiagnosticReport",
                        "SickNote",
                        "ClinicalReferral",
                        "SHAClaimAttachment",
                    ],
                },
                "referential_integrity": {
                    "database_foreign_keys_enforced": True,
                    "unique_constraints_enforced": True,
                    "transactional_integrity_enforced": True,
                    "examples": [
                        "organization-scoped patient identification uniqueness",
                        "one active admission per occupied bed",
                        "foreign-key relationships for patient clinical records",
                    ],
                },
                "automated_evidence": {
                    "validation_test_suite": "tests/patients/test_patient_api.py",
                    "constraint_test_suite": "tests/infrastructure/test_integrity_constraints.py",
                    "signature_test_suite": "tests/core/test_digital_signatures.py",
                    "attachment_checksum_test_suite": (
                        "tests/billing/test_models/test_sha_claim_attachment.py"
                    ),
                },
                "limitations": {
                    "does_not_create_or_modify_records": True,
                    "does_not_execute_validation_test_payloads": True,
                    "does_not_return_patient_data": True,
                    "does_not_return_file_contents_or_checksums": True,
                    "does_not_return_certificate_private_material": True,
                    "does_not_expose_database_credentials_or_schema": True,
                },
            }
        )
