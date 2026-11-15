# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for disease-level county policy and ICD-10/ICD-11 surveillance matching.

Run with:
    poetry run pytest tests/surveillance/test_notifiable_disease_coding.py --no-cov

Inputs:
    Standard patient, encounter, facility, organization, and authenticated-client fixtures.
"""

import json
from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import call_command
from rest_framework import status


@pytest.mark.django_db
class TestNotifiableDiseaseCoding:
    """Verify explicit county-routing policy and dual terminology matching."""

    def test_disease_persists_county_policy_and_icd11_codes(
        self,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """A catalogue disease can explicitly require county notification for ICD-11 coding."""
        from hmis.apps.surveillance.models import NotifiableCase, NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="ICD-11 County Policy Disease",
            icd10_codes="A00",
            icd11_codes=["1A00", "1A00.0"],
            category="WEEKLY",
            requires_county_notification=True,
            reporting_hours=168,
        )
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )

        assert disease.icd11_codes == ["1A00", "1A00.0"]
        assert disease.get_icd11_code_list() == ["1A00", "1A00.0"]
        assert case.requires_county_notification is True

    def test_disease_serializer_accepts_explicit_county_policy(self):
        """Administrators can configure county routing independently of report category."""
        from hmis.apps.surveillance.serializers import NotifiableDiseaseSerializer

        serializer = NotifiableDiseaseSerializer(
            data={
                "name": "Serializer County Policy Disease",
                "icd10_codes": "A00",
                "icd11_codes": ["1A00"],
                "category": "WEEKLY",
                "requires_county_notification": True,
                "reporting_hours": 168,
            }
        )

        assert serializer.is_valid(), serializer.errors
        disease = serializer.save()
        assert disease.requires_county_notification is True
        assert disease.icd11_codes == ["1A00"]

    def test_outbreak_alert_overrides_disease_county_policy(
        self,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """An outbreak remains individually reportable even when the catalogue policy is false."""
        from hmis.apps.surveillance.models import (
            NotifiableCase,
            NotifiableDisease,
            SurveillanceAlert,
        )

        disease = NotifiableDisease.objects.create(
            name="Weekly Outbreak Override Disease",
            icd10_codes="A01",
            category="WEEKLY",
            requires_county_notification=False,
            reporting_hours=168,
        )
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceAlert.objects.create(
            case=case,
            alert_type=SurveillanceAlert.AlertType.OUTBREAK,
            message="Outbreak threshold exceeded.",
            facility=sample_facility,
            organization=sample_organization,
        )

        assert case.requires_county_notification is True

    def test_icd11_only_diagnosis_creates_notifiable_case(
        self,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """ICD-11-only diagnoses must trigger the same surveillance matching workflow."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.surveillance.models import NotifiableCase, NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="ICD-11 Cholera",
            icd10_codes="",
            icd11_codes=["1A00"],
            category="IMMEDIATE",
            requires_county_notification=True,
            reporting_hours=24,
        )

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd11_code="1A00",
            icd11_display="Cholera",
            diagnosis_type="PRIMARY",
        )

        case = NotifiableCase.objects.get(diagnosis=diagnosis)
        assert case.disease == disease
        assert case.facility == sample_facility
        assert case.organization == sample_organization

    def test_seed_command_loads_county_policy_and_icd11_codes(self, tmp_path):
        """The seed command must load explicit routing and dual-code mappings."""
        from hmis.apps.surveillance.models import NotifiableDisease

        seed_file = tmp_path / "notifiable-diseases.json"
        seed_file.write_text(
            json.dumps(
                {
                    "diseases": [
                        {
                            "name": "Seeded ICD-11 Disease",
                            "icd10_codes": "A00",
                            "icd11_codes": ["1A00"],
                            "category": "WEEKLY",
                            "requires_county_notification": True,
                            "reporting_hours": 168,
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        call_command("seed_notifiable_diseases", file=str(seed_file), verbosity=0)

        disease = NotifiableDisease.objects.get(name="Seeded ICD-11 Disease")
        assert disease.requires_county_notification is True
        assert disease.get_icd11_code_list() == ["1A00"]

    def test_default_seed_catalogue_uses_dha_verified_icd11_arrays(self):
        """The bundled MOH catalogue uses complete DHA-verified code arrays."""
        from hmis.apps.surveillance.models import NotifiableDisease

        call_command("seed_notifiable_diseases", verbosity=0)

        cholera = NotifiableDisease.objects.get(name="Cholera")
        viral_hemorrhagic_fevers = NotifiableDisease.objects.get(name="Viral Hemorrhagic Fevers")
        assert cholera.requires_county_notification is True
        assert cholera.icd11_codes == ["1A00"]
        assert cholera.get_icd11_code_list() == ["1A00"]
        assert viral_hemorrhagic_fevers.icd11_codes == [
            "1D86",
            "1D61.0",
            "1D4A",
            "1D49",
            "1D61.1",
            "1D4C",
            "1D61.3",
            "1D40-1D4Z",
            "1D4Y",
            "1D62.0",
        ]

    def test_bundled_catalogue_uses_non_empty_icd11_code_arrays(self):
        """Every MOH reporting row has an explicit array from the DHA WHO source."""
        seed_data = json.loads(
            (Path(settings.BASE_DIR) / "data" / "notifiable_diseases.json").read_text(
                encoding="utf-8"
            )
        )

        metadata = seed_data["_metadata"]
        assert metadata["icd11_mapping_source"] == {
            "endpoint": "https://ilm-dev.dha.go.ke/uat-middleware/api/v1/clinical/concepts",
            "owner": "WHO",
            "source": "ICD-11",
            "verified_on": "2026-11-15",
        }
        assert all(
            isinstance(disease["icd11_codes"], list) and disease["icd11_codes"]
            for disease in seed_data["diseases"]
        )

    def test_icd11_dha_range_mapping_matches_child_codes(self):
        """DHA family range codes match a diagnosis recorded at a child code."""
        from hmis.apps.surveillance.services import SurveillanceService

        assert SurveillanceService._configured_code_matches("1D49", "1D40-1D4Z")
        assert SurveillanceService._configured_code_matches("1F40.0", "1F40-1F4Z")
        assert not SurveillanceService._configured_code_matches("1C82", "1D40-1D4Z")

    def test_disease_list_exposes_county_notification_policy(
        self,
        authenticated_client,
    ):
        """The list response must match the frontend's disease-list contract."""
        from hmis.apps.surveillance.models import NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="Catalogue Policy API Disease",
            icd10_codes="A00",
            icd11_codes=["1A00"],
            category="IMMEDIATE",
            requires_county_notification=True,
            reporting_hours=24,
        )

        response = authenticated_client.get("/api/surveillance/diseases/")

        assert response.status_code == status.HTTP_200_OK
        item = next(row for row in response.data["results"] if row["id"] == disease.id)
        assert item["requires_county_notification"] is True
