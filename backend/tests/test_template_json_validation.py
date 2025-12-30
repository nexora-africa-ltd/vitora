"""
Tests for Template JSON Schema Validation.

Phase 2: Deferred Items Implementation
TDD Focus: JSON schema validation for clinical template content

Ensures clinical template JSON content follows a defined schema for consistency.

Following TDD methodology - these tests are written BEFORE implementation.
"""

import pytest
from django.core.exceptions import ValidationError

pytestmark = pytest.mark.django_db


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def valid_minimal_content():
    """Minimal valid template content."""
    return {
        "title": "Minimal Template",
        "sections": []
    }


@pytest.fixture
def valid_full_content():
    """Full valid template content with all fields."""
    return {
        "title": "Complete Template",
        "version": "1.0",
        "description": "A fully populated template",
        "sections": [
            {
                "name": "Section 1",
                "order": 1,
                "fields": [
                    {"name": "field1", "type": "text", "required": True, "label": "Field 1"},
                    {"name": "field2", "type": "number", "required": False, "min": 0, "max": 100},
                ]
            },
            {
                "name": "Section 2",
                "order": 2,
                "fields": [
                    {"name": "field3", "type": "select", "options": ["A", "B", "C"], "required": True},
                    {"name": "field4", "type": "boolean", "required": False},
                ]
            }
        ]
    }


@pytest.fixture
def template_user(db):
    """Create a user for template creation."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="schema_test_user",
        email="schema@example.com",
        password="testpassword123",
    )


# ============================================================================
# Valid Content Tests
# ============================================================================


@pytest.mark.unit
class TestValidTemplateContent:
    """Test that valid JSON content is accepted."""

    def test_valid_minimal_content_accepted(self, template_user, valid_minimal_content):
        """Test minimal valid content is accepted."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate(
            name="Minimal Template",
            template_type="encounter",
            content=valid_minimal_content,
            created_by=template_user,
        )
        
        # Should not raise
        template.full_clean()
        template.save()
        
        assert template.id is not None

    def test_valid_full_content_accepted(self, template_user, valid_full_content):
        """Test full valid content is accepted."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate(
            name="Full Template",
            template_type="encounter",
            content=valid_full_content,
            created_by=template_user,
        )
        
        template.full_clean()
        template.save()
        
        assert template.id is not None

    def test_valid_content_with_all_field_types(self, template_user):
        """Test content with all supported field types."""
        content = {
            "title": "All Field Types",
            "sections": [
                {
                    "name": "All Types Section",
                    "order": 1,
                    "fields": [
                        {"name": "text_field", "type": "text", "required": True},
                        {"name": "textarea_field", "type": "textarea", "required": False},
                        {"name": "number_field", "type": "number", "required": False},
                        {"name": "boolean_field", "type": "boolean", "required": False},
                        {"name": "date_field", "type": "date", "required": False},
                        {"name": "select_field", "type": "select", "options": ["A", "B"], "required": False},
                        {"name": "multiselect_field", "type": "multiselect", "options": ["X", "Y", "Z"], "required": False},
                    ]
                }
            ]
        }

        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate(
            name="All Types Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        template.full_clean()
        assert True  # If we get here, validation passed


# ============================================================================
# Invalid Content Tests
# ============================================================================


@pytest.mark.unit
class TestInvalidTemplateContent:
    """Test that invalid JSON content is rejected."""

    def test_missing_title_rejected(self, template_user):
        """Test content without title is rejected."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "sections": []
        }

        template = ClinicalTemplate(
            name="No Title Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "content" in str(exc_info.value).lower() or "title" in str(exc_info.value).lower()

    def test_missing_sections_rejected(self, template_user):
        """Test content without sections is rejected."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "No Sections"
        }

        template = ClinicalTemplate(
            name="No Sections Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "content" in str(exc_info.value).lower() or "sections" in str(exc_info.value).lower()

    def test_invalid_section_structure_rejected(self, template_user):
        """Test section without required name field is rejected."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Invalid Section",
            "sections": [
                {
                    "order": 1,  # Missing 'name'
                    "fields": []
                }
            ]
        }

        template = ClinicalTemplate(
            name="Invalid Section Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "content" in str(exc_info.value).lower() or "name" in str(exc_info.value).lower()

    def test_invalid_field_type_rejected(self, template_user):
        """Test field with invalid type is rejected."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Invalid Field Type",
            "sections": [
                {
                    "name": "Section 1",
                    "order": 1,
                    "fields": [
                        {"name": "bad_field", "type": "invalid_type", "required": True}
                    ]
                }
            ]
        }

        template = ClinicalTemplate(
            name="Invalid Field Type Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "content" in str(exc_info.value).lower() or "type" in str(exc_info.value).lower()

    def test_select_without_options_rejected(self, template_user):
        """Test select field without options is rejected."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Select No Options",
            "sections": [
                {
                    "name": "Section 1",
                    "order": 1,
                    "fields": [
                        {"name": "select_field", "type": "select", "required": True}  # Missing options
                    ]
                }
            ]
        }

        template = ClinicalTemplate(
            name="Select No Options Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "content" in str(exc_info.value).lower() or "options" in str(exc_info.value).lower()

    def test_field_missing_name_rejected(self, template_user):
        """Test field without name is rejected."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Field No Name",
            "sections": [
                {
                    "name": "Section 1",
                    "order": 1,
                    "fields": [
                        {"type": "text", "required": True}  # Missing 'name'
                    ]
                }
            ]
        }

        template = ClinicalTemplate(
            name="Field No Name Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "content" in str(exc_info.value).lower() or "name" in str(exc_info.value).lower()


# ============================================================================
# Section Limit Tests
# ============================================================================


@pytest.mark.unit
class TestSectionLimits:
    """Test section count limits."""

    def test_max_sections_enforced(self, template_user):
        """Test that maximum section count is enforced."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        # Create content with too many sections (limit should be ~20)
        sections = [
            {"name": f"Section {i}", "order": i, "fields": []}
            for i in range(25)  # Assuming limit < 25
        ]
        
        content = {
            "title": "Too Many Sections",
            "sections": sections
        }

        template = ClinicalTemplate(
            name="Too Many Sections Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "sections" in str(exc_info.value).lower() or "maximum" in str(exc_info.value).lower()

    def test_max_fields_per_section_enforced(self, template_user):
        """Test that maximum fields per section is enforced."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        # Create section with too many fields (limit should be ~50)
        fields = [
            {"name": f"field_{i}", "type": "text", "required": False}
            for i in range(55)  # Assuming limit < 55
        ]
        
        content = {
            "title": "Too Many Fields",
            "sections": [
                {"name": "Big Section", "order": 1, "fields": fields}
            ]
        }

        template = ClinicalTemplate(
            name="Too Many Fields Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()
        
        assert "fields" in str(exc_info.value).lower() or "maximum" in str(exc_info.value).lower()


# ============================================================================
# Edge Case Tests
# ============================================================================


@pytest.mark.unit
class TestSchemaEdgeCases:
    """Test edge cases in schema validation."""

    def test_empty_sections_array_accepted(self, template_user):
        """Test that empty sections array is valid."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Empty Sections",
            "sections": []
        }

        template = ClinicalTemplate(
            name="Empty Sections Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        template.full_clean()  # Should not raise

    def test_section_with_empty_fields_accepted(self, template_user):
        """Test that section with empty fields array is valid."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Empty Fields",
            "sections": [
                {"name": "Empty Section", "order": 1, "fields": []}
            ]
        }

        template = ClinicalTemplate(
            name="Empty Fields Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        template.full_clean()  # Should not raise

    def test_unicode_in_content_accepted(self, template_user):
        """Test that unicode characters in content are accepted."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Uchunguzi wa Malaria",  # Swahili
            "sections": [
                {
                    "name": "Dalili",
                    "order": 1,
                    "fields": [
                        {"name": "homa", "type": "boolean", "required": True, "label": "Homa (Fever)"}
                    ]
                }
            ]
        }

        template = ClinicalTemplate(
            name="Swahili Template",
            template_type="assessment",
            content=content,
            created_by=template_user,
        )
        
        template.full_clean()
        template.save()
        
        assert template.id is not None
        assert template.content["title"] == "Uchunguzi wa Malaria"

    def test_nested_content_structure_preserved(self, template_user):
        """Test that nested JSON structure is preserved."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        content = {
            "title": "Nested Content",
            "metadata": {
                "author": "Test Author",
                "version": "2.0",
                "tags": ["kenya", "endemic", "malaria"]
            },
            "sections": [
                {
                    "name": "Complex Section",
                    "order": 1,
                    "fields": [
                        {
                            "name": "nested_field",
                            "type": "select",
                            "options": ["A", "B", "C"],
                            "required": True,
                            "validation": {
                                "min_selections": 1,
                                "max_selections": 2
                            }
                        }
                    ]
                }
            ]
        }

        template = ClinicalTemplate(
            name="Nested Template",
            template_type="encounter",
            content=content,
            created_by=template_user,
        )
        
        template.full_clean()
        template.save()
        
        # Verify nested structure preserved
        template.refresh_from_db()
        assert template.content["metadata"]["tags"] == ["kenya", "endemic", "malaria"]


# ============================================================================
# Schema Validation Function Tests
# ============================================================================


@pytest.mark.unit
class TestSchemaValidationFunction:
    """Test the schema validation function directly."""

    def test_validate_template_content_function_exists(self):
        """Test that validation function exists."""
        from hmis.apps.clinical_templates.schemas import validate_template_content
        
        assert callable(validate_template_content)

    def test_validate_returns_none_on_valid(self, valid_full_content):
        """Test validation returns None for valid content."""
        from hmis.apps.clinical_templates.schemas import validate_template_content
        
        result = validate_template_content(valid_full_content)
        assert result is None  # No error

    def test_validate_raises_on_invalid(self):
        """Test validation raises error for invalid content."""
        from hmis.apps.clinical_templates.schemas import validate_template_content
        
        invalid_content = {"invalid": "content"}
        
        with pytest.raises(ValidationError):
            validate_template_content(invalid_content)

    def test_get_validation_errors_returns_list(self):
        """Test getting validation errors as list."""
        from hmis.apps.clinical_templates.schemas import get_validation_errors
        
        invalid_content = {
            "title": "Missing sections"
        }
        
        errors = get_validation_errors(invalid_content)
        assert isinstance(errors, list)
        assert len(errors) > 0
