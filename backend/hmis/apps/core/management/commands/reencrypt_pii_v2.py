# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Re-encrypt descriptor-backed Django PII storage from v1 to organization v2.

Run ``python manage.py reencrypt_pii_v2``. Supports ``--organization`` (ID or
slug), repeatable ``--model app_label.ModelName``, ``--batch-size``, and
``--dry-run``. Output contains aggregate counts only and never PII values.
"""

from __future__ import annotations

from django.apps import apps
from django.conf import settings
from django.core.exceptions import FieldDoesNotExist
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Model, Q

from hmis.apps.core.kms.base import DecryptionError
from hmis.apps.core.models import Organization
from hmis.apps.core.pii_v2 import OrganizationPIIEncryptionService, resolve_pii_organization


class Command(BaseCommand):
    """Migrate all installed models that use encrypted_pii_property storage descriptors."""

    help = "Re-encrypt all descriptor-backed PII to v2 and rebuild organization HMAC indexes."

    def add_arguments(self, parser):
        parser.add_argument("--organization", help="Organization primary key or slug.")
        parser.add_argument(
            "--model", action="append", help="Limit migration to app_label.ModelName."
        )
        parser.add_argument("--batch-size", type=int, default=500)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if not settings.ORGANIZATION_PII_ENCRYPTION_ENABLED:
            raise CommandError(
                "ORGANIZATION_PII_ENCRYPTION_ENABLED must be enabled before running this migration."
            )
        if options["batch_size"] < 1:
            raise CommandError("--batch-size must be at least 1")

        organization_ids = self._organization_ids(options.get("organization"))
        models = self._models_with_pii(options.get("model"))
        counts = {"migrated": 0, "current": 0, "unresolvable": 0, "unsupported": 0}
        service = OrganizationPIIEncryptionService()

        for model, descriptors in models:
            self._migrate_model(
                model,
                descriptors,
                organization_ids,
                options["batch_size"],
                options["dry_run"],
                service,
                counts,
            )

        verb = "Would migrate" if options["dry_run"] else "Migrated"
        self.stdout.write(
            f"{verb} {counts['migrated']} record(s); skipped {counts['current']} current record(s), "
            f"{counts['unresolvable']} unresolvable record(s), and "
            f"{counts['unsupported']} unsupported record(s)."
        )

    def _organization_ids(self, selector: str | None) -> set[int] | None:
        if not selector:
            return None
        organizations = Organization.objects.filter(Q(pk=selector) | Q(slug=selector))
        if not organizations.exists():
            raise CommandError("Organization was not found.")
        return set(organizations.values_list("pk", flat=True))

    def _models_with_pii(
        self, requested_labels: list[str] | None
    ) -> list[tuple[type[Model], list[str]]]:
        """Discover descriptors created by encrypted_pii_property and their storage fields."""
        requested = {label.lower() for label in requested_labels or []}
        discovered = []
        available = set()
        for model in apps.get_models():
            label = model._meta.label_lower
            available.add(label)
            if requested and label not in requested:
                continue
            descriptors = []
            for attribute_name in dir(model):
                descriptor = getattr(model, attribute_name, None)
                field_name = getattr(
                    getattr(descriptor, "fget", None), "_encrypted_pii_field_name", None
                )
                if field_name and self._has_storage_field(model, field_name):
                    descriptors.append(field_name)
            if descriptors:
                discovered.append((model, sorted(set(descriptors))))
        unknown = requested - available
        if unknown:
            raise CommandError(f"Unknown model selector(s): {', '.join(sorted(unknown))}.")
        return discovered

    @staticmethod
    def _has_storage_field(model: type[Model], field_name: str) -> bool:
        try:
            model._meta.get_field(f"{field_name}_encrypted")
        except FieldDoesNotExist:
            return False
        return True

    def _migrate_model(
        self,
        model: type[Model],
        descriptors: list[str],
        organization_ids: set[int] | None,
        batch_size: int,
        dry_run: bool,
        service: OrganizationPIIEncryptionService,
        counts: dict[str, int],
    ) -> None:
        last_pk = None
        while True:
            queryset = model._default_manager.order_by("pk")
            if last_pk is not None:
                queryset = queryset.filter(pk__gt=last_pk)
            records = list(queryset[:batch_size])
            if not records:
                return
            last_pk = records[-1].pk
            for record in records:
                self._migrate_record(
                    record, descriptors, organization_ids, dry_run, service, counts
                )

    def _migrate_record(
        self,
        record: Model,
        descriptors: list[str],
        organization_ids: set[int] | None,
        dry_run: bool,
        service: OrganizationPIIEncryptionService,
        counts: dict[str, int],
    ) -> None:
        active_fields = [
            field_name
            for field_name in descriptors
            if getattr(record, f"{field_name}_encrypted", "")
        ]
        if not active_fields:
            return

        organization = resolve_pii_organization(record)
        if organization is None:
            counts["unresolvable"] += 1
            return
        if organization_ids is not None and organization.pk not in organization_ids:
            return

        values = {}
        for field_name in active_fields:
            try:
                value = getattr(record, field_name)
            except (AttributeError, DecryptionError, TypeError, ValueError):
                counts["unsupported"] += 1
                return
            if not value:
                counts["unsupported"] += 1
                return
            values[field_name] = value

        update_fields = []
        for field_name, value in values.items():
            encrypted_field = f"{field_name}_encrypted"
            hmac_field = f"{field_name}_hmac"
            encrypted = getattr(record, encrypted_field)
            expected_hmac = service.compute_hmac(organization, value)
            hmac_needs_update = (
                hasattr(record, hmac_field) and getattr(record, hmac_field) != expected_hmac
            )
            if not encrypted.startswith("v2.") or hmac_needs_update:
                setattr(record, field_name, value)
                update_fields.append(encrypted_field)
                if hasattr(record, hmac_field):
                    update_fields.append(hmac_field)

        if not update_fields:
            counts["current"] += 1
            return
        counts["migrated"] += 1
        if not dry_run:
            record.save(update_fields=list(dict.fromkeys(update_fields)))
