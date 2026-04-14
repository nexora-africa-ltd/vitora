"""
Seed realistic demo vaccine stock, cold chain equipment, and temperature logs.

Depends on:
- seed_vaccines (VaccineDefinition records must exist)
- seed_demo_data (Organization + Facility must exist)

Creates facility-scoped demo data:
- Vaccine stock batches (mix of normal, low-stock, near-expiry, expired)
- Cold chain equipment (fridges, freezers, cold boxes)
- Initial temperature logs for equipment
- Sample stock transactions
"""

from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

# Realistic batch data: (vaccine_code, batch_number, qty_received, qty_on_hand,
#                         days_until_expiry, manufacturer, supplier, storage, vvm, min_stock)
STOCK_BATCHES = [
    # Well-stocked KEPI vaccines
    ("BCG", "BCG-KE-2026-A01", 200, 145, 300, "Serum Institute of India", "KEMSA", "Main Fridge 1", "Stage 1", 30),
    ("OPV0", "OPV-KE-2026-B03", 500, 380, 240, "Bio Farma", "KEMSA", "Main Fridge 1", "Stage 1", 50),
    ("PENTA1", "PNT-KE-2026-C02", 300, 220, 180, "Serum Institute of India", "KEMSA", "Main Fridge 2", "Stage 1", 40),
    ("PCV1", "PCV-KE-2026-D01", 250, 190, 200, "Pfizer", "KEMSA", "Main Fridge 1", "Stage 1", 35),
    ("MR1", "MR-KE-2026-E01", 400, 310, 270, "Serum Institute of India", "KEMSA", "Main Fridge 2", "Stage 1", 50),
    ("RV1", "RV-KE-2026-F01", 300, 245, 210, "GSK", "KEMSA", "Main Fridge 1", "Stage 1", 40),
    ("IPV", "IPV-KE-2026-G01", 200, 155, 250, "Sanofi Pasteur", "KEMSA", "Main Fridge 2", "Stage 1", 25),
    ("YF", "YF-KE-2026-H01", 150, 120, 350, "Institut Pasteur de Dakar", "KEMSA", "Main Fridge 1", "Stage 1", 20),
    # Low stock batch (triggers alert)
    ("PENTA2", "PNT-KE-2025-L01", 200, 8, 90, "Serum Institute of India", "KEMSA", "Main Fridge 2", "Stage 2", 30),
    # Near-expiry batch (within 30 days)
    ("OPV1", "OPV-KE-2025-N01", 300, 75, 18, "Bio Farma", "KEMSA", "Main Fridge 1", "Stage 2", 50),
    # Expired batch (for demo/training purposes)
    ("HEPB0", "HBV-KE-2024-X01", 100, 12, -30, "LG Life Sciences", "KEMSA", "Cold Room A", "Stage 3", 15),
    # Adult vaccines
    ("HEPB_ADULT_1", "HBA-KE-2026-A01", 100, 78, 365, "GSK", "KEMSA", "Main Fridge 2", "Stage 1", 15),
    ("TD_BOOSTER", "TD-KE-2026-B01", 200, 165, 300, "Serum Institute of India", "KEMSA", "Main Fridge 1", "Stage 1", 25),
    ("FLU_ANNUAL", "FLU-KE-2026-C01", 150, 110, 120, "Sanofi Pasteur", "Direct", "Main Fridge 2", "Stage 1", 20),
    # Campaign vaccines
    ("COVID19_PF_1", "CPF-KE-2026-A01", 500, 320, 150, "Pfizer-BioNTech", "UNICEF", "Ultra-Cold Freezer", "N/A", 50),
]

COLD_CHAIN_EQUIPMENT = [
    {
        "name": "Main Fridge 1",
        "equipment_type": "FRIDGE",
        "model_number": "VLS-054 SDD",
        "serial_number": "VF-MF1-2024-001",
        "manufacturer": "Vestfrost",
        "location": "EPI Room - Main Store",
        "capacity_litres": Decimal("54.0"),
        "min_temp": Decimal("2.00"),
        "max_temp": Decimal("8.00"),
        "status": "OPERATIONAL",
        "power_source": "Mains + Solar",
        "has_backup_power": True,
    },
    {
        "name": "Main Fridge 2",
        "equipment_type": "FRIDGE",
        "model_number": "MK-304",
        "serial_number": "HE-MF2-2023-042",
        "manufacturer": "Haier Biomedical",
        "location": "EPI Room - Main Store",
        "capacity_litres": Decimal("118.0"),
        "min_temp": Decimal("2.00"),
        "max_temp": Decimal("8.00"),
        "status": "OPERATIONAL",
        "power_source": "Mains",
        "has_backup_power": False,
    },
    {
        "name": "Ultra-Cold Freezer",
        "equipment_type": "FREEZER",
        "model_number": "ULT-340",
        "serial_number": "TF-UCF-2025-007",
        "manufacturer": "Thermo Fisher",
        "location": "EPI Room - Cold Chain Unit",
        "capacity_litres": Decimal("340.0"),
        "min_temp": Decimal("-80.00"),
        "max_temp": Decimal("-60.00"),
        "status": "OPERATIONAL",
        "power_source": "Mains + Generator",
        "has_backup_power": True,
    },
    {
        "name": "Cold Room A",
        "equipment_type": "COLD_ROOM",
        "model_number": "CR-20000",
        "serial_number": "CR-A-2022-001",
        "manufacturer": "Daikin",
        "location": "Pharmacy Block - Ground Floor",
        "capacity_litres": Decimal("20000.0"),
        "min_temp": Decimal("2.00"),
        "max_temp": Decimal("8.00"),
        "status": "OPERATIONAL",
        "power_source": "Mains + Generator",
        "has_backup_power": True,
    },
    {
        "name": "Outreach Cold Box 1",
        "equipment_type": "COLD_BOX",
        "model_number": "RCW-25",
        "serial_number": "CB-OUT1-2025-003",
        "manufacturer": "Apex International",
        "location": "Community Health Office",
        "capacity_litres": Decimal("22.0"),
        "min_temp": Decimal("2.00"),
        "max_temp": Decimal("8.00"),
        "status": "OPERATIONAL",
        "power_source": "Ice packs",
        "has_backup_power": False,
    },
    {
        "name": "Outreach Vaccine Carrier",
        "equipment_type": "VACCINE_CARRIER",
        "model_number": "YBC-4L",
        "serial_number": "VC-OUT1-2025-011",
        "manufacturer": "B Medical Systems",
        "location": "Community Health Office",
        "capacity_litres": Decimal("4.0"),
        "min_temp": Decimal("2.00"),
        "max_temp": Decimal("8.00"),
        "status": "OPERATIONAL",
        "power_source": "Ice packs",
        "has_backup_power": False,
    },
]


class Command(BaseCommand):
    help = "Seed demo vaccine stock, cold chain equipment, and temperature logs (facility-scoped)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes",
        )

    def handle(self, *args, **options):
        from hmis.apps.core.models import Facility, Organization
        from hmis.apps.immunizations.models import (
            ColdChainEquipment,
            StockTransaction,
            TemperatureLog,
            VaccineDefinition,
            VaccineStock,
        )

        dry_run = options["dry_run"]

        # Resolve demo org + HQ facility
        try:
            demo_org = Organization.objects.get(slug="demo-health-services")
        except Organization.DoesNotExist:
            self.stderr.write(self.style.ERROR("Demo organization not found. Run seed_demo_data first."))
            return

        hq_facility = Facility.objects.filter(organization=demo_org, is_headquarters=True).first()
        if not hq_facility:
            hq_facility = Facility.objects.filter(organization=demo_org, is_active=True).first()
        if not hq_facility:
            self.stderr.write(self.style.ERROR("No active facility found. Run seed_demo_data first."))
            return

        # Verify seed_vaccines has been run
        vaccine_count = VaccineDefinition.objects.count()
        if vaccine_count == 0:
            self.stderr.write(self.style.ERROR("No vaccines found. Run seed_vaccines first."))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be made\n"))

        self.stdout.write(
            f"Seeding demo stock for: {demo_org.name} / {hq_facility.name}\n"
            f"Vaccines in database: {vaccine_count}\n"
        )

        # ── Cold Chain Equipment ──────────────────────────────────────
        equip_created = 0
        for equip_data in COLD_CHAIN_EQUIPMENT:
            sn = equip_data["serial_number"]
            if ColdChainEquipment.objects.filter(serial_number=sn).exists():
                continue
            if dry_run:
                self.stdout.write(f"  Would create equipment: {equip_data['name']} ({sn})")
                equip_created += 1
                continue
            ColdChainEquipment.objects.create(
                **equip_data,
                facility=hq_facility,
                organization=demo_org,
                installation_date=date.today() - timedelta(days=365),
                last_maintenance_date=date.today() - timedelta(days=30),
                next_maintenance_date=date.today() + timedelta(days=60),
            )
            equip_created += 1

        self.stdout.write(f"  Cold chain equipment: {equip_created} created")

        # ── Temperature Logs (last 14 days, twice daily) ──────────────
        temp_created = 0
        temp_excursions = 0
        for equip in ColdChainEquipment.objects.filter(facility=hq_facility):
            if equip.temperature_logs.exists():
                continue
            # Build realistic temperature profiles per equipment type
            logs_to_create = self._build_temp_logs(equip)
            if dry_run:
                exc = sum(1 for l in logs_to_create if l["is_excursion"])
                self.stdout.write(
                    f"  Would create {len(logs_to_create)} temp logs for "
                    f"{equip.name} ({exc} excursions)"
                )
                temp_created += len(logs_to_create)
                temp_excursions += exc
                continue
            for log_data in logs_to_create:
                TemperatureLog.objects.create(equipment=equip, **log_data)
                temp_created += 1
                if log_data["is_excursion"]:
                    temp_excursions += 1

        self.stdout.write(
            f"  Temperature logs: {temp_created} created ({temp_excursions} excursions)"
        )

        # ── Vaccine Stock Batches ─────────────────────────────────────
        stock_created = 0
        for (
            vax_code, batch_num, qty_recv, qty_hand, days_exp,
            manufacturer, supplier, storage, vvm, min_stock,
        ) in STOCK_BATCHES:
            vaccine = VaccineDefinition.objects.filter(code=vax_code).first()
            if not vaccine:
                self.stdout.write(self.style.WARNING(f"  Vaccine {vax_code} not found, skipping"))
                continue
            if VaccineStock.objects.filter(batch_number=batch_num).exists():
                continue
            if dry_run:
                label = ""
                if days_exp < 0:
                    label = " [EXPIRED]"
                elif days_exp <= 30:
                    label = " [NEAR EXPIRY]"
                elif qty_hand <= min_stock:
                    label = " [LOW STOCK]"
                self.stdout.write(f"  Would create stock: {vax_code} {batch_num} ({qty_hand}/{qty_recv}){label}")
                stock_created += 1
                continue

            stock = VaccineStock.objects.create(
                vaccine=vaccine,
                batch_number=batch_num,
                quantity_received=qty_recv,
                quantity_on_hand=qty_hand,
                expiry_date=date.today() + timedelta(days=days_exp),
                manufacturer=manufacturer,
                supplier=supplier,
                received_date=date.today() - timedelta(days=max(30, 365 - days_exp)),
                storage_location=storage,
                vvm_status=vvm,
                min_stock_level=min_stock,
                facility=hq_facility,
                organization=demo_org,
            )
            # Create initial RECEIVE transaction
            StockTransaction.objects.create(
                stock=stock,
                transaction_type="RECEIVE",
                quantity=qty_recv,
                balance_after=qty_recv,
                notes=f"Initial receipt from {supplier}",
            )
            # If qty differs from received, create ISSUE transactions to justify
            issued = qty_recv - qty_hand
            if issued > 0:
                StockTransaction.objects.create(
                    stock=stock,
                    transaction_type="ISSUE",
                    quantity=-issued,
                    balance_after=qty_hand,
                    notes="Administered to patients",
                )
            stock_created += 1

        self.stdout.write(f"  Vaccine stock batches: {stock_created} created")

        # ── Summary ───────────────────────────────────────────────────
        total = equip_created + stock_created + temp_created
        if total == 0:
            self.stdout.write(self.style.SUCCESS("\nAll demo stock data already exists."))
        elif dry_run:
            self.stdout.write(self.style.WARNING(f"\nWould create ~{total} records. Run without --dry-run to apply."))
        else:
            self.stdout.write(self.style.SUCCESS(f"\n✅ Created {total} demo vaccine stock records."))

    # ── Helper: build realistic temperature log entries ────────────
    def _build_temp_logs(self, equip):
        """
        Generate 14 days of twice-daily temperature readings for one piece
        of equipment.  Includes realistic variation, diurnal drift, and a
        couple of deliberate excursion events so the dashboard has alerts.
        """
        import hashlib
        import math

        logs = []
        now = timezone.now()

        # Deterministic seed from serial number so re-runs are idempotent
        seed = int(hashlib.md5(equip.serial_number.encode()).hexdigest()[:8], 16)

        # Base temperature depends on equipment type
        if equip.equipment_type == "FREEZER":
            base_temp = Decimal("-70.0")
            amplitude = Decimal("2.0")       # ±2°C swing
        elif equip.equipment_type == "COLD_ROOM":
            base_temp = Decimal("4.5")
            amplitude = Decimal("1.2")
        else:  # FRIDGE, COLD_BOX, VACCINE_CARRIER
            base_temp = Decimal("5.0")
            amplitude = Decimal("1.5")

        # Excursion schedule: day 11 afternoon (power outage spike),
        # day 4 morning (door left open)
        excursion_slots = {(11, 16), (4, 8)}

        for days_ago in range(14, -1, -1):
            for hour in (8, 16):
                reading_time = now.replace(
                    hour=hour, minute=17, second=0, microsecond=0,
                ) - timedelta(days=days_ago)

                # Pseudo-random component from seed + day + hour
                pseudo = seed + days_ago * 37 + hour * 13
                noise = Decimal(str(math.sin(pseudo) * 0.7))

                # Diurnal drift: afternoon slightly warmer
                diurnal = Decimal("0.4") if hour == 16 else Decimal("-0.2")

                temp = base_temp + diurnal + noise

                # Inject excursion events
                action_taken = ""
                if (days_ago, hour) in excursion_slots:
                    if equip.equipment_type == "FREEZER":
                        temp = Decimal("-52.0")  # warmed significantly
                        action_taken = "Power restored, generator started. Stock checked — VVM intact."
                    else:
                        temp = Decimal("12.5")   # well above +8°C
                        action_taken = "Door secured, ice packs replaced. Stock inspected."

                # Clamp to sensible physical range
                if equip.equipment_type == "FREEZER":
                    temp = max(Decimal("-86.0"), min(Decimal("-20.0"), temp))
                else:
                    temp = max(Decimal("-2.0"), min(Decimal("25.0"), temp))

                temp = temp.quantize(Decimal("0.01"))
                is_excursion = temp < equip.min_temp or temp > equip.max_temp

                logs.append({
                    "temperature": temp,
                    "recorded_at": reading_time,
                    "is_excursion": is_excursion,
                    "action_taken": action_taken,
                })

        return logs
