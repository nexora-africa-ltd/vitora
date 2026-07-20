"""Tests for seed_pricing_skus command update behavior."""

from decimal import Decimal

from django.core.management import call_command

from hmis.apps.core.models import SKU


def test_seed_pricing_skus_no_update_existing_preserves_admin_edits(db):
    call_command("seed_pricing_skus")

    base = SKU.objects.get(code="base_platform")
    base.monthly_price = Decimal("9999.00")
    base.save(update_fields=["monthly_price"])

    call_command("seed_pricing_skus", "--no-update-existing")

    base.refresh_from_db()
    assert base.monthly_price == Decimal("9999.00")


def test_seed_pricing_skus_default_preserves_existing_values(db):
    call_command("seed_pricing_skus")

    base = SKU.objects.get(code="base_platform")
    base.monthly_price = Decimal("9999.00")
    base.save(update_fields=["monthly_price"])

    call_command("seed_pricing_skus")

    base.refresh_from_db()
    assert base.monthly_price == Decimal("9999.00")


def test_seed_pricing_skus_force_updates_existing_values(db):
    call_command("seed_pricing_skus")

    base = SKU.objects.get(code="base_platform")
    base.monthly_price = Decimal("9999.00")
    base.save(update_fields=["monthly_price"])

    call_command("seed_pricing_skus", "--force")

    base.refresh_from_db()
    assert base.monthly_price == Decimal("8999.00")
