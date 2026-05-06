"""
Management command to seed default delta check and auto-verify rules.

Seeds commonly-used delta check thresholds and auto-verify conditions
for all facilities (or a specific facility) that have tests in the
TestCatalog matching the default codes.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import Facility
from hmis.apps.laboratory.autoverify.models import AutoVerifyConfig, AutoVerifyRule, DeltaCheckRule
from hmis.apps.laboratory.models import TestCatalog

DELTA_CHECK_DEFAULTS = [
    {
        "test_code": "HGB",
        "threshold_percent": Decimal("33"),
        "lookback_hours": 72,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "WBC",
        "threshold_percent": Decimal("50"),
        "lookback_hours": 72,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "PLT",
        "threshold_percent": Decimal("50"),
        "lookback_hours": 72,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "CR",
        "threshold_percent": Decimal("50"),
        "lookback_hours": 48,
        "action": "BLOCK_RELEASE",
    },
    {
        "test_code": "K",
        "threshold_absolute": Decimal("1.5"),
        "lookback_hours": 24,
        "action": "BLOCK_RELEASE",
    },
    {
        "test_code": "NA",
        "threshold_absolute": Decimal("10"),
        "lookback_hours": 24,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "GLU",
        "threshold_percent": Decimal("40"),
        "lookback_hours": 24,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "CA",
        "threshold_percent": Decimal("20"),
        "lookback_hours": 48,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "MG",
        "threshold_percent": Decimal("25"),
        "lookback_hours": 48,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "UREA",
        "threshold_percent": Decimal("50"),
        "lookback_hours": 48,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "ALT",
        "threshold_percent": Decimal("50"),
        "lookback_hours": 72,
        "action": "FLAG_FOR_REVIEW",
    },
    {
        "test_code": "AST",
        "threshold_percent": Decimal("50"),
        "lookback_hours": 72,
        "action": "FLAG_FOR_REVIEW",
    },
]

AUTO_VERIFY_CONDITIONS = [
    AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE,
    AutoVerifyRule.ConditionType.DELTA_CHECK_PASS,
    AutoVerifyRule.ConditionType.NO_CRITICAL_FLAG,
    AutoVerifyRule.ConditionType.NUMERIC_RESULT,
    AutoVerifyRule.ConditionType.NOT_AMENDED,
]


class Command(BaseCommand):
    """Seed default delta check rules, auto-verify rules, and config."""

    help = (
        "Seed default delta check rules, auto-verify rules, and auto-verify "
        "config for all facilities (or a specific facility). Only creates "
        "rules for tests that exist in the TestCatalog."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility",
            type=int,
            help="Seed for a specific facility ID only. If omitted, seeds all facilities.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        facility_id = options.get("facility")

        if facility_id:
            facilities = Facility.objects.filter(pk=facility_id)
            if not facilities.exists():
                self.stderr.write(self.style.ERROR(f"Facility {facility_id} not found."))
                return
        else:
            facilities = Facility.objects.all()

        facility_count = facilities.count()
        self.stdout.write(f"Seeding auto-verify defaults for {facility_count} facility(ies)...")

        # Resolve tests from catalog
        test_map: dict[str, TestCatalog] = {}
        for d in DELTA_CHECK_DEFAULTS:
            test = TestCatalog.objects.filter(code=d["test_code"]).first()
            if test:
                test_map[d["test_code"]] = test

        if not test_map:
            self.stderr.write(
                self.style.WARNING(
                    "No matching tests found in TestCatalog. "
                    "Ensure tests with codes HGB, WBC, PLT, K, NA, etc. exist."
                )
            )
            return

        self.stdout.write(f"  Found {len(test_map)} matching tests: {', '.join(test_map.keys())}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\nDRY RUN - no changes will be made"))
            for facility in facilities:
                self.stdout.write(f"\n  Facility: {facility.name}")
                self.stdout.write(f"    Would create up to {len(test_map)} delta check rules")
                self.stdout.write(
                    f"    Would create up to {len(test_map) * len(AUTO_VERIFY_CONDITIONS)} auto-verify rules"
                )
                self.stdout.write("    Would create auto-verify config (if missing)")
            return

        total_delta = 0
        total_verify = 0
        total_config = 0

        for facility in facilities:
            org = facility.organization
            delta_created, verify_created, config_created = self._seed_facility(
                facility, org, test_map
            )
            total_delta += delta_created
            total_verify += verify_created
            total_config += config_created
            self.stdout.write(
                f"  {facility.name}: "
                f"{delta_created} delta rules, "
                f"{verify_created} verify rules, "
                f"{'config created' if config_created else 'config exists'}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone! Created {total_delta} delta check rules, "
                f"{total_verify} auto-verify rules, "
                f"{total_config} configs across {facility_count} facility(ies)."
            )
        )

    @transaction.atomic
    def _seed_facility(
        self, facility: Facility, org, test_map: dict[str, TestCatalog]
    ) -> tuple[int, int, int]:
        """Seed rules for a single facility. Returns (delta_created, verify_created, config_created)."""
        delta_created = 0
        verify_created = 0

        # Delta check rules
        for d in DELTA_CHECK_DEFAULTS:
            test = test_map.get(d["test_code"])
            if not test:
                continue
            _, created = DeltaCheckRule.objects.get_or_create(
                facility=facility,
                test=test,
                defaults={
                    "check_type": "ABSOLUTE" if d.get("threshold_absolute") else "PERCENT",
                    "threshold_percent": d.get("threshold_percent"),
                    "threshold_absolute": d.get("threshold_absolute"),
                    "lookback_hours": d["lookback_hours"],
                    "action": d["action"],
                    "organization": org,
                },
            )
            if created:
                delta_created += 1

        # Auto-verify rules (for each test that has a delta rule)
        for test in test_map.values():
            for priority, condition in enumerate(AUTO_VERIFY_CONDITIONS, start=1):
                _, created = AutoVerifyRule.objects.get_or_create(
                    facility=facility,
                    test=test,
                    condition_type=condition,
                    defaults={
                        "is_active": True,
                        "priority": priority,
                        "organization": org,
                    },
                )
                if created:
                    verify_created += 1

        # Auto-verify config
        _, config_created = AutoVerifyConfig.objects.get_or_create(
            facility=facility,
            defaults={
                "is_enabled": True,
                "max_auto_verify_percent": 70,
                "max_specimen_age_hours": 24,
                "organization": org,
            },
        )

        return delta_created, verify_created, int(config_created)
