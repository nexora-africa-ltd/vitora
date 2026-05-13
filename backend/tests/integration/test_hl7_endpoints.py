"""Tests for HL7 Endpoint CRUD and facility-scoped routing."""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.hl7.models import HL7Endpoint, HL7EndpointType, HL7Message
from hmis.apps.hl7.services.queue_service import HL7QueueService


@pytest.fixture
def endpoint_data():
    """Valid HL7 endpoint creation payload."""
    return {
        "name": "Lancet Lab",
        "endpoint_type": "LIS",
        "mllp_host": "lis.lancet.co.ke",
        "mllp_port": 2575,
        "receiving_application": "LANCET_LIS",
        "receiving_facility": "LANCET_NAIROBI",
        "sending_application": "VITORA_HMIS",
        "sending_facility": "DEMO_FACILITY",
        "lis_code_system": "LANCET",
        "is_active": True,
        "use_ssl": False,
        "timeout": 30.0,
        "max_retries": 5,
    }


@pytest.fixture
def sample_endpoint(db, sample_facility):
    """Create a sample HL7 endpoint for testing."""
    return HL7Endpoint.objects.create(
        name="PathCare Lab",
        endpoint_type=HL7EndpointType.LIS,
        mllp_host="lis.pathcare.co.ke",
        mllp_port=2575,
        receiving_application="PATHCARE_LIS",
        receiving_facility="PATHCARE",
        sending_application="VITORA_HMIS",
        sending_facility="DEMO_FACILITY",
        lis_code_system="PATHCARE",
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


class TestHL7EndpointModel:
    """Tests for the HL7Endpoint model."""

    def test_create_endpoint(self, sample_endpoint):
        """Should create endpoint with correct fields."""
        assert sample_endpoint.pk is not None
        assert sample_endpoint.name == "PathCare Lab"
        assert sample_endpoint.endpoint_type == HL7EndpointType.LIS
        assert sample_endpoint.address == "lis.pathcare.co.ke:2575"
        assert str(sample_endpoint) == "PathCare Lab (lis.pathcare.co.ke:2575)"

    def test_unique_constraint(self, db, sample_facility, sample_endpoint):
        """Should reject duplicate host:port for same facility."""
        with pytest.raises(Exception):
            HL7Endpoint.objects.create(
                name="Duplicate",
                endpoint_type=HL7EndpointType.LIS,
                mllp_host="lis.pathcare.co.ke",
                mllp_port=2575,
                facility=sample_facility,
                organization=sample_facility.organization,
            )


class TestHL7EndpointAPI:
    """Tests for HL7 Endpoint CRUD API."""

    def test_list_endpoints(self, authenticated_client, sample_endpoint, test_staff_profile):
        """Should list endpoints for the user's facility."""
        response = authenticated_client.get("/api/hl7/endpoints/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_endpoint(self, authenticated_client, endpoint_data, test_staff_profile):
        """Should create endpoint scoped to user's facility."""
        response = authenticated_client.post("/api/hl7/endpoints/", endpoint_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Lancet Lab"
        assert response.data["mllp_host"] == "lis.lancet.co.ke"

    def test_create_endpoint_without_auth_fails(self, api_client, endpoint_data):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/hl7/endpoints/", endpoint_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_endpoint_detail(self, authenticated_client, sample_endpoint, test_staff_profile):
        """Should return full endpoint detail."""
        response = authenticated_client.get(f"/api/hl7/endpoints/{sample_endpoint.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "PathCare Lab"
        assert "message_count" in response.data

    def test_update_endpoint(self, authenticated_client, sample_endpoint, test_staff_profile):
        """Should update endpoint fields."""
        response = authenticated_client.patch(
            f"/api/hl7/endpoints/{sample_endpoint.pk}/",
            {"mllp_port": 3000},
        )
        assert response.status_code == status.HTTP_200_OK
        sample_endpoint.refresh_from_db()
        assert sample_endpoint.mllp_port == 3000

    def test_delete_endpoint(self, authenticated_client, sample_endpoint, test_staff_profile):
        """Should delete endpoint."""
        response = authenticated_client.delete(f"/api/hl7/endpoints/{sample_endpoint.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not HL7Endpoint.objects.filter(pk=sample_endpoint.pk).exists()

    def test_toggle_active(self, authenticated_client, sample_endpoint, test_staff_profile):
        """Should toggle endpoint active status."""
        assert sample_endpoint.is_active is True
        response = authenticated_client.post(
            f"/api/hl7/endpoints/{sample_endpoint.pk}/toggle_active/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is False

    def test_test_connection_unreachable(
        self, authenticated_client, sample_endpoint, test_staff_profile
    ):
        """Should return success=False for unreachable host."""
        response = authenticated_client.post(
            f"/api/hl7/endpoints/{sample_endpoint.pk}/test_connection/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is False
        assert response.data["error"] != ""


class TestHL7FacilityScopedRouting:
    """Tests for facility-scoped endpoint resolution in the queue service."""

    def test_resolve_endpoint_returns_active(self, sample_endpoint, sample_facility):
        """Should resolve active endpoint for facility."""
        endpoint = HL7QueueService.resolve_endpoint(
            facility_id=sample_facility.pk,
            endpoint_type="LIS",
        )
        assert endpoint is not None
        assert endpoint.pk == sample_endpoint.pk

    def test_resolve_endpoint_skips_inactive(self, sample_endpoint, sample_facility):
        """Should skip inactive endpoints."""
        sample_endpoint.is_active = False
        sample_endpoint.save()

        endpoint = HL7QueueService.resolve_endpoint(
            facility_id=sample_facility.pk,
            endpoint_type="LIS",
        )
        assert endpoint is None

    def test_resolve_endpoint_returns_none_for_wrong_type(self, sample_endpoint, sample_facility):
        """Should return None when no matching type exists."""
        endpoint = HL7QueueService.resolve_endpoint(
            facility_id=sample_facility.pk,
            endpoint_type="RIS",
        )
        assert endpoint is None

    def test_enqueue_uses_facility_endpoint(self, sample_endpoint, sample_facility):
        """Should resolve facility endpoint when no explicit destination."""
        msg = HL7QueueService.enqueue(
            message_type="ORM^O01",
            raw_message="MSH|...",
            message_control_id="MSG001",
            facility_id=sample_facility.pk,
            endpoint_type="LIS",
        )
        assert msg.endpoint == sample_endpoint
        assert msg.destination_host == "lis.pathcare.co.ke"
        assert msg.destination_port == 2575

    def test_enqueue_explicit_destination_overrides(self, sample_endpoint, sample_facility):
        """Explicit destination should override facility endpoint."""
        msg = HL7QueueService.enqueue(
            message_type="ORM^O01",
            raw_message="MSH|...",
            message_control_id="MSG002",
            destination_host="custom.host.co.ke",
            destination_port=9000,
            facility_id=sample_facility.pk,
        )
        assert msg.endpoint is None
        assert msg.destination_host == "custom.host.co.ke"
        assert msg.destination_port == 9000

    def test_enqueue_falls_back_to_settings(self, db, settings):
        """Should fall back to global settings when no facility endpoint."""
        settings.MLLP_HOST = "global-fallback.host"
        settings.MLLP_PORT = 4000
        settings.HL7_MLLP_HOST = ""

        msg = HL7QueueService.enqueue(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="MSG003",
        )
        assert msg.endpoint is None
        assert msg.destination_host == "global-fallback.host"
        assert msg.destination_port == 4000
