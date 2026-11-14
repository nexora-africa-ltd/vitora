# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Authoritative HAPI FHIR R4 validation service.

Use: import ``HAPIR4ValidationService`` from controlled release tooling.
Inputs: a FHIR resource dictionary; configuration uses HAPI_FHIR_BASE_URL and
HAPI_FHIR_TIMEOUT. This service must not be invoked on routine FHIR GET paths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from hmis.apps.core.services.fhir_client import create_fhir_client
from hmis.apps.core.services.fhir_validator import FHIRValidator

HAPI_R4_VERSION = "4.0.1"
INVALID_SEVERITIES = {"error", "fatal"}


@dataclass
class HAPIR4ValidationResult:
    """Validation state for one resource and its HAPI OperationOutcome."""

    resource_type: str
    local_valid: bool
    authoritative: bool
    is_valid: bool
    status: str
    local_errors: list[dict[str, Any]] = field(default_factory=list)
    operation_outcome: dict[str, Any] | None = None
    detail: str = ""


class HAPIR4ValidationService:
    """
    Run local screening then require HAPI FHIR R4 `$validate`.

    A local pass never becomes an authoritative pass. If HAPI cannot be
    reached or does not identify itself as FHIR R4 4.0.1, the result is
    ``not_authoritatively_validated`` and evidence generation must fail.
    """

    def __init__(self, *, local_validator: FHIRValidator | None = None):
        """Initialize the local structural preflight validator."""
        self.local_validator = local_validator or FHIRValidator()

    def validate_resource(self, resource: dict[str, Any]) -> HAPIR4ValidationResult:
        """Validate one resource against HAPI's FHIR R4 4.0.1 validator."""
        resource_type = str(resource.get("resourceType") or "")
        local_result = self.local_validator.validate_resource(resource)
        local_errors = [error.to_dict() for error in local_result.errors]
        if not local_result.is_valid:
            return HAPIR4ValidationResult(
                resource_type=resource_type,
                local_valid=False,
                authoritative=False,
                is_valid=False,
                status="local_preflight_failed",
                local_errors=local_errors,
                detail="Local structural preflight failed; HAPI validation was not attempted.",
            )

        client = create_fhir_client(
            settings.HAPI_FHIR_BASE_URL,
            timeout=settings.HAPI_FHIR_TIMEOUT,
        )
        try:
            capability = client.get_capability_statement()
            fhir_version = (capability.resource or {}).get("fhirVersion")
            if not capability.success or fhir_version != HAPI_R4_VERSION:
                return HAPIR4ValidationResult(
                    resource_type=resource_type,
                    local_valid=True,
                    authoritative=False,
                    is_valid=False,
                    status="not_authoritatively_validated",
                    detail=(
                        "Configured HAPI validator is unavailable or does not report "
                        f"FHIR R4 {HAPI_R4_VERSION}."
                    ),
                )

            response = client.validate_resource(resource_type, resource)
            outcome = response.resource or {}
            issues = outcome.get("issue", []) if isinstance(outcome, dict) else []
            has_invalid_issue = any(
                issue.get("severity") in INVALID_SEVERITIES
                for issue in issues
                if isinstance(issue, dict)
            )
            is_valid = response.success and not has_invalid_issue
            return HAPIR4ValidationResult(
                resource_type=resource_type,
                local_valid=True,
                authoritative=True,
                is_valid=is_valid,
                status="validated" if is_valid else "invalid",
                operation_outcome=outcome if isinstance(outcome, dict) else None,
                detail="" if is_valid else response.get_error_message(),
            )
        except Exception as exc:  # noqa: BLE001 - HAPI is an external validation boundary
            return HAPIR4ValidationResult(
                resource_type=resource_type,
                local_valid=True,
                authoritative=False,
                is_valid=False,
                status="not_authoritatively_validated",
                detail=f"HAPI R4 validation could not be completed: {type(exc).__name__}.",
            )
        finally:
            client.close()
