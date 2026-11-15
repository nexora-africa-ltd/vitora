# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Management command to seed a facility's canonical DHA ICHI procedure catalogue.

Run: ``python manage.py seed_procedure_catalog --facility-id <id>``.
Inputs: an optional facility ID, ``--dry-run``, ``--link-billing``, and
``--replace-legacy-catalog`` for explicit removal of old ``PROC-*`` seed rows.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from hmis.apps.procedures.models import ProcedureCatalog
from hmis.apps.procedures.services import seed_ichi_catalog_for_facility

User = get_user_model()


def _resolve_facility(facility_id=None):
    """
    Resolve organization + facility for seeded records.

    Priority:
    1. Explicit ``--facility-id`` primary key
    2. Demo HQ facility (mfl_code=DEMO-HQ-001)
    3. First active facility in the database
    """
    from hmis.apps.core.models import Facility

    if facility_id:
        try:
            fac = Facility.objects.select_related("organization").get(
                pk=facility_id, is_active=True
            )
            return fac.organization, fac
        except Facility.DoesNotExist:
            pass

    # Fallback: demo HQ
    fac = (
        Facility.objects.select_related("organization")
        .filter(mfl_code="DEMO-HQ-001", is_active=True)
        .first()
    )
    if fac:
        return fac.organization, fac

    # Last resort: first active facility
    fac = Facility.objects.select_related("organization").filter(is_active=True).first()
    if fac:
        return fac.organization, fac

    return None, None


class Command(BaseCommand):
    help = "Seed a facility with canonical DHA ICHI procedure concepts"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without making changes",
        )
        parser.add_argument(
            "--link-billing",
            action="store_true",
            help="Create/link billing.Service records for each procedure",
        )
        parser.add_argument(
            "--facility-id",
            type=int,
            default=None,
            help="Primary key of the facility to assign (default: DEMO-HQ-001 or first active)",
        )
        parser.add_argument(
            "--replace-legacy-catalog",
            action="store_true",
            help="Delete this facility's legacy PROC-* seed rows before adding DHA ICHI concepts.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        link_billing = options["link_billing"]
        replace_legacy_catalog = options["replace_legacy_catalog"]

        organization, facility = _resolve_facility(options.get("facility_id"))
        if not facility:
            self.stderr.write(
                self.style.ERROR(
                    "No facility found. Create a facility first or pass --facility-id <id>."
                )
            )
            return

        self.stdout.write(
            f"Seeding for: {organization.name} / {facility.name} (facility={facility.id})\n"
        )

        result = seed_ichi_catalog_for_facility(
            facility,
            replace_legacy_catalog=replace_legacy_catalog,
            dry_run=dry_run,
        )
        if result["legacy_removed"]:
            prefix = "Would remove" if dry_run else "Removed"
            self.stdout.write(f"{prefix} {result['legacy_removed']} legacy PROC-* procedure(s).")
        action = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{action} {result['created']} procedure(s), "
                f"updated {result['updated']}, skipped {result['skipped']} existing."
            )
        )

        if link_billing:
            self._link_billing_services(facility, dry_run)

    def _link_billing_services(self, facility, dry_run: bool) -> None:
        """Create billing.Service records for each procedure and link them."""
        from hmis.apps.billing.models import Service, ServiceCategory

        # Ensure PROC category exists
        proc_category, cat_created = ServiceCategory.objects.get_or_create(
            code="PROC",
            defaults={
                "name": "Procedures",
                "description": "Medical and surgical procedures",
            },
        )
        if cat_created and not dry_run:
            self.stdout.write(self.style.SUCCESS("  Created ServiceCategory: PROC"))

        from hmis.apps.core.utils import get_system_user

        system_user = User.objects.filter(is_superuser=True).first()
        if not system_user:
            system_user = get_system_user()

        linked = 0
        svc_created = 0

        for catalog_entry in ProcedureCatalog.objects.filter(
            facility=facility, billing_service__isnull=True
        ):
            if not catalog_entry.base_fee:
                continue

            # Check if a Service with this code already exists
            service = Service.objects.filter(facility=facility, code=catalog_entry.code).first()

            if not service:
                if dry_run:
                    self.stdout.write(
                        f"  WOULD CREATE Service: {catalog_entry.code} - "
                        f"{catalog_entry.name} @ KES {catalog_entry.base_fee}"
                    )
                else:
                    service = Service.objects.create(
                        category=proc_category,
                        code=catalog_entry.code,
                        name=catalog_entry.name,
                        description=f"Procedure: {catalog_entry.name}",
                        unit_price=Decimal(str(catalog_entry.base_fee)),
                        sha_code=catalog_entry.sha_tariff_code or "",
                        is_active=True,
                        created_by=system_user,
                        organization=facility.organization,
                        facility=facility,
                    )
                svc_created += 1

            if service and not dry_run:
                catalog_entry.billing_service = service
                catalog_entry.save(update_fields=["billing_service"])
            linked += 1

        action = "Would link" if dry_run else "Linked"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {linked} procedure(s) to billing services "
                f"({svc_created} new Service records)."
            )
        )
