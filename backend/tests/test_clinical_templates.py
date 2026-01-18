"""
Tests for Clinical Templates Library.

Phase 2: Deferred Items Implementation
TDD Focus: ClinicalTemplate and TemplateSection models

Clinical templates allow clinicians to standardize documentation for common
conditions. Kenya-specific templates for endemic diseases are prioritized.

Following TDD methodology - these tests are written BEFORE implementation.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def template_user(db):
    """Create a user for template creation testing."""
    return User.objects.create_user(
        username="template_user",
        email="template@example.com",
        password="testpassword123",
    )


@pytest.fixture
def valid_template_content():
    """Valid JSON content structure for a clinical template."""
    return {
        "title": "General OPD Assessment",
        "version": "1.0",
        "sections": [
            {
                "name": "Chief Complaint",
                "order": 1,
                "fields": [
                    {"name": "complaint", "type": "text", "required": True},
                    {"name": "duration", "type": "text", "required": False},
                ],
            },
            {
                "name": "Physical Examination",
                "order": 2,
                "fields": [
                    {"name": "general_appearance", "type": "text", "required": True},
                    {"name": "findings", "type": "textarea", "required": False},
                ],
            },
        ],
    }


@pytest.fixture
def malaria_template_content():
    """JSON content for malaria assessment template."""
    return {
        "title": "Malaria Assessment",
        "version": "1.0",
        "sections": [
            {
                "name": "Symptoms",
                "order": 1,
                "fields": [
                    {"name": "fever", "type": "boolean", "required": True},
                    {"name": "chills", "type": "boolean", "required": False},
                    {"name": "headache", "type": "boolean", "required": False},
                    {"name": "duration_days", "type": "number", "required": True},
                ],
            },
            {
                "name": "RDT/Microscopy",
                "order": 2,
                "fields": [
                    {
                        "name": "rdt_result",
                        "type": "select",
                        "options": ["Positive", "Negative", "Invalid"],
                        "required": True,
                    },
                    {"name": "microscopy_done", "type": "boolean", "required": False},
                    {"name": "parasite_count", "type": "number", "required": False},
                ],
            },
            {
                "name": "Severity",
                "order": 3,
                "fields": [
                    {
                        "name": "classification",
                        "type": "select",
                        "options": ["Uncomplicated", "Severe"],
                        "required": True,
                    },
                    {
                        "name": "danger_signs",
                        "type": "multiselect",
                        "options": [
                            "Prostration",
                            "Impaired consciousness",
                            "Respiratory distress",
                            "Multiple convulsions",
                            "Shock",
                            "Jaundice",
                            "Severe anemia",
                        ],
                        "required": False,
                    },
                ],
            },
        ],
    }


@pytest.fixture
def sample_clinical_template(db, template_user, valid_template_content):
    """Create a sample clinical template for testing."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="General OPD Assessment",
        template_type="encounter",
        specialty="General Practice",
        description="Standard outpatient department assessment template",
        content=valid_template_content,
        is_system=False,
        is_active=True,
        created_by=template_user,
    )


@pytest.fixture
def system_template(db, malaria_template_content):
    """Create a system clinical template."""
    from hmis.apps.clinical_templates.models import ClinicalTemplate

    return ClinicalTemplate.objects.create(
        name="Malaria Assessment",
        template_type="assessment",
        specialty="Internal Medicine",
        description="Kenya endemic disease - Malaria assessment template",
        content=malaria_template_content,
        is_system=True,
        is_active=True,
        created_by=None,  # System templates have no creator
    )


# ============================================================================
# ClinicalTemplate Model Tests
# ============================================================================


@pytest.mark.unit
class TestClinicalTemplateModel:
    """Test ClinicalTemplate model functionality."""

    def test_template_creation(self, template_user, valid_template_content):
        """Test basic template creation."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="Test Template",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        assert template.id is not None
        assert template.name == "Test Template"
        assert template.template_type == "encounter"
        assert template.content == valid_template_content
        assert template.created_by == template_user

    def test_template_str_representation(self, sample_clinical_template):
        """Test string representation of template."""
        expected = "General OPD Assessment (encounter)"
        assert str(sample_clinical_template) == expected

    def test_template_type_choices_valid(self, template_user, valid_template_content):
        """Test that only valid template types are allowed."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        valid_types = ["encounter", "note", "assessment", "procedure"]

        for template_type in valid_types:
            template = ClinicalTemplate(
                name=f"Test {template_type}",
                template_type=template_type,
                content=valid_template_content,
                created_by=template_user,
            )
            template.full_clean()  # Should not raise

    def test_template_type_invalid_raises_error(self, template_user, valid_template_content):
        """Test that invalid template type raises validation error."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate(
            name="Invalid Type Template",
            template_type="invalid_type",
            content=valid_template_content,
            created_by=template_user,
        )

        with pytest.raises(ValidationError) as exc_info:
            template.full_clean()

        assert "template_type" in str(exc_info.value)

    def test_template_json_content_field(self, sample_clinical_template):
        """Test that content is stored as JSON and retrievable."""
        content = sample_clinical_template.content

        assert isinstance(content, dict)
        assert "title" in content
        assert "sections" in content
        assert len(content["sections"]) == 2

    def test_template_is_system_default_false(self, template_user, valid_template_content):
        """Test that is_system defaults to False."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="User Template",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        assert template.is_system is False

    def test_template_is_active_default_true(self, template_user, valid_template_content):
        """Test that is_active defaults to True."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="Active Template",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        assert template.is_active is True

    def test_template_usage_count_default_zero(self, template_user, valid_template_content):
        """Test that usage_count defaults to 0."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="New Template",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        assert template.usage_count == 0

    def test_template_created_by_nullable(self, valid_template_content):
        """Test that created_by can be null for system templates."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="System Template",
            template_type="encounter",
            content=valid_template_content,
            is_system=True,
            created_by=None,
        )

        assert template.created_by is None
        assert template.is_system is True

    def test_template_timestamps(self, sample_clinical_template):
        """Test that created_at and updated_at are set automatically."""
        assert sample_clinical_template.created_at is not None
        assert sample_clinical_template.updated_at is not None

    def test_template_specialty_optional(self, template_user, valid_template_content):
        """Test that specialty field is optional."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="No Specialty Template",
            template_type="encounter",
            content=valid_template_content,
            specialty="",  # Empty string
            created_by=template_user,
        )

        assert template.specialty == ""

    def test_template_description_optional(self, template_user, valid_template_content):
        """Test that description field is optional."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        template = ClinicalTemplate.objects.create(
            name="No Description Template",
            template_type="encounter",
            content=valid_template_content,
            description="",
            created_by=template_user,
        )

        assert template.description == ""

    def test_template_unique_name_within_type_not_enforced(
        self, template_user, valid_template_content
    ):
        """Test that duplicate names are allowed (different users may have same names)."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        ClinicalTemplate.objects.create(
            name="Common Name",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        # Should not raise - same name is allowed
        template2 = ClinicalTemplate.objects.create(
            name="Common Name",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        assert template2.id is not None

    def test_increment_usage_count(self, sample_clinical_template):
        """Test incrementing usage count method."""
        initial_count = sample_clinical_template.usage_count

        sample_clinical_template.increment_usage()
        sample_clinical_template.refresh_from_db()

        assert sample_clinical_template.usage_count == initial_count + 1

    def test_clone_template(self, sample_clinical_template, template_user):
        """Test cloning a template creates a new user template."""
        # Create a different user to clone to
        clone_user = User.objects.create_user(
            username="clone_user",
            email="clone@example.com",
            password="testpassword123",
        )

        cloned = sample_clinical_template.clone(user=clone_user)

        assert cloned.id != sample_clinical_template.id
        assert cloned.name == f"{sample_clinical_template.name} (Copy)"
        assert cloned.is_system is False
        assert cloned.created_by == clone_user
        assert cloned.content == sample_clinical_template.content
        assert cloned.usage_count == 0


# ============================================================================
# TemplateSection Model Tests
# ============================================================================


@pytest.mark.unit
class TestTemplateSectionModel:
    """Test TemplateSection model functionality."""

    def test_section_creation(self, sample_clinical_template):
        """Test basic section creation."""
        from hmis.apps.clinical_templates.models import TemplateSection

        section = TemplateSection.objects.create(
            template=sample_clinical_template,
            name="Chief Complaint",
            order=1,
            is_required=True,
            fields=[
                {"name": "complaint", "type": "text", "required": True},
            ],
        )

        assert section.id is not None
        assert section.template == sample_clinical_template
        assert section.name == "Chief Complaint"
        assert section.order == 1
        assert section.is_required is True

    def test_section_str_representation(self, sample_clinical_template):
        """Test string representation of section."""
        from hmis.apps.clinical_templates.models import TemplateSection

        section = TemplateSection.objects.create(
            template=sample_clinical_template,
            name="History",
            order=2,
            fields=[],
        )

        expected = "History (General OPD Assessment)"
        assert str(section) == expected

    def test_section_ordering(self, sample_clinical_template):
        """Test sections are ordered by order field."""
        from hmis.apps.clinical_templates.models import TemplateSection

        section3 = TemplateSection.objects.create(
            template=sample_clinical_template, name="Section 3", order=3, fields=[]
        )
        section1 = TemplateSection.objects.create(
            template=sample_clinical_template, name="Section 1", order=1, fields=[]
        )
        section2 = TemplateSection.objects.create(
            template=sample_clinical_template, name="Section 2", order=2, fields=[]
        )

        sections = list(sample_clinical_template.sections.all())

        assert sections[0].name == "Section 1"
        assert sections[1].name == "Section 2"
        assert sections[2].name == "Section 3"

    def test_section_fields_json_structure(self, sample_clinical_template):
        """Test that fields are stored as valid JSON."""
        from hmis.apps.clinical_templates.models import TemplateSection

        fields_data = [
            {"name": "field1", "type": "text", "required": True, "label": "Field 1"},
            {"name": "field2", "type": "number", "required": False, "min": 0, "max": 100},
            {"name": "field3", "type": "select", "options": ["A", "B", "C"], "required": True},
        ]

        section = TemplateSection.objects.create(
            template=sample_clinical_template,
            name="Test Section",
            order=1,
            fields=fields_data,
        )

        assert isinstance(section.fields, list)
        assert len(section.fields) == 3
        assert section.fields[0]["name"] == "field1"
        assert section.fields[1]["type"] == "number"
        assert "options" in section.fields[2]

    def test_section_cascade_delete_with_template(self, sample_clinical_template):
        """Test sections are deleted when template is deleted."""
        from hmis.apps.clinical_templates.models import TemplateSection

        section = TemplateSection.objects.create(
            template=sample_clinical_template,
            name="To Be Deleted",
            order=1,
            fields=[],
        )
        section_id = section.id
        template_id = sample_clinical_template.id

        sample_clinical_template.delete()

        assert not TemplateSection.objects.filter(id=section_id).exists()

    def test_section_order_default_zero(self, sample_clinical_template):
        """Test that order defaults to 0."""
        from hmis.apps.clinical_templates.models import TemplateSection

        section = TemplateSection.objects.create(
            template=sample_clinical_template,
            name="Default Order Section",
            fields=[],
        )

        assert section.order == 0

    def test_section_is_required_default_false(self, sample_clinical_template):
        """Test that is_required defaults to False."""
        from hmis.apps.clinical_templates.models import TemplateSection

        section = TemplateSection.objects.create(
            template=sample_clinical_template,
            name="Optional Section",
            order=1,
            fields=[],
        )

        assert section.is_required is False

    def test_multiple_sections_per_template(self, sample_clinical_template):
        """Test that a template can have multiple sections."""
        from hmis.apps.clinical_templates.models import TemplateSection

        for i in range(5):
            TemplateSection.objects.create(
                template=sample_clinical_template,
                name=f"Section {i+1}",
                order=i + 1,
                fields=[],
            )

        assert sample_clinical_template.sections.count() == 5


# ============================================================================
# Template Query Tests
# ============================================================================


@pytest.mark.unit
class TestTemplateQueries:
    """Test template querying and filtering."""

    def test_filter_by_template_type(self, db, template_user, valid_template_content):
        """Test filtering templates by type."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        ClinicalTemplate.objects.create(
            name="Encounter 1",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )
        ClinicalTemplate.objects.create(
            name="Note 1",
            template_type="note",
            content=valid_template_content,
            created_by=template_user,
        )
        ClinicalTemplate.objects.create(
            name="Encounter 2",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        encounters = ClinicalTemplate.objects.filter(template_type="encounter")
        notes = ClinicalTemplate.objects.filter(template_type="note")

        assert encounters.count() == 2
        assert notes.count() == 1

    def test_filter_by_specialty(self, db, template_user, valid_template_content):
        """Test filtering templates by specialty."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        ClinicalTemplate.objects.create(
            name="Pediatric 1",
            template_type="encounter",
            specialty="Pediatrics",
            content=valid_template_content,
            created_by=template_user,
        )
        ClinicalTemplate.objects.create(
            name="General 1",
            template_type="encounter",
            specialty="General Practice",
            content=valid_template_content,
            created_by=template_user,
        )

        pediatric = ClinicalTemplate.objects.filter(specialty="Pediatrics")

        assert pediatric.count() == 1
        assert pediatric.first().name == "Pediatric 1"

    def test_filter_active_templates(self, db, template_user, valid_template_content):
        """Test filtering only active templates."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        ClinicalTemplate.objects.create(
            name="Active",
            template_type="encounter",
            is_active=True,
            content=valid_template_content,
            created_by=template_user,
        )
        ClinicalTemplate.objects.create(
            name="Inactive",
            template_type="encounter",
            is_active=False,
            content=valid_template_content,
            created_by=template_user,
        )

        active = ClinicalTemplate.objects.filter(is_active=True)

        assert active.count() == 1
        assert active.first().name == "Active"

    def test_filter_system_templates(self, db, template_user, valid_template_content):
        """Test filtering system vs user templates."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        ClinicalTemplate.objects.create(
            name="System",
            template_type="encounter",
            is_system=True,
            content=valid_template_content,
            created_by=None,
        )
        ClinicalTemplate.objects.create(
            name="User",
            template_type="encounter",
            is_system=False,
            content=valid_template_content,
            created_by=template_user,
        )

        system = ClinicalTemplate.objects.filter(is_system=True)
        user = ClinicalTemplate.objects.filter(is_system=False)

        assert system.count() == 1
        assert user.count() == 1

    def test_order_by_usage_count(self, db, template_user, valid_template_content):
        """Test ordering templates by usage count (popularity)."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        t1 = ClinicalTemplate.objects.create(
            name="Popular",
            template_type="encounter",
            usage_count=100,
            content=valid_template_content,
            created_by=template_user,
        )
        t2 = ClinicalTemplate.objects.create(
            name="Less Popular",
            template_type="encounter",
            usage_count=10,
            content=valid_template_content,
            created_by=template_user,
        )
        t3 = ClinicalTemplate.objects.create(
            name="Most Popular",
            template_type="encounter",
            usage_count=500,
            content=valid_template_content,
            created_by=template_user,
        )

        popular = ClinicalTemplate.objects.order_by("-usage_count")

        assert list(popular) == [t3, t1, t2]


# ============================================================================
# Model Meta and Permissions Tests
# ============================================================================


@pytest.mark.unit
class TestTemplateMetaOptions:
    """Test model meta options and permissions."""

    def test_template_ordering(self, db, template_user, valid_template_content):
        """Test default ordering by name."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        ClinicalTemplate.objects.create(
            name="Zebra Template",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )
        ClinicalTemplate.objects.create(
            name="Alpha Template",
            template_type="encounter",
            content=valid_template_content,
            created_by=template_user,
        )

        templates = list(ClinicalTemplate.objects.all())

        assert templates[0].name == "Alpha Template"
        assert templates[1].name == "Zebra Template"

    def test_template_verbose_name(self):
        """Test model verbose names."""
        from hmis.apps.clinical_templates.models import ClinicalTemplate

        assert ClinicalTemplate._meta.verbose_name == "Clinical Template"
        assert ClinicalTemplate._meta.verbose_name_plural == "Clinical Templates"

    def test_section_verbose_name(self):
        """Test section model verbose names."""
        from hmis.apps.clinical_templates.models import TemplateSection

        assert TemplateSection._meta.verbose_name == "Template Section"
        assert TemplateSection._meta.verbose_name_plural == "Template Sections"
