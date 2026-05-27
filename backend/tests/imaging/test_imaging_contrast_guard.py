"""
Tests for imaging contrast eGFR guard.

Verifies that when a contrast-requiring imaging procedure is ordered,
the response includes warnings if the patient has impaired eGFR.
"""

from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.ai.models import AIEGFRResult
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.imaging.models import ImagingOrder, ImagingProcedure
from hmis.apps.patients.models import Patient

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def contrast_patient(db, sample_organization):
    county = County.objects.get_or_create(code=66, defaults={"name": "Contrast County"})[0]
    sub_county = SubCounty.objects.get_or_create(county=county, name="Contrast Sub")[0]
    return Patient.objects.create(
        first_name="Contrast",
        last_name="Patient",
        date_of_birth="1965-03-20",
        gender="M",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def contrast_encounter(contrast_patient, sample_facility):
    return Encounter.objects.create(
        patient=contrast_patient,
        encounter_type="OPD",
        chief_complaint="CT scan needed",
        facility=sample_facility,
    )


@pytest.fixture
def contrast_procedure(db, sample_facility):
    """Create a procedure that requires contrast."""
    return ImagingProcedure.objects.create(
        code="CT-ABDOMEN-C",
        name="CT Abdomen with Contrast",
        modality="CT",
        body_region="ABDOMEN",
        cost=Decimal("10000.00"),
        requires_contrast=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def non_contrast_procedure(db, sample_facility):
    """Create a procedure that does NOT require contrast."""
    return ImagingProcedure.objects.create(
        code="XR-CHEST-PA-C",
        name="Chest X-Ray PA",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
        requires_contrast=False,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def low_egfr_result(contrast_patient, contrast_encounter, sample_facility, test_user):
    """eGFR 25 — high contrast nephropathy risk."""
    return AIEGFRResult.objects.create(
        patient=contrast_patient,
        encounter=contrast_encounter,
        facility=sample_facility,
        created_by=test_user,
        ckd_stage="G4",
        egfr_ckd_epi=Decimal("25.0"),
        dose_adjustment_band="severe",
        service_mode="auto",
        request_data={"creatinine": 2.8, "age": 59, "sex": "male"},
        result_data={"egfr_ckd_epi": 25.0, "ckd_stage": "G4"},
    )


@pytest.fixture
def moderate_egfr_result(contrast_patient, contrast_encounter, sample_facility, test_user):
    """eGFR 40 — moderate contrast risk."""
    return AIEGFRResult.objects.create(
        patient=contrast_patient,
        encounter=contrast_encounter,
        facility=sample_facility,
        created_by=test_user,
        ckd_stage="G3b",
        egfr_ckd_epi=Decimal("40.0"),
        dose_adjustment_band="moderate",
        service_mode="auto",
        request_data={"creatinine": 1.7, "age": 59, "sex": "male"},
        result_data={"egfr_ckd_epi": 40.0, "ckd_stage": "G3b"},
    )


@pytest.fixture
def normal_egfr_result(contrast_patient, contrast_encounter, sample_facility, test_user):
    """eGFR 95 — normal kidney function."""
    return AIEGFRResult.objects.create(
        patient=contrast_patient,
        encounter=contrast_encounter,
        facility=sample_facility,
        created_by=test_user,
        ckd_stage="G1",
        egfr_ckd_epi=Decimal("95.0"),
        dose_adjustment_band="normal",
        service_mode="auto",
        request_data={"creatinine": 0.9, "age": 59, "sex": "male"},
        result_data={"egfr_ckd_epi": 95.0, "ckd_stage": "G1"},
    )


# ============================================================================
# Tests: Contrast Guard Warnings
# ============================================================================


@pytest.mark.django_db
class TestImagingContrastEGFRGuard:
    """Imaging orders with contrast procedures should warn if eGFR is low."""

    def test_critical_warning_for_egfr_below_30(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        contrast_procedure,
        low_egfr_result,
    ):
        """eGFR < 30 + contrast should return critical level warning."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "Rule out mass",
                "items": [{"procedure_code": contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        warnings = response.data.get("contrast_egfr_warnings", [])
        assert len(warnings) == 1
        assert warnings[0]["level"] == "critical"
        assert "HIGH RISK" in warnings[0]["message"]
        assert "25" in warnings[0]["message"]

    def test_warning_for_egfr_between_30_and_45(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        contrast_procedure,
        moderate_egfr_result,
    ):
        """eGFR 30-44 + contrast should return warning level."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "Follow-up scan",
                "items": [{"procedure_code": contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        warnings = response.data.get("contrast_egfr_warnings", [])
        assert len(warnings) == 1
        assert warnings[0]["level"] == "warning"
        assert "CAUTION" in warnings[0]["message"]
        assert "metformin" in warnings[0]["message"].lower()

    def test_no_warning_for_normal_egfr(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        contrast_procedure,
        normal_egfr_result,
    ):
        """Normal eGFR + contrast should NOT produce a warning."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "Routine scan",
                "items": [{"procedure_code": contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        warnings = response.data.get("contrast_egfr_warnings", [])
        assert len(warnings) == 0

    def test_no_warning_for_non_contrast_procedure(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        non_contrast_procedure,
        low_egfr_result,
    ):
        """Non-contrast procedure should NOT produce a warning even with low eGFR."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "Routine chest",
                "items": [{"procedure_code": non_contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        warnings = response.data.get("contrast_egfr_warnings", [])
        assert len(warnings) == 0

    def test_no_warning_when_no_egfr_data(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        contrast_procedure,
    ):
        """No eGFR data should mean no warnings (not an error)."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "First visit scan",
                "items": [{"procedure_code": contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        warnings = response.data.get("contrast_egfr_warnings", [])
        assert len(warnings) == 0

    def test_order_still_created_despite_warning(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        contrast_procedure,
        low_egfr_result,
    ):
        """Order should be created even with critical warning (advisory only)."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "Essential CT",
                "items": [{"procedure_code": contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["id"] is not None
        assert ImagingOrder.objects.filter(id=response.data["id"]).exists()

    def test_warning_includes_procedure_name(
        self,
        authenticated_client,
        contrast_patient,
        contrast_encounter,
        contrast_procedure,
        low_egfr_result,
    ):
        """Warning should reference the specific procedure that requires contrast."""
        response = authenticated_client.post(
            "/api/imaging/orders/",
            {
                "patient": contrast_patient.id,
                "encounter": contrast_encounter.id,
                "priority": "ROUTINE",
                "clinical_indication": "Diagnostic scan",
                "items": [{"procedure_code": contrast_procedure.code}],
            },
            format="json",
        )
        assert response.status_code == 201
        warnings = response.data.get("contrast_egfr_warnings", [])
        assert warnings[0]["procedure"] == "CT Abdomen with Contrast"
