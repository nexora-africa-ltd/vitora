"""
SHA (Social Health Authority) Claims Integration Stub.

This is a stub implementation for SHA claims submission.
The full implementations are in:
- sha_claims.py (SHAClaimsService — FHIR-based claim lifecycle)
- sha_eligibility.py (SHAEligibilityService — real eligibility checks)

This module is retained for backward compatibility with test_sha_stub.py
and as a lightweight fallback when full SHA configuration is not available.

Reference: Deliverables spec § 11 "SHA Claims Stub (Future Integration)"
"""

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone


class SHAEligibilityService:
    """
    SHA eligibility verification stub.

    For production use, see ``billing.services.sha_eligibility.SHAEligibilityService``
    which connects to the live SHA API.  This stub provides offline-safe
    responses based on local member data.
    """

    def __init__(self):
        """Initialize SHA Eligibility Service (stub mode)."""
        self.is_stub = True

    def verify_eligibility(self, sha_member) -> dict[str, Any]:
        """
        Verify eligibility for a SHA member using local data.

        Args:
            sha_member: SHAMember object to verify

        Returns:
            Dict with eligibility verification result
        """
        is_eligible = (
            sha_member.status == "active"
            and sha_member.coverage_end_date
            and sha_member.coverage_end_date >= timezone.now().date()
        )

        return {
            "is_eligible": is_eligible,
            "result": "eligible" if is_eligible else "ineligible",
            "eligible_until": sha_member.coverage_end_date,
            "benefit_balance": Decimal("50000.00") if is_eligible else None,
            "ineligibility_reason": "" if is_eligible else "Coverage expired or inactive",
            "error_code": None,
            "error_message": None,
        }


class SHAClaimsService:
    """
    SHA claims integration stub.

    For production use, see ``billing.services.sha_claims.SHAClaimsService``
    which builds FHIR R4 bundles and submits to the SHA API.  This stub
    returns mock responses for testing and offline scenarios.
    """

    def __init__(self):
        """Initialize SHA Claims Service (stub mode)."""
        self.is_stub = True

    def submit_claim(self, invoice) -> dict[str, Any]:
        """
        Submit claim to SHA (stub — returns mock response).

        Args:
            invoice: Invoice object to submit claim for

        Returns:
            Dict with claim submission response
        """
        return {
            "success": True,
            "claim_number": f"SHA-STUB-{invoice.invoice_number}",
            "status": "pending_review",
            "message": "Stub: Claim submitted for review",
            "submitted_at": timezone.now().isoformat(),
        }

    def query_claim_status(self, claim_number: str) -> dict[str, Any]:
        """
        Query claim status (stub — returns mock approved response).

        Args:
            claim_number: SHA claim number to query

        Returns:
            Dict with claim status information
        """
        return {
            "claim_number": claim_number,
            "status": "approved",
            "approved_amount": Decimal("1000.00"),
            "message": "Stub: Claim approved",
        }

    def get_preauthorization(self, patient_id: str, service_codes: list[str]) -> dict[str, Any]:
        """
        Get preauthorization for services (stub — returns mock approval).

        Args:
            patient_id: Patient MRN or identifier
            service_codes: List of SHA service codes to preauthorize

        Returns:
            Dict with preauthorization information
        """
        return {
            "preauth_number": f"PA-STUB-{patient_id[:8]}",
            "status": "approved",
            "valid_until": (timezone.now() + timedelta(days=30)).isoformat(),
            "approved_services": service_codes,
        }
