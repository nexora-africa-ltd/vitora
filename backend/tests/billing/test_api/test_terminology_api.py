import pytest
from rest_framework import status


@pytest.mark.django_db
class TestTerminologyICD11FallbackAPI:
    def test_icd11_search_falls_back_to_local_database_when_remote_and_container_fail(
        self,
        authenticated_client,
        mocker,
    ):
        from hmis.apps.billing.models import ICD11CodeReference
        from hmis.apps.billing.services.terminology import TerminologyError

        ICD11CodeReference.objects.create(
            code="1A00",
            title="Cholera",
            chapter="1",
            chapter_no="1",
            class_kind="category",
            is_leaf=True,
            is_residual=False,
            is_active=True,
        )

        mocker.patch(
            "hmis.apps.billing.sha_views.TerminologyService.search_icd11",
            side_effect=TerminologyError("DHA down", terminology_type="ICD11"),
        )
        mocker.patch(
            "hmis.apps.billing.sha_views.ICD11LocalService.is_available",
            return_value=False,
        )

        response = authenticated_client.get("/api/sha/terminology/icd11/?search=cholera&limit=10")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "local_icd11_database"
        assert response.data["fallback"] is True
        assert response.data["count"] == 1
        assert response.data["results"][0]["code"] == "1A00"
        assert response.data["results"][0]["title"] == "Cholera"
