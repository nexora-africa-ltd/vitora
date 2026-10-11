# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create missing organization-level Azure Blob backup destinations in staging.

Run ``python manage.py backfill_hub_backup_destinations --dry-run`` to preview,
then rerun without ``--dry-run`` in staging. Optional ``--organization`` accepts
an organization ID or slug. Requires Azure storage account and container settings.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Organization
from hmis.apps.licensing.models import HubBackupDestination


class Command(BaseCommand):
    help = "Create missing organization-default hub backup destinations in staging."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--organization", help="Organization ID or slug to backfill.")

    def handle(self, *args, **options):
        if getattr(settings, "ENVIRONMENT", "") != "staging":
            raise CommandError("This command is restricted to staging.")
        account = str(getattr(settings, "AZURE_HUB_BACKUP_STORAGE_ACCOUNT", "") or "").strip()
        container = str(getattr(settings, "AZURE_HUB_BACKUP_STORAGE_CONTAINER", "") or "").strip()
        if not account or not container:
            raise CommandError("Azure hub backup storage account and container must be configured.")
        organizations = Organization.objects.all()
        selector = options.get("organization")
        if selector:
            organizations = (
                organizations.filter(slug=selector)
                if not selector.isdigit()
                else organizations.filter(pk=int(selector))
            )
        created = 0
        endpoint = f"https://{account}.blob.core.windows.net/{container}"
        for organization in organizations:
            if HubBackupDestination.objects.filter(
                organization=organization, facility=None
            ).exists():
                continue
            self.stdout.write(f"Would create default destination for {organization.slug}")
            if not options["dry_run"]:
                HubBackupDestination.objects.create(
                    organization=organization,
                    enabled=True,
                    target_type=HubBackupDestination.TargetType.S3_COMPATIBLE,
                    endpoint_url=endpoint,
                    residency_country="KE",
                    retention_days=30,
                )
            created += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Would create' if options['dry_run'] else 'Created'} {created} destination(s)."
            )
        )
