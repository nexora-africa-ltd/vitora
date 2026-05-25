"""
Services for standalone Imaging operations.

Handles external imaging order intake (HL7 ORM^O01 for imaging, e-referrals)
and walk-in patient auto-creation from external order payloads.
"""

import logging
from datetime import datetime

from django.contrib.auth import get_user_model

from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

from .models import ExternalImagingOrderRequest, WalkInImagingPatient

logger = logging.getLogger(__name__)
User = get_user_model()


def process_external_imaging_order(
    ext_req: ExternalImagingOrderRequest,
    user,
    auto_create_walkin: bool = True,
    facility=None,
    organization=None,
) -> ImagingOrder:
    """Process an accepted external imaging request into an ImagingOrder."""
    walkin = None
    patient = None

    if auto_create_walkin and ext_req.patient_name:
        name_parts = ext_req.patient_name.replace("^", " ").strip().split()
        first_name = name_parts[0] if name_parts else "Unknown"
        last_name = name_parts[-1] if len(name_parts) > 1 else ""

        walkin = WalkInImagingPatient.objects.create(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=ext_req.patient_dob,
            gender=ext_req.patient_gender or "",
            phone_number=ext_req.patient_phone or "",
            national_id=ext_req.patient_id_number or "",
            referring_facility=ext_req.sending_facility,
            referring_clinician=ext_req.referring_clinician,
            registered_by=user,
            facility=facility,
            organization=organization,
        )
        ext_req.walkin_patient = walkin
        ext_req.save(update_fields=["walkin_patient", "updated_at"])

    order = ImagingOrder.objects.create(
        patient=patient,
        encounter=None,
        ordered_by=user,
        priority=_map_priority(ext_req.priority),
        clinical_indication=ext_req.clinical_indication or "External referral",
        relevant_clinical_history=ext_req.relevant_clinical_history,
        status="ORDERED",
        is_walkin=True,
        walkin_patient_name=ext_req.patient_name,
        walkin_patient_id=ext_req.patient_id_number,
        walkin_patient_phone=ext_req.patient_phone,
        walkin_patient_dob=ext_req.patient_dob,
        walkin_patient_gender=ext_req.patient_gender,
        external_referring_facility=ext_req.sending_facility,
        external_referring_clinician=ext_req.referring_clinician,
        bill_patient=False,
    )

    items_created = 0
    for proc_info in ext_req.requested_procedures:
        if not isinstance(proc_info, dict):
            continue
        procedure = _resolve_procedure(
            proc_info.get("code", ""),
            proc_info.get("name", ""),
        )
        if procedure:
            ImagingOrderItem.objects.create(
                order=order,
                procedure=procedure,
                laterality=proc_info.get("laterality", "NA"),
                specific_instructions=proc_info.get("instructions", ""),
                unit_cost=procedure.cost,
            )
            items_created += 1
        else:
            logger.warning(
                "Could not resolve procedure for external imaging order %s: %s",
                ext_req.placer_order_number,
                proc_info,
            )

    if items_created == 0:
        order.delete()
        raise ValueError(
            f"No valid procedures found in external imaging order: {ext_req.requested_procedures}"
        )

    order.calculate_total_cost()
    return order


def ingest_hl7_orm_imaging(
    raw_message: str, facility=None, organization=None
) -> ExternalImagingOrderRequest:
    """Parse and ingest an HL7 ORM^O01 imaging order message."""
    segments = _parse_hl7_segments(raw_message)

    msh = segments.get("MSH", {})
    pid = segments.get("PID", {})
    orc = segments.get("ORC", {})
    obr_list = segments.get("OBR", [])

    requested_procedures = []
    clinical_indication = ""
    for obr in obr_list:
        code = obr.get("universal_service_id", "")
        if code:
            requested_procedures.append({"code": code, "name": obr.get("test_name", "")})
        if obr.get("clinical_info"):
            clinical_indication = obr["clinical_info"]

    ext_req = ExternalImagingOrderRequest.objects.create(
        message_control_id=msh.get("message_control_id", ""),
        sending_application=msh.get("sending_application", "UNKNOWN"),
        sending_facility=msh.get("sending_facility", "UNKNOWN"),
        referring_clinician=orc.get("prescriber_name", ""),
        referring_clinician_license=orc.get("prescriber_license", ""),
        external_patient_id=pid.get("patient_id", ""),
        patient_name=pid.get("patient_name", ""),
        patient_dob=pid.get("date_of_birth"),
        patient_gender=pid.get("gender", ""),
        patient_phone=pid.get("phone", ""),
        patient_id_number=pid.get("id_number", ""),
        placer_order_number=orc.get("placer_order_number", msh.get("message_control_id", "")),
        priority=orc.get("priority", "ROUTINE"),
        clinical_indication=clinical_indication,
        requested_procedures=requested_procedures,
        raw_message=raw_message,
        status=ExternalImagingOrderRequest.Status.RECEIVED,
        facility=facility,
        organization=organization,
    )

    logger.info(
        "Ingested HL7 ORM (imaging) from %s/%s, order: %s (%d procedures)",
        msh.get("sending_application"),
        msh.get("sending_facility"),
        ext_req.placer_order_number,
        len(requested_procedures),
    )
    return ext_req


def _parse_hl7_segments(raw_message: str) -> dict:
    segments: dict = {"OBR": []}
    lines = raw_message.strip().split("\r")
    if len(lines) <= 1:
        lines = raw_message.strip().split("\n")

    for line in lines:
        fields = line.split("|")
        seg = fields[0] if fields else ""

        if seg == "MSH" and len(fields) >= 10:
            segments["MSH"] = {
                "sending_application": fields[2] if len(fields) > 2 else "",
                "sending_facility": fields[3] if len(fields) > 3 else "",
                "message_control_id": fields[9] if len(fields) > 9 else "",
            }
        elif seg == "PID" and len(fields) >= 6:
            name_field = fields[5] if len(fields) > 5 else ""
            dob_field = fields[7] if len(fields) > 7 else ""
            name_parts = name_field.split("^")
            patient_name = f"{name_parts[1]} {name_parts[0]}" if len(name_parts) > 1 else name_field
            patient_dob = None
            if dob_field and len(dob_field) >= 8:
                import contextlib

                with contextlib.suppress(ValueError):
                    patient_dob = datetime.strptime(dob_field[:8], "%Y%m%d").date()
            segments["PID"] = {
                "patient_id": fields[3] if len(fields) > 3 else "",
                "patient_name": patient_name,
                "date_of_birth": patient_dob,
                "gender": fields[8] if len(fields) > 8 else "",
                "phone": fields[13] if len(fields) > 13 else "",
                "id_number": fields[3] if len(fields) > 3 else "",
            }
        elif seg == "ORC" and len(fields) >= 5:
            prescriber_field = fields[12] if len(fields) > 12 else ""
            prescriber_parts = prescriber_field.split("^")
            prescriber_name = (
                " ".join(prescriber_parts[1:3]) if len(prescriber_parts) > 2 else prescriber_field
            )
            segments["ORC"] = {
                "placer_order_number": fields[2] if len(fields) > 2 else "",
                "prescriber_license": prescriber_parts[0] if prescriber_parts else "",
                "prescriber_name": prescriber_name,
                "priority": _parse_hl7_priority(fields[7] if len(fields) > 7 else ""),
            }
        elif seg == "OBR" and len(fields) >= 5:
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


def _parse_hl7_priority(code: str) -> str:
    mapping = {"S": "STAT", "A": "STAT", "R": "ROUTINE", "P": "ROUTINE", "T": "URGENT"}
    return mapping.get(code.upper(), "ROUTINE")


def _map_priority(priority: str) -> str:
    valid = {"ROUTINE", "URGENT", "STAT"}
    return priority if priority in valid else "ROUTINE"


def _resolve_procedure(code: str, name: str = "") -> ImagingProcedure | None:
    """Resolve an external procedure code/name to a local ImagingProcedure entry."""
    if code:
        proc = ImagingProcedure.objects.filter(code=code).first()
        if proc:
            return proc
    if name:
        proc = (
            ImagingProcedure.objects.filter(name__iexact=name).first()
            or ImagingProcedure.objects.filter(name__icontains=name).first()
        )
        if proc:
            return proc
    return None
