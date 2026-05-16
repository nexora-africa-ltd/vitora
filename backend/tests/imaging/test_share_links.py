"""
Tests for Study Share Links.

Phase E: Create, PIN-protect, expire, revoke, public access.
"""

import secrets
from datetime import timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from rest_framework import status

from hmis.apps.imaging.models import DICOMStudy, StudyShareLink


@pytest.fixture
def sample_study(db, sample_patient, test_user):
    """Create a sample DICOMStudy for sharing tests."""
    return DICOMStudy.objects.create(
        study_instance_uid="1.2.840.113619.2.5.1762583153.12345",
        patient=sample_patient,
        study_date="2026-05-10",
        modality="CT",
        study_description="CT Head",
        source="UPLOAD",
        uploaded_by=test_user,
    )


@pytest.fixture
def sample_share_link(db, sample_study, test_user):
    """Create a sample share link."""
    return StudyShareLink.objects.create(
        study=sample_study,
        token=secrets.token_urlsafe(32),
        purpose="REFERRAL",
        expires_at=timezone.now() + timedelta(hours=168),
        max_views=10,
        allow_download=True,
        created_by=test_user,
    )


class TestStudyShareLinkModel:
    """Tests for StudyShareLink model methods."""

    def test_link_is_usable_when_valid(self, sample_share_link):
        assert sample_share_link.is_usable is True

    def test_link_is_not_usable_when_expired(self, sample_share_link):
        sample_share_link.expires_at = timezone.now() - timedelta(hours=1)
        sample_share_link.save()
        assert sample_share_link.is_expired is True
        assert sample_share_link.is_usable is False

    def test_link_is_not_usable_when_revoked(self, sample_share_link):
        sample_share_link.revoke()
        assert sample_share_link.is_revoked is True
        assert sample_share_link.is_usable is False

    def test_link_is_not_usable_when_view_exhausted(self, sample_share_link):
        sample_share_link.max_views = 1
        sample_share_link.view_count = 1
        sample_share_link.save()
        assert sample_share_link.is_view_exhausted is True
        assert sample_share_link.is_usable is False

    def test_pin_check(self, sample_share_link):
        sample_share_link.pin_hash = make_password("1234")
        sample_share_link.save()
        assert sample_share_link.check_pin("1234") is True
        assert sample_share_link.check_pin("0000") is False

    def test_record_access_increments_view_count(self, sample_share_link):
        initial = sample_share_link.view_count
        sample_share_link.record_access("192.168.1.1")
        sample_share_link.refresh_from_db()
        assert sample_share_link.view_count == initial + 1
        assert sample_share_link.last_accessed_ip == "192.168.1.1"


class TestStudyShareAPI:
    """Tests for share link creation/listing/revocation via API."""

    def test_create_share_link(self, authenticated_client, sample_study, test_staff_profile):
        data = {
            "purpose": "REFERRAL",
            "expires_in_hours": 72,
            "allow_download": True,
        }
        response = authenticated_client.post(
            f"/api/imaging/studies/{sample_study.study_instance_uid}/share/",
            data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "token" in response.data
        assert "share_url" in response.data
        assert response.data["purpose"] == "REFERRAL"

    def test_create_share_link_with_pin(
        self, authenticated_client, sample_study, test_staff_profile
    ):
        data = {
            "purpose": "PATIENT_COPY",
            "pin": "5678",
            "expires_in_hours": 24,
        }
        response = authenticated_client.post(
            f"/api/imaging/studies/{sample_study.study_instance_uid}/share/",
            data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        # PIN hash stored, not raw PIN
        link = StudyShareLink.objects.get(token=response.data["token"])
        assert link.pin_hash != ""
        assert link.check_pin("5678") is True

    def test_list_share_links(
        self, authenticated_client, sample_study, sample_share_link, test_staff_profile
    ):
        response = authenticated_client.get(
            f"/api/imaging/studies/{sample_study.study_instance_uid}/share/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_revoke_share_link(
        self, authenticated_client, sample_study, sample_share_link, test_staff_profile
    ):
        response = authenticated_client.delete(
            f"/api/imaging/studies/{sample_study.study_instance_uid}/share/{sample_share_link.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        sample_share_link.refresh_from_db()
        assert sample_share_link.revoked_at is not None

    def test_create_share_link_unauthenticated(self, api_client, sample_study):
        response = api_client.post(
            f"/api/imaging/studies/{sample_study.study_instance_uid}/share/",
            {"purpose": "REFERRAL"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestPublicShareAccess:
    """Tests for public share endpoints (no auth)."""

    def test_access_valid_link(self, api_client, sample_share_link):
        response = api_client.get(f"/api/imaging/share/{sample_share_link.token}/")
        assert response.status_code == status.HTTP_200_OK
        assert "study_instance_uid" in response.data

    def test_access_expired_link_returns_410(self, api_client, sample_share_link):
        sample_share_link.expires_at = timezone.now() - timedelta(hours=1)
        sample_share_link.save()
        response = api_client.get(f"/api/imaging/share/{sample_share_link.token}/")
        assert response.status_code == status.HTTP_410_GONE

    def test_access_revoked_link_returns_410(self, api_client, sample_share_link):
        sample_share_link.revoke()
        response = api_client.get(f"/api/imaging/share/{sample_share_link.token}/")
        assert response.status_code == status.HTTP_410_GONE

    def test_access_pin_protected_without_pin_returns_401(self, api_client, sample_share_link):
        sample_share_link.pin_hash = make_password("9999")
        sample_share_link.save()
        response = api_client.get(f"/api/imaging/share/{sample_share_link.token}/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data.get("code") == "pin_required"

    def test_access_pin_protected_with_correct_pin(self, api_client, sample_share_link):
        sample_share_link.pin_hash = make_password("9999")
        sample_share_link.save()
        response = api_client.get(
            f"/api/imaging/share/{sample_share_link.token}/",
            HTTP_X_SHARE_PIN="9999",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_access_nonexistent_token_returns_404(self, api_client):
        response = api_client.get("/api/imaging/share/nonexistent_token_xyz/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_download_when_not_allowed_returns_403(self, api_client, sample_share_link):
        sample_share_link.allow_download = False
        sample_share_link.save()
        response = api_client.get(f"/api/imaging/share/{sample_share_link.token}/download/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
