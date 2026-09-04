# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Management command to seed subscription plans matching the marketing pricing page.

Creates the canonical general tiers (FREE, BASIC, PROFESSIONAL, ENTERPRISE)
plus standalone tiers (LIS_STANDALONE, PHARMACY_STANDALONE,
IMAGING_STANDALONE, DIAGNOSTIC_STANDALONE) with pricing, limits, and
feature flags that align with product packaging.

Usage::

    python manage.py seed_subscription_plans          # Create missing plans
    python manage.py seed_subscription_plans --update  # Update existing plans
    python manage.py seed_subscription_plans --dry-run # Preview only
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import SubscriptionPlan

# ============================================================================
# Plan definitions — single source of truth
# ============================================================================

PLANS = [
    {
        "code": "FREE",
        "name": "Free Pilot",
        "description": (
            "14-day pilot for evaluation. Limited to 1 facility, "
            "5 staff, and 100 patients. Core outpatient features only."
        ),
        "monthly_price": "0.00",
        "annual_price": "0.00",
        "max_facilities": 1,
        "max_users": 5,
        "max_patients": 100,
        "monthly_ai_tokens": 0,
        "trial_period_days": 14,
        "sort_order": 0,
        "features": {
            "outpatient": True,
            "inpatient": False,
            "emergency": False,
            "pharmacy": True,
            "laboratory": False,
            "imaging": False,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": False,
            "billing": True,
            "scheduling": False,
            "ai_assistant": False,
            "sha_claims": False,
            "dhis2_reporting": False,
            "api_access": False,
            "custom_reports": False,
            "offline_sync": False,
            "sms_notifications": False,
        },
    },
    {
        "code": "BASIC",
        "name": "Clinic",
        "description": (
            "For outpatient clinics and dispensaries. "
            "Digitize records, manage queues, streamline billing, "
            "and submit SHA claims. Works offline."
        ),
        "monthly_price": "8999.00",
        "annual_price": "89990.00",
        "max_facilities": 1,
        "max_users": 10,
        "max_patients": None,
        "monthly_ai_tokens": 50000,
        "trial_period_days": 0,
        "sort_order": 1,
        "features": {
            "outpatient": True,
            "inpatient": False,
            "emergency": True,
            "pharmacy": True,
            "laboratory": False,
            "imaging": False,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": True,
            "billing": True,
            "scheduling": True,
            "ai_assistant": False,
            "sha_claims": True,
            "dhis2_reporting": True,
            "api_access": False,
            "custom_reports": False,
            "offline_sync": True,
            "sms_notifications": False,
        },
    },
    {
        "code": "PROFESSIONAL",
        "name": "Hospital",
        "description": (
            "For Level 3-5 facilities and multi-department hospitals. "
            "Full inpatient, lab, radiology, theatre, scheduling, "
            "and KHIS/DHIS2 reporting."
        ),
        "monthly_price": "49999.00",
        "annual_price": "499990.00",
        "max_facilities": 3,
        "max_users": 50,
        "max_patients": None,
        "monthly_ai_tokens": 200000,
        "trial_period_days": 0,
        "sort_order": 2,
        "features": {
            "outpatient": True,
            "inpatient": True,
            "emergency": True,
            "pharmacy": True,
            "laboratory": True,
            "imaging": True,
            "theatre": True,
            "dialysis": False,
            "icu": True,
            "hdu": True,
            "nbu": True,
            "maternity": True,
            "mortuary": False,
            "blood_bank": False,
            "inventory": True,
            "billing": True,
            "scheduling": True,
            "ai_assistant": True,
            "sha_claims": True,
            "dhis2_reporting": True,
            "api_access": True,
            "custom_reports": True,
            "offline_sync": True,
            "sms_notifications": True,
        },
    },
    {
        "code": "ENTERPRISE",
        "name": "Enterprise",
        "description": (
            "For hospital groups and county health systems. "
            "Multi-facility management, executive dashboards, "
            "custom integrations, and dedicated support."
        ),
        "monthly_price": "80000.00",
        "annual_price": "800000.00",
        "max_facilities": None,
        "max_users": None,
        "max_patients": None,
        "monthly_ai_tokens": None,
        "trial_period_days": 0,
        "sort_order": 3,
        "features": {
            "outpatient": True,
            "inpatient": True,
            "emergency": True,
            "pharmacy": True,
            "laboratory": True,
            "imaging": True,
            "theatre": True,
            "dialysis": True,
            "icu": True,
            "hdu": True,
            "nbu": True,
            "maternity": True,
            "mortuary": True,
            "blood_bank": True,
            "inventory": True,
            "billing": True,
            "scheduling": True,
            "ai_assistant": True,
            "sha_claims": True,
            "dhis2_reporting": True,
            "api_access": True,
            "custom_reports": True,
            "offline_sync": True,
            "sms_notifications": True,
        },
    },
    {
        "code": "LIS_STANDALONE",
        "name": "Standalone Laboratory",
        "description": (
            "For laboratories running LIS without full HMIS workflows. "
            "Includes lab operations, billing, inventory, and offline support."
        ),
        "monthly_price": "14999.00",
        "annual_price": "149990.00",
        "max_facilities": 1,
        "max_users": 15,
        "max_patients": None,
        "monthly_ai_tokens": 20000,
        "trial_period_days": 0,
        "sort_order": 4,
        "features": {
            "outpatient": False,
            "inpatient": False,
            "emergency": False,
            "pharmacy": False,
            "laboratory": True,
            "imaging": False,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": True,
            "billing": True,
            "scheduling": False,
            "triage": False,
            "surveillance": False,
            "immunizations": False,
            "allied_health": False,
            "quality": False,
            "private_insurance": False,
            "moh_reporting": False,
            "lis_standalone": True,
            "pharmacy_standalone": False,
            "imaging_standalone": False,
            "ai_assistant": False,
            "sha_claims": False,
            "dhis2_reporting": False,
            "analytics": False,
            "api_access": False,
            "custom_reports": False,
            "offline_sync": True,
            "sms_notifications": False,
        },
    },
    {
        "code": "PHARMACY_STANDALONE",
        "name": "Standalone Pharmacy",
        "description": (
            "For standalone pharmacy and retail dispensing operations. "
            "Includes dispensing workflows, billing, inventory, and offline support."
        ),
        "monthly_price": "12999.00",
        "annual_price": "129990.00",
        "max_facilities": 1,
        "max_users": 15,
        "max_patients": None,
        "monthly_ai_tokens": 20000,
        "trial_period_days": 0,
        "sort_order": 5,
        "features": {
            "outpatient": False,
            "inpatient": False,
            "emergency": False,
            "pharmacy": True,
            "laboratory": False,
            "imaging": False,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": True,
            "billing": True,
            "scheduling": False,
            "triage": False,
            "surveillance": False,
            "immunizations": False,
            "allied_health": False,
            "quality": False,
            "private_insurance": False,
            "moh_reporting": False,
            "lis_standalone": False,
            "pharmacy_standalone": True,
            "imaging_standalone": False,
            "ai_assistant": False,
            "sha_claims": False,
            "dhis2_reporting": False,
            "analytics": False,
            "api_access": False,
            "custom_reports": False,
            "offline_sync": True,
            "sms_notifications": False,
        },
    },
    {
        "code": "IMAGING_STANDALONE",
        "name": "Standalone Imaging",
        "description": (
            "For imaging centers running RIS/PACS workflows without full HMIS. "
            "Includes imaging operations, billing, inventory, and offline support."
        ),
        "monthly_price": "16999.00",
        "annual_price": "169990.00",
        "max_facilities": 1,
        "max_users": 20,
        "max_patients": None,
        "monthly_ai_tokens": 20000,
        "trial_period_days": 0,
        "sort_order": 6,
        "features": {
            "outpatient": False,
            "inpatient": False,
            "emergency": False,
            "pharmacy": False,
            "laboratory": False,
            "imaging": True,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": True,
            "billing": True,
            "scheduling": False,
            "triage": False,
            "surveillance": False,
            "immunizations": False,
            "allied_health": False,
            "quality": False,
            "private_insurance": False,
            "moh_reporting": False,
            "lis_standalone": False,
            "pharmacy_standalone": False,
            "imaging_standalone": True,
            "ai_assistant": False,
            "sha_claims": False,
            "dhis2_reporting": False,
            "analytics": False,
            "api_access": False,
            "custom_reports": False,
            "offline_sync": True,
            "sms_notifications": False,
        },
    },
    {
        "code": "DIAGNOSTIC_STANDALONE",
        "name": "Standalone Diagnostic Centre",
        "description": (
            "For diagnostic centers running both laboratory and imaging as a "
            "single standalone offering. Includes billing, inventory, and offline support."
        ),
        "monthly_price": "23999.00",
        "annual_price": "239990.00",
        "max_facilities": 2,
        "max_users": 30,
        "max_patients": None,
        "monthly_ai_tokens": 30000,
        "trial_period_days": 0,
        "sort_order": 7,
        "features": {
            "outpatient": False,
            "inpatient": False,
            "emergency": False,
            "pharmacy": False,
            "laboratory": True,
            "imaging": True,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": True,
            "billing": True,
            "scheduling": False,
            "triage": False,
            "surveillance": False,
            "immunizations": False,
            "allied_health": False,
            "quality": False,
            "private_insurance": False,
            "moh_reporting": False,
            "lis_standalone": True,
            "pharmacy_standalone": False,
            "imaging_standalone": True,
            "ai_assistant": False,
            "sha_claims": False,
            "dhis2_reporting": False,
            "analytics": False,
            "api_access": False,
            "custom_reports": False,
            "offline_sync": True,
            "sms_notifications": False,
        },
    },
]


class Command(BaseCommand):
    """Seed subscription plans matching the marketing pricing page."""

    help = (
        "Seed canonical subscription plans: general tiers and standalone tiers "
        "(LIS/Pharmacy/Imaging/Diagnostic)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing plans to match the seed definitions.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created/updated without writing.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        update = options["update"]
        dry_run = options["dry_run"]
        created_count = 0
        updated_count = 0
        skipped_count = 0

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        for plan_def in PLANS:
            code = plan_def["code"]
            existing = SubscriptionPlan.objects.filter(code=code).first()

            if existing and not update:
                skipped_count += 1
                self.stdout.write(f"  SKIP  {code} — already exists (use --update to overwrite)")
                continue

            fields = {
                "name": plan_def["name"],
                "description": plan_def["description"],
                "monthly_price": plan_def["monthly_price"],
                "annual_price": plan_def["annual_price"],
                "max_facilities": plan_def["max_facilities"],
                "max_users": plan_def["max_users"],
                "max_patients": plan_def["max_patients"],
                "monthly_ai_tokens": plan_def["monthly_ai_tokens"],
                "trial_period_days": plan_def["trial_period_days"],
                "sort_order": plan_def["sort_order"],
                "features": plan_def["features"],
                "is_active": True,
            }

            if existing and update:
                if dry_run:
                    self.stdout.write(f"  UPDATE  {code} → {plan_def['name']}")
                else:
                    for attr, value in fields.items():
                        setattr(existing, attr, value)
                    existing.save()
                    self.stdout.write(self.style.SUCCESS(f"  UPDATE  {code} → {plan_def['name']}"))
                updated_count += 1
            else:
                if dry_run:
                    self.stdout.write(f"  CREATE  {code} → {plan_def['name']}")
                else:
                    SubscriptionPlan.objects.create(code=code, **fields)
                    self.stdout.write(self.style.SUCCESS(f"  CREATE  {code} → {plan_def['name']}"))
                created_count += 1

        self.stdout.write("")
        self.stdout.write(
            f"Done: {created_count} created, {updated_count} updated, {skipped_count} skipped."
        )

        if dry_run:
            # Roll back the atomic block
            transaction.set_rollback(True)
