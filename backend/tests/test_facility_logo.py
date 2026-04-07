"""
Tests for Facility logo field and effective_logo fallback behaviour.

Covers:
- Model: logo field, effective_logo property (own logo, org fallback, none)
- Serializer: effective_logo_url in API response
- API: upload logo via multipart PATCH, remove logo via PATCH null
"""

import io

import pytest  # type: ignore
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status


def _create_test_image(name: str = "test_logo.png", size: tuple = (100, 100)) -> SimpleUploadedFile:
    """Create a minimal in-memory PNG file for upload tests."""
    img = Image.new("RGB", size, color="blue")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


# ============================================================================
# Model Tests
# ============================================================================


class TestFacilityLogoModel:
    """Test the Facility.logo field and effective_logo property."""

    def test_logo_field_defaults_to_none(self, sample_facility):
        """Logo should be blank/falsy by default."""
        assert not sample_facility.logo

    def test_effective_logo_returns_own_logo(self, sample_facility):
        """When facility has its own logo, effective_logo returns it."""
        sample_facility.logo = _create_test_image("facility_logo.png")
        sample_facility.save()

        assert sample_facility.effective_logo is not None
        assert "facility_logo" in sample_facility.effective_logo.name

    def test_effective_logo_falls_back_to_organization(self, sample_facility, sample_organization):
        """When facility has no logo, effective_logo falls back to org logo."""
        assert not sample_facility.logo

        sample_organization.logo = _create_test_image("org_logo.png")
        sample_organization.save()
        sample_facility.refresh_from_db()

        effective = sample_facility.effective_logo
        assert effective is not None
        assert "org_logo" in effective.name

    def test_effective_logo_returns_none_when_no_logos(self, sample_facility, sample_organization):
        """When neither facility nor org has a logo, effective_logo returns None."""
        assert not sample_facility.logo
        assert not sample_organization.logo

        assert sample_facility.effective_logo is None

    def test_own_logo_takes_precedence_over_org(self, sample_facility, sample_organization):
        """Facility's own logo should take precedence over org logo."""
        sample_organization.logo = _create_test_image("org_logo.png")
        sample_organization.save()

        sample_facility.logo = _create_test_image("facility_logo.png")
        sample_facility.save()

        effective = sample_facility.effective_logo
        assert "facility_logo" in effective.name


# ============================================================================
# Serializer Tests
# ============================================================================


class TestFacilityLogoSerializer:
    """Test that effective_logo_url appears correctly in API responses."""

    def test_detail_response_includes_logo_fields(self, authenticated_client, sample_facility):
        """GET /api/facilities/{id}/ should include logo and effective_logo_url."""
        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "logo" in response.data
        assert "effective_logo_url" in response.data

    def test_effective_logo_url_null_when_no_logos(self, authenticated_client, sample_facility):
        """effective_logo_url should be null when no logos are set."""
        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["logo"] is None
        assert response.data["effective_logo_url"] is None

    def test_effective_logo_url_from_facility_logo(self, authenticated_client, sample_facility):
        """effective_logo_url should use the facility's own logo when set."""
        sample_facility.logo = _create_test_image("my_logo.png")
        sample_facility.save()

        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["effective_logo_url"] is not None
        assert "my_logo" in response.data["effective_logo_url"]

    def test_effective_logo_url_falls_back_to_org(self, authenticated_client, sample_facility, sample_organization):
        """effective_logo_url should use org logo when facility logo is not set."""
        sample_organization.logo = _create_test_image("org_brand.png")
        sample_organization.save()

        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["effective_logo_url"] is not None
        assert "org_brand" in response.data["effective_logo_url"]


# ============================================================================
# API Upload / Remove Tests
# ============================================================================


class TestFacilityLogoAPI:
    """Test logo upload and removal via the API."""

    def test_upload_logo_via_multipart_patch(self, authenticated_client, sample_facility, test_user):
        """PATCH with multipart form data should upload a facility logo."""
        test_user.is_staff = True
        test_user.is_superuser = True
        test_user.save()

        image = _create_test_image("upload_test.png")
        response = authenticated_client.patch(
            f"/api/facilities/{sample_facility.id}/",
            {"logo": image},
            format="multipart",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["logo"] is not None
        assert "upload_test" in response.data["logo"]
        assert response.data["effective_logo_url"] is not None

    def test_remove_logo_via_patch_null(self, authenticated_client, sample_facility, test_user):
        """PATCH with logo=null should remove the facility logo."""
        test_user.is_staff = True
        test_user.is_superuser = True
        test_user.save()

        # First upload
        sample_facility.logo = _create_test_image("to_remove.png")
        sample_facility.save()

        response = authenticated_client.patch(
            f"/api/facilities/{sample_facility.id}/",
            {"logo": None},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        # Logo should be cleared
        assert not response.data["logo"]

    def test_upload_logo_requires_admin(self, authenticated_client, sample_facility):
        """Non-admin users should not be able to upload logos."""
        image = _create_test_image("unauthorized.png")
        response = authenticated_client.patch(
            f"/api/facilities/{sample_facility.id}/",
            {"logo": image},
            format="multipart",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
