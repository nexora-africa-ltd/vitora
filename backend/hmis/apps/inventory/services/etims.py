"""
KRA eTIMS integration service.

Provides an HTTP client for communicating with the KRA eTIMS API:
- Build eTIMS-compliant invoice payloads from billing Invoice records
- Submit invoices and process responses
- Mock client for dev/test environments

KRA eTIMS reference: https://etims.kra.go.ke
"""

import logging
from dataclasses import dataclass
from decimal import Decimal

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Default timeout for KRA API calls (seconds)
ETIMS_TIMEOUT = 30


@dataclass
class ETIMSResponse:
    """Standardised response from eTIMS API (real or mock)."""

    success: bool
    receipt_number: str = ""
    message: str = ""
    raw_data: dict | None = None


class ETIMSClient:
    """
    HTTP client for the KRA eTIMS API.

    Usage::

        config = ETIMSConfig.objects.get(facility=facility)
        client = ETIMSClient(config)
        response = client.submit_invoice(payload)
    """

    def __init__(self, config):
        self.config = config
        self.base_url = config.api_base_url.rstrip("/")
        self.api_key = config.api_key
        self.tin = config.tin
        self.bhf_id = config.bhf_id
        self.dvc_srl_no = config.dvc_srl_no

    def _headers(self):
        return {
            "Content-Type": "application/json",
            "tin": self.tin,
            "bhfId": self.bhf_id,
            "cmcKey": self.api_key,
        }

    def submit_invoice(self, payload: dict) -> ETIMSResponse:
        """
        Submit a sales transaction to KRA eTIMS.

        ``payload`` should be a dict matching the KRA TrnsSalesSaveReq schema.
        Returns an ETIMSResponse with success status and receipt number.
        """
        url = f"{self.base_url}/api/v2/trnsSales/saveSales"
        try:
            resp = requests.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=ETIMS_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()

            result_cd = data.get("resultCd", "")
            if result_cd == "000":
                receipt_no = (data.get("data") or {}).get("rcptNo", "")
                return ETIMSResponse(
                    success=True,
                    receipt_number=receipt_no,
                    message=data.get("resultMsg", "Success"),
                    raw_data=data,
                )
            return ETIMSResponse(
                success=False,
                message=data.get("resultMsg", f"KRA error code: {result_cd}"),
                raw_data=data,
            )
        except requests.Timeout:
            logger.error("eTIMS API timeout for TIN %s", self.tin)
            return ETIMSResponse(success=False, message="Request timed out")
        except requests.RequestException as exc:
            logger.error("eTIMS API error for TIN %s: %s", self.tin, exc)
            return ETIMSResponse(success=False, message=str(exc))

    def test_connection(self) -> ETIMSResponse:
        """
        Test connectivity by calling the device initialization endpoint.
        """
        url = f"{self.base_url}/api/v2/selectInitInfo"
        try:
            resp = requests.post(
                url,
                json={
                    "tin": self.tin,
                    "bhfId": self.bhf_id,
                    "dvcSrlNo": self.dvc_srl_no,
                },
                headers=self._headers(),
                timeout=ETIMS_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            success = data.get("resultCd") == "000"
            return ETIMSResponse(
                success=success,
                message=data.get("resultMsg", ""),
                raw_data=data,
            )
        except requests.RequestException as exc:
            return ETIMSResponse(success=False, message=str(exc))


class MockETIMSClient:
    """
    Mock eTIMS client for dev/test environments.

    Always returns success with a predictable receipt number.
    """

    def __init__(self, _config=None):
        pass

    def submit_invoice(self, _payload: dict) -> ETIMSResponse:
        return ETIMSResponse(
            success=True,
            receipt_number=f"MOCK-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            message="Mock submission successful",
            raw_data={"resultCd": "000", "resultMsg": "Mock"},
        )

    def test_connection(self) -> ETIMSResponse:
        return ETIMSResponse(
            success=True,
            message="Mock connection OK",
            raw_data={"resultCd": "000"},
        )


def get_etims_client(config):
    """
    Factory: return MockETIMSClient for non-production or when ETIMS_MOCK=True,
    otherwise return the real ETIMSClient.
    """
    if getattr(settings, "ETIMS_MOCK", False) or config.environment != "PRODUCTION":
        return MockETIMSClient(config)
    return ETIMSClient(config)


def build_etims_payload(etims_invoice) -> dict:
    """
    Build the KRA TrnsSalesSaveReq payload from an ETIMSInvoice + billing Invoice.

    Returns a dict ready to submit to the eTIMS API.
    """
    from hmis.apps.inventory.models import ETIMSConfig

    invoice = etims_invoice.invoice
    config = ETIMSConfig.objects.filter(facility=etims_invoice.facility, is_active=True).first()
    if not config:
        raise ValueError("No active eTIMS configuration for this facility.")

    # Map invoice items → eTIMS item list
    items_payload = []
    for idx, item in enumerate(invoice.items.all(), start=1):
        items_payload.append(
            {
                "itemSeq": idx,
                "itemCd": item.sha_code or "UNCLASSIFIED",
                "itemNm": item.description[:200],
                "qty": float(item.quantity),
                "prc": float(item.unit_price),
                "splyAmt": float(item.line_total),
                "taxblAmt": float(item.line_total),
                "taxAmt": float(Decimal("0.00")),  # VAT-exempt healthcare
                "totAmt": float(item.line_total),
            }
        )

    payload = {
        "tin": config.tin,
        "bhfId": config.bhf_id,
        "invcNo": invoice.invoice_number,
        "orgInvcNo": 0,
        "custTin": "",
        "custNm": f"{invoice.patient.first_name} {invoice.patient.last_name}",
        "rcptTyCd": "S",  # Sales receipt
        "pmtTyCd": _map_payment_type(invoice.payment_type),
        "salesDt": invoice.invoice_date.strftime("%Y%m%d"),
        "salesTm": timezone.now().strftime("%H%M%S"),
        "totItemCnt": len(items_payload),
        "taxblAmtA": float(invoice.total_amount),
        "taxAmtA": 0.0,
        "totTaxblAmt": float(invoice.total_amount),
        "totTaxAmt": 0.0,
        "totAmt": float(invoice.total_amount),
        "itemList": items_payload,
    }
    return payload


def _map_payment_type(payment_type: str) -> str:
    """Map billing payment type to KRA payment type code."""
    mapping = {
        "CASH": "01",
        "MPESA": "04",
        "INSURANCE": "05",
        "CORPORATE": "05",
        "MIXED": "07",
    }
    return mapping.get(payment_type, "01")


def submit_etims_invoice(etims_invoice_id: int) -> ETIMSResponse:
    """
    End-to-end submission: build payload, submit, update ETIMSInvoice record.

    Called by the Celery task or directly for synchronous submission.
    """
    from hmis.apps.inventory.models import ETIMSConfig, ETIMSInvoice, ETIMSItem

    etims_inv = (
        ETIMSInvoice.objects.select_related("invoice__patient", "facility")
        .prefetch_related("invoice__items")
        .get(pk=etims_invoice_id)
    )

    config = ETIMSConfig.objects.filter(facility=etims_inv.facility, is_active=True).first()
    if not config:
        etims_inv.mark_failed("No active eTIMS configuration for facility.")
        return ETIMSResponse(success=False, message="No active eTIMS config.")

    # Build payload
    try:
        payload = build_etims_payload(etims_inv)
    except Exception as exc:
        etims_inv.mark_failed(f"Payload build error: {exc}")
        return ETIMSResponse(success=False, message=str(exc))

    # Submit
    client = get_etims_client(config)
    response = client.submit_invoice(payload)

    if response.success:
        etims_inv.mark_submitted(response_data=response.raw_data)
        # For KRA, confirmation is typically immediate in the same response
        if response.receipt_number:
            etims_inv.mark_confirmed(
                receipt_number=response.receipt_number,
                response_data=response.raw_data,
            )
            # Persist line items for audit
            for item_data in payload.get("itemList", []):
                ETIMSItem.objects.create(
                    etims_invoice=etims_inv,
                    item_code=item_data.get("itemCd", ""),
                    item_name=item_data.get("itemNm", ""),
                    quantity=item_data.get("qty", 0),
                    unit_price=item_data.get("prc", 0),
                    tax_amount=item_data.get("taxAmt", 0),
                    total=item_data.get("totAmt", 0),
                )
        config.last_sync_at = timezone.now()
        config.save(update_fields=["last_sync_at"])
    else:
        etims_inv.mark_failed(response.message)

    return response
