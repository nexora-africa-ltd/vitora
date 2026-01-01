"""
Management command to load clinical templates from JSON files.

Usage:
    python manage.py load_clinical_templates
    python manage.py load_clinical_templates --dir=custom/path
    python manage.py load_clinical_templates --update  # Update existing templates
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.clinical_templates.models import ClinicalTemplate, TemplateSection


class Command(BaseCommand):
    """Load clinical templates from JSON files."""

    help = "Load clinical templates from JSON files into the database"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--dir",
            default="data/clinical_templates/",
            help="Directory containing template JSON files (default: data/clinical_templates/)",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing templates instead of skipping them",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        templates_dir = Path(options["dir"])
        update_existing = options["update"]

        if not templates_dir.exists():
            self.stdout.write(self.style.WARNING(f"Directory not found: {templates_dir}"))
            self.stdout.write(self.style.NOTICE("Creating directory and skipping load..."))
            templates_dir.mkdir(parents=True, exist_ok=True)
            return

        if not templates_dir.is_dir():
            raise CommandError(f"Path is not a directory: {templates_dir}")

        # Find all JSON files
        json_files = list(templates_dir.glob("*.json"))

        if not json_files:
            self.stdout.write(self.style.WARNING(f"No JSON files found in {templates_dir}"))
            return

        created_count = 0
        updated_count = 0
        skipped_count = 0
        error_count = 0

        for json_file in json_files:
            try:
                result = self._load_template_file(json_file, update_existing)
                if result == "created":
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f"Created: {json_file.name}"))
                elif result == "updated":
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f"Updated: {json_file.name}"))
                elif result == "skipped":
                    skipped_count += 1
                    self.stdout.write(self.style.NOTICE(f"Skipped (exists): {json_file.name}"))
            except json.JSONDecodeError as e:
                error_count += 1
                self.stderr.write(self.style.ERROR(f"Invalid JSON in {json_file.name}: {e}"))
            except Exception as e:
                error_count += 1
                self.stderr.write(self.style.ERROR(f"Error loading {json_file.name}: {e}"))

        # Print summary
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 50))
        self.stdout.write(self.style.SUCCESS("Load Clinical Templates Summary"))
        self.stdout.write(self.style.SUCCESS("=" * 50))
        self.stdout.write(f"  Created: {created_count}")
        self.stdout.write(f"  Updated: {updated_count}")
        self.stdout.write(f"  Skipped: {skipped_count}")
        self.stdout.write(f"  Errors:  {error_count}")
        self.stdout.write(self.style.SUCCESS("=" * 50))

    def _load_template_file(self, json_file: Path, update_existing: bool) -> str:
        """
        Load a single template file.

        Args:
            json_file: Path to the JSON file
            update_existing: Whether to update existing templates

        Returns:
            str: 'created', 'updated', or 'skipped'
        """
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        name = data.get("name")
        if not name:
            raise ValueError("Template must have a 'name' field")

        # Check if template already exists
        existing = ClinicalTemplate.objects.filter(name=name).first()

        if existing:
            if not update_existing:
                return "skipped"

            # Update existing template
            existing.template_type = data.get("template_type", existing.template_type)
            existing.specialty = data.get("specialty", existing.specialty)
            existing.description = data.get("description", existing.description)
            existing.content = data.get("content", existing.content)
            existing.is_active = data.get("is_active", existing.is_active)
            existing.save()

            # Update sections if provided
            sections_data = data.get("sections", [])
            if sections_data:
                existing.sections.all().delete()
                self._create_sections(existing, sections_data)

            return "updated"

        # Create new template
        template = ClinicalTemplate.objects.create(
            name=name,
            template_type=data.get("template_type", "encounter"),
            specialty=data.get("specialty", ""),
            description=data.get("description", ""),
            content=data.get("content", {"title": name, "sections": []}),
            is_system=True,  # Loaded templates are system templates
            is_active=data.get("is_active", True),
            created_by=None,
        )

        # Create sections if provided
        sections_data = data.get("sections", [])
        self._create_sections(template, sections_data)

        return "created"

    def _create_sections(self, template: ClinicalTemplate, sections_data: list) -> None:
        """
        Create template sections from data.

        Args:
            template: The parent template
            sections_data: List of section dictionaries
        """
        for i, section_data in enumerate(sections_data):
            TemplateSection.objects.create(
                template=template,
                name=section_data.get("name", f"Section {i + 1}"),
                order=section_data.get("order", i),
                is_required=section_data.get("is_required", False),
                fields=section_data.get("fields", []),
            )
