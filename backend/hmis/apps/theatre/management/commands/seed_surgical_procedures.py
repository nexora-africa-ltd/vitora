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

from hmis.apps.core.models import Facility
from hmis.apps.procedures.models import ProcedureCatalog


def _resolve_facility(facility_code=None):
    """
    Resolve organization + facility for seeded records.

    Priority:
    1. Explicit ``--facility`` MFL code
    2. Demo HQ facility (mfl_code=DEMO-HQ-001)
    3. First active facility in the database
    """
    if facility_code:
        try:
            fac = Facility.objects.select_related("organization").get(
                mfl_code=facility_code, is_active=True
            )
            return fac.organization, fac
        except Facility.DoesNotExist:
            pass

    fac = (
        Facility.objects.select_related("organization")
        .filter(mfl_code="DEMO-HQ-001", is_active=True)
        .first()
    )
    if fac:
        return fac.organization, fac

    fac = Facility.objects.select_related("organization").filter(is_active=True).first()
    if fac:
        return fac.organization, fac

    return None, None


# Kenya common surgical procedures — based on Appendix A of theatre plan.
PROCEDURES = [
    {
        "code": "GS-APP",
        "name": "Appendectomy",
        "description": "Surgical removal of the appendix, typically for acute appendicitis.",
        "body_system": "DIGESTIVE",
        "risk_level": "MEDIUM",
        "complexity": "INTERMEDIATE",
        "typical_duration_minutes": 60,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 4,
        "consent_required": True,
        "sha_tariff_code": "SHA-SURG-001",
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
        "body_system": "DIGESTIVE",
        "risk_level": "MEDIUM",
        "complexity": "INTERMEDIATE",
        "typical_duration_minutes": 90,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 4,
        "consent_required": True,
        "sha_tariff_code": "SHA-SURG-002",
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
        "body_system": "DIGESTIVE",
        "risk_level": "LOW",
        "complexity": "MINOR",
        "typical_duration_minutes": 45,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "minimum_staff_count": 3,
        "consent_required": True,
        "sha_tariff_code": "SHA-SURG-003",
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
        "body_system": "REPRODUCTIVE",
        "risk_level": "HIGH",
        "complexity": "INTERMEDIATE",
        "typical_duration_minutes": 60,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "minimum_staff_count": 5,
        "consent_required": True,
        "sha_tariff_code": "SHA-MAT-001",
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
        "body_system": "REPRODUCTIVE",
        "risk_level": "HIGH",
        "complexity": "MAJOR",
        "typical_duration_minutes": 120,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 5,
        "consent_required": True,
        "sha_tariff_code": "SHA-MAT-002",
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
        "body_system": "MUSCULOSKELETAL",
        "risk_level": "HIGH",
        "complexity": "MAJOR",
        "typical_duration_minutes": 150,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 5,
        "consent_required": True,
        "sha_tariff_code": "SHA-ORTH-001",
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
        "body_system": "MUSCULOSKELETAL",
        "risk_level": "HIGH",
        "complexity": "MAJOR",
        "typical_duration_minutes": 120,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "minimum_staff_count": 5,
        "consent_required": True,
        "sha_tariff_code": "SHA-ORTH-002",
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
        "body_system": "MUSCULOSKELETAL",
        "risk_level": "MEDIUM",
        "complexity": "INTERMEDIATE",
        "typical_duration_minutes": 90,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 4,
        "consent_required": True,
        "sha_tariff_code": "SHA-ORTH-003",
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
        "body_system": "URINARY",
        "risk_level": "MEDIUM",
        "complexity": "INTERMEDIATE",
        "typical_duration_minutes": 60,
        "requires_anesthesia": True,
        "anesthesia_type": "SPINAL",
        "minimum_staff_count": 4,
        "consent_required": True,
        "sha_tariff_code": "SHA-URO-001",
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
        "body_system": "RESPIRATORY",
        "risk_level": "LOW",
        "complexity": "MINOR",
        "typical_duration_minutes": 30,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 3,
        "consent_required": True,
        "sha_tariff_code": "SHA-ENT-001",
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
        "body_system": "SENSORY",
        "risk_level": "LOW",
        "complexity": "MINOR",
        "typical_duration_minutes": 30,
        "requires_anesthesia": True,
        "anesthesia_type": "LOCAL",
        "minimum_staff_count": 3,
        "consent_required": True,
        "sha_tariff_code": "SHA-EYE-001",
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
        "body_system": "DIGESTIVE",
        "risk_level": "MEDIUM",
        "complexity": "INTERMEDIATE",
        "typical_duration_minutes": 75,
        "requires_anesthesia": True,
        "anesthesia_type": "GENERAL",
        "minimum_staff_count": 4,
        "consent_required": True,
        "sha_tariff_code": "SHA-SURG-004",
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
            "--facility",
            type=str,
            help="Facility MFL code to assign seeded procedures to.",
        )
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
        organization, facility = _resolve_facility(options.get("facility"))
        if not facility:
            self.stderr.write(
                self.style.ERROR(
                    "No facility found. Create a facility first or pass --facility <mfl_code>."
                )
            )
            return

        self.stdout.write(
            f"Seeding for: {organization.name} / {facility.name} (mfl={facility.mfl_code})\n"
        )

        created = 0
        updated = 0
        skipped = 0

        for proc_data in PROCEDURES:
            code = proc_data["code"]
            existing = ProcedureCatalog.objects.filter(code=code).first()

            if existing and not force:
                updated_fields = []
                if not existing.organization_id:
                    existing.organization = organization
                    updated_fields.append("organization")
                if not existing.facility_id:
                    existing.facility = facility
                    updated_fields.append("facility")
                if updated_fields and not dry_run:
                    existing.save(update_fields=updated_fields)
                    self.stdout.write(f"  [backfill] {code}: assigned to {facility.mfl_code}")
                skipped += 1
                self.stdout.write(f"  [exists] {code}: {proc_data['name']}")
                continue

            # Build create/update kwargs
            kwargs = {
                "name": proc_data["name"],
                "category": "SURGICAL",
                "description": proc_data.get("description", ""),
                "body_system": proc_data.get("body_system", ProcedureCatalog.BodySystem.GENERAL),
                "risk_level": proc_data.get("risk_level", ProcedureCatalog.RiskLevel.MEDIUM),
                "typical_duration_minutes": proc_data.get("typical_duration_minutes", 60),
                "requires_anesthesia": proc_data.get("requires_anesthesia", True),
                "anesthesia_type": proc_data.get("anesthesia_type", ""),
                "minimum_staff_count": proc_data.get("minimum_staff_count", 3),
                "consent_required": proc_data.get("consent_required", True),
                "complexity": proc_data.get("complexity", ""),
                "sha_intervention_code": proc_data.get("sha_intervention_code", ""),
                "sha_tariff_code": proc_data.get("sha_tariff_code", ""),
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
                existing.organization = organization
                existing.facility = facility
                for k, v in kwargs.items():
                    setattr(existing, k, v)
                existing.save()
                updated += 1
                self.stdout.write(self.style.WARNING(f"  [updated] {code}: {proc_data['name']}"))
            else:
                ProcedureCatalog.objects.create(
                    code=code,
                    organization=organization,
                    facility=facility,
                    **kwargs,
                )
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  [created] {code}: {proc_data['name']}"))

        verb = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(f"\n{verb} {created}, updated {updated}, skipped {skipped}.")
        )
