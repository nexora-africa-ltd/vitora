"""Bootstrap HealthCloud provider and provider-config defaults."""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Facility, Organization
from hmis.apps.insurance.bootstrap import seed_slade_defaults


class Command(BaseCommand):
    help = "Seed default Slade/HealthCloud providers and provider configs"

    def add_arguments(self, parser):
        parser.add_argument("--organization-id", type=int, help="Target organization ID")
        parser.add_argument(
            "--facility-id", type=int, action="append", help="Target facility ID; repeatable"
        )
        parser.add_argument(
            "--providers-only",
            action="store_true",
            help="Seed providers only (skip provider configs)",
        )

    def handle(self, *args, **options):
        org_id = options.get("organization_id")
        facility_ids = options.get("facility_id") or []
        providers_only = options.get("providers_only", False)

        if org_id:
            organization = Organization.objects.filter(pk=org_id).first()
            if not organization:
                raise CommandError(f"Organization {org_id} not found")
        else:
            organizations = list(Organization.objects.all()[:2])
            if len(organizations) != 1:
                raise CommandError(
                    "Provide --organization-id when multiple/no organizations are present"
                )
            organization = organizations[0]

        facilities = []
        if facility_ids:
            facilities = list(
                Facility.objects.filter(
                    organization=organization, pk__in=facility_ids, is_active=True
                )
            )
            if not facilities:
                raise CommandError("No matching active facilities for provided --facility-id")

        result = seed_slade_defaults(
            organization=organization,
            facilities=facilities,
            create_provider_configs=not providers_only,
        )

        self.stdout.write(self.style.SUCCESS(f"Bootstrap complete for org={organization.id}"))
        self.stdout.write(str(result))
