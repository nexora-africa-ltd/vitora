from unittest.mock import patch

import pytest

from hmis.apps.billing.models import FacilityBillingConfig
from hmis.apps.billing.services.terminology_models import ICHICode


@pytest.mark.django_db
class TestTerminologySearchInterventions:
    def test_excludes_capitation_when_facility_toggle_enabled(
        self,
        authenticated_client,
        sample_facility,
    ):
        FacilityBillingConfig.objects.create(
            facility=sample_facility,
            hide_capitation_interventions=True,
        )

        with patch(
            "hmis.apps.billing.sha_views.search_local_interventions",
            return_value=([], 0),
        ) as mock_search:
            response = authenticated_client.get(
                "/api/billing/terminology/interventions/",
                {"facility_level": "2"},
                HTTP_X_FACILITY_ID=str(sample_facility.id),
            )

        assert response.status_code == 200
        assert response.data["results"] == []
        assert response.data["count"] == 0
        assert mock_search.call_args.kwargs["exclude_payment_mechanisms"] == ["CAPITATION"]

    def test_does_not_force_exclusion_when_payment_mechanism_is_explicit(
        self,
        authenticated_client,
        sample_facility,
    ):
        FacilityBillingConfig.objects.create(
            facility=sample_facility,
            hide_capitation_interventions=True,
        )

        with patch(
            "hmis.apps.billing.sha_views.search_local_interventions",
            return_value=([], 0),
        ) as mock_search:
            response = authenticated_client.get(
                "/api/billing/terminology/interventions/",
                {"facility_level": "2", "payment_mechanism": "CAPITATION"},
                HTTP_X_FACILITY_ID=str(sample_facility.id),
            )

        assert response.status_code == 200
        assert response.data["results"] == []
        assert response.data["count"] == 0
        assert mock_search.call_args.kwargs["exclude_payment_mechanisms"] == []


@pytest.mark.django_db
class TestTerminologySearchPagination:
    def test_ichi_page_size_is_forwarded_as_upstream_limit(self, authenticated_client):
        """Frontend page_size must control the DHA query limit."""
        with patch(
            "hmis.apps.billing.sha_views.TerminologyService.search_ichi",
            return_value=[ICHICode(code="PZX.DB.AC", title="Appendectomy")],
        ) as search_ichi:
            response = authenticated_client.get(
                "/api/billing/terminology/ichi/",
                {"search": "lapa", "page_size": "20"},
            )

        assert response.status_code == 200
        assert response.data["count"] == 1
        search_ichi.assert_called_once_with("lapa", limit=25)
