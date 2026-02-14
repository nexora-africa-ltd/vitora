"""
HL7 v2.x Message Service for Laboratory Integration.

This module provides functionality for generating and parsing HL7 v2.5.1 messages
for laboratory system integration. It supports:
- ORM^O01 (Lab Order) message generation
- ORU^R01 (Lab Result) message parsing
- ACK message handling

Sprint Phase 4: HL7 v2 Messaging (Lab Integration)
Reference: docs/fhir-validation-plan.md

HL7 v2.5.1 Specification Reference:
https://www.hl7.org/implement/standards/product_brief.cfm?product_id=144
"""

from __future__ import annotations

import contextlib
import decimal
import logging
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

if TYPE_CHECKING:
    from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult

logger = logging.getLogger(__name__)
User = get_user_model()


# HL7 message delimiters
FIELD_SEPARATOR = "|"
COMPONENT_SEPARATOR = "^"
REPETITION_SEPARATOR = "~"
ESCAPE_CHARACTER = "\\"
SUBCOMPONENT_SEPARATOR = "&"
ENCODING_CHARACTERS = (
    f"{COMPONENT_SEPARATOR}{REPETITION_SEPARATOR}{ESCAPE_CHARACTER}{SUBCOMPONENT_SEPARATOR}"
)


class HL7ServiceError(Exception):
    """Base exception for HL7 service errors."""

    pass


class HL7ValidationError(HL7ServiceError):
    """Raised when HL7 message validation fails."""

    pass


class HL7ParseError(HL7ServiceError):
    """Raised when HL7 message parsing fails."""

    pass


@dataclass
class HL7AckResponse:
    """HL7 Acknowledgment response structure."""

    ack_code: str  # AA (Accept), AE (Error), AR (Reject)
    message_control_id: str
    text_message: str
    error_code: str | None = None
    error_location: str | None = None


@dataclass
class HL7LabResult:
    """Parsed lab result from HL7 ORU message."""

    order_control: str
    placer_order_number: str
    filler_order_number: str
    test_code: str
    test_name: str
    value: str
    units: str | None
    reference_range: str | None
    abnormal_flag: str | None
    observation_status: str
    result_datetime: datetime | None
    performer_id: str | None
    performer_name: str | None


class HL7Service:
    """
    HL7 v2.5.1 Message Service.

    Handles generation and parsing of HL7 messages for laboratory integration.
    Supports ORM^O01 (Lab Orders) and ORU^R01 (Lab Results) message types.

    Usage:
        service = HL7Service()

        # Generate order message
        message = service.build_orm_o01(lab_order)

        # Parse result message
        results = service.parse_oru_r01(hl7_message)

        # Generate acknowledgment
        ack = service.build_ack(message_control_id, "AA", "Message accepted")
    """

    def __init__(
        self,
        sending_application: str | None = None,
        sending_facility: str | None = None,
        receiving_application: str | None = None,
        receiving_facility: str | None = None,
    ):
        """
        Initialize HL7 Service.

        Args:
            sending_application: Sending application name (default: VITORA_HMIS)
            sending_facility: Sending facility name (default from settings)
            receiving_application: Receiving application name
            receiving_facility: Receiving facility name
        """
        self.sending_application = sending_application or getattr(
            settings, "HL7_SENDING_APPLICATION", "VITORA_HMIS"
        )
        self.sending_facility = sending_facility or getattr(
            settings, "HL7_SENDING_FACILITY", "VITORA"
        )
        self.receiving_application = receiving_application or getattr(
            settings, "HL7_RECEIVING_APPLICATION", "LAB_LIS"
        )
        self.receiving_facility = receiving_facility or getattr(
            settings, "HL7_RECEIVING_FACILITY", "EXTERNAL_LAB"
        )

        # Message counter for control IDs
        self._message_counter = 0

    def _generate_message_control_id(self) -> str:
        """
        Generate unique message control ID.

        Returns:
            Unique message control ID string
        """
        self._message_counter += 1
        timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"MSG{timestamp}{self._message_counter:05d}"

    def _format_datetime(self, dt: datetime | None) -> str:
        """
        Format datetime for HL7 messages (yyyyMMddHHmmss).

        Args:
            dt: Datetime to format

        Returns:
            Formatted datetime string
        """
        if dt is None:
            return ""
        return dt.strftime("%Y%m%d%H%M%S")

    def _format_date(self, dt: datetime | date | str | None) -> str:
        """
        Format date for HL7 messages (yyyyMMdd).

        Args:
            dt: Date to format (datetime, date, or ISO string)

        Returns:
            Formatted date string
        """
        if dt is None:
            return ""
        if isinstance(dt, str):
            # Handle ISO date strings
            return dt.replace("-", "")[:8]
        return dt.strftime("%Y%m%d")

    def _parse_hl7_datetime(self, dt_str: str) -> datetime | None:
        """
        Parse HL7 datetime string.

        Args:
            dt_str: HL7 datetime string (yyyyMMddHHmmss or yyyyMMdd)

        Returns:
            Parsed datetime or None if invalid
        """
        if not dt_str:
            return None

        formats = ["%Y%m%d%H%M%S", "%Y%m%d%H%M", "%Y%m%d"]
        for fmt in formats:
            try:
                return datetime.strptime(dt_str[: len(fmt.replace("%", ""))], fmt)
            except ValueError:
                continue
        return None

    def _escape_hl7_text(self, text: str) -> str:
        """
        Escape special characters in HL7 text.

        Args:
            text: Text to escape

        Returns:
            Escaped text safe for HL7 messages
        """
        if not text:
            return ""
        # Replace special characters with escape sequences
        text = text.replace("\\", "\\E\\")
        text = text.replace("|", "\\F\\")
        text = text.replace("^", "\\S\\")
        text = text.replace("&", "\\T\\")
        text = text.replace("~", "\\R\\")
        return text

    def _unescape_hl7_text(self, text: str) -> str:
        """
        Unescape HL7 escape sequences.

        Args:
            text: HL7 escaped text

        Returns:
            Unescaped text
        """
        if not text:
            return ""
        text = text.replace("\\R\\", "~")
        text = text.replace("\\T\\", "&")
        text = text.replace("\\S\\", "^")
        text = text.replace("\\F\\", "|")
        text = text.replace("\\E\\", "\\")
        return text

    def _build_msh_segment(
        self,
        message_type: str,
        trigger_event: str,
        message_control_id: str | None = None,
    ) -> str:
        """
        Build MSH (Message Header) segment.

        Args:
            message_type: Message type (e.g., "ORM", "ORU", "ACK")
            trigger_event: Trigger event (e.g., "O01", "R01")
            message_control_id: Optional message control ID

        Returns:
            MSH segment string
        """
        msg_id = message_control_id or self._generate_message_control_id()
        timestamp = self._format_datetime(timezone.now())

        # MSH-1 is the field separator, MSH-2 is encoding characters
        # Rest of fields start at MSH-3
        fields = [
            "MSH",
            ENCODING_CHARACTERS,  # MSH-2
            self.sending_application,  # MSH-3
            self.sending_facility,  # MSH-4
            self.receiving_application,  # MSH-5
            self.receiving_facility,  # MSH-6
            timestamp,  # MSH-7
            "",  # MSH-8 Security
            f"{message_type}{COMPONENT_SEPARATOR}{trigger_event}",  # MSH-9
            msg_id,  # MSH-10
            "P",  # MSH-11 Processing ID (P=Production)
            "2.5.1",  # MSH-12 Version ID
        ]

        return FIELD_SEPARATOR.join(fields)

    def _build_pid_segment(self, lab_order: LabOrder) -> str:
        """
        Build PID (Patient Identification) segment.

        Args:
            lab_order: Lab order with patient information

        Returns:
            PID segment string
        """
        patient = lab_order.patient

        # Patient name: Last^First^Middle
        patient_name = f"{patient.last_name}{COMPONENT_SEPARATOR}{patient.first_name}"
        if hasattr(patient, "middle_name") and patient.middle_name:
            patient_name += f"{COMPONENT_SEPARATOR}{patient.middle_name}"

        # Date of birth
        dob = self._format_date(patient.date_of_birth) if patient.date_of_birth else ""

        # Gender (M, F, O, U)
        gender_map = {"M": "M", "F": "F", "O": "O"}
        gender = gender_map.get(patient.gender, "U")

        # Patient ID: MRN with assigning authority
        patient_id = (
            f"{patient.mrn}{COMPONENT_SEPARATOR}{COMPONENT_SEPARATOR}{COMPONENT_SEPARATOR}MRN"
        )

        # Phone number
        phone = getattr(patient, "phone_number", "") or ""

        fields = [
            "PID",
            "1",  # PID-1 Set ID
            "",  # PID-2 Patient ID (External)
            patient_id,  # PID-3 Patient Identifier List
            "",  # PID-4 Alternate Patient ID
            patient_name,  # PID-5 Patient Name
            "",  # PID-6 Mother's Maiden Name
            dob,  # PID-7 Date of Birth
            gender,  # PID-8 Sex
            "",  # PID-9 Patient Alias
            "",  # PID-10 Race
            "",  # PID-11 Patient Address
            "",  # PID-12 County Code
            phone,  # PID-13 Phone Number - Home
        ]

        return FIELD_SEPARATOR.join(fields)

    def _build_pv1_segment(self, lab_order: LabOrder) -> str:
        """
        Build PV1 (Patient Visit) segment.

        Args:
            lab_order: Lab order with encounter information

        Returns:
            PV1 segment string
        """
        encounter = lab_order.encounter

        # Patient class (I=Inpatient, O=Outpatient, E=Emergency)
        encounter_type_map = {
            "OPD": "O",
            "IPD": "I",
            "EMERGENCY": "E",
        }
        patient_class = encounter_type_map.get(getattr(encounter, "encounter_type", "OPD"), "O")

        # Attending doctor
        attending = ""
        if hasattr(encounter, "consulting_clinician") and encounter.consulting_clinician:
            clinician = encounter.consulting_clinician
            attending = (
                f"{clinician.id}{COMPONENT_SEPARATOR}"
                f"{getattr(clinician, 'last_name', '')}{COMPONENT_SEPARATOR}"
                f"{getattr(clinician, 'first_name', '')}"
            )

        # Visit number (encounter ID)
        visit_number = str(encounter.id)

        fields = [
            "PV1",
            "1",  # PV1-1 Set ID
            patient_class,  # PV1-2 Patient Class
            "",  # PV1-3 Assigned Patient Location
            "",  # PV1-4 Admission Type
            "",  # PV1-5 Preadmit Number
            "",  # PV1-6 Prior Patient Location
            attending,  # PV1-7 Attending Doctor
            "",  # PV1-8 Referring Doctor
            "",  # PV1-9 Consulting Doctor
            "",  # PV1-10 Hospital Service
            "",  # PV1-11 Temporary Location
            "",  # PV1-12 Preadmit Test Indicator
            "",  # PV1-13 Re-admission Indicator
            "",  # PV1-14 Admit Source
            "",  # PV1-15 Ambulatory Status
            "",  # PV1-16 VIP Indicator
            "",  # PV1-17 Admitting Doctor
            "",  # PV1-18 Patient Type
            visit_number,  # PV1-19 Visit Number
        ]

        return FIELD_SEPARATOR.join(fields)

    def _build_orc_segment(
        self,
        lab_order: LabOrder,
        order_control: str = "NW",
    ) -> str:
        """
        Build ORC (Common Order) segment.

        Args:
            lab_order: Lab order
            order_control: Order control code (NW=New, CA=Cancel, etc.)

        Returns:
            ORC segment string
        """
        # Placer order number (our order number)
        placer_order = lab_order.order_number

        # Filler order number (external lab's number, if available)
        filler_order = lab_order.external_accession_number or ""

        # Ordering provider
        ordering_provider = ""
        if lab_order.ordered_by:
            user = lab_order.ordered_by
            ordering_provider = (
                f"{user.id}{COMPONENT_SEPARATOR}"
                f"{getattr(user, 'last_name', '')}{COMPONENT_SEPARATOR}"
                f"{getattr(user, 'first_name', '')}"
            )

        # Order status
        status_map = {
            "DRAFT": "HD",  # Hold
            "ORDERED": "IP",  # In Progress
            "SPECIMEN_COLLECTED": "IP",
            "IN_PROGRESS": "IP",
            "COMPLETED": "CM",  # Completed
            "CANCELLED": "CA",  # Cancelled
            "REJECTED": "CA",
        }
        order_status = status_map.get(lab_order.status, "IP")

        # Date/time of transaction
        transaction_datetime = self._format_datetime(lab_order.ordered_at)

        fields = [
            "ORC",
            order_control,  # ORC-1 Order Control
            placer_order,  # ORC-2 Placer Order Number
            filler_order,  # ORC-3 Filler Order Number
            "",  # ORC-4 Placer Group Number
            order_status,  # ORC-5 Order Status
            "",  # ORC-6 Response Flag
            "",  # ORC-7 Quantity/Timing
            "",  # ORC-8 Parent
            transaction_datetime,  # ORC-9 Date/Time of Transaction
            "",  # ORC-10 Entered By
            "",  # ORC-11 Verified By
            ordering_provider,  # ORC-12 Ordering Provider
        ]

        return FIELD_SEPARATOR.join(fields)

    def _build_obr_segment(
        self,
        lab_order: LabOrder,
        order_item: LabOrderItem,
        set_id: int = 1,
    ) -> str:
        """
        Build OBR (Observation Request) segment.

        Args:
            lab_order: Lab order
            order_item: Lab order item with test details
            set_id: Sequence number for multiple OBRs

        Returns:
            OBR segment string
        """
        test = order_item.test

        # Universal Service Identifier (test code)
        # Format: code^name^coding_system
        service_id = (
            f"{test.code}{COMPONENT_SEPARATOR}"
            f"{test.name}{COMPONENT_SEPARATOR}"
            f"L"  # L = Local code
        )

        # LOINC code if available
        if test.loinc_code:
            service_id = (
                f"{test.loinc_code}{COMPONENT_SEPARATOR}"
                f"{test.name}{COMPONENT_SEPARATOR}"
                f"LN"  # LN = LOINC
            )

        # Priority
        priority_map = {
            "ROUTINE": "R",
            "URGENT": "S",  # STAT
            "STAT": "S",
        }
        priority = priority_map.get(lab_order.priority, "R")

        # Specimen type
        specimen = test.specimen_type or ""

        # Ordered datetime
        ordered_datetime = self._format_datetime(lab_order.ordered_at)

        # Specimen collected datetime
        specimen_datetime = ""
        if lab_order.specimen_collected_at:
            specimen_datetime = self._format_datetime(lab_order.specimen_collected_at)

        # Clinical notes
        clinical_info = self._escape_hl7_text(lab_order.clinical_notes or "")

        fields = [
            "OBR",
            str(set_id),  # OBR-1 Set ID
            lab_order.order_number,  # OBR-2 Placer Order Number
            lab_order.external_accession_number or "",  # OBR-3 Filler Order Number
            service_id,  # OBR-4 Universal Service Identifier
            priority,  # OBR-5 Priority
            ordered_datetime,  # OBR-6 Requested Date/Time
            specimen_datetime,  # OBR-7 Observation Date/Time
            "",  # OBR-8 Observation End Date/Time
            "",  # OBR-9 Collection Volume
            "",  # OBR-10 Collector Identifier
            "",  # OBR-11 Specimen Action Code
            "",  # OBR-12 Danger Code
            clinical_info,  # OBR-13 Relevant Clinical Information
            "",  # OBR-14 Specimen Received Date/Time
            specimen,  # OBR-15 Specimen Source
        ]

        return FIELD_SEPARATOR.join(fields)

    def build_orm_o01(self, lab_order: LabOrder) -> str:
        """
        Build HL7 v2.5.1 ORM^O01 (Lab Order) message.

        Generates a complete HL7 order message for transmission to
        external laboratory systems.

        Args:
            lab_order: LabOrder instance with related items and patient

        Returns:
            Complete HL7 ORM^O01 message string

        Raises:
            HL7ValidationError: If lab order is missing required data
        """
        if not lab_order.items.exists():
            raise HL7ValidationError("Lab order must have at least one test item")

        if not lab_order.patient:
            raise HL7ValidationError("Lab order must have a patient")

        if not lab_order.encounter:
            raise HL7ValidationError("Lab order must have an encounter")

        segments = []

        # MSH - Message Header
        msg_id = self._generate_message_control_id()
        segments.append(self._build_msh_segment("ORM", "O01", msg_id))

        # PID - Patient Identification
        segments.append(self._build_pid_segment(lab_order))

        # PV1 - Patient Visit
        segments.append(self._build_pv1_segment(lab_order))

        # For each test in the order
        for idx, item in enumerate(lab_order.items.all(), start=1):
            # ORC - Common Order
            segments.append(self._build_orc_segment(lab_order))

            # OBR - Observation Request
            segments.append(self._build_obr_segment(lab_order, item, idx))

        # Join segments with carriage return
        message = "\r".join(segments) + "\r"

        logger.info(
            "Generated ORM^O01 message for order %s with %d tests",
            lab_order.order_number,
            lab_order.items.count(),
        )

        return message

    def parse_oru_r01(self, message: str) -> list[HL7LabResult]:
        """
        Parse HL7 v2.5.1 ORU^R01 (Lab Result) message.

        Extracts lab results from incoming HL7 messages.

        Args:
            message: Raw HL7 ORU^R01 message string

        Returns:
            List of HL7LabResult objects with parsed data

        Raises:
            HL7ParseError: If message parsing fails
            HL7ValidationError: If message is not valid ORU^R01
        """
        if not message:
            raise HL7ParseError("Empty message")

        # Split message into segments
        segments = message.strip().replace("\n", "\r").split("\r")
        segments = [s for s in segments if s]  # Remove empty segments

        if not segments:
            raise HL7ParseError("No segments found in message")

        # Parse MSH segment to validate message type
        msh = segments[0]
        if not msh.startswith("MSH"):
            raise HL7ParseError("Message must start with MSH segment")

        # Validate message type is ORU^R01
        msh_fields = msh.split(FIELD_SEPARATOR)
        if len(msh_fields) < 10:
            raise HL7ParseError("Invalid MSH segment - too few fields")

        msg_type = msh_fields[8]  # MSH-9 (0-indexed from MSH|)
        if "ORU" not in msg_type.upper():
            raise HL7ValidationError(f"Expected ORU message, got: {msg_type}")

        results: list[HL7LabResult] = []
        current_order: dict[str, Any] = {}

        for segment in segments:
            if not segment:
                continue

            segment_type = segment[:3]
            fields = segment.split(FIELD_SEPARATOR)

            if segment_type == "ORC":
                # Parse Common Order segment
                current_order = self._parse_orc_segment(fields)

            elif segment_type == "OBR":
                # Parse Observation Request segment
                obr_data = self._parse_obr_segment(fields)
                current_order.update(obr_data)

            elif segment_type == "OBX":
                # Parse Observation Result segment
                obx_data = self._parse_obx_segment(fields)

                # Create result combining ORC, OBR, and OBX data
                result = HL7LabResult(
                    order_control=current_order.get("order_control", ""),
                    placer_order_number=current_order.get("placer_order_number", ""),
                    filler_order_number=current_order.get("filler_order_number", ""),
                    test_code=obx_data.get("identifier_code", ""),
                    test_name=obx_data.get("identifier_text", ""),
                    value=obx_data.get("value", ""),
                    units=obx_data.get("units"),
                    reference_range=obx_data.get("reference_range"),
                    abnormal_flag=obx_data.get("abnormal_flags"),
                    observation_status=obx_data.get("observation_status", ""),
                    result_datetime=obx_data.get("observation_datetime"),
                    performer_id=obx_data.get("performer_id"),
                    performer_name=obx_data.get("performer_name"),
                )
                results.append(result)

        logger.info("Parsed ORU^R01 message with %d results", len(results))
        return results

    def _parse_orc_segment(self, fields: list[str]) -> dict[str, Any]:
        """
        Parse ORC (Common Order) segment fields.

        Args:
            fields: List of ORC segment fields

        Returns:
            Dictionary with parsed ORC data
        """
        data: dict[str, Any] = {}

        if len(fields) > 1:
            data["order_control"] = fields[1]  # ORC-1
        if len(fields) > 2:
            data["placer_order_number"] = fields[2]  # ORC-2
        if len(fields) > 3:
            data["filler_order_number"] = fields[3]  # ORC-3
        if len(fields) > 5:
            data["order_status"] = fields[5]  # ORC-5

        return data

    def _parse_obr_segment(self, fields: list[str]) -> dict[str, Any]:
        """
        Parse OBR (Observation Request) segment fields.

        Args:
            fields: List of OBR segment fields

        Returns:
            Dictionary with parsed OBR data
        """
        data: dict[str, Any] = {}

        if len(fields) > 2:
            data["placer_order_number"] = fields[2]  # OBR-2
        if len(fields) > 3:
            data["filler_order_number"] = fields[3]  # OBR-3
        if len(fields) > 4:
            # Parse Universal Service Identifier (code^text^coding_system)
            service_id = fields[4]
            parts = service_id.split(COMPONENT_SEPARATOR)
            if len(parts) > 0:
                data["service_code"] = parts[0]
            if len(parts) > 1:
                data["service_name"] = parts[1]
        if len(fields) > 7:
            data["observation_datetime"] = self._parse_hl7_datetime(fields[7])  # OBR-7

        return data

    def _parse_obx_segment(self, fields: list[str]) -> dict[str, Any]:
        """
        Parse OBX (Observation Result) segment fields.

        Args:
            fields: List of OBX segment fields

        Returns:
            Dictionary with parsed OBX data
        """
        data: dict[str, Any] = {}

        if len(fields) > 2:
            data["value_type"] = fields[2]  # OBX-2

        if len(fields) > 3:
            # Parse Observation Identifier (code^text^coding_system)
            obs_id = fields[3]  # OBX-3
            parts = obs_id.split(COMPONENT_SEPARATOR)
            if len(parts) > 0:
                data["identifier_code"] = parts[0]
            if len(parts) > 1:
                data["identifier_text"] = self._unescape_hl7_text(parts[1])

        if len(fields) > 5:
            data["value"] = self._unescape_hl7_text(fields[5])  # OBX-5

        if len(fields) > 6:
            # Parse units (code^text)
            units = fields[6]  # OBX-6
            parts = units.split(COMPONENT_SEPARATOR)
            data["units"] = parts[0] if parts else None

        if len(fields) > 7:
            data["reference_range"] = fields[7]  # OBX-7

        if len(fields) > 8:
            data["abnormal_flags"] = fields[8]  # OBX-8

        if len(fields) > 11:
            data["observation_status"] = fields[11]  # OBX-11

        if len(fields) > 14:
            data["observation_datetime"] = self._parse_hl7_datetime(fields[14])  # OBX-14

        if len(fields) > 16:
            # Parse performing organization (id^name)
            performer = fields[16]  # OBX-16
            parts = performer.split(COMPONENT_SEPARATOR)
            if len(parts) > 0:
                data["performer_id"] = parts[0]
            if len(parts) > 1:
                data["performer_name"] = self._unescape_hl7_text(parts[1])

        return data

    def build_ack(
        self,
        original_message_control_id: str,
        ack_code: str,
        text_message: str,
        error_code: str | None = None,
        error_location: str | None = None,
    ) -> str:
        """
        Build HL7 ACK (Acknowledgment) message.

        Args:
            original_message_control_id: Control ID from original message
            ack_code: Acknowledgment code (AA=Accept, AE=Error, AR=Reject)
            text_message: Human-readable message
            error_code: Optional error code
            error_location: Optional error location (segment^field)

        Returns:
            Complete HL7 ACK message string
        """
        segments = []

        # MSH segment
        msg_id = self._generate_message_control_id()
        segments.append(self._build_msh_segment("ACK", "A01", msg_id))

        # MSA (Message Acknowledgment) segment
        msa_fields = [
            "MSA",
            ack_code,  # MSA-1 Acknowledgment Code
            original_message_control_id,  # MSA-2 Message Control ID
            self._escape_hl7_text(text_message),  # MSA-3 Text Message
        ]
        segments.append(FIELD_SEPARATOR.join(msa_fields))

        # ERR segment (if error)
        if ack_code in ("AE", "AR") and (error_code or error_location):
            err_fields = [
                "ERR",
                error_location or "",  # ERR-1 Error Code and Location
                "",  # ERR-2 Error Location
                error_code or "",  # ERR-3 HL7 Error Code
            ]
            segments.append(FIELD_SEPARATOR.join(err_fields))

        message = "\r".join(segments) + "\r"

        logger.debug(
            "Generated ACK message: %s for message %s", ack_code, original_message_control_id
        )
        return message

    def parse_ack(self, message: str) -> HL7AckResponse:
        """
        Parse HL7 ACK (Acknowledgment) message.

        Args:
            message: Raw HL7 ACK message string

        Returns:
            HL7AckResponse with parsed acknowledgment data

        Raises:
            HL7ParseError: If message parsing fails
        """
        if not message:
            raise HL7ParseError("Empty message")

        segments = message.strip().replace("\n", "\r").split("\r")
        segments = [s for s in segments if s]

        ack_code = ""
        msg_control_id = ""
        text_message = ""
        error_code = None
        error_location = None

        for segment in segments:
            segment_type = segment[:3]
            fields = segment.split(FIELD_SEPARATOR)

            if segment_type == "MSA":
                if len(fields) > 1:
                    ack_code = fields[1]
                if len(fields) > 2:
                    msg_control_id = fields[2]
                if len(fields) > 3:
                    text_message = self._unescape_hl7_text(fields[3])

            elif segment_type == "ERR":
                if len(fields) > 1:
                    error_location = fields[1]
                if len(fields) > 3:
                    error_code = fields[3]

        return HL7AckResponse(
            ack_code=ack_code,
            message_control_id=msg_control_id,
            text_message=text_message,
            error_code=error_code,
            error_location=error_location,
        )

    def import_result(
        self,
        hl7_result: HL7LabResult,
        entered_by: Any,
    ) -> LabResult | None:
        """
        Import a parsed HL7 result into the database.

        Creates a LabResult record from parsed HL7 data, matching
        against existing lab orders.

        Args:
            hl7_result: Parsed HL7LabResult object
            entered_by: User importing the result

        Returns:
            Created LabResult or None if order not found

        Raises:
            HL7ValidationError: If result data is invalid
        """
        from hmis.apps.laboratory.models import LabOrder, LabResult

        # Find the lab order
        order = None
        order_number = hl7_result.placer_order_number

        if order_number:
            try:
                order = LabOrder.objects.get(order_number=order_number)
            except LabOrder.DoesNotExist:
                logger.warning("Lab order not found: %s", order_number)
                return None

        if not order:
            logger.warning("Cannot import result without order reference")
            return None

        # Find matching order item by test code
        order_item = None
        test_code = hl7_result.test_code

        if test_code:
            # Try matching by LOINC code or internal code
            order_item = (
                order.items.filter(test__loinc_code=test_code).first()
                or order.items.filter(test__code=test_code).first()
            )

        if not order_item:
            logger.warning(
                "No matching order item for test code %s in order %s",
                test_code,
                order_number,
            )
            return None

        # Check if result already exists
        if hasattr(order_item, "result") and order_item.result:
            logger.warning(
                "Result already exists for order item %s",
                order_item.id,
            )
            return None

        # Parse numeric value if possible
        numeric_value = None
        text_value = hl7_result.value

        with contextlib.suppress(ValueError, TypeError, decimal.InvalidOperation):
            numeric_value = Decimal(str(hl7_result.value))

        # Map HL7 abnormal flags to our flags
        flag_map = {
            "L": "LOW",
            "LL": "CRITICAL_LOW",
            "H": "HIGH",
            "HH": "CRITICAL_HIGH",
            "A": "ABNORMAL",
            "N": "NORMAL",
            "POS": "POSITIVE",
            "NEG": "NEGATIVE",
        }
        result_flag = flag_map.get(hl7_result.abnormal_flag or "", "")

        # Create the lab result
        lab_result = LabResult.objects.create(
            order_item=order_item,
            numeric_value=numeric_value,
            text_value=text_value if numeric_value is None else "",
            result_unit=hl7_result.units or "",
            reference_range_text=hl7_result.reference_range or "",
            result_flag=result_flag,
            is_external_result=True,
            external_result_date=hl7_result.result_datetime.date()
            if hl7_result.result_datetime
            else None,
            entered_by=entered_by,
            verification_status="UNVERIFIED",
        )

        # Update order item status
        order_item.status = "COMPLETED"
        order_item.save(update_fields=["status", "updated_at"])

        # Check if all order items are complete
        if order.is_complete():
            order.status = "COMPLETED"
            order.completed_at = timezone.now()
            order.save(update_fields=["status", "completed_at", "updated_at"])

        logger.info(
            "Imported HL7 result for test %s, order %s",
            test_code,
            order_number,
        )

        return lab_result
