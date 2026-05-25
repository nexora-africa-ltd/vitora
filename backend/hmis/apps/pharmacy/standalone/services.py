"""
Services for standalone Pharmacy operations.

Handles external prescription intake (e-prescriptions, HL7 RDE^O11) and
walk-in customer auto-creation from external prescription payloads.
"""

import logging
from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model

from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

from .models import ExternalPrescriptionRequest, WalkInCustomer

logger = logging.getLogger(__name__)
User = get_user_model()


def process_external_prescription(
    ext_req: ExternalPrescriptionRequest,
    user,
    auto_create_walkin: bool = True,
    facility=None,
    organization=None,
) -> Prescription:
    """
    Process an accepted external prescription request into a Prescription.

    Creates a WalkInCustomer (if auto_create_walkin) and a Prescription with items.
    """
    walkin = None
    patient = None

    if auto_create_walkin and ext_req.patient_name:
        name_parts = ext_req.patient_name.replace("^", " ").strip().split()
        first_name = name_parts[0] if name_parts else "Unknown"
        last_name = name_parts[-1] if len(name_parts) > 1 else ""

        walkin = WalkInCustomer.objects.create(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=ext_req.patient_dob,
            gender=ext_req.patient_gender or "",
            phone_number=ext_req.patient_phone or "",
            national_id=ext_req.patient_id_number or "",
            referring_facility=ext_req.sending_facility,
            referring_clinician=ext_req.prescriber_name,
            registered_by=user,
            facility=facility,
            organization=organization,
        )
        ext_req.walkin_customer = walkin
        ext_req.save(update_fields=["walkin_customer", "updated_at"])

    # Create the prescription (30-day default validity)
    prescription = Prescription.objects.create(
        patient=patient,
        encounter=None,
        prescribed_by=user,
        valid_until=date.today() + timedelta(days=30),
        clinical_notes=ext_req.clinical_info,
        is_walkin=True,
        walkin_customer_name=ext_req.patient_name,
        walkin_customer_id=ext_req.patient_id_number,
        walkin_customer_phone=ext_req.patient_phone,
        walkin_customer_dob=ext_req.patient_dob,
        walkin_customer_gender=ext_req.patient_gender,
        external_prescription_number=ext_req.external_prescription_number,
        bill_patient=False,
        facility=facility,
        organization=organization,
    )

    # Resolve and create prescription items
    items_created = 0
    for item_info in ext_req.requested_items:
        if not isinstance(item_info, dict):
            continue
        drug = _resolve_drug(
            item_info.get("drug_code", "") or item_info.get("code", ""),
            item_info.get("drug_name", "") or item_info.get("name", ""),
        )
        if drug:
            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=drug,
                quantity=int(item_info.get("quantity", 1) or 1),
                dosage=item_info.get("dose", "") or item_info.get("dosage", ""),
                frequency=item_info.get("frequency", ""),
                duration=item_info.get("duration", ""),
                instructions=item_info.get("instructions", ""),
            )
            items_created += 1
        else:
            logger.warning(
                "Could not resolve drug for external prescription %s: %s",
                ext_req.external_prescription_number,
                item_info,
            )

    if items_created == 0:
        prescription.delete()
        raise ValueError(
            f"No valid drugs found in external prescription items: {ext_req.requested_items}"
        )

    return prescription


def ingest_hl7_rde(
    raw_message: str, facility=None, organization=None
) -> ExternalPrescriptionRequest:
    """
    Parse and ingest an HL7 RDE^O11 (Pharmacy Order) message.

    Stores it as a pending external prescription request awaiting pharmacist
    review/acceptance.
    """
    segments = _parse_hl7_segments(raw_message)

    msh = segments.get("MSH", {})
    pid = segments.get("PID", {})
    orc = segments.get("ORC", {})
    rxe_list = segments.get("RXE", [])

    requested_items = []
    for rxe in rxe_list:
        requested_items.append(
            {
                "drug_code": rxe.get("give_code", ""),
                "drug_name": rxe.get("give_name", ""),
                "dose": rxe.get("dose", ""),
                "frequency": rxe.get("frequency", ""),
                "duration": rxe.get("duration", ""),
                "quantity": rxe.get("quantity", 1),
            }
        )

    ext_req = ExternalPrescriptionRequest.objects.create(
        message_control_id=msh.get("message_control_id", ""),
        sending_application=msh.get("sending_application", "UNKNOWN"),
        sending_facility=msh.get("sending_facility", "UNKNOWN"),
        prescriber_name=orc.get("prescriber_name", ""),
        prescriber_license=orc.get("prescriber_license", ""),
        external_patient_id=pid.get("patient_id", ""),
        patient_name=pid.get("patient_name", ""),
        patient_dob=pid.get("date_of_birth"),
        patient_gender=pid.get("gender", ""),
        patient_phone=pid.get("phone", ""),
        patient_id_number=pid.get("id_number", ""),
        external_prescription_number=orc.get(
            "placer_order_number", msh.get("message_control_id", "")
        ),
        priority=orc.get("priority", "ROUTINE"),
        clinical_info="",
        requested_items=requested_items,
        raw_message=raw_message,
        status=ExternalPrescriptionRequest.Status.RECEIVED,
        facility=facility,
        organization=organization,
    )

    logger.info(
        "Ingested HL7 RDE from %s/%s, rx number: %s (%d items)",
        msh.get("sending_application"),
        msh.get("sending_facility"),
        ext_req.external_prescription_number,
        len(requested_items),
    )

    return ext_req


def _parse_hl7_segments(raw_message: str) -> dict:
    """Parse HL7 v2.x message into structured segments (MSH, PID, ORC, RXE)."""
    segments: dict = {"RXE": []}
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
                "order_control": fields[1] if len(fields) > 1 else "",
                "placer_order_number": fields[2] if len(fields) > 2 else "",
                "prescriber_license": prescriber_parts[0] if prescriber_parts else "",
                "prescriber_name": prescriber_name,
                "priority": _parse_hl7_priority(fields[7] if len(fields) > 7 else ""),
            }
        elif seg == "RXE" and len(fields) >= 4:
            give_field = fields[2] if len(fields) > 2 else ""
            give_parts = give_field.split("^")
            segments["RXE"].append(
                {
                    "give_code": give_parts[0] if give_parts else "",
                    "give_name": give_parts[1] if len(give_parts) > 1 else "",
                    "quantity": fields[10] if len(fields) > 10 else 1,
                    "dose": fields[3] if len(fields) > 3 else "",
                    "frequency": fields[9] if len(fields) > 9 else "",
                    "duration": "",
                }
            )

    return segments


def _parse_hl7_priority(code: str) -> str:
    mapping = {"S": "STAT", "A": "STAT", "R": "ROUTINE", "P": "ROUTINE", "T": "URGENT"}
    return mapping.get(code.upper(), "ROUTINE")


def _resolve_drug(code: str, name: str = "") -> Drug | None:
    """Resolve an external drug code/name to a local Drug entry."""
    if code:
        drug = Drug.objects.filter(code=code).first()
        if drug:
            return drug
    if name:
        drug = (
            Drug.objects.filter(generic_name__iexact=name).first()
            or Drug.objects.filter(generic_name__icontains=name).first()
        )
        if drug:
            return drug
    return None
