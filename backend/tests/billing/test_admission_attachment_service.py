from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.billing.services.admission_attachment_service import AdmissionAttachmentService
from hmis.apps.inpatient.models import Bed, Transfer, Ward


@pytest.mark.django_db
def test_ward_timeline_tracks_mixed_general_hdu_icu_general_pathway(
    sample_admission,
    sample_facility,
    sample_organization,
    test_user,
):
    start = timezone.now() - timedelta(days=4)
    sample_admission.admission_date = start
    sample_admission.save(update_fields=["admission_date", "updated_at"])

    hdu_ward = Ward.objects.create(
        name="HDU Ward",
        code="HDU-BILL-01",
        ward_type="HDU",
        capacity=6,
        daily_rate=Decimal("1200.00"),
        facility=sample_facility,
        organization=sample_organization,
    )
    icu_ward = Ward.objects.create(
        name="ICU Ward",
        code="ICU-BILL-01",
        ward_type="ICU",
        capacity=4,
        daily_rate=Decimal("2000.00"),
        facility=sample_facility,
        organization=sample_organization,
    )
    med2_ward = Ward.objects.create(
        name="Medical Ward 2",
        code="MED-BILL-02",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
        facility=sample_facility,
        organization=sample_organization,
    )

    hdu_bed = Bed.objects.create(ward=hdu_ward, bed_number="HDU-B1", status="AVAILABLE")
    icu_bed = Bed.objects.create(ward=icu_ward, bed_number="ICU-B1", status="AVAILABLE")
    med2_bed = Bed.objects.create(ward=med2_ward, bed_number="MED2-B1", status="AVAILABLE")

    transfer_1_time = start + timedelta(days=1)
    Transfer.objects.create(
        admission=sample_admission,
        source_ward=sample_admission.ward,
        source_bed=sample_admission.bed,
        destination_ward=hdu_ward,
        destination_bed=hdu_bed,
        reason="STEP_UP",
        reason_details="Escalate to HDU",
        transferred_by=test_user,
        transfer_date=transfer_1_time,
        clinical_handover_notes="Escalate monitoring",
    )

    transfer_2_time = start + timedelta(days=2)
    Transfer.objects.create(
        admission=sample_admission,
        source_ward=sample_admission.ward,
        source_bed=sample_admission.bed,
        destination_ward=icu_ward,
        destination_bed=icu_bed,
        reason="STEP_UP",
        reason_details="Escalate to ICU",
        transferred_by=test_user,
        transfer_date=transfer_2_time,
        clinical_handover_notes="Ventilatory support",
    )

    transfer_3_time = start + timedelta(days=3)
    Transfer.objects.create(
        admission=sample_admission,
        source_ward=sample_admission.ward,
        source_bed=sample_admission.bed,
        destination_ward=med2_ward,
        destination_bed=med2_bed,
        reason="STEP_DOWN",
        reason_details="De-escalate to medical ward",
        transferred_by=test_user,
        transfer_date=transfer_3_time,
        clinical_handover_notes="Stable for ward care",
    )

    timeline = AdmissionAttachmentService._ward_timeline(
        sample_admission,
        start=start,
        end=start + timedelta(days=4),
    )

    assert [entry["ward_type"] for entry in timeline] == ["MEDICAL", "HDU", "ICU", "MEDICAL"]
    assert [entry["is_critical"] for entry in timeline] == [False, True, True, False]


@pytest.mark.django_db
def test_ward_timeline_treats_nbu_as_critical(
    sample_admission,
    sample_facility,
    sample_organization,
    test_user,
):
    start = timezone.now() - timedelta(days=1)
    sample_admission.admission_date = start
    sample_admission.save(update_fields=["admission_date", "updated_at"])

    nbu_ward = Ward.objects.create(
        name="NBU Ward",
        code="NBU-BILL-01",
        ward_type="NBU",
        capacity=10,
        daily_rate=Decimal("1100.00"),
        facility=sample_facility,
        organization=sample_organization,
    )
    nbu_bed = Bed.objects.create(ward=nbu_ward, bed_number="NBU-B1", status="AVAILABLE")

    Transfer.objects.create(
        admission=sample_admission,
        source_ward=sample_admission.ward,
        source_bed=sample_admission.bed,
        destination_ward=nbu_ward,
        destination_bed=nbu_bed,
        reason="SPECIALTY",
        reason_details="Move to newborn unit",
        transferred_by=test_user,
        transfer_date=start + timedelta(hours=8),
        clinical_handover_notes="Newborn-specific observation",
    )

    timeline = AdmissionAttachmentService._ward_timeline(
        sample_admission,
        start=start,
        end=start + timedelta(days=1),
    )

    assert any(entry["ward_type"] == "NBU" and entry["is_critical"] for entry in timeline)
