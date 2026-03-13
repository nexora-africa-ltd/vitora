"""
ADT (Admit/Discharge/Transfer) message builder for HL7 v2.5.1.

Generates ADT messages for patient lifecycle events:
- ADT^A01: Admit/Visit Notification
- ADT^A02: Patient Transfer
- ADT^A03: Discharge
- ADT^A08: Update Patient Information

Uses the same HL7 segment building conventions as the laboratory
HL7Service for consistency.
"""

import logging
from datetime import date

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# HL7 message delimiters (same as lab HL7Service)
FIELD_SEP = "|"
COMP_SEP = "^"
REP_SEP = "~"
ESC_CHAR = "\\"
SUBCOMP_SEP = "&"
ENCODING_CHARS = f"{COMP_SEP}{REP_SEP}{ESC_CHAR}{SUBCOMP_SEP}"


class ADTService:
    """Build HL7 v2.5.1 ADT messages for patient events."""

    def __init__(self):
        self.sending_app = getattr(settings, "HL7_SENDING_APPLICATION", "VITORA_HMIS")
        self.sending_facility = getattr(settings, "HL7_SENDING_FACILITY", "VITORA")
        self.receiving_app = getattr(settings, "HL7_RECEIVING_APPLICATION", "EXTERNAL")
        self.receiving_facility = getattr(settings, "HL7_RECEIVING_FACILITY", "EXTERNAL")
        self._counter = 0

    def _msg_id(self) -> str:
        self._counter += 1
        ts = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"ADT{ts}{self._counter:05d}"

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

    def _build_msh(self, msg_type: str, trigger: str, msg_id: str = "") -> str:
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
            f"{msg_type}{COMP_SEP}{trigger}",
            mid,
            "P",
            "2.5.1",
        ]
        return FIELD_SEP.join(fields)

    def _build_evn(self, event_code: str, recorded_dt=None) -> str:
        ts = self._fmt_dt(recorded_dt or timezone.now())
        fields = [
            "EVN",
            event_code,
            ts,
        ]
        return FIELD_SEP.join(fields)

    def _build_pid(self, patient) -> str:
        name = f"{patient.last_name}{COMP_SEP}{patient.first_name}"
        if hasattr(patient, "middle_name") and patient.middle_name:
            name += f"{COMP_SEP}{patient.middle_name}"

        dob = self._fmt_dt(patient.date_of_birth) if patient.date_of_birth else ""
        gender_map = {"M": "M", "F": "F", "O": "O"}
        gender = gender_map.get(getattr(patient, "gender", ""), "U")

        patient_id = f"{patient.mrn}{COMP_SEP}{COMP_SEP}{COMP_SEP}MRN"

        phone = getattr(patient, "phone_number", "") or ""
        national_id = getattr(patient, "national_id", "") or ""

        # Address components from Kenya location hierarchy
        address = ""
        county = getattr(patient, "county", None)
        sub_county = getattr(patient, "sub_county", None)
        ward = getattr(patient, "ward", None)
        if county:
            parts = [
                "",  # street
                "",  # other
                str(sub_county) if sub_county else "",  # city
                str(county),  # state/county
                "",  # zip
                "KE",  # country
            ]
            address = COMP_SEP.join(parts)

        fields = [
            "PID",
            "1",
            national_id,  # PID-2 External ID
            patient_id,  # PID-3 Patient Identifier List
            "",  # PID-4
            name,  # PID-5
            "",  # PID-6
            dob,  # PID-7
            gender,  # PID-8
            "",  # PID-9 alias
            "",  # PID-10 race
            address,  # PID-11 address
            "",  # PID-12 county code
            phone,  # PID-13
        ]
        return FIELD_SEP.join(fields)

    def _build_pv1(
        self,
        patient_class: str = "I",
        ward_name: str = "",
        bed_number: str = "",
        attending_id: str = "",
        attending_name: str = "",
        visit_number: str = "",
        admit_dt=None,
    ) -> str:
        location = ""
        if ward_name or bed_number:
            location = f"{self._escape(ward_name)}{COMP_SEP}{self._escape(bed_number)}"

        attending = ""
        if attending_id:
            attending = f"{attending_id}{COMP_SEP}{attending_name}"

        admit_str = self._fmt_dt(admit_dt) if admit_dt else ""

        fields = [
            "PV1",
            "1",
            patient_class,  # I=Inpatient, O=Outpatient, E=Emergency
            location,
            "",  # PV1-4 Admission Type
            "",  # PV1-5
            "",  # PV1-6 Prior Patient Location
            attending,  # PV1-7
            "",  # PV1-8
            "",  # PV1-9
            "",  # PV1-10
            "",  # PV1-11
            "",  # PV1-12
            "",  # PV1-13
            "",  # PV1-14
            "",  # PV1-15
            "",  # PV1-16
            "",  # PV1-17
            "",  # PV1-18
            visit_number,  # PV1-19
            "",  # PV1-20 to PV1-43
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            admit_str,  # PV1-44 Admit Date/Time
        ]
        return FIELD_SEP.join(fields)

    def _build_nk1(self, contact_name: str = "", relationship: str = "", phone: str = "") -> str:
        if not contact_name:
            return ""
        fields = [
            "NK1",
            "1",
            self._escape(contact_name),
            relationship,
            "",  # NK1-4 Address
            phone,
        ]
        return FIELD_SEP.join(fields)

    def build_adt_a01(self, admission) -> tuple[str, str]:
        """
        Build ADT^A01 (Admit/Visit Notification).

        Args:
            admission: An Admission model instance with patient, ward, bed.

        Returns:
            Tuple of (message_string, message_control_id)
        """
        patient = admission.patient
        msg_id = self._msg_id()

        segments = [
            self._build_msh("ADT", "A01", msg_id),
            self._build_evn("A01", admission.admitted_at),
            self._build_pid(patient),
        ]

        # NK1 - Emergency contact
        ec_name = getattr(patient, "emergency_contact_name", "")
        ec_phone = getattr(patient, "emergency_contact_phone", "")
        ec_rel = getattr(patient, "emergency_contact_relationship", "")
        nk1 = self._build_nk1(ec_name, ec_rel, ec_phone)
        if nk1:
            segments.append(nk1)

        # PV1
        ward_name = str(admission.ward) if admission.ward else ""
        bed_number = str(admission.bed) if getattr(admission, "bed", None) else ""
        attending_id = str(admission.attending_doctor_id) if admission.attending_doctor else ""
        attending_name = (
            admission.attending_doctor.get_full_name() if admission.attending_doctor else ""
        )
        segments.append(
            self._build_pv1(
                patient_class="I",
                ward_name=ward_name,
                bed_number=bed_number,
                attending_id=attending_id,
                attending_name=attending_name,
                visit_number=str(admission.id),
                admit_dt=admission.admitted_at,
            )
        )

        message = "\r".join(segments) + "\r"
        logger.info("Built ADT^A01 for admission %s patient %s", admission.id, patient.mrn)
        return message, msg_id

    def build_adt_a02(self, admission, from_ward: str = "", from_bed: str = "") -> tuple[str, str]:
        """
        Build ADT^A02 (Patient Transfer).

        Args:
            admission: Admission instance (with new ward/bed already set)
            from_ward: Previous ward name
            from_bed: Previous bed number

        Returns:
            Tuple of (message_string, message_control_id)
        """
        patient = admission.patient
        msg_id = self._msg_id()

        segments = [
            self._build_msh("ADT", "A02", msg_id),
            self._build_evn("A02"),
            self._build_pid(patient),
        ]

        # PV1 with new location
        new_ward = str(admission.ward) if admission.ward else ""
        new_bed = str(admission.bed) if getattr(admission, "bed", None) else ""
        segments.append(
            self._build_pv1(
                patient_class="I",
                ward_name=new_ward,
                bed_number=new_bed,
                visit_number=str(admission.id),
            )
        )

        message = "\r".join(segments) + "\r"
        logger.info(
            "Built ADT^A02 for admission %s transfer from %s to %s",
            admission.id,
            from_ward,
            new_ward,
        )
        return message, msg_id

    def build_adt_a03(self, admission) -> tuple[str, str]:
        """
        Build ADT^A03 (Patient Discharge).

        Args:
            admission: Admission instance with discharge info.

        Returns:
            Tuple of (message_string, message_control_id)
        """
        patient = admission.patient
        msg_id = self._msg_id()

        segments = [
            self._build_msh("ADT", "A03", msg_id),
            self._build_evn("A03", getattr(admission, "discharged_at", None)),
            self._build_pid(patient),
        ]

        ward_name = str(admission.ward) if admission.ward else ""
        bed_number = str(admission.bed) if getattr(admission, "bed", None) else ""
        segments.append(
            self._build_pv1(
                patient_class="I",
                ward_name=ward_name,
                bed_number=bed_number,
                visit_number=str(admission.id),
                admit_dt=admission.admitted_at,
            )
        )

        message = "\r".join(segments) + "\r"
        logger.info("Built ADT^A03 for admission %s discharge", admission.id)
        return message, msg_id

    def build_adt_a08(self, patient) -> tuple[str, str]:
        """
        Build ADT^A08 (Update Patient Information).

        Args:
            patient: Patient model instance.

        Returns:
            Tuple of (message_string, message_control_id)
        """
        msg_id = self._msg_id()

        segments = [
            self._build_msh("ADT", "A08", msg_id),
            self._build_evn("A08"),
            self._build_pid(patient),
        ]

        # NK1 - Emergency contact if available
        ec_name = getattr(patient, "emergency_contact_name", "")
        ec_phone = getattr(patient, "emergency_contact_phone", "")
        ec_rel = getattr(patient, "emergency_contact_relationship", "")
        nk1 = self._build_nk1(ec_name, ec_rel, ec_phone)
        if nk1:
            segments.append(nk1)

        # PV1 with outpatient class
        segments.append(self._build_pv1(patient_class="O"))

        message = "\r".join(segments) + "\r"
        logger.info("Built ADT^A08 for patient %s", patient.mrn)
        return message, msg_id
