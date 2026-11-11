# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Terminology provenance and selected-concept cache models.

Use ``TerminologyBinding.record`` when an authenticated clinical workflow
selects a DHA concept. Inputs are an approved terminology key, normalized
concept provenance, and the selected local Django model instance.
"""

from __future__ import annotations

import hashlib
import json

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone


class TerminologyConceptCache(models.Model):
    """Cached DHA concept selected or approved for an operational workflow."""

    terminology_key = models.CharField(max_length=32, db_index=True)
    code = models.CharField(max_length=100)
    display = models.CharField(max_length=500)
    owner = models.CharField(max_length=100)
    source = models.CharField(max_length=100)
    system = models.CharField(max_length=255)
    retrieved_at = models.DateTimeField(default=timezone.now)
    version = models.CharField(max_length=100, blank=True, default="")
    checksum = models.CharField(max_length=64, blank=True, default="")
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "source", "system", "code"],
                name="core_terminology_concept_unique_source_code",
            )
        ]
        indexes = [models.Index(fields=["terminology_key", "code"])]

    @classmethod
    def __str__(self) -> str:
        """Return a readable source-qualified concept identifier."""
        return f"{self.owner}/{self.source}:{self.code}"

    @classmethod
    def cache_selected(cls, concept, *, terminology_key: str) -> TerminologyConceptCache:
        """Persist one clinically selected concept, never an entire remote catalogue."""
        payload = concept.raw_data or {}
        serialized_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        checksum = hashlib.sha256(serialized_payload.encode("utf-8")).hexdigest()
        return cls.objects.update_or_create(
            owner=concept.owner,
            source=concept.source,
            system=concept.system,
            code=concept.code,
            defaults={
                "terminology_key": terminology_key,
                "display": concept.display,
                "retrieved_at": concept.retrieved_at or timezone.now(),
                "version": concept.version,
                "checksum": checksum,
                "raw_payload": payload,
            },
        )[0]


class TerminologyBinding(models.Model):
    """Immutable provenance binding between a local record and a selected concept."""

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveBigIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    concept = models.ForeignKey(
        TerminologyConceptCache,
        on_delete=models.PROTECT,
        related_name="bindings",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="terminology_bindings",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="terminology_bindings",
    )
    field_name = models.CharField(max_length=100)
    selected_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="terminology_bindings",
    )
    selected_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content_type", "object_id", "field_name"],
                name="core_terminology_binding_unique_target_field",
            )
        ]
        indexes = [models.Index(fields=["content_type", "object_id"])]

    def __str__(self) -> str:
        """Return a readable local-field-to-concept binding."""
        return f"{self.content_type.model}:{self.object_id}.{self.field_name} -> {self.concept}"

    @classmethod
    def record(cls, instance, *, concept, terminology_key: str, field_name: str, user=None):
        """Cache a selected concept and bind it to one local model field."""
        cached = TerminologyConceptCache.cache_selected(concept, terminology_key=terminology_key)
        organization = getattr(instance, "organization", None)
        facility = getattr(instance, "facility", None)
        return cls.objects.update_or_create(
            content_type=ContentType.objects.get_for_model(instance, for_concrete_model=False),
            object_id=instance.pk,
            field_name=field_name,
            defaults={
                "concept": cached,
                "organization": organization,
                "facility": facility,
                "selected_by": user,
                "selected_at": timezone.now(),
            },
        )[0]
