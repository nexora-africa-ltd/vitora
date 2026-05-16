"""
Tests for Imaging Equipment registry.

Phase E: Equipment auto-registration, CRUD, calibration tracking.
"""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.imaging.models import ImagingEquipment
from hmis.apps.imaging.services.equipment import resolve_equipment


@pytest.fixture
def sample_equipment(db, sample_facility, sample_organization):
    """Create a sample ImagingEquipment for testing."""
    return ImagingEquipment.objects.create(
        name="GE Optima CT660",
        modality="CT",
        ae_title="CT_GE_01",
        station_name="CT_ROOM1",
        manufacturer="GE Healthcare",
        model_name="Optima CT660",
        serial_number="SN-12345",
        room="Room 101",
        is_active=True,
        auto_registered=False,
        facility=sample_facility,
        organization=sample_organization,
    )


class TestImagingEquipmentModel:
    """Tests for the ImagingEquipment model."""

    def test_create_equipment(self, db, sample_facility, sample_organization):
        equip = ImagingEquipment.objects.create(
            name="Siemens MAGNETOM",
            modality="MRI",
            ae_title="MRI_SIEMENS",
            manufacturer="Siemens",
            model_name="MAGNETOM Aera",
            serial_number="SN-99999",
            facility=sample_facility,
            organization=sample_organization,
        )
        assert equip.pk is not None
        assert equip.is_active is True
        assert equip.auto_registered is False

    def test_calibration_overdue_when_past_due(self, sample_equipment):
        from datetime import timedelta

        from django.utils import timezone

        sample_equipment.next_calibration_due = timezone.now().date() - timedelta(days=1)
        sample_equipment.save()
        assert sample_equipment.is_calibration_overdue is True

    def test_calibration_not_overdue_when_future(self, sample_equipment):
        from datetime import date, timedelta

        sample_equipment.next_calibration_due = date.today() + timedelta(days=30)
        sample_equipment.save()
        assert sample_equipment.is_calibration_overdue is False

    def test_calibration_not_overdue_when_no_date(self, sample_equipment):
        sample_equipment.next_calibration_due = None
        sample_equipment.save()
        assert sample_equipment.is_calibration_overdue is False


class TestEquipmentResolution:
    """Tests for auto-resolution of equipment from DICOM tags."""

    def test_resolve_by_serial_number(self, sample_equipment, sample_facility, sample_organization):
        """Should match existing equipment by manufacturer+model+serial."""
        result = resolve_equipment(
            facility=sample_facility,
            organization=sample_organization,
            modality="CT",
            station_name="DIFFERENT_STATION",
            manufacturer="GE Healthcare",
            manufacturer_model_name="Optima CT660",
            device_serial_number="SN-12345",
        )
        assert result == sample_equipment

    def test_resolve_by_ae_title(self, sample_equipment, sample_facility, sample_organization):
        """Should match existing equipment by AE title when serial doesn't match."""
        result = resolve_equipment(
            facility=sample_facility,
            organization=sample_organization,
            modality="CT",
            station_name="SOME_STATION",
            manufacturer="Unknown",
            manufacturer_model_name="Unknown",
            device_serial_number="",
            ae_title="CT_GE_01",
        )
        assert result == sample_equipment

    def test_resolve_by_station_name(self, sample_equipment, sample_facility, sample_organization):
        """Should match existing equipment by station name as last resort."""
        result = resolve_equipment(
            facility=sample_facility,
            organization=sample_organization,
            modality="CT",
            station_name="CT_ROOM1",
            manufacturer="",
            manufacturer_model_name="",
            device_serial_number="",
        )
        assert result == sample_equipment

    def test_auto_register_new_equipment(self, db, sample_facility, sample_organization):
        """Should auto-create equipment when no match found."""
        result = resolve_equipment(
            facility=sample_facility,
            organization=sample_organization,
            modality="XR",
            station_name="XR_NEW",
            manufacturer="Fuji",
            manufacturer_model_name="FDR D-EVO II",
            device_serial_number="SN-NEW-001",
        )
        assert result is not None
        assert result.auto_registered is True
        assert "Fuji" in result.name
        assert "FDR D-EVO II" in result.name
        assert result.serial_number == "SN-NEW-001"
        assert result.facility == sample_facility

    def test_no_registration_when_no_identifiers(self, db, sample_facility, sample_organization):
        """Should NOT auto-register when all identifiers are empty."""
        result = resolve_equipment(
            facility=sample_facility,
            organization=sample_organization,
            modality="OT",
            station_name="",
            manufacturer="",
            manufacturer_model_name="",
            device_serial_number="",
        )
        assert result is None


class TestImagingEquipmentAPI:
    """Tests for the ImagingEquipment API endpoints."""

    def test_list_equipment_authenticated(
        self, authenticated_client, sample_equipment, test_staff_profile
    ):
        response = authenticated_client.get("/api/imaging/equipment/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_list_equipment_unauthenticated(self, api_client):
        response = api_client.get("/api/imaging/equipment/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_equipment(self, authenticated_client, sample_facility, test_staff_profile):
        data = {
            "name": "Philips Allura",
            "modality": "FL",
            "ae_title": "ALLURA_01",
            "room": "Cath Lab",
        }
        response = authenticated_client.post("/api/imaging/equipment/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Philips Allura"
        assert response.data["auto_registered"] is False

    def test_filter_by_modality(self, authenticated_client, sample_equipment, test_staff_profile):
        response = authenticated_client.get("/api/imaging/equipment/?modality=CT")
        assert response.status_code == status.HTTP_200_OK
        for item in response.data["results"]:
            assert item["modality"] == "CT"

    def test_search_by_name(self, authenticated_client, sample_equipment, test_staff_profile):
        response = authenticated_client.get("/api/imaging/equipment/?search=Optima")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
