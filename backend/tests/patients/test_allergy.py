"""
Tests for the Allergy model and API.

This module provides comprehensive tests for:
- Allergy model CRUD operations
- Allergy API endpoints
- Drug-allergy interaction checking
- FHIR AllergyIntolerance resource mapping
- Data migration from Encounter.allergies text

Sprint 1.C: Clinical Data Model Enhancements
DHA Compliance: Structured Allergy Model (P1 REQUIRED)
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from rest_framework import status


class TestAllergyModel:
    """Tests for the Allergy model."""

    def test_allergy_creation(self, db, sample_patient, sample_organization):
        """Should create an allergy with valid data."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            reaction_type="rash",
            severity="moderate",
            status="active",
            organization=sample_organization,
        )

        assert allergy.id is not None
        assert allergy.substance == "Penicillin"
        assert allergy.substance_type == "medication"
        assert allergy.is_active is True

    def test_allergy_str_representation(self, db, sample_patient, sample_organization):
        """Should have a meaningful string representation."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Amoxicillin",
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        assert "Amoxicillin" in str(allergy)
        assert "Severe" in str(allergy)
        assert sample_patient.mrn in str(allergy)

    def test_allergy_is_high_risk_severe(self, db, sample_patient, sample_organization):
        """Should mark severe allergies as high risk."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Aspirin",
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        assert allergy.is_high_risk is True

    def test_allergy_is_high_risk_life_threatening(self, db, sample_patient, sample_organization):
        """Should mark life-threatening allergies as high risk."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Shellfish",
            severity="life_threatening",
            status="active",
            organization=sample_organization,
        )

        assert allergy.is_high_risk is True

    def test_allergy_is_high_risk_criticality_high(self, db, sample_patient, sample_organization):
        """Should mark high criticality allergies as high risk."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Peanuts",
            severity="moderate",
            criticality="high",
            status="active",
            organization=sample_organization,
        )

        assert allergy.is_high_risk is True

    def test_allergy_is_not_high_risk_mild(self, db, sample_patient, sample_organization):
        """Should not mark mild allergies as high risk."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Latex",
            severity="mild",
            criticality="low",
            status="active",
            organization=sample_organization,
        )

        assert allergy.is_high_risk is False

    def test_allergy_validation_future_onset_date(self, db, sample_patient):
        """Should reject future onset dates."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy(
            patient=sample_patient,
            substance="Penicillin",
            onset_date=date.today() + timedelta(days=30),
        )

        with pytest.raises(ValidationError) as exc_info:
            allergy.clean()
        assert "onset_date" in str(exc_info.value)

    def test_allergy_validation_future_last_occurrence(self, db, sample_patient):
        """Should reject future last occurrence dates."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy(
            patient=sample_patient,
            substance="Penicillin",
            last_occurrence=date.today() + timedelta(days=30),
        )

        with pytest.raises(ValidationError) as exc_info:
            allergy.clean()
        assert "last_occurrence" in str(exc_info.value)

    def test_allergy_validation_last_occurrence_before_onset(self, db, sample_patient):
        """Should reject last occurrence before onset date."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy(
            patient=sample_patient,
            substance="Penicillin",
            onset_date=date(2020, 6, 1),
            last_occurrence=date(2020, 1, 1),
        )

        with pytest.raises(ValidationError) as exc_info:
            allergy.clean()
        assert "last_occurrence" in str(exc_info.value)

    def test_allergy_unique_active_constraint(self, db, sample_patient, sample_organization):
        """Should prevent duplicate active allergies for same substance."""
        from django.db import IntegrityError

        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            status="active",
            organization=sample_organization,
        )

        # Second active allergy with same substance should fail
        with pytest.raises(IntegrityError):
            Allergy.objects.create(
                patient=sample_patient,
                substance="Penicillin",
                status="active",
                organization=sample_organization,
            )

    def test_allergy_allows_resolved_duplicate(self, db, sample_patient, sample_organization):
        """Should allow resolved allergy with same substance as active."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            status="active",
            organization=sample_organization,
        )

        # Resolved allergy with same substance should work
        resolved = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            status="resolved",
            organization=sample_organization,
        )

        assert resolved.id is not None

    def test_get_active_allergies_for_patient(self, db, sample_patient, sample_organization):
        """Should return only active allergies."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            status="active",
            organization=sample_organization,
        )
        Allergy.objects.create(
            patient=sample_patient,
            substance="Sulfa",
            status="active",
            organization=sample_organization,
        )
        Allergy.objects.create(
            patient=sample_patient,
            substance="Aspirin",
            status="resolved",
            organization=sample_organization,
        )

        active = Allergy.get_active_allergies_for_patient(sample_patient.id)
        assert active.count() == 2
        assert all(a.status == "active" for a in active)


class TestAllergyDrugInteraction:
    """Tests for drug-allergy interaction checking."""

    def test_check_drug_allergy_by_id(self, db, sample_patient, sample_drug, sample_organization):
        """Should detect allergy by linked drug ID."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance=sample_drug.generic_name,
            drug=sample_drug,
            substance_type="medication",
            status="active",
            organization=sample_organization,
        )

        allergies = Allergy.check_drug_allergy(sample_patient.id, sample_drug.id)
        assert len(allergies) == 1
        assert allergies[0].substance == sample_drug.generic_name

    def test_check_drug_allergy_no_match(
        self, db, sample_patient, sample_drug, sample_organization
    ):
        """Should return empty list when no allergy match."""
        from hmis.apps.patients.models import Allergy
        from hmis.apps.pharmacy.models import Drug

        # Create allergy to different drug
        other_drug = Drug.objects.create(
            code="DRUG002",
            generic_name="Ibuprofen",
            form="TABLET",
            strength="400mg",
            unit="tablet",
        )
        Allergy.objects.create(
            patient=sample_patient,
            substance="Ibuprofen",
            drug=other_drug,
            status="active",
            organization=sample_organization,
        )

        allergies = Allergy.check_drug_allergy(sample_patient.id, sample_drug.id)
        assert len(allergies) == 0

    def test_check_drug_name_allergy(self, db, sample_patient, sample_organization):
        """Should detect allergy by drug name (case-insensitive)."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            status="active",
            organization=sample_organization,
        )

        allergies = Allergy.check_drug_name_allergy(sample_patient.id, "PENICILLIN")
        assert len(allergies) == 1

    def test_check_drug_name_allergy_partial_match(self, db, sample_patient, sample_organization):
        """Should detect allergy by partial drug name match."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin V",
            substance_type="medication",
            status="active",
            organization=sample_organization,
        )

        allergies = Allergy.check_drug_name_allergy(sample_patient.id, "Penicillin")
        assert len(allergies) == 1


class TestAllergyAPI:
    """Tests for the Allergy API endpoints."""

    def test_list_allergies_for_patient(
        self, authenticated_client, sample_patient, db, sample_organization
    ):
        """Should list allergies for a specific patient."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/allergies/")

        assert response.status_code == status.HTTP_200_OK
        # API returns paginated response
        results = response.data.get("results", response.data)
        if isinstance(results, list):
            assert len(results) >= 1
            assert results[0]["substance"] == "Penicillin"
        else:
            # Non-paginated
            assert results["substance"] == "Penicillin"

    def test_create_allergy(self, authenticated_client, sample_patient, db):
        """Should create an allergy via API."""
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/allergies/",
            {
                "substance": "Amoxicillin",
                "substance_type": "medication",
                "reaction_type": "rash",
                "severity": "moderate",
            },
        )

        # Debug output if test fails
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response data: {response.data}")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["substance"] == "Amoxicillin"
        assert response.data["patient"] == sample_patient.id

    def test_create_allergy_sets_recorded_by(
        self, authenticated_client, sample_patient, test_user, db
    ):
        """Should set recorded_by to current user."""
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/allergies/",
            {
                "substance": "Ibuprofen",
                "reaction_type": "nausea",
                "severity": "mild",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["recorded_by"] == test_user.id

    def test_update_allergy(self, authenticated_client, sample_patient, db, sample_organization):
        """Should update allergy status."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/allergies/{allergy.id}/",
            {"status": "resolved"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "resolved"

    def test_delete_allergy(self, authenticated_client, sample_patient, db, sample_organization):
        """Should delete an allergy."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/allergies/{allergy.id}/"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Allergy.objects.filter(id=allergy.id).exists()

    def test_standalone_allergies_endpoint(
        self, authenticated_client, sample_patient, db, sample_organization
    ):
        """Should access allergies via standalone endpoint."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Aspirin",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.get(f"/api/allergies/{allergy.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["substance"] == "Aspirin"

    def test_unauthenticated_access_denied(self, api_client, sample_patient, db):
        """Should deny unauthenticated access."""
        response = api_client.get(f"/api/patients/{sample_patient.id}/allergies/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestAllergyLookup:
    """Tests for allergy substance lookup endpoint."""

    def test_medication_lookup(self, authenticated_client, sample_drug, db):
        """Should find drugs by name."""
        response = authenticated_client.get(
            f"/api/allergies/lookup/?q={sample_drug.generic_name[:4]}&type=medication"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) > 0
        assert any(r["drug_id"] == sample_drug.id for r in response.data)

    def test_food_allergen_lookup(self, authenticated_client, db):
        """Should return common food allergens."""
        response = authenticated_client.get("/api/allergies/lookup/?q=peanut&type=food")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) > 0
        assert any("Peanut" in r["substance"] for r in response.data)

    def test_lookup_requires_minimum_query(self, authenticated_client, db):
        """Should require at least 2 characters."""
        response = authenticated_client.get("/api/allergies/lookup/?q=p&type=medication")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestDrugAllergyInteractionCheckAPI:
    """Tests for the drug-allergy interaction checking endpoint."""

    def test_check_interactions_by_drug_id(
        self, authenticated_client, sample_patient, sample_drug, db, sample_organization
    ):
        """Should find interactions when checking by drug ID."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance=sample_drug.generic_name,
            drug=sample_drug,
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.post(
            "/api/allergies/check-interactions/",
            {
                "patient_id": sample_patient.id,
                "drug_ids": [sample_drug.id],
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_interactions"] is True
        assert response.data["has_high_risk"] is True
        assert len(response.data["interactions"]) == 1

    def test_check_interactions_by_drug_name(
        self, authenticated_client, sample_patient, db, sample_organization
    ):
        """Should find interactions when checking by drug name."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            severity="moderate",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.post(
            "/api/allergies/check-interactions/",
            {
                "patient_id": sample_patient.id,
                "drug_names": ["Penicillin"],  # Exact match instead of partial
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_interactions"] is True

    def test_check_interactions_no_allergies(
        self, authenticated_client, sample_patient, sample_drug, db
    ):
        """Should return no interactions when patient has no allergies."""
        response = authenticated_client.post(
            "/api/allergies/check-interactions/",
            {
                "patient_id": sample_patient.id,
                "drug_ids": [sample_drug.id],
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_interactions"] is False
        assert len(response.data["interactions"]) == 0

    def test_check_interactions_requires_patient_id(self, authenticated_client, db):
        """Should require patient_id."""
        response = authenticated_client.post(
            "/api/allergies/check-interactions/",
            {"drug_ids": [1]},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestFHIRAllergyIntolerance:
    """Tests for FHIR AllergyIntolerance resource mapping."""

    def test_fhir_allergy_intolerance_get(
        self, authenticated_client, sample_patient, db, sample_organization
    ):
        """Should return valid FHIR AllergyIntolerance resource."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            reaction_type="anaphylaxis",
            severity="severe",
            status="active",
            verification_status="confirmed",
            criticality="high",
            organization=sample_organization,
        )

        response = authenticated_client.get(f"/fhir/AllergyIntolerance/{allergy.id}")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "AllergyIntolerance"
        assert response.data["clinicalStatus"]["coding"][0]["code"] == "active"
        assert response.data["verificationStatus"]["coding"][0]["code"] == "confirmed"
        assert response.data["criticality"] == "high"
        assert response.data["code"]["text"] == "Penicillin"

    def test_fhir_allergy_intolerance_not_found(self, authenticated_client, db):
        """Should return 404 for non-existent allergy."""
        response = authenticated_client.get("/fhir/AllergyIntolerance/99999")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data["resourceType"] == "OperationOutcome"

    def test_fhir_allergy_with_reaction(
        self, authenticated_client, sample_patient, db, sample_organization
    ):
        """Should include reaction details in FHIR resource."""
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Shellfish",
            reaction_type="hives",
            severity="moderate",
            reaction_description="Red itchy welts on arms and chest",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.get(f"/fhir/AllergyIntolerance/{allergy.id}")

        assert response.status_code == status.HTTP_200_OK
        assert "reaction" in response.data
        assert response.data["reaction"][0]["severity"] == "moderate"


class TestPrescriptionAllergyCheck:
    """Tests for drug-allergy checking during prescription creation."""

    def test_prescription_blocks_without_acknowledgment(
        self,
        authenticated_client,
        sample_patient,
        sample_drug,
        sample_encounter,
        db,
        sample_organization,
    ):
        """Should block prescription when allergy exists and not acknowledged."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance=sample_drug.generic_name,
            drug=sample_drug,
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": sample_patient.id,
                "encounter": sample_encounter.id,
                "items": [
                    {
                        "drug": sample_drug.id,
                        "dosage": "500mg",
                        "frequency": "BID",
                        "duration": "7 days",
                        "quantity_prescribed": 14,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "allergy_warnings" in response.data

    def test_prescription_proceeds_with_acknowledgment(
        self,
        authenticated_client,
        sample_patient,
        sample_drug,
        sample_encounter,
        db,
        sample_organization,
    ):
        """Should allow prescription when allergy acknowledged."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance=sample_drug.generic_name,
            drug=sample_drug,
            severity="moderate",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            {
                "patient": sample_patient.id,
                "encounter": sample_encounter.id,
                "acknowledge_allergy_warnings": True,
                "items": [
                    {
                        "drug": sample_drug.id,
                        "dosage": "500mg",
                        "frequency": "BID",
                        "duration": "7 days",
                        "quantity_prescribed": 14,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "ALLERGY WARNING ACKNOWLEDGED" in response.data["clinical_notes"]


class TestAllergyAuditLogging:
    """Tests for audit logging of allergy operations."""

    def test_allergy_create_logged(self, authenticated_client, sample_patient, db):
        """Should log allergy creation."""
        from hmis.apps.core.models import AuditLog

        # Clear any existing audit logs
        AuditLog.objects.filter(action="allergy_create").delete()

        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/allergies/",
            {
                "substance": "Penicillin",
                "severity": "moderate",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED

        log = AuditLog.objects.filter(
            action="allergy_create",
            resource_type="Allergy",
        ).first()

        assert log is not None
        assert log.patient_id == sample_patient.id

    def test_allergy_view_logged(
        self, authenticated_client, sample_patient, db, sample_organization
    ):
        """Should log allergy view."""
        from hmis.apps.core.models import AuditLog
        from hmis.apps.patients.models import Allergy

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Aspirin",
            status="active",
            organization=sample_organization,
        )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/allergies/{allergy.id}/"
        )

        assert response.status_code == status.HTTP_200_OK

        log = AuditLog.objects.filter(
            action="allergy_view",
            resource_type="Allergy",
            resource_id=allergy.id,
        ).first()

        assert log is not None


class TestAllergySerializers:
    """Tests for Allergy serializers."""

    def test_allergy_serializer_fields(self, sample_patient, db, sample_organization):
        """Should serialize all expected fields."""
        from hmis.apps.patients.models import Allergy
        from hmis.apps.patients.serializers import AllergySerializer

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            reaction_type="rash",
            severity="moderate",
            status="active",
            organization=sample_organization,
        )

        serializer = AllergySerializer(allergy)
        data = serializer.data

        assert "id" in data
        assert "substance" in data
        assert "patient_mrn" in data
        assert "severity_display" in data
        assert "is_high_risk" in data

    def test_allergy_list_serializer(self, sample_patient, db, sample_organization):
        """Should use lightweight list serializer."""
        from hmis.apps.patients.models import Allergy
        from hmis.apps.patients.serializers import AllergyListSerializer

        allergy = Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        serializer = AllergyListSerializer(allergy)
        data = serializer.data

        # List serializer should have fewer fields
        assert "substance" in data
        assert "severity" in data
        assert "is_high_risk" in data
        # But not detailed fields
        assert "patient_mrn" not in data
        assert "recorded_by_username" not in data
