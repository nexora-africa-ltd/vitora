"""
Tests for CDS alert generation from eGFR auto-calculation.

Tests the `_generate_egfr_cds_alerts` function in laboratory/signals.py.
Verifies that CDS alerts are created for CKD G3a+ and nephrology referral
suggestions are generated for G4/G5.
"""

from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.cds.models import CDSAlert, CDSAlertStatus, CDSRule
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.laboratory.signals import _generate_egfr_cds_alerts
from hmis.apps.patients.models import Patient

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def cds_user(db):
    return User.objects.create_user(
        username="cds_egfr_user", email="cdsegfr@example.com", password="testpass123"
    )


@pytest.fixture
def cds_patient(db, sample_organization):
    county = County.objects.get_or_create(code=99, defaults={"name": "CDS Test County"})[0]
    sub_county = SubCounty.objects.get_or_create(county=county, name="CDS Test Sub")[0]
    return Patient.objects.create(
        first_name="CDS",
        last_name="TestPatient",
        date_of_birth="1975-01-10",
        gender="M",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def cds_encounter(cds_patient, sample_facility):
    return Encounter.objects.create(
        patient=cds_patient,
        encounter_type="OPD",
        chief_complaint="Renal function check",
        facility=sample_facility,
        weight=Decimal("70.0"),
    )


# ============================================================================
# Tests: No Alert for Normal eGFR
# ============================================================================


@pytest.mark.django_db
class TestEGFRCDSNoAlert:
    """No CDS alerts should be generated for normal kidney function."""

    def test_no_alert_for_g1(self, cds_patient, cds_encounter, sample_facility):
        """G1 (eGFR >= 90) should NOT trigger a CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G1",
                "egfr_ckd_epi": 105.0,
                "dose_adjustment_band": "normal",
                "flags": [],
            },
        )
        assert CDSAlert.objects.filter(patient=cds_patient).count() == 0

    def test_no_alert_for_g2(self, cds_patient, cds_encounter, sample_facility):
        """G2 (eGFR 60-89) should NOT trigger a CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G2",
                "egfr_ckd_epi": 72.0,
                "dose_adjustment_band": "normal",
                "flags": [],
            },
        )
        assert CDSAlert.objects.filter(patient=cds_patient).count() == 0


# ============================================================================
# Tests: Alert Generation for Impaired eGFR
# ============================================================================


@pytest.mark.django_db
class TestEGFRCDSAlertGeneration:
    """CDS alerts should be generated for CKD G3a and worse."""

    def test_g3a_generates_medium_priority_alert(self, cds_patient, cds_encounter, sample_facility):
        """G3a (eGFR 45-59) should generate a MEDIUM priority CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G3a",
                "egfr_ckd_epi": 52.0,
                "dose_adjustment_band": "mild",
                "flags": ["avoid_nsaids", "check_urine_acr"],
            },
        )
        alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-EGFR-001")
        assert alert.priority == "MEDIUM"
        assert alert.status == CDSAlertStatus.PENDING
        assert "G3a" in alert.message
        assert "52" in alert.message

    def test_g3b_generates_high_priority_alert(self, cds_patient, cds_encounter, sample_facility):
        """G3b (eGFR 30-44) should generate a HIGH priority CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G3b",
                "egfr_ckd_epi": 38.0,
                "dose_adjustment_band": "moderate",
                "flags": ["avoid_nsaids", "avoid_nephrotoxins", "check_potassium"],
            },
        )
        alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-EGFR-001")
        assert alert.priority == "HIGH"
        assert "G3b" in alert.message

    def test_g4_generates_critical_priority_alert(
        self, cds_patient, cds_encounter, sample_facility
    ):
        """G4 (eGFR 15-29) should generate a CRITICAL priority CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G4",
                "egfr_ckd_epi": 22.0,
                "dose_adjustment_band": "severe",
                "flags": ["refer_nephrology", "avoid_nsaids", "avoid_nephrotoxins"],
            },
        )
        alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-EGFR-001")
        assert alert.priority == "CRITICAL"
        assert "G4" in alert.message

    def test_g5_generates_critical_priority_alert(
        self, cds_patient, cds_encounter, sample_facility
    ):
        """G5 (eGFR < 15) should generate a CRITICAL priority CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G5",
                "egfr_ckd_epi": 8.0,
                "dose_adjustment_band": "dialysis",
                "flags": ["refer_nephrology", "discuss_rrt_options"],
            },
        )
        alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-EGFR-001")
        assert alert.priority == "CRITICAL"

    def test_alert_includes_action_items_from_flags(
        self, cds_patient, cds_encounter, sample_facility
    ):
        """Alert suggestion should include human-readable action items from flags."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G3b",
                "egfr_ckd_epi": 35.0,
                "dose_adjustment_band": "moderate",
                "flags": ["avoid_nsaids", "check_potassium", "monitor_egfr_quarterly"],
            },
        )
        alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-EGFR-001")
        assert "Avoid NSAIDs" in alert.suggestion
        assert "Check serum potassium" in alert.suggestion
        assert "Monitor eGFR quarterly" in alert.suggestion

    def test_alert_details_contain_metadata(self, cds_patient, cds_encounter, sample_facility):
        """Alert details should contain structured metadata for downstream use."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G3a",
                "egfr_ckd_epi": 55.0,
                "dose_adjustment_band": "mild",
                "flags": ["avoid_nsaids"],
            },
        )
        alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-EGFR-001")
        assert alert.details["ckd_stage"] == "G3a"
        assert alert.details["egfr_ckd_epi"] == 55.0
        assert alert.details["source"] == "auto_egfr"
        assert alert.details["dose_adjustment_band"] == "mild"


# ============================================================================
# Tests: Nephrology Referral for G4/G5
# ============================================================================


@pytest.mark.django_db
class TestEGFRNephrologyReferral:
    """G4/G5 should also generate a nephrology referral suggestion."""

    def test_g4_generates_nephrology_referral(self, cds_patient, cds_encounter, sample_facility):
        """G4 should trigger a nephrology referral CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G4",
                "egfr_ckd_epi": 20.0,
                "dose_adjustment_band": "severe",
                "flags": ["refer_nephrology"],
            },
        )
        referral_alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-REFER-001")
        assert referral_alert.priority == "CRITICAL"
        assert "nephrology" in referral_alert.message.lower()

    def test_g5_generates_nephrology_referral(self, cds_patient, cds_encounter, sample_facility):
        """G5 should trigger a nephrology referral CDS alert."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G5",
                "egfr_ckd_epi": 10.0,
                "dose_adjustment_band": "dialysis",
                "flags": ["refer_nephrology", "discuss_rrt_options"],
            },
        )
        referral_alert = CDSAlert.objects.get(patient=cds_patient, rule__code="RENAL-REFER-001")
        assert "renal replacement therapy" in referral_alert.suggestion.lower()
        assert referral_alert.details["suggested_target_service"] == "DIALYSIS"

    def test_g3a_does_not_generate_nephrology_referral(
        self, cds_patient, cds_encounter, sample_facility
    ):
        """G3a should NOT generate a nephrology referral — only G4/G5."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G3a",
                "egfr_ckd_epi": 55.0,
                "dose_adjustment_band": "mild",
                "flags": [],
            },
        )
        assert not CDSAlert.objects.filter(
            patient=cds_patient, rule__code="RENAL-REFER-001"
        ).exists()

    def test_g4_creates_both_alert_and_referral(self, cds_patient, cds_encounter, sample_facility):
        """G4 should create BOTH the renal alert and the referral suggestion."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G4",
                "egfr_ckd_epi": 18.0,
                "dose_adjustment_band": "severe",
                "flags": ["refer_nephrology"],
            },
        )
        alerts = CDSAlert.objects.filter(patient=cds_patient)
        assert alerts.count() == 2
        codes = set(alerts.values_list("rule__code", flat=True))
        assert codes == {"RENAL-EGFR-001", "RENAL-REFER-001"}


# ============================================================================
# Tests: Deduplication
# ============================================================================


@pytest.mark.django_db
class TestEGFRCDSDeduplication:
    """Duplicate alerts should not be created for the same encounter."""

    def test_duplicate_alert_not_created(self, cds_patient, cds_encounter, sample_facility):
        """Calling _generate_egfr_cds_alerts twice should not duplicate alerts."""
        result_data = {
            "ckd_stage": "G3b",
            "egfr_ckd_epi": 40.0,
            "dose_adjustment_band": "moderate",
            "flags": ["avoid_nsaids"],
        }
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data=result_data,
        )
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data=result_data,
        )
        assert (
            CDSAlert.objects.filter(patient=cds_patient, rule__code="RENAL-EGFR-001").count() == 1
        )

    def test_g4_duplicate_referral_not_created(self, cds_patient, cds_encounter, sample_facility):
        """Calling twice for G4 should not duplicate the referral alert."""
        result_data = {
            "ckd_stage": "G4",
            "egfr_ckd_epi": 22.0,
            "dose_adjustment_band": "severe",
            "flags": ["refer_nephrology"],
        }
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data=result_data,
        )
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data=result_data,
        )
        assert (
            CDSAlert.objects.filter(patient=cds_patient, rule__code="RENAL-REFER-001").count() == 1
        )

    def test_different_encounters_get_separate_alerts(self, cds_patient, sample_facility):
        """Different encounters should get their own alerts."""
        enc1 = Encounter.objects.create(
            patient=cds_patient,
            encounter_type="OPD",
            chief_complaint="Visit 1",
            facility=sample_facility,
        )
        enc2 = Encounter.objects.create(
            patient=cds_patient,
            encounter_type="OPD",
            chief_complaint="Visit 2",
            facility=sample_facility,
        )
        result_data = {
            "ckd_stage": "G3b",
            "egfr_ckd_epi": 38.0,
            "dose_adjustment_band": "moderate",
            "flags": [],
        }
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=enc1,
            facility=sample_facility,
            result_data=result_data,
        )
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=enc2,
            facility=sample_facility,
            result_data=result_data,
        )
        assert (
            CDSAlert.objects.filter(patient=cds_patient, rule__code="RENAL-EGFR-001").count() == 2
        )


# ============================================================================
# Tests: CDS Rule Creation
# ============================================================================


@pytest.mark.django_db
class TestEGFRCDSRuleCreation:
    """CDS rules should be created with correct metadata."""

    def test_renal_egfr_rule_created(self, cds_patient, cds_encounter, sample_facility):
        """RENAL-EGFR-001 rule should be auto-created."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G3a",
                "egfr_ckd_epi": 50.0,
                "dose_adjustment_band": "mild",
                "flags": [],
            },
        )
        rule = CDSRule.objects.get(code="RENAL-EGFR-001")
        assert rule.category == "CRITICAL_LAB"
        assert rule.status == "ACTIVE"
        assert rule.evidence_level == "A"

    def test_renal_referral_rule_created(self, cds_patient, cds_encounter, sample_facility):
        """RENAL-REFER-001 rule should be auto-created for G4/G5."""
        _generate_egfr_cds_alerts(
            patient=cds_patient,
            encounter=cds_encounter,
            facility=sample_facility,
            result_data={
                "ckd_stage": "G4",
                "egfr_ckd_epi": 20.0,
                "dose_adjustment_band": "severe",
                "flags": [],
            },
        )
        rule = CDSRule.objects.get(code="RENAL-REFER-001")
        assert rule.category == "GUIDELINE"
        assert rule.action_type == "SUGGEST"
