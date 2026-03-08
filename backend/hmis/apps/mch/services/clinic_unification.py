"""Live-linking services for unified MCH and clinic workflows."""

from __future__ import annotations

from typing import Literal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from hmis.apps.clinics.models import Clinic, ClinicProgramAttendance, ClinicVisit
from hmis.apps.core.models import FeatureFlag


def _is_enabled(flag_name: str) -> bool:
    return FeatureFlag.is_flag_enabled(flag_name)


def _module_for_visit(mch_visit) -> Literal["MCH_ANC", "MCH_PNC"]:
    model_name = mch_visit.__class__.__name__
    if model_name == "ANCVisit":
        return "MCH_ANC"
    if model_name == "PNCVisit":
        return "MCH_PNC"
    raise ValidationError(f"Unsupported MCH visit type: {model_name}")


def _clinic_type_for_visit(mch_visit) -> Literal["ANC", "PNC"]:
    return "ANC" if _module_for_visit(mch_visit) == "MCH_ANC" else "PNC"


def _resolve_clinic_for_visit(mch_visit):
    clinic_type = _clinic_type_for_visit(mch_visit)
    if clinic_type == "ANC":
        enrollment = getattr(mch_visit.registration, "anc_enrollment", None)
        if enrollment and enrollment.clinic and enrollment.clinic.clinic_type == "ANC":
            return enrollment.clinic

    clinic = Clinic.objects.filter(clinic_type=clinic_type, status="ACTIVE").first()
    if clinic is None:
        raise ValidationError(f"No active {clinic_type} clinic available for live linking.")
    return clinic


def _validate_explicit_clinic_visit(mch_visit, clinic_visit: ClinicVisit) -> None:
    patient = mch_visit.registration.mother
    if clinic_visit.patient_id != patient.id:
        raise ValidationError({"clinic_visit": "Clinic visit patient does not match MCH registration mother."})

    expected_clinic_type = _clinic_type_for_visit(mch_visit)
    actual_clinic_type = clinic_visit.session.clinic.clinic_type
    if actual_clinic_type != expected_clinic_type:
        raise ValidationError(
            {"clinic_visit": f"Clinic visit must belong to a {expected_clinic_type} clinic."}
        )

    if mch_visit.encounter_id and clinic_visit.encounter_id and clinic_visit.encounter_id != mch_visit.encounter_id:
        raise ValidationError({"clinic_visit": "Clinic visit encounter does not match the MCH visit encounter."})


def _chief_complaint_for_visit(mch_visit) -> str:
    clinic_type = _clinic_type_for_visit(mch_visit)
    if clinic_type == "ANC":
        return f"ANC visit {mch_visit.visit_number} - {mch_visit.registration.mch_number}"
    return f"PNC visit {mch_visit.visit_number} - {mch_visit.registration.mch_number}"


@transaction.atomic
def link_or_create_clinic_visit_for_mch_visit(mch_visit, user=None):
    """Link an MCH visit to a canonical clinic visit, creating one when needed."""
    if not _is_enabled("MCH_LINK_CLINIC_VISITS"):
        return getattr(mch_visit, "clinic_visit", None)

    module = _module_for_visit(mch_visit)
    patient = mch_visit.registration.mother
    explicit_clinic_visit = getattr(mch_visit, "clinic_visit", None)

    if explicit_clinic_visit is not None:
        explicit_clinic_visit = (
            ClinicVisit.objects.select_related("session__clinic", "patient", "encounter")
            .get(pk=explicit_clinic_visit.pk)
        )
        _validate_explicit_clinic_visit(mch_visit, explicit_clinic_visit)
        clinic_visit = explicit_clinic_visit
    else:
        clinic = _resolve_clinic_for_visit(mch_visit)
        session, _ = clinic.get_or_create_session(mch_visit.visit_date)
        clinic_visit = ClinicVisit.objects.create(
            session=session,
            patient=patient,
            encounter=mch_visit.encounter,
            status="COMPLETED",
            visit_type="NEW" if mch_visit.visit_number == 1 else "FOLLOW_UP",
            source="DIRECT",
            source_module=module,
            source_record_id=mch_visit.id,
            assigned_clinician=user,
            registered_by=user,
            chief_complaint=_chief_complaint_for_visit(mch_visit),
            consultation_started_at=timezone.now(),
            completed_at=timezone.now(),
        )

    update_fields: list[str] = []
    if clinic_visit.encounter_id != mch_visit.encounter_id and mch_visit.encounter_id:
        clinic_visit.encounter = mch_visit.encounter
        update_fields.append("encounter")
    if clinic_visit.status != "COMPLETED":
        clinic_visit.status = "COMPLETED"
        update_fields.append("status")
    if clinic_visit.completed_at is None:
        clinic_visit.completed_at = timezone.now()
        update_fields.append("completed_at")
    if clinic_visit.source != "DIRECT":
        clinic_visit.source = "DIRECT"
        update_fields.append("source")
    if clinic_visit.source_module != module:
        clinic_visit.source_module = module
        update_fields.append("source_module")
    if clinic_visit.source_record_id != mch_visit.id:
        clinic_visit.source_record_id = mch_visit.id
        update_fields.append("source_record_id")
    if user and clinic_visit.registered_by_id is None:
        clinic_visit.registered_by = user
        update_fields.append("registered_by")
    if user and clinic_visit.assigned_clinician_id is None:
        clinic_visit.assigned_clinician = user
        update_fields.append("assigned_clinician")
    if update_fields:
        clinic_visit.save(update_fields=update_fields)

    if getattr(mch_visit, "clinic_visit_id", None) != clinic_visit.id:
        mch_visit.clinic_visit = clinic_visit
        mch_visit.save(update_fields=["clinic_visit"])

    return clinic_visit


@transaction.atomic
def finalize_program_attendance_from_clinic_visit(mch_visit):
    """Update ANC enrollment summary from canonical attendance exactly once."""
    if _module_for_visit(mch_visit) != "MCH_ANC":
        return None
    if not _is_enabled("MCH_DERIVE_ENROLLMENT_FROM_CLINIC_VISITS"):
        return None
    if mch_visit.clinic_visit_id is None:
        return None

    enrollment = getattr(mch_visit.registration, "anc_enrollment", None)
    if enrollment is None:
        return None

    attendance, created = ClinicProgramAttendance.objects.get_or_create(
        clinic_visit=mch_visit.clinic_visit,
        defaults={
            "enrollment": enrollment,
            "attendance_date": mch_visit.visit_date,
            "source_module": "MCH_ANC",
            "source_record_id": mch_visit.id,
        },
    )

    attendance_updates: list[str] = []
    if attendance.enrollment_id != enrollment.id:
        attendance.enrollment = enrollment
        attendance_updates.append("enrollment")
    if attendance.attendance_date != mch_visit.visit_date:
        attendance.attendance_date = mch_visit.visit_date
        attendance_updates.append("attendance_date")
    if attendance.source_record_id != mch_visit.id:
        attendance.source_record_id = mch_visit.id
        attendance_updates.append("source_record_id")
    if attendance.source_module != "MCH_ANC":
        attendance.source_module = "MCH_ANC"
        attendance_updates.append("source_module")
    if attendance_updates:
        attendance.save(update_fields=attendance_updates)

    enrollment_updates: list[str] = []
    if created:
        enrollment.total_visits += 1
        enrollment_updates.append("total_visits")
    if enrollment.last_visit_date is None or mch_visit.visit_date >= enrollment.last_visit_date:
        if enrollment.last_visit_date != mch_visit.visit_date:
            enrollment.last_visit_date = mch_visit.visit_date
            enrollment_updates.append("last_visit_date")
    if mch_visit.next_visit_date and enrollment.next_appointment != mch_visit.next_visit_date:
        enrollment.next_appointment = mch_visit.next_visit_date
        enrollment_updates.append("next_appointment")
    if enrollment_updates:
        enrollment.save(update_fields=list(dict.fromkeys(enrollment_updates)))

    return attendance
