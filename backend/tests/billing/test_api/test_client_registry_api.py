"""API tests for SHA Client Registry endpoints.

Focus: ensure our Django API contract matches the web-app expectations.
"""

import pytest  # type: ignore
from rest_framework import status


@pytest.mark.django_db
class TestClientRegistryUpdateAPI:
    def test_update_requires_client_number(self, authenticated_client):
        response = authenticated_client.put(
            "/api/billing/client-registry/update/",
            data={"phone_number": "0712345678"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "client_number" in (response.data.get("error") or "")

    def test_update_requires_at_least_one_field(self, authenticated_client):
        response = authenticated_client.put(
            "/api/billing/client-registry/update/",
            data={"client_number": "CR000000000-1"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "At least one field" in (response.data.get("error") or "")

    def test_update_calls_service(self, authenticated_client, mocker):
        mock_service_cls = mocker.patch(
            "hmis.apps.billing.sha_views.ClientRegistryService",
            autospec=True,
        )

        mock_client = mocker.Mock(
            client_number="CR000000000-1",
            first_name="Jane",
            last_name="Doe",
            phone_number="0700000000",
            email="jane@example.com",
            county_of_residence=None,
            sub_county_of_residence=None,
        )
        mock_service_cls.return_value.update_client.return_value = mock_client

        response = authenticated_client.put(
            "/api/billing/client-registry/update/",
            data={
                "client_number": "CR000000000-1",
                "phone_number": "0700000000",
                "email": "jane@example.com",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data.get("success") is True
        assert response.data.get("client", {}).get("client_number") == "CR000000000-1"

        mock_service_cls.return_value.update_client.assert_called_once_with(
            client_number="CR000000000-1",
            phone_number="0700000000",
            email="jane@example.com",
        )
