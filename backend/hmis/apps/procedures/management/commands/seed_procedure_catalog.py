"""Management command to seed the procedure catalog with common procedures."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from hmis.apps.procedures.models import ProcedureCatalog

User = get_user_model()


def _resolve_facility(facility_code=None):
    """
    Resolve organization + facility for seeded records.

    Priority:
    1. Explicit ``--facility`` MFL code
    2. Demo HQ facility (mfl_code=DEMO-HQ-001)
    3. First active facility in the database
    """
    from hmis.apps.core.models import Facility

    if facility_code:
        try:
            fac = Facility.objects.select_related("organization").get(
                mfl_code=facility_code, is_active=True
            )
            return fac.organization, fac
        except Facility.DoesNotExist:
            pass

    # Fallback: demo HQ
    fac = Facility.objects.select_related("organization").filter(
        mfl_code="DEMO-HQ-001", is_active=True
    ).first()
    if fac:
        return fac.organization, fac

    # Last resort: first active facility
    fac = Facility.objects.select_related("organization").filter(is_active=True).first()
    if fac:
        return fac.organization, fac

    return None, None


INITIAL_PROCEDURES = [
    # Wound Care
    {"code": "PROC-WC-001", "name": "Wound Dressing (Simple)", "category": "WOUND_CARE", "body_system": "INTEGUMENTARY", "base_fee": 500, "typical_duration_minutes": 15},
    {"code": "PROC-WC-002", "name": "Wound Dressing (Complex)", "category": "WOUND_CARE", "body_system": "INTEGUMENTARY", "base_fee": 1000, "typical_duration_minutes": 30},
    {"code": "PROC-WC-003", "name": "Suturing (Simple)", "category": "WOUND_CARE", "body_system": "INTEGUMENTARY", "base_fee": 1500, "typical_duration_minutes": 20, "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-WC-004", "name": "Suturing (Complex)", "category": "WOUND_CARE", "body_system": "INTEGUMENTARY", "base_fee": 3000, "typical_duration_minutes": 45, "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-WC-005", "name": "Suture Removal", "category": "WOUND_CARE", "body_system": "INTEGUMENTARY", "base_fee": 300, "typical_duration_minutes": 10, "consent_required": False},
    # Minor Surgical
    {"code": "PROC-MS-001", "name": "Incision & Drainage (Abscess)", "category": "MINOR", "body_system": "INTEGUMENTARY", "base_fee": 3000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-MS-002", "name": "Foreign Body Removal (Skin)", "category": "MINOR", "body_system": "INTEGUMENTARY", "base_fee": 2000, "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-MS-003", "name": "Cyst Excision", "category": "MINOR", "body_system": "INTEGUMENTARY", "base_fee": 5000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-MS-004", "name": "Lipoma Excision", "category": "MINOR", "body_system": "INTEGUMENTARY", "base_fee": 8000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-MS-005", "name": "Nail Removal", "category": "MINOR", "body_system": "INTEGUMENTARY", "base_fee": 2500, "requires_anesthesia": True, "anesthesia_type": "local"},
    # Preventive
    {"code": "PROC-PV-001", "name": "Male Circumcision (Adult)", "category": "PREVENTIVE", "body_system": "REPRODUCTIVE", "base_fee": 5000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local", "witness_required": True},
    {"code": "PROC-PV-002", "name": "Male Circumcision (Pediatric)", "category": "PREVENTIVE", "body_system": "REPRODUCTIVE", "base_fee": 3000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local", "guardian_consent_required": True, "witness_required": True},
    # Injections
    {"code": "PROC-INJ-001", "name": "IM Injection", "category": "INJECTION", "body_system": "GENERAL", "base_fee": 200, "typical_duration_minutes": 5, "consent_required": False},
    {"code": "PROC-INJ-002", "name": "IV Injection", "category": "INJECTION", "body_system": "GENERAL", "base_fee": 300, "typical_duration_minutes": 10, "consent_required": False},
    {"code": "PROC-INJ-003", "name": "SC Injection", "category": "INJECTION", "body_system": "GENERAL", "base_fee": 200, "typical_duration_minutes": 5, "consent_required": False},
    {"code": "PROC-INJ-004", "name": "IV Cannulation", "category": "INJECTION", "body_system": "CARDIOVASCULAR", "base_fee": 500, "typical_duration_minutes": 10, "consent_required": False},
    {"code": "PROC-INJ-005", "name": "IV Infusion Setup", "category": "INJECTION", "body_system": "CARDIOVASCULAR", "base_fee": 800, "typical_duration_minutes": 15},
    # Ophthalmic
    {"code": "PROC-EYE-001", "name": "Eye Irrigation", "category": "OPHTHALMIC", "body_system": "SENSORY", "base_fee": 500, "typical_duration_minutes": 15},
    {"code": "PROC-EYE-002", "name": "Foreign Body Removal (Eye)", "category": "OPHTHALMIC", "body_system": "SENSORY", "base_fee": 1500, "typical_duration_minutes": 20},
    {"code": "PROC-EYE-003", "name": "Eye Examination (Detailed)", "category": "OPHTHALMIC", "body_system": "SENSORY", "base_fee": 1000, "typical_duration_minutes": 20, "consent_required": False},
    # ENT
    {"code": "PROC-ENT-001", "name": "Ear Syringing", "category": "ENT", "body_system": "SENSORY", "base_fee": 500, "typical_duration_minutes": 15},
    {"code": "PROC-ENT-002", "name": "Foreign Body Removal (Ear)", "category": "ENT", "body_system": "SENSORY", "base_fee": 1000, "typical_duration_minutes": 20},
    {"code": "PROC-ENT-003", "name": "Foreign Body Removal (Nose)", "category": "ENT", "body_system": "SENSORY", "base_fee": 1000, "typical_duration_minutes": 20},
    {"code": "PROC-ENT-004", "name": "Nasal Packing", "category": "ENT", "body_system": "SENSORY", "base_fee": 1500, "typical_duration_minutes": 20},
    # Urological
    {"code": "PROC-URO-001", "name": "Urethral Catheterization", "category": "THERAPEUTIC", "body_system": "URINARY", "base_fee": 1000, "typical_duration_minutes": 15},
    {"code": "PROC-URO-002", "name": "Catheter Change", "category": "THERAPEUTIC", "body_system": "URINARY", "base_fee": 500, "typical_duration_minutes": 10},
    {"code": "PROC-URO-003", "name": "Bladder Irrigation", "category": "THERAPEUTIC", "body_system": "URINARY", "base_fee": 800, "typical_duration_minutes": 20},
    # GI
    {"code": "PROC-GI-001", "name": "NG Tube Insertion", "category": "THERAPEUTIC", "body_system": "DIGESTIVE", "base_fee": 1000, "typical_duration_minutes": 15},
    {"code": "PROC-GI-002", "name": "NG Tube Removal", "category": "THERAPEUTIC", "body_system": "DIGESTIVE", "base_fee": 300, "typical_duration_minutes": 5, "consent_required": False},
    {"code": "PROC-GI-003", "name": "Gastric Lavage", "category": "THERAPEUTIC", "body_system": "DIGESTIVE", "base_fee": 2000, "typical_duration_minutes": 30, "risk_level": "MEDIUM"},
    {"code": "PROC-GI-004", "name": "Rectal Examination", "category": "DIAGNOSTIC", "body_system": "DIGESTIVE", "base_fee": 500, "typical_duration_minutes": 10},
    {"code": "PROC-GI-005", "name": "Enema Administration", "category": "THERAPEUTIC", "body_system": "DIGESTIVE", "base_fee": 800, "typical_duration_minutes": 20},
    # Diagnostic
    {"code": "PROC-DX-001", "name": "Lumbar Puncture", "category": "DIAGNOSTIC", "body_system": "NERVOUS", "base_fee": 5000, "risk_level": "HIGH", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-DX-002", "name": "Paracentesis (Abdominal Tap)", "category": "DIAGNOSTIC", "body_system": "DIGESTIVE", "base_fee": 5000, "risk_level": "HIGH", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-DX-003", "name": "Thoracentesis", "category": "DIAGNOSTIC", "body_system": "RESPIRATORY", "base_fee": 8000, "risk_level": "HIGH", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-DX-004", "name": "Bone Marrow Aspiration", "category": "DIAGNOSTIC", "body_system": "LYMPHATIC", "base_fee": 10000, "risk_level": "HIGH", "requires_anesthesia": True, "anesthesia_type": "local"},
    # Obstetric
    {"code": "PROC-OB-001", "name": "Vaginal Examination", "category": "OBSTETRIC", "body_system": "REPRODUCTIVE", "base_fee": 500, "typical_duration_minutes": 10},
    {"code": "PROC-OB-002", "name": "Cervical Examination", "category": "OBSTETRIC", "body_system": "REPRODUCTIVE", "base_fee": 500, "typical_duration_minutes": 10},
    {"code": "PROC-OB-003", "name": "Manual Vacuum Aspiration (MVA)", "category": "OBSTETRIC", "body_system": "REPRODUCTIVE", "base_fee": 8000, "risk_level": "HIGH"},
    {"code": "PROC-OB-004", "name": "Episiotomy Repair", "category": "OBSTETRIC", "body_system": "REPRODUCTIVE", "base_fee": 3000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-OB-005", "name": "Perineal Tear Repair", "category": "OBSTETRIC", "body_system": "REPRODUCTIVE", "base_fee": 5000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
    # Dental
    {"code": "PROC-DENT-001", "name": "Tooth Extraction (Simple)", "category": "DENTAL", "body_system": "DENTAL", "base_fee": 2000, "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-DENT-002", "name": "Tooth Extraction (Surgical)", "category": "DENTAL", "body_system": "DENTAL", "base_fee": 5000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-DENT-003", "name": "Dental Scaling", "category": "DENTAL", "body_system": "DENTAL", "base_fee": 3000},
    {"code": "PROC-DENT-004", "name": "Dental Filling", "category": "DENTAL", "body_system": "DENTAL", "base_fee": 2500, "requires_anesthesia": True, "anesthesia_type": "local"},
    {"code": "PROC-DENT-005", "name": "Root Canal Treatment", "category": "DENTAL", "body_system": "DENTAL", "base_fee": 15000, "risk_level": "MEDIUM", "requires_anesthesia": True, "anesthesia_type": "local"},
]


class Command(BaseCommand):
    help = "Seed the procedure catalog with common procedures"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without making changes",
        )
        parser.add_argument(
            "--link-billing",
            action="store_true",
            help="Create/link billing.Service records for each procedure",
        )
        parser.add_argument(
            "--facility",
            type=str,
            default=None,
            help="MFL code of the facility to assign (default: DEMO-HQ-001 or first active)",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        link_billing = options["link_billing"]

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
        skipped = 0

        for proc_data in INITIAL_PROCEDURES:
            code = proc_data["code"]
            existing = ProcedureCatalog.objects.filter(code=code).first()

            if existing:
                # Backfill org/facility on existing entries if missing
                updated_fields = []
                if not existing.organization:
                    existing.organization = organization
                    updated_fields.append("organization")
                if not existing.facility:
                    existing.facility = facility
                    updated_fields.append("facility")
                if updated_fields and not dry_run:
                    existing.save(update_fields=updated_fields)
                    if updated_fields:
                        self.stdout.write(
                            f"  BACKFILL: {code} - assigned to {facility.mfl_code}"
                        )
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(f"  CREATE: {code} - {proc_data['name']}")
            else:
                ProcedureCatalog.objects.create(
                    **proc_data,
                    organization=organization,
                    facility=facility,
                )
            created += 1

        action = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{action} {created} procedure(s), skipped {skipped} existing."
            )
        )

        if link_billing:
            self._link_billing_services(dry_run)

    def _link_billing_services(self, dry_run: bool) -> None:
        """Create billing.Service records for each procedure and link them."""
        from hmis.apps.billing.models import Service, ServiceCategory

        # Ensure PROC category exists
        proc_category, cat_created = ServiceCategory.objects.get_or_create(
            code="PROC",
            defaults={
                "name": "Procedures",
                "description": "Medical and surgical procedures",
            },
        )
        if cat_created and not dry_run:
            self.stdout.write(self.style.SUCCESS("  Created ServiceCategory: PROC"))

        system_user = User.objects.filter(is_superuser=True).first()
        if not system_user:
            system_user, _ = User.objects.get_or_create(
                username="system",
                defaults={"is_active": False, "first_name": "System", "last_name": "Account"},
            )

        linked = 0
        svc_created = 0

        for catalog_entry in ProcedureCatalog.objects.filter(billing_service__isnull=True):
            if not catalog_entry.base_fee:
                continue

            # Check if a Service with this code already exists
            service = Service.objects.filter(code=catalog_entry.code).first()

            if not service:
                if dry_run:
                    self.stdout.write(
                        f"  WOULD CREATE Service: {catalog_entry.code} - "
                        f"{catalog_entry.name} @ KES {catalog_entry.base_fee}"
                    )
                else:
                    service = Service.objects.create(
                        category=proc_category,
                        code=catalog_entry.code,
                        name=catalog_entry.name,
                        description=f"Procedure: {catalog_entry.name}",
                        unit_price=Decimal(str(catalog_entry.base_fee)),
                        sha_code=catalog_entry.sha_tariff_code or "",
                        is_active=True,
                        created_by=system_user,
                    )
                svc_created += 1

            if service and not dry_run:
                catalog_entry.billing_service = service
                catalog_entry.save(update_fields=["billing_service"])
            linked += 1

        action = "Would link" if dry_run else "Linked"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {linked} procedure(s) to billing services "
                f"({svc_created} new Service records)."
            )
        )
