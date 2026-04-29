"""ViewSet tests for DHA HIE Middleware (ILM) registries & eligibility endpoints.

Mocks ``IlmRegistriesService`` to keep tests fast and focused on URL routing,
parameter validation, DHAError → HTTP status mapping and snapshot persistence.
"""

# ruff: noqa: F811 — pytest fixture reuse via import is intentional

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from hmis.apps.billing.models import PatientContact, SHAMember
from hmis.apps.billing.services.dha_errors import (
    DHANotFoundError,
    DHAUnauthorizedError,
    DHAValidationError,
)
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_registries_service import IlmRegistryResult
from tests.billing.test_api.test_sha_api import (  # noqa: F401
    sample_sha_member,
    sha_client,
    user_with_sha_permissions,
)

ILM_SERVICE_PATH = "hmis.apps.billing.sha_ilm_registry_views.IlmRegistriesService"


def _ok_result(payload=None, snapshot_id=None):
    return IlmRegistryResult(
        response=IlmResponse(status_code=200, headers={}, json=payload, text="", elapsed_ms=10),
        payload=payload,
        snapshot_id=snapshot_id,
    )


# ---------------------------------------------------------------------------
# Facility / Patient / Professional registry endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFacilitySearchEndpoint:
    URL = "/api/sha/ilm/registries/facility-search/"

    def test_requires_identifier(self, sha_client):
        resp = sha_client.get(self.URL)
        assert resp.status_code == 400

    def test_calls_service_with_required_params(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.search_facility.return_value = _ok_result({"officialName": "Demo"})
            resp = sha_client.get(
                self.URL,
                {"identifier": "MFL-001", "identifier_type": "mfl", "name": "Demo"},
            )
            assert resp.status_code == 200
            assert resp.data["data"]["officialName"] == "Demo"
            kw = M.return_value.search_facility.call_args.kwargs
            assert kw["identifier"] == "MFL-001"
            assert kw["identifier_type"] == "mfl"
            assert kw["name"] == "Demo"

    def test_unauthorized_returns_401(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.search_facility.side_effect = DHAUnauthorizedError(
                "no token", status_code=401
            )
            resp = sha_client.get(self.URL, {"identifier": "x", "identifier_type": "mfl"})
            assert resp.status_code == 401

    def test_not_found_returns_404(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.search_facility.side_effect = DHANotFoundError(
                "missing", status_code=404
            )
            resp = sha_client.get(self.URL, {"identifier": "x", "identifier_type": "mfl"})
            assert resp.status_code == 404


@pytest.mark.django_db
class TestPatientLookupEndpoint:
    URL = "/api/sha/ilm/registries/patient-lookup/"

    def test_requires_identifier(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_calls_service(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.lookup_patient.return_value = _ok_result({"first_name": "Jane"})
            resp = sha_client.get(
                self.URL,
                {"identification_number": "111", "identification_type": "National ID"},
            )
            assert resp.status_code == 200
            assert resp.data["data"]["first_name"] == "Jane"


@pytest.mark.django_db
class TestProfessionalSearchEndpoint:
    URL = "/api/sha/ilm/registries/professional-search/"

    def test_requires_regulator(self, sha_client):
        resp = sha_client.get(
            self.URL,
            {"identification_number": "x", "identification_type": "National ID"},
        )
        assert resp.status_code == 400

    def test_calls_service(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.search_professional.return_value = _ok_result({"message": {}})
            resp = sha_client.get(
                self.URL,
                {
                    "identification_number": "DOC-1",
                    "identification_type": "National ID",
                    "regulator": "KMPDC",
                },
            )
            assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Eligibility / Benefits endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEligibilityEndpoint:
    URL = "/api/sha/ilm/eligibility/"

    def test_requires_identifier(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_returns_payload_and_snapshot_id(self, sha_client, sample_patient):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.check_eligibility.return_value = _ok_result(
                {"memberCrNumber": "CR-1"}, snapshot_id=42
            )
            resp = sha_client.get(
                self.URL,
                {
                    "identification_number": "111",
                    "identification_type": "National ID",
                    "patient_pk": sample_patient.pk,
                },
            )
            assert resp.status_code == 200
            assert resp.data["snapshot_id"] == 42
            kw = M.return_value.check_eligibility.call_args.kwargs
            assert kw["patient"].pk == sample_patient.pk

    def test_validation_error_returns_400(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.check_eligibility.side_effect = DHAValidationError(
                "bad input", status_code=400
            )
            resp = sha_client.get(
                self.URL,
                {"identification_number": "x", "identification_type": "National ID"},
            )
            assert resp.status_code == 400


@pytest.mark.django_db
class TestBenefitsEndpoints:
    def test_benefits_requires_patient_id(self, sha_client):
        assert sha_client.get("/api/sha/ilm/benefits/").status_code == 400

    def test_benefits_propagates_optional_params(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.fetch_benefits.return_value = _ok_result({"results": []})
            resp = sha_client.get(
                "/api/sha/ilm/benefits/",
                {"patient_id": "CR-1", "is_unique_benefit": "true", "fields": "x,y"},
            )
            assert resp.status_code == 200
            kw = M.return_value.fetch_benefits.call_args.kwargs
            assert kw["is_unique_benefit"] is True
            assert kw["fields"] == "x,y"

    def test_sub_benefits(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.fetch_sub_benefits.return_value = _ok_result({"results": []})
            resp = sha_client.get("/api/sha/ilm/sub-benefits/", {"patient_id": "CR-1"})
            assert resp.status_code == 200

    def test_benefit_interventions_requires_sub_benefit(self, sha_client):
        resp = sha_client.get("/api/sha/ilm/benefit-interventions/", {"patient_id": "CR-1"})
        assert resp.status_code == 400

    def test_benefit_interventions_ok(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.fetch_benefit_interventions.return_value = _ok_result({"results": []})
            resp = sha_client.get(
                "/api/sha/ilm/benefit-interventions/",
                {"patient_id": "CR-1", "sub_benefit_code": "SB-1"},
            )
            assert resp.status_code == 200

    def test_utilization_requires_intervention(self, sha_client):
        resp = sha_client.get("/api/sha/ilm/utilization/", {"patient_id": "CR-1"})
        assert resp.status_code == 400

    def test_utilization_ok(self, sha_client):
        with patch(ILM_SERVICE_PATH) as M:
            M.return_value.fetch_utilization.return_value = _ok_result({"crId": "CR-1"})
            resp = sha_client.get(
                "/api/sha/ilm/utilization/",
                {"patient_id": "CR-1", "intervention_code": "INT-1"},
            )
            assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Patient contact CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPatientContactEndpoint:
    URL = "/api/sha/ilm/patient-contacts/"

    def test_get_requires_patient(self, sha_client):
        assert sha_client.get(self.URL).status_code == 400

    def test_post_creates_contact(self, sha_client, sample_patient):
        resp = sha_client.post(
            self.URL,
            {
                "patient_pk": sample_patient.pk,
                "contact_type": "next_of_kin",
                "full_name": "Jane Doe",
                "phone": "+254700000000",
                "relationship": "spouse",
                "is_otp_recipient": True,
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["full_name"] == "Jane Doe"
        contact = PatientContact.objects.get(pk=resp.data["id"])
        assert contact.is_otp_recipient is True
        assert contact.contact_type == "next_of_kin"

    def test_get_lists_contacts(self, sha_client, sample_patient):
        PatientContact.objects.create(
            patient=sample_patient,
            contact_type="primary",
            full_name="John",
            phone="+254700000001",
        )
        resp = sha_client.get(self.URL, {"patient_pk": sample_patient.pk})
        assert resp.status_code == 200
        assert len(resp.data["results"]) == 1
        assert resp.data["results"][0]["full_name"] == "John"
