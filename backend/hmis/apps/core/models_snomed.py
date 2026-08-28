# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models snomed for Vitora HMIS.

What this file is for:
- Implement models snomed logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.db import models


class SNOMEDConcept(models.Model):
    """
    Local cache of SNOMED CT concepts for offline search.

    Populated via the `seed_snomed_common` management command with frequently
    used clinical concepts. Supplemented at runtime when clinicians search
    via the Snowstorm API — results are cached here for subsequent lookups.

    Attributes:
        concept_id: SNOMED CT concept ID (e.g., '38341003')
        display: Preferred term (e.g., 'Hypertensive disorder')
        semantic_tag: FSN semantic tag (e.g., 'disorder', 'finding', 'procedure')
        is_active: Whether the concept is active in SNOMED CT
    """

    concept_id = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
        help_text="SNOMED CT concept ID (e.g., '38341003')",
    )
    display = models.CharField(
        max_length=500,
        help_text="SNOMED CT preferred term",
    )
    semantic_tag = models.CharField(
        max_length=50,
        blank=True,
        default="",
        db_index=True,
        help_text="Semantic tag from FSN (e.g., 'disorder', 'finding', 'procedure')",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this concept is active in SNOMED CT",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SNOMED CT Concept"
        verbose_name_plural = "SNOMED CT Concepts"
        ordering = ["display"]
        indexes = [
            models.Index(fields=["display"]),
        ]

    def __str__(self) -> str:
        return f"{self.concept_id} | {self.display}"
