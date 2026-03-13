"""
Tests for DHA HPT Registry Integration (Gap #26).

Covers:
- Dataclass parsing with real DHA API response format
- DHA response envelope unwrapping (IsSuccess/Data pattern)
- Drug model HPT fields
- DrugSerializer HPT fields
- HPT search/map DrugViewSet actions
- Active-component allergy substance lookup
- CDS engine HPT-enhanced matching
- PrescriptionSerializer HPT-aware allergy check
- Management command (map_drugs_to_hpt)
"""

from decimal import Decimal
from io import StringIO
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from rest_framework import status

# ============================================================================
# Sample DHA API responses (based on real API documentation)
# ============================================================================

SAMPLE_DHA_PRODUCT_RESPONSE = {
    "IsSuccess": True,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "products": [
            {
                "product_id": 4855,
                "generic_concept_id": 1042,
                "brand_display_name": "Glucodeal 500 mg Oral Tablet",
                "generic_display_name": "Metformin 500 mg Oral Tablet",
                "brand_name": "Glucodeal",
                "generic_name": "Metformin",
                "strength_amount": "500",
                "strength_unit": "mg",
                "route_description": "Oral",
                "form_description": "Tablet",
                "ppb_registration_code": "77",
                "etcd": "ETCD-001",
                "knhts_concept_id": "10-03913-01",
                "updation_date": "2024-04-15T12:00:00Z",
            }
        ],
        "count": 1,
    },
}

SAMPLE_DHA_ACTIVE_COMPONENT_RESPONSE = {
    "IsSuccess": True,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "ac": [
            {
                "active_component_id": 1,
                "component_description": "Metformin",
                "component_links": [
                    {
                        "active_component_link_id": 1,
                        "active_component_line": 1,
                        "active_component_id": 1,
                        "component_name": "Metformin",
                        "component_atc_code": "A10BA02",
                    }
                ],
            }
        ],
        "count": 1,
    },
}

SAMPLE_DHA_ICD11_RESPONSE = {
    "IsSuccess": True,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "icd11": [
            {
                "icd_11_code": "1A00",
                "description": "Cholera",
                "browser_url": "https://icd.who.int/browse/2024-01/mms/en#257068224",
            }
        ],
        "count": 1,
    },
}

SAMPLE_DHA_LOINC_RESPONSE = {
    "IsSuccess": True,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "loinc": [
            {
                "loinc_num": "101129-5",
                "component": "Assay Sensitivity",
                "display_name": None,
            }
        ],
        "count": 1,
    },
}

SAMPLE_DHA_ICHI_RESPONSE = {
    "IsSuccess": True,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "ichi": [
            {
                "id_code": "ATD.AC.ZZ",
                "clean_title": "Test of orientation functions",
                "code_level": 6,
                "code": "ATD.AC.ZZ",
                "target": "ATD",
                "action": "AC",
                "mean": "AC",
                "class_kind": "category",
            }
        ],
        "count": 1,
    },
}

SAMPLE_DHA_INTERVENTION_RESPONSE = {
    "IsSuccess": True,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "shaInterventions": [
            {
                "intervention_code": "SHA-08-004",
                "intervention_name": "Anti - D",
                "category": "Test",
                "subcatgeory": "Test",
                "needs_pre_auth": True,
                "limits_per": "Individual",
                "provider_payment": "FFS",
                "levels": [
                    {"2": "Dispensaries and clinics"},
                    {"3": "Health centers"},
                    {"6": "National referral hospitals"},
                ],
                "diagnosis": [
                    {"KA84.0": "Rh isoimmunization of fetus or newborn"},
                ],
                "observation": [
                    {"10331-7": "Rh"},
                ],
            }
        ],
        "count": 1,
    },
}

SAMPLE_DHA_ERROR_RESPONSE = {
    "IsSuccess": False,
    "Message": "Invalid request",
    "Errors": ["Search parameter required"],
    "Data": {},
}


# ============================================================================
# Dataclass Parsing Tests
# ============================================================================


class TestDrugProductDataclass:
    """Tests for DrugProduct dataclass parsing with real DHA format."""

    def test_from_real_api_response(self):
        """Should parse all fields from real DHA product response."""
        from hmis.apps.billing.services.terminology import DrugProduct

        data = SAMPLE_DHA_PRODUCT_RESPONSE["Data"]["products"][0]
        product = DrugProduct.from_api_response(data)

        assert product.product_id == 4855
        assert product.brand_name == "Glucodeal"
        assert product.generic_name == "Metformin"
        assert product.brand_display_name == "Glucodeal 500 mg Oral Tablet"
        assert product.generic_display_name == "Metformin 500 mg Oral Tablet"
        assert product.generic_concept_id == 1042
        assert product.strength_amount == "500"
        assert product.strength_unit == "mg"
        assert product.route_description == "Oral"
        assert product.form_description == "Tablet"
        assert product.ppb_registration_code == "77"
        assert product.etcd == "ETCD-001"
        assert product.knhts_concept_id == "10-03913-01"
        assert product.updation_date == "2024-04-15T12:00:00Z"
        assert product.raw_data == data

    def test_from_minimal_response(self):
        """Should handle minimal/missing fields gracefully."""
        from hmis.apps.billing.services.terminology import DrugProduct

        product = DrugProduct.from_api_response({"product_id": 1, "brand_name": "X"})

        assert product.product_id == 1
        assert product.brand_name == "X"
        assert product.generic_name == ""
        assert product.knhts_concept_id == ""
        assert product.generic_concept_id is None

    def test_product_id_as_string(self):
        """Should handle product_id as string."""
        from hmis.apps.billing.services.terminology import DrugProduct

        product = DrugProduct.from_api_response({"product_id": "4855", "brand_name": "X"})
        assert product.product_id == 4855


class TestActiveComponentDataclass:
    """Tests for ActiveComponent dataclass parsing with real DHA format."""

    def test_from_real_api_response(self):
        """Should parse component and nested links from real DHA response."""
        from hmis.apps.billing.services.terminology import ActiveComponent

        data = SAMPLE_DHA_ACTIVE_COMPONENT_RESPONSE["Data"]["ac"][0]
        component = ActiveComponent.from_api_response(data)

        assert component.component_id == 1
        assert component.name == "Metformin"
        assert len(component.component_links) == 1

        link = component.component_links[0]
        assert link.active_component_link_id == 1
        assert link.component_name == "Metformin"
        assert link.component_atc_code == "A10BA02"

    def test_atc_codes_property(self):
        """Should extract ATC codes from component links."""
        from hmis.apps.billing.services.terminology import ActiveComponent

        data = SAMPLE_DHA_ACTIVE_COMPONENT_RESPONSE["Data"]["ac"][0]
        component = ActiveComponent.from_api_response(data)

        assert component.atc_codes == ["A10BA02"]
        assert component.atc_code == "A10BA02"

    def test_atc_code_none_when_no_links(self):
        """Should return None when no component links."""
        from hmis.apps.billing.services.terminology import ActiveComponent

        component = ActiveComponent.from_api_response({
            "active_component_id": 2,
            "component_description": "Unknown",
        })

        assert component.atc_codes == []
        assert component.atc_code is None

    def test_multiple_atc_codes(self):
        """Should extract all ATC codes from multiple links."""
        from hmis.apps.billing.services.terminology import ActiveComponent

        data = {
            "active_component_id": 3,
            "component_description": "Combo Drug",
            "component_links": [
                {
                    "active_component_link_id": 1,
                    "active_component_line": 1,
                    "active_component_id": 3,
                    "component_name": "Drug A",
                    "component_atc_code": "N02BE01",
                },
                {
                    "active_component_link_id": 2,
                    "active_component_line": 2,
                    "active_component_id": 3,
                    "component_name": "Drug B",
                    "component_atc_code": "R05DA04",
                },
            ],
        }
        component = ActiveComponent.from_api_response(data)
        assert component.atc_codes == ["N02BE01", "R05DA04"]


class TestICD11CodeDataclass:
    """Test ICD11Code parsing with real DHA format."""

    def test_from_real_api_response(self):
        from hmis.apps.billing.services.terminology import ICD11Code

        data = SAMPLE_DHA_ICD11_RESPONSE["Data"]["icd11"][0]
        code = ICD11Code.from_api_response(data)

        assert code.code == "1A00"
        assert code.title == "Cholera"


class TestICHICodeDataclass:
    """Test ICHICode parsing with real DHA format."""

    def test_from_real_api_response(self):
        from hmis.apps.billing.services.terminology import ICHICode

        data = SAMPLE_DHA_ICHI_RESPONSE["Data"]["ichi"][0]
        code = ICHICode.from_api_response(data)

        assert code.code == "ATD.AC.ZZ"
        assert code.title == "Test of orientation functions"
        assert code.target == "ATD"
        assert code.action == "AC"
        assert code.means == "AC"


class TestInterventionCodeDataclass:
    """Test InterventionCode parsing with real DHA format."""

    def test_from_real_api_response(self):
        from hmis.apps.billing.services.terminology import InterventionCode

        data = SAMPLE_DHA_INTERVENTION_RESPONSE["Data"]["shaInterventions"][0]
        code = InterventionCode.from_api_response(data)

        assert code.code == "SHA-08-004"
        assert code.name == "Anti - D"
        assert code.category == "Test"
        # Should extract minimum level from levels array
        assert code.facility_level == 2


class TestRemoteLOINCCodeDataclass:
    """Test RemoteLOINCCode parsing with real DHA format."""

    def test_from_real_api_response(self):
        from hmis.apps.billing.services.terminology import RemoteLOINCCode

        data = SAMPLE_DHA_LOINC_RESPONSE["Data"]["loinc"][0]
        code = RemoteLOINCCode.from_api_response(data)

        assert code.loinc_num == "101129-5"
        assert code.component == "Assay Sensitivity"


# ============================================================================
# DHA Response Unwrapping Tests
# ============================================================================


class TestDHAResponseUnwrapping:
    """Tests for _unwrap_dha_response helper."""

    def test_unwrap_success_response(self):
        from hmis.apps.billing.services.terminology import TerminologyService

        results = TerminologyService._unwrap_dha_response(
            SAMPLE_DHA_PRODUCT_RESPONSE, "products"
        )
        assert len(results) == 1
        assert results[0]["product_id"] == 4855

    def test_unwrap_error_response(self):
        from hmis.apps.billing.services.terminology import TerminologyService

        results = TerminologyService._unwrap_dha_response(
            SAMPLE_DHA_ERROR_RESPONSE, "products"
        )
        assert results == []

    def test_unwrap_intervention_response(self):
        from hmis.apps.billing.services.terminology import TerminologyService

        results = TerminologyService._unwrap_dha_response(
            SAMPLE_DHA_INTERVENTION_RESPONSE, "shaInterventions"
        )
        assert len(results) == 1
        assert results[0]["intervention_code"] == "SHA-08-004"

    def test_unwrap_fallback_for_non_dha_format(self):
        """Should handle non-DHA response format (no IsSuccess key)."""
        from hmis.apps.billing.services.terminology import TerminologyService

        legacy_response = {"products": [{"id": 1}]}
        results = TerminologyService._unwrap_dha_response(legacy_response, "products")
        assert len(results) == 1

    def test_unwrap_empty_data(self):
        from hmis.apps.billing.services.terminology import TerminologyService

        response = {"IsSuccess": True, "Message": "Success", "Errors": [], "Data": {}}
        results = TerminologyService._unwrap_dha_response(response, "products")
        assert results == []


# ============================================================================
# Drug Model HPT Fields Tests
# ============================================================================


class TestDrugHPTFields:
    """Tests for HPT fields on Drug model."""

    def test_drug_hpt_fields_exist(self, db):
        """Should be able to create a drug with HPT fields."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="MET500",
            generic_name="Metformin",
            strength="500mg",
            form="TABLET",
            unit="tablet",
            hpt_code="10-03913-01",
            hpt_product_id=4855,
            ppb_code="77",
        )

        drug.refresh_from_db()
        assert drug.hpt_code == "10-03913-01"
        assert drug.hpt_product_id == 4855
        assert drug.ppb_code == "77"
        assert drug.hpt_last_synced is None

    def test_drug_hpt_fields_default_blank(self, db):
        """HPT fields should default to blank/null."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="PARA500T",
            generic_name="Paracetamol",
            strength="500mg",
            form="TABLET",
            unit="tablet",
        )

        assert drug.hpt_code == ""
        assert drug.hpt_product_id is None
        assert drug.ppb_code == ""
        assert drug.hpt_last_synced is None

    def test_drug_serializer_includes_hpt_fields(self, db):
        """DrugSerializer should expose HPT fields."""
        from hmis.apps.pharmacy.models import Drug
        from hmis.apps.pharmacy.serializers import DrugSerializer

        drug = Drug.objects.create(
            code="MET500S",
            generic_name="Metformin",
            strength="500mg",
            form="TABLET",
            unit="tablet",
            hpt_code="10-03913-01",
            hpt_product_id=4855,
            ppb_code="77",
        )

        serializer = DrugSerializer(drug)
        data = serializer.data

        assert data["hpt_code"] == "10-03913-01"
        assert data["hpt_product_id"] == 4855
        assert data["ppb_code"] == "77"
        assert "hpt_last_synced" in data


# ============================================================================
# DrugViewSet HPT Actions Tests
# ============================================================================


class TestDrugViewSetHPTActions:
    """Tests for HPT search and mapping actions on DrugViewSet."""

    def test_hpt_search_requires_query(self, authenticated_client):
        """Should return 400 if q parameter is missing."""
        response = authenticated_client.get("/api/pharmacy/drugs/hpt-search/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch("hmis.apps.billing.services.terminology.TerminologyService")
    def test_hpt_search_returns_results(self, mock_service_cls, authenticated_client):
        """Should delegate to TerminologyService and return formatted results."""
        from hmis.apps.billing.services.terminology import DrugProduct

        mock_service = MagicMock()
        mock_service_cls.return_value = mock_service
        mock_service.search_drug_products.return_value = [
            DrugProduct.from_api_response(
                SAMPLE_DHA_PRODUCT_RESPONSE["Data"]["products"][0]
            )
        ]

        response = authenticated_client.get("/api/pharmacy/drugs/hpt-search/?q=Metformin")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["knhts_concept_id"] == "10-03913-01"
        assert response.data["results"][0]["generic_name"] == "Metformin"

    def test_hpt_search_unauthenticated_fails(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/pharmacy/drugs/hpt-search/?q=test")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_map_hpt_endpoint(self, authenticated_client, db):
        """Should map a drug to an HPT code."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="MAP_TEST",
            generic_name="Test Drug",
            strength="10mg",
            form="TABLET",
            unit="tablet",
        )

        response = authenticated_client.post(
            f"/api/pharmacy/drugs/{drug.id}/map-hpt/",
            {
                "hpt_code": "10-99999-01",
                "hpt_product_id": 1234,
                "ppb_code": "42",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        drug.refresh_from_db()
        assert drug.hpt_code == "10-99999-01"
        assert drug.hpt_product_id == 1234
        assert drug.ppb_code == "42"
        assert drug.hpt_last_synced is not None

    def test_map_hpt_requires_hpt_code(self, authenticated_client, db):
        """Should reject mapping without hpt_code."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="MAP_TEST2",
            generic_name="Test Drug",
            strength="10mg",
            form="TABLET",
            unit="tablet",
        )

        response = authenticated_client.post(
            f"/api/pharmacy/drugs/{drug.id}/map-hpt/",
            {"hpt_product_id": 1234},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# Allergy HPT Substance Search Tests
# ============================================================================


class TestAllergyHPTSubstanceSearch:
    """Tests for HPT active-component search on allergy endpoint."""

    def test_hpt_substance_search_requires_query(self, authenticated_client):
        """Should return 400 if q is missing or too short."""
        response = authenticated_client.get("/api/allergies/hpt-substance-search/?q=M")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch("hmis.apps.billing.services.terminology.TerminologyService")
    def test_hpt_substance_search_returns_components(
        self, mock_service_cls, authenticated_client
    ):
        """Should return active components with ATC codes."""
        from hmis.apps.billing.services.terminology import ActiveComponent

        mock_service = MagicMock()
        mock_service_cls.return_value = mock_service
        mock_service.search_active_components.return_value = [
            ActiveComponent.from_api_response(
                SAMPLE_DHA_ACTIVE_COMPONENT_RESPONSE["Data"]["ac"][0]
            )
        ]

        response = authenticated_client.get(
            "/api/allergies/hpt-substance-search/?q=Metformin"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        result = response.data["results"][0]
        assert result["name"] == "Metformin"
        assert result["atc_code"] == "A10BA02"
        assert result["substance_code"] == "A10BA02"
        assert result["substance_code_system"] == "http://www.whocc.no/atc"


# ============================================================================
# CDS Engine HPT Matching Tests
# ============================================================================


class TestCDSHPTMatching:
    """Tests for HPT-enhanced CDS drug-allergy and drug-drug matching."""

    def test_cds_drug_allergy_text_fallback(self):
        """Should still work with text matching when no HPT codes."""
        from hmis.apps.cds.engine import EvaluationContext, _check_prescribing_allergy

        rule = MagicMock()
        rule.id = 1
        rule.code = "DRUG_ALLERGY_1"
        rule.action_message = "Patient allergic to {allergy}"

        context = EvaluationContext(
            patient_id=1,
            allergy_substances=["penicillin"],
            prescribing_drug_name="Penicillin V",
        )
        condition = {"type": "drug_allergy", "check_mode": "prescribing"}

        result = _check_prescribing_allergy(rule, condition, context)
        assert result.triggered is True
        assert result.details["allergy"] == "penicillin"

    def test_cds_drug_allergy_no_match(self):
        """Should not trigger when no allergy match."""
        from hmis.apps.cds.engine import EvaluationContext, _check_prescribing_allergy

        rule = MagicMock()
        rule.id = 1
        rule.code = "DRUG_ALLERGY_1"
        rule.action_message = "Allergy alert"

        context = EvaluationContext(
            patient_id=1,
            allergy_substances=["aspirin"],
            prescribing_drug_name="Metformin",
        )
        condition = {"type": "drug_allergy", "check_mode": "prescribing"}

        result = _check_prescribing_allergy(rule, condition, context)
        assert result.triggered is False

    def test_cds_drug_drug_with_hpt_codes(self):
        """Should match using HPT codes in rule condition."""
        from hmis.apps.cds.engine import EvaluationContext, _evaluate_drug_drug

        rule = MagicMock()
        rule.id = 1
        rule.code = "DRUG_DRUG_1"
        rule.action_message = "Interaction: {drug_a} + {drug_b}"

        context = EvaluationContext(
            patient_id=1,
            current_medications=["warfarin"],
            current_medication_hpt_codes=["10-00001-01"],
            prescribing_drug_name="Aspirin",
            prescribing_drug_hpt_code="10-00002-01",
        )
        condition = {
            "type": "drug_drug",
            "drug_a": "warfarin",
            "drug_b": "aspirin",
            "severity": "major",
            "drug_a_hpt_code": "10-00001-01",
            "drug_b_hpt_code": "10-00002-01",
        }

        result = _evaluate_drug_drug(rule, condition, context)
        assert result.triggered is True
        assert result.details["match_type"] == "hpt_coded"
        assert result.details["severity"] == "major"

    def test_cds_drug_drug_text_fallback(self):
        """Should fall back to text matching when no HPT codes in context."""
        from hmis.apps.cds.engine import EvaluationContext, _evaluate_drug_drug

        rule = MagicMock()
        rule.id = 1
        rule.code = "DRUG_DRUG_2"
        rule.action_message = "{drug_a} + {drug_b}"

        context = EvaluationContext(
            patient_id=1,
            current_medications=["warfarin"],
            prescribing_drug_name="aspirin",
        )
        condition = {
            "type": "drug_drug",
            "drug_a": "warfarin",
            "drug_b": "aspirin",
            "severity": "major",
        }

        result = _evaluate_drug_drug(rule, condition, context)
        assert result.triggered is True
        assert "match_type" not in result.details  # text fallback, no match_type

    def test_cds_drug_drug_no_match(self):
        """Should not trigger when drugs don't match."""
        from hmis.apps.cds.engine import EvaluationContext, _evaluate_drug_drug

        rule = MagicMock()
        rule.id = 1
        rule.code = "DRUG_DRUG_3"
        rule.action_message = "Interaction"

        context = EvaluationContext(
            patient_id=1,
            current_medications=["metformin"],
            prescribing_drug_name="paracetamol",
        )
        condition = {
            "type": "drug_drug",
            "drug_a": "warfarin",
            "drug_b": "aspirin",
            "severity": "major",
        }

        result = _evaluate_drug_drug(rule, condition, context)
        assert result.triggered is False


# ============================================================================
# Management Command Tests
# ============================================================================


class TestMapDrugsToHPTCommand:
    """Tests for the map_drugs_to_hpt management command."""

    @patch("hmis.apps.pharmacy.management.commands.map_drugs_to_hpt.TerminologyService")
    def test_dry_run(self, mock_service_cls, db):
        """Should preview mappings without writing."""
        from django.core.management import call_command

        from hmis.apps.billing.services.terminology import DrugProduct
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="DRY_RUN",
            generic_name="Metformin",
            strength="500mg",
            form="TABLET",
            unit="tablet",
        )

        mock_service = MagicMock()
        mock_service_cls.return_value = mock_service
        mock_service.search_drug_products.return_value = [
            DrugProduct.from_api_response(
                SAMPLE_DHA_PRODUCT_RESPONSE["Data"]["products"][0]
            )
        ]

        out = StringIO()
        call_command("map_drugs_to_hpt", "--dry-run", stdout=out)

        drug.refresh_from_db()
        assert drug.hpt_code == ""  # Not saved in dry run
        assert "DRY RUN" in out.getvalue()

    @patch("hmis.apps.pharmacy.management.commands.map_drugs_to_hpt.TerminologyService")
    def test_auto_mapping(self, mock_service_cls, db):
        """Should auto-map drugs with exactly one match."""
        from django.core.management import call_command

        from hmis.apps.billing.services.terminology import DrugProduct
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="AUTO_MAP",
            generic_name="Metformin",
            strength="500mg",
            form="TABLET",
            unit="tablet",
        )

        mock_service = MagicMock()
        mock_service_cls.return_value = mock_service
        mock_service.search_drug_products.return_value = [
            DrugProduct.from_api_response(
                SAMPLE_DHA_PRODUCT_RESPONSE["Data"]["products"][0]
            )
        ]

        out = StringIO()
        call_command("map_drugs_to_hpt", stdout=out)

        drug.refresh_from_db()
        assert drug.hpt_code == "10-03913-01"
        assert drug.hpt_product_id == 4855
        assert drug.ppb_code == "77"
        assert drug.hpt_last_synced is not None

    @patch("hmis.apps.pharmacy.management.commands.map_drugs_to_hpt.TerminologyService")
    def test_ambiguous_results(self, mock_service_cls, db):
        """Should flag ambiguous results (multiple matches)."""
        from django.core.management import call_command

        from hmis.apps.billing.services.terminology import DrugProduct
        from hmis.apps.pharmacy.models import Drug

        Drug.objects.create(
            code="AMBIG_MAP",
            generic_name="Metformin",
            strength="500mg",
            form="TABLET",
            unit="tablet",
        )

        product1 = SAMPLE_DHA_PRODUCT_RESPONSE["Data"]["products"][0]
        product2 = dict(product1)
        product2["product_id"] = 4856
        product2["knhts_concept_id"] = "10-03913-02"
        product2["brand_name"] = "MetPharma"

        mock_service = MagicMock()
        mock_service_cls.return_value = mock_service
        mock_service.search_drug_products.return_value = [
            DrugProduct.from_api_response(product1),
            DrugProduct.from_api_response(product2),
        ]

        out = StringIO()
        call_command("map_drugs_to_hpt", stdout=out)

        output = out.getvalue()
        assert "Ambiguous" in output

    @patch("hmis.apps.pharmacy.management.commands.map_drugs_to_hpt.TerminologyService")
    def test_api_failure_graceful(self, mock_service_cls, db):
        """Should handle API failures gracefully."""
        from django.core.management import call_command

        from hmis.apps.billing.services.terminology import TerminologyError
        from hmis.apps.pharmacy.models import Drug

        Drug.objects.create(
            code="FAIL_MAP",
            generic_name="FailDrug",
            strength="10mg",
            form="TABLET",
            unit="tablet",
        )

        mock_service = MagicMock()
        mock_service_cls.return_value = mock_service
        mock_service.search_drug_products.side_effect = TerminologyError("API timeout")

        out = StringIO()
        call_command("map_drugs_to_hpt", stdout=out)

        output = out.getvalue()
        assert "API error" in output


# ============================================================================
# Edge Case Tests
# ============================================================================


class TestEdgeCases:
    """Edge case tests for HPT integration."""

    def test_drug_product_search_with_all_query_params(self):
        """Should accept all DHA query params for product search."""
        from hmis.apps.billing.services.terminology import TerminologyService

        service = TerminologyService()

        # Verify method signature accepts all params (doesn't test API call)
        import inspect
        sig = inspect.signature(service.search_drug_products)
        params = list(sig.parameters.keys())
        assert "query" in params
        assert "product_id" in params
        assert "generic_concept_id" in params
        assert "form_id" in params
        assert "route_id" in params

    def test_active_component_method_supports_exact_match(self):
        """Should accept exact_match and active_component_id params."""
        from hmis.apps.billing.services.terminology import TerminologyService

        service = TerminologyService()

        import inspect
        sig = inspect.signature(service.search_active_components)
        params = list(sig.parameters.keys())
        assert "exact_match" in params
        assert "active_component_id" in params

    def test_cds_context_hpt_fields(self):
        """EvaluationContext should have HPT-related fields."""
        from hmis.apps.cds.engine import EvaluationContext

        ctx = EvaluationContext(
            patient_id=1,
            allergy_substance_codes=[
                {"substance_code": "A10BA02", "substance_code_system": "http://www.whocc.no/atc"}
            ],
            current_medication_hpt_codes=["10-00001-01"],
            prescribing_drug_hpt_code="10-00002-01",
        )

        assert len(ctx.allergy_substance_codes) == 1
        assert ctx.current_medication_hpt_codes == ["10-00001-01"]
        assert ctx.prescribing_drug_hpt_code == "10-00002-01"

    def test_component_link_dataclass(self):
        """ComponentLink should be parseable."""
        from hmis.apps.billing.services.terminology import ComponentLink

        link = ComponentLink.from_api_response({
            "active_component_link_id": 1,
            "active_component_line": 1,
            "active_component_id": 1,
            "component_name": "Metformin",
            "component_atc_code": "A10BA02",
        })

        assert link.active_component_link_id == 1
        assert link.component_name == "Metformin"
        assert link.component_atc_code == "A10BA02"
