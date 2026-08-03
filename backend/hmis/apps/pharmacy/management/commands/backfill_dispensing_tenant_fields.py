"""Backfill missing tenant fields on historical Dispensing rows.

Safe inference rules:
- infer facility from exactly one matching source (batch, prescription, patient registration),
- infer organization from the inferred facility and/or consistent related org sources,
- skip records when sources conflict or no safe inference is possible.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from hmis.apps.core.models import Facility
from hmis.apps.pharmacy.models import Dispensing


class Command(BaseCommand):
    help = "Backfill missing Dispensing facility/organization using safe related-record inference."

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Limit processing to dispensings linked to this facility via any inference source.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist changes. By default, the command runs in dry-run mode.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        scope_facility_id = options.get("facility_id")

        queryset = (
            Dispensing.objects.filter(Q(facility__isnull=True) | Q(organization__isnull=True))
            .select_related(
                "facility",
                "batch__facility",
                "prescription_item__prescription__facility",
                "patient__registered_at_facility",
            )
            .order_by("id")
        )

        if scope_facility_id:
            queryset = (
                queryset.filter(
                    facility_id=scope_facility_id,
                )
                | queryset.filter(
                    batch__facility_id=scope_facility_id,
                )
                | queryset.filter(
                    prescription_item__prescription__facility_id=scope_facility_id,
                )
                | queryset.filter(
                    patient__registered_at_facility_id=scope_facility_id,
                )
            )
            queryset = queryset.distinct().order_by("id")

        total = queryset.count()
        if not total:
            self.stdout.write(self.style.SUCCESS("No Dispensing rows need facility backfill."))
            return

        self.stdout.write(
            ("Applying" if apply_changes else "Dry run")
            + f" tenant backfill for {total} Dispensing row(s)..."
        )

        candidates = 0
        skipped_no_inference = 0
        skipped_conflict = 0
        skipped_org_mismatch = 0

        for dispensing in queryset.iterator(chunk_size=500):
            inference = self._infer_tenant(dispensing)

            if inference["status"] == "no_inference":
                skipped_no_inference += 1
                continue
            if inference["status"] == "conflict":
                skipped_conflict += 1
                continue

            facility_id = inference["facility_id"]
            organization_id = inference["organization_id"]

            if not facility_id:
                skipped_no_inference += 1
                continue

            facility_org_id = inference["facility_org_id"]
            if facility_org_id and organization_id and facility_org_id != organization_id:
                skipped_org_mismatch += 1
                continue

            organization_id = organization_id or facility_org_id
            if not organization_id:
                skipped_no_inference += 1
                continue

            if apply_changes:
                with transaction.atomic():
                    dispensing.facility_id = facility_id
                    dispensing.organization_id = organization_id
                    dispensing.save(update_fields=["facility", "organization"])

            candidates += 1

        style = self.style.SUCCESS if apply_changes else self.style.WARNING
        self.stdout.write(style("Backfill complete."))
        self.stdout.write(f"Total scanned: {total}")
        self.stdout.write(("Updated" if apply_changes else "Would update") + f": {candidates}")
        self.stdout.write(f"Skipped (no safe inference): {skipped_no_inference}")
        self.stdout.write(f"Skipped (conflicting facility/org sources): {skipped_conflict}")
        self.stdout.write(f"Skipped (facility/org mismatch): {skipped_org_mismatch}")

    def _infer_tenant(self, dispensing) -> dict:
        facility_candidates = set()
        organization_candidates = set()

        def add_facility(facility_id):
            if facility_id:
                facility_candidates.add(facility_id)

        def add_organization(organization_id):
            if organization_id:
                organization_candidates.add(organization_id)

        add_facility(dispensing.facility_id)
        add_organization(dispensing.organization_id)
        if getattr(dispensing, "facility", None):
            add_organization(dispensing.facility.organization_id)

        batch = getattr(dispensing, "batch", None)
        if batch:
            add_facility(batch.facility_id)
            add_organization(batch.organization_id)
            if getattr(batch, "facility", None):
                add_organization(batch.facility.organization_id)

        rx_item = getattr(dispensing, "prescription_item", None)
        prescription = getattr(rx_item, "prescription", None) if rx_item else None
        if prescription:
            add_facility(prescription.facility_id)
            add_organization(prescription.organization_id)
            if getattr(prescription, "facility", None):
                add_organization(prescription.facility.organization_id)

        patient = getattr(dispensing, "patient", None)
        if patient:
            add_facility(patient.registered_at_facility_id)
            add_organization(patient.organization_id)
            if getattr(patient, "registered_at_facility", None):
                add_organization(patient.registered_at_facility.organization_id)

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
