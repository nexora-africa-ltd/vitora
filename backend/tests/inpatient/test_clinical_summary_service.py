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


@pytest.mark.django_db
def test_compose_inpatient_summary_includes_transfer_and_review_request_events(
    sample_admission, test_user, another_user, sample_facility, sample_organization
):
    from decimal import Decimal

    from hmis.apps.inpatient.models import Bed, ReviewRequest, Transfer, Ward
    from hmis.apps.inpatient.services.clinical_summary import InpatientClinicalSummaryComposer

    destination_ward = Ward.objects.create(
        name="HDU",
        code="HDU-01",
        ward_type="HDU",
        capacity=8,
        daily_rate=Decimal("1400.00"),
        facility=sample_facility,
        organization=sample_organization,
    )
    destination_bed = Bed.objects.create(
        ward=destination_ward,
        bed_number="HDU-01",
        bed_type="HDU",
        status="AVAILABLE",
    )

    transfer = Transfer.objects.create(
        admission=sample_admission,
        source_ward=sample_admission.ward,
        source_bed=sample_admission.bed,
        destination_ward=destination_ward,
        destination_bed=destination_bed,
        reason="STEP_UP",
        reason_details="Escalated monitoring due to worsening respiratory distress.",
        transferred_by=test_user,
        transfer_date=timezone.now(),
        clinical_handover_notes="Escalated monitoring and oxygen support.",
    )

    review_request = ReviewRequest.objects.create(
        admission=sample_admission,
        review_type="CONSULTANT_REVIEW",
        urgency="URGENT",
        reason="Assess response to HDU escalation and optimize treatment plan.",
        requested_by=test_user,
        assigned_to=another_user,
    )
    review_request.acknowledge(another_user)
    review_request.complete()

    entries = InpatientClinicalSummaryComposer.compose_for_admission(sample_admission)
    sources = [entry.source for entry in entries]
    assert "Ward Transfer" in sources
    assert "Review Request" in sources
    assert "Review Request Acknowledged" in sources
    assert "Review Request Completed" in sources

    transfer_entry = next(entry for entry in entries if entry.source == "Ward Transfer")
    assert "Step Up Care" in transfer_entry.content
    assert transfer.source_ward.name in transfer_entry.content
    assert transfer.destination_ward.name in transfer_entry.content
