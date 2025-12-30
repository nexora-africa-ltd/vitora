"""
Serializers for Clinical Templates.
"""

from rest_framework import serializers

from .models import ClinicalTemplate, TemplateSection
from .schemas import get_validation_errors


class TemplateSectionSerializer(serializers.ModelSerializer):
    """Serializer for TemplateSection model."""

    class Meta:
        model = TemplateSection
        fields = [
            "id",
            "name",
            "order",
            "is_required",
            "fields",
        ]
        read_only_fields = ["id"]


class ClinicalTemplateSerializer(serializers.ModelSerializer):
    """Full serializer for ClinicalTemplate model with nested sections."""

    sections = TemplateSectionSerializer(many=True, required=False)
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = ClinicalTemplate
        fields = [
            "id",
            "name",
            "template_type",
            "specialty",
            "description",
            "content",
            "is_system",
            "is_active",
            "usage_count",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
            "sections",
        ]
        read_only_fields = [
            "id",
            "usage_count",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]

    def validate_content(self, value):
        """Validate template content against schema."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Content must be a JSON object")

        errors = get_validation_errors(value)
        if errors:
            raise serializers.ValidationError(errors)

        return value

    def validate(self, data):
        """Cross-field validation."""
        # Prevent regular users from creating system templates
        request = self.context.get("request")
        is_system = data.get("is_system", False)

        if is_system:
            # Only staff/superusers can create system templates
            if request and not (request.user.is_staff or request.user.is_superuser):
                # Silently set to False instead of rejecting
                data["is_system"] = False

        return data

    def create(self, validated_data):
        """Create template with nested sections."""
        sections_data = validated_data.pop("sections", [])

        # Set created_by from request
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        # Force is_system to False for non-staff users
        if request and not (request.user.is_staff or request.user.is_superuser):
            validated_data["is_system"] = False

        template = ClinicalTemplate.objects.create(**validated_data)

        # Create sections
        for section_data in sections_data:
            TemplateSection.objects.create(template=template, **section_data)

        return template

    def update(self, instance, validated_data):
        """Update template with nested sections."""
        sections_data = validated_data.pop("sections", None)

        # Update template fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update sections if provided
        if sections_data is not None:
            # Delete existing sections and recreate
            instance.sections.all().delete()
            for section_data in sections_data:
                TemplateSection.objects.create(template=instance, **section_data)

        return instance


class ClinicalTemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing templates (excludes content/sections)."""

    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = ClinicalTemplate
        fields = [
            "id",
            "name",
            "template_type",
            "specialty",
            "description",
            "is_system",
            "is_active",
            "usage_count",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
