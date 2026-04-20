"""
Management command to seed Kenya common surgical procedures.

Populates ProcedureCatalog with category=SURGICAL entries.
Safe to run multiple times — only creates missing entries.

Usage:
    python manage.py seed_surgical_procedures
    python manage.py seed_surgical_procedures --dry-run
    python manage.py seed_surgical_procedures --force   # overwrite existing
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from hmis.apps.procedures.models import ProcedureCatalog

# Kenya common surgical procedures — based on Appendix A of theatre plan.
PROCEDURES = [
    {
        "code": "GS-APP",
        "name": "Appendectomy",
        "description": "Surgical removal of the appendix, typically for acute appendicitis.",
        "specialty": "General Surgery",
        "complexity": "INTERMEDIATE",
        "estimated_duration_minutes": 60,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 4,
        "requires_consent": True,
        "sha_intervention_code": "SHA-SURG-001",
        "setup_time_minutes": 15,
        "cleanup_time_minutes": 15,
        "surgeon_fee": Decimal("25000.00"),
        "theatre_fee": Decimal("15000.00"),
        "anesthesia_fee": Decimal("10000.00"),
    },
    {
        "code": "GS-CHOLE",
        "name": "Cholecystectomy",
        "description": "Surgical removal of the gallbladder.",
        "specialty": "General Surgery",
        "complexity": "INTERMEDIATE",
        "estimated_duration_minutes": 90,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 4,
        "requires_consent": True,
        "sha_intervention_code": "SHA-SURG-002",
        "setup_time_minutes": 15,
        "cleanup_time_minutes": 15,
        "surgeon_fee": Decimal("35000.00"),
        "theatre_fee": Decimal("20000.00"),
        "anesthesia_fee": Decimal("12000.00"),
    },
    {
        "code": "GS-HERNIA",
        "name": "Hernia Repair",
        "description": "Surgical repair of inguinal, umbilical, or incisional hernia.",
        "specialty": "General Surgery",
        "complexity": "MINOR",
        "estimated_duration_minutes": 45,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "min_staff_required": 3,
        "requires_consent": True,
        "sha_intervention_code": "SHA-SURG-003",
        "setup_time_minutes": 10,
        "cleanup_time_minutes": 10,
        "surgeon_fee": Decimal("20000.00"),
        "theatre_fee": Decimal("12000.00"),
        "anesthesia_fee": Decimal("8000.00"),
    },
    {
        "code": "OB-CS",
        "name": "Cesarean Section",
        "description": "Delivery of a baby via abdominal incision.",
        "specialty": "OB/GYN",
        "complexity": "INTERMEDIATE",
        "estimated_duration_minutes": 60,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "min_staff_required": 5,
        "requires_consent": True,
        "sha_intervention_code": "SHA-MAT-001",
        "setup_time_minutes": 10,
        "cleanup_time_minutes": 15,
        "surgeon_fee": Decimal("30000.00"),
        "theatre_fee": Decimal("15000.00"),
        "anesthesia_fee": Decimal("10000.00"),
    },
    {
        "code": "OB-HYST",
        "name": "Hysterectomy",
        "description": "Surgical removal of the uterus.",
        "specialty": "OB/GYN",
        "complexity": "MAJOR",
        "estimated_duration_minutes": 120,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 5,
        "requires_consent": True,
        "sha_intervention_code": "SHA-MAT-002",
        "requires_icu_bed": False,
        "typical_blood_requirement": "2 units packed RBC",
        "setup_time_minutes": 20,
        "cleanup_time_minutes": 20,
        "surgeon_fee": Decimal("50000.00"),
        "theatre_fee": Decimal("25000.00"),
        "anesthesia_fee": Decimal("15000.00"),
    },
    {
        "code": "OR-THR",
        "name": "Total Hip Replacement",
        "description": "Replacement of the hip joint with a prosthetic implant.",
        "specialty": "Orthopedics",
        "complexity": "MAJOR",
        "estimated_duration_minutes": 150,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 5,
        "requires_consent": True,
        "sha_intervention_code": "SHA-ORTH-001",
        "requires_icu_bed": False,
        "typical_blood_requirement": "2 units packed RBC",
        "special_equipment": "Ortho power tools, implant set",
        "setup_time_minutes": 30,
        "cleanup_time_minutes": 20,
        "surgeon_fee": Decimal("80000.00"),
        "theatre_fee": Decimal("40000.00"),
        "anesthesia_fee": Decimal("20000.00"),
    },
    {
        "code": "OR-TKR",
        "name": "Total Knee Replacement",
        "description": "Replacement of the knee joint with a prosthetic implant.",
        "specialty": "Orthopedics",
        "complexity": "MAJOR",
        "estimated_duration_minutes": 120,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "min_staff_required": 5,
        "requires_consent": True,
        "sha_intervention_code": "SHA-ORTH-002",
        "special_equipment": "Ortho power tools, knee implant set",
        "setup_time_minutes": 25,
        "cleanup_time_minutes": 20,
        "surgeon_fee": Decimal("75000.00"),
        "theatre_fee": Decimal("35000.00"),
        "anesthesia_fee": Decimal("18000.00"),
    },
    {
        "code": "OR-ORIF",
        "name": "ORIF (Open Reduction Internal Fixation)",
        "description": "Surgical fixation of bone fractures with plates, screws, or rods.",
        "specialty": "Orthopedics",
        "complexity": "INTERMEDIATE",
        "estimated_duration_minutes": 90,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 4,
        "requires_consent": True,
        "sha_intervention_code": "SHA-ORTH-003",
        "special_equipment": "C-arm image intensifier, ortho set",
        "setup_time_minutes": 20,
        "cleanup_time_minutes": 15,
        "surgeon_fee": Decimal("40000.00"),
        "theatre_fee": Decimal("20000.00"),
        "anesthesia_fee": Decimal("12000.00"),
    },
    {
        "code": "UR-TURP",
        "name": "TURP (Transurethral Resection of Prostate)",
        "description": "Endoscopic resection of prostate tissue for benign prostatic hyperplasia.",
        "specialty": "Urology",
        "complexity": "INTERMEDIATE",
        "estimated_duration_minutes": 60,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "min_staff_required": 4,
        "requires_consent": True,
        "sha_intervention_code": "SHA-URO-001",
        "special_equipment": "Resectoscope",
        "setup_time_minutes": 15,
        "cleanup_time_minutes": 15,
        "surgeon_fee": Decimal("35000.00"),
        "theatre_fee": Decimal("20000.00"),
        "anesthesia_fee": Decimal("10000.00"),
    },
    {
        "code": "ENT-TONSIL",
        "name": "Tonsillectomy",
        "description": "Surgical removal of the tonsils.",
        "specialty": "ENT",
        "complexity": "MINOR",
        "estimated_duration_minutes": 30,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 3,
        "requires_consent": True,
        "sha_intervention_code": "SHA-ENT-001",
        "setup_time_minutes": 10,
        "cleanup_time_minutes": 10,
        "surgeon_fee": Decimal("15000.00"),
        "theatre_fee": Decimal("10000.00"),
        "anesthesia_fee": Decimal("8000.00"),
    },
    {
        "code": "EYE-CATARACT",
        "name": "Cataract Surgery",
        "description": "Removal of cataract with intraocular lens implant.",
        "specialty": "Ophthalmology",
        "complexity": "MINOR",
        "estimated_duration_minutes": 30,
        "requires_anesthesia": True,
        "anesthesia_type": "LOCAL",
        "min_staff_required": 3,
        "requires_consent": True,
        "sha_intervention_code": "SHA-EYE-001",
        "special_equipment": "Phaco machine, operating microscope",
        "setup_time_minutes": 10,
        "cleanup_time_minutes": 10,
        "surgeon_fee": Decimal("20000.00"),
        "theatre_fee": Decimal("15000.00"),
        "anesthesia_fee": Decimal("5000.00"),
    },
    {
        "code": "GS-LAP-CHOLE",
        "name": "Laparoscopic Cholecystectomy",
        "description": "Minimally invasive removal of the gallbladder.",
        "specialty": "General Surgery",
        "complexity": "INTERMEDIATE",
        "estimated_duration_minutes": 75,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "min_staff_required": 4,
        "requires_consent": True,
        "sha_intervention_code": "SHA-SURG-004",
        "special_equipment": "Laparoscopic tower, camera, instruments",
        "setup_time_minutes": 20,
        "cleanup_time_minutes": 15,
        "surgeon_fee": Decimal("40000.00"),
        "theatre_fee": Decimal("25000.00"),
        "anesthesia_fee": Decimal("12000.00"),
    },
]


class Command(BaseCommand):
    help = "Seed surgical procedure catalog (ProcedureCatalog category=SURGICAL)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview procedures that would be created without writing to DB.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing procedures with matching codes.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]
        created = 0
        updated = 0
        skipped = 0

        for proc_data in PROCEDURES:
            code = proc_data["code"]
            existing = ProcedureCatalog.objects.filter(code=code).first()

            if existing and not force:
                skipped += 1
                self.stdout.write(f"  [exists] {code}: {proc_data['name']}")
                continue

            # Build create/update kwargs
            kwargs = {
                "name": proc_data["name"],
                "category": "SURGICAL",
                "description": proc_data.get("description", ""),
                "estimated_duration_minutes": proc_data.get("estimated_duration_minutes", 60),
                "requires_anesthesia": proc_data.get("requires_anesthesia", True),
                "anesthesia_type": proc_data.get("anesthesia_type", ""),
                "min_staff_required": proc_data.get("min_staff_required", 3),
                "requires_consent": proc_data.get("requires_consent", True),
                "complexity": proc_data.get("complexity", ""),
                "sha_intervention_code": proc_data.get("sha_intervention_code", ""),
                "requires_icu_bed": proc_data.get("requires_icu_bed", False),
                "typical_blood_requirement": proc_data.get("typical_blood_requirement", ""),
                "special_equipment": proc_data.get("special_equipment", ""),
                "setup_time_minutes": proc_data.get("setup_time_minutes", 15),
                "cleanup_time_minutes": proc_data.get("cleanup_time_minutes", 15),
                "surgeon_fee": proc_data.get("surgeon_fee", Decimal("0")),
                "theatre_fee": proc_data.get("theatre_fee", Decimal("0")),
                "anesthesia_fee": proc_data.get("anesthesia_fee", Decimal("0")),
            }

            if dry_run:
                verb = "would update" if existing else "would create"
                self.stdout.write(f"  [{verb}] {code}: {proc_data['name']}")
                if existing:
                    updated += 1
                else:
                    created += 1
                continue

            if existing:
                for k, v in kwargs.items():
                    setattr(existing, k, v)
                existing.save()
                updated += 1
                self.stdout.write(
                    self.style.WARNING(f"  [updated] {code}: {proc_data['name']}")
                )
            else:
                ProcedureCatalog.objects.create(code=code, **kwargs)
                created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  [created] {code}: {proc_data['name']}")
                )

        verb = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{verb} {created}, updated {updated}, skipped {skipped}."
            )
        )
