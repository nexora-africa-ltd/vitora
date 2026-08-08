"""Backfill missing organization on insurance enrollments."""

from django.core.management.base import BaseCommand

from hmis.apps.insurance.models import PatientInsurance


class Command(BaseCommand):
    help = (
        "Repair PatientInsurance rows where organization is NULL by inferring "
        "organization from patient and/or provider plan. "
        "Runs in dry-run mode unless --apply is provided."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist updates. Without this flag, command only reports changes.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        fixed = 0
        skipped_no_org = 0
        skipped_conflict = 0

        qs = (
            PatientInsurance.objects.filter(organization__isnull=True)
            .select_related("patient", "plan__provider")
            .order_by("id")
        )

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No enrollments with NULL organization found."))
            return

        self.stdout.write(
            f"Found {total} enrollments with NULL organization. "
            f"Mode: {'APPLY' if apply_changes else 'DRY RUN'}"
        )

        for enrollment in qs:
            patient_org_id = getattr(enrollment.patient, "organization_id", None)
            provider_org_id = getattr(enrollment.plan.provider, "organization_id", None)
            candidates = {oid for oid in (patient_org_id, provider_org_id) if oid is not None}

            if len(candidates) == 0:
                skipped_no_org += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"SKIP id={enrollment.id}: no candidate organization "
                        f"(patient_org={patient_org_id}, provider_org={provider_org_id})"
                    )
                )
                continue

            if len(candidates) > 1:
                skipped_conflict += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"SKIP id={enrollment.id}: conflicting organizations "
                        f"(patient_org={patient_org_id}, provider_org={provider_org_id})"
                    )
                )
                continue

            resolved_org_id = next(iter(candidates))
            if apply_changes:
                enrollment.organization_id = resolved_org_id
                enrollment.save(update_fields=["organization", "updated_at"])
                self.stdout.write(
                    self.style.SUCCESS(
                        f"UPDATED id={enrollment.id}: organization -> {resolved_org_id}"
                    )
                )
            else:
                self.stdout.write(f"DRY RUN id={enrollment.id}: organization -> {resolved_org_id}")
            fixed += 1

        summary = (
            f"Done. fixed={fixed}, "
            f"skipped_no_org={skipped_no_org}, "
            f"skipped_conflict={skipped_conflict}."
        )
        self.stdout.write(self.style.SUCCESS(summary))
