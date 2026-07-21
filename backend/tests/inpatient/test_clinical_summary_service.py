from datetime import date, datetime, time

import pytest  # type: ignore
from django.utils import timezone


@pytest.mark.django_db
def test_compose_inpatient_summary_in_chronological_order(
    sample_admission, test_user, another_user
):
    from hmis.apps.inpatient.models import (
        KardexHandoverNote,
        KardexShiftNote,
        NursingKardex,
        WardRound,
    )
    from hmis.apps.inpatient.services.clinical_summary import InpatientClinicalSummaryComposer

    kardex, _ = NursingKardex.objects.get_or_create(admission=sample_admission)

    WardRound.objects.create(
        admission=sample_admission,
        round_date=date.today(),
        round_time=time(hour=9, minute=0),
        conducted_by=test_user,
        subjective="Less shortness of breath today.",
        objective="Afebrile, oxygen saturation 96% on room air.",
        assessment="Improving community-acquired pneumonia.",
        plan="Continue IV antibiotics and monitor.",
        condition_status="IMPROVING",
    )

    shift_note = KardexShiftNote.objects.create(
        kardex=kardex,
        shift="DAY",
        nurse=test_user,
        content="Patient tolerated morning medications and chest physiotherapy.",
    )
    KardexShiftNote.objects.filter(pk=shift_note.pk).update(
        timestamp=timezone.make_aware(datetime.combine(date.today(), time(hour=10, minute=0)))
    )

    handover_note = KardexHandoverNote.objects.create(
        kardex=kardex,
        outgoing_nurse=test_user,
        incoming_nurse=another_user,
        shift_ending="DAY",
        pending_tasks="Recheck temperature at 14:00 and review antibiotic chart.",
        escalations="Escalate to MO if fever exceeds 38.0C.",
    )
    KardexHandoverNote.objects.filter(pk=handover_note.pk).update(
        created_at=timezone.make_aware(datetime.combine(date.today(), time(hour=11, minute=0)))
    )

    entries = InpatientClinicalSummaryComposer.compose_for_admission(sample_admission)
    assert len(entries) >= 3
    assert entries == sorted(entries, key=lambda item: item.timestamp)

    rendered = InpatientClinicalSummaryComposer.render_text(entries)
    assert "INPATIENT CLINICAL COURSE (Chronological)" in rendered
    assert "Ward Round" in rendered
    assert "Kardex Shift Note" in rendered
    assert "Kardex Handover" in rendered

    ward_round_pos = rendered.index("Ward Round")
    shift_note_pos = rendered.index("Kardex Shift Note")
    handover_pos = rendered.index("Kardex Handover")
    assert ward_round_pos < shift_note_pos < handover_pos


@pytest.mark.django_db
def test_compose_inpatient_summary_includes_encounter_notes_when_no_other_entries(sample_admission):
    from hmis.apps.inpatient.services.clinical_summary import InpatientClinicalSummaryComposer

    entries = InpatientClinicalSummaryComposer.compose_for_admission(sample_admission)
    assert len(entries) >= 1
    assert entries[0].source == "Encounter Notes"
    assert "Chief complaint" in entries[0].content
