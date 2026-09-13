# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing models catalog for Vitora HMIS.

What this file is for:
- Implement models catalog logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class ServiceCategory(models.Model):
    """Category for billable services."""

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    code = models.CharField(max_length=20, unique=True)  # e.g., "CONS", "LAB", "PHARM"
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Service Category"
        verbose_name_plural = "Service Categories"
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name


class ICD11CodeReference(models.Model):
    """Local ICD-11 reference catalog for offline terminology fallback."""

    code = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    chapter = models.CharField(max_length=50, blank=True, default="")
    chapter_no = models.CharField(max_length=20, blank=True, default="")
    class_kind = models.CharField(max_length=20, default="category")
    depth_in_kind = models.PositiveIntegerField(default=0)
    entity_id = models.CharField(max_length=50, blank=True, default="")
    foundation_uri = models.CharField(max_length=500, blank=True, default="")
    linearization_uri = models.CharField(max_length=500, blank=True, default="")
    is_leaf = models.BooleanField(default=True)
    is_residual = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "ICD-11 Code Reference"
        verbose_name_plural = "ICD-11 Code References"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["chapter_no"]),
            models.Index(fields=["title"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.title}"

    def save(self, *args, **kwargs):
        """Normalize code casing before save."""
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)


class Service(models.Model):
    """Billable service with pricing."""

    id = models.BigAutoField(primary_key=True)
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name="services")

    # Service identification
    code = models.CharField(max_length=20, unique=True)  # e.g., "CONS-001", "LAB-CBC"
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Pricing
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="KES")

    # SHA/Insurance coding
    sha_code = models.CharField(max_length=20, blank=True)  # SHA service code
    icd10_code = models.CharField(max_length=10, blank=True)  # For procedure billing

    # Flags
    is_active = models.BooleanField(default=True)
    requires_quantity = models.BooleanField(default=False)  # True for consumables
    is_taxable = models.BooleanField(default=False)  # Medical services typically exempt

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="services_created"
    )

    class Meta:
        ordering = ["category", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["sha_code"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def save(self, *args, **kwargs):
        """Override save to run validation."""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate service data."""
        if self.unit_price is not None and self.unit_price <= 0:
            raise ValidationError({"unit_price": "Unit price must be greater than 0."})

    def get_display_name(self) -> str:
        """Return formatted display name."""
        return f"{self.category.name} - {self.name}"

    def calculate_line_total(self, quantity: Decimal) -> Decimal:
        """Calculate line total for given quantity."""
        return self.unit_price * quantity

    def is_available(self) -> bool:
        """Check if service is available for billing."""
        return self.is_active
