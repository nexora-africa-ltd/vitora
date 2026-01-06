"""
Models for Clinical Templates.

This module defines the ClinicalTemplate and TemplateSection models
for managing clinical workflow templates.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models

from .schemas import validate_template_content

User = get_user_model()


class ClinicalTemplate(models.Model):
    """
    Clinical template for standardizing documentation.

    Templates define the structure for clinical workflows and can be
    system-provided (for Kenya endemic diseases) or user-created.

    Attributes:
        name: Template name (required)
        template_type: Type of template (encounter/note/assessment/procedure)
        specialty: Medical specialty (optional)
        description: Template description (optional)
        content: JSON structure defining the template
        is_system: Whether this is a system-provided template
        is_active: Whether the template is currently active
        usage_count: Number of times template has been applied
        created_by: User who created the template (null for system templates)
        created_at: Timestamp when created
        updated_at: Timestamp when last updated
    """

    TEMPLATE_TYPE_CHOICES = [
        ("encounter", "Encounter"),
        ("note", "Clinical Note"),
        ("assessment", "Assessment"),
        ("procedure", "Procedure"),
    ]

    name = models.CharField(
        max_length=200,
        help_text="Template name",
    )
    template_type = models.CharField(
        max_length=20,
        choices=TEMPLATE_TYPE_CHOICES,
        help_text="Type of clinical template",
    )
    specialty = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Medical specialty (e.g., General Practice, Pediatrics)",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Template description",
    )
    content = models.JSONField(
        help_text="Template structure as JSON",
    )
    is_system = models.BooleanField(
        default=False,
        help_text="Whether this is a system-provided template",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this template is currently active",
    )
    usage_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of times this template has been used",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinical_templates",
        help_text="User who created this template",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Clinical Template"
        verbose_name_plural = "Clinical Templates"
        indexes = [
            models.Index(fields=["template_type"]),
            models.Index(fields=["specialty"]),
            models.Index(fields=["is_system"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["-usage_count"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.template_type})"

    def clean(self):
        """Validate the model fields."""
        super().clean()

        # Validate template_type
        valid_types = [choice[0] for choice in self.TEMPLATE_TYPE_CHOICES]
        if self.template_type and self.template_type not in valid_types:
            raise ValidationError(
                {
                    "template_type": f"Invalid template type. Must be one of: {', '.join(valid_types)}"
                }
            )

        # Validate content JSON schema
        if self.content:
            validate_template_content(self.content)

    def save(self, *args, **kwargs):
        """Override save to run full_clean for validation."""
        self.full_clean()
        super().save(*args, **kwargs)

    def increment_usage(self) -> None:
        """Increment the usage count for this template."""
        self.usage_count += 1
        self.save(update_fields=["usage_count"])

    def clone(self, user) -> "ClinicalTemplate":
        """
        Create a clone of this template for a user.

        Args:
            user: The user who will own the cloned template

        Returns:
            ClinicalTemplate: The new cloned template
        """
        cloned = ClinicalTemplate(
            name=f"{self.name} (Copy)",
            template_type=self.template_type,
            specialty=self.specialty,
            description=self.description,
            content=self.content.copy() if isinstance(self.content, dict) else self.content,
            is_system=False,  # Clones are always user templates
            is_active=True,
            usage_count=0,  # Reset usage count
            created_by=user,
        )
        cloned.save()

        # Clone sections as well
        for section in self.sections.all():
            TemplateSection.objects.create(
                template=cloned,
                name=section.name,
                order=section.order,
                is_required=section.is_required,
                fields=section.fields.copy()
                if isinstance(section.fields, list)
                else section.fields,
            )

        return cloned


class TemplateSection(models.Model):
    """
    A section within a clinical template.

    Sections organize the template content into logical groups
    with ordered fields.

    Attributes:
        template: The parent template
        name: Section name
        order: Display order (lower numbers first)
        is_required: Whether this section must be completed
        fields: JSON array of field definitions
    """

    template = models.ForeignKey(
        ClinicalTemplate,
        on_delete=models.CASCADE,
        related_name="sections",
        help_text="The template this section belongs to",
    )
    name = models.CharField(
        max_length=100,
        help_text="Section name",
    )
    order = models.PositiveIntegerField(
        default=0,
        help_text="Display order (lower numbers first)",
    )
    is_required = models.BooleanField(
        default=False,
        help_text="Whether this section must be completed",
    )
    fields = models.JSONField(
        default=list,
        help_text="Array of field definitions",
    )

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Template Section"
        verbose_name_plural = "Template Sections"

    def __str__(self) -> str:
        return f"{self.name} ({self.template.name})"


class ClinicalTemplateSnapshot(models.Model):
    """
    Immutable snapshot of a completed clinical template.

    Snapshots serve as permanent records (attachments) of assessments
    completed using clinical templates. Once created, they cannot be
    modified - only new snapshots can be created.

    Attributes:
        encounter: The encounter this snapshot belongs to
        template: Reference to the template used (can be null if template deleted)
        template_name: Name of the template at time of snapshot
        template_version: Version of the template at time of snapshot
        data: The completed template data (JSON)
        created_by: User who created this snapshot
        created_at: Timestamp when snapshot was created
    """

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        related_name="template_snapshots",
        help_text="The encounter this snapshot belongs to",
    )
    template = models.ForeignKey(
        ClinicalTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="snapshots",
        help_text="The template used (may be null if template was deleted)",
    )
    template_name = models.CharField(
        max_length=200,
        help_text="Name of the template at time of snapshot",
    )
    template_version = models.CharField(
        max_length=50,
        default="1.0",
        help_text="Version of the template at time of snapshot",
    )
    data = models.JSONField(
        help_text="The completed template data",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="template_snapshots",
        help_text="User who created this snapshot",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Clinical Template Snapshot"
        verbose_name_plural = "Clinical Template Snapshots"
        indexes = [
            models.Index(fields=["encounter"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.template_name} - {self.encounter} ({self.created_at})"

    def save(self, *args, **kwargs):
        """
        Override save to enforce immutability after creation.

        Once a snapshot is created, it cannot be modified except
        by database administrators.
        """
        if self.pk:
            # Already exists - don't allow modification
            # Get the original from database
            original = ClinicalTemplateSnapshot.objects.filter(pk=self.pk).first()
            if original:
                # Restore original values (effectively making it immutable)
                self.data = original.data
                self.template_name = original.template_name
                self.template_version = original.template_version
        super().save(*args, **kwargs)
