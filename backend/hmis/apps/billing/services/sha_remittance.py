"""
SHA Remittance Service for Vitora HMIS.

Implements the DHA HIE Remittance Process:
1. GET /api/v1/claims/remittances → list of payment batches
2. GET /api/v1/claims/remittances/{bank_reference}/claims → claims paid per batch

Reference: https://hie-docs.dha.go.ke/docs/claims/process/remittances
"""

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.utils import timezone

from hmis.apps.billing.models import SHAClaim, SHARemittance, SHARemittanceLine
from hmis.apps.billing.services.sha_auth import SHAAuthService

logger = logging.getLogger(__name__)


class SHARemittanceError(Exception):
    """Raised when remittance operations fail."""

    def __init__(self, message: str, code: str = "remittance_error", details: dict | None = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


class SHARemittanceService:
    """
    Service for fetching and reconciling SHA remittances.

    Pulls payment data from DHA HIE and reconciles against local claims.
    """

    def __init__(self):
        """Initialize with DHA auth and API config."""
        self.auth_service = SHAAuthService()
        auth_mode = self.auth_service.auth_mode
        if auth_mode == "ilm":
            self.api_base_url = self.auth_service.auth_base_url.rstrip("/")
        else:
            self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = settings.SHA_API_TIMEOUT

    def fetch_remittances(self, facility_code: str, facility=None) -> list[SHARemittance]:
        """
        Fetch remittances from DHA for a facility.

        Calls GET /api/v1/claims/remittances with facility_id and facility_id_type.
        Creates/updates SHARemittance records for each new remittance.

        Args:
            facility_code: MFL facility code (fr-code type).
            facility: Facility instance for scoping.

        Returns:
            List of SHARemittance objects (new or existing).

        Raises:
            SHARemittanceError: If the API call fails.
        """
        endpoint = f"{self.api_base_url}/api/v1/claims/remittances"
        params = {
            "facility_id": facility_code,
            "facility_id_type": "fr-code",
        }

        try:
            import requests

            headers = self._get_auth_headers()
            response = requests.get(endpoint, params=params, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            raise SHARemittanceError(
                f"Failed to fetch remittances from DHA: {e}",
                code="fetch_failed",
            ) from e

        # Process response — expected: list of remittance objects
        remittances_data = data if isinstance(data, list) else data.get("remittances", [])
        results = []

        for item in remittances_data:
            bank_ref = item.get("bank_reference", "")
            if not bank_ref:
                continue

            remittance, created = SHARemittance.objects.update_or_create(
                bank_reference=bank_ref,
                defaults={
                    "payment_date": item.get("payment_date", date.today().isoformat()),
                    "total_amount": Decimal(str(item.get("amount", "0.00"))),
                    "claims_count": int(item.get("claims_count", 0)),
                    "dha_payload": item,
                    "facility": facility,
                    "organization": facility.organization if facility else None,
                },
            )
            if created:
                logger.info("New remittance created: %s", bank_ref)
            results.append(remittance)

        return results

    def fetch_claims_paid(
        self, remittance: SHARemittance, facility_code: str
    ) -> list[SHARemittanceLine]:
        """
        Fetch claims paid by a specific remittance.

        Calls GET /api/v1/claims/remittances/{bank_reference}/claims.
        Creates SHARemittanceLine records and attempts auto-reconciliation.

        Args:
            remittance: The SHARemittance to get claims for.
            facility_code: MFL facility code.

        Returns:
            List of SHARemittanceLine objects.

        Raises:
            SHARemittanceError: If the API call fails.
        """
        endpoint = (
            f"{self.api_base_url}/api/v1/claims/remittances/{remittance.bank_reference}/claims"
        )
        params = {
            "facility_id": facility_code,
            "facility_id_type": "fr-code",
        }

        try:
            import requests

            headers = self._get_auth_headers()
            response = requests.get(endpoint, params=params, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            raise SHARemittanceError(
                f"Failed to fetch claims for remittance {remittance.bank_reference}: {e}",
                code="fetch_claims_failed",
            ) from e

        claims_data = data if isinstance(data, list) else data.get("claims", [])
        results = []

        for item in claims_data:
            dha_claim_id = item.get("claim_id", "") or item.get("id", "")
            if not dha_claim_id:
                continue

            line, _ = SHARemittanceLine.objects.update_or_create(
                remittance=remittance,
                dha_claim_id=str(dha_claim_id),
                defaults={
                    "paid_amount": Decimal(str(item.get("paid_amount", "0.00"))),
                    "payment_status": item.get("status", ""),
                    "dha_payload": item,
                },
            )

            # Auto-reconcile: try to match to local claim
            if not line.is_reconciled:
                self._try_reconcile(line)

            results.append(line)

        # Update remittance status
        self._update_remittance_status(remittance)

        return results

    def _try_reconcile(self, line: SHARemittanceLine) -> bool:
        """
        Attempt to match a remittance line to a local SHAClaim.

        Matches by dha_external_id or sha_claim_reference.
        """
        claim = (
            SHAClaim.objects.filter(dha_external_id=line.dha_claim_id).first()
            or SHAClaim.objects.filter(sha_claim_reference=line.dha_claim_id).first()
        )

        if claim:
            line.claim = claim
            line.is_reconciled = True
            line.reconciled_at = timezone.now()
            line.save(update_fields=["claim", "is_reconciled", "reconciled_at"])

            # Update claim status to PAID if fully paid
            if claim.status != SHAClaim.ClaimStatus.PAID:
                claim.status = SHAClaim.ClaimStatus.PAID
                claim.paid_amount = line.paid_amount
                claim.payment_date = line.remittance.payment_date
                claim.payment_reference = line.remittance.bank_reference
                claim.save(
                    update_fields=[
                        "status",
                        "paid_amount",
                        "payment_date",
                        "payment_reference",
                        "updated_at",
                    ]
                )
                logger.info(
                    "Claim %s reconciled with remittance %s (amount: %s)",
                    claim.claim_number,
                    line.remittance.bank_reference,
                    line.paid_amount,
                )
            return True
        return False

    def _update_remittance_status(self, remittance: SHARemittance) -> None:
        """Update remittance status based on reconciliation progress."""
        total_lines = remittance.lines.count()
        reconciled_lines = remittance.lines.filter(is_reconciled=True).count()

        if total_lines == 0:
            return

        if reconciled_lines == total_lines:
            remittance.status = SHARemittance.RemittanceStatus.RECONCILED
            remittance.reconciled_at = timezone.now()
        elif reconciled_lines > 0:
            remittance.status = SHARemittance.RemittanceStatus.PARTIAL
        else:
            remittance.status = SHARemittance.RemittanceStatus.RECEIVED

        remittance.save(update_fields=["status", "reconciled_at"])

    def _get_auth_headers(self) -> dict[str, str]:
        """Get authenticated headers for DHA API calls."""
        token = self.auth_service.get_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }


def fetch_remittances_for_all_facilities() -> dict[str, Any]:
    """
    Celery task entry point: fetch remittances for all active facilities.

    Called nightly via Celery beat schedule.
    """
    from hmis.apps.core.models import Facility

    service = SHARemittanceService()
    results = {"success": 0, "failed": 0, "facilities": []}

    facilities = Facility.objects.filter(
        is_active=True,
        facility_code__isnull=False,
    ).exclude(facility_code="")

    for facility in facilities:
        try:
            remittances = service.fetch_remittances(
                facility_code=facility.facility_code,
                facility=facility,
            )
            # Fetch claims for each new/received remittance
            for remittance in remittances:
                if remittance.status in (
                    SHARemittance.RemittanceStatus.RECEIVED,
                    SHARemittance.RemittanceStatus.PARTIAL,
                ):
                    service.fetch_claims_paid(remittance, facility.facility_code)

            results["success"] += 1
            results["facilities"].append(
                {"facility": facility.facility_code, "remittances": len(remittances)}
            )
        except SHARemittanceError as e:
            results["failed"] += 1
            logger.warning("Failed to fetch remittances for %s: %s", facility.facility_code, e)

    return results
