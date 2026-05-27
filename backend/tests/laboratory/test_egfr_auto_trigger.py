"""
Tests for auto-trigger eGFR calculation when creatinine lab result is filed.

Tests the signal handler `auto_trigger_egfr_on_creatinine` in laboratory/signals.py.
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.ai.models import AIEGFRResult
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
from hmis.apps.patients.models import Patient

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def egfr_user(db):
    """Create a user for eGFR signal tests."""
    return User.objects.create_user(
        username="egfr_signal_user",
        email="egfrsignal@example.com",
        password="testpass123",
    )


@pytest.fixture
def egfr_patient(db, sample_organization):
    """Create an adult patient for eGFR tests (age ~45)."""
    county = County.objects.create(code=88, name="eGFR Test County")
    sub_county = SubCounty.objects.create(county=county, name="eGFR Test SubCounty")
    return Patient.objects.create(
        first_name="Renal",
        last_name="TestPatient",
        date_of_birth="1980-03-15",
        gender="M",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def egfr_female_patient(db, sample_organization):
    """Create a female adult patient for eGFR tests."""
    county = County.objects.get_or_create(code=88, defaults={"name": "eGFR Test County"})[0]
    sub_county = SubCounty.objects.get_or_create(county=county, name="eGFR Test SubCounty")[0]
    return Patient.objects.create(
        first_name="Female",
        last_name="Renal",
        date_of_birth="1975-06-20",
        gender="F",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def egfr_child_patient(db, sample_organization):
    """Create a pediatric patient (age < 18)."""
    county = County.objects.get_or_create(code=88, defaults={"name": "eGFR Test County"})[0]
    sub_county = SubCounty.objects.get_or_create(county=county, name="eGFR Test SubCounty")[0]
    return Patient.objects.create(
        first_name="Child",
        last_name="Patient",
        date_of_birth=str(date.today().replace(year=date.today().year - 10)),
        gender="M",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def egfr_encounter(egfr_patient, sample_facility):
    """Create an encounter with weight vitals."""
    return Encounter.objects.create(
        patient=egfr_patient,
        encounter_type="OPD",
        chief_complaint="Routine renal check",
        facility=sample_facility,
        weight=Decimal("75.0"),
    )


@pytest.fixture
def creatinine_test_loinc(db):
    """Create a creatinine test catalog entry with LOINC code."""
    return TestCatalog.objects.create(
        code="CREAT-S",
        name="Serum Creatinine",
        short_name="SCr",
        loinc_code="2160-0",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=200.00,
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def creatinine_test_name_only(db):
    """Create a creatinine test catalog without LOINC, matched by name."""
    return TestCatalog.objects.create(
        code="CREAT-NAME",
        name="Creatinine (serum)",
        short_name="Cr",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=200.00,
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def non_creatinine_test(db):
    """Create a non-creatinine test catalog entry."""
    return TestCatalog.objects.create(
        code="CBC",
        name="Complete Blood Count",
        short_name="CBC",
        loinc_code="58410-2",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
        cost=300.00,
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def lab_order_with_creatinine(
    egfr_patient,
    egfr_encounter,
    egfr_user,
    creatinine_test_loinc,
    sample_facility,
    sample_organization,
):
    """Create a lab order with a creatinine item."""
    order = LabOrder.objects.create(
        patient=egfr_patient,
        encounter=egfr_encounter,
        ordered_by=egfr_user,
        order_type="IN_HOUSE",
        status="IN_PROGRESS",
        priority="ROUTINE",
        facility=sample_facility,
        organization=sample_organization,
    )
    item = LabOrderItem.objects.create(
        lab_order=order,
        test=creatinine_test_loinc,
        unit_cost=creatinine_test_loinc.cost,
    )
    return order, item


# ============================================================================
# Tests for auto_trigger_egfr_on_creatinine
# ============================================================================


@pytest.mark.django_db
class TestEGFRAutoTriggerSignal:
    """Tests for auto eGFR calculation on creatinine result filing."""

    def test_egfr_calculated_on_creatinine_result_loinc(self, lab_order_with_creatinine, egfr_user):
        """eGFR should be calculated when a creatinine result with LOINC 2160-0 is filed."""
        order, item = lab_order_with_creatinine

        # File a creatinine result (1.2 mg/dL - normal male)
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("1.2"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        # Verify eGFR was auto-calculated
        egfr_results = AIEGFRResult.objects.filter(patient=order.patient)
        assert egfr_results.count() == 1

        result = egfr_results.first()
        assert result.ckd_stage in ("G1", "G2", "G3a", "G3b", "G4", "G5")
        assert result.egfr_ckd_epi is not None
        assert result.egfr_ckd_epi > 0
        assert result.dose_adjustment_band in ("normal", "mild", "moderate", "severe", "dialysis")
        assert result.encounter == order.encounter
        assert result.patient == order.patient
        assert result.service_mode == "auto"

    def test_egfr_calculated_with_umol_unit(
        self,
        egfr_patient,
        egfr_encounter,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should handle µmol/L creatinine values correctly."""
        order = LabOrder.objects.create(
            patient=egfr_patient,
            encounter=egfr_encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        # 106 µmol/L ≈ 1.2 mg/dL
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("106"),
            result_unit="µmol/L",
            entered_by=egfr_user,
        )

        egfr_results = AIEGFRResult.objects.filter(patient=egfr_patient)
        assert egfr_results.count() == 1
        # Should be similar to 1.2 mg/dL result
        result = egfr_results.first()
        assert result.egfr_ckd_epi is not None

    def test_egfr_calculated_with_name_match(
        self,
        egfr_patient,
        egfr_encounter,
        egfr_user,
        creatinine_test_name_only,
        sample_facility,
        sample_organization,
    ):
        """eGFR should be triggered when test is matched by name (no LOINC)."""
        order = LabOrder.objects.create(
            patient=egfr_patient,
            encounter=egfr_encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_name_only,
            unit_cost=creatinine_test_name_only.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("1.5"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        assert AIEGFRResult.objects.filter(patient=egfr_patient).count() == 1

    def test_egfr_not_triggered_for_non_creatinine(
        self,
        egfr_patient,
        egfr_encounter,
        egfr_user,
        non_creatinine_test,
        sample_facility,
        sample_organization,
    ):
        """eGFR should NOT be triggered for non-creatinine test results."""
        order = LabOrder.objects.create(
            patient=egfr_patient,
            encounter=egfr_encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=non_creatinine_test,
            unit_cost=non_creatinine_test.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.2"),
            result_unit="x10^9/L",
            entered_by=egfr_user,
        )

        assert AIEGFRResult.objects.filter(patient=egfr_patient).count() == 0

    def test_egfr_not_triggered_for_text_result(
        self,
        egfr_patient,
        egfr_encounter,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should NOT be triggered when creatinine result is text (not numeric)."""
        order = LabOrder.objects.create(
            patient=egfr_patient,
            encounter=egfr_encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        # Text result, no numeric value
        LabResult.objects.create(
            order_item=item,
            text_value="See comments",
            entered_by=egfr_user,
        )

        assert AIEGFRResult.objects.filter(patient=egfr_patient).count() == 0

    def test_egfr_not_triggered_for_child_patient(
        self,
        egfr_child_patient,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should NOT be calculated for patients under 18."""
        encounter = Encounter.objects.create(
            patient=egfr_child_patient,
            encounter_type="OPD",
            chief_complaint="Pediatric test",
            facility=sample_facility,
        )
        order = LabOrder.objects.create(
            patient=egfr_child_patient,
            encounter=encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("0.6"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        assert AIEGFRResult.objects.filter(patient=egfr_child_patient).count() == 0

    def test_egfr_not_triggered_for_order_without_patient(
        self,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should NOT be calculated if lab order has no linked patient."""
        order = LabOrder.objects.create(
            patient=None,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("1.0"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        assert AIEGFRResult.objects.count() == 0

    def test_egfr_calculated_for_female_patient(
        self,
        egfr_female_patient,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should use female-specific coefficients."""
        encounter = Encounter.objects.create(
            patient=egfr_female_patient,
            encounter_type="OPD",
            chief_complaint="Female renal test",
            facility=sample_facility,
            weight=Decimal("60.0"),
        )
        order = LabOrder.objects.create(
            patient=egfr_female_patient,
            encounter=encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("0.9"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        results = AIEGFRResult.objects.filter(patient=egfr_female_patient)
        assert results.count() == 1
        # Female with 0.9 mg/dL at age ~50 should have normal eGFR
        result = results.first()
        assert result.egfr_ckd_epi > 60  # Should be well above moderate impairment

    def test_egfr_includes_weight_from_encounter(self, lab_order_with_creatinine, egfr_user):
        """eGFR result should include Cockcroft-Gault when weight is available."""
        order, item = lab_order_with_creatinine

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("1.2"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        result = AIEGFRResult.objects.filter(patient=order.patient).first()
        assert result is not None
        # The result JSON should include cockcroft_gault since encounter has weight
        assert result.result_data.get("egfr_cockcroft_gault") is not None

    def test_egfr_without_encounter_weight(
        self,
        egfr_patient,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should still calculate CKD-EPI even without weight (no C-G)."""
        encounter = Encounter.objects.create(
            patient=egfr_patient,
            encounter_type="OPD",
            chief_complaint="No weight",
            facility=sample_facility,
            # No weight
        )
        order = LabOrder.objects.create(
            patient=egfr_patient,
            encounter=encounter,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("1.2"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        results = AIEGFRResult.objects.filter(patient=egfr_patient)
        assert results.count() == 1
        result = results.first()
        assert result.egfr_ckd_epi is not None
        # Cockcroft-Gault should be None without weight
        assert result.result_data.get("egfr_cockcroft_gault") is None

    def test_egfr_not_triggered_on_update(self, lab_order_with_creatinine, egfr_user):
        """eGFR should NOT be recalculated when an existing result is updated."""
        order, item = lab_order_with_creatinine

        lab_result = LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("1.2"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        # Should have one eGFR result
        assert AIEGFRResult.objects.filter(patient=order.patient).count() == 1

        # Update the result (e.g., verification)
        lab_result.verification_status = "VERIFIED"
        lab_result.save()

        # Should still have only one eGFR result (not duplicated)
        assert AIEGFRResult.objects.filter(patient=order.patient).count() == 1

    def test_egfr_standalone_order_no_encounter(
        self,
        egfr_patient,
        egfr_user,
        creatinine_test_loinc,
        sample_facility,
        sample_organization,
    ):
        """eGFR should work for standalone orders (no encounter) — no C-G but CKD-EPI works."""
        order = LabOrder.objects.create(
            patient=egfr_patient,
            encounter=None,
            ordered_by=egfr_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            facility=sample_facility,
            organization=sample_organization,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=creatinine_test_loinc,
            unit_cost=creatinine_test_loinc.cost,
        )

        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("2.5"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        results = AIEGFRResult.objects.filter(patient=egfr_patient)
        assert results.count() == 1
        result = results.first()
        assert result.encounter is None
        assert result.egfr_ckd_epi is not None
        # High creatinine → low eGFR
        assert result.egfr_ckd_epi < 60

    def test_egfr_high_creatinine_severe_ckd(self, lab_order_with_creatinine, egfr_user):
        """High creatinine should produce severe CKD staging."""
        order, item = lab_order_with_creatinine

        # Very high creatinine (5.0 mg/dL)
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("5.0"),
            result_unit="mg/dL",
            entered_by=egfr_user,
        )

        result = AIEGFRResult.objects.filter(patient=order.patient).first()
        assert result is not None
        assert result.ckd_stage in ("G4", "G5")
        assert result.dose_adjustment_band in ("severe", "dialysis")
