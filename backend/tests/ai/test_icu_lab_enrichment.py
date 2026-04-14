"""
Tests for ICU lab enrichment service and endpoint.

Tests cover:
- Lab enrichment service: LOINC-based mapping, catalog code fallback,
  admission-scoped vs patient-wide results, recency, missing data
- Lab enrichment endpoint: GET /api/ai/predict/icu/labs/?admission_id=X
- ICU prediction view: auto-enrichment of patient_data from verified labs
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def wbc_test_catalog(db):
    """TestCatalog entry for WBC with LOINC code."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="WBC",
        name="White Blood Cell Count",
        short_name="WBC",
        loinc_code="6690-2",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="x10^9/L",
        cost=Decimal("200.00"),
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def plt_test_catalog(db):
    """TestCatalog entry for Platelets with LOINC code."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="PLT",
        name="Platelet Count",
        short_name="PLT",
        loinc_code="777-3",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="x10^9/L",
        cost=Decimal("200.00"),
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def creatinine_test_catalog(db):
    """TestCatalog entry for Creatinine with LOINC code."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="CREA",
        name="Creatinine",
        short_name="Creatinine",
        loinc_code="2160-0",
        category="CHEMISTRY",
        specimen_type="SERUM",
        result_type="NUMERIC",
        result_unit="mg/dL",
        cost=Decimal("400.00"),
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def lactate_test_catalog(db):
    """TestCatalog entry for Lactate with LOINC code."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="LACT",
        name="Lactate",
        short_name="Lactate",
        loinc_code="2524-7",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="mmol/L",
        cost=Decimal("600.00"),
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def bilirubin_test_catalog(db):
    """TestCatalog entry for Bilirubin with LOINC code."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="TBIL",
        name="Total Bilirubin",
        short_name="T.Bil",
        loinc_code="1975-2",
        category="CHEMISTRY",
        specimen_type="SERUM",
        result_type="NUMERIC",
        result_unit="mg/dL",
        cost=Decimal("350.00"),
        available_in_house=True,
        is_active=True,
    )


@pytest.fixture
def creatinine_no_loinc(db):
    """TestCatalog entry for Creatinine WITHOUT LOINC (catalog code fallback)."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="CR",
        name="Serum Creatinine",
        short_name="Cr",
        loinc_code="",
        category="CHEMISTRY",
        specimen_type="SERUM",
        result_type="NUMERIC",
        result_unit="mg/dL",
        cost=Decimal("400.00"),
        available_in_house=True,
        is_active=True,
    )


def _create_lab_order(patient, encounter, user, facility, organization, admission=None):
    """Helper to create a lab order."""
    from hmis.apps.laboratory.models import LabOrder

    return LabOrder.objects.create(
        patient=patient,
        encounter=encounter,
        ordered_by=user,
        order_type="IN_HOUSE",
        status="ORDERED",
        priority="ROUTINE",
        facility=facility,
        organization=organization,
        admission=admission,
    )


def _create_verified_result(lab_order, test_catalog, numeric_value, user):
    """Helper to create a verified lab result."""
    from hmis.apps.laboratory.models import LabOrderItem, LabResult

    item = LabOrderItem.objects.create(
        lab_order=lab_order,
        test=test_catalog,
        unit_cost=test_catalog.cost,
    )
    result = LabResult.objects.create(
        order_item=item,
        numeric_value=Decimal(str(numeric_value)),
        text_value=str(numeric_value),
        result_flag="NORMAL",
        verification_status="VERIFIED",
        verified_by=user,
        verified_at=timezone.now(),
        entered_by=user,
    )
    return result


# ---------------------------------------------------------------------------
# Service tests: get_latest_labs_for_icu()
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestICULabEnrichmentService:
    """Tests for the icu_lab_enrichment.get_latest_labs_for_icu service."""

    def test_returns_empty_when_no_results(self):
        """Should return empty dict when no lab results exist."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu

        result = get_latest_labs_for_icu(patient_id=99999, admission_id=99999)
        assert result == {}

    def test_maps_loinc_to_icu_fields(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
        plt_test_catalog,
        creatinine_test_catalog,
    ):
        """Should map LOINC-coded results to correct ICU field names."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu

        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order, wbc_test_catalog, 15.2, test_user)
        _create_verified_result(order, plt_test_catalog, 120.0, test_user)
        _create_verified_result(order, creatinine_test_catalog, 2.1, test_user)

        result = get_latest_labs_for_icu(
            patient_id=sample_patient.id,
            admission_id=sample_admission.id,
        )

        assert result["wbc"] == 15.2
        assert result["platelets"] == 120.0
        assert result["creatinine"] == 2.1

    def test_falls_back_to_catalog_code(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        creatinine_no_loinc,
    ):
        """Should map by TestCatalog.code when LOINC is missing."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu

        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order, creatinine_no_loinc, 3.5, test_user)

        result = get_latest_labs_for_icu(
            patient_id=sample_patient.id,
            admission_id=sample_admission.id,
        )

        assert result["creatinine"] == 3.5

    def test_ignores_unverified_results(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
    ):
        """Should only include VERIFIED results."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu
        from hmis.apps.laboratory.models import LabOrderItem, LabResult

        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        item = LabOrderItem.objects.create(
            lab_order=order,
            test=wbc_test_catalog,
            unit_cost=wbc_test_catalog.cost,
        )
        LabResult.objects.create(
            order_item=item,
            numeric_value=Decimal("18.0"),
            text_value="18.0",
            result_flag="HIGH",
            verification_status="UNVERIFIED",
            entered_by=test_user,
        )

        result = get_latest_labs_for_icu(
            patient_id=sample_patient.id,
            admission_id=sample_admission.id,
        )
        assert "wbc" not in result

    def test_prefers_admission_results_over_patient(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
    ):
        """Admission-scoped results should take priority over patient-wide."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu

        # Create patient-wide result (no admission link)
        order_patient = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=None,
        )
        _create_verified_result(order_patient, wbc_test_catalog, 8.0, test_user)

        # Create admission-scoped result
        order_admission = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order_admission, wbc_test_catalog, 15.2, test_user)

        result = get_latest_labs_for_icu(
            patient_id=sample_patient.id,
            admission_id=sample_admission.id,
        )
        assert result["wbc"] == 15.2

    def test_fills_gaps_from_patient_results(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
        lactate_test_catalog,
    ):
        """Should fill missing fields from patient-wide results."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu

        # Admission has WBC only
        order_admission = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order_admission, wbc_test_catalog, 15.2, test_user)

        # Patient-wide has Lactate (not linked to admission)
        order_patient = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=None,
        )
        _create_verified_result(order_patient, lactate_test_catalog, 3.5, test_user)

        result = get_latest_labs_for_icu(
            patient_id=sample_patient.id,
            admission_id=sample_admission.id,
        )

        assert result["wbc"] == 15.2
        assert result["lactate"] == 3.5

    def test_works_without_admission_id(
        self,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        wbc_test_catalog,
    ):
        """Should work with patient_id only (no admission)."""
        from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu

        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
        )
        _create_verified_result(order, wbc_test_catalog, 12.0, test_user)

        result = get_latest_labs_for_icu(
            patient_id=sample_patient.id,
            admission_id=None,
        )
        assert result["wbc"] == 12.0


# ---------------------------------------------------------------------------
# Endpoint tests: GET /api/ai/predict/icu/labs/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestICULabEnrichmentEndpoint:
    """Tests for GET /api/ai/predict/icu/labs/?admission_id=N."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_ai_disabled(self, authenticated_client, sample_admission):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.get(
            f"/api/ai/predict/icu/labs/?admission_id={sample_admission.id}",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_admission_id(self, authenticated_client):
        """Should return 400 when admission_id is missing."""
        response = authenticated_client.get("/api/ai/predict/icu/labs/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_404_for_nonexistent_admission(self, authenticated_client):
        """Should return 404 when admission does not exist."""
        response = authenticated_client.get(
            "/api/ai/predict/icu/labs/?admission_id=99999",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_lab_values(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
        creatinine_test_catalog,
    ):
        """Should return enriched lab values for the admission."""
        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order, wbc_test_catalog, 15.2, test_user)
        _create_verified_result(order, creatinine_test_catalog, 2.1, test_user)

        response = authenticated_client.get(
            f"/api/ai/predict/icu/labs/?admission_id={sample_admission.id}",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["wbc"] == 15.2
        assert response.data["creatinine"] == 2.1

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_when_no_labs(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should return empty dict when no verified results exist."""
        response = authenticated_client.get(
            f"/api/ai/predict/icu/labs/?admission_id={sample_admission.id}",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {}

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client, sample_admission):
        """Should require authentication."""
        response = api_client.get(
            f"/api/ai/predict/icu/labs/?admission_id={sample_admission.id}",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Integration tests: ICU predict view with lab enrichment
# ---------------------------------------------------------------------------

# Minimum vitals that the ICU serializer requires (labs are optional —
# the view substitutes normal defaults for any missing lab fields).
_REQUIRED_ICU_VITALS: dict = {
    "temperature": 37.0,
    "heart_rate": 80,
    "systolic_bp": 120,
    "diastolic_bp": 80,
    "respiratory_rate": 18,
    "spo2": 97,
}


@pytest.mark.django_db
class TestICUPredictViewLabEnrichment:
    """Tests that POST /api/ai/predict/icu/ auto-enriches lab data."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_auto_enriches_labs_from_admission(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
        creatinine_test_catalog,
    ):
        """Should enrich patient_data with labs when admission_id is provided."""
        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order, wbc_test_catalog, 15.2, test_user)
        _create_verified_result(order, creatinine_test_catalog, 2.1, test_user)

        tibabot_response = {
            "risk_level": "high",
            "risk_score": 0.75,
            "sofa_score": 7,
        }

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                {
                    "patient_data": {
                        **_REQUIRED_ICU_VITALS,
                        "age": 65,
                        "gender": "M",
                        "heart_rate": 110,
                        # Omit wbc & creatinine so enrichment fills them
                        "wbc": None,
                        "creatinine": None,
                    },
                    "admission_id": sample_admission.id,
                    "prediction_type": "predict",
                },
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK

            # Verify the payload sent to TibaBot includes enriched labs
            call_args = mock_client.predict_icu.call_args
            sent_patient_data = call_args[0][0]["patient_data"]
            assert sent_patient_data["wbc"] == 15.2
            assert sent_patient_data["creatinine"] == 2.1

    @override_settings(TIBABOT_ENABLED=True)
    def test_frontend_labs_take_precedence(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        test_user,
        sample_facility,
        sample_organization,
        sample_admission,
        wbc_test_catalog,
    ):
        """Frontend-provided lab values should NOT be overwritten by enrichment."""
        order = _create_lab_order(
            sample_patient, sample_encounter, test_user,
            sample_facility, sample_organization,
            admission=sample_admission,
        )
        _create_verified_result(order, wbc_test_catalog, 15.2, test_user)

        tibabot_response = {
            "risk_level": "low",
            "risk_score": 0.1,
        }

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                {
                    "patient_data": {
                        **_REQUIRED_ICU_VITALS,
                        "age": 40,
                        "gender": "F",
                        "wbc": 8.0,  # Frontend overrides
                    },
                    "admission_id": sample_admission.id,
                    "prediction_type": "predict",
                },
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK

            # Should use the frontend value, not the enriched one
            call_args = mock_client.predict_icu.call_args
            sent_patient_data = call_args[0][0]["patient_data"]
            assert sent_patient_data["wbc"] == 8.0

    @override_settings(TIBABOT_ENABLED=True)
    def test_enrichment_failure_does_not_break_prediction(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should proceed with prediction even if lab enrichment fails."""
        tibabot_response = {
            "risk_level": "low",
            "risk_score": 0.2,
        }

        with (
            patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client,
            patch(
                "hmis.apps.ai.services.icu_lab_enrichment.get_latest_labs_for_icu",
                side_effect=Exception("DB error"),
            ),
        ):
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                {
                    "patient_data": {
                        **_REQUIRED_ICU_VITALS,
                        "age": 30,
                        "gender": "M",
                    },
                    "admission_id": sample_admission.id,
                    "prediction_type": "predict",
                },
                format="json",
            )

            # Should still return 200 with prediction
            assert response.status_code == status.HTTP_200_OK

    @override_settings(TIBABOT_ENABLED=True)
    def test_no_enrichment_without_admission_id(
        self,
        authenticated_client,
    ):
        """Should not attempt enrichment when admission_id is not provided."""
        tibabot_response = {
            "risk_level": "low",
            "risk_score": 0.1,
        }

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.predict_icu.return_value = tibabot_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/predict/icu/",
                {
                    "patient_data": {
                        **_REQUIRED_ICU_VITALS,
                        "age": 30,
                        "gender": "M",
                    },
                    "prediction_type": "predict",
                },
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            # Without admission_id, labs are filled with normal defaults by the view
            call_args = mock_client.predict_icu.call_args
            sent_patient_data = call_args[0][0]["patient_data"]
            assert sent_patient_data["wbc"] == 7.5  # view's normal default
            assert sent_patient_data["creatinine"] == 0.9
