# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Facility-scoped procedure catalogue seeding services.

Use ``seed_ichi_catalog_for_facility(facility)`` from management commands or
authenticated API actions. Inputs are a Facility instance and an optional flag
to replace legacy ``PROC-*`` seed rows.
"""

from __future__ import annotations

import hashlib

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from hmis.apps.billing.services.terminology_source_registry import get_terminology_source
from hmis.apps.procedures.ichi_seed_catalog import DHA_ICHI_SEED_CONCEPTS
from hmis.apps.procedures.models import ProcedureCatalog


def _contains_any(title: str, terms: tuple[str, ...]) -> bool:
    """Return whether a normalized DHA title contains an anatomical/procedural term."""
    return any(term in title for term in terms)


def infer_catalog_classification(title: str) -> tuple[str, str]:
    """Infer facility catalog category and body system from a DHA ICHI display title.

    DHA's ICHI Concepts endpoint does not include Vitora's local catalog facets.
    The rules deliberately prefer a specific anatomical signal. Concepts without
    one retain the neutral ``GENERAL`` fallback for administrator classification.
    """
    normalized = title.lower()

    if _contains_any(normalized, ("tooth", "dental", "oral", "gingiv", "root canal")):
        return (ProcedureCatalog.Category.DENTAL, ProcedureCatalog.BodySystem.DENTAL)
    if _contains_any(
        normalized,
        ("eye", "ocular", "cornea", "lens", "retina", "optic", "orbit", "sclera", "cataract"),
    ):
        return (ProcedureCatalog.Category.OPHTHALMIC, ProcedureCatalog.BodySystem.SENSORY)
    if _contains_any(
        normalized, ("ear", "aural", "nasal", "nose", "sinus", "larynx", "pharynx", "epistaxis")
    ):
        return (ProcedureCatalog.Category.ENT, ProcedureCatalog.BodySystem.SENSORY)
    if _contains_any(
        normalized,
        (
            "uter",
            "cervi",
            "vagin",
            "ovari",
            "pregnan",
            "perine",
            "prostate",
            "testis",
            "male genital",
        ),
    ):
        return (ProcedureCatalog.Category.OBSTETRIC, ProcedureCatalog.BodySystem.REPRODUCTIVE)
    if _contains_any(normalized, ("urethr", "bladder", "kidney", "renal", "urinary", "ureter")):
        return (ProcedureCatalog.Category.THERAPEUTIC, ProcedureCatalog.BodySystem.URINARY)
    if _contains_any(
        normalized,
        (
            "spinal",
            "lumbar",
            "brain",
            "nerve",
            "cerebr",
            "mening",
            "rathke",
            "ventricular",
            "neuro",
        ),
    ):
        return (ProcedureCatalog.Category.DIAGNOSTIC, ProcedureCatalog.BodySystem.NERVOUS)
    if _contains_any(
        normalized,
        (
            "bone",
            "joint",
            "fracture",
            "muscle",
            "tendon",
            "limb",
            "tmj",
            "carpal",
            "rotator",
            "zygomatic",
        ),
    ):
        return (ProcedureCatalog.Category.THERAPEUTIC, ProcedureCatalog.BodySystem.MUSCULOSKELETAL)
    if _contains_any(
        normalized, ("heart", "cardiac", "arter", "vein", "vascular", "aort", "pericard")
    ):
        return (ProcedureCatalog.Category.THERAPEUTIC, ProcedureCatalog.BodySystem.CARDIOVASCULAR)
    if _contains_any(normalized, ("lung", "thorac", "chest", "bronch", "respirat")):
        return (ProcedureCatalog.Category.THERAPEUTIC, ProcedureCatalog.BodySystem.RESPIRATORY)
    if _contains_any(
        normalized,
        ("skin", "wound", "derm", "cyst", "lipoma", "nail", "dressing", "chalazion", "lesion"),
    ):
        return (ProcedureCatalog.Category.WOUND_CARE, ProcedureCatalog.BodySystem.INTEGUMENTARY)
    if _contains_any(
        normalized,
        (
            "gastric",
            "rectal",
            "intestinal",
            "bowel",
            "colon",
            "abdomen",
            "spleen",
            "pancrea",
            "jejuno",
            "peritone",
            "liver",
            "nasoduoden",
        ),
    ):
        return (ProcedureCatalog.Category.THERAPEUTIC, ProcedureCatalog.BodySystem.DIGESTIVE)
    if _contains_any(normalized, ("lymph", "thymus", "bone marrow")):
        return (ProcedureCatalog.Category.DIAGNOSTIC, ProcedureCatalog.BodySystem.LYMPHATIC)
    if _contains_any(normalized, ("injection", "infusion", "administration")):
        return (ProcedureCatalog.Category.INJECTION, ProcedureCatalog.BodySystem.UNSPECIFIED)
    if _contains_any(normalized, ("examination", "aspiration", "puncture", "biopsy")):
        return (ProcedureCatalog.Category.DIAGNOSTIC, ProcedureCatalog.BodySystem.UNSPECIFIED)

    return (ProcedureCatalog.Category.THERAPEUTIC, ProcedureCatalog.BodySystem.UNSPECIFIED)


def canonical_ichi_procedure(
    code: str, title: str, *, include_retrieved_at: bool = True
) -> dict[str, object]:
    """Build one facility procedure row from a canonical DHA ICHI concept."""
    source = get_terminology_source("ichi")
    system = "http://id.who.int/ichi"
    category, body_system = infer_catalog_classification(title)
    procedure: dict[str, object] = {
        "code": code,
        "code_follows_ichi": True,
        "name": title,
        "category": category,
        "body_system": body_system,
        # DHA ICHI does not specify a facility's legal consent policy.
        "consent_required": False,
        "ichi_code": code,
        "ichi_system": system,
        "ichi_owner": source.owner,
        "ichi_source": source.source or "",
        "ichi_checksum": hashlib.sha256(f"{system}|{code}|{title}".encode()).hexdigest(),
    }
    if include_retrieved_at:
        procedure["ichi_retrieved_at"] = timezone.now()
    return procedure


@transaction.atomic
def seed_ichi_catalog_for_facility(
    facility, *, replace_legacy_catalog: bool = False, dry_run: bool = False
) -> dict[str, int]:
    """Seed or reconcile the canonical DHA ICHI catalogue for one facility."""
    legacy_queryset = ProcedureCatalog.objects.filter(facility=facility, code__startswith="PROC-")
    legacy_removed = legacy_queryset.count() if replace_legacy_catalog else 0
    if replace_legacy_catalog and not dry_run:
        legacy_queryset.delete()

    created = 0
    updated = 0
    skipped = 0
    for code, title in DHA_ICHI_SEED_CONCEPTS:
        existing = (
            ProcedureCatalog.objects.filter(facility=facility)
            .filter(Q(ichi_code=code) | Q(code=code))
            .first()
        )
        if existing is None:
            created += 1
            if not dry_run:
                ProcedureCatalog.objects.create(
                    **canonical_ichi_procedure(code, title),
                    organization=facility.organization,
                    facility=facility,
                )
            continue

        canonical = canonical_ichi_procedure(code, title, include_retrieved_at=False)
        if not existing.code_follows_ichi:
            canonical.pop("code")
            canonical.pop("code_follows_ichi")
        changed_fields = [
            field_name
            for field_name, value in canonical.items()
            if getattr(existing, field_name) != value
        ]
        if existing.ichi_retrieved_at is None:
            canonical["ichi_retrieved_at"] = timezone.now()
            changed_fields.append("ichi_retrieved_at")
        if not changed_fields:
            skipped += 1
            continue

        updated += 1
        if not dry_run:
            for field_name in changed_fields:
                setattr(existing, field_name, canonical[field_name])
            existing.save(update_fields=changed_fields)

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "legacy_removed": legacy_removed,
        "total": len(DHA_ICHI_SEED_CONCEPTS),
        "facility_id": facility.id,
    }
