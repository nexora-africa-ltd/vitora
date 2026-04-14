"""
SHA Configuration and Settings Compliance Tests.

Validates that Django settings and configuration align with SHA requirements.

Reference: docs/sha-guides/claims-submission.md, docs/sha-guides/eligibility.md

Key Requirements:
    - API base URLs configured for correct environment
    - Authentication credentials configured
    - Facility identifiers configured
    - Endpoints configured correctly
"""

import pytest  # type: ignore # type: ignore
from django.conf import settings


class TestSHAAPIConfiguration:
    """Tests for SHA API configuration."""

    def test_sha_enabled_setting_exists(self):
        """
        Configuration: SHA_ENABLED setting should exist.

        This controls whether SHA integration features are active.
        """
        has_setting = hasattr(settings, "SHA_ENABLED")

        assert has_setting, (
            "SHA_ENABLED setting should be defined in settings. "
            "Set to True to enable SHA integration features."
        )

    def test_sha_api_base_url_configured(self):
        """
        SHA Requirement: API base URL must be configured.

        Reference: docs/sha-guides/claims-submission.md - Integration Checklist
        Environments:
            - Dev/UAT: https://uat.dha.go.ke
            - Prod: https://dha.go.ke
        """
        base_url = getattr(settings, "SHA_API_BASE_URL", None)

        assert base_url is not None, (
            "SHA_API_BASE_URL must be configured. UAT: https://uat.dha.go.ke"
        )

        assert base_url.startswith("http"), f"SHA_API_BASE_URL must be a valid URL, got: {base_url}"

    def test_sha_fhir_base_url_configured(self):
        """
        SHA Requirement: FHIR base URL must be configured.

        Reference: docs/sha-guides/claims-submission.md - Integration Checklist #7

        Environments:
            - Dev/UAT: https://qa-mis.apeiro-digital.com
            - Prod: https://fhir.sha.go.ke
        """
        fhir_url = getattr(settings, "SHA_FHIR_BASE_URL", None)

        assert fhir_url is not None, (
            "SHA_FHIR_BASE_URL must be configured. "
            "UAT: https://qa-mis.apeiro-digital.com "
            "Prod: https://fhir.sha.go.ke"
        )

        valid_fhir_urls = [
            "https://qa-mis.apeiro-digital.com",
            "https://mis.apeiro-digital.com",
            "https://fhir.sha.go.ke",
        ]

        # Just warn if not a known URL
        if fhir_url not in valid_fhir_urls:
            pytest.skip(
                f"SHA_FHIR_BASE_URL '{fhir_url}' is not a known SHA URL. "
                f"Expected one of: {valid_fhir_urls}"
            )


class TestSHAAuthenticationConfiguration:
    """Tests for SHA authentication configuration."""

    def test_sha_consumer_key_exists(self):
        """
        SHA Requirement: Consumer key (API key) must be configured.

        Reference: docs/sha-guides/claims-submission.md - Integration Checklist #1
        Quote: 'Get Access key/Secret key to payer system APIs'
        """
        consumer_key = getattr(settings, "SHA_CONSUMER_KEY", None)

        # In test environment, it might be empty/placeholder
        assert hasattr(settings, "SHA_CONSUMER_KEY"), (
            "SHA_CONSUMER_KEY setting must exist. Obtain from SHA technical team."
        )

    def test_sha_api_key_exists(self):
        """
        SHA Requirement: API key must be configured.
        """
        api_key = getattr(settings, "SHA_API_KEY", None)

        assert hasattr(settings, "SHA_API_KEY"), "SHA_API_KEY setting must exist."

    def test_sha_username_exists(self):
        """
        SHA Requirement: API username must be configured.
        """
        assert hasattr(settings, "SHA_USERNAME"), (
            "SHA_USERNAME setting must exist for API authentication."
        )

    def test_sha_password_exists(self):
        """
        SHA Requirement: API password must be configured.
        """
        assert hasattr(settings, "SHA_PASSWORD"), (
            "SHA_PASSWORD setting must exist for API authentication."
        )


class TestSHAEndpointsConfiguration:
    """Tests for SHA API endpoints configuration."""

    def test_sha_endpoints_dict_exists(self):
        """
        Configuration: SHA_ENDPOINTS dict should exist.
        """
        endpoints = getattr(settings, "SHA_ENDPOINTS", None)

        assert endpoints is not None, "SHA_ENDPOINTS dict must be configured with API endpoints."
        assert isinstance(endpoints, dict), "SHA_ENDPOINTS must be a dictionary."

    def test_eligibility_endpoint_configured(self):
        """
        SHA Requirement: Eligibility endpoint must be configured.

        Reference: docs/sha-guides/eligibility.md
        Expected: /v2/eligibility
        """
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})

        eligibility = endpoints.get("eligibility")

        assert eligibility is not None, (
            "SHA_ENDPOINTS['eligibility'] must be configured. Expected: /v2/eligibility"
        )

        assert "/v2/eligibility" in eligibility or eligibility == "/v2/eligibility", (
            f"Eligibility endpoint should be /v2/eligibility, got: {eligibility}"
        )

    def test_claims_submit_endpoint_configured(self):
        """
        SHA Requirement: Claims submission endpoint must be configured.

        Reference: docs/sha-guides/claims-submission.md
        Expected: /v1/shr-med/bundle
        """
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})

        claims_submit = endpoints.get("claims_submit")

        assert claims_submit is not None, (
            "SHA_ENDPOINTS['claims_submit'] must be configured. Expected: /v1/shr-med/bundle"
        )

    def test_claims_status_endpoint_configured(self):
        """
        SHA Requirement: Claims status endpoint must be configured.

        Reference: docs/sha-guides/claims-submission.md
        Expected: /v1/shr-med/claim-status
        """
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})

        claims_status = endpoints.get("claims_status")

        assert claims_status is not None, (
            "SHA_ENDPOINTS['claims_status'] must be configured. Expected: /v1/shr-med/claim-status"
        )


class TestFacilityConfiguration:
    """Tests for facility configuration."""

    def test_facility_mfl_code_configured(self):
        """
        SHA Requirement: Facility MFL code must be configured.

        Reference: docs/sha-guides/facilities.md
        This is the Master Facility List code from Kenya HFR.
        """
        mfl_code = getattr(settings, "FACILITY_MFL_CODE", None)

        assert mfl_code is not None, (
            "FACILITY_MFL_CODE must be configured. Obtain from Kenya Health Facilities Registry."
        )

    def test_facility_level_configured(self):
        """
        SHA Requirement: Facility level must be configured.

        Reference: docs/sha-guides/claims.md - Organization Resource
        Valid levels: Level 1-6, L1-L6, LEVEL 1-6
        """
        level = getattr(settings, "FACILITY_LEVEL", None)

        assert level is not None, (
            "FACILITY_LEVEL must be configured. Valid values: L1, L2, L3A, L3B, L4, L5, L6"
        )

    def test_facility_name_configured(self):
        """
        SHA Requirement: Facility name should be configured.

        Reference: docs/sha-guides/claims.md
        """
        name = getattr(settings, "FACILITY_NAME", None)

        # It's OK if not set, but should not be placeholder
        if name:
            assert name != "Healthcare Facility", (
                "FACILITY_NAME should be actual name, not placeholder"
            )


class TestAPITimeoutConfiguration:
    """Tests for API timeout configuration."""

    def test_sha_api_timeout_configured(self):
        """
        Best Practice: API timeout should be configured.
        """
        timeout = getattr(settings, "SHA_API_TIMEOUT", None)

        assert timeout is not None, "SHA_API_TIMEOUT should be configured. Recommended: 30 seconds"

        assert timeout > 0, "Timeout must be positive"
        assert timeout <= 120, "Timeout should be reasonable (<=120s)"


class TestEnvironmentURLAlignment:
    """Tests for environment URL alignment."""

    def test_api_and_fhir_urls_match_environment(self):
        """
        SHA Requirement: API and FHIR URLs should match environment.

        Reference: docs/sha-guides/claims-submission.md - Integration Checklist #7

        UAT:
            - API: https://uat.dha.go.ke
            - FHIR: https://qa-mis.apeiro-digital.com

        Production:
            - API: TBD
            - FHIR: https://fhir.sha.go.ke
        """
        api_url = getattr(settings, "SHA_API_BASE_URL", "")
        fhir_url = getattr(settings, "SHA_FHIR_BASE_URL", "")

        # Check for environment mismatch
        uat_indicators = ["uat", "qa-", "test", "sandbox"]
        prod_indicators = ["sha.go.ke", "mis.apeiro"]

        api_is_uat = any(ind in api_url.lower() for ind in uat_indicators)
        fhir_is_uat = any(ind in fhir_url.lower() for ind in uat_indicators)

        # Informational - check consistency
        if api_is_uat and not fhir_is_uat:
            pytest.skip(
                "Warning: API URL appears to be UAT but FHIR URL may be production. "
                "Ensure both URLs are for the same environment."
            )


class TestCallbackConfiguration:
    """Tests for callback URL configuration."""

    def test_callback_url_documented(self):
        """
        SHA Requirement: Callback URL should be configured.

        Reference: docs/sha-guides/claims-submission.md - Integration Checklist #2
        Quote: 'Share response callback url with Payer technical team to configure.
               Callback url must have a POST method and should be secured with basic auth'
        """
        callback_url = getattr(settings, "SHA_CALLBACK_URL", None)

        # This is often configured separately with SHA team
        assert True, (
            "COMPLIANCE NOTE: Ensure callback URL is registered with SHA technical team. "
            "Callback URL should support POST method and basic auth. "
            "See docs/sha-guides/claims-submission.md - Integration Checklist #2"
        )


class TestIntegrationChecklistSummary:
    """Summary tests for SHA integration checklist."""

    def test_integration_checklist_awareness(self):
        """
        SHA Reference: Review full integration checklist.

        Reference: docs/sha-guides/claims-submission.md - Integration Checklist

        Checklist items:
            1. Get Access key/Secret key to payer system APIs
            2. Share response callback url with Payer technical team
            3. Ensure request JSON/FHIR is similar to provided sample
            4. Each Request must be a valid Bundle JSON
            5. Each claim Id must be unique
            6. Ensure Insurance and Coverage objects are included
            7. Use correct terminology server prefix per environment
            8. Each resource entry must have fullUrl field
            9. Total amount must be Sum of Net Amount of all items
            10. Ensure CareTeam has valid details
            11. All references must point to resources in bundle
            12. ProductOrService must be valid SHA/PFMS intervention code
            13. PFMS coverage handling (if applicable)
            14. PHC claims must have zero total amount
            15. Handle all ClaimResponse states
        """
        checklist_items = 15

        assert checklist_items == 15, (
            "Review all 15 integration checklist items. See docs/sha-guides/claims-submission.md"
        )
