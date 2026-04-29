"""Tests for ``IlmRegistriesService`` — DHA HIE pre-visit registries."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from hmis.apps.billing.models import SHACoverageSnapshot, SHAMember
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.ilm_registries_service import (
    FACILITY_SEARCH_PATH,
    PATIENT_BENEFIT_INTERVENTIONS_PATH,
    PATIENT_BENEFIT_UTILIZATION_PATH,
    PATIENT_BENEFITS_PATH,
    PATIENT_ELIGIBILITY_PATH,
    PATIENT_LOOKUP_PATH,
    PATIENT_SUB_BENEFITS_PATH,
    PROFESSIONAL_SEARCH_PATH,
    IlmRegistriesService,
)


def _resp(status=200, payload=None, headers=None):
    return IlmResponse(
        status_code=status,
        headers=headers or {},
        json=payload,
        text="",
        elapsed_ms=10,
    )


@pytest.fixture
def mock_client():
    client = MagicMock()
    client.get.return_value = _resp(200, {"ok": True})
    return client


@pytest.fixture
def service(mock_client):
    return IlmRegistriesService(client=mock_client)


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    SHAMember.objects.filter(patient=sample_patient).delete()
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-REG-0001",
        national_id="11223344",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
    )


# ---------------------------------------------------------------------------
# Registries
# ---------------------------------------------------------------------------


class TestFacilitySearch:
    def test_passes_required_params(self, service, mock_client, sample_facility):
        mock_client.get.return_value = _resp(200, {"officialName": "Demo"})
        result = service.search_facility(
            identifier="MFL-001",
            identifier_type="mfl",
            facility=sample_facility,
        )
        mock_client.get.assert_called_once()
        args, kwargs = mock_client.get.call_args
        assert args[0] == FACILITY_SEARCH_PATH
        assert kwargs["params"] == {"identifier": "MFL-001", "identifier-type": "mfl"}
        assert result.status_code == 200
        assert result.payload["officialName"] == "Demo"

    def test_includes_optional_name(self, service, mock_client):
        service.search_facility(identifier="MFL-002", identifier_type="mfl", name="Test Hospital")
        params = mock_client.get.call_args.kwargs["params"]
        assert params["name"] == "Test Hospital"


class TestPatientLookup:
    def test_passes_identification_params(self, service, mock_client):
        service.lookup_patient(identification_number="12345678", identification_type="National ID")
        args, kwargs = mock_client.get.call_args
        assert args[0] == PATIENT_LOOKUP_PATH
        assert kwargs["params"] == {
            "identification_number": "12345678",
            "identification_type": "National ID",
        }


class TestProfessionalSearch:
    def test_requires_regulator(self, service, mock_client):
        service.search_professional(
            identification_number="DOC-1",
            identification_type="National ID",
            regulator="KMPDC",
        )
        args, kwargs = mock_client.get.call_args
        assert args[0] == PROFESSIONAL_SEARCH_PATH
        assert kwargs["params"]["regulator"] == "KMPDC"


# ---------------------------------------------------------------------------
# Eligibility / Benefits — snapshot persistence
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEligibilityCheck:
    def test_persists_snapshot_with_eligibility_flag(
        self, service, mock_client, sample_patient, sha_member, sample_facility, test_user
    ):
        mock_client.get.return_value = _resp(
            200,
            {
                "memberCrNumber": "CR-9999",
                "schemes": [{"schemeName": "SHIF", "coverage": {"status": "ACTIVE"}}],
            },
            headers={"X-Correlation-Id": "abc-123"},
        )
        result = service.check_eligibility(
            identification_number="11223344",
            identification_type="National ID",
            patient=sample_patient,
            sha_member=sha_member,
            facility=sample_facility,
            user=test_user,
        )
        args, kwargs = mock_client.get.call_args
        assert args[0] == PATIENT_ELIGIBILITY_PATH

        snap = SHACoverageSnapshot.objects.get(pk=result.snapshot_id)
        assert snap.snapshot_type == SHACoverageSnapshot.SnapshotType.ELIGIBILITY
        assert snap.is_eligible is True
        assert snap.member_cr_number == "CR-9999"
        assert snap.correlation_id == "abc-123"
        assert snap.payload["schemes"][0]["coverage"]["status"] == "ACTIVE"

    def test_inactive_coverage_marks_ineligible(
        self, service, mock_client, sample_patient, sample_facility, test_user
    ):
        mock_client.get.return_value = _resp(
            200, {"schemes": [{"coverage": {"status": "EXPIRED"}}]}
        )
        result = service.check_eligibility(
            identification_number="x",
            identification_type="National ID",
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        snap = SHACoverageSnapshot.objects.get(pk=result.snapshot_id)
        assert snap.is_eligible is False

    def test_skips_snapshot_without_patient(self, service, mock_client):
        result = service.check_eligibility(
            identification_number="x", identification_type="National ID"
        )
        assert result.snapshot_id is None


@pytest.mark.django_db
class TestBenefits:
    def test_fetch_benefits_persists_snapshot(
        self, service, mock_client, sample_patient, sample_facility, test_user
    ):
        mock_client.get.return_value = _resp(200, {"results": [{"parentBenefit": "Outpatient"}]})
        result = service.fetch_benefits(
            patient_id="CR-9999",
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        args, kwargs = mock_client.get.call_args
        assert args[0] == PATIENT_BENEFITS_PATH
        assert kwargs["params"]["patient_id"] == "CR-9999"
        snap = SHACoverageSnapshot.objects.get(pk=result.snapshot_id)
        assert snap.snapshot_type == SHACoverageSnapshot.SnapshotType.BENEFITS

    def test_fetch_sub_benefits_persists(
        self, service, mock_client, sample_patient, sample_facility, test_user
    ):
        result = service.fetch_sub_benefits(
            patient_id="CR-1",
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        assert mock_client.get.call_args.args[0] == PATIENT_SUB_BENEFITS_PATH
        snap = SHACoverageSnapshot.objects.get(pk=result.snapshot_id)
        assert snap.snapshot_type == SHACoverageSnapshot.SnapshotType.SUB_BENEFITS

    def test_fetch_benefit_interventions_records_sub_benefit(
        self, service, mock_client, sample_patient, sample_facility, test_user
    ):
        result = service.fetch_benefit_interventions(
            patient_id="CR-1",
            sub_benefit_code="SB-100",
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        assert mock_client.get.call_args.args[0] == PATIENT_BENEFIT_INTERVENTIONS_PATH
        snap = SHACoverageSnapshot.objects.get(pk=result.snapshot_id)
        assert snap.snapshot_type == SHACoverageSnapshot.SnapshotType.BENEFITS_INTERVENTIONS
        assert snap.sub_benefit_code == "SB-100"

    def test_fetch_utilization_records_intervention(
        self, service, mock_client, sample_patient, sample_facility, test_user
    ):
        result = service.fetch_utilization(
            patient_id="CR-1",
            intervention_code="INT-500",
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        assert mock_client.get.call_args.args[0] == PATIENT_BENEFIT_UTILIZATION_PATH
        snap = SHACoverageSnapshot.objects.get(pk=result.snapshot_id)
        assert snap.snapshot_type == SHACoverageSnapshot.SnapshotType.UTILIZATION
        assert snap.intervention_code == "INT-500"


@pytest.mark.django_db
class TestBenefitsOptionalParams:
    def test_unique_benefit_flag_serialised_as_string(
        self, service, mock_client, sample_patient, sample_facility, test_user
    ):
        service.fetch_benefits(
            patient_id="CR-1",
            is_unique_benefit=True,
            fields="parent_benefit,parent_benefit_code",
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
        )
        params = mock_client.get.call_args.kwargs["params"]
        assert params["is_unique_benefit"] == "true"
        assert params["fields"] == "parent_benefit,parent_benefit_code"
