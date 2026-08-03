"""Backfill missing tenant fields on historical StockBatch rows.

Safe inference rules:
- infer facility only when exactly one candidate is found,
- infer organization from facility and consistent related sources,
- skip rows with conflicts or insufficient evidence.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from hmis.apps.core.models import Facility
from hmis.apps.pharmacy.models import StockBatch


class Command(BaseCommand):
    help = "Backfill missing StockBatch facility/organization using safe related-record inference."

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Limit processing to batches linked to this facility via any inference source.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist changes. By default, this command runs in dry-run mode.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        scope_facility_id = options.get("facility_id")

        queryset = (
            StockBatch.objects.filter(Q(facility__isnull=True) | Q(organization__isnull=True))
            .select_related("facility", "purchase_order__facility", "store_location__facility")
            .order_by("id")
        )

        if scope_facility_id:
            queryset = queryset.filter(
                Q(purchase_order__facility_id=scope_facility_id)
                | Q(store_location__facility_id=scope_facility_id)
                | Q(dispensings__facility_id=scope_facility_id)
            ).distinct()

        total = queryset.count()
        if not total:
            self.stdout.write(self.style.SUCCESS("No StockBatch rows need tenant backfill."))
            return

        self.stdout.write(
            ("Applying" if apply_changes else "Dry run")
            + f" tenant backfill for {total} StockBatch row(s)..."
        )

        candidates = 0
        skipped_no_inference = 0
        skipped_conflict = 0
        skipped_org_mismatch = 0

        for batch in queryset.iterator(chunk_size=300):
            inference = self._infer_tenant(batch)

            if inference["status"] == "no_inference":
                skipped_no_inference += 1
                continue
            if inference["status"] == "conflict":
                skipped_conflict += 1
                continue

            facility_id = inference["facility_id"]
            organization_id = inference["organization_id"]
            facility_org_id = inference["facility_org_id"]

            if facility_org_id and organization_id and facility_org_id != organization_id:
                skipped_org_mismatch += 1
                continue

            organization_id = organization_id or facility_org_id
            if not facility_id or not organization_id:
                skipped_no_inference += 1
                continue

            if apply_changes:
                with transaction.atomic():
                    batch.facility_id = facility_id
                    batch.organization_id = organization_id
                    batch.save(update_fields=["facility", "organization"])

            candidates += 1

        style = self.style.SUCCESS if apply_changes else self.style.WARNING
        self.stdout.write(style("Backfill complete."))
        self.stdout.write(f"Total scanned: {total}")
        self.stdout.write(("Updated" if apply_changes else "Would update") + f": {candidates}")
        self.stdout.write(f"Skipped (no safe inference): {skipped_no_inference}")
        self.stdout.write(f"Skipped (conflicting facility/org sources): {skipped_conflict}")
        self.stdout.write(f"Skipped (facility/org mismatch): {skipped_org_mismatch}")

    def _infer_tenant(self, batch: StockBatch) -> dict:
        facility_candidates = set()
        organization_candidates = set()

        def add_facility(facility_id):
            if facility_id:
                facility_candidates.add(facility_id)

        def add_organization(organization_id):
            if organization_id:
                organization_candidates.add(organization_id)

        add_facility(batch.facility_id)
        add_organization(batch.organization_id)
        if getattr(batch, "facility", None):
            add_organization(batch.facility.organization_id)

        purchase_order = getattr(batch, "purchase_order", None)
        if purchase_order:
            add_facility(purchase_order.facility_id)
            add_organization(purchase_order.organization_id)
            if getattr(purchase_order, "facility", None):
                add_organization(purchase_order.facility.organization_id)

        store_location = getattr(batch, "store_location", None)
        if store_location:
            add_facility(store_location.facility_id)
            add_organization(store_location.organization_id)
            if getattr(store_location, "facility", None):
                add_organization(store_location.facility.organization_id)

        dispensing_facilities = set(
            batch.dispensings.exclude(facility_id__isnull=True).values_list(
                "facility_id", flat=True
            )
        )
        facility_candidates.update(dispensing_facilities)
        organization_candidates.update(
            batch.dispensings.exclude(organization_id__isnull=True).values_list(
                "organization_id", flat=True
            )
        )

        if not facility_candidates:
            return {"status": "no_inference"}
        if len(facility_candidates) > 1:
            return {"status": "conflict"}

        facility_id = next(iter(facility_candidates))
        facility_org_id = Facility.objects.values_list("organization_id", flat=True).get(
            pk=facility_id
        )
        add_organization(facility_org_id)

        if len(organization_candidates) > 1:
            return {"status": "conflict"}

        organization_id = next(iter(organization_candidates)) if organization_candidates else None
        return {
            "status": "ok",
            "facility_id": facility_id,
            "organization_id": organization_id,
            "facility_org_id": facility_org_id,
        }
