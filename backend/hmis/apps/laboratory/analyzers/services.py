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

from .models import AnalyzerMessage, InstrumentChannel
from .protocols import ASTMAdapter, HL7BidirectionalAdapter, ProtocolAdapter, SerialBridgeAdapter
from .protocols.base import ParsedMessage, ProtocolError

logger = logging.getLogger(__name__)


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
            # Host query — generate work order response
            # TODO: [AFTER PILOT] Auto-respond to host queries with pending work orders
            logger.info(
                f"Host query received for sample {parsed.sample_id} on channel {channel.name}"
            )

        message.save()
        return message

    except ProtocolError as e:
        logger.warning(f"Protocol error processing message on {channel}: {e}")
        message.mark_failed(f"Protocol error: {e}")
        channel.update_status(InstrumentChannel.ConnectionStatus.ERROR, str(e))
        return message
    except Exception as e:
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
        "is_healthy": is_healthy,
    }


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
