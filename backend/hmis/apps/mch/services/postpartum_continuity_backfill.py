from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
import json
from pathlib import Path
from typing import Any

from django.db import transaction

from hmis.apps.inpatient.models import Discharge, WardRound
from hmis.apps.mch.models import PNCVisit
from hmis.apps.mch.services.postpartum_continuity import (
    route_registration_to_pnc_queue,
    schedule_registration_pnc_follow_up,
    transition_registration_to_postnatal,
)
from hmis.apps.scheduling.models import Appointment


@dataclass
class PostpartumContinuityBackfillRecord:
    discharge_id: int
    admission_id: int
    action: str
    maternity_continuity_action: str | None = None
    maternity_continuity_status: str | None = None
    pnc_clinic_visit_id: int | None = None
    pnc_appointment_id: int | None = None
    notes: str = ""


@dataclass
class PostpartumContinuityBackfillSummary:
    processed: int = 0
    discharges_updated: int = 0
    kardex_updated: int = 0
    ward_rounds_updated: int = 0
    skipped: int = 0
    errors: int = 0
    records: list[PostpartumContinuityBackfillRecord] = field(default_factory=list)

    def add_record(self, **kwargs: Any) -> None:
        self.records.append(PostpartumContinuityBackfillRecord(**kwargs))

    def to_dict(self) -> dict[str, Any]:
        return {
            "processed": self.processed,
            "discharges_updated": self.discharges_updated,
            "kardex_updated": self.kardex_updated,
            "ward_rounds_updated": self.ward_rounds_updated,
            "skipped": self.skipped,
            "errors": self.errors,
            "records": [asdict(record) for record in self.records],
        }


def _discharge_queryset(
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    start_after_id: int | None = None,
):
    queryset = Discharge.objects.select_related(
        "admission",
        "admission__patient",
        "admission__mch_registration",
        "admission__kardex",
        "pnc_clinic_visit",
        "pnc_appointment",
    ).prefetch_related("admission__ward_rounds", "pnc_visits__clinic_visit")

    queryset = queryset.filter(admission__mch_registration__isnull=False).order_by("id")

    if from_date:
        queryset = queryset.filter(discharge_date__date__gte=from_date)
    if to_date:
        queryset = queryset.filter(discharge_date__date__lte=to_date)
    if start_after_id:
        queryset = queryset.filter(id__gt=start_after_id)

    return queryset


def _find_existing_follow_up_appointment(discharge: Discharge) -> Appointment | None:
    if discharge.follow_up_date is None:
        return None

    return (
        Appointment.objects.filter(
            patient=discharge.admission.patient,
            scheduled_start__date=discharge.follow_up_date,
            appointment_type="FOLLOW_UP",
        )
        .exclude(status="CANCELLED")
        .order_by("id")
        .first()
    )


def _infer_existing_queue_route(discharge: Discharge):
    linked_pnc_visit = (
        discharge.pnc_visits.select_related("clinic_visit")
        .filter(clinic_visit__isnull=False)
        .order_by("visit_date", "id")
        .first()
    )
    if linked_pnc_visit is not None:
        return linked_pnc_visit.clinic_visit

    return None


def _update_related_postpartum_records(discharge: Discharge, *, dry_run: bool) -> tuple[int, int]:
    kardex_updates = 0
    ward_round_updates = 0

    kardex = getattr(discharge.admission, "kardex", None)
    if kardex is not None and kardex.maternity_continuity_action == "NONE":
        if not dry_run:
            kardex.maternity_continuity_action = discharge.maternity_continuity_action
            kardex.maternity_continuity_notes = (
                f"Backfilled from discharge continuity action on {discharge.discharge_date.date().isoformat()}."
            )
            kardex.save(update_fields=["maternity_continuity_action", "maternity_continuity_notes", "updated_at"])
        kardex_updates += 1

    ward_rounds = discharge.admission.ward_rounds.filter(
        review_type="PRE_DISCHARGE",
        maternity_continuity_action="NONE",
    )
    if ward_rounds.exists():
        if not dry_run:
            for ward_round in ward_rounds:
                ward_round.maternity_continuity_action = discharge.maternity_continuity_action
                ward_round.maternity_continuity_notes = (
                    f"Backfilled from discharge continuity action on {discharge.discharge_date.date().isoformat()}."
                )
                ward_round.save(
                    update_fields=[
                        "maternity_continuity_action",
                        "maternity_continuity_notes",
                        "updated_at",
                    ]
                )
        ward_round_updates += ward_rounds.count()

    return kardex_updates, ward_round_updates


@transaction.atomic
def backfill_maternity_postpartum_continuity(
    *,
    dry_run: bool = False,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int | None = None,
    batch_size: int = 100,
    start_after_id: int | None = None,
) -> PostpartumContinuityBackfillSummary:
    summary = PostpartumContinuityBackfillSummary()

    queryset = _discharge_queryset(from_date=from_date, to_date=to_date, start_after_id=start_after_id)

    for index, discharge in enumerate(queryset.iterator(chunk_size=batch_size), start=1):
        if limit is not None and index > limit:
            break

        summary.processed += 1
        try:
            already_reconciled = (
                discharge.maternity_continuity_action != "NONE"
                or discharge.pnc_clinic_visit_id is not None
                or discharge.pnc_appointment_id is not None
                or discharge.maternity_continuity_status != "NOT_APPLICABLE"
            )

            if already_reconciled:
                kardex_updates, ward_round_updates = _update_related_postpartum_records(discharge, dry_run=dry_run)
                summary.kardex_updated += kardex_updates
                summary.ward_rounds_updated += ward_round_updates
                summary.skipped += 1
                summary.add_record(
                    discharge_id=discharge.id,
                    admission_id=discharge.admission_id,
                    action="skip-existing",
                    maternity_continuity_action=discharge.maternity_continuity_action,
                    maternity_continuity_status=discharge.maternity_continuity_status,
                    pnc_clinic_visit_id=discharge.pnc_clinic_visit_id,
                    pnc_appointment_id=discharge.pnc_appointment_id,
                    notes="Discharge continuity was already populated; only related records were reconciled if needed.",
                )
                continue

            existing_queue_visit = _infer_existing_queue_route(discharge)
            existing_appointment = _find_existing_follow_up_appointment(discharge)

            inferred_action: str | None = None
            inferred_status: str | None = None
            clinic_visit_id: int | None = None
            appointment_id: int | None = None

            if existing_queue_visit is not None:
                inferred_action = "ROUTE_TO_PNC_QUEUE"
                inferred_status = "QUEUED"
                clinic_visit_id = existing_queue_visit.id
            elif discharge.follow_up_date is not None:
                inferred_action = "SCHEDULE_EARLY_PNC"
                inferred_status = "SCHEDULED"
                appointment_id = existing_appointment.id if existing_appointment is not None else None
            else:
                summary.skipped += 1
                summary.add_record(
                    discharge_id=discharge.id,
                    admission_id=discharge.admission_id,
                    action="skip-manual-review",
                    notes="No follow-up date or linked PNC clinic visit found; manual review required.",
                )
                continue

            if not dry_run:
                transition_registration_to_postnatal(discharge.admission.mch_registration)

                if inferred_action == "SCHEDULE_EARLY_PNC":
                    appointment = existing_appointment or schedule_registration_pnc_follow_up(
                        discharge.admission.mch_registration,
                        visit_date=discharge.follow_up_date,
                        user=discharge.discharged_by,
                        notes=discharge.follow_up_instructions,
                    )
                    discharge.pnc_appointment = appointment
                    discharge.pnc_clinic_visit = None
                    appointment_id = appointment.id
                elif inferred_action == "ROUTE_TO_PNC_QUEUE":
                    clinic_visit = existing_queue_visit or route_registration_to_pnc_queue(
                        discharge.admission.mch_registration,
                        user=discharge.discharged_by,
                        routing_date=discharge.discharge_date.date(),
                        notes=discharge.follow_up_instructions,
                    )
                    discharge.pnc_clinic_visit = clinic_visit
                    discharge.pnc_appointment = None
                    clinic_visit_id = clinic_visit.id

                discharge.maternity_continuity_action = inferred_action
                discharge.maternity_continuity_status = inferred_status
                discharge.save(
                    update_fields=[
                        "maternity_continuity_action",
                        "maternity_continuity_status",
                        "pnc_clinic_visit",
                        "pnc_appointment",
                        "updated_at",
                    ]
                )

            kardex_updates, ward_round_updates = _update_related_postpartum_records(discharge, dry_run=dry_run)
            summary.discharges_updated += 1
            summary.kardex_updated += kardex_updates
            summary.ward_rounds_updated += ward_round_updates
            summary.add_record(
                discharge_id=discharge.id,
                admission_id=discharge.admission_id,
                action="dry-run" if dry_run else "backfilled",
                maternity_continuity_action=inferred_action,
                maternity_continuity_status=inferred_status,
                pnc_clinic_visit_id=clinic_visit_id,
                pnc_appointment_id=appointment_id,
                notes="Dry run only." if dry_run else "Backfilled discharge continuity and related maternity workflow records.",
            )
        except Exception as exc:  # pragma: no cover - defensive path
            summary.errors += 1
            summary.add_record(
                discharge_id=discharge.id,
                admission_id=discharge.admission_id,
                action="error",
                notes=str(exc),
            )

    if dry_run:
        transaction.set_rollback(True)

    return summary


def write_report_file(report_file: str, payload: dict[str, Any]) -> str:
    path = Path(report_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(path)