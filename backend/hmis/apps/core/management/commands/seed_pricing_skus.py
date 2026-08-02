# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Seed cart-pricing catalog (price book, SKUs, dependencies, bundles)."""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import SKU, Bundle, PriceBook, SKUDependency

PRICE_BOOK = {
    "code": "STANDARD-2026",
    "name": "Standard Pricing 2026",
    "description": "Cart pricing catalog used by /api/pricing/quote.",
    "currency": "KES",
    "is_active": True,
    "sort_order": 0,
}

SKUS = [
    {
        "code": "base_platform",
        "name": "Core Platform",
        "sku_type": SKU.SKUType.BASE,
        "monthly_price": Decimal("8999.00"),
        "annual_price": Decimal("89990.00"),
        "enabled_feature_keys": [
            "outpatient",
            "emergency",
            "pharmacy",
            "inventory",
            "billing",
            "scheduling",
            "sha_claims",
            "dhis2_reporting",
            "offline_sync",
        ],
        "sort_order": 0,
    },
    {
        "code": "mod_emergency",
        "name": "Emergency / Casualty",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "enabled_feature_keys": ["emergency"],
        "sort_order": 10,
    },
    {
        "code": "mod_inpatient",
        "name": "Inpatient",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("10000.00"),
        "annual_price": Decimal("100000.00"),
        "enabled_feature_keys": ["inpatient"],
        "sort_order": 20,
    },
    {
        "code": "mod_laboratory",
        "name": "Laboratory",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("8000.00"),
        "annual_price": Decimal("80000.00"),
        "enabled_feature_keys": ["laboratory"],
        "sort_order": 30,
    },
    {
        "code": "mod_imaging",
        "name": "Imaging / Radiology",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("7000.00"),
        "annual_price": Decimal("70000.00"),
        "enabled_feature_keys": ["imaging"],
        "sort_order": 40,
    },
    {
        "code": "mod_theatre",
        "name": "Surgical Theatre",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("6000.00"),
        "annual_price": Decimal("60000.00"),
        "enabled_feature_keys": ["theatre"],
        "sort_order": 50,
    },
    {
        "code": "mod_dialysis",
        "name": "Renal Dialysis",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("10000.00"),
        "annual_price": Decimal("100000.00"),
        "enabled_feature_keys": ["dialysis"],
        "sort_order": 60,
    },
    {
        "code": "mod_icu",
        "name": "ICU",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("4000.00"),
        "annual_price": Decimal("40000.00"),
        "enabled_feature_keys": ["icu"],
        "sort_order": 70,
    },
    {
        "code": "mod_hdu",
        "name": "HDU",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("3000.00"),
        "annual_price": Decimal("30000.00"),
        "enabled_feature_keys": ["hdu"],
        "sort_order": 75,
    },
    {
        "code": "mod_nbu",
        "name": "NBU",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("3000.00"),
        "annual_price": Decimal("30000.00"),
        "enabled_feature_keys": ["nbu"],
        "sort_order": 78,
    },
    {
        "code": "mod_maternity",
        "name": "Maternity / Obstetrics",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("3000.00"),
        "annual_price": Decimal("30000.00"),
        "enabled_feature_keys": ["maternity"],
        "sort_order": 80,
    },
    {
        "code": "mod_mortuary",
        "name": "Mortuary",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("3000.00"),
        "annual_price": Decimal("30000.00"),
        "enabled_feature_keys": ["mortuary"],
        "sort_order": 90,
    },
    {
        "code": "mod_blood_bank",
        "name": "Blood Bank",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("5000.00"),
        "annual_price": Decimal("50000.00"),
        "enabled_feature_keys": ["blood_bank"],
        "sort_order": 100,
    },
    {
        "code": "mod_inventory",
        "name": "Inventory / Supply Chain",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "enabled_feature_keys": ["inventory"],
        "sort_order": 110,
    },
    {
        "code": "mod_scheduling",
        "name": "Staff Rostering & Scheduling",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "enabled_feature_keys": ["scheduling"],
        "sort_order": 120,
    },
    {
        "code": "mod_triage",
        "name": "Triage / Acuity Scoring",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("2500.00"),
        "annual_price": Decimal("25000.00"),
        "enabled_feature_keys": ["triage"],
        "sort_order": 130,
    },
    {
        "code": "mod_surveillance",
        "name": "Disease Surveillance / IDSR",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("4500.00"),
        "annual_price": Decimal("45000.00"),
        "enabled_feature_keys": ["surveillance"],
        "sort_order": 140,
    },
    {
        "code": "mod_immunizations",
        "name": "Immunizations / Vaccination",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("3500.00"),
        "annual_price": Decimal("35000.00"),
        "enabled_feature_keys": ["immunizations"],
        "sort_order": 150,
    },
    {
        "code": "mod_allied_health",
        "name": "Allied Health",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("4000.00"),
        "annual_price": Decimal("40000.00"),
        "enabled_feature_keys": ["allied_health"],
        "sort_order": 160,
    },
    {
        "code": "mod_quality",
        "name": "Quality Improvement",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("3000.00"),
        "annual_price": Decimal("30000.00"),
        "enabled_feature_keys": ["quality"],
        "sort_order": 170,
    },
    {
        "code": "mod_private_insurance",
        "name": "Private Insurance",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("5500.00"),
        "annual_price": Decimal("55000.00"),
        "enabled_feature_keys": ["private_insurance"],
        "sort_order": 180,
    },
    {
        "code": "mod_moh_reporting",
        "name": "MOH Reporting",
        "sku_type": SKU.SKUType.MODULE,
        "monthly_price": Decimal("4000.00"),
        "annual_price": Decimal("40000.00"),
        "enabled_feature_keys": ["moh_reporting"],
        "sort_order": 190,
    },
    {
        "code": "plat_sha_claims",
        "name": "SHA Claims Integration",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "enabled_feature_keys": ["sha_claims"],
        "sort_order": 200,
    },
    {
        "code": "plat_dhis2_reporting",
        "name": "DHIS2/KHIS Reporting",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "enabled_feature_keys": ["dhis2_reporting"],
        "sort_order": 210,
    },
    {
        "code": "plat_ai_assistant",
        "name": "AI Assistant (TibaBot)",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("1500.00"),
        "annual_price": Decimal("15000.00"),
        "enabled_feature_keys": ["ai_assistant"],
        "included_ai_tokens": 100000,
        "sort_order": 220,
    },
    {
        "code": "plat_analytics",
        "name": "Analytics & BI",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("500.00"),
        "annual_price": Decimal("5000.00"),
        "enabled_feature_keys": ["analytics"],
        "sort_order": 230,
    },
    {
        "code": "plat_api_access",
        "name": "API Access",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("300.00"),
        "annual_price": Decimal("3000.00"),
        "enabled_feature_keys": ["api_access"],
        "included_api_calls": 200000,
        "sort_order": 240,
    },
    {
        "code": "plat_custom_reports",
        "name": "Custom Reports",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("300.00"),
        "annual_price": Decimal("3000.00"),
        "enabled_feature_keys": ["custom_reports"],
        "sort_order": 250,
    },
    {
        "code": "plat_offline_sync",
        "name": "Offline Sync",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("0.00"),
        "annual_price": Decimal("0.00"),
        "enabled_feature_keys": ["offline_sync"],
        "sort_order": 260,
    },
    {
        "code": "plat_sms_notifications",
        "name": "SMS and WhatsApp Notifications",
        "sku_type": SKU.SKUType.PLATFORM,
        "monthly_price": Decimal("400.00"),
        "annual_price": Decimal("4000.00"),
        "enabled_feature_keys": ["sms_notifications"],
        "included_sms_messages": 5000,
        "sort_order": 270,
    },
    {
        "code": "std_lis",
        "name": "Standalone Laboratory",
        "sku_type": SKU.SKUType.STANDALONE,
        "monthly_price": Decimal("15000.00"),
        "annual_price": Decimal("150000.00"),
        "enabled_feature_keys": ["lis_standalone"],
        "sort_order": 280,
    },
    {
        "code": "std_pharmacy",
        "name": "Standalone Pharmacy",
        "sku_type": SKU.SKUType.STANDALONE,
        "monthly_price": Decimal("12000.00"),
        "annual_price": Decimal("120000.00"),
        "enabled_feature_keys": ["pharmacy_standalone"],
        "sort_order": 290,
    },
    {
        "code": "std_imaging",
        "name": "Standalone Imaging",
        "sku_type": SKU.SKUType.STANDALONE,
        "monthly_price": Decimal("18000.00"),
        "annual_price": Decimal("180000.00"),
        "enabled_feature_keys": ["imaging_standalone"],
        "sort_order": 300,
    },
]

DEPENDENCIES = [
    {
        "sku_code": "plat_sha_claims",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["billing"],
    },
    {
        "sku_code": "mod_theatre",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["inpatient"],
    },
    {
        "sku_code": "mod_dialysis",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["inpatient"],
    },
    {
        "sku_code": "mod_blood_bank",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["laboratory"],
    },
    {
        "sku_code": "mod_surveillance",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["dhis2_reporting"],
    },
    {
        "sku_code": "mod_moh_reporting",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["dhis2_reporting"],
    },
    {
        "sku_code": "plat_custom_reports",
        "rule_type": SKUDependency.RuleType.FEATURE_ALL,
        "keys": ["analytics"],
    },
    {
        "sku_code": "mod_triage",
        "rule_type": SKUDependency.RuleType.FEATURE_ANY,
        "keys": ["emergency", "outpatient"],
    },
]

BUNDLES = [
    {
        "code": "clinic_bundle",
        "name": "Clinic Bundle",
        "included_sku_codes": ["base_platform"],
        "discount_type": Bundle.DiscountType.FIXED,
        "discount_value": Decimal("0.00"),
        "sort_order": 10,
    },
    {
        "code": "hospital_bundle",
        "name": "Hospital Bundle",
        "included_sku_codes": [
            "base_platform",
            "mod_inpatient",
            "mod_laboratory",
            "mod_imaging",
            "mod_theatre",
            "mod_icu",
            "mod_maternity",
            "plat_ai_assistant",
            "plat_analytics",
            "plat_api_access",
            "plat_custom_reports",
            "plat_sms_notifications",
        ],
        "discount_type": Bundle.DiscountType.FIXED,
        "discount_value": Decimal("0.00"),
        "sort_order": 20,
    },
    {
        "code": "enterprise_bundle",
        "name": "Enterprise Bundle",
        "included_sku_codes": [
            "base_platform",
            "mod_inpatient",
            "mod_laboratory",
            "mod_imaging",
            "mod_theatre",
            "mod_icu",
            "mod_maternity",
            "mod_inventory",
            "mod_scheduling",
            "plat_sha_claims",
            "plat_dhis2_reporting",
            "plat_ai_assistant",
            "plat_api_access",
            "plat_custom_reports",
            "plat_offline_sync",
            "plat_sms_notifications",
            "mod_dialysis",
            "mod_mortuary",
            "mod_blood_bank",
            "mod_surveillance",
            "mod_quality",
            "mod_private_insurance",
            "mod_moh_reporting",
            "plat_analytics",
        ],
        "discount_type": Bundle.DiscountType.NEGOTIATED,
        "discount_value": None,
        "sort_order": 30,
    },
]


class Command(BaseCommand):
    help = "Seed cart-pricing catalog (pricebook, skus, dependencies, bundles)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Preview without writing changes"
        )
        parser.add_argument(
            "--no-update-existing",
            action="store_true",
            help="Deprecated alias for default behavior. Existing records are preserved unless --force is used.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing records with seed defaults (including admin-edited values).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]
        preserve_existing = not force

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be committed."))
        if options["no_update_existing"]:
            self.stdout.write(
                self.style.WARNING(
                    "--no-update-existing is now the default behavior; use --force to overwrite existing records."
                )
            )

        if preserve_existing:
            self.stdout.write(
                self.style.WARNING("IDEMPOTENT mode - existing records will be preserved.")
            )
        else:
            self.stdout.write(
                self.style.WARNING("FORCE mode - existing records will be overwritten.")
            )

        price_book, pb_created = PriceBook.objects.get_or_create(
            code=PRICE_BOOK["code"], defaults=PRICE_BOOK
        )
        if preserve_existing and not pb_created:
            self.stdout.write(f"  SKIP  PRICEBOOK {price_book.code} (exists)")
        else:
            for attr, value in PRICE_BOOK.items():
                setattr(price_book, attr, value)
            if not dry_run:
                price_book.save()
            self.stdout.write(f"  UPSERT PRICEBOOK {price_book.code}")

        sku_lookup: dict[str, SKU] = {}
        for entry in SKUS:
            code = entry["code"]
            defaults = {k: v for k, v in entry.items() if k != "code"}
            sku, created = SKU.objects.get_or_create(
                price_book=price_book, code=code, defaults=defaults
            )
            if created or not preserve_existing:
                for attr, value in defaults.items():
                    setattr(sku, attr, value)
                if not dry_run:
                    sku.save()
            else:
                self.stdout.write(f"  SKIP  SKU {code} (exists)")
            sku_lookup[code] = sku
            verb = "CREATE" if created else "UPDATE"
            if created or not preserve_existing:
                self.stdout.write(f"  {verb} SKU {code}")

        if not dry_run and not preserve_existing:
            SKUDependency.objects.filter(sku__price_book=price_book).delete()
        for dep in DEPENDENCIES:
            sku = sku_lookup[dep["sku_code"]]
            if preserve_existing:
                existing = SKUDependency.objects.filter(
                    sku=sku,
                    rule_type=dep["rule_type"],
                    required_feature_keys=dep["keys"],
                ).exists()
                if existing:
                    self.stdout.write(f"  SKIP  dependency for {dep['sku_code']} (exists)")
                    continue

            obj = SKUDependency(
                sku=sku,
                rule_type=dep["rule_type"],
                required_feature_keys=dep["keys"],
                error_message="",
                is_active=True,
            )
            if not dry_run:
                obj.save()
            self.stdout.write(f"  LINK dependency for {dep['sku_code']}")

        for entry in BUNDLES:
            code = entry["code"]
            defaults = {k: v for k, v in entry.items() if k != "code"}
            bundle, created = Bundle.objects.get_or_create(
                price_book=price_book, code=code, defaults=defaults
            )
            if created or not preserve_existing:
                for attr, value in defaults.items():
                    setattr(bundle, attr, value)
                bundle.is_active = True
                if not dry_run:
                    bundle.save()
            else:
                self.stdout.write(f"  SKIP  BUNDLE {code} (exists)")
            verb = "CREATE" if created else "UPDATE"
            if created or not preserve_existing:
                self.stdout.write(f"  {verb} BUNDLE {code}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Done: 1 pricebook, {len(SKUS)} skus, {len(DEPENDENCIES)} dependencies, {len(BUNDLES)} bundles."
            )
        )
        if dry_run:
            transaction.set_rollback(True)
