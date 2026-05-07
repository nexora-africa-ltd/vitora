"""
Services for standalone LIS operations.

Handles HL7 ORM^O01 inbound order processing and walk-in patient creation.
"""

import logging
from datetime import datetime

from django.contrib.auth import get_user_model

from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog

from .models import ExternalOrderRequest, WalkInPatient

logger = logging.getLogger(__name__)
User = get_user_model()


def process_external_order(
    ext_order: ExternalOrderRequest,
    user,
    auto_create_walkin: bool = True,
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
        bill_patient=False,
        facility=facility,
        organization=organization,
    )

    # Resolve and create order items
    items_created = 0
    for test_info in ext_order.requested_tests:
        test_code = test_info if isinstance(test_info, str) else test_info.get("code", "")
        test = _resolve_test_code(test_code)
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

    return order


def ingest_hl7_orm(raw_message: str, facility=None, organization=None) -> ExternalOrderRequest:
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


def _resolve_test_code(code: str) -> TestCatalog | None:
    """
    Resolve an external test code to a TestCatalog entry.

    Tries: exact code match → LOINC code → short name.
    """
    if not code:
        return None

    # Try exact code match
    test = TestCatalog.objects.filter(code=code).first()
    if test:
        return test

    # Try LOINC code
    test = TestCatalog.objects.filter(loinc_code=code).first()
    if test:
        return test

    # Try short name (case-insensitive)
    test = TestCatalog.objects.filter(short_name__iexact=code).first()
    if test:
        return test

    # Try via ExternalCodeMapping
    try:
        from hmis.apps.core.models import ExternalCodeMapping

        mapped = ExternalCodeMapping.resolve("LIS_DEFAULT", code)
        if mapped and isinstance(mapped, TestCatalog):
            return mapped
    except Exception:  # noqa: S110
        logger.debug("ExternalCodeMapping unavailable for code: %s", code)

    return None
