"""Tests for syncing verified lab screening results to blood-unit screening fields.

Run with: poetry run pytest tests/blood_bank/test_blood_unit_screening_sync.py -v
Inputs: pytest fixtures (sample_facility, sample_organization, sample_patient, sample_encounter, test_user).
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.blood_bank.models import BloodDonor, BloodGroup, BloodUnit, UnitStatus
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog


@pytest.fixture
def screening_blood_unit(db, sample_facility):
    donor = BloodDonor.objects.create(
        first_name="Screen",
        last_name="Donor",
        date_of_birth=date(1990, 1, 1),
        gender="M",
        blood_group=BloodGroup.O_POS,
        facility=sample_facility,
        organization=sample_facility.organization,
    )
    return BloodUnit.objects.create(
        donor=donor,
        blood_group=BloodGroup.O_POS,
        status=UnitStatus.TESTING,
        expiry_date=timezone.now() + timedelta(days=35),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def screening_lab_order(
    db,
    sample_patient,
    sample_encounter,
    test_user,
    sample_facility,
    sample_organization,
    screening_blood_unit,
):
    return LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        blood_bank_unit=screening_blood_unit,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="ORDERED",
        priority="ROUTINE",
        facility=sample_facility,
        organization=sample_organization,
    )


def _create_screening_result(
    *,
    order,
    test_user,
    sample_facility,
    sample_organization,
    code: str,
    name: str,
    text_value: str,
) -> LabResult:
    test_catalog = TestCatalog.objects.create(
        code=code,
        name=name,
        short_name=code,
        category="SEROLOGY",
        specimen_type="BLOOD",
        result_type="TEXT",
        cost=150.00,
        available_in_house=True,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )
    order_item = LabOrderItem.objects.create(
        lab_order=order,
        test=test_catalog,
        unit_cost=test_catalog.cost,
    )
    return LabResult.objects.create(
        order_item=order_item,
        text_value=text_value,
        entered_by=test_user,
    )


class TestBloodUnitScreeningSync:
    """Sync verified laboratory screening outcomes to blood-unit checkboxes and status."""

    def test_verified_hiv_negative_marks_hiv_screened(
        self,
        screening_lab_order,
        screening_blood_unit,
        test_user,
        sample_facility,
        sample_organization,
    ):
        result = _create_screening_result(
            order=screening_lab_order,
            test_user=test_user,
            sample_facility=sample_facility,
            sample_organization=sample_organization,
            code="BB-HIV",
            name="Blood Donor HIV Screening",
            text_value="Non-Reactive",
        )

        result.verify(test_user)

        screening_blood_unit.refresh_from_db()
        assert screening_blood_unit.hiv_screened is True
        assert screening_blood_unit.hbv_screened is False
        assert screening_blood_unit.all_screens_negative is False
        assert screening_blood_unit.status == UnitStatus.TESTING

    def test_verified_reactive_result_quarantines_unit(
        self,
        screening_lab_order,
        screening_blood_unit,
        test_user,
        sample_facility,
        sample_organization,
    ):
        result = _create_screening_result(
            order=screening_lab_order,
            test_user=test_user,
            sample_facility=sample_facility,
            sample_organization=sample_organization,
            code="BB-HBV",
            name="Blood Donor HBV Screening",
            text_value="Reactive",
        )

        result.verify(test_user)

        screening_blood_unit.refresh_from_db()
        assert screening_blood_unit.hbv_screened is True
        assert screening_blood_unit.status == UnitStatus.QUARANTINED
        assert "HBV" in screening_blood_unit.notes
        assert screening_blood_unit.all_screens_negative is False

    def test_all_required_negative_screens_mark_unit_available(
        self,
        screening_lab_order,
        screening_blood_unit,
        test_user,
        sample_facility,
        sample_organization,
    ):
        definitions = [
            ("BB-HIV", "Blood Donor HIV Screening"),
            ("BB-HBV", "Blood Donor HBV Screening"),
            ("BB-HCV", "Blood Donor HCV Screening"),
            ("BB-SYPH", "Blood Donor Syphilis Screening"),
            ("BB-MAL", "Blood Donor Malaria Screening"),
        ]

        for code, name in definitions:
            result = _create_screening_result(
                order=screening_lab_order,
                test_user=test_user,
                sample_facility=sample_facility,
                sample_organization=sample_organization,
                code=code,
                name=name,
                text_value="Negative",
            )
            result.verify(test_user)

        screening_blood_unit.refresh_from_db()
        assert screening_blood_unit.hiv_screened is True
        assert screening_blood_unit.hbv_screened is True
        assert screening_blood_unit.hcv_screened is True
        assert screening_blood_unit.syphilis_screened is True
        assert screening_blood_unit.malaria_screened is True
        assert screening_blood_unit.all_screens_negative is True
        assert screening_blood_unit.status == UnitStatus.AVAILABLE

    def test_amendment_reverify_is_idempotent_and_updates_state(
        self,
        screening_lab_order,
        screening_blood_unit,
        test_user,
        sample_facility,
        sample_organization,
    ):
        result = _create_screening_result(
            order=screening_lab_order,
            test_user=test_user,
            sample_facility=sample_facility,
            sample_organization=sample_organization,
            code="BB-HIV",
            name="Blood Donor HIV Screening",
            text_value="Non-Reactive",
        )
        result.verify(test_user)

        screening_blood_unit.refresh_from_db()
        assert screening_blood_unit.status == UnitStatus.TESTING
        assert screening_blood_unit.hiv_screened is True

        result.text_value = "Reactive"
        result.save(update_fields=["text_value", "updated_at"])

        screening_blood_unit.refresh_from_db()
        assert screening_blood_unit.status == UnitStatus.QUARANTINED
        first_notes = screening_blood_unit.notes

        # Re-saving same reactive verified result should not duplicate quarantine notes.
        result.save(update_fields=["updated_at"])
        screening_blood_unit.refresh_from_db()
        assert screening_blood_unit.status == UnitStatus.QUARANTINED
        assert screening_blood_unit.notes == first_notes
