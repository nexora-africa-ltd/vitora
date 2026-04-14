"""Backfill and reconciliation services for MCH and clinic visit unification."""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Q

from hmis.apps.clinics.models import Clinic, ClinicEnrollment, ClinicProgramAttendance, ClinicVisit
from hmis.apps.mch.models import ANCVisit, PNCVisit

ModuleName = Literal["anc", "pnc"]

NAIROBI_TZ = ZoneInfo("Africa/Nairobi")


@dataclass
class BackfillRecord:
    module: ModuleName
    mch_visit_id: int
    action: str
    clinic_visit_id: int | None
    clinic_id: int | None
    visit_date: str
    notes: str = ""


@dataclass
class BackfillSummary:
    module: ModuleName
    processed: int = 0
    linked_existing: int = 0
    created_synthetic: int = 0
    skipped: int = 0
    errors: int = 0
    records: list[BackfillRecord] = field(default_factory=list)

    def add_record(self, **kwargs: Any) -> None:
        self.records.append(BackfillRecord(module=self.module, **kwargs))

    def to_dict(self) -> dict[str, Any]:
        return {
            "module": self.module,
            "processed": self.processed,
            "linked_existing": self.linked_existing,
            "created_synthetic": self.created_synthetic,
            "skipped": self.skipped,
            "errors": self.errors,
            "records": [asdict(record) for record in self.records],
        }


@dataclass
class ReconciliationRecord:
    enrollment_id: int
    enrollment_number: str
    patient_id: int
    canonical_count: int
    previous_total_visits: int
    new_total_visits: int
    previous_last_visit_date: str | None
    new_last_visit_date: str | None
    previous_next_appointment: str | None
    new_next_appointment: str | None
    changed: bool


def _module_label(module: ModuleName) -> str:
    return "MCH_ANC" if module == "anc" else "MCH_PNC"


def _visit_queryset(
    module: ModuleName,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    start_after_id: int | None = None,
):
    model = ANCVisit if module == "anc" else PNCVisit
    queryset = model.objects.select_related(
        "registration",
        "registration__anc_enrollment__clinic",
        "registration__mother",
        "clinic_visit",
        "encounter",
    ).order_by("id")

    if from_date:
        queryset = queryset.filter(visit_date__gte=from_date)
    if to_date:
        queryset = queryset.filter(visit_date__lte=to_date)
    if start_after_id:
        queryset = queryset.filter(id__gt=start_after_id)
    return queryset


def _resolve_backfill_clinic(mch_visit, module: ModuleName, clinic_id: int | None = None) -> Clinic:
    clinic_type = "ANC" if module == "anc" else "PNC"
    if clinic_id:
        return Clinic.objects.get(pk=clinic_id)

    if module == "anc":
        enrollment = getattr(mch_visit.registration, "anc_enrollment", None)
        if enrollment and enrollment.clinic and enrollment.clinic.clinic_type == clinic_type:
            return enrollment.clinic

    clinic = Clinic.objects.filter(clinic_type=clinic_type, status="ACTIVE").first()
    if clinic is None:
        raise Clinic.DoesNotExist(f"No active {clinic_type} clinic available for backfill")
    return clinic


def _candidate_visits(mch_visit, clinic: Clinic, module: ModuleName):
    queryset = ClinicVisit.objects.select_related("session__clinic").filter(
        patient=mch_visit.registration.mother,
        session__clinic=clinic,
        session__session_date=mch_visit.visit_date,
    )
    if module == "anc":
        queryset = queryset.filter(Q(anc_visit__isnull=True) | Q(anc_visit=mch_visit))
    else:
        queryset = queryset.filter(Q(pnc_visit__isnull=True) | Q(pnc_visit=mch_visit))
    return queryset.order_by("id")


def _choose_candidate_visit(mch_visit, clinic: Clinic, module: ModuleName) -> ClinicVisit | None:
    module_label = _module_label(module)
    candidates = _candidate_visits(mch_visit, clinic, module)

    exact_source = candidates.filter(
        source_module=module_label,
        source_record_id=mch_visit.id,
    ).first()
    if exact_source:
        return exact_source

    if mch_visit.encounter_id:
        encounter_matches = list(candidates.filter(encounter_id=mch_visit.encounter_id)[:2])
        if len(encounter_matches) == 1:
            return encounter_matches[0]

    count = candidates.count()
    if count == 1:
        return candidates.first()

    return None


def _synthetic_timestamps(visit_date: date) -> tuple[datetime, datetime, datetime]:
    registered_at = datetime.combine(visit_date, time(8, 0), tzinfo=NAIROBI_TZ)
    consultation_started_at = datetime.combine(visit_date, time(8, 15), tzinfo=NAIROBI_TZ)
    completed_at = datetime.combine(visit_date, time(8, 30), tzinfo=NAIROBI_TZ)
    return registered_at, consultation_started_at, completed_at


def _create_synthetic_visit(mch_visit, clinic: Clinic, module: ModuleName) -> ClinicVisit:
    session, _ = clinic.get_or_create_session(mch_visit.visit_date)
    visit = ClinicVisit(
        session=session,
        patient=mch_visit.registration.mother,
        encounter=mch_visit.encounter,
        status="COMPLETED",
        visit_type="NEW" if mch_visit.visit_number == 1 else "FOLLOW_UP",
        source="DIRECT",
        source_module=_module_label(module),
        source_record_id=mch_visit.id,
        chief_complaint=(
            f"Backfilled {module.upper()} visit {mch_visit.visit_number} - {mch_visit.registration.mch_number}"
        ),
        notes=(
            f"Backfilled from {mch_visit.__class__.__name__} {mch_visit.id}; timestamps are synthetic"
        ),
    )
    visit._skip_broadcast = True
    visit.save(force_insert=True)

    registered_at, consultation_started_at, completed_at = _synthetic_timestamps(
        mch_visit.visit_date
    )
    ClinicVisit.objects.filter(pk=visit.pk).update(
        registered_at=registered_at,
        consultation_started_at=consultation_started_at,
        completed_at=completed_at,
    )
    visit.refresh_from_db()
    return visit


def _link_mch_visit(mch_visit, clinic_visit: ClinicVisit, module: ModuleName) -> None:
    update_fields = ["clinic_visit"]
    mch_visit.clinic_visit = clinic_visit
    if mch_visit.encounter_id and clinic_visit.encounter_id != mch_visit.encounter_id:
        clinic_visit._skip_broadcast = True
        clinic_visit.encounter = mch_visit.encounter
        clinic_visit.save(update_fields=["encounter"])
    mch_visit.save(update_fields=update_fields)

    if module == "anc":
        ClinicProgramAttendance.objects.update_or_create(
            clinic_visit=clinic_visit,
            defaults={
                "enrollment": mch_visit.registration.anc_enrollment,
                "attendance_date": mch_visit.visit_date,
                "source_module": _module_label(module),
                "source_record_id": mch_visit.id,
            },
        )


@transaction.atomic
def backfill_mch_clinic_visits(
    *,
    module: ModuleName,
    dry_run: bool = False,
    from_date: date | None = None,
    to_date: date | None = None,
    clinic_id: int | None = None,
    limit: int | None = None,
    batch_size: int = 100,
    start_after_id: int | None = None,
) -> BackfillSummary:
    summary = BackfillSummary(module=module)
    queryset = _visit_queryset(
        module,
        from_date=from_date,
        to_date=to_date,
        start_after_id=start_after_id,
    ).filter(clinic_visit__isnull=True)

    processed = 0
    for mch_visit in queryset.iterator(chunk_size=batch_size):
        if limit is not None and processed >= limit:
            break

        processed += 1
        summary.processed += 1
        try:
            clinic = _resolve_backfill_clinic(mch_visit, module, clinic_id=clinic_id)
            existing = _choose_candidate_visit(mch_visit, clinic, module)

            if existing is not None:
                if dry_run:
                    summary.linked_existing += 1
                    summary.add_record(
                        mch_visit_id=mch_visit.id,
                        action="link-existing",
                        clinic_visit_id=existing.id,
                        clinic_id=clinic.id,
                        visit_date=mch_visit.visit_date.isoformat(),
                        notes="Dry run; existing clinic visit candidate would be linked",
                    )
                    continue

                _link_mch_visit(mch_visit, existing, module)
                summary.linked_existing += 1
                summary.add_record(
                    mch_visit_id=mch_visit.id,
                    action="link-existing",
                    clinic_visit_id=existing.id,
                    clinic_id=clinic.id,
                    visit_date=mch_visit.visit_date.isoformat(),
                )
                continue

            if dry_run:
                summary.created_synthetic += 1
                summary.add_record(
                    mch_visit_id=mch_visit.id,
                    action="create-synthetic",
                    clinic_visit_id=None,
                    clinic_id=clinic.id,
                    visit_date=mch_visit.visit_date.isoformat(),
                    notes="Dry run; synthetic clinic visit would be created",
                )
                continue

            synthetic = _create_synthetic_visit(mch_visit, clinic, module)
            _link_mch_visit(mch_visit, synthetic, module)
            summary.created_synthetic += 1
            summary.add_record(
                mch_visit_id=mch_visit.id,
                action="create-synthetic",
                clinic_visit_id=synthetic.id,
                clinic_id=clinic.id,
                visit_date=mch_visit.visit_date.isoformat(),
            )
        except Exception as exc:  # pragma: no cover - defensive logging path
            summary.errors += 1
            summary.add_record(
                mch_visit_id=mch_visit.id,
                action="error",
                clinic_visit_id=None,
                clinic_id=clinic_id,
                visit_date=mch_visit.visit_date.isoformat(),
                notes=str(exc),
            )

    return summary


def reconcile_anc_enrollment_attendance(
    *,
    dry_run: bool = False,
    clinic_id: int | None = None,
    limit: int | None = None,
) -> list[ReconciliationRecord]:
    enrollments = ClinicEnrollment.objects.select_related("clinic", "patient").filter(
        clinic__clinic_type="ANC"
    )
    if clinic_id is not None:
        enrollments = enrollments.filter(clinic_id=clinic_id)

    records: list[ReconciliationRecord] = []
    for index, enrollment in enumerate(enrollments.order_by("id"), start=1):
        if limit is not None and index > limit:
            break

        anc_visits = (
            ANCVisit.objects.filter(
                registration__anc_enrollment=enrollment,
                clinic_visit__isnull=False,
                clinic_visit__status="COMPLETED",
                clinic_visit__session__clinic=enrollment.clinic,
            )
            .select_related("clinic_visit")
            .order_by("visit_date", "id")
        )

        canonical_count = anc_visits.values("clinic_visit_id").distinct().count()
        latest_visit = anc_visits.order_by("-visit_date", "-id").first()
        next_appointment = latest_visit.next_visit_date if latest_visit else None
        last_visit_date = latest_visit.visit_date if latest_visit else None

        previous_total = enrollment.total_visits
        previous_last = (
            enrollment.last_visit_date.isoformat() if enrollment.last_visit_date else None
        )
        previous_next = (
            enrollment.next_appointment.isoformat() if enrollment.next_appointment else None
        )
        changed = (
            previous_total != canonical_count
            or enrollment.last_visit_date != last_visit_date
            or enrollment.next_appointment != next_appointment
        )

        record = ReconciliationRecord(
            enrollment_id=enrollment.id,
            enrollment_number=enrollment.enrollment_number,
            patient_id=enrollment.patient_id,
            canonical_count=canonical_count,
            previous_total_visits=previous_total,
            new_total_visits=canonical_count,
            previous_last_visit_date=previous_last,
            new_last_visit_date=last_visit_date.isoformat() if last_visit_date else None,
            previous_next_appointment=previous_next,
            new_next_appointment=next_appointment.isoformat() if next_appointment else None,
            changed=changed,
        )
        records.append(record)

        if changed and not dry_run:
            enrollment.total_visits = canonical_count
            enrollment.last_visit_date = last_visit_date
            enrollment.next_appointment = next_appointment
            enrollment.save(update_fields=["total_visits", "last_visit_date", "next_appointment"])

    return records


def write_report_file(report_path: str, records: list[dict[str, Any]]) -> Path:
    path = Path(report_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.suffix.lower() == ".csv":
        fieldnames = sorted({key for record in records for key in record.keys()})
        with path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
            writer.writeheader()
            for record in records:
                writer.writerow(record)
        return path

    with path.open("w", encoding="utf-8") as json_file:
        json.dump(records, json_file, indent=2, sort_keys=True)
    return path
