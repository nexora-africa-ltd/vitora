# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Clinical summary composition for inpatient encounters.

Builds a chronological, source-labeled summary without mutating source notes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone


@dataclass
class ClinicalSummaryEntry:
    """One timeline entry in an inpatient clinical summary."""

    timestamp: datetime
    source: str
    author: str
    content: str


class InpatientClinicalSummaryComposer:
    """Compose inpatient narrative snapshots from normalized source records."""

    @classmethod
    def compose_for_encounter(
        cls,
        encounter,
        *,
        max_ward_rounds: int = 20,
        max_shift_notes: int = 20,
        max_handover_notes: int = 20,
    ) -> list[ClinicalSummaryEntry]:
        admission = getattr(encounter, "admission", None)
        if admission is None:
            return []

        return cls.compose_for_admission(
            admission,
            max_ward_rounds=max_ward_rounds,
            max_shift_notes=max_shift_notes,
            max_handover_notes=max_handover_notes,
        )

    @classmethod
    def compose_for_admission(
        cls,
        admission,
        *,
        max_ward_rounds: int = 20,
        max_shift_notes: int = 20,
        max_handover_notes: int = 20,
    ) -> list[ClinicalSummaryEntry]:
        entries: list[ClinicalSummaryEntry] = []

        encounter_entry = cls._encounter_notes_entry(admission)
        if encounter_entry is not None:
            entries.append(encounter_entry)

        entries.extend(cls._ward_round_entries(admission, limit=max_ward_rounds))
        entries.extend(cls._kardex_shift_entries(admission, limit=max_shift_notes))
        entries.extend(cls._kardex_handover_entries(admission, limit=max_handover_notes))

        return sorted(entries, key=lambda item: item.timestamp)

    @classmethod
    def render_text(cls, entries: list[ClinicalSummaryEntry]) -> str:
        if not entries:
            return ""

        lines: list[str] = ["INPATIENT CLINICAL COURSE (Chronological)", "-" * 50, ""]
        for entry in entries:
            stamp = timezone.localtime(entry.timestamp).strftime("%Y-%m-%d %H:%M")
            lines.append(f"[{stamp}] {entry.source} - {entry.author}")
            lines.append(entry.content)
            lines.append("")

        return "\n".join(lines).strip()

    @staticmethod
    def _ward_round_entries(admission, *, limit: int) -> list[ClinicalSummaryEntry]:
        rounds = list(
            admission.ward_rounds.select_related("conducted_by").order_by(
                "-round_date", "-round_time", "-created_at"
            )[:limit]
        )
        rounds.reverse()

        entries: list[ClinicalSummaryEntry] = []
        for ward_round in rounds:
            timestamp = datetime.combine(ward_round.round_date, ward_round.round_time)
            if timezone.is_naive(timestamp):
                timestamp = timezone.make_aware(timestamp, timezone.get_current_timezone())

            author = (
                ward_round.conducted_by.get_full_name().strip()
                or ward_round.conducted_by.username
                or "Unknown clinician"
            )
            content = (
                f"Condition: {ward_round.get_condition_status_display()}\n"
                f"Subjective: {ward_round.subjective}\n"
                f"Objective: {ward_round.objective}\n"
                f"Assessment: {ward_round.assessment}\n"
                f"Plan: {ward_round.plan}"
            )
            entries.append(
                ClinicalSummaryEntry(
                    timestamp=timestamp,
                    source="Ward Round",
                    author=author,
                    content=content,
                )
            )

        return entries

    @staticmethod
    def _encounter_notes_entry(admission) -> ClinicalSummaryEntry | None:
        encounter = getattr(admission, "ipd_encounter", None)
        if encounter is None:
            return None

        chief_complaint = (getattr(encounter, "chief_complaint", "") or "").strip()
        encounter_notes = (getattr(encounter, "notes", "") or "").strip()
        if not chief_complaint and not encounter_notes:
            return None

        recorded_at = getattr(encounter, "created_at", None)
        if recorded_at is None:
            date_value = getattr(encounter, "encounter_date", None)
            if date_value is None:
                recorded_at = timezone.now()
            else:
                recorded_at = datetime.combine(date_value, datetime.min.time())
                if timezone.is_naive(recorded_at):
                    recorded_at = timezone.make_aware(recorded_at, timezone.get_current_timezone())

        lines: list[str] = []
        if chief_complaint:
            lines.append(f"Chief complaint: {chief_complaint}")
        if encounter_notes:
            lines.append(f"Encounter notes: {encounter_notes}")

        return ClinicalSummaryEntry(
            timestamp=recorded_at,
            source="Encounter Notes",
            author="Encounter record",
            content="\n".join(lines),
        )

    @staticmethod
    def _kardex_shift_entries(admission, *, limit: int) -> list[ClinicalSummaryEntry]:
        kardex = getattr(admission, "kardex", None)
        if kardex is None:
            return []

        shift_notes = list(
            kardex.shift_notes.select_related("nurse").order_by("-timestamp")[:limit]
        )
        shift_notes.reverse()

        entries: list[ClinicalSummaryEntry] = []
        for note in shift_notes:
            author = note.nurse.get_full_name().strip() or note.nurse.username or "Unknown nurse"
            entries.append(
                ClinicalSummaryEntry(
                    timestamp=note.timestamp,
                    source=f"Kardex Shift Note ({note.shift})",
                    author=author,
                    content=note.content,
                )
            )
        return entries

    @staticmethod
    def _kardex_handover_entries(admission, *, limit: int) -> list[ClinicalSummaryEntry]:
        kardex = getattr(admission, "kardex", None)
        if kardex is None:
            return []

        handovers = list(
            kardex.handover_notes.select_related("outgoing_nurse", "incoming_nurse").order_by(
                "-created_at"
            )[:limit]
        )
        handovers.reverse()

        entries: list[ClinicalSummaryEntry] = []
        for note in handovers:
            author = note.outgoing_nurse.get_full_name().strip() or note.outgoing_nurse.username
            incoming = note.incoming_nurse.get_full_name().strip() or note.incoming_nurse.username
            sections = [f"Pending tasks: {note.pending_tasks}"]
            if note.escalations:
                sections.append(f"Escalations: {note.escalations}")
            entries.append(
                ClinicalSummaryEntry(
                    timestamp=note.created_at,
                    source=f"Kardex Handover ({note.shift_ending})",
                    author=f"{author} -> {incoming}",
                    content="\n".join(sections),
                )
            )
        return entries


def compose_inpatient_clinical_summary_text(encounter) -> str:
    """Convenience helper for generating text summary from an IPD encounter."""
    entries = InpatientClinicalSummaryComposer.compose_for_encounter(encounter)
    return InpatientClinicalSummaryComposer.render_text(entries)
