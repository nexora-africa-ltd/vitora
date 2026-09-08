# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Analyzer message processing service.

Handles:
- Inbound message parsing and result application
- Outbound work order generation
- Sample ID resolution (barcode → specimen → lab order item)
- Connection status management
"""

import logging
from datetime import timedelta

from django.utils import timezone

from hmis.apps.laboratory.models import LabOrderItem, LabResult, Specimen
from hmis.apps.laboratory.services.mllp_client import (
    MLLPClient,
    MLLPConfig,
    MLLPConnectionError,
    MLLPFramingError,
    MLLPTimeoutError,
)

from .models import AnalyzerMessage, InstrumentChannel
from .protocols import ASTMAdapter, HL7BidirectionalAdapter, ProtocolAdapter, SerialBridgeAdapter
from .protocols.base import ParsedMessage, ProtocolError

logger = logging.getLogger(__name__)


def dispatch_pending_outbound_messages(channel_id: int | None = None, batch_size: int = 50) -> dict:
    """Send queued outbound analyzer messages over configured channel transport."""
    pending = AnalyzerMessage.objects.select_related("channel").filter(
        direction=AnalyzerMessage.Direction.OUTBOUND,
        status=AnalyzerMessage.Status.PENDING,
        channel__is_active=True,
    )

    if channel_id:
        pending = pending.filter(channel_id=channel_id)

    pending = pending.order_by("timestamp")[:batch_size]
    results = {
        "attempted": 0,
        "sent": 0,
        "acked": 0,
        "rejected": 0,
        "timeouts": 0,
        "failed": 0,
    }

    for message in pending:
        results["attempted"] += 1
        send_result = transmit_outbound_message(message)
        if send_result["status"] == "acked":
            results["sent"] += 1
            results["acked"] += 1
        elif send_result["status"] == "sent_no_ack":
            results["sent"] += 1
        elif send_result["status"] == "rejected":
            results["rejected"] += 1
        elif send_result["status"] == "timeout":
            results["timeouts"] += 1
        else:
            results["failed"] += 1

    return results


def transmit_outbound_message(message: AnalyzerMessage) -> dict:
    """Transmit one outbound analyzer message and process synchronous ACK response."""
    channel = message.channel
    adapter = get_adapter_for_channel(channel)

    if channel.protocol != InstrumentChannel.Protocol.HL7:
        message.mark_failed("Outbound transport worker currently supports HL7 channels only.")
        return {"status": "failed", "reason": "unsupported_protocol"}

    config = MLLPConfig(
        host=channel.host,
        port=channel.port,
        timeout=float(channel.config.get("timeout", 30.0)),
        receive_timeout=float(channel.config.get("receive_timeout", 30.0)),
        max_retries=int(channel.config.get("max_retries", 1)),
        use_ssl=bool(channel.config.get("use_ssl", False)),
        ssl_verify=bool(channel.config.get("ssl_verify", True)),
    )

    try:
        with MLLPClient(config) as client:
            response = client.send_message(message.raw_data, wait_for_ack=True)
    except MLLPTimeoutError as exc:
        message.mark_timeout()
        message.error_message = str(exc)
        message.save(update_fields=["error_message"])
        channel.update_status(InstrumentChannel.ConnectionStatus.ERROR, str(exc))
        return {"status": "timeout", "reason": str(exc)}
    except (MLLPConnectionError, MLLPFramingError, OSError, ValueError, TypeError) as exc:
        message.mark_failed(str(exc))
        channel.update_status(InstrumentChannel.ConnectionStatus.ERROR, str(exc))
        return {"status": "failed", "reason": str(exc)}

    channel.update_status(InstrumentChannel.ConnectionStatus.CONNECTED)
    message.mark_sent()

    if not response:
        return {"status": "sent_no_ack"}

    parsed_ack = adapter.parse_message(response.message)
    ack_meta = parsed_ack.raw_fields.get("meta", {}) if parsed_ack.raw_fields else {}
    ack_code = ack_meta.get("ack_code", "")

    AnalyzerMessage.objects.create(
        channel=channel,
        direction=AnalyzerMessage.Direction.INBOUND,
        message_type=AnalyzerMessage.MessageType.ACK_HL7,
        status=AnalyzerMessage.Status.RECEIVED,
        raw_data=response.message,
        parsed_data=parsed_ack.raw_fields,
        sample_id=message.sample_id,
        specimen=message.specimen,
        facility=channel.facility,
        organization=channel.organization,
    )

    message.parsed_data = {
        **(message.parsed_data or {}),
        "transport": {
            "ack_code": ack_code,
            "ack_message_control_id": ack_meta.get("ack_message_control_id", ""),
            "ack_error_code": ack_meta.get("ack_error_code", ""),
            "ack_error_text": ack_meta.get("ack_error_text", ""),
            "response_time_ms": response.response_time_ms,
        },
    }
    message.save(update_fields=["parsed_data"])

    if ack_code in {"AE", "AR"}:
        message.status = AnalyzerMessage.Status.REJECTED
        message.error_message = ack_meta.get("ack_error_text", "Remote endpoint rejected message")
        message.save(update_fields=["status", "error_message"])
        return {"status": "rejected", "ack_code": ack_code}

    return {"status": "acked", "ack_code": ack_code or "AA"}


def get_adapter_for_channel(channel: InstrumentChannel) -> ProtocolAdapter:
    """
    Get the appropriate protocol adapter for a channel.

    Args:
        channel: InstrumentChannel instance

    Returns:
        Configured ProtocolAdapter subclass
    """
    config = channel.config or {}
    field_mapping = channel.field_mapping or {}

    adapter_map = {
        InstrumentChannel.Protocol.ASTM: ASTMAdapter,
        InstrumentChannel.Protocol.HL7: HL7BidirectionalAdapter,
        InstrumentChannel.Protocol.SERIAL: SerialBridgeAdapter,
        InstrumentChannel.Protocol.TCP: ASTMAdapter,  # Default to ASTM for raw TCP
    }

    adapter_class = adapter_map.get(channel.protocol)
    if not adapter_class:
        raise ProtocolError(f"Unsupported protocol: {channel.protocol}")

    return adapter_class(config, field_mapping)


def resolve_specimen_from_sample_id(
    sample_id: str, facility_id: int | None = None
) -> Specimen | None:
    """
    Resolve a sample ID (barcode) to a Specimen record.

    Args:
        sample_id: Barcode or specimen identifier from analyzer message
        facility_id: Optional facility to scope the search

    Returns:
        Specimen instance or None
    """
    if not sample_id:
        return None

    queryset = Specimen.objects.select_related("lab_order")

    if facility_id:
        queryset = queryset.filter(lab_order__facility_id=facility_id)

    # Try exact barcode match first
    specimen = queryset.filter(barcode=sample_id).first()
    if specimen:
        return specimen

    # Try matching against lab order number
    specimen = queryset.filter(lab_order__order_number=sample_id).first()
    if specimen:
        return specimen

    # Try partial match (some analyzers truncate barcodes)
    specimen = queryset.filter(barcode__endswith=sample_id[-10:]).first()
    return specimen


def resolve_lab_order_item(specimen: Specimen, test_code: str) -> LabOrderItem | None:
    """
    Resolve a test code to a specific LabOrderItem on the specimen's order.

    Args:
        specimen: The specimen linked to the order
        test_code: Test/analyte code from analyzer

    Returns:
        LabOrderItem instance or None
    """
    if not specimen or not test_code:
        return None

    # Try matching by test catalog code
    item = LabOrderItem.objects.filter(
        lab_order=specimen.lab_order,
        test__code__iexact=test_code,
    ).first()

    if item:
        return item

    # Try matching by LOINC code
    item = LabOrderItem.objects.filter(
        lab_order=specimen.lab_order,
        test__loinc_code__iexact=test_code,
    ).first()

    return item


def process_inbound_message(channel: InstrumentChannel, raw_data: str) -> AnalyzerMessage:
    """
    Process an inbound message from an analyzer.

    1. Create AnalyzerMessage record
    2. Parse using protocol adapter
    3. Resolve specimen and lab order item
    4. If result message, apply result to LabResult

    Args:
        channel: The channel the message arrived on
        raw_data: Raw protocol data

    Returns:
        AnalyzerMessage with processing result
    """
    # Create message record
    message = AnalyzerMessage.objects.create(
        channel=channel,
        direction=AnalyzerMessage.Direction.INBOUND,
        raw_data=raw_data,
        status=AnalyzerMessage.Status.RECEIVED,
        facility=channel.facility,
        organization=channel.organization,
    )

    # Update channel activity
    channel.update_status(InstrumentChannel.ConnectionStatus.CONNECTED)

    try:
        # Parse message
        adapter = get_adapter_for_channel(channel)
        parsed = adapter.parse_message(raw_data)

        if parsed.has_errors:
            message.mark_failed("; ".join(parsed.errors))
            return message

        # Update message metadata
        message.message_type = _map_parsed_type(parsed.message_type)
        message.sample_id = parsed.sample_id
        message.test_code = parsed.test_code
        message.result_value = parsed.result_value
        message.result_unit = parsed.result_unit
        message.parsed_data = parsed.raw_fields

        # Resolve specimen
        specimen = resolve_specimen_from_sample_id(
            parsed.sample_id, facility_id=channel.facility_id
        )
        if specimen:
            message.specimen = specimen

        # Resolve lab order item
        if specimen and parsed.test_code:
            lab_order_item = resolve_lab_order_item(specimen, parsed.test_code)
            if lab_order_item:
                message.lab_order_item = lab_order_item

        message.mark_parsed(parsed.raw_fields)

        # If this is a result, apply it
        if parsed.is_result and message.specimen and message.lab_order_item:
            _apply_result(message, parsed)
            message.mark_applied()
        elif parsed.is_query:
            _handle_hl7_query_workflow(channel, message, parsed)

        message.save()
        return message

    except ProtocolError as e:
        logger.warning(f"Protocol error processing message on {channel}: {e}")
        message.mark_failed(f"Protocol error: {e}")
        channel.update_status(InstrumentChannel.ConnectionStatus.ERROR, str(e))
        return message
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ) as e:
        logger.error(f"Unexpected error processing analyzer message: {e}", exc_info=True)
        message.mark_failed(f"Unexpected error: {e}")
        return message


def build_work_order(channel: InstrumentChannel, specimen: Specimen) -> AnalyzerMessage | None:
    """
    Build and record a work order download message for an analyzer.

    Generates the protocol-specific order message for a specimen's
    pending tests and records it as an outbound AnalyzerMessage.

    Args:
        channel: Channel to send the order on
        specimen: Specimen with pending lab order items

    Returns:
        AnalyzerMessage (outbound, PENDING) or None if no pending items
    """
    # Get pending order items for this specimen
    pending_items = LabOrderItem.objects.filter(
        lab_order=specimen.lab_order,
        status__in=["PENDING", "IN_PROGRESS"],
    ).select_related("test")

    if not pending_items.exists():
        return None

    test_codes = [item.test.code for item in pending_items]
    patient_id = str(specimen.lab_order.patient_id) if specimen.lab_order.patient_id else ""
    priority = specimen.lab_order.priority or "ROUTINE"

    # Build protocol message
    adapter = get_adapter_for_channel(channel)
    raw_message = adapter.build_order_message(
        sample_id=specimen.barcode,
        test_codes=test_codes,
        patient_id=patient_id,
        priority=priority,
    )

    # Record outbound message
    message = AnalyzerMessage.objects.create(
        channel=channel,
        direction=AnalyzerMessage.Direction.OUTBOUND,
        message_type=AnalyzerMessage.MessageType.ORDER_DOWNLOAD,
        raw_data=raw_message,
        status=AnalyzerMessage.Status.PENDING,
        specimen=specimen,
        sample_id=specimen.barcode,
        facility=channel.facility,
        organization=channel.organization,
    )

    return message


def get_pending_work_orders(channel: InstrumentChannel) -> list[dict]:
    """
    Get specimens with pending work orders for a channel's instrument.

    Returns specimens that have been collected but not yet have results
    from this instrument's department.

    Args:
        channel: InstrumentChannel to find orders for

    Returns:
        List of dicts with specimen/order info for work order generation
    """
    department = channel.instrument.department
    facility = channel.facility

    # Find specimens with pending items in this instrument's department
    pending_items = LabOrderItem.objects.filter(
        lab_order__facility=facility,
        lab_order__status__in=["ORDERED", "SPECIMEN_COLLECTED", "IN_PROGRESS"],
        status__in=["ORDERED", "IN_PROGRESS"],
    ).select_related("lab_order", "test")

    if department:
        pending_items = pending_items.filter(test__category__iexact=department)

    # Group by specimen
    orders = []
    seen_specimens = set()
    for item in pending_items:
        specimen = item.lab_order.specimens.first()
        if specimen and specimen.id not in seen_specimens:
            seen_specimens.add(specimen.id)
            orders.append(
                {
                    "specimen_id": specimen.id,
                    "barcode": specimen.barcode,
                    "order_number": item.lab_order.order_number,
                    "patient_id": item.lab_order.patient_id,
                    "test_codes": list(
                        LabOrderItem.objects.filter(
                            lab_order=item.lab_order,
                            status__in=["ORDERED", "IN_PROGRESS"],
                        ).values_list("test__code", flat=True)
                    ),
                    "priority": item.lab_order.priority,
                }
            )

    return orders


def check_channel_health(channel: InstrumentChannel) -> dict:
    """
    Check and update channel connection health.

    Returns status dict with connection info and recent activity summary.
    """
    now = timezone.now()
    idle_threshold = timedelta(minutes=int(channel.config.get("idle_timeout_minutes", 30)))

    # Check if channel has gone idle
    if (
        channel.connection_status == InstrumentChannel.ConnectionStatus.CONNECTED
        and channel.last_activity_at
        and (now - channel.last_activity_at) > idle_threshold
    ):
        channel.update_status(InstrumentChannel.ConnectionStatus.IDLE)

    # Recent message stats
    last_hour = now - timedelta(hours=1)
    recent_hour_messages = channel.messages.filter(timestamp__gte=last_hour)
    messages_last_hour = recent_hour_messages.count()
    errors_last_hour = recent_hour_messages.filter(status=AnalyzerMessage.Status.FAILED).count()
    queue_depth = channel.messages.filter(
        status__in=[AnalyzerMessage.Status.PENDING, AnalyzerMessage.Status.RECEIVED]
    ).count()
    error_rate = (errors_last_hour / messages_last_hour) if messages_last_hour > 0 else 0.0

    is_healthy = (
        channel.connection_status
        in (
            InstrumentChannel.ConnectionStatus.CONNECTED,
            InstrumentChannel.ConnectionStatus.IDLE,
        )
        and errors_last_hour == 0
    )

    return {
        "channel_id": channel.id,
        "instrument_code": channel.instrument.code,
        "channel_name": channel.name,
        "connection_status": channel.connection_status,
        "last_activity_at": channel.last_activity_at.isoformat()
        if channel.last_activity_at
        else None,
        "last_error": channel.last_error,
        "messages_last_hour": messages_last_hour,
        "errors_last_hour": errors_last_hour,
        "queue_depth": queue_depth,
        "error_rate": round(error_rate, 3),
        "is_healthy": is_healthy,
    }


def explain_message_failure(message: AnalyzerMessage) -> dict:
    """Return structured parser diagnostics for a failed analyzer message."""
    root_cause = message.error_message or "Unknown parse/application error"
    protocol = message.channel.protocol

    recommendation = "Inspect raw payload and field mapping configuration."
    if "checksum" in root_cause.lower():
        recommendation = (
            "Validate analyzer framing/checksum settings and ensure baud/parity match the device."
        )
    elif "unsupported protocol" in root_cause.lower():
        recommendation = "Confirm channel protocol matches analyzer output format."
    elif "sample" in root_cause.lower() and "not" in root_cause.lower():
        recommendation = (
            "Verify sample/barcode mapping and that the specimen exists in the lab queue."
        )

    next_action = "Replay this message after applying the recommended fix."
    return {
        "message_id": message.id,
        "channel_id": message.channel_id,
        "protocol": protocol,
        "status": message.status,
        "root_cause": root_cause,
        "recommended_fix": recommendation,
        "next_action": next_action,
        "sample_id": message.sample_id,
        "test_code": message.test_code,
    }


def replay_inbound_analyzer_message(message: AnalyzerMessage) -> AnalyzerMessage:
    """Replay a previously captured inbound analyzer message safely."""
    if message.direction != AnalyzerMessage.Direction.INBOUND:
        raise ProtocolError("Only inbound messages can be replayed.")

    replayed = process_inbound_message(message.channel, message.raw_data)
    replayed.parsed_data = {
        **(replayed.parsed_data or {}),
        "replayed_from_message_id": message.id,
    }
    replayed.save(update_fields=["parsed_data"])
    return replayed


def _map_parsed_type(parsed_type: str) -> str:
    """Map ParsedMessage type to AnalyzerMessage.MessageType."""
    type_map = {
        "RESULT": AnalyzerMessage.MessageType.RESULT,
        "QUERY": AnalyzerMessage.MessageType.QUERY,
        "ORDER": AnalyzerMessage.MessageType.ORDER_DOWNLOAD,
        "ACK": AnalyzerMessage.MessageType.ACK,
        "NAK": AnalyzerMessage.MessageType.NAK,
        "STATUS": AnalyzerMessage.MessageType.STATUS,
    }
    return type_map.get(parsed_type, AnalyzerMessage.MessageType.RAW)


def _apply_result(message: AnalyzerMessage, parsed: ParsedMessage) -> None:
    """
    Apply parsed result to LabResult model.

    Creates or updates a LabResult for the linked lab_order_item.
    """
    lab_order_item = message.lab_order_item
    if not lab_order_item:
        return

    # Check if result already exists for this order item
    existing = LabResult.objects.filter(order_item=lab_order_item).first()

    # Map analyzer flags to LabResult flag choices
    flag_map = {
        "H": "HIGH",
        "HH": "CRITICAL_HIGH",
        "L": "LOW",
        "LL": "CRITICAL_LOW",
        "A": "ABNORMAL",
        "N": "NORMAL",
    }
    result_flag = flag_map.get(parsed.result_flags, "")
    is_critical = parsed.result_flags in ("HH", "LL")

    # Determine numeric vs text value
    numeric_value = None
    text_value = ""
    try:
        numeric_value = float(parsed.result_value) if parsed.result_value else None
    except (ValueError, TypeError):
        text_value = parsed.result_value or ""

    result_data = {
        "numeric_value": numeric_value,
        "text_value": text_value,
        "result_unit": parsed.result_unit or "",
        "result_flag": result_flag,
        "is_critical_result": is_critical,
        "equipment": message.channel.name,
        "specimen": message.specimen,
    }

    if existing:
        # Update existing result
        for key, value in result_data.items():
            setattr(existing, key, value)
        existing.save()
        logger.info(
            f"Updated result for order item {lab_order_item.id} "
            f"from analyzer {message.channel.name}"
        )
    else:
        # Create new result
        # TODO: [AFTER PILOT] Handle multi-result messages (e.g., CBC with 20+ parameters)
        # Currently creates one result per message. Real analyzers send batch results
        # that need to be split into individual LabResult records per analyte.
        # Use the ordering clinician as entered_by (auto-import attribution)
        entered_by = lab_order_item.lab_order.ordered_by
        LabResult.objects.create(
            order_item=lab_order_item,
            entered_by=entered_by,
            **result_data,
        )
        logger.info(
            f"Created result for order item {lab_order_item.id} "
            f"from analyzer {message.channel.name}"
        )


def _handle_hl7_query_workflow(
    channel: InstrumentChannel,
    inbound_message: AnalyzerMessage,
    parsed: ParsedMessage,
) -> list[AnalyzerMessage]:
    """Build and queue Goldsite QCK/DSR responses for HL7 query workflows."""
    if channel.protocol != InstrumentChannel.Protocol.HL7:
        logger.info(
            "Query workflow skipped for non-HL7 channel %s (sample=%s)",
            channel.name,
            parsed.sample_id,
        )
        return []

    adapter = get_adapter_for_channel(channel)
    query_meta = parsed.raw_fields.get("meta", {}) if parsed.raw_fields else {}
    query_id = (parsed.raw_fields.get("QRD", {}).get("4", "") if parsed.raw_fields else "") or "1"
    incoming_control_id = query_meta.get("message_control_id", "") or "UNKNOWN"

    qck_payload = adapter.build_query_ack(
        query_id=query_id,
        original_message_control_id=incoming_control_id,
        accepted=True,
    )
    qck_message = AnalyzerMessage.objects.create(
        channel=channel,
        direction=AnalyzerMessage.Direction.OUTBOUND,
        message_type=AnalyzerMessage.MessageType.ACK_HL7,
        status=AnalyzerMessage.Status.PENDING,
        raw_data=qck_payload,
        sample_id=parsed.sample_id,
        specimen=inbound_message.specimen,
        facility=channel.facility,
        organization=channel.organization,
        parsed_data={
            "workflow": "QRY_Q02_QCK_Q02",
            "query_id": query_id,
            "inbound_message_id": inbound_message.id,
        },
    )

    pending_item_ids: list[str] = []
    completed_or_not_found = True
    if inbound_message.specimen:
        pending_items = LabOrderItem.objects.filter(
            lab_order=inbound_message.specimen.lab_order,
            status__in=["PENDING", "IN_PROGRESS", "ORDERED"],
        ).select_related("test")

        pending_item_ids = [
            item.test.code for item in pending_items if item.test and item.test.code
        ]
        completed_or_not_found = len(pending_item_ids) == 0

    dsr_payload = adapter.build_display_response(
        query_id=query_id,
        original_message_control_id=incoming_control_id,
        sample_id=parsed.sample_id,
        pending_item_ids=pending_item_ids,
        completed_or_not_found=completed_or_not_found,
    )
    dsr_message = AnalyzerMessage.objects.create(
        channel=channel,
        direction=AnalyzerMessage.Direction.OUTBOUND,
        message_type=AnalyzerMessage.MessageType.ORDER_DOWNLOAD,
        status=AnalyzerMessage.Status.PENDING,
        raw_data=dsr_payload,
        sample_id=parsed.sample_id,
        specimen=inbound_message.specimen,
        facility=channel.facility,
        organization=channel.organization,
        parsed_data={
            "workflow": "QRY_Q02_DSR_Q03",
            "query_id": query_id,
            "inbound_message_id": inbound_message.id,
            "pending_item_ids": pending_item_ids,
            "completed_or_not_found": completed_or_not_found,
        },
    )

    logger.info(
        "Queued Goldsite query response messages for sample %s on channel %s (qck=%s, dsr=%s)",
        parsed.sample_id,
        channel.name,
        qck_message.id,
        dsr_message.id,
    )
    return [qck_message, dsr_message]
