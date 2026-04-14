"""Tests for MOH Reporting API endpoints."""

from datetime import date

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.moh_reporting.models import (
    MOH705Report,
    MOH711Report,
    MOH717Report,
    MOHReportStatus,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def moh705(db, sample_facility, sample_organization):
    return MOH705Report.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        total_visits=100,
    )


@pytest.fixture
def moh711(db, sample_facility, sample_organization):
    return MOH711Report.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        deliveries_total=25,
    )


@pytest.fixture
def moh717(db, sample_facility, sample_organization):
    return MOH717Report.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        opd_total=300,
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestMOHReportAuth:
    """Unauthenticated requests must be rejected."""

    def test_moh705_requires_auth(self, api_client):
        response = api_client.get("/api/moh-reports/705/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_moh711_requires_auth(self, api_client):
        response = api_client.get("/api/moh-reports/711/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_moh717_requires_auth(self, api_client):
        response = api_client.get("/api/moh-reports/717/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# List / Retrieve
# ---------------------------------------------------------------------------


class TestMOH705API:
    def test_list(self, authenticated_client, moh705):
        response = authenticated_client.get("/api/moh-reports/705/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve(self, authenticated_client, moh705):
        response = authenticated_client.get(f"/api/moh-reports/705/{moh705.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_visits"] == 100
        assert response.data["period_label"] == "March 2026"

    def test_generate(self, authenticated_client, sample_facility):
        response = authenticated_client.post(
            "/api/moh-reports/705/generate/",
            {"year": 2026, "month": 2},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == MOHReportStatus.DRAFT

    def test_approve(self, authenticated_client, moh705):
        response = authenticated_client.post(
            f"/api/moh-reports/705/{moh705.pk}/approve/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == MOHReportStatus.APPROVED

    def test_approve_already_submitted_fails(self, authenticated_client, moh705):
        moh705.status = MOHReportStatus.SUBMITTED
        moh705.save(update_fields=["status"])
        response = authenticated_client.post(
            f"/api/moh-reports/705/{moh705.pk}/approve/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_dhis2_preview(self, authenticated_client, moh705):
        response = authenticated_client.get(f"/api/moh-reports/705/{moh705.pk}/dhis2-preview/")
        assert response.status_code == status.HTTP_200_OK
        assert "dataValues" in response.data


class TestMOH711API:
    def test_list(self, authenticated_client, moh711):
        response = authenticated_client.get("/api/moh-reports/711/")
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve(self, authenticated_client, moh711):
        response = authenticated_client.get(f"/api/moh-reports/711/{moh711.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["deliveries_total"] == 25

    def test_generate(self, authenticated_client):
        response = authenticated_client.post(
            "/api/moh-reports/711/generate/",
            {"year": 2026, "month": 2},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED


class TestMOH717API:
    def test_list(self, authenticated_client, moh717):
        response = authenticated_client.get("/api/moh-reports/717/")
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve(self, authenticated_client, moh717):
        response = authenticated_client.get(f"/api/moh-reports/717/{moh717.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["opd_total"] == 300

    def test_generate(self, authenticated_client):
        response = authenticated_client.post(
            "/api/moh-reports/717/generate/",
            {"year": 2026, "month": 2},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
