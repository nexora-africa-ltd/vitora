# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test TLS enforcement for external HL7/MLLP laboratory connections.

Run with: poetry run pytest tests/laboratory/test_hl7_transport_security.py --no-cov
Inputs: Django HL7/MLLP settings overridden per test.
"""

import pytest
from django.test import override_settings

from hmis.apps.laboratory.services.hl7_integration import HL7IntegrationConfig


class TestHL7TransportSecurity:
    """External laboratory connections must not send clinical messages in plaintext."""

    @override_settings(
        HL7_INTEGRATION_ENABLED=True, MLLP_HOST="lis.example.test", MLLP_USE_SSL=False
    )
    def test_rejects_plaintext_external_mllp(self):
        with pytest.raises(ValueError, match="TLS"):
            HL7IntegrationConfig.from_settings()

    @override_settings(
        HL7_INTEGRATION_ENABLED=True,
        MLLP_HOST="lis.example.test",
        MLLP_USE_SSL=True,
        MLLP_SSL_VERIFY=True,
    )
    def test_accepts_verified_tls_external_mllp(self):
        config = HL7IntegrationConfig.from_settings()

        assert config.mllp_use_ssl is True
        assert config.mllp_ssl_verify is True

    @override_settings(HL7_INTEGRATION_ENABLED=True, MLLP_HOST="127.0.0.1", MLLP_USE_SSL=False)
    def test_allows_plaintext_loopback_mllp_for_local_development(self):
        config = HL7IntegrationConfig.from_settings()

        assert config.mllp_use_ssl is False
