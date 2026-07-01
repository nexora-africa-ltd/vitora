# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
ORU (Observation Result) parser for HL7 v2.5.1.

Parses inbound ORU^R01 messages containing lab results from external LIS.

Segment structure (expected):
    MSH - Message Header
    PID - Patient Identification
    OBR - Observation Request
    OBX - Observation/Result (one per analyte)

Reference: HL7 v2.5.1 Chapter 7 — Observation Reporting
"""

import contextlib
import logging
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)

# HL7 delimiters
FIELD_SEP = "|"
COMP_SEP = "^"
REP_SEP = "~"


@dataclass
class ParsedObservation:
    """A single parsed OBX observation."""

    set_id: int = 0
    value_type: str = ""
    identifier_code: str = ""
    identifier_text: str = ""
    identifier_system: str = ""
    value: str = ""
    units: str = ""
    reference_range: str = ""
    abnormal_flag: str = ""
    status: str = ""  # F=Final, P=Preliminary, C=Correction


@dataclass
class ParsedOrderResult:
    """A parsed OBR + associated OBX observations."""

    placer_order_number: str = ""
    filler_order_number: str = ""
    universal_service_code: str = ""
    universal_service_text: str = ""
    universal_service_system: str = ""
    observation_datetime: str = ""
    result_status: str = ""
    observations: list[ParsedObservation] = field(default_factory=list)


@dataclass
class ParsedORUMessage:
    """Complete parsed ORU^R01 message."""

    message_id: str = ""
    sending_application: str = ""
    sending_facility: str = ""
    message_datetime: str = ""
    patient_id: str = ""
    patient_mrn: str = ""
    patient_name_family: str = ""
    patient_name_given: str = ""
    patient_dob: str = ""
    patient_gender: str = ""
    order_results: list[ParsedOrderResult] = field(default_factory=list)


class ORUParser:
    """Parse HL7 v2.5.1 ORU^R01 messages from external laboratory systems."""

    def _split_components(self, field_value: str) -> list[str]:
        """Split a field into components."""
        return field_value.split(COMP_SEP) if field_value else [""]

    def _unescape(self, text: str) -> str:
        """Unescape HL7 special characters."""
        if not text:
            return ""
        text = text.replace("\\F\\", "|")
        text = text.replace("\\S\\", "^")
        text = text.replace("\\T\\", "&")
        text = text.replace("\\R\\", "~")
        text = text.replace("\\E\\", "\\")
        return text

    def parse(self, raw_message: str) -> ParsedORUMessage:
        """
        Parse a raw HL7 ORU^R01 message string.

        Args:
            raw_message: The complete HL7 message (segments separated by \\r or \\n).

        Returns:
            ParsedORUMessage with extracted data.

        Raises:
            ValueError: If the message is not a valid ORU^R01.
        """
        result = ParsedORUMessage()
        current_order: ParsedOrderResult | None = None

        # Normalize line endings
        segments = raw_message.replace("\r\n", "\r").replace("\n", "\r").split("\r")
        segments = [s.strip() for s in segments if s.strip()]

        for segment in segments:
            fields = segment.split(FIELD_SEP)
            seg_type = fields[0] if fields else ""

            if seg_type == "MSH":
                self._parse_msh(fields, result)
            elif seg_type == "PID":
                self._parse_pid(fields, result)
            elif seg_type == "OBR":
                current_order = self._parse_obr(fields)
                result.order_results.append(current_order)
            elif seg_type == "OBX":
                obs = self._parse_obx(fields)
                if current_order:
                    current_order.observations.append(obs)

        return result

    def _parse_msh(self, fields: list[str], msg: ParsedORUMessage):
        """Parse MSH segment."""
        if len(fields) > 2:
            msg.sending_application = self._unescape(fields[2])
        if len(fields) > 3:
            msg.sending_facility = self._unescape(fields[3])
        if len(fields) > 6:
            msg.message_datetime = fields[6]
        if len(fields) > 9:
            msg.message_id = fields[9]

        # Validate message type
        if len(fields) > 8:
            msg_type_parts = self._split_components(fields[8])
            if len(msg_type_parts) >= 2 and (
                msg_type_parts[0] != "ORU" or msg_type_parts[1] != "R01"
            ):
                raise ValueError(f"Expected ORU^R01, got {msg_type_parts[0]}^{msg_type_parts[1]}")

    def _parse_pid(self, fields: list[str], msg: ParsedORUMessage):
        """Parse PID segment."""
        if len(fields) > 2:
            msg.patient_id = fields[2]
        if len(fields) > 3:
            msg.patient_mrn = self._unescape(fields[3])
        if len(fields) > 5:
            name_parts = self._split_components(fields[5])
            msg.patient_name_family = self._unescape(name_parts[0]) if name_parts else ""
            msg.patient_name_given = self._unescape(name_parts[1]) if len(name_parts) > 1 else ""
        if len(fields) > 7:
            msg.patient_dob = fields[7]
        if len(fields) > 8:
            msg.patient_gender = fields[8]

    def _parse_obr(self, fields: list[str]) -> ParsedOrderResult:
        """Parse OBR segment."""
        order = ParsedOrderResult()
        if len(fields) > 2:
            order.placer_order_number = fields[2]
        if len(fields) > 3:
            order.filler_order_number = fields[3]
        if len(fields) > 4:
            service_parts = self._split_components(fields[4])
            order.universal_service_code = service_parts[0] if service_parts else ""
            order.universal_service_text = (
                self._unescape(service_parts[1]) if len(service_parts) > 1 else ""
            )
            order.universal_service_system = service_parts[2] if len(service_parts) > 2 else ""
        if len(fields) > 7:
            order.observation_datetime = fields[7]
        if len(fields) > 25:
            order.result_status = fields[25]
        return order

    def _parse_obx(self, fields: list[str]) -> ParsedObservation:
        """Parse OBX segment."""
        obs = ParsedObservation()
        if len(fields) > 1:
            with contextlib.suppress(ValueError, TypeError):
                obs.set_id = int(fields[1])
        if len(fields) > 2:
            obs.value_type = fields[2]
        if len(fields) > 3:
            id_parts = self._split_components(fields[3])
            obs.identifier_code = id_parts[0] if id_parts else ""
            obs.identifier_text = self._unescape(id_parts[1]) if len(id_parts) > 1 else ""
            obs.identifier_system = id_parts[2] if len(id_parts) > 2 else ""
        if len(fields) > 5:
            obs.value = self._unescape(fields[5])
        if len(fields) > 6:
            unit_parts = self._split_components(fields[6])
            obs.units = unit_parts[0] if unit_parts else ""
        if len(fields) > 7:
            obs.reference_range = self._unescape(fields[7])
        if len(fields) > 8:
            obs.abnormal_flag = fields[8]
        if len(fields) > 11:
            obs.status = fields[11]
        return obs

    def match_patient(self, parsed: ParsedORUMessage):
        """
        Attempt to match the parsed patient to a local Patient record.

        Returns:
            Patient instance or None.
        """
        from hmis.apps.patients.models import Patient

        # Try MRN first
        if parsed.patient_mrn:
            try:
                return Patient.objects.get(mrn=parsed.patient_mrn)
            except Patient.DoesNotExist:
                pass

        # Try by ID
        if parsed.patient_id:
            try:
                return Patient.objects.get(pk=parsed.patient_id)
            except (Patient.DoesNotExist, ValueError):
                pass

        # Try by name + DOB
        if parsed.patient_name_family and parsed.patient_dob:
            dob_str = parsed.patient_dob[:8]  # YYYYMMDD
            try:
                dob = datetime.strptime(dob_str, "%Y%m%d").date()
                return Patient.objects.filter(
                    last_name__iexact=parsed.patient_name_family,
                    date_of_birth=dob,
                ).first()
            except (ValueError, TypeError):
                pass

        return None
