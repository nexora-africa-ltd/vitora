"""
Tests for auto-creation of scheduling Resources from Clinics and Wards.

Tests:
- post_save signal auto-creates PLACE resource for new Clinic
- post_save signal auto-creates PLACE resource for new Ward
- sync_from_clinics backfill endpoint
- sync_from_wards backfill endpoint
- Idempotency (no duplicates on re-sync)
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def facility_clinic(db, sample_facility, sample_organization):
    """Create a clinic with facility for scheduling resource tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Dental Clinic",
        clinic_type="DENTAL",
        code="DNTL-001",
        status="ACTIVE",
        capacity=3,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def facility_ward(db, sample_facility, sample_organization):
    """Create an inpatient ward with facility for scheduling resource tests."""
    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="ICU Ward",
        code="ICU-01",
        ward_type="ICU",
        capacity=8,
        daily_rate=Decimal("2000.00"),
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


# =============================================================================
# Signal Auto-Creation Tests
# =============================================================================


class TestAutoCreateResourceOnClinicCreate:
    """Tests for post_save signal that auto-creates PLACE resource for Clinics."""

    def test_new_clinic_gets_place_resource(self, db, sample_facility, sample_organization):
        """Creating a clinic should auto-create a linked PLACE resource."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.scheduling.models import Resource

        clinic = Clinic.objects.create(
            name="Eye Clinic",
            clinic_type="EYE",
            code="EYE-001",
            status="ACTIVE",
            capacity=2,
            facility=sample_facility,
            organization=sample_organization,
        )
        clinic.refresh_from_db()

        assert clinic.scheduling_resource is not None
        resource = clinic.scheduling_resource
        assert resource.resource_type == "PLACE"
        assert resource.name == "Eye Clinic"
        assert resource.code == "CLINIC-EYE-001"
        assert resource.capacity == 2
        assert resource.facility == sample_facility
        assert resource.is_active is True
        assert resource.metadata.get("synced_from") == "clinic"
        assert resource.metadata.get("clinic_type") == "EYE"

    def test_clinic_without_facility_skips_resource(self, db):
        """Clinic without a facility should not auto-create a resource."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.scheduling.models import Resource

        before = Resource.objects.count()
        Clinic.objects.create(
            name="No Facility Clinic",
            clinic_type="OTHER",
            code="NFC-001",
            status="ACTIVE",
        )
        assert Resource.objects.count() == before

    def test_existing_clinic_update_does_not_create_resource(self, facility_clinic):
        """Updating an existing clinic should not create a second resource."""
        from hmis.apps.scheduling.models import Resource

        count_before = Resource.objects.count()
        facility_clinic.name = "Dental Clinic Updated"
        facility_clinic.save()
        assert Resource.objects.count() == count_before


class TestAutoCreateResourceOnWardCreate:
    """Tests for post_save signal that auto-creates PLACE resource for Wards."""

    def test_new_ward_gets_place_resource(self, db, sample_facility, sample_organization):
        """Creating a ward should auto-create a linked PLACE resource."""
        from hmis.apps.inpatient.models import Ward
        from hmis.apps.scheduling.models import Resource

        ward = Ward.objects.create(
            name="Maternity Wing",
            code="MAT-01",
            ward_type="MATERNITY",
            capacity=15,
            daily_rate=Decimal("800.00"),
            is_active=True,
            facility=sample_facility,
            organization=sample_organization,
        )
        ward.refresh_from_db()

        assert ward.scheduling_resource is not None
        resource = ward.scheduling_resource
        assert resource.resource_type == "PLACE"
        assert resource.name == "Maternity Wing"
        assert resource.code == "WARD-MAT-01"
        assert resource.capacity == 15
        assert resource.facility == sample_facility
        assert resource.is_active is True
        assert resource.metadata.get("synced_from") == "ward"
        assert resource.metadata.get("ward_type") == "MATERNITY"

    def test_ward_without_facility_skips_resource(self, db):
        """Ward without a facility should not auto-create a resource."""
        from hmis.apps.inpatient.models import Ward
        from hmis.apps.scheduling.models import Resource

        before = Resource.objects.count()
        Ward.objects.create(
            name="Orphan Ward",
            code="ORP-01",
            ward_type="MEDICAL",
            capacity=5,
            daily_rate=Decimal("300.00"),
            is_active=True,
        )
        assert Resource.objects.count() == before


# =============================================================================
# Sync Backfill Endpoint Tests
# =============================================================================


class TestSyncFromClinics:
    """Tests for POST /api/scheduling/resources/sync-from-clinics/."""

    def test_sync_creates_resources_from_clinics(self, authenticated_client, sample_facility):
        """Should create PLACE resources for clinics without one."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.scheduling.models import Resource

        # Create a clinic without triggering the signal (simulate pre-existing)
        clinic = Clinic(
            name="TB Clinic",
            clinic_type="TB",
            code="TB-001",
            status="ACTIVE",
            capacity=4,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        # Save via queryset update to skip signals
        Clinic.objects.bulk_create([clinic])

        response = authenticated_client.post("/api/scheduling/resources/sync-from-clinics/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] >= 1

        # Verify resource was created
        clinic.refresh_from_db()
        assert clinic.scheduling_resource is not None
        assert clinic.scheduling_resource.resource_type == "PLACE"
        assert clinic.scheduling_resource.code == "CLINIC-TB-001"

    def test_sync_skips_clinics_with_existing_resource(
        self, authenticated_client, facility_clinic, sample_facility
    ):
        """Should not create duplicate resources for clinics that already have one."""
        # facility_clinic auto-got a resource via signal
        facility_clinic.refresh_from_db()
        assert facility_clinic.scheduling_resource is not None

        response = authenticated_client.post("/api/scheduling/resources/sync-from-clinics/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0

    def test_sync_idempotent(self, authenticated_client, sample_facility):
        """Calling sync twice should not create duplicates."""
        from hmis.apps.clinics.models import Clinic

        Clinic.objects.bulk_create(
            [
                Clinic(
                    name="FP Clinic",
                    clinic_type="FP",
                    code="FP-001",
                    status="ACTIVE",
                    facility=sample_facility,
                    organization=sample_facility.organization,
                ),
            ]
        )

        r1 = authenticated_client.post("/api/scheduling/resources/sync-from-clinics/")
        assert r1.data["created"] >= 1

        r2 = authenticated_client.post("/api/scheduling/resources/sync-from-clinics/")
        assert r2.data["created"] == 0

    def test_sync_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/scheduling/resources/sync-from-clinics/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_sync_skips_inactive_clinics(self, authenticated_client, sample_facility):
        """Should not sync inactive clinics."""
        from hmis.apps.clinics.models import Clinic

        Clinic.objects.bulk_create(
            [
                Clinic(
                    name="Closed Clinic",
                    clinic_type="OTHER",
                    code="CLOSED-001",
                    status="INACTIVE",
                    facility=sample_facility,
                    organization=sample_facility.organization,
                ),
            ]
        )

        response = authenticated_client.post("/api/scheduling/resources/sync-from-clinics/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0


class TestSyncFromWards:
    """Tests for POST /api/scheduling/resources/sync-from-wards/."""

    def test_sync_creates_resources_from_wards(self, authenticated_client, sample_facility):
        """Should create PLACE resources for wards without one."""
        from hmis.apps.inpatient.models import Ward
        from hmis.apps.scheduling.models import Resource

        ward = Ward(
            name="Surgical Ward",
            code="SURG-01",
            ward_type="SURGICAL",
            capacity=12,
            daily_rate=Decimal("600.00"),
            is_active=True,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        Ward.objects.bulk_create([ward])

        response = authenticated_client.post("/api/scheduling/resources/sync-from-wards/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] >= 1

        ward.refresh_from_db()
        assert ward.scheduling_resource is not None
        assert ward.scheduling_resource.resource_type == "PLACE"

    def test_sync_skips_wards_with_existing_resource(self, authenticated_client, facility_ward):
        """Should not create duplicate resources."""
        # facility_ward auto-got a resource via signal
        facility_ward.refresh_from_db()
        assert facility_ward.scheduling_resource is not None

        response = authenticated_client.post("/api/scheduling/resources/sync-from-wards/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0

    def test_sync_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/scheduling/resources/sync-from-wards/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_sync_skips_inactive_wards(self, authenticated_client, sample_facility):
        """Should not sync inactive wards."""
        from hmis.apps.inpatient.models import Ward

        Ward.objects.bulk_create(
            [
                Ward(
                    name="Decommissioned Ward",
                    code="DECOM-01",
                    ward_type="MEDICAL",
                    capacity=10,
                    daily_rate=Decimal("400.00"),
                    is_active=False,
                    facility=sample_facility,
                    organization=sample_facility.organization,
                ),
            ]
        )

        response = authenticated_client.post("/api/scheduling/resources/sync-from-wards/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] == 0
