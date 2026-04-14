"""Validation and observability queries for MCH and clinics flow unification."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import models
from django.db.models import Count, Max, Q

from hmis.apps.clinics.models import ClinicEnrollment, ClinicVisit
from hmis.apps.mch.models import ANCVisit, PNCVisit


@dataclass
class ValidationSummary:
    summary: dict[str, Any]
    details: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {"summary": self.summary, "details": self.details}


def get_unification_metrics() -> dict[str, int]:
    anc_completed_visits = ClinicVisit.objects.filter(
        session__clinic__clinic_type="ANC",
        status="COMPLETED",
    )
    pnc_completed_visits = ClinicVisit.objects.filter(
        session__clinic__clinic_type="PNC",
        status="COMPLETED",
    )
    return {
        "anc_visits_without_clinic_visit": ANCVisit.objects.filter(clinic_visit__isnull=True).count(),
        "pnc_visits_without_clinic_visit": PNCVisit.objects.filter(clinic_visit__isnull=True).count(),
        "anc_completed_clinic_visits_without_payload": anc_completed_visits.filter(anc_visit__isnull=True).count(),
        "pnc_completed_clinic_visits_without_payload": pnc_completed_visits.filter(pnc_visit__isnull=True).count(),
        "anc_enrollment_mismatches": _anc_enrollment_mismatch_queryset().count(),
    }


def _anc_enrollment_mismatch_queryset():
    return ClinicEnrollment.objects.filter(clinic__clinic_type="ANC").annotate(
        canonical_visit_count=Count(
            "patient__mch_registrations__anc_visits__clinic_visit",
            filter=Q(
                patient__mch_registrations__anc_enrollment_id__isnull=False,
                patient__mch_registrations__anc_enrollment_id__exact=models.F("id"),
                patient__mch_registrations__anc_visits__clinic_visit__status="COMPLETED",
                patient__mch_registrations__anc_visits__clinic_visit__session__clinic_id=models.F("clinic_id"),
            ),
            distinct=True,
        )
    ).exclude(canonical_visit_count=models.F("total_visits"))


def validate_mch_clinic_links() -> ValidationSummary:
    details: list[dict[str, Any]] = []

    for visit in ANCVisit.objects.select_related("registration__mother").filter(clinic_visit__isnull=True):
        details.append({
            "module": "ANC",
            "visit_id": visit.id,
            "registration_id": visit.registration_id,
            "patient_id": visit.registration.mother_id,
            "issue": "missing_clinic_visit",
        })

    for visit in PNCVisit.objects.select_related("registration__mother").filter(clinic_visit__isnull=True):
        details.append({
            "module": "PNC",
            "visit_id": visit.id,
            "registration_id": visit.registration_id,
            "patient_id": visit.registration.mother_id,
            "issue": "missing_clinic_visit",
        })

    dangling_anc = ClinicVisit.objects.filter(
        session__clinic__clinic_type="ANC",
        status="COMPLETED",
        anc_visit__isnull=True,
    )
    for visit in dangling_anc:
        details.append({
            "module": "ANC",
            "clinic_visit_id": visit.id,
            "patient_id": visit.patient_id,
            "issue": "completed_clinic_visit_missing_payload",
        })

    dangling_pnc = ClinicVisit.objects.filter(
        session__clinic__clinic_type="PNC",
        status="COMPLETED",
        pnc_visit__isnull=True,
    )
    for visit in dangling_pnc:
        details.append({
            "module": "PNC",
            "clinic_visit_id": visit.id,
            "patient_id": visit.patient_id,
            "issue": "completed_clinic_visit_missing_payload",
        })

    return ValidationSummary(summary=get_unification_metrics(), details=details)


def validate_enrollment_attendance_counts() -> ValidationSummary:
    details: list[dict[str, Any]] = []
    enrollments = ClinicEnrollment.objects.filter(clinic__clinic_type="ANC").select_related("clinic", "patient")
    mismatch_count = 0

    for enrollment in enrollments:
        anc_visits = ANCVisit.objects.filter(
            registration__anc_enrollment=enrollment,
            clinic_visit__isnull=False,
            clinic_visit__status="COMPLETED",
            clinic_visit__session__clinic=enrollment.clinic,
        )
        canonical_count = anc_visits.values("clinic_visit_id").distinct().count()
        latest_visit_date = anc_visits.aggregate(last_visit=Max("visit_date"))["last_visit"]
        if canonical_count != enrollment.total_visits:
            mismatch_count += 1
            details.append({
                "enrollment_id": enrollment.id,
                "enrollment_number": enrollment.enrollment_number,
                "patient_id": enrollment.patient_id,
                "clinic_id": enrollment.clinic_id,
                "stored_total_visits": enrollment.total_visits,
                "canonical_total_visits": canonical_count,
                "stored_last_visit_date": (
                    enrollment.last_visit_date.isoformat() if enrollment.last_visit_date else None
                ),
                "canonical_last_visit_date": latest_visit_date.isoformat() if latest_visit_date else None,
            })

    return ValidationSummary(
        summary={
            "checked_enrollments": enrollments.count(),
            "mismatched_enrollments": mismatch_count,
        },
        details=details,
    )


def validate_mch_encounter_consistency() -> ValidationSummary:
    details: list[dict[str, Any]] = []

    anc_inconsistent = ANCVisit.objects.filter(
        clinic_visit__isnull=False,
        encounter__isnull=False,
    ).exclude(clinic_visit__encounter=models.F("encounter"))
    for visit in anc_inconsistent:
        details.append({
            "module": "ANC",
            "visit_id": visit.id,
            "clinic_visit_id": visit.clinic_visit_id,
            "mch_encounter_id": visit.encounter_id,
            "clinic_visit_encounter_id": visit.clinic_visit.encounter_id if visit.clinic_visit else None,
        })

    pnc_inconsistent = PNCVisit.objects.filter(
        clinic_visit__isnull=False,
        encounter__isnull=False,
    ).exclude(clinic_visit__encounter=models.F("encounter"))
    for visit in pnc_inconsistent:
        details.append({
            "module": "PNC",
            "visit_id": visit.id,
            "clinic_visit_id": visit.clinic_visit_id,
            "mch_encounter_id": visit.encounter_id,
            "clinic_visit_encounter_id": visit.clinic_visit.encounter_id if visit.clinic_visit else None,
        })

    return ValidationSummary(
        summary={
            "anc_inconsistent_links": anc_inconsistent.count(),
            "pnc_inconsistent_links": pnc_inconsistent.count(),
        },
        details=details,
    )
