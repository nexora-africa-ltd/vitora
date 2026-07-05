# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Management command to validate PII field encryption integrity.

Scans all models with ``*_encrypted`` fields and attempts to decrypt
every non-empty value.  Reports failures so operators can detect
key-mismatch or data-corruption issues before they surface as
user-facing errors.

Usage:
    # Check all models
    python manage.py check_pii_integrity

    # Check specific model(s) only
    python manage.py check_pii_integrity --model facility
    python manage.py check_pii_integrity --model patient staffprofile
"""

from __future__ import annotations

import logging
from collections.abc import Generator
from typing import Any

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Model

from hmis.apps.core.kms import get_kms_provider

logger = logging.getLogger(__name__)


def _encrypted_fields(model: type[Model]) -> list[str]:
    """Return the plain-text names of encrypted PII fields on *model*."""
    field_names: list[str] = []
    for field in model._meta.get_fields():
        name: str = field.name
        if name.endswith("_encrypted"):
            plain = name[: -len("_encrypted")]
            # Only include fields that have a matching property on the model
            if hasattr(model, plain) and isinstance(getattr(model, plain, None), property):
                field_names.append(plain)
    return field_names


def _objects_with_data(
    model: type[Model], field_name: str, batch_size: int = 200
) -> Generator[Model, None, None]:
    """Yield model instances that have a non-empty encrypted field."""
    encrypted_attr = f"{field_name}_encrypted"
    queryset = model.objects.exclude(**{f"{encrypted_attr}__in": ["", None]}).iterator(
        chunk_size=batch_size
    )
    yield from queryset


class Command(BaseCommand):
    help = "Validate PII field encryption integrity across all models."

    def add_arguments(self, parser):
        parser.add_argument(
            "--model",
            action="append",
            dest="model_names",
            default=None,
            help="Only check the given model name (repeatable, case-insensitive).",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="Number of objects to fetch per query batch (default: 200).",
        )
        parser.add_argument(
            "--fail-fast",
            action="store_true",
            default=False,
            help="Stop on first decryption failure.",
        )

    def handle(self, **options):
        model_names: list[str] | None = options["model_names"]
        batch_size: int = options["batch_size"]
        fail_fast: bool = options["fail_fast"]

        kms = get_kms_provider()
        if not kms.is_healthy():
            raise CommandError("KMS provider health check failed — cannot validate PII.")

        all_models = apps.get_models()
        total_checks = 0
        total_failures = 0
        results: list[dict[str, Any]] = []

        for model in all_models:
            encrypted_fields = _encrypted_fields(model)
            if not encrypted_fields:
                continue

            name_label = f"{model._meta.app_label}.{model.__name__}"
            if model_names and model.__name__.lower() not in {n.lower() for n in model_names}:
                continue

            self.stdout.write(f"\n  {name_label}")

            for field_name in encrypted_fields:
                checked = 0
                failures = 0
                for obj in _objects_with_data(model, field_name, batch_size):
                    checked += 1
                    try:
                        _ = getattr(obj, field_name)
                    except Exception as e:
                        failures += 1
                        results.append(
                            {
                                "model": name_label,
                                "field": field_name,
                                "pk": obj.pk,
                                "error": str(e),
                            }
                        )
                        self.stdout.write(self.style.ERROR(f"    ✗ {field_name} pk={obj.pk}: {e}"))
                        if fail_fast:
                            raise CommandError(
                                f"Decryption failed for {name_label}.{field_name} pk={obj.pk}"
                            )

                    if checked % 500 == 0:
                        self.stdout.write(f"    … {checked} objects checked")

                if checked == 0:
                    self.stdout.write(f"    ~ {field_name}: no encrypted data found")
                elif failures == 0:
                    self.stdout.write(
                        self.style.SUCCESS(f"    ✓ {field_name}: {checked} objects OK")
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(f"    ⚠ {field_name}: {failures}/{checked} failures")
                    )

                total_checks += checked
                total_failures += failures

        self.stdout.write("\n" + "=" * 60)
        if total_failures == 0:
            self.stdout.write(
                self.style.SUCCESS(f"All PII integrity checks passed ({total_checks} objects).")
            )
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"{total_failures} decryption failure(s) out of {total_checks} checked objects."
                )
            )
            for r in results:
                self.stdout.write(f"  {r['model']}.{r['field']} pk={r['pk']}: {r['error']}")
