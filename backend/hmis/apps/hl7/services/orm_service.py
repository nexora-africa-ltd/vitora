# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
ORM (Order Message) builder for HL7 v2.5.1.

Generates ORM^O01 messages for outbound lab, imaging, and pharmacy orders.

Segment structure:
    MSH - Message Header
    PID - Patient Identification
    PV1 - Patient Visit
    ORC - Common Order
    OBR - Observation Request (lab/imaging)
    RXO - Pharmacy/Treatment Order (pharmacy)
"""

import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# HL7 message delimiters
FIELD_SEP = "|"
COMP_SEP = "^"
REP_SEP = "~"
ESC_CHAR = "\\"
SUBCOMP_SEP = "&"
ENCODING_CHARS = f"{COMP_SEP}{REP_SEP}{ESC_CHAR}{SUBCOMP_SEP}"


class ORMService:
    """Build HL7 v2.5.1 ORM^O01 messages for outbound orders."""

    def __init__(self):
        self.sending_app = getattr(settings, "HL7_SENDING_APPLICATION", "VITORA_HMIS")
        self.sending_facility = getattr(settings, "HL7_SENDING_FACILITY", "VITORA")
        self.receiving_app = getattr(settings, "HL7_RECEIVING_APPLICATION", "EXTERNAL_LIS")
        self.receiving_facility = getattr(settings, "HL7_RECEIVING_FACILITY", "EXTERNAL")
        self._counter = 0

    def _msg_id(self) -> str:
        self._counter += 1
        ts = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"ORM{ts}{self._counter:05d}"

    def _fmt_dt(self, dt) -> str:
        if dt is None:
            return ""
        if isinstance(dt, str):
            return dt.replace("-", "")[:8]
        return dt.strftime("%Y%m%d%H%M%S") if hasattr(dt, "hour") else dt.strftime("%Y%m%d")

    def _escape(self, text: str) -> str:
        if not text:
            return ""
        text = text.replace("\\", "\\E\\")
        text = text.replace("|", "\\F\\")
        text = text.replace("^", "\\S\\")
        text = text.replace("&", "\\T\\")
        text = text.replace("~", "\\R\\")
        return text

    def _build_msh(self, msg_id: str = "") -> str:
        mid = msg_id or self._msg_id()
        ts = self._fmt_dt(timezone.now())
        fields = [
            "MSH",
            ENCODING_CHARS,
            self.sending_app,
            self.sending_facility,
            self.receiving_app,
            self.receiving_facility,
            ts,
            "",
            f"ORM{COMP_SEP}O01",
            mid,
            "P",
            "2.5.1",
        ]
        return FIELD_SEP.join(fields)

    def _build_pid(self, patient) -> str:
        """Build PID segment from Patient model instance."""
        dob = self._fmt_dt(patient.date_of_birth) if patient.date_of_birth else ""
        gender_map = {"M": "M", "F": "F", "O": "O"}
        gender = gender_map.get(getattr(patient, "gender", ""), "U")
        fields = [
            "PID",
            "1",
            str(patient.pk),
            self._escape(getattr(patient, "mrn", "")),
            "",
            f"{self._escape(patient.last_name)}{COMP_SEP}{self._escape(patient.first_name)}",
            "",
            dob,
            gender,
        ]
        return FIELD_SEP.join(fields)

    def _build_pv1(self, encounter=None) -> str:
        """Build PV1 (Patient Visit) segment."""
        patient_class = "O"  # Outpatient
        if encounter:
            enc_type = getattr(encounter, "encounter_type", "OPD")
            class_map = {"OPD": "O", "IPD": "I", "EMERGENCY": "E"}
            patient_class = class_map.get(enc_type, "O")
        fields = ["PV1", "1", patient_class]
        return FIELD_SEP.join(fields)

    def _build_orc(self, order, order_control: str = "NW") -> str:
        """
        Build ORC (Common Order) segment.

        order_control: NW=New, CA=Cancel, SC=Status Change
        """
        order_id = str(getattr(order, "pk", ""))
        ts = self._fmt_dt(timezone.now())
        ordering_provider = ""
        if hasattr(order, "ordered_by") and order.ordered_by:
            provider = order.ordered_by
            ordering_provider = (
                f"{getattr(provider, 'pk', '')}{COMP_SEP}"
                f"{self._escape(getattr(provider, 'last_name', ''))}{COMP_SEP}"
                f"{self._escape(getattr(provider, 'first_name', ''))}"
            )
        fields = [
            "ORC",
            order_control,
            order_id,
            "",  # Filler order number (assigned by receiving system)
            "",
            getattr(order, "status", ""),
            "",
            "",
            "",
            ts,
            "",
            "",
            ordering_provider,
        ]
        return FIELD_SEP.join(fields)

    def _build_obr(self, order_item, sequence: int = 1) -> str:
        """Build OBR (Observation Request) segment for lab/imaging orders."""
        test_code = ""
        test_name = ""
        loinc = ""

        if hasattr(order_item, "test_catalog") and order_item.test_catalog:
            catalog = order_item.test_catalog
            test_code = getattr(catalog, "code", "")
            test_name = self._escape(getattr(catalog, "name", ""))
            loinc = getattr(catalog, "loinc_code", "") or ""

        # Universal Service ID: code^text^coding_system
        universal_id = f"{test_code}{COMP_SEP}{test_name}{COMP_SEP}L"
        if loinc:
            universal_id = f"{loinc}{COMP_SEP}{test_name}{COMP_SEP}LN"

        priority = getattr(order_item, "priority", "R")
        priority_map = {"ROUTINE": "R", "URGENT": "S", "STAT": "S"}
        hl7_priority = priority_map.get(priority, "R")

        fields = [
            "OBR",
            str(sequence),
            str(getattr(order_item, "pk", "")),
            "",  # Filler order number
            universal_id,
            hl7_priority,
        ]
        return FIELD_SEP.join(fields)

    def _build_rxo(self, prescription_item) -> str:
        """Build RXO (Pharmacy Order) segment."""
        drug_name = ""
        hpt_code = ""
        if hasattr(prescription_item, "drug") and prescription_item.drug:
            drug = prescription_item.drug
            drug_name = self._escape(getattr(drug, "name", ""))
            hpt_code = getattr(drug, "hpt_code", "") or ""

        # Requested Give Code: code^text^system
        give_code = f"{hpt_code}{COMP_SEP}{drug_name}{COMP_SEP}HPT"
        dosage = self._escape(str(getattr(prescription_item, "dosage", "")))
        quantity = str(getattr(prescription_item, "quantity", ""))
        route = self._escape(str(getattr(prescription_item, "route", "")))

        fields = [
            "RXO",
            give_code,
            dosage,
            "",
            "",
            route,
            "",
            "",
            quantity,
        ]
        return FIELD_SEP.join(fields)

    def build_lab_order(self, lab_order) -> str:
        """
        Build a complete ORM^O01 message for a lab order.

        Args:
            lab_order: LabOrder model instance with items.

        Returns:
            Complete HL7 message string (segments joined by \\r).
        """
        patient = lab_order.patient
        encounter = getattr(lab_order, "encounter", None)

        segments = [
            self._build_msh(),
            self._build_pid(patient),
            self._build_pv1(encounter),
            self._build_orc(lab_order, "NW"),
        ]

        items = lab_order.items.all() if hasattr(lab_order, "items") else []
        for idx, item in enumerate(items, 1):
            segments.append(self._build_obr(item, idx))

        return "\r".join(segments)

    def build_imaging_order(self, imaging_order) -> str:
        """
        Build a complete ORM^O01 message for an imaging order.

        Args:
            imaging_order: ImagingOrder model instance.

        Returns:
            Complete HL7 message string.
        """
        patient = imaging_order.patient
        encounter = getattr(imaging_order, "encounter", None)

        segments = [
            self._build_msh(),
            self._build_pid(patient),
            self._build_pv1(encounter),
            self._build_orc(imaging_order, "NW"),
        ]

        # Build OBR for the imaging procedure
        procedure = getattr(imaging_order, "procedure", None)
        if procedure:
            proc_code = getattr(procedure, "code", "")
            proc_name = self._escape(getattr(procedure, "name", ""))
            loinc = getattr(procedure, "loinc_code", "") or ""
            universal_id = f"{proc_code}{COMP_SEP}{proc_name}{COMP_SEP}L"
            if loinc:
                universal_id = f"{loinc}{COMP_SEP}{proc_name}{COMP_SEP}LN"

            obr_fields = [
                "OBR",
                "1",
                str(imaging_order.pk),
                "",
                universal_id,
                "R",
            ]
            segments.append(FIELD_SEP.join(obr_fields))

        return "\r".join(segments)

    def build_pharmacy_order(self, prescription) -> str:
        """
        Build a complete ORM^O01 message for a pharmacy order.

        Args:
            prescription: Prescription model instance with items.

        Returns:
            Complete HL7 message string.
        """
        patient = prescription.patient
        encounter = getattr(prescription, "encounter", None)

        segments = [
            self._build_msh(),
            self._build_pid(patient),
            self._build_pv1(encounter),
            self._build_orc(prescription, "NW"),
        ]

        items = prescription.items.all() if hasattr(prescription, "items") else []
        for item in items:
            segments.append(self._build_rxo(item))

        return "\r".join(segments)
