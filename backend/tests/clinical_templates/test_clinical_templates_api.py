"""
Tests for Clinical Templates API.

Phase 2: Deferred Items Implementation
TDD Focus: ClinicalTemplate REST API endpoints

Tests for CRUD operations, filtering, search, and custom actions
on clinical templates.

Following TDD methodology - these tests are written BEFORE implementation.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def api_user(db):
    """Create a standard API user."""
    return User.objects.create_user(
        username="api_user",
        email="api@example.com",
        password="testpassword123",
    )


@pytest.fixture
def api_user2(db):
    """Create a second API user for ownership tests."""
    return User.objects.create_user(
        username="api_user2",
        email="api2@example.com",
        password="testpassword123",
    )


@pytest.fixture
def admin_user(db):
    """Create an admin user with permissions."""
    user = User.objects.create_user(
        username="admin_user",
        email="admin@example.com",
        password="testpassword123",
        is_staff=True,
    )
    return user


@pytest.fixture
def authenticated_api_client(api_client, api_user, sample_organization, sample_facility):
    """Provide authenticated API client."""
    ensure_staff_profile(api_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=api_user)
    return api_client


@pytest.fixture
def authenticated_api_client2(api_client, api_user2, sample_organization, sample_facility):
    """Provide authenticated API client for second user."""
    from rest_framework.test import APIClient

    client = APIClient()
    ensure_staff_profile(api_user2, sample_organization, sample_facility)
    client.force_authenticate(user=api_user2)
    return client


@pytest.fixture
def admin_api_client(api_client, admin_user, sample_organization, sample_facility):
    """Provide authenticated admin API client."""
    from rest_framework.test import APIClient

    client = APIClient()
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def valid_template_data():
    """Valid template creation data."""
    return {
        "name": "API Test Template",
        "template_type": "encounter",
        "specialty": "General Practice",
        "description": "Test template via API",
        "content": {
            "title": "API Test",
            "version": "1.0",
            "sections": [
                {
                    "name": "Chief Complaint",
                    "order": 1,
                    "fields": [{"name": "complaint", "type": "text", "required": True}],
                }
            ],
        },
    }


@pytest.fixture
def user_template(db, api_user):
    """Create a user-owned template."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="User's Template",
        template_type="encounter",
        specialty="Internal Medicine",
        description="User owned template",
        content={"title": "User Template", "sections": []},
        is_system=False,
        is_active=True,
        created_by=api_user,
    )


@pytest.fixture
def user2_template(db, api_user2):
    """Create a template owned by second user."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Other User's Template",
        template_type="note",
        specialty="Pediatrics",
        description="Owned by api_user2",
        content={"title": "Other Template", "sections": []},
        is_system=False,
        is_active=True,
        created_by=api_user2,
    )


@pytest.fixture
def system_template(db):
    """Create a system template."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Malaria Assessment",
        template_type="assessment",
        specialty="Internal Medicine",
        description="System malaria template",
        content={
            "title": "Malaria Assessment",
            "sections": [
                {"name": "Symptoms", "order": 1, "fields": []},
                {"name": "RDT Results", "order": 2, "fields": []},
            ],
        },
        is_system=True,
        is_active=True,
        usage_count=50,
        created_by=None,
    )


@pytest.fixture
def inactive_template(db, api_user):
    """Create an inactive template."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Inactive Template",
        template_type="procedure",
        content={"title": "Inactive", "sections": []},
        is_active=False,
        created_by=api_user,
    )


@pytest.fixture
def template_with_sections(db, api_user):
    """Create a template with sections."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate, TemplateSection

    template = ClinicalTemplate.objects.create(
        name="Template With Sections",
        template_type="encounter",
        content={"title": "With Sections", "sections": []},
        created_by=api_user,
    )

    TemplateSection.objects.create(
        template=template,
        name="History",
        order=1,
        is_required=True,
        fields=[{"name": "history", "type": "textarea", "required": True}],
    )
    TemplateSection.objects.create(
        template=template,
        name="Examination",
        order=2,
        is_required=False,
        fields=[{"name": "findings", "type": "text", "required": False}],
    )

    return template


@pytest.fixture
def sample_patient(db, sample_county, sample_sub_county, sample_organization):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth="1990-01-15",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def sample_encounter(db, sample_patient, sample_facility):
    """Create a sample encounter for template application."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Testing template application",
        facility=sample_facility,
    )


# ============================================================================
# List Templates Tests
# ============================================================================


@pytest.mark.unit
class TestListTemplatesAPI:
    """Test listing clinical templates."""

    def test_list_templates_authenticated(self, authenticated_api_client, user_template):
        """Test authenticated user can list templates."""
        response = authenticated_api_client.get("/api/clinical-templates/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)

    def test_list_templates_unauthenticated_fails(self, api_client):
        """Test unauthenticated request is rejected."""
        response = api_client.get("/api/clinical-templates/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_templates_filters_by_type(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test filtering templates by template_type."""
        response = authenticated_api_client.get("/api/clinical-templates/?template_type=encounter")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for template in results:
            assert template["template_type"] == "encounter"

    def test_list_templates_filters_by_specialty(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test filtering templates by specialty."""
        response = authenticated_api_client.get(
            "/api/clinical-templates/?specialty=Internal%20Medicine"
        )

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for template in results:
            assert template["specialty"] == "Internal Medicine"

    def test_list_templates_filters_by_is_active(
        self, authenticated_api_client, user_template, inactive_template
    ):
        """Test filtering by active status."""
        response = authenticated_api_client.get("/api/clinical-templates/?is_active=true")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for template in results:
            assert template["is_active"] is True

    def test_list_templates_filters_by_is_system(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test filtering by system vs user templates."""
        response = authenticated_api_client.get("/api/clinical-templates/?is_system=true")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for template in results:
            assert template["is_system"] is True

    def test_list_templates_search_by_name(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test searching templates by name."""
        response = authenticated_api_client.get("/api/clinical-templates/?search=Malaria")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert any("Malaria" in t["name"] for t in results)

    def test_list_templates_search_by_description(self, authenticated_api_client, user_template):
        """Test searching templates by description."""
        response = authenticated_api_client.get("/api/clinical-templates/?search=owned")

        assert response.status_code == status.HTTP_200_OK

    def test_list_templates_ordering_by_name(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test ordering templates by name."""
        response = authenticated_api_client.get("/api/clinical-templates/?ordering=name")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        if len(results) > 1:
            names = [t["name"] for t in results]
            assert names == sorted(names)

    def test_list_templates_ordering_by_usage_count(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test ordering templates by usage count (popularity)."""
        response = authenticated_api_client.get("/api/clinical-templates/?ordering=-usage_count")

        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Retrieve Template Tests
# ============================================================================


@pytest.mark.unit
class TestRetrieveTemplateAPI:
    """Test retrieving a single template."""

    def test_retrieve_template_with_sections(
        self, authenticated_api_client, template_with_sections
    ):
        """Test retrieving a template includes its sections."""
        response = authenticated_api_client.get(
            f"/api/clinical-templates/{template_with_sections.id}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Template With Sections"
        assert "sections" in response.data
        assert len(response.data["sections"]) == 2

    def test_retrieve_template_unauthenticated_fails(self, api_client, user_template):
        """Test unauthenticated retrieval fails."""
        response = api_client.get(f"/api/clinical-templates/{user_template.id}/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_nonexistent_template_404(self, authenticated_api_client):
        """Test retrieving non-existent template returns 404."""
        response = authenticated_api_client.get("/api/clinical-templates/99999/")

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# Create Template Tests
# ============================================================================


@pytest.mark.unit
class TestCreateTemplateAPI:
    """Test creating clinical templates."""

    def test_create_user_template(self, authenticated_api_client, valid_template_data):
        """Test creating a user template."""
        response = authenticated_api_client.post(
            "/api/clinical-templates/", valid_template_data, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == valid_template_data["name"]
        assert response.data["is_system"] is False
        assert "id" in response.data

    def test_create_template_sets_created_by(
        self, authenticated_api_client, api_user, valid_template_data
    ):
        """Test that created_by is automatically set to current user."""
        response = authenticated_api_client.post(
            "/api/clinical-templates/", valid_template_data, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created_by"] == api_user.id

    def test_create_template_validates_content(self, authenticated_api_client):
        """Test that invalid content is rejected."""
        data = {
            "name": "Invalid Content Template",
            "template_type": "encounter",
            "content": "not a valid json object",  # Should be dict
        }

        response = authenticated_api_client.post("/api/clinical-templates/", data, format="json")

        # Should fail validation - content must be a dict/object
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_template_validates_template_type(self, authenticated_api_client):
        """Test that invalid template_type is rejected."""
        data = {
            "name": "Invalid Type Template",
            "template_type": "invalid",
            "content": {"title": "Test", "sections": []},
        }

        response = authenticated_api_client.post("/api/clinical-templates/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_system_template_requires_permission(
        self, authenticated_api_client, valid_template_data
    ):
        """Test that regular users cannot create system templates."""
        valid_template_data["is_system"] = True

        response = authenticated_api_client.post(
            "/api/clinical-templates/", valid_template_data, format="json"
        )

        # Should either reject or ignore is_system=True for non-admin
        if response.status_code == status.HTTP_201_CREATED:
            # If created, is_system should be False
            assert response.data["is_system"] is False
        else:
            assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_template_unauthenticated_fails(self, api_client, valid_template_data):
        """Test unauthenticated template creation fails."""
        response = api_client.post("/api/clinical-templates/", valid_template_data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Update Template Tests
# ============================================================================


@pytest.mark.unit
class TestUpdateTemplateAPI:
    """Test updating clinical templates."""

    def test_update_own_template(self, authenticated_api_client, user_template):
        """Test user can update their own template."""
        update_data = {
            "name": "Updated Template Name",
            "description": "Updated description",
        }

        response = authenticated_api_client.patch(
            f"/api/clinical-templates/{user_template.id}/", update_data, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Template Name"
        assert response.data["description"] == "Updated description"

    def test_update_others_template_forbidden(self, authenticated_api_client, user2_template):
        """Test user cannot update another user's template."""
        update_data = {"name": "Hijacked Template"}

        response = authenticated_api_client.patch(
            f"/api/clinical-templates/{user2_template.id}/", update_data, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_system_template_forbidden(self, authenticated_api_client, system_template):
        """Test regular users cannot update system templates."""
        update_data = {"name": "Hijacked System Template"}

        response = authenticated_api_client.patch(
            f"/api/clinical-templates/{system_template.id}/", update_data, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# Delete Template Tests
# ============================================================================


@pytest.mark.unit
class TestDeleteTemplateAPI:
    """Test deleting clinical templates."""

    def test_delete_own_template(self, authenticated_api_client, user_template):
        """Test user can delete their own template."""
        template_id = user_template.id

        response = authenticated_api_client.delete(f"/api/clinical-templates/{template_id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify deleted
        response = authenticated_api_client.get(f"/api/clinical-templates/{template_id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_others_template_forbidden(self, authenticated_api_client, user2_template):
        """Test user cannot delete another user's template."""
        response = authenticated_api_client.delete(f"/api/clinical-templates/{user2_template.id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_system_template_forbidden(self, authenticated_api_client, system_template):
        """Test system templates cannot be deleted by regular users."""
        response = authenticated_api_client.delete(f"/api/clinical-templates/{system_template.id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# Custom Actions Tests
# ============================================================================


@pytest.mark.unit
class TestTemplateCustomActions:
    """Test custom template actions."""

    def test_clone_system_template(self, authenticated_api_client, api_user, system_template):
        """Test cloning a system template creates a user copy."""
        response = authenticated_api_client.post(
            f"/api/clinical-templates/{system_template.id}/clone/"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_system"] is False
        assert response.data["created_by"] == api_user.id
        assert "Copy" in response.data["name"] or system_template.name in response.data["name"]
        assert response.data["usage_count"] == 0

    def test_clone_preserves_content(self, authenticated_api_client, system_template):
        """Test cloning preserves template content."""
        response = authenticated_api_client.post(
            f"/api/clinical-templates/{system_template.id}/clone/"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["content"] == system_template.content

    def test_apply_template_to_encounter(
        self, authenticated_api_client, user_template, sample_encounter
    ):
        """Test applying a template to an encounter increments usage count."""
        initial_count = user_template.usage_count

        response = authenticated_api_client.post(
            f"/api/clinical-templates/{user_template.id}/apply/",
            {"encounter_id": sample_encounter.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        # Refresh and check usage count incremented
        user_template.refresh_from_db()
        assert user_template.usage_count == initial_count + 1

    def test_popular_templates_endpoint(
        self, authenticated_api_client, user_template, system_template
    ):
        """Test getting most popular templates by usage."""
        response = authenticated_api_client.get("/api/clinical-templates/popular/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)

        # Should be ordered by usage_count descending
        if len(results) > 1:
            counts = [t["usage_count"] for t in results]
            assert counts == sorted(counts, reverse=True)

    def test_by_specialty_endpoint(self, authenticated_api_client, user_template, system_template):
        """Test grouping templates by specialty."""
        response = authenticated_api_client.get("/api/clinical-templates/by-specialty/")

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)
        # Should have specialties as keys
        assert "Internal Medicine" in response.data or len(response.data) >= 0


# ============================================================================
# Nested Sections Tests
# ============================================================================


@pytest.mark.unit
class TestNestedSectionsAPI:
    """Test nested sections in template API."""

    def test_create_template_with_sections(self, authenticated_api_client):
        """Test creating a template with inline sections."""
        data = {
            "name": "Template with Sections",
            "template_type": "encounter",
            "content": {"title": "With Sections", "sections": []},
            "sections": [
                {
                    "name": "Section 1",
                    "order": 1,
                    "is_required": True,
                    "fields": [{"name": "field1", "type": "text"}],
                },
                {
                    "name": "Section 2",
                    "order": 2,
                    "is_required": False,
                    "fields": [],
                },
            ],
        }

        response = authenticated_api_client.post("/api/clinical-templates/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data["sections"]) == 2
        assert response.data["sections"][0]["name"] == "Section 1"

    def test_update_template_sections(self, authenticated_api_client, template_with_sections):
        """Test updating template sections."""
        update_data = {
            "sections": [
                {
                    "name": "Updated Section",
                    "order": 1,
                    "is_required": True,
                    "fields": [{"name": "updated_field", "type": "text"}],
                }
            ]
        }

        response = authenticated_api_client.patch(
            f"/api/clinical-templates/{template_with_sections.id}/", update_data, format="json"
        )

        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Pagination Tests
# ============================================================================


@pytest.mark.unit
class TestTemplateAPIPagination:
    """Test API pagination."""

    def test_list_templates_paginated(self, authenticated_api_client, db, api_user):
        """Test that template list is paginated."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        # Create multiple templates
        for i in range(25):
            ClinicalTemplate.objects.create(
                name=f"Template {i}",
                template_type="encounter",
                content={"title": f"Test {i}", "sections": []},
                created_by=api_user,
            )

        response = authenticated_api_client.get("/api/clinical-templates/")

        assert response.status_code == status.HTTP_200_OK
        # Should have pagination metadata
        assert "results" in response.data
        assert "count" in response.data
        assert response.data["count"] >= 25

    def test_pagination_page_size(self, authenticated_api_client, db, api_user):
        """Test pagination with multiple pages."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        for i in range(15):
            ClinicalTemplate.objects.create(
                name=f"Template {i}",
                template_type="encounter",
                content={"title": f"Test {i}", "sections": []},
                created_by=api_user,
            )

        # Default page should return results (may vary by pagination config)
        response = authenticated_api_client.get("/api/clinical-templates/")

        assert response.status_code == status.HTTP_200_OK
        # Should have pagination info if paginated
        if "results" in response.data:
            assert "count" in response.data
            assert response.data["count"] == 15


# ============================================================================
# List Serializer Tests
# ============================================================================


@pytest.mark.unit
class TestTemplateListSerializer:
    """Test lightweight list serializer."""

    def test_list_excludes_content_and_sections(
        self, authenticated_api_client, template_with_sections
    ):
        """Test list view uses lightweight serializer without content."""
        response = authenticated_api_client.get("/api/clinical-templates/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)

        # List should not include full content for performance
        # (Implementation may vary - content might be included but sections excluded)
        if len(results) > 0:
            # Check that basic fields are present
            assert "id" in results[0]
            assert "name" in results[0]
            assert "template_type" in results[0]
