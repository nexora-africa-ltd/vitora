"""
Tests for surveillance seed endpoints and outbreak threshold CRUD.

Covers:
- NotifiableDiseaseViewSet.seed action
- OutbreakThresholdViewSet.seed action
- OutbreakThreshold create/update/delete via API
- Duplicate national threshold prevention (unique constraint)
"""

import pytest  # type: ignore
from rest_framework import status

# ============================================================================
# Helpers
# ============================================================================


@pytest.fixture
def admin_client(api_client, db, sample_organization, sample_facility):
    """Create an admin (is_staff=True) user and return authenticated client."""
    from django.contrib.auth import get_user_model

    from tests.conftest import ensure_staff_profile

    User = get_user_model()
    user = User.objects.create_user(
        username="seedadmin",
        email="seedadmin@example.com",
        password="testpassword123",
        is_staff=True,
    )
    ensure_staff_profile(user, sample_organization, sample_facility)
    api_client.force_authenticate(user=user)
    return api_client


def _make_disease(db, name="Cholera", icd10_codes="A00", category="IMMEDIATE"):
    from hmis.apps.surveillance.models import NotifiableDisease

    return NotifiableDisease.objects.create(
        name=name,
        icd10_codes=icd10_codes,
        category=category,
        reporting_hours=24,
    )


# ============================================================================
# Disease Seed API Tests
# ============================================================================


class TestDiseaseSeedAPI:
    """Tests for POST /api/surveillance/diseases/seed/."""

    def test_seed_requires_admin(self, api_client, authenticated_client):
        """Non-admin user should get 403."""
        response = authenticated_client.post("/api/surveillance/diseases/seed/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_seed_requires_auth(self, api_client):
        """Unauthenticated user should get 401."""
        response = api_client.post("/api/surveillance/diseases/seed/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_seed_creates_diseases(self, admin_client):
        """Should seed all MOH 502 diseases from JSON file."""
        response = admin_client.post("/api/surveillance/diseases/seed/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] > 0
        assert response.data["total"] == response.data["created"]

    def test_seed_returns_409_when_diseases_exist(self, admin_client, db):
        """Should return 409 if diseases already seeded."""
        _make_disease(db)

        response = admin_client.post("/api/surveillance/diseases/seed/")

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exist" in response.data["detail"]

    def test_seed_is_idempotent_check(self, admin_client):
        """Calling seed twice should fail on second call (409)."""
        first = admin_client.post("/api/surveillance/diseases/seed/")
        assert first.status_code == status.HTTP_200_OK

        second = admin_client.post("/api/surveillance/diseases/seed/")
        assert second.status_code == status.HTTP_409_CONFLICT


# ============================================================================
# Threshold Seed API Tests
# ============================================================================


class TestThresholdSeedAPI:
    """Tests for POST /api/surveillance/thresholds/seed/."""

    def test_seed_requires_admin(self, authenticated_client):
        """Non-admin user should get 403."""
        response = authenticated_client.post("/api/surveillance/thresholds/seed/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_seed_requires_diseases_first(self, admin_client):
        """Should return 400 if no diseases exist."""
        response = admin_client.post("/api/surveillance/thresholds/seed/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "diseases" in response.data["detail"].lower()

    def test_seed_creates_thresholds(self, admin_client):
        """Should seed thresholds after diseases are seeded."""
        # Seed diseases first
        admin_client.post("/api/surveillance/diseases/seed/")

        response = admin_client.post("/api/surveillance/thresholds/seed/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] > 0
        assert response.data["total"] == response.data["created"]

    def test_seed_returns_409_when_thresholds_exist(self, admin_client):
        """Should return 409 if thresholds already seeded."""
        admin_client.post("/api/surveillance/diseases/seed/")
        admin_client.post("/api/surveillance/thresholds/seed/")

        response = admin_client.post("/api/surveillance/thresholds/seed/")

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exist" in response.data["detail"]

    def test_seeded_thresholds_are_national(self, admin_client):
        """All seeded thresholds should have county=null (national level)."""
        from hmis.apps.surveillance.models import OutbreakThreshold

        admin_client.post("/api/surveillance/diseases/seed/")
        admin_client.post("/api/surveillance/thresholds/seed/")

        assert (
            OutbreakThreshold.objects.filter(county__isnull=True).count()
            == OutbreakThreshold.objects.count()
        )


# ============================================================================
# Threshold CRUD API Tests
# ============================================================================


class TestThresholdCRUDAPI:
    """Tests for OutbreakThreshold create/update/delete via API."""

    @pytest.fixture
    def disease(self, db):
        return _make_disease(db)

    @pytest.fixture
    def another_disease(self, db):
        return _make_disease(db, name="Measles", icd10_codes="B05", category="WEEKLY")

    def test_create_threshold(self, admin_client, disease):
        """Should create a threshold for a disease."""
        data = {
            "disease": disease.id,
            "case_threshold": 5,
            "period_days": 7,
            "is_active": True,
        }

        response = admin_client.post("/api/surveillance/thresholds/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["disease"] == disease.id
        assert response.data["case_threshold"] == 5
        assert response.data["period_days"] == 7

    def test_create_threshold_requires_admin(self, authenticated_client, disease):
        """Non-admin user should get 403."""
        data = {"disease": disease.id, "case_threshold": 5, "period_days": 7}

        response = authenticated_client.post("/api/surveillance/thresholds/", data)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_threshold(self, admin_client, disease):
        """Should update case_threshold and period_days."""
        create_resp = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "case_threshold": 5, "period_days": 7},
        )
        threshold_id = create_resp.data["id"]

        response = admin_client.patch(
            f"/api/surveillance/thresholds/{threshold_id}/",
            {"case_threshold": 10, "period_days": 14},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["case_threshold"] == 10
        assert response.data["period_days"] == 14

    def test_delete_threshold(self, admin_client, disease):
        """Should delete a threshold."""
        from hmis.apps.surveillance.models import OutbreakThreshold

        create_resp = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "case_threshold": 5, "period_days": 7},
        )
        threshold_id = create_resp.data["id"]

        response = admin_client.delete(f"/api/surveillance/thresholds/{threshold_id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not OutbreakThreshold.objects.filter(id=threshold_id).exists()

    def test_create_county_threshold(self, admin_client, disease):
        """Should create a county-level threshold."""
        from hmis.apps.core.models import County

        county = County.objects.create(code=47, name="Nairobi")
        data = {
            "disease": disease.id,
            "county": county.id,
            "case_threshold": 3,
            "period_days": 7,
        }

        response = admin_client.post("/api/surveillance/thresholds/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["county"] == county.id
        assert response.data["county_name"] == "Nairobi"

    def test_same_disease_different_counties_allowed(self, admin_client, disease):
        """Should allow thresholds for same disease in different counties."""
        from hmis.apps.core.models import County

        county_a = County.objects.create(code=44, name="Meru")
        county_b = County.objects.create(code=45, name="Tharaka-Nithi")

        resp_a = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "county": county_a.id, "case_threshold": 3, "period_days": 7},
        )
        resp_b = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "county": county_b.id, "case_threshold": 5, "period_days": 7},
        )

        assert resp_a.status_code == status.HTTP_201_CREATED
        assert resp_b.status_code == status.HTTP_201_CREATED


# ============================================================================
# Duplicate National Threshold Prevention
# ============================================================================


class TestDuplicateNationalThresholdPrevention:
    """Tests that only one national threshold per disease is allowed."""

    @pytest.fixture
    def disease(self, db):
        return _make_disease(db)

    def test_duplicate_national_threshold_rejected_by_serializer(self, admin_client, disease):
        """Creating two national thresholds for the same disease should fail."""
        data = {"disease": disease.id, "case_threshold": 5, "period_days": 7}

        first = admin_client.post("/api/surveillance/thresholds/", data)
        assert first.status_code == status.HTTP_201_CREATED

        second = admin_client.post("/api/surveillance/thresholds/", data)
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert "already exists" in str(second.data).lower()

    def test_duplicate_county_threshold_rejected(self, admin_client, disease):
        """Creating two thresholds for the same disease+county should fail."""
        from hmis.apps.core.models import County

        county = County.objects.create(code=47, name="Nairobi")
        data = {
            "disease": disease.id,
            "county": county.id,
            "case_threshold": 3,
            "period_days": 7,
        }

        first = admin_client.post("/api/surveillance/thresholds/", data)
        assert first.status_code == status.HTTP_201_CREATED

        second = admin_client.post("/api/surveillance/thresholds/", data)
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert "unique" in str(second.data).lower()

    def test_update_same_threshold_allowed(self, admin_client, disease):
        """Updating an existing threshold should not trigger duplicate error."""
        create_resp = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "case_threshold": 5, "period_days": 7},
        )
        threshold_id = create_resp.data["id"]

        update_resp = admin_client.patch(
            f"/api/surveillance/thresholds/{threshold_id}/",
            {"case_threshold": 10},
        )

        assert update_resp.status_code == status.HTTP_200_OK
        assert update_resp.data["case_threshold"] == 10

    def test_national_and_county_for_same_disease_allowed(self, admin_client, disease):
        """A national + county threshold for the same disease is allowed."""
        from hmis.apps.core.models import County

        county = County.objects.create(code=47, name="Nairobi")

        national = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "case_threshold": 5, "period_days": 7},
        )
        county_resp = admin_client.post(
            "/api/surveillance/thresholds/",
            {"disease": disease.id, "county": county.id, "case_threshold": 3, "period_days": 7},
        )

        assert national.status_code == status.HTTP_201_CREATED
        assert county_resp.status_code == status.HTTP_201_CREATED

    def test_db_constraint_prevents_duplicate_national(self, db):
        """Database partial unique index should reject duplicate national thresholds."""
        from django.db import IntegrityError

        from hmis.apps.surveillance.models import OutbreakThreshold

        disease = _make_disease(db)
        OutbreakThreshold.objects.create(
            disease=disease, county=None, case_threshold=5, period_days=7
        )

        with pytest.raises(IntegrityError):
            OutbreakThreshold.objects.create(
                disease=disease, county=None, case_threshold=10, period_days=14
            )
