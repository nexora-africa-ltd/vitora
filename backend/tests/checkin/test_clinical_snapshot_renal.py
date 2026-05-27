"""
Tests for clinical snapshot renal_status field.

Verifies that the clinical snapshot includes renal function data
when a patient has eGFR results stored.
"""

from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.ai.models import AIEGFRResult
from hmis.apps.checkin.services import get_clinical_snapshot
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def renal_patient(db, sample_organization):
    county = County.objects.get_or_create(code=77, defaults={"name": "Renal Snap County"})[0]
    sub_county = SubCounty.objects.get_or_create(county=county, name="Renal Snap Sub")[0]
    return Patient.objects.create(
        first_name="Renal",
        last_name="Snapshot",
        date_of_birth="1960-05-10",
        gender="F",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def renal_encounter(renal_patient, sample_facility):
    return Encounter.objects.create(
        patient=renal_patient,
        encounter_type="OPD",
        chief_complaint="Follow-up renal",
        facility=sample_facility,
    )


@pytest.fixture
def egfr_result_g3b(renal_patient, renal_encounter, sample_facility, test_user):
    """Create a stored eGFR result with CKD G3b."""
    return AIEGFRResult.objects.create(
        patient=renal_patient,
        encounter=renal_encounter,
        facility=sample_facility,
        created_by=test_user,
        ckd_stage="G3b",
        egfr_ckd_epi=Decimal("38.5"),
        dose_adjustment_band="moderate",
        service_mode="auto",
        request_data={"creatinine": 1.8, "age": 64, "sex": "female"},
        result_data={
            "egfr_ckd_epi": 38.5,
            "ckd_stage": "G3b",
            "flags": ["avoid_nsaids"],
        },
    )


@pytest.fixture
def egfr_result_normal(renal_patient, renal_encounter, sample_facility, test_user):
    """Create a stored eGFR result with normal function."""
    return AIEGFRResult.objects.create(
        patient=renal_patient,
        encounter=renal_encounter,
        facility=sample_facility,
        created_by=test_user,
        ckd_stage="G1",
        egfr_ckd_epi=Decimal("105.0"),
        dose_adjustment_band="normal",
        service_mode="auto",
        request_data={"creatinine": 0.8, "age": 64, "sex": "female"},
        result_data={
            "egfr_ckd_epi": 105.0,
            "ckd_stage": "G1",
            "flags": [],
        },
    )


# ============================================================================
# Tests: Renal Status in Snapshot
# ============================================================================


@pytest.mark.django_db
class TestClinicalSnapshotRenalStatus:
    """Clinical snapshot should include renal_status when eGFR data exists."""

    def test_renal_status_present_when_egfr_exists(self, renal_patient, egfr_result_g3b):
        """Snapshot should include renal_status with CKD stage and eGFR value."""
        snapshot = get_clinical_snapshot(renal_patient)
        assert snapshot.renal_status is not None
        assert snapshot.renal_status["ckd_stage"] == "G3b"
        assert snapshot.renal_status["egfr"] == Decimal("38.5")
        assert snapshot.renal_status["dose_band"] == "moderate"
        assert snapshot.renal_status["measured_at"] is not None

    def test_renal_status_none_when_no_egfr(self, renal_patient):
        """Snapshot should have renal_status=None when no eGFR data exists."""
        snapshot = get_clinical_snapshot(renal_patient)
        assert snapshot.renal_status is None

    def test_renal_alert_added_for_impaired_egfr(self, renal_patient, egfr_result_g3b):
        """Snapshot alerts should include renal impairment warning for G3+."""
        snapshot = get_clinical_snapshot(renal_patient)
        renal_alerts = [a for a in snapshot.alerts if "Renal" in a or "eGFR" in a]
        assert len(renal_alerts) == 1
        assert "G3b" in renal_alerts[0]
        assert "38" in renal_alerts[0]

    def test_no_renal_alert_for_normal_egfr(self, renal_patient, egfr_result_normal):
        """No renal alert should be added for G1/G2 (normal)."""
        snapshot = get_clinical_snapshot(renal_patient)
        renal_alerts = [a for a in snapshot.alerts if "Renal" in a or "eGFR" in a]
        assert len(renal_alerts) == 0

    def test_renal_status_present_for_normal_egfr(self, renal_patient, egfr_result_normal):
        """renal_status should still be populated for G1 (to show status on badge)."""
        snapshot = get_clinical_snapshot(renal_patient)
        assert snapshot.renal_status is not None
        assert snapshot.renal_status["ckd_stage"] == "G1"
        assert snapshot.renal_status["egfr"] == Decimal("105.0")

    def test_uses_most_recent_egfr(
        self, renal_patient, renal_encounter, sample_facility, test_user
    ):
        """When multiple eGFR results exist, the most recent is used."""
        # Older result (normal)
        AIEGFRResult.objects.create(
            patient=renal_patient,
            encounter=renal_encounter,
            facility=sample_facility,
            created_by=test_user,
            ckd_stage="G1",
            egfr_ckd_epi=Decimal("95.0"),
            dose_adjustment_band="normal",
            service_mode="auto",
            request_data={"creatinine": 0.9, "age": 64, "sex": "female"},
            result_data={"egfr_ckd_epi": 95.0, "ckd_stage": "G1"},
        )
        # Newer result (impaired) — created_at is auto_now_add, so second is newer
        AIEGFRResult.objects.create(
            patient=renal_patient,
            encounter=renal_encounter,
            facility=sample_facility,
            created_by=test_user,
            ckd_stage="G4",
            egfr_ckd_epi=Decimal("22.0"),
            dose_adjustment_band="severe",
            service_mode="auto",
            request_data={"creatinine": 3.2, "age": 64, "sex": "female"},
            result_data={"egfr_ckd_epi": 22.0, "ckd_stage": "G4"},
        )
        snapshot = get_clinical_snapshot(renal_patient)
        assert snapshot.renal_status is not None
        assert snapshot.renal_status["ckd_stage"] == "G4"
        assert snapshot.renal_status["egfr"] == Decimal("22.0")


# ============================================================================
# Tests: API Endpoint Includes renal_status
# ============================================================================


@pytest.mark.django_db
class TestClinicalSnapshotAPIRenalStatus:
    """The clinical snapshot API should include renal_status in the response."""

    def test_snapshot_api_includes_renal_status_field(
        self, authenticated_client, renal_patient, renal_encounter, egfr_result_g3b
    ):
        """GET /api/encounters/{id}/clinical-snapshot/ should include renal_status."""
        response = authenticated_client.get(
            f"/api/encounters/{renal_encounter.id}/clinical-snapshot/"
        )
        assert response.status_code == 200
        assert "renal_status" in response.data
        assert response.data["renal_status"]["ckd_stage"] == "G3b"

    def test_snapshot_api_renal_status_null_when_no_data(
        self, authenticated_client, renal_patient, renal_encounter
    ):
        """renal_status should be null when no eGFR results exist."""
        response = authenticated_client.get(
            f"/api/encounters/{renal_encounter.id}/clinical-snapshot/"
        )
        assert response.status_code == 200
        assert response.data["renal_status"] is None
