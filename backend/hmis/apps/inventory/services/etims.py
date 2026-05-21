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
from django.db.models import Sum
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


# ---------------------------------------------------------------------------
# Tax rate classification (§6.20.4)
# Labels A-E map to Kenya tax rates
# ---------------------------------------------------------------------------
TAX_RATE_A = "A"  # VAT Exempt (EX)
TAX_RATE_B = "B"  # VAT 16%
TAX_RATE_C = "C"  # Zero-rated (0%)
TAX_RATE_D = "D"  # Non-VATable
TAX_RATE_E = "E"  # VAT 8% (Tourism levy)

TAX_RATE_PERCENTAGES = {
    TAX_RATE_A: Decimal("0.00"),
    TAX_RATE_B: Decimal("16.00"),
    TAX_RATE_C: Decimal("0.00"),
    TAX_RATE_D: Decimal("0.00"),
    TAX_RATE_E: Decimal("8.00"),
}


def _classify_tax_rate(item) -> str:
    """
    Determine the KRA tax rate label (A-E) for an invoice line item.

    Healthcare services are typically VAT-exempt (A).
    Pharmacy items may be zero-rated (C) or standard (B).
    """
    # Check if item's service has is_taxable flag
    if hasattr(item, "service") and item.service:
        if not item.service.is_taxable:
            return TAX_RATE_A  # Exempt
        return TAX_RATE_B  # Standard 16%
    # Pharmacy items — check drug tax status
    if hasattr(item, "drug") and item.drug:
        # Pharmaceutical products are zero-rated per Kenya VAT Act 2013
        return TAX_RATE_C
    # Default: exempt for healthcare
    return TAX_RATE_A


def _compute_tax_amounts(items_with_rates: list) -> dict:
    """
    Compute taxable amounts and tax per rate slot (§5.1.6-8).

    Returns dict with taxblAmtA..E and taxAmtA..E fields.
    """
    totals = {
        "taxblAmtA": Decimal("0.00"),
        "taxAmtA": Decimal("0.00"),
        "taxblAmtB": Decimal("0.00"),
        "taxAmtB": Decimal("0.00"),
        "taxblAmtC": Decimal("0.00"),
        "taxAmtC": Decimal("0.00"),
        "taxblAmtD": Decimal("0.00"),
        "taxAmtD": Decimal("0.00"),
        "taxblAmtE": Decimal("0.00"),
        "taxAmtE": Decimal("0.00"),
    }
    for item_data in items_with_rates:
        rate_label = item_data["tax_rate_label"]
        taxable = item_data["taxable_amount"]
        tax = item_data["tax_amount"]
        totals[f"taxblAmt{rate_label}"] += taxable
        totals[f"taxAmt{rate_label}"] += tax
    return totals


def build_etims_payload(etims_invoice) -> dict:
    """
    Build the KRA TrnsSalesSaveReq payload from an ETIMSInvoice + billing Invoice.

    Complies with TIS spec §5.1 (data sent to OSCU/VSCU) and §21.7.1 (SEND_RECEIPT).
    Supports all receipt types (NS, NC, CS, TS, PS) and tax rate slots A-E.
    """
    from hmis.apps.inventory.models import ETIMSConfig

    invoice = etims_invoice.invoice
    config = ETIMSConfig.objects.filter(facility=etims_invoice.facility, is_active=True).first()
    if not config:
        raise ValueError("No active eTIMS configuration for this facility.")

    is_credit_note = etims_invoice.transaction_type == "NC"

    # Map invoice items → eTIMS item list with tax classification
    items_payload = []
    items_with_rates = []
    for idx, item in enumerate(invoice.items.all(), start=1):
        tax_label = _classify_tax_rate(item)
        rate_pct = TAX_RATE_PERCENTAGES[tax_label]

        # For credit notes, amounts are negative (§14)
        line_amount = item.line_total
        if is_credit_note:
            line_amount = -abs(line_amount)

        # Calculate tax
        if rate_pct > 0:
            # Tax-inclusive calculation: taxable = amount / (1 + rate)
            taxable_amount = line_amount * Decimal("100") / (Decimal("100") + rate_pct)
            tax_amount = line_amount - taxable_amount
        else:
            taxable_amount = line_amount
            tax_amount = Decimal("0.00")

        items_payload.append(
            {
                "itemSeq": idx,
                "itemCd": item.sha_code or "UNCLASSIFIED",
                "itemClsCd": "",
                "itemNm": item.description[:200],
                "qty": float(item.quantity),
                "prc": float(item.unit_price if not is_credit_note else -abs(item.unit_price)),
                "splyAmt": float(line_amount),
                "taxblAmt": float(taxable_amount),
                "taxAmt": float(tax_amount),
                "taxTyCd": tax_label,
                "totAmt": float(line_amount),
            }
        )
        items_with_rates.append(
            {
                "tax_rate_label": tax_label,
                "taxable_amount": taxable_amount,
                "tax_amount": tax_amount,
            }
        )

    # Aggregate tax totals per rate (§5.1.6-8)
    tax_totals = _compute_tax_amounts(items_with_rates)

    total_taxable = sum(d["taxable_amount"] for d in items_with_rates)
    total_tax = sum(d["tax_amount"] for d in items_with_rates)
    total_amount = invoice.total_amount if not is_credit_note else -abs(invoice.total_amount)

    # Buyer PIN (§3d, §5.1.3) — optional
    buyer_pin = etims_invoice.buyer_pin or ""

    # Original invoice number for credit notes (§6.16, §14)
    org_invc_no = 0
    if is_credit_note and etims_invoice.original_cu_invoice_number:
        # Extract numeric part from CU invoice number
        try:
            org_invc_no = int(etims_invoice.original_cu_invoice_number.split("/")[-1])
        except (ValueError, IndexError):
            org_invc_no = 0

    # Receipt type mapping for KRA API
    receipt_type_code = etims_invoice.receipt_label

    payload = {
        "tin": config.tin,
        "bhfId": config.bhf_id,
        "invcNo": invoice.invoice_number,
        "orgInvcNo": org_invc_no,
        "custTin": buyer_pin,
        "custNm": f"{invoice.patient.first_name} {invoice.patient.last_name}",
        "rcptTyCd": receipt_type_code,
        "pmtTyCd": _map_payment_type(invoice.payment_type),
        "salesDt": invoice.invoice_date.strftime("%Y%m%d"),
        "salesTm": timezone.now().strftime("%H%M%S"),
        "totItemCnt": len(items_payload),
        # Tax rate values (§6.20.4)
        "taxRateA": float(TAX_RATE_PERCENTAGES[TAX_RATE_A]),
        "taxRateB": float(TAX_RATE_PERCENTAGES[TAX_RATE_B]),
        "taxRateC": float(TAX_RATE_PERCENTAGES[TAX_RATE_C]),
        "taxRateD": float(TAX_RATE_PERCENTAGES[TAX_RATE_D]),
        "taxRateE": float(TAX_RATE_PERCENTAGES[TAX_RATE_E]),
        # Taxable amounts per rate slot
        "taxblAmtA": float(tax_totals["taxblAmtA"]),
        "taxblAmtB": float(tax_totals["taxblAmtB"]),
        "taxblAmtC": float(tax_totals["taxblAmtC"]),
        "taxblAmtD": float(tax_totals["taxblAmtD"]),
        "taxblAmtE": float(tax_totals["taxblAmtE"]),
        # Tax amounts per rate slot
        "taxAmtA": float(tax_totals["taxAmtA"]),
        "taxAmtB": float(tax_totals["taxAmtB"]),
        "taxAmtC": float(tax_totals["taxAmtC"]),
        "taxAmtD": float(tax_totals["taxAmtD"]),
        "taxAmtE": float(tax_totals["taxAmtE"]),
        # Totals
        "totTaxblAmt": float(total_taxable),
        "totTaxAmt": float(total_tax),
        "totAmt": float(total_amount),
        "itemList": items_payload,
        # Receipt number per type (§5.1.4)
        "rNum": etims_invoice.receipt_type_counter,
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


def _parse_scu_response(raw_data: dict | None) -> dict:
    """
    Extract SCU response fields from KRA API response (§5.3).

    Returns a dict suitable for ETIMSInvoice.mark_confirmed(scu_data=...).
    """
    if not raw_data:
        return {}
    data = raw_data.get("data", {})
    scu_data = {
        "scu_id": data.get("sdcId", "") or data.get("cuId", ""),
        "receipt_type_counter": data.get("rcptTyNo", 0),
        "total_counter": data.get("totRcptNo", 0),
        "internal_data": data.get("intrlData", ""),
        "receipt_signature": data.get("rcptSign", ""),
    }
    # Parse SCU datetime
    scu_dt_str = data.get("sdcDateTime", "") or data.get("rcptDt", "")
    if scu_dt_str:
        from django.utils.dateparse import parse_datetime

        parsed = parse_datetime(scu_dt_str)
        if parsed:
            scu_data["scu_datetime"] = parsed
    return scu_data


def _build_ej_data(etims_invoice) -> str:
    """
    Build Electronic Journal text representation of the receipt (§5.5, §21.7.7).

    The EJ string is the full receipt printout as text, each line terminated by \\n.
    Only required for NS and NC receipt labels.
    """
    inv = etims_invoice.invoice
    lines = []
    # Header
    lines.append(
        f"TIN: {etims_invoice.facility.kra_pin if hasattr(etims_invoice.facility, 'kra_pin') else ''}"
    )
    lines.append(f"{'TAX INVOICE' if etims_invoice.receipt_label == 'NS' else 'CREDIT NOTE'}")
    lines.append(f"Invoice: {inv.invoice_number}")
    lines.append(f"Date: {inv.invoice_date.strftime('%d/%m/%Y')}")
    if etims_invoice.buyer_pin:
        lines.append(f"Buyer PIN: {etims_invoice.buyer_pin}")
    lines.append("-" * 48)
    # Items
    for item in inv.items.all():
        lines.append(f"{item.description}")
        lines.append(f"  {item.unit_price}x{item.quantity}  {item.line_total}")
    lines.append("-" * 48)
    lines.append(f"TOTAL: {inv.total_amount}")
    # SCU Information
    if etims_invoice.scu_id:
        lines.append("-" * 48)
        lines.append("SCU INFORMATION")
        if etims_invoice.scu_datetime:
            lines.append(
                f"Date: {etims_invoice.scu_datetime.strftime('%d/%m/%Y')} "
                f"Time: {etims_invoice.scu_datetime.strftime('%H:%M:%S')}"
            )
        lines.append(f"SCU ID: {etims_invoice.scu_id}")
        lines.append(f"CU INVOICE NO.: {etims_invoice.cu_invoice_number}")
        lines.append(f"Internal Data: {etims_invoice.formatted_internal_data}")
        lines.append(f"Receipt Signature: {etims_invoice.formatted_receipt_signature}")
    return "\n".join(lines) + "\n"


def submit_ej_data(etims_invoice, client, config) -> bool:  # noqa: ARG001
    """
    Send Electronic Journal data to OSCU/VSCU (§5.5, §21.7.7).

    Required for NS and NC receipt labels only.
    Returns True if successful.
    """
    if etims_invoice.receipt_label not in ("NS", "NC"):
        return True  # Not required for other types

    ej_text = _build_ej_data(etims_invoice)
    url = f"{config.api_base_url.rstrip('/')}/api/v2/trnsJournal/saveJournal"
    try:
        resp = requests.post(
            url,
            json={
                "tin": config.tin,
                "bhfId": config.bhf_id,
                "journal": ej_text,
                "rcptNo": etims_invoice.etims_receipt_number,
            },
            headers={
                "Content-Type": "application/json",
                "tin": config.tin,
                "bhfId": config.bhf_id,
                "cmcKey": config.api_key,
            },
            timeout=ETIMS_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("resultCd") == "000":
                etims_invoice.ej_data_sent = True
                etims_invoice.save(update_fields=["ej_data_sent", "updated_at"])
                return True
        logger.warning("EJ_DATA submission failed for %s", etims_invoice.pk)
        return False
    except requests.RequestException as exc:
        logger.error("EJ_DATA error for %s: %s", etims_invoice.pk, exc)
        return False


def validate_stock_for_submission(invoice) -> list[str]:
    """
    Validate stock availability for goods items before eTIMS submission (§6.29).

    TIS must not issue receipt for goods when stock < requested quantity.
    Service items are exempt from this check.

    Returns list of error messages (empty if all OK).
    """
    errors = []
    for item in invoice.items.all():
        # Only check pharmacy/consumable items that have stock
        if item.item_type not in ("pharmacy", "consumable"):
            continue
        if item.drug and hasattr(item.drug, "stock_batches"):
            from hmis.apps.pharmacy.models import StockBatch

            available = (
                StockBatch.objects.filter(
                    drug=item.drug,
                    facility=invoice.facility,
                    quantity_available__gt=0,
                )
                .aggregate(total=Sum("quantity_available"))
                .get("total")
                or 0
            )
            if available < item.quantity:
                errors.append(
                    f"Insufficient stock for {item.description}: "
                    f"available={available}, requested={item.quantity}"
                )
    return errors


def submit_etims_invoice(etims_invoice_id: int) -> ETIMSResponse:
    """
    End-to-end submission: build payload, submit, update ETIMSInvoice record.

    Implements full KRA TIS compliance:
    - Receipt type classification (§4)
    - Tax rate slots A-E (§5.1.6-8)
    - Credit note referencing (§6.16, §14)
    - SCU response parsing and storage (§5.3)
    - QR code generation (§6.23.8)
    - Electronic Journal submission for NS/NC (§5.5)
    - Stock validation for goods (§6.29)
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

    # Stock validation (§6.29) — block for goods items
    stock_errors = validate_stock_for_submission(etims_inv.invoice)
    if stock_errors:
        etims_inv.mark_failed(f"Stock validation failed: {'; '.join(stock_errors)}")
        return ETIMSResponse(success=False, message=stock_errors[0])

    # Assign sequential receipt counter (§6.3)
    if not etims_inv.receipt_type_counter:
        from django.db import transaction

        with transaction.atomic():
            counter = config.get_next_receipt_number(etims_inv.receipt_label)
            etims_inv.receipt_type_counter = counter
            etims_inv.save(update_fields=["receipt_type_counter", "updated_at"])

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
            # Parse SCU response data (§5.3)
            scu_data = _parse_scu_response(response.raw_data)
            etims_inv.mark_confirmed(
                receipt_number=response.receipt_number,
                response_data=response.raw_data,
                scu_data=scu_data,
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
            # Submit Electronic Journal for NS/NC (§5.5)
            submit_ej_data(etims_inv, client, config)

        config.last_sync_at = timezone.now()
        config.save(update_fields=["last_sync_at"])
    else:
        etims_inv.mark_failed(response.message)

    return response


# ---------------------------------------------------------------------------
# X/Z Daily Reports (§6.5, §15, §16)
# ---------------------------------------------------------------------------


def generate_daily_report(facility_id: int, report_type: str, report_date=None, user=None):
    """
    Generate an X or Z daily report for a facility (§15-16).

    Z report = full day summary (00:00:00 to 23:59:59).
    X report = summary from last Z report to present.

    Args:
        facility_id: Facility PK.
        report_type: "X" or "Z".
        report_date: Date to report on (defaults to today).
        user: User generating the report.

    Returns:
        ETIMSDailyReport instance.
    """
    from datetime import date as date_type
    from datetime import datetime, time

    from django.db.models import Count, Sum

    from hmis.apps.inventory.models import (
        ETIMSDailyReport,
        ETIMSDailyReportType,
        ETIMSInvoice,
        ETIMSInvoiceStatus,
    )

    if report_date is None:
        report_date = timezone.localdate()
    elif isinstance(report_date, str):
        report_date = date_type.fromisoformat(report_date)

    # Determine the period start
    if report_type == "X":
        # X report: from last Z report to now
        last_z = (
            ETIMSDailyReport.objects.filter(
                facility_id=facility_id,
                report_type=ETIMSDailyReportType.Z_REPORT,
            )
            .order_by("-report_date", "-report_number")
            .first()
        )
        if last_z:
            period_start = timezone.make_aware(
                datetime.combine(last_z.report_date, time(23, 59, 59))
            )
        else:
            period_start = timezone.make_aware(datetime.combine(report_date, time(0, 0, 0)))
        period_end = timezone.now()
    else:
        # Z report: full day
        period_start = timezone.make_aware(datetime.combine(report_date, time(0, 0, 0)))
        period_end = timezone.make_aware(datetime.combine(report_date, time(23, 59, 59)))

    # Query confirmed eTIMS invoices in period
    confirmed_invoices = ETIMSInvoice.objects.filter(
        facility_id=facility_id,
        status=ETIMSInvoiceStatus.CONFIRMED,
        confirmed_at__gte=period_start,
        confirmed_at__lte=period_end,
    ).select_related("invoice")

    # Aggregate by receipt label
    ns_invoices = confirmed_invoices.filter(receipt_label="NS")
    nc_invoices = confirmed_invoices.filter(receipt_label="NC")
    cs_cc_invoices = confirmed_invoices.filter(receipt_label__in=["CS", "CC"])
    ts_tc_invoices = confirmed_invoices.filter(receipt_label__in=["TS", "TC"])
    ps_invoices = confirmed_invoices.filter(receipt_label="PS")

    ns_agg = ns_invoices.aggregate(
        total=Sum("invoice__total_amount"),
        count=Count("id"),
        items=Sum("invoice__items__quantity"),
    )
    nc_agg = nc_invoices.aggregate(
        total=Sum("invoice__total_amount"),
        count=Count("id"),
    )
    cs_cc_agg = cs_cc_invoices.aggregate(total=Sum("invoice__total_amount"), count=Count("id"))
    ts_tc_agg = ts_tc_invoices.aggregate(total=Sum("invoice__total_amount"), count=Count("id"))
    ps_agg = ps_invoices.aggregate(total=Sum("invoice__total_amount"), count=Count("id"))

    # Payment breakdown (from NS invoices)
    payment_agg = ns_invoices.values("invoice__payment_type").annotate(
        total=Sum("invoice__total_amount")
    )
    payment_map = {p["invoice__payment_type"]: p["total"] or 0 for p in payment_agg}

    # Discount totals
    discount_agg = confirmed_invoices.aggregate(total=Sum("invoice__discount_amount"))

    # Incomplete (PENDING/FAILED) count
    incomplete_count = ETIMSInvoice.objects.filter(
        facility_id=facility_id,
        status__in=[ETIMSInvoiceStatus.PENDING, ETIMSInvoiceStatus.FAILED],
        created_at__gte=period_start,
        created_at__lte=period_end,
    ).count()

    # Next report number
    existing_count = ETIMSDailyReport.objects.filter(
        facility_id=facility_id,
        report_type=report_type,
    ).count()
    report_number = existing_count + 1

    report = ETIMSDailyReport.objects.create(
        facility_id=facility_id,
        report_type=report_type,
        report_date=report_date,
        report_number=report_number,
        total_ns_amount=ns_agg["total"] or 0,
        total_ns_count=ns_agg["count"] or 0,
        total_nc_amount=nc_agg["total"] or 0,
        total_nc_count=nc_agg["count"] or 0,
        total_items_sold=ns_agg["items"] or 0,
        total_cs_cc_count=cs_cc_agg["count"] or 0,
        total_cs_cc_amount=cs_cc_agg["total"] or 0,
        total_ts_tc_count=ts_tc_agg["count"] or 0,
        total_ts_tc_amount=ts_tc_agg["total"] or 0,
        total_ps_count=ps_agg["count"] or 0,
        total_ps_amount=ps_agg["total"] or 0,
        payment_cash=payment_map.get("cash", 0),
        payment_mpesa=payment_map.get("mpesa", 0),
        payment_insurance=payment_map.get("insurance", 0),
        payment_other=payment_map.get("corporate", 0) + payment_map.get("mixed", 0),
        total_discounts=discount_agg["total"] or 0,
        incomplete_sales_count=incomplete_count,
        generated_by=user,
    )
    return report
