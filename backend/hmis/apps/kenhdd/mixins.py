"""
KENHDD Validation Mixin for DRF serializers.

Appends ``kenhdd_warnings`` to serializer responses on create/update,
providing soft (non-blocking) KENHDD compliance warnings.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class KENHDDValidationMixin:
    """
    Mixin for DRF serializers that adds ``kenhdd_warnings`` to the
    response representation on create/update.

    Usage::

        class PatientSerializer(KENHDDValidationMixin, serializers.ModelSerializer):
            kenhdd_resource_type = "PATIENT"
            ...

    The ``kenhdd_resource_type`` class attribute determines which KENHDD
    elements to validate against.  Warnings are non-blocking — the record
    is saved regardless.
    """

    kenhdd_resource_type: str = ""

    def to_representation(self, instance: Any) -> dict:
        """Append KENHDD warnings to the serialized output."""
        data: dict = super().to_representation(instance)  # type: ignore[misc]

        resource_type = getattr(self, "kenhdd_resource_type", "")
        if not resource_type:
            return data

        # Only run validation on create/update (not list/retrieve)
        request = self.context.get("request")  # type: ignore[attr-defined]
        if not request or request.method not in ("POST", "PUT", "PATCH"):
            return data

        try:
            from hmis.apps.kenhdd.services.validation import KENHDDValidationService

            service = KENHDDValidationService()
            result = service.validate_record(resource_type, instance)

            warnings = [
                {
                    "element_id": elem.element_id,
                    "field": elem.field_name,
                    "status": elem.status,
                    "message": elem.message,
                }
                for elem in result.elements
                if elem.status in ("FAIL", "WARNING")
            ]

            if warnings:
                data["kenhdd_warnings"] = warnings
        except Exception:
            logger.exception("KENHDD validation mixin failed")

        return data
