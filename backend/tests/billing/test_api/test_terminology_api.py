import pytest
from django.test import override_settings
from rest_framework import status

from hmis.apps.billing.services.terminology_models import TerminologyConcept


@pytest.mark.django_db
class TestTerminologyICD11FallbackAPI:
    @override_settings(SHA_API_BASE_URL="", ICD11_USE_LOCAL=False)
    def test_icd11_search_uses_dha_clinical_concepts_without_sha_base_url(
        self,
        authenticated_client,
        mocker,
    ):
        """ICD-11 uses the approved DHA terminology source, not a generic SHA base URL."""
        search_concepts = mocker.patch(
            "hmis.apps.billing.sha_views.TerminologyService.search_concepts",
            return_value=[
                TerminologyConcept(
                    code="1A00",
                    display="Cholera",
                    owner="WHO",
                    source="ICD-11",
                    version="2026-11",
                )
            ],
        )

        response = authenticated_client.get("/api/billing/terminology/icd11/?search=cholera")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "dha_terminology_api"
        search_concepts.assert_called_once_with("icd11", "cholera", limit=50)

    def test_icd11_search_uses_dha_clinical_concepts_source(
        self,
        authenticated_client,
        mocker,
    ):
        """Diagnosis search uses the same DHA source proven by INTER-TERM-001."""
        mocker.patch(
            "hmis.apps.billing.sha_views.TerminologyService.search_concepts",
            return_value=[
                TerminologyConcept(
                    code="BA00",
                    display="Essential hypertension",
                    owner="WHO",
                    source="ICD-11",
                    version="2026-01",
                )
            ],
        )

        response = authenticated_client.get(
            "/api/sha/terminology/icd11/?search=hypertension&limit=10"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "dha_terminology_api"
        assert response.data["results"] == [
            {
                "code": "BA00",
                "title": "Essential hypertension",
                "description": "Essential hypertension",
                "is_active": True,
                "source": "dha_clinical_concepts",
                "version": "2026-01",
            }
        ]

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
            "hmis.apps.billing.sha_views.TerminologyService.search_concepts",
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
