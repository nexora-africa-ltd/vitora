"""
Tests for Prescription dispensing_type and is_discharge_medication fields.

Test Coverage:
- dispensing_type field (INTERNAL/EXTERNAL) defaults and choices
- is_discharge_medication field defaults
- Serializer exposure of new fields
- API filtering by admission, dispensing_type, is_discharge_medication
- Pharmacy clearance skips EXTERNAL prescriptions
- Marking prescriptions as discharge medications via PATCH
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.pharmacy.models import Prescription
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.fixture
def rx_user(db):
    return User.objects.create_user(username="rx_user", password="testpass123")


@pytest.fixture
def rx_client(rx_user, sample_organization, sample_facility):
    client = APIClient()
    ensure_staff_profile(rx_user, sample_organization, sample_facility)
    client.force_authenticate(user=rx_user)
    return client


# =============================================================================
# Model-level tests
# =============================================================================


class TestPrescriptionDispensingTypeModel:
    """Tests for Prescription.dispensing_type and is_discharge_medication fields."""

    def test_dispensing_type_defaults_to_internal(self, sample_prescription):
        """New prescriptions should default to INTERNAL dispensing type."""
        assert sample_prescription.dispensing_type == "INTERNAL"

    def test_is_discharge_medication_defaults_to_false(self, sample_prescription):
        """New prescriptions should default to not being discharge medications."""
        assert sample_prescription.is_discharge_medication is False

    def test_can_set_dispensing_type_external(self, sample_prescription):
        """Should be able to set dispensing type to EXTERNAL."""
        sample_prescription.dispensing_type = "EXTERNAL"
        sample_prescription.save()
        sample_prescription.refresh_from_db()
        assert sample_prescription.dispensing_type == "EXTERNAL"

    def test_can_mark_as_discharge_medication(self, sample_prescription):
        """Should be able to mark a prescription as a discharge medication."""
        sample_prescription.is_discharge_medication = True
        sample_prescription.save()
        sample_prescription.refresh_from_db()
        assert sample_prescription.is_discharge_medication is True

    def test_dispensing_type_choices(self):
        """DispensingType enum should have INTERNAL and EXTERNAL."""
        assert Prescription.DispensingType.INTERNAL == "INTERNAL"
        assert Prescription.DispensingType.EXTERNAL == "EXTERNAL"


# =============================================================================
# Serializer / API tests
# =============================================================================


class TestPrescriptionDispensingTypeAPI:
    """Tests for dispensing_type and is_discharge_medication in the API."""

    def test_get_prescription_includes_new_fields(self, rx_client, sample_prescription):
        """GET should include dispensing_type and is_discharge_medication."""
        response = rx_client.get(f"/api/pharmacy/prescriptions/{sample_prescription.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["dispensing_type"] == "INTERNAL"
        assert response.data["is_discharge_medication"] is False

    def test_create_prescription_with_external_type(self, rx_client, sample_patient, sample_encounter):
        """Should be able to create a prescription with EXTERNAL dispensing type."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.first()
        if not drug:
            pytest.skip("No drugs loaded in test DB")

        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "dispensing_type": "EXTERNAL",
            "is_discharge_medication": True,
            "clinical_notes": "Take-home medication",
            "items": [
                {
                    "drug": drug.id,
                    "quantity": 10,
                    "dosage": "500mg",
                    "frequency": "TDS",
                    "duration": "5 days",
                }
            ],
        }
        response = rx_client.post("/api/pharmacy/prescriptions/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["dispensing_type"] == "EXTERNAL"
        assert response.data["is_discharge_medication"] is True

    def test_patch_to_mark_as_discharge_medication(self, rx_client, sample_prescription):
        """PATCH should allow marking an existing prescription as discharge medication."""
        response = rx_client.patch(
            f"/api/pharmacy/prescriptions/{sample_prescription.id}/",
            {"is_discharge_medication": True, "dispensing_type": "EXTERNAL"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_discharge_medication"] is True
        assert response.data["dispensing_type"] == "EXTERNAL"

    def test_filter_by_admission(self, rx_client, sample_admission, sample_patient, rx_user, sample_facility, sample_organization):
        """Should be able to filter prescriptions by admission."""
        rx = Prescription.objects.create(
            patient=sample_patient,
            admission=sample_admission,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )
        # Create another prescription without admission
        Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )
        response = rx_client.get(f"/api/pharmacy/prescriptions/?admission={sample_admission.id}")
        assert response.status_code == status.HTTP_200_OK
        ids = [r["id"] for r in response.data["results"]]
        assert rx.id in ids

    def test_filter_by_dispensing_type(self, rx_client, sample_patient, rx_user, sample_facility, sample_organization):
        """Should filter prescriptions by dispensing_type."""
        internal = Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            dispensing_type="INTERNAL",
            facility=sample_facility,
            organization=sample_organization,
        )
        external = Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            dispensing_type="EXTERNAL",
            facility=sample_facility,
            organization=sample_organization,
        )
        response = rx_client.get("/api/pharmacy/prescriptions/?dispensing_type=EXTERNAL")
        assert response.status_code == status.HTTP_200_OK
        ids = [r["id"] for r in response.data["results"]]
        assert external.id in ids
        assert internal.id not in ids

    def test_filter_by_is_discharge_medication(self, rx_client, sample_patient, rx_user, sample_facility, sample_organization):
        """Should filter prescriptions by is_discharge_medication."""
        regular = Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            is_discharge_medication=False,
            facility=sample_facility,
            organization=sample_organization,
        )
        discharge = Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            is_discharge_medication=True,
            facility=sample_facility,
            organization=sample_organization,
        )
        response = rx_client.get("/api/pharmacy/prescriptions/?is_discharge_medication=true")
        assert response.status_code == status.HTTP_200_OK
        ids = [r["id"] for r in response.data["results"]]
        assert discharge.id in ids
        assert regular.id not in ids


# =============================================================================
# Clearance logic tests
# =============================================================================


class TestPharmacyClearanceWithDispensingType:
    """Tests that pharmacy clearance skips EXTERNAL prescriptions."""

    def test_external_pending_rx_does_not_block_clearance(
        self, rx_client, sample_admission, sample_patient, rx_user
    ):
        """EXTERNAL prescriptions that are PENDING should NOT block discharge clearance."""
        # Create an EXTERNAL pending prescription
        Prescription.objects.create(
            patient=sample_patient,
            admission=sample_admission,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            dispensing_type="EXTERNAL",
            is_discharge_medication=True,
        )
        response = rx_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/clearance-status/"
        )
        assert response.status_code == status.HTTP_200_OK
        pharmacy = response.data["pharmacy"]
        assert pharmacy["cleared"] is True

    def test_internal_pending_rx_blocks_clearance(
        self, rx_client, sample_admission, sample_patient, rx_user
    ):
        """INTERNAL prescriptions that are PENDING should block discharge clearance."""
        Prescription.objects.create(
            patient=sample_patient,
            admission=sample_admission,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            dispensing_type="INTERNAL",
        )
        response = rx_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/clearance-status/"
        )
        assert response.status_code == status.HTTP_200_OK
        pharmacy = response.data["pharmacy"]
        assert pharmacy["cleared"] is False
        assert "internal" in pharmacy["reason"].lower()

    def test_mixed_internal_external_only_internal_blocks(
        self, rx_client, sample_admission, sample_patient, rx_user
    ):
        """Only INTERNAL pending prescriptions should block clearance."""
        # EXTERNAL pending - should NOT block
        Prescription.objects.create(
            patient=sample_patient,
            admission=sample_admission,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            dispensing_type="EXTERNAL",
        )
        # INTERNAL dispensed - should NOT block
        Prescription.objects.create(
            patient=sample_patient,
            admission=sample_admission,
            prescribed_by=rx_user,
            valid_until=date.today() + timedelta(days=30),
            status="DISPENSED",
            dispensing_type="INTERNAL",
        )
        response = rx_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/clearance-status/"
        )
        assert response.status_code == status.HTTP_200_OK
        pharmacy = response.data["pharmacy"]
        assert pharmacy["cleared"] is True
