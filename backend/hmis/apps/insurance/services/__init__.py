"""Insurance services package.

Public API:
    - ``get_adapter(config)`` — resolve the correct adapter for a provider
    - ``InsuranceClaimsService`` — claim submission and status polling
    - ``InsuranceEligibilityService`` — eligibility verification
    - ``InsurancePreauthService`` — preauth lifecycle
    - ``InsuranceRemittanceService`` — remittance fetch and reconciliation
    - ``InsuranceExportService`` — CSV export for manual submission
    - ``InsuranceHttpClient`` — low-level HTTP client with audit logging
    - ``InsuranceApiAdapter`` — abstract base for adapter implementations
    - ``INSURANCE_ADAPTERS`` — adapter registry dict
"""
