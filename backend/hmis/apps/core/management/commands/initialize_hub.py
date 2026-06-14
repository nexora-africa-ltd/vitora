"""
Initialize a hub installation with all required reference data.

Chains the production-essential seed/load/import commands in a safe,
idempotent order. Used by the hub installers (Windows + Linux) to populate
subscription plans, RBAC roles, clinical reference catalogues (ICD-10, LOINC,
drugs), CDS rules, KEPI schedule, notifiable diseases, and other lookup data
that the application needs to be functional out of the box.

Demo / fixture data (seed_demo_*, seed_rich_*, seed_pharmacy_stock,
seed_facilities, seed_fhir_test_data, etc.) is intentionally excluded -
those are for development/staging only.

Safe to re-run. Individual command failures are logged but do not abort
the rest of the sequence (so a single optional catalogue not having its
CSV bundled won't break the whole bootstrap).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


@dataclass(frozen=True)
class SeedStep:
    command: str
    description: str
    # Whether failure should abort the whole sequence.
    required: bool = False
    # Extra kwargs to pass to call_command.
    options: tuple = ()


# Order matters: roles/plans first, then reference catalogues, then
# things that may depend on those catalogues (e.g. CDS rules reference
# ICD codes; quality measures reference LOINC).
SEED_STEPS: tuple[SeedStep, ...] = (
    # --- Core platform ---
    SeedStep("seed_subscription_plans", "Subscription plans (FREE/BASIC/PRO/ENT)", required=True),
    SeedStep("load_default_roles", "Default RBAC roles & permissions", required=True),
    SeedStep("sync_role_permissions", "Sync role matrix to Django Group permissions"),
    SeedStep("setup_allied_health_permissions", "Allied health permission groups"),
    SeedStep("seed_feature_flags", "Feature flags"),
    SeedStep("init_pki_ca", "PKI root CA for document signing"),
    # --- Clinical reference catalogues ---
    SeedStep(
        "import_icd10",
        "ICD-10 diagnosis codes",
        options=("data/icd10_kenya_common.csv",),
    ),
    SeedStep(
        "import_icd11",
        "ICD-11 diagnosis codes",
        options=("data/ICD-11.csv",),
    ),
    SeedStep("import_loinc", "LOINC lab codes"),
    SeedStep("import_drugs", "Drug catalogue (Kenya medicines)"),
    SeedStep("seed_snomed_common", "Common SNOMED CT codes"),
    SeedStep("seed_kenhdd_elements", "Kenya Health Data Dictionary elements"),
    # --- Clinical templates & rules ---
    SeedStep("load_clinical_templates", "Clinical note templates"),
    SeedStep("seed_cds_rules", "Clinical decision support rules"),
    SeedStep("seed_discharge_templates", "Discharge summary templates"),
    # --- Service catalogues ---
    SeedStep("seed_service_catalog", "Billable service catalogue"),
    SeedStep("seed_procedure_catalog", "Procedure catalogue"),
    SeedStep("seed_imaging_catalog", "Imaging procedure catalogue"),
    SeedStep("seed_surgical_procedures", "Surgical procedure catalogue"),
    # --- Laboratory ---
    SeedStep("load_lab_reference_ranges", "Lab reference ranges"),
    SeedStep("seed_analyzer_templates", "Lab analyzer templates"),
    SeedStep("seed_autoverify_defaults", "Lab auto-verification defaults"),
    SeedStep("seed_worksheet_templates", "Lab worksheet templates"),
    # --- Immunizations & MCH ---
    SeedStep("seed_vaccines", "Vaccine catalogue"),
    SeedStep("seed_kepi_schedule", "KEPI immunization schedule"),
    # --- Public health surveillance ---
    SeedStep("seed_notifiable_diseases", "Notifiable diseases (IDSR)"),
    SeedStep("seed_outbreak_thresholds", "Outbreak detection thresholds"),
    # --- Inpatient / theatre / ER ---
    SeedStep("seed_bed_assignment_rules", "Bed assignment rules"),
    SeedStep("seed_theatre_roles", "Theatre staff roles"),
    SeedStep("seed_er_beds", "ER bed catalogue"),
    # --- Allied health & quality ---
    SeedStep("seed_allied_health_data", "Allied health reference data"),
    SeedStep("seed_quality_measures", "Quality measure definitions"),
)


class Command(BaseCommand):
    help = (
        "Initialize a hub installation with all production reference data "
        "(subscription plans, RBAC roles, ICD-10, LOINC, drugs, CDS rules, "
        "KEPI schedule, notifiable diseases, etc). Idempotent and safe to re-run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--only",
            nargs="+",
            metavar="COMMAND",
            help="Run only the specified seed commands (by name).",
        )
        parser.add_argument(
            "--skip",
            nargs="+",
            metavar="COMMAND",
            default=[],
            help="Skip the specified seed commands.",
        )
        parser.add_argument(
            "--continue-on-error",
            action="store_true",
            default=True,
            help="Continue running remaining seeds even if one fails (default).",
        )
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Abort on the first failure (overrides --continue-on-error).",
        )

    def handle(self, *args, **options):
        only = set(options.get("only") or [])
        skip = set(options.get("skip") or [])
        strict = options.get("strict", False)

        steps = [s for s in SEED_STEPS if (not only or s.command in only) and s.command not in skip]

        if not steps:
            self.stdout.write(self.style.WARNING("No seed steps selected."))
            return

        self.stdout.write(
            self.style.MIGRATE_HEADING(f"Initializing hub: {len(steps)} seed step(s)\n")
        )

        succeeded: list[str] = []
        failed: list[tuple[str, str]] = []
        skipped: list[str] = []

        for idx, step in enumerate(steps, start=1):
            prefix = f"  [{idx}/{len(steps)}] {step.command}"
            self.stdout.write(f"{prefix} - {step.description} ...", ending=" ")
            self.stdout.flush()

            start = time.monotonic()
            try:
                call_command(step.command, *step.options, verbosity=0)
            except SystemExit as exc:  # some commands call sys.exit on missing data
                msg = f"exited with code {exc.code}"
                if step.required or strict:
                    self.stdout.write(self.style.ERROR(f"FAILED ({msg})"))
                    raise CommandError(f"Required seed '{step.command}' failed: {msg}") from exc
                self.stdout.write(self.style.WARNING(f"SKIPPED ({msg})"))
                skipped.append(step.command)
            except Exception as exc:  # noqa: BLE001
                elapsed = time.monotonic() - start
                msg = f"{type(exc).__name__}: {exc}"
                if step.required or strict:
                    self.stdout.write(self.style.ERROR(f"FAILED in {elapsed:.1f}s"))
                    self.stdout.write(self.style.ERROR(f"      {msg}"))
                    raise CommandError(f"Required seed '{step.command}' failed: {msg}") from exc
                self.stdout.write(self.style.WARNING(f"FAILED in {elapsed:.1f}s (continuing)"))
                self.stdout.write(self.style.WARNING(f"      {msg}"))
                failed.append((step.command, msg))
            else:
                elapsed = time.monotonic() - start
                self.stdout.write(self.style.SUCCESS(f"OK ({elapsed:.1f}s)"))
                succeeded.append(step.command)

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Hub initialization summary"))
        self.stdout.write(self.style.SUCCESS(f"  Succeeded: {len(succeeded)}"))
        if skipped:
            self.stdout.write(
                self.style.WARNING(f"  Skipped:   {len(skipped)} ({', '.join(skipped)})")
            )
        if failed:
            self.stdout.write(self.style.WARNING(f"  Failed:    {len(failed)}"))
            for cmd, msg in failed:
                self.stdout.write(self.style.WARNING(f"    - {cmd}: {msg}"))
            self.stdout.write(
                self.style.WARNING(
                    "\nSome optional seeds failed. The hub is functional but some "
                    "reference data is missing. Re-run 'python manage.py initialize_hub' "
                    "after fixing the underlying issue."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("\nAll seed steps completed successfully."))
