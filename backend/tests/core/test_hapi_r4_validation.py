# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for authoritative HAPI FHIR R4 validation.

Run: ``poetry run pytest tests/core/test_hapi_r4_validation.py -q``.
Inputs: mocked HAPI FHIR client responses; no live HAPI service is required.
"""

from unittest.mock import Mock, patch

from hmis.apps.core.services.fhir_client import FHIRResponse
from hmis.apps.core.services.hapi_r4_validation import HAPIR4ValidationService


def _response(resource: dict) -> FHIRResponse:
    """Build a successful FHIR response fixture."""
    return FHIRResponse(success=True, status_code=200, resource=resource)


class TestHAPIR4ValidationService:
    """Ensure only HAPI R4 produces an authoritative validation pass."""

    @patch("hmis.apps.core.services.hapi_r4_validation.create_fhir_client")
    def test_hapi_r4_success_is_authoritative(self, create_client):
        client = Mock()
        client.get_capability_statement.return_value = _response({"fhirVersion": "4.0.1"})
        client.validate_resource.return_value = _response(
            {
                "resourceType": "OperationOutcome",
                "issue": [{"severity": "information", "code": "informational"}],
            }
        )
        create_client.return_value = client

        result = HAPIR4ValidationService().validate_resource(
            {"resourceType": "Patient", "name": [{"family": "Synthetic"}]}
        )

        assert result.local_valid is True
        assert result.authoritative is True
        assert result.is_valid is True
        assert result.status == "validated"
        client.validate_resource.assert_called_once()

    @patch("hmis.apps.core.services.hapi_r4_validation.create_fhir_client")
    def test_unreachable_hapi_never_falls_back_to_local_pass(self, create_client):
        client = Mock()
        client.get_capability_statement.side_effect = ConnectionError("HAPI unavailable")
        create_client.return_value = client

        result = HAPIR4ValidationService().validate_resource(
            {"resourceType": "Patient", "name": [{"family": "Synthetic"}]}
        )

        assert result.local_valid is True
        assert result.authoritative is False
        assert result.is_valid is False
        assert result.status == "not_authoritatively_validated"

    @patch("hmis.apps.core.services.hapi_r4_validation.create_fhir_client")
    def test_hapi_r4_errors_fail_validation(self, create_client):
        client = Mock()
        client.get_capability_statement.return_value = _response({"fhirVersion": "4.0.1"})
        client.validate_resource.return_value = _response(
            {
                "resourceType": "OperationOutcome",
                "issue": [{"severity": "error", "code": "required"}],
            }
        )
        create_client.return_value = client

        result = HAPIR4ValidationService().validate_resource(
            {"resourceType": "Patient", "name": [{"family": "Synthetic"}]}
        )

        assert result.authoritative is True
        assert result.is_valid is False
        assert result.status == "invalid"
