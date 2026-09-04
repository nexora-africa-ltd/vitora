# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Services for standalone LIS operations.

Handles HL7 ORM^O01 inbound order processing and walk-in patient creation.
"""

import json
import logging
import uuid
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from hmis.apps.core.models import ExternalCodeMapping
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog

from .models import (
    ExternalOrderRequest,
    ExternalPatientIdentifierCrosswalk,
    InboundIngestionEvent,
    ResultDeliveryLog,
    WalkInPatient,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def process_external_order(
    ext_order: ExternalOrderRequest,
    user,
    auto_create_walkin: bool = True,
    enable_billing: bool = True,
    payer_type: str = "cash",
    diagnostic_package: str = "",
    facility=None,
    organization=None,
) -> LabOrder:
    """
    Process an accepted external order request into a LabOrder.

    Creates a WalkInPatient (if auto_create_walkin) and a LabOrder with items.

    Args:
        ext_order: The ExternalOrderRequest to process
        user: User processing the order
        auto_create_walkin: Whether to auto-create a walk-in patient
        facility: Facility for scoping
        organization: Organization for scoping

    Returns:
        The created LabOrder

    Raises:
        ValueError: If no tests could be resolved
    """
    walkin = None
    patient = None
    billing_patient = None

    if auto_create_walkin and ext_order.patient_name:
        # Parse name (HL7 format: LAST^FIRST or "First Last")
        name_parts = ext_order.patient_name.replace("^", " ").strip().split()
        first_name = name_parts[0] if name_parts else "Unknown"
        last_name = name_parts[-1] if len(name_parts) > 1 else ""

        walkin = WalkInPatient.objects.create(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=ext_order.patient_dob,
            gender=ext_order.patient_gender or "",
            national_id=ext_order.patient_id_number or "",
            referring_facility=ext_order.sending_facility,
            registered_by=user,
            facility=facility,
            organization=organization,
        )
        ext_order.walkin_patient = walkin
        ext_order.save(update_fields=["walkin_patient", "updated_at"])
        if enable_billing:
            billing_patient = ensure_walkin_has_billing_patient(walkin, user)
            patient = billing_patient

    # Create the lab order
    order = LabOrder.objects.create(
        patient=patient,
        encounter=None,
        ordered_by=user,
        order_type="IN_HOUSE",
        priority=_map_hl7_priority(ext_order.order_priority),
        clinical_notes=ext_order.clinical_info,
        is_walkin=True,
        walkin_patient_name=ext_order.patient_name,
        walkin_patient_id=ext_order.patient_id_number,
        walkin_patient_dob=ext_order.patient_dob,
        walkin_patient_gender=ext_order.patient_gender,
        external_accession_number=ext_order.placer_order_number,
        bill_patient=enable_billing,
        billing_patient=billing_patient,
        facility=facility,
        organization=organization,
    )

    # Resolve and create order items
    items_created = 0
    for test_info in ext_order.requested_tests:
        test_code = test_info if isinstance(test_info, str) else test_info.get("code", "")
        test = _resolve_test_code(test_code, facility=facility)
        if test:
            LabOrderItem.objects.create(
                lab_order=order,
                test=test,
                unit_cost=test.cost,
            )
            items_created += 1
        else:
            logger.warning(
                "Could not resolve test code '%s' from external order %s",
                test_code,
                ext_order.placer_order_number,
            )

    if items_created == 0:
        # Clean up the order if no tests could be resolved
        order.delete()
        raise ValueError(f"No valid tests found for codes: {ext_order.requested_tests}")

    order.calculate_total_cost()
    order.status = "ORDERED"
    order.save(update_fields=["status", "total_cost", "updated_at"])

    if enable_billing:
        apply_diagnostic_billing_rules(
            lab_order=order,
            payer_type=payer_type,
            diagnostic_package=diagnostic_package,
        )

    return order


def ensure_walkin_has_billing_patient(walkin: WalkInPatient, user) -> object:
    """Ensure a walk-in record is linked to an HMIS patient for billing."""
    if walkin.linked_patient_id:
        return walkin.linked_patient

    from hmis.apps.patients.models import Patient

    date_of_birth = walkin.date_of_birth or datetime.now().date()
    gender = walkin.gender or "O"
    patient = Patient.objects.create(
        first_name=walkin.first_name,
        last_name=walkin.last_name,
        date_of_birth=date_of_birth,
        gender=gender,
        identification_type="national_id",
        registered_by=user,
        registered_at_facility=walkin.facility,
        organization=walkin.organization,
        referral_source="self",
    )

    if walkin.national_id:
        patient.identification_number = walkin.national_id
    if walkin.phone_number:
        patient.phone_number = walkin.phone_number
    if walkin.email:
        patient.email = walkin.email
    patient.save()

    walkin.linked_patient = patient
    walkin.save(update_fields=["linked_patient", "updated_at"])
    return patient


def apply_diagnostic_billing_rules(
    *,
    lab_order: LabOrder,
    payer_type: str,
    diagnostic_package: str,
):
    """Apply standalone diagnostic payer/package rules to the linked invoice."""
    from hmis.apps.billing.models import Invoice, InvoicePayer

    invoice = (
        Invoice.objects.filter(items__lab_order=lab_order)
        .select_related("patient")
        .prefetch_related("payers")
        .first()
    )
    if invoice is None:
        return None

    normalized_payer = (payer_type or "cash").strip().lower()
    valid_payers = {
        Invoice.PayerType.CASH,
        Invoice.PayerType.SHA,
        Invoice.PayerType.PRIVATE_INSURANCE,
        Invoice.PayerType.CORPORATE,
        Invoice.PayerType.MIXED,
    }
    if normalized_payer not in valid_payers:
        normalized_payer = Invoice.PayerType.CASH

    changed_fields = []
    if invoice.payer_type != normalized_payer:
        invoice.payer_type = normalized_payer
        changed_fields.append("payer_type")

    package_code = (diagnostic_package or "").strip().upper()
    package_discount_map = {
        "BASIC": Decimal("0.00"),
        "COMPREHENSIVE": Decimal("10.00"),
        "EMPLOYMENT": Decimal("15.00"),
        "REFERRAL": Decimal("5.00"),
    }
    if package_code:
        note = f"Standalone LIS diagnostic package: {package_code}"
        if note not in (invoice.internal_notes or ""):
            invoice.internal_notes = f"{invoice.internal_notes}\n{note}".strip()
            changed_fields.append("internal_notes")

    if changed_fields:
        invoice.save(update_fields=[*changed_fields, "updated_at"])

    payer, _ = InvoicePayer.objects.get_or_create(
        invoice=invoice,
        priority=1,
        defaults={
            "payer_type": normalized_payer,
            "allocated_amount": invoice.total_amount,
            "allocation_percent": Decimal("100.00"),
            "status": InvoicePayer.Status.PENDING,
        },
    )
    payer_update_fields = []
    if payer.payer_type != normalized_payer:
        payer.payer_type = normalized_payer
        payer_update_fields.append("payer_type")
    if payer.allocated_amount != invoice.total_amount:
        payer.allocated_amount = invoice.total_amount
        payer_update_fields.append("allocated_amount")
    if payer.allocation_percent != Decimal("100.00"):
        payer.allocation_percent = Decimal("100.00")
        payer_update_fields.append("allocation_percent")
    if payer_update_fields:
        payer.save(update_fields=[*payer_update_fields, "updated_at"])

    package_discount = package_discount_map.get(package_code)
    if package_discount is not None:
        if package_discount > 0:
            discount_amount = (invoice.subtotal * package_discount / Decimal("100")).quantize(
                Decimal("0.01")
            )
            invoice.apply_discount(
                amount=discount_amount,
                reason=f"{package_code} diagnostic package",
                discount_type=Invoice.DiscountType.PERCENTAGE,
                discount_value=package_discount,
            )
        elif invoice.discount_amount > 0 and "diagnostic package" in (
            invoice.discount_reason or ""
        ):
            invoice.discount_type = ""
            invoice.discount_value = Decimal("0.00")
            invoice.discount_amount = Decimal("0.00")
            invoice.discount_reason = ""
            invoice.calculate_totals()

    return invoice


def ingest_hl7_orm(
    raw_message: str,
    facility=None,
    organization=None,
    idempotency_key: str = "",
) -> ExternalOrderRequest:
    """
    Parse and ingest an HL7 ORM^O01 message into an ExternalOrderRequest.

    This is the entry point for inbound HL7 order messages. The order is
    stored as a pending request for lab staff to accept/reject.

    Args:
        raw_message: Raw HL7 v2.x message string
        facility: Facility to scope the request
        organization: Organization to scope the request

    Returns:
        The created ExternalOrderRequest
    """
    # Parse the HL7 message segments
    segments = _parse_hl7_segments(raw_message)

    # Extract MSH (Message Header)
    msh = segments.get("MSH", {})
    message_control_id = msh.get("message_control_id", "")
    sending_app = msh.get("sending_application", "UNKNOWN")
    sending_fac = msh.get("sending_facility", "UNKNOWN")

    # Extract PID (Patient Identification)
    pid = segments.get("PID", {})
    patient_name = pid.get("patient_name", "")
    patient_id = pid.get("patient_id", "")
    patient_dob = pid.get("date_of_birth")
    patient_gender = pid.get("gender", "")
    patient_id_number = pid.get("id_number", "")

    # Extract ORC/OBR (Order/Observation Request)
    orc = segments.get("ORC", {})
    obr_list = segments.get("OBR", [])

    placer_order_number = orc.get("placer_order_number", message_control_id)
    priority = orc.get("priority", "ROUTINE")

    # Collect requested tests from OBR segments
    requested_tests = []
    clinical_info = ""
    for obr in obr_list:
        test_code = obr.get("universal_service_id", "")
        if test_code:
            requested_tests.append({"code": test_code, "name": obr.get("test_name", "")})
        if obr.get("clinical_info"):
            clinical_info = obr["clinical_info"]

    ext_order = ExternalOrderRequest.objects.create(
        trace_id=uuid.uuid4(),
        idempotency_key=idempotency_key,
        message_control_id=message_control_id,
        sending_application=sending_app,
        sending_facility=sending_fac,
        external_patient_id=patient_id,
        patient_name=patient_name,
        patient_dob=patient_dob,
        patient_gender=patient_gender,
        patient_id_number=patient_id_number,
        placer_order_number=placer_order_number,
        order_priority=priority,
        clinical_info=clinical_info,
        requested_tests=requested_tests,
        raw_message=raw_message,
        status=ExternalOrderRequest.Status.RECEIVED,
        facility=facility,
        organization=organization,
    )

    logger.info(
        "Ingested HL7 ORM from %s/%s, placer order: %s (%d tests)",
        sending_app,
        sending_fac,
        placer_order_number,
        len(requested_tests),
    )

    return ext_order


def ingest_structured_order_payload(
    payload: dict,
    source_system: str,
    facility=None,
    organization=None,
    idempotency_key: str = "",
) -> ExternalOrderRequest:
    """Ingest a JSON payload order into ``ExternalOrderRequest``."""
    patient = payload.get("patient") or {}
    order = payload.get("order") or {}
    tests = payload.get("tests") or []

    requested_tests = []
    for item in tests:
        if isinstance(item, dict):
            code = str(item.get("code", "")).strip()
            if code:
                requested_tests.append(
                    {
                        "code": code,
                        "name": str(item.get("name", "")).strip(),
                    }
                )

    return ExternalOrderRequest.objects.create(
        trace_id=uuid.uuid4(),
        idempotency_key=idempotency_key,
        message_control_id=str(order.get("message_control_id", "")).strip()
        or str(order.get("placer_order_number", "")).strip()
        or str(patient.get("external_patient_id", "")).strip()
        or str(uuid.uuid4()),
        sending_application=str(order.get("sending_application", source_system)).strip()
        or source_system,
        sending_facility=str(order.get("sending_facility", "EXTERNAL")).strip() or "EXTERNAL",
        external_patient_id=str(patient.get("external_patient_id", "")).strip(),
        patient_name=str(patient.get("name", "")).strip() or "Unknown Patient",
        patient_dob=patient.get("dob") or None,
        patient_gender=str(patient.get("gender", "")).strip(),
        patient_id_number=str(patient.get("id_number", "")).strip(),
        placer_order_number=str(order.get("placer_order_number", "")).strip()
        or str(order.get("message_control_id", "")).strip(),
        order_priority=str(order.get("priority", "ROUTINE")).strip().upper() or "ROUTINE",
        clinical_info=str(order.get("clinical_info", "")).strip(),
        requested_tests=requested_tests,
        raw_message=json.dumps(payload),
        status=ExternalOrderRequest.Status.RECEIVED,
        facility=facility,
        organization=organization,
    )


def create_or_update_crosswalk(
    *,
    source_system: str,
    external_patient_id: str,
    patient_name: str,
    facility,
    organization,
    walkin_patient: WalkInPatient | None = None,
):
    """Create or update an external patient identifier crosswalk entry."""
    if not external_patient_id:
        return None

    defaults = {
        "organization": organization,
        "patient_name_snapshot": patient_name,
        "walkin_patient": walkin_patient,
    }
    crosswalk, _ = ExternalPatientIdentifierCrosswalk.objects.update_or_create(
        facility=facility,
        source_system=source_system,
        external_patient_id=external_patient_id,
        defaults=defaults,
    )
    return crosswalk


def replay_inbound_event(event: InboundIngestionEvent, facility=None, organization=None):
    """Replay a failed inbound event and return the ingested external order."""
    event.replay_count += 1
    event.last_replayed_at = timezone.now()
    event.save(update_fields=["replay_count", "last_replayed_at", "updated_at"])

    try:
        raw = event.raw_payload
        if raw.strip().startswith("MSH|"):
            ext_order = ingest_hl7_orm(raw, facility=facility, organization=organization)
        else:
            payload = json.loads(raw)
            ext_order = ingest_structured_order_payload(
                payload=payload,
                source_system=event.source_system,
                facility=facility,
                organization=organization,
                idempotency_key=event.idempotency_key,
            )
        event.external_order = ext_order
        event.status = InboundIngestionEvent.Status.REPLAYED
        event.error_message = ""
        event.processed_at = timezone.now()
        event.trace_id = ext_order.trace_id
        event.save(
            update_fields=[
                "external_order",
                "status",
                "error_message",
                "processed_at",
                "trace_id",
                "updated_at",
            ]
        )
        return ext_order
    except Exception as exc:  # noqa: BLE001 - replay endpoint should preserve dead-letter state
        event.status = InboundIngestionEvent.Status.FAILED
        event.error_message = str(exc)
        event.save(update_fields=["status", "error_message", "updated_at"])
        raise


def build_result_payload(lab_order: LabOrder) -> dict:
    """Build normalized payload for outbound standalone LIS result delivery."""
    results = []
    for item in lab_order.items.select_related("test", "result").all():
        result = getattr(item, "result", None)
        if result is None:
            continue
        result_value = result.text_value or result.option_value
        if result.numeric_value is not None:
            result_value = str(result.numeric_value)
        results.append(
            {
                "test_code": item.test.code,
                "test_name": item.test.name,
                "result": result_value,
                "unit": result.result_unit,
                "reference_range": result.reference_range_text,
                "flag": result.result_flag,
                "verification_status": result.verification_status,
                "verified_at": result.verified_at.isoformat() if result.verified_at else None,
            }
        )

    return {
        "order_number": lab_order.order_number,
        "external_accession_number": lab_order.external_accession_number,
        "status": lab_order.status,
        "released_at": lab_order.completed_at.isoformat() if lab_order.completed_at else None,
        "patient": {
            "name": lab_order.walkin_patient_name
            or (
                f"{lab_order.patient.first_name} {lab_order.patient.last_name}"
                if lab_order.patient
                else "Unknown"
            ),
            "id": lab_order.walkin_patient_id
            or (lab_order.patient.mrn if lab_order.patient else ""),
        },
        "results": results,
    }


def generate_result_pdf_bytes(lab_order: LabOrder, payload: dict) -> bytes:
    """Generate a compact PDF package for outbound standalone LIS delivery."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Standalone LIS Result Package", styles["Title"]),
        Spacer(1, 8 * mm),
        Paragraph(f"Order: {lab_order.order_number}", styles["Normal"]),
        Paragraph(f"Patient: {payload['patient']['name']}", styles["Normal"]),
        Paragraph(f"Released: {payload.get('released_at') or 'N/A'}", styles["Normal"]),
        Spacer(1, 6 * mm),
    ]
    for result in payload.get("results", []):
        story.append(
            Paragraph(
                f"{result['test_code']} - {result['test_name']}: {result['result'] or '-'} {result['unit'] or ''}",
                styles["BodyText"],
            )
        )
    doc.build(story)
    return buffer.getvalue()


def generate_invoice_pdf_bytes(invoice) -> bytes:
    """Generate a printable invoice PDF optimized for standalone labs."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Standalone LIS Invoice", styles["Title"]),
        Spacer(1, 6 * mm),
        Paragraph(f"Invoice: {invoice.invoice_number}", styles["Normal"]),
        Paragraph(f"Date: {invoice.invoice_date.isoformat()}", styles["Normal"]),
        Paragraph(f"Patient: {invoice.patient}", styles["Normal"]),
        Paragraph(f"Payer: {invoice.get_payer_type_display()}", styles["Normal"]),
        Spacer(1, 5 * mm),
    ]

    for line in invoice.items.all().order_by("created_at"):
        story.append(
            Paragraph(
                f"{line.description}: {line.quantity} x {line.unit_price} = {line.line_total} KES",
                styles["BodyText"],
            )
        )

    story.extend(
        [
            Spacer(1, 6 * mm),
            Paragraph(f"Subtotal: {invoice.subtotal} KES", styles["Normal"]),
            Paragraph(f"Discount: {invoice.discount_amount} KES", styles["Normal"]),
            Paragraph(f"Total: {invoice.total_amount} KES", styles["Heading3"]),
            Paragraph(f"Paid: {invoice.amount_paid} KES", styles["Normal"]),
            Paragraph(f"Balance: {invoice.balance_due} KES", styles["Normal"]),
        ]
    )
    doc.build(story)
    return buffer.getvalue()


def deliver_result(log: ResultDeliveryLog, destination: str) -> ResultDeliveryLog:
    """Attempt outbound result delivery for the requested channel."""
    payload = build_result_payload(log.lab_order)
    log.payload = payload
    log.destination = destination
    log.attempt_count += 1

    try:
        if log.channel == ResultDeliveryLog.Channel.PDF_PACKAGE:
            log.pdf_filename = f"lab-result-{log.lab_order.order_number}.pdf"
            log.pdf_package = generate_result_pdf_bytes(log.lab_order, payload)
            log.status = ResultDeliveryLog.Status.DELIVERED
            log.delivered_at = timezone.now()
            log.response_status_code = 200
            log.response_body = "PDF package generated."
        else:
            if not destination:
                raise ValueError("destination is required for webhook or HL7/FHIR channel")

            parsed = urlparse(destination)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("destination must be an absolute http(s) URL")

            encoded = json.dumps(payload).encode("utf-8")
            req = urllib_request.Request(  # noqa: S310
                destination,
                data=encoded,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib_request.urlopen(req, timeout=10) as response:  # noqa: S310 # nosec B310
                response_body = response.read().decode("utf-8")
                status_code = int(getattr(response, "status", 200))

            if 200 <= status_code < 300:
                log.status = ResultDeliveryLog.Status.DELIVERED
                log.delivered_at = timezone.now()
                log.response_status_code = status_code
                log.response_body = response_body
            else:
                log.status = ResultDeliveryLog.Status.FAILED
                log.response_status_code = status_code
                log.error_message = f"Unexpected response status {status_code}"
                log.response_body = response_body
    except (ValueError, urllib_error.URLError, urllib_error.HTTPError) as exc:
        log.status = ResultDeliveryLog.Status.FAILED
        log.error_message = str(exc)

    log.save(
        update_fields=[
            "payload",
            "destination",
            "attempt_count",
            "status",
            "delivered_at",
            "response_status_code",
            "response_body",
            "error_message",
            "pdf_filename",
            "pdf_package",
            "updated_at",
        ]
    )
    return log


def extract_test_codes_for_validation(message_format: str, hl7_message: str = "", payload=None):
    """Extract test codes from HL7 or JSON inbound payload for mapping validation."""
    if message_format == "HL7":
        segments = _parse_hl7_segments(hl7_message)
        return [
            code
            for code in [obr.get("universal_service_id", "") for obr in segments.get("OBR", [])]
            if code
        ]

    tests = (payload or {}).get("tests") or []
    codes = []
    for item in tests:
        if isinstance(item, dict):
            code = str(item.get("code", "")).strip()
            if code:
                codes.append(code)
    return codes


def validate_message_mappings(source_system: str, test_codes: list[str], facility=None) -> dict:
    """Validate inbound test codes against message mapping config and local test catalog."""
    mapping_rows = []
    mapped = 0
    unmapped = 0

    test_ct = ContentType.objects.get_for_model(TestCatalog)

    for external_code in test_codes:
        row = {
            "external_code": external_code,
            "mapped": False,
            "mapping_source": "none",
            "test_code": None,
            "test_name": None,
            "reason": "No mapping found",
        }

        mapping = ExternalCodeMapping.objects.filter(
            code_system=source_system,
            external_code=external_code,
            content_type=test_ct,
            is_active=True,
        ).first()

        if mapping is not None:
            test = TestCatalog.objects.filter(pk=mapping.object_id).first()
            if test and (facility is None or test.facility_id == getattr(facility, "id", None)):
                row.update(
                    {
                        "mapped": True,
                        "mapping_source": "external_code_mapping",
                        "test_code": test.code,
                        "test_name": test.name,
                        "reason": "Mapped via ExternalCodeMapping",
                    }
                )

        if not row["mapped"]:
            direct = _resolve_test_code(external_code, facility=facility)
            if direct is not None:
                row.update(
                    {
                        "mapped": True,
                        "mapping_source": "direct_catalog",
                        "test_code": direct.code,
                        "test_name": direct.name,
                        "reason": "Resolved directly from local test catalog",
                    }
                )

        if row["mapped"]:
            mapped += 1
        else:
            unmapped += 1
        mapping_rows.append(row)

    return {
        "source_system": source_system,
        "total_codes": len(test_codes),
        "mapped_count": mapped,
        "unmapped_count": unmapped,
        "mappings": mapping_rows,
    }


def _parse_hl7_segments(raw_message: str) -> dict:
    """
    Parse HL7 v2.x message into structured segments.

    Supports basic field extraction from MSH, PID, ORC, and OBR segments.
    """
    segments = {"OBR": []}
    lines = raw_message.strip().split("\r")
    if len(lines) <= 1:
        lines = raw_message.strip().split("\n")

    for line in lines:
        fields = line.split("|")
        segment_type = fields[0] if fields else ""

        if segment_type == "MSH" and len(fields) >= 10:
            segments["MSH"] = {
                "sending_application": fields[2] if len(fields) > 2 else "",
                "sending_facility": fields[3] if len(fields) > 3 else "",
                "receiving_application": fields[4] if len(fields) > 4 else "",
                "receiving_facility": fields[5] if len(fields) > 5 else "",
                "message_control_id": fields[9] if len(fields) > 9 else "",
            }
        elif segment_type == "PID" and len(fields) >= 6:
            # PID|1||patient_id||last^first||DOB|gender
            patient_id_field = fields[3] if len(fields) > 3 else ""
            name_field = fields[5] if len(fields) > 5 else ""
            dob_field = fields[7] if len(fields) > 7 else ""
            gender_field = fields[8] if len(fields) > 8 else ""

            # Parse name (LAST^FIRST format)
            name_parts = name_field.split("^")
            patient_name = f"{name_parts[1]} {name_parts[0]}" if len(name_parts) > 1 else name_field

            # Parse DOB
            patient_dob = None
            if dob_field and len(dob_field) >= 8:
                import contextlib

                with contextlib.suppress(ValueError):
                    patient_dob = datetime.strptime(dob_field[:8], "%Y%m%d").date()

            # Map HL7 gender
            gender_map = {"M": "M", "F": "F", "O": "O", "U": "", "A": "O"}
            gender = gender_map.get(gender_field, "")

            segments["PID"] = {
                "patient_id": patient_id_field,
                "patient_name": patient_name,
                "date_of_birth": patient_dob,
                "gender": gender,
                "id_number": patient_id_field,
            }
        elif segment_type == "ORC" and len(fields) >= 5:
            segments["ORC"] = {
                "order_control": fields[1] if len(fields) > 1 else "",
                "placer_order_number": fields[2] if len(fields) > 2 else "",
                "filler_order_number": fields[3] if len(fields) > 3 else "",
                "priority": _parse_hl7_priority(fields[7] if len(fields) > 7 else ""),
            }
        elif segment_type == "OBR" and len(fields) >= 5:
            # OBR|seq|placer|filler|test_id^test_name|||...|||clinical_info
            test_field = fields[4] if len(fields) > 4 else ""
            test_parts = test_field.split("^")
            segments["OBR"].append(
                {
                    "universal_service_id": test_parts[0] if test_parts else "",
                    "test_name": test_parts[1] if len(test_parts) > 1 else "",
                    "clinical_info": fields[13] if len(fields) > 13 else "",
                }
            )

    return segments


def _parse_hl7_priority(priority_code: str) -> str:
    """Map HL7 priority code to our priority choices."""
    mapping = {
        "S": "STAT",
        "A": "STAT",
        "R": "ROUTINE",
        "P": "ROUTINE",
        "T": "URGENT",
        "": "ROUTINE",
    }
    return mapping.get(priority_code.upper(), "ROUTINE")


def _map_hl7_priority(priority: str) -> str:
    """Map stored priority to our LabOrder priority choices."""
    valid = {"ROUTINE", "URGENT", "STAT"}
    return priority if priority in valid else "ROUTINE"


def _resolve_test_code(code: str, facility=None) -> TestCatalog | None:
    """
    Resolve an external test code to a TestCatalog entry.

    Tries: exact code match → LOINC code → short name.
    """
    if not code:
        return None

    # Try exact code match
    scoped_lookup = TestCatalog.objects.all()
    if facility is not None:
        scoped_lookup = scoped_lookup.filter(facility=facility)

    test = scoped_lookup.filter(code=code).first()
    if not test:
        test = TestCatalog.objects.filter(code=code).first()
    if test:
        return test

    # Try LOINC code
    test = scoped_lookup.filter(loinc_code=code).first()
    if not test:
        test = TestCatalog.objects.filter(loinc_code=code).first()
    if test:
        return test

    # Try short name (case-insensitive)
    test = scoped_lookup.filter(short_name__iexact=code).first()
    if not test:
        test = TestCatalog.objects.filter(short_name__iexact=code).first()
    if test:
        return test

    # Try via ExternalCodeMapping
    try:
        from hmis.apps.core.models import ExternalCodeMapping

        mapped = ExternalCodeMapping.resolve("LIS_DEFAULT", code)
        if mapped and isinstance(mapped, TestCatalog):
            return mapped
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):  # noqa: S110
        logger.debug("ExternalCodeMapping unavailable for code: %s", code)

    return None
