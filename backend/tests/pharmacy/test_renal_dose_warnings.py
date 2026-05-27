"""
Tests for pharmacy renal dose warnings during prescription creation.

Tests that PrescriptionCreateSerializer raises renal warnings when
the patient has impaired renal function (based on stored AIEGFRResult).
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.ai.models import AIEGFRResult
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient
from hmis.apps.pharmacy.models import Drug

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def renal_patient(db, sample_organization):
    """Patient with renal impairment (has stored eGFR result)."""
    county = County.objects.create(code=77, name="Renal Test County")
    sub_county = SubCounty.objects.create(county=county, name="Renal Test SubCounty")
    return Patient.objects.create(
        first_name="Renal",
        last_name="Patient",
        date_of_birth="1965-01-15",
        gender="M",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def renal_encounter(renal_patient, sample_facility):
    """Encounter for the renal patient."""
    return Encounter.objects.create(
        patient=renal_patient,
        encounter_type="OPD",
        chief_complaint="Renal dose test",
        facility=sample_facility,
    )


@pytest.fixture
def renal_drug(db):
    """Drug for renal warning tests."""
    return Drug.objects.create(
        code="GENT80",
        generic_name="Gentamicin",
        strength="80mg",
        form="INJECTION",
        category="ANTIBIOTIC",
        schedule="POM",
        unit="vial",
        keml_code="03.05",
        is_essential=True,
        requires_prescription=True,
        default_reorder_level=20,
        default_reorder_quantity=50,
        reference_price=Decimal("150.00"),
    )


@pytest.fixture
def moderate_ckd_result(renal_patient):
    """Store a moderate CKD eGFR result for the patient."""
    return AIEGFRResult.objects.create(
        patient=renal_patient,
        ckd_stage="G3b",
        egfr_ckd_epi=35.0,
        dose_adjustment_band="moderate",
        request_data={"creatinine": 2.0, "age": 60, "sex": "male"},
        result_data={
            "egfr_ckd_epi": 35.0,
            "ckd_stage": "G3b",
            "dose_adjustment_band": "moderate",
            "flags": ["avoid_nsaids", "adjust_metformin_dose"],
        },
        service_mode="auto",
    )


@pytest.fixture
def severe_ckd_result(renal_patient):
    """Store a severe CKD eGFR result for the patient."""
    return AIEGFRResult.objects.create(
        patient=renal_patient,
        ckd_stage="G4",
        egfr_ckd_epi=20.0,
        dose_adjustment_band="severe",
        request_data={"creatinine": 4.0, "age": 60, "sex": "male"},
        result_data={
            "egfr_ckd_epi": 20.0,
            "ckd_stage": "G4",
            "dose_adjustment_band": "severe",
            "flags": ["refer_nephrology", "avoid_nsaids", "check_potassium"],
        },
        service_mode="auto",
    )


@pytest.fixture
def normal_ckd_result(renal_patient):
    """Store a normal eGFR result for the patient."""
    return AIEGFRResult.objects.create(
        patient=renal_patient,
        ckd_stage="G1",
        egfr_ckd_epi=95.0,
        dose_adjustment_band="normal",
        request_data={"creatinine": 0.8, "age": 60, "sex": "male"},
        result_data={
            "egfr_ckd_epi": 95.0,
            "ckd_stage": "G1",
            "dose_adjustment_band": "normal",
            "flags": [],
        },
        service_mode="auto",
    )


# ============================================================================
# Tests
# ============================================================================


@pytest.mark.django_db
class TestPharmacyRenalWarnings:
    """Tests for renal dose warnings in prescription creation."""

    def test_renal_warning_raised_for_moderate_ckd(
        self,
        authenticated_client,
        renal_patient,
        renal_encounter,
        renal_drug,
        moderate_ckd_result,
    ):
        """Should raise renal warnings when patient has moderate CKD."""
        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": renal_patient.id,
                "encounter": renal_encounter.id,
                "items": [
                    {
                        "drug": renal_drug.id,
                        "dosage": "80mg",
                        "frequency": "TID",
                        "duration": "5 days",
                        "quantity_prescribed": 15,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "renal_warnings" in response.data
        warnings = response.data["renal_warnings"]
        assert len(warnings) == 1
        assert warnings[0]["ckd_stage"] == "G3b"
        assert warnings[0]["dose_adjustment_band"] == "moderate"
        assert float(warnings[0]["egfr_value"]) == 35.0

    def test_renal_warning_raised_for_severe_ckd(
        self,
        authenticated_client,
        renal_patient,
        renal_encounter,
        renal_drug,
        severe_ckd_result,
    ):
        """Should raise renal warnings when patient has severe CKD."""
        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": renal_patient.id,
                "encounter": renal_encounter.id,
                "items": [
                    {
                        "drug": renal_drug.id,
                        "dosage": "80mg",
                        "frequency": "BID",
                        "duration": "3 days",
                        "quantity_prescribed": 6,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "renal_warnings" in response.data
        warnings = response.data["renal_warnings"]
        assert warnings[0]["ckd_stage"] == "G4"
        assert warnings[0]["dose_adjustment_band"] == "severe"

    def test_no_renal_warning_for_normal_egfr(
        self,
        authenticated_client,
        renal_patient,
        renal_encounter,
        renal_drug,
        normal_ckd_result,
    ):
        """Should NOT raise renal warnings when patient has normal eGFR."""
        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": renal_patient.id,
                "encounter": renal_encounter.id,
                "items": [
                    {
                        "drug": renal_drug.id,
                        "dosage": "80mg",
                        "frequency": "BID",
                        "duration": "5 days",
                        "quantity_prescribed": 10,
                    }
                ],
            },
            format="json",
        )

        # Should succeed (no renal warnings for normal eGFR)
        assert response.status_code == status.HTTP_201_CREATED

    def test_no_renal_warning_when_no_egfr_result(
        self,
        authenticated_client,
        renal_patient,
        renal_encounter,
        renal_drug,
    ):
        """Should NOT raise renal warnings when patient has no stored eGFR."""
        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": renal_patient.id,
                "encounter": renal_encounter.id,
                "items": [
                    {
                        "drug": renal_drug.id,
                        "dosage": "80mg",
                        "frequency": "BID",
                        "duration": "5 days",
                        "quantity_prescribed": 10,
                    }
                ],
            },
            format="json",
        )

        # Should succeed (no eGFR data = no warning)
        assert response.status_code == status.HTTP_201_CREATED

    def test_renal_warning_acknowledged_allows_prescription(
        self,
        authenticated_client,
        renal_patient,
        renal_encounter,
        renal_drug,
        moderate_ckd_result,
    ):
        """Should allow prescription when renal warnings are acknowledged."""
        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": renal_patient.id,
                "encounter": renal_encounter.id,
                "acknowledge_renal_warnings": True,
                "items": [
                    {
                        "drug": renal_drug.id,
                        "dosage": "80mg",
                        "frequency": "TID",
                        "duration": "5 days",
                        "quantity_prescribed": 15,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_renal_warning_uses_latest_egfr(
        self,
        authenticated_client,
        renal_patient,
        renal_encounter,
        renal_drug,
    ):
        """Should use the most recent eGFR result for renal warnings."""
        # Create old normal result
        AIEGFRResult.objects.create(
            patient=renal_patient,
            ckd_stage="G1",
            egfr_ckd_epi=95.0,
            dose_adjustment_band="normal",
            request_data={"creatinine": 0.8, "age": 60, "sex": "male"},
            result_data={"egfr_ckd_epi": 95.0, "ckd_stage": "G1"},
            service_mode="auto",
        )
        # Create newer impaired result
        AIEGFRResult.objects.create(
            patient=renal_patient,
            ckd_stage="G3a",
            egfr_ckd_epi=50.0,
            dose_adjustment_band="mild",
            request_data={"creatinine": 1.5, "age": 60, "sex": "male"},
            result_data={"egfr_ckd_epi": 50.0, "ckd_stage": "G3a"},
            service_mode="auto",
        )

        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": renal_patient.id,
                "encounter": renal_encounter.id,
                "items": [
                    {
                        "drug": renal_drug.id,
                        "dosage": "80mg",
                        "frequency": "BID",
                        "duration": "5 days",
                        "quantity_prescribed": 10,
                    }
                ],
            },
            format="json",
        )

        # Should warn based on latest (mild impairment)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "renal_warnings" in response.data
        warnings = response.data["renal_warnings"]
        assert warnings[0]["ckd_stage"] == "G3a"
        assert warnings[0]["dose_adjustment_band"] == "mild"
