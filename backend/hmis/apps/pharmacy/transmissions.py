# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""In-network electronic prescription transmission service.

Use from ``PrescriptionViewSet.transmit`` to deliver a prescription to a
pharmacy-enabled facility in the same organization. Inputs are a Prescription,
recipient Facility, and transmitting user.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from hmis.apps.pharmacy.models import Prescription, PrescriptionTransmission
from hmis.apps.pharmacy.standalone.models import ExternalPrescriptionRequest


@transaction.atomic
def transmit_prescription(
    *, prescription: Prescription, recipient_facility, user
) -> PrescriptionTransmission:
    """Persist and deliver a prescription to an in-network recipient pharmacy."""
    if recipient_facility.organization_id != prescription.organization_id:
        raise ValidationError("The recipient pharmacy must belong to the same organization.")
    if not recipient_facility.has_pharmacy:
        raise ValidationError("The recipient facility does not have pharmacy services enabled.")
    if recipient_facility.id == prescription.facility_id:
        raise ValidationError("Select another facility pharmacy for electronic transmission.")
    if not prescription.patient_id:
        raise ValidationError("Only patient-linked prescriptions can be transmitted.")

    transmission, created = PrescriptionTransmission.objects.get_or_create(
        prescription=prescription,
        recipient_facility=recipient_facility,
        defaults={
            "facility": prescription.facility,
            "organization": prescription.organization,
            "transmitted_by": user,
        },
    )
    if not created:
        return transmission

    patient = prescription.patient
    request = ExternalPrescriptionRequest.objects.create(
        message_control_id=f"VITORA-RX-{prescription.public_id}",
        sending_application="Vitora HMIS",
        sending_facility=prescription.facility.name,
        prescriber_name=user.get_full_name() or user.username,
        external_patient_id=patient.mrn,
        patient_name=f"{patient.first_name} {patient.last_name}",
        patient_dob=patient.date_of_birth,
        patient_gender=patient.gender,
        patient_phone=patient.phone_number or "",
        external_prescription_number=prescription.prescription_number,
        clinical_info=prescription.clinical_notes,
        requested_items=[
            {
                "drug_code": item.drug.code,
                "drug_name": item.drug.generic_name,
                "dose": item.dosage,
                "frequency": item.frequency,
                "duration": item.duration,
                "quantity": item.quantity,
                "route": item.route,
                "instructions": item.instructions,
            }
            for item in prescription.items.select_related("drug").filter(is_cancelled=False)
        ],
        status=ExternalPrescriptionRequest.Status.RECEIVED,
        facility=recipient_facility,
        organization=recipient_facility.organization,
    )
    transmission.recipient_request = request
    transmission.save(update_fields=["recipient_request", "updated_at"])
    return transmission


@transaction.atomic
def update_transmission_status(request: ExternalPrescriptionRequest) -> None:
    """Mirror recipient acceptance or rejection to the originating facility."""
    transmission = getattr(request, "source_transmission", None)
    if not transmission:
        return
    if request.status == ExternalPrescriptionRequest.Status.ACCEPTED:
        transmission.status = PrescriptionTransmission.Status.ACCEPTED
        transmission.accepted_at = timezone.now()
        transmission.save(update_fields=["status", "accepted_at", "updated_at"])
    elif request.status == ExternalPrescriptionRequest.Status.REJECTED:
        transmission.status = PrescriptionTransmission.Status.REJECTED
        transmission.rejected_at = timezone.now()
        transmission.rejection_reason = request.rejection_reason
        transmission.save(update_fields=["status", "rejected_at", "rejection_reason", "updated_at"])
