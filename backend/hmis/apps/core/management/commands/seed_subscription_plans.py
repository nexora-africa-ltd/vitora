"""
Management command to seed subscription plans matching the marketing pricing page.

Creates the four canonical tiers (FREE, BASIC, PROFESSIONAL, ENTERPRISE)
with pricing, limits, and feature flags that align with the public pricing
at vitora.nexora.africa/pricing.

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
        "monthly_ai_tokens": None,
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
]


class Command(BaseCommand):
    """Seed subscription plans matching the marketing pricing page."""

    help = "Seed the four canonical subscription plans (FREE, BASIC, PROFESSIONAL, ENTERPRISE)"

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
