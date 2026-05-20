"""
Django management command to seed pharmacy stock data.

Creates stock batches for all drugs in the catalog without affecting other data.
Safe to run multiple times - skips drugs that already have stock.
"""

from datetime import date, timedelta
from decimal import Decimal
from random import choice, randint, uniform

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.pharmacy.models import Drug, StockBatch

User = get_user_model()


class Command(BaseCommand):
    help = "Seed pharmacy stock data (stock batches for all drugs). Safe to run multiple times."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force creation even for drugs that already have stock",
        )

    def handle(self, *args, **options):
        self.stdout.write("Seeding pharmacy stock data...")

        # Get all active drugs
        drugs = Drug.objects.filter(is_active=True)

        if not drugs.exists():
            self.stdout.write(self.style.WARNING("No drugs found. Run import_drugs first."))
            return

        # Get a pharmacist for received_by
        pharmacist = User.objects.filter(username="demo_pharmacist").first()
        if not pharmacist:
            pharmacist = User.objects.filter(is_staff=True).first()

        if not pharmacist:
            self.stdout.write(self.style.ERROR("No staff user found. Create a user first."))
            return

        today = date.today()
        batches_created = 0
        batches_skipped = 0
        total_stock_value = Decimal("0.00")

        # Storage locations
        LOCATIONS = [
            "Main Pharmacy - Shelf A1",
            "Main Pharmacy - Shelf A2",
            "Main Pharmacy - Shelf B1",
            "Main Pharmacy - Shelf B2",
            "Cold Storage Unit 1",
            "Controlled Substances Cabinet",
            "Emergency Stock Bay",
            "Dispensing Counter Stock",
        ]

        with transaction.atomic():
            for drug in drugs:
                # Check if drug already has stock batches
                existing_batches = drug.batches.filter(status="AVAILABLE").count()
                if existing_batches > 0 and not options["force"]:
                    batches_skipped += 1
                    continue

                # Create 1-3 batches per drug for variety
                num_batches = randint(1, 3)

                for batch_num in range(num_batches):
                    # Generate batch number (format: BTH-YYYYMMDD-XXXX)
                    batch_date = today - timedelta(days=randint(1, 90))
                    batch_number = f"BTH-{batch_date.strftime('%Y%m%d')}-{randint(1000, 9999)}"

                    # Quantity based on drug type (controlled substances have smaller quantities)
                    if drug.is_controlled or drug.is_narcotic:
                        quantity = randint(20, 100)
                    else:
                        quantity = randint(100, 500)

                    # Reference price calculation
                    # Per-unit prices (KES) based on drug form
                    # These are realistic Kenyan pharmacy prices per individual unit
                    if drug.reference_price:
                        base_price = drug.reference_price
                    else:
                        form = getattr(drug, "form", "")
                        if form in ("TABLET", "CAPSULE"):
                            base_price = Decimal(str(round(uniform(2, 25), 2)))
                        elif form in ("SYRUP", "SUSPENSION", "SOLUTION"):
                            # Per-ml price (bottles are typically 100-200ml)
                            base_price = Decimal(str(round(uniform(1, 5), 2)))
                        elif form == "INJECTION":
                            base_price = Decimal(str(round(uniform(20, 150), 2)))
                        elif form in ("CREAM", "OINTMENT", "GEL"):
                            # Per-tube unit price
                            base_price = Decimal(str(round(uniform(50, 300), 2)))
                        elif form == "INHALER":
                            base_price = Decimal(str(round(uniform(200, 800), 2)))
                        elif form in ("DROPS", "SPRAY"):
                            base_price = Decimal(str(round(uniform(100, 400), 2)))
                        elif form == "PATCH":
                            base_price = Decimal(str(round(uniform(50, 200), 2)))
                        else:
                            base_price = Decimal(str(round(uniform(5, 50), 2)))
                    cost_price = base_price * Decimal("0.7")  # 30% margin
                    selling_price = base_price

                    # Expiry date (6 months to 2 years from now)
                    months_to_expiry = randint(6, 24)
                    expiry_date = today + timedelta(days=months_to_expiry * 30)

                    # Manufacture date (before received date)
                    manufacture_date = batch_date - timedelta(days=randint(30, 180))

                    # Location based on drug type
                    if drug.is_controlled or drug.is_narcotic:
                        location = "Controlled Substances Cabinet"
                    elif drug.storage_requirements and "cold" in drug.storage_requirements.lower():
                        location = "Cold Storage Unit 1"
                    else:
                        location = choice(LOCATIONS[:4])  # Regular shelves

                    # Create the stock batch
                    batch, created = StockBatch.objects.get_or_create(
                        drug=drug,
                        batch_number=batch_number,
                        defaults={
                            "barcode": f"{drug.code}-{batch_number}",
                            "quantity_received": quantity,
                            "quantity_available": quantity,
                            "quantity_dispensed": 0,
                            "quantity_damaged": 0,
                            "quantity_expired": 0,
                            "manufacture_date": manufacture_date,
                            "expiry_date": expiry_date,
                            "received_date": batch_date,
                            "cost_price": round(cost_price, 2),
                            "selling_price": round(selling_price, 2),
                            "received_by": pharmacist,
                            "status": "AVAILABLE",
                            "location": location,
                        },
                    )

                    if created:
                        batches_created += 1
                        total_stock_value += batch.get_value()

        # Summary
        self.stdout.write(f"Created {batches_created} stock batches for {drugs.count()} drugs")
        self.stdout.write(f"Skipped {batches_skipped} drugs (already have stock)")
        self.stdout.write(f"Total stock value: KES {total_stock_value:,.2f}")
        self.stdout.write(self.style.SUCCESS("✅ Pharmacy stock data created successfully!"))
