"""
Management command to seed the billing service catalog.

Seeds standard Kenyan healthcare service categories and common billable
services.  Prices are in KES and can be customised per facility via the
admin interface after seeding.

Usage:
    python manage.py seed_service_catalog            # create missing only
    python manage.py seed_service_catalog --force     # overwrite existing
    python manage.py seed_service_catalog --dry-run   # preview, no writes
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from hmis.apps.billing.models import Service, ServiceCategory

User = get_user_model()

CATEGORIES = [
    {
        "name": "Consultation",
        "code": "CONSULT",
        "description": "Outpatient and specialist consultations",
    },
    {"name": "Laboratory", "code": "LAB", "description": "Laboratory tests and investigations"},
    {"name": "Radiology", "code": "RAD", "description": "Imaging and radiology services"},
    {"name": "Pharmacy", "code": "PHARM", "description": "Medications and pharmaceutical supplies"},
    {"name": "Procedures", "code": "PROC", "description": "Medical and surgical procedures"},
    {"name": "Inpatient", "code": "IPD", "description": "Inpatient stay and bed charges"},
    {"name": "Emergency", "code": "EMER", "description": "Emergency and triage services"},
    {
        "name": "Maternity",
        "code": "MAT",
        "description": "Antenatal, delivery, and postnatal services",
    },
    {"name": "Dental", "code": "DENTAL", "description": "Dental and oral health services"},
    {"name": "Physiotherapy", "code": "PHYSIO", "description": "Physiotherapy and rehabilitation"},
    {"name": "Nursing", "code": "NURS", "description": "Nursing care and procedures"},
    {"name": "Mortuary", "code": "MORT", "description": "Mortuary and body preservation"},
    {
        "name": "Administrative",
        "code": "ADMIN",
        "description": "Registration, records, and administrative fees",
    },
    {
        "name": "Allied Health",
        "code": "ALLIED",
        "description": "Occupational therapy, nutrition, counselling",
    },
]

SERVICES = [
    # --- Consultation ---
    {
        "category_code": "CONSULT",
        "name": "General Consultation",
        "code": "CONSULT-001",
        "price": Decimal("500.00"),
        "sha_code": "SHA-CONSULT-001",
    },
    {
        "category_code": "CONSULT",
        "name": "Specialist Consultation",
        "code": "CONSULT-002",
        "price": Decimal("1500.00"),
        "sha_code": "SHA-CONSULT-002",
    },
    {
        "category_code": "CONSULT",
        "name": "Follow-up Consultation",
        "code": "CONSULT-003",
        "price": Decimal("300.00"),
        "sha_code": "SHA-CONSULT-003",
    },
    # --- Laboratory (codes MUST match TestCatalog codes for auto-billing) ---
    {
        "category_code": "LAB",
        "name": "Complete Blood Count",
        "code": "CBC",
        "price": Decimal("800.00"),
        "sha_code": "SHA-LAB-001",
    },
    {
        "category_code": "LAB",
        "name": "Hemoglobin",
        "code": "HB",
        "price": Decimal("200.00"),
        "sha_code": "SHA-LAB-002",
    },
    {
        "category_code": "LAB",
        "name": "Erythrocyte Sedimentation Rate",
        "code": "ESR",
        "price": Decimal("300.00"),
        "sha_code": "SHA-LAB-003",
    },
    {
        "category_code": "LAB",
        "name": "Blood Grouping & Rh",
        "code": "BG",
        "price": Decimal("500.00"),
        "sha_code": "SHA-LAB-004",
    },
    {
        "category_code": "LAB",
        "name": "Random Blood Sugar",
        "code": "RBS",
        "price": Decimal("150.00"),
        "sha_code": "SHA-LAB-005",
    },
    {
        "category_code": "LAB",
        "name": "Fasting Blood Sugar",
        "code": "FBS",
        "price": Decimal("200.00"),
        "sha_code": "SHA-LAB-006",
    },
    {
        "category_code": "LAB",
        "name": "Creatinine",
        "code": "CREA",
        "price": Decimal("400.00"),
        "sha_code": "SHA-LAB-007",
    },
    {
        "category_code": "LAB",
        "name": "HIV 1&2 Antibody",
        "code": "HIV",
        "price": Decimal("500.00"),
        "sha_code": "SHA-LAB-008",
    },
    {
        "category_code": "LAB",
        "name": "Hepatitis B Surface Antigen",
        "code": "HBSAG",
        "price": Decimal("600.00"),
        "sha_code": "SHA-LAB-009",
    },
    {
        "category_code": "LAB",
        "name": "Malaria Parasites (Microscopy)",
        "code": "MPS",
        "price": Decimal("300.00"),
        "sha_code": "SHA-LAB-010",
    },
    {
        "category_code": "LAB",
        "name": "Malaria RDT",
        "code": "MRDT",
        "price": Decimal("200.00"),
        "sha_code": "SHA-LAB-011",
    },
    {
        "category_code": "LAB",
        "name": "Stool Examination",
        "code": "STOOL",
        "price": Decimal("350.00"),
        "sha_code": "SHA-LAB-012",
    },
    {
        "category_code": "LAB",
        "name": "Urinalysis",
        "code": "UA",
        "price": Decimal("250.00"),
        "sha_code": "SHA-LAB-013",
    },
    {
        "category_code": "LAB",
        "name": "Urine Culture",
        "code": "UC",
        "price": Decimal("800.00"),
        "sha_code": "SHA-LAB-014",
    },
    {
        "category_code": "LAB",
        "name": "CD4 Count",
        "code": "CD4",
        "price": Decimal("1500.00"),
        "sha_code": "SHA-LAB-015",
    },
    {
        "category_code": "LAB",
        "name": "Viral Load",
        "code": "VL",
        "price": Decimal("2000.00"),
        "sha_code": "SHA-LAB-016",
    },
    # --- Radiology ---
    {
        "category_code": "RAD",
        "name": "Chest X-Ray",
        "code": "RAD-001",
        "price": Decimal("1000.00"),
        "sha_code": "SHA-RAD-001",
    },
    {
        "category_code": "RAD",
        "name": "Abdominal Ultrasound",
        "code": "RAD-002",
        "price": Decimal("1500.00"),
        "sha_code": "SHA-RAD-002",
    },
    {
        "category_code": "RAD",
        "name": "Obstetric Ultrasound",
        "code": "RAD-003",
        "price": Decimal("1500.00"),
        "sha_code": "SHA-RAD-003",
    },
    # --- Procedures ---
    {
        "category_code": "PROC",
        "name": "Wound Dressing (Minor)",
        "code": "PROC-001",
        "price": Decimal("500.00"),
        "sha_code": "SHA-PROC-001",
    },
    {
        "category_code": "PROC",
        "name": "Incision and Drainage",
        "code": "PROC-002",
        "price": Decimal("2000.00"),
        "sha_code": "SHA-PROC-002",
    },
    {
        "category_code": "PROC",
        "name": "Suturing (Minor)",
        "code": "PROC-003",
        "price": Decimal("1500.00"),
        "sha_code": "SHA-PROC-003",
    },
    {
        "category_code": "PROC",
        "name": "Circumcision",
        "code": "PROC-004",
        "price": Decimal("3000.00"),
        "sha_code": "SHA-PROC-004",
    },
    # --- Inpatient ---
    {
        "category_code": "IPD",
        "name": "General Ward Bed-Night",
        "code": "IPD-001",
        "price": Decimal("1500.00"),
        "sha_code": "SHA-IPD-001",
    },
    {
        "category_code": "IPD",
        "name": "Private Ward Bed-Night",
        "code": "IPD-002",
        "price": Decimal("4000.00"),
        "sha_code": "SHA-IPD-002",
    },
    {
        "category_code": "IPD",
        "name": "Admission Fee",
        "code": "IPD-003",
        "price": Decimal("500.00"),
        "sha_code": "SHA-IPD-003",
    },
    # --- Emergency ---
    {
        "category_code": "EMER",
        "name": "Emergency Triage",
        "code": "EMER-001",
        "price": Decimal("1000.00"),
        "sha_code": "SHA-EMER-001",
    },
    {
        "category_code": "EMER",
        "name": "Resuscitation",
        "code": "EMER-002",
        "price": Decimal("5000.00"),
        "sha_code": "SHA-EMER-002",
    },
    # --- Maternity ---
    {
        "category_code": "MAT",
        "name": "Antenatal Visit",
        "code": "MAT-001",
        "price": Decimal("500.00"),
        "sha_code": "SHA-MAT-001",
    },
    {
        "category_code": "MAT",
        "name": "Normal Delivery",
        "code": "MAT-002",
        "price": Decimal("10000.00"),
        "sha_code": "SHA-MAT-002",
    },
    {
        "category_code": "MAT",
        "name": "Caesarean Section",
        "code": "MAT-003",
        "price": Decimal("35000.00"),
        "sha_code": "SHA-MAT-003",
    },
    # --- Nursing ---
    {
        "category_code": "NURS",
        "name": "IV Cannulation",
        "code": "NURS-001",
        "price": Decimal("300.00"),
        "sha_code": "SHA-NURS-001",
    },
    {
        "category_code": "NURS",
        "name": "Catheterization",
        "code": "NURS-002",
        "price": Decimal("500.00"),
        "sha_code": "SHA-NURS-002",
    },
    {
        "category_code": "NURS",
        "name": "Injection (IM/SC)",
        "code": "NURS-003",
        "price": Decimal("200.00"),
        "sha_code": "SHA-NURS-003",
    },
    # --- Administrative ---
    {
        "category_code": "ADMIN",
        "name": "Registration Fee",
        "code": "ADMIN-001",
        "price": Decimal("100.00"),
        "sha_code": "",
    },
    {
        "category_code": "ADMIN",
        "name": "Medical Records Copy",
        "code": "ADMIN-002",
        "price": Decimal("200.00"),
        "sha_code": "",
    },
    {
        "category_code": "ADMIN",
        "name": "Medical Report",
        "code": "ADMIN-003",
        "price": Decimal("500.00"),
        "sha_code": "",
    },
]


class Command(BaseCommand):
    """Seed billing service catalog with standard Kenya healthcare services."""

    help = "Seed the billing service catalog with standard Kenyan healthcare service categories and services"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing services (updates price, SHA code, name)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without writing to the database",
        )

    def handle(self, *args, **options):
        force = options["force"]
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved\n"))

        # Get or create a system user for the created_by FK
        system_user = User.objects.filter(is_superuser=True).first()
        if system_user is None:
            system_user, _ = User.objects.get_or_create(
                username="system",
                defaults={"is_active": False, "first_name": "System", "last_name": "Account"},
            )

        # --- Seed categories ---
        cat_created = 0
        cat_skipped = 0
        cat_map: dict[str, ServiceCategory] = {}

        for cat_data in CATEGORIES:
            # Check by code first, then fall back to name (both are unique)
            existing = ServiceCategory.objects.filter(code=cat_data["code"]).first()
            if not existing:
                existing = ServiceCategory.objects.filter(name=cat_data["name"]).first()
            if existing:
                cat_map[cat_data["code"]] = existing
                cat_skipped += 1
                if not dry_run and force:
                    existing.code = cat_data["code"]
                    existing.name = cat_data["name"]
                    existing.description = cat_data["description"]
                    existing.save(update_fields=["code", "name", "description"])
            else:
                if dry_run:
                    cat_map[cat_data["code"]] = None  # placeholder so services aren't skipped
                else:
                    obj = ServiceCategory.objects.create(**cat_data)
                    cat_map[cat_data["code"]] = obj
                cat_created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  Category: {cat_data['code']} — {cat_data['name']}")
                )

        self.stdout.write(f"\nCategories: {cat_created} created, {cat_skipped} existing")

        # --- Seed services ---
        svc_created = 0
        svc_updated = 0
        svc_skipped = 0

        for svc_data in SERVICES:
            cat_code = svc_data["category_code"]
            if cat_code not in cat_map:
                self.stdout.write(
                    self.style.WARNING(
                        f"  Skipped {svc_data['code']}: category {cat_code} not found"
                    )
                )
                continue
            category = cat_map[cat_code]

            existing = Service.objects.filter(code=svc_data["code"]).first()
            if not existing:
                existing = Service.objects.filter(name=svc_data["name"]).first()
            if existing:
                if force:
                    if not dry_run:
                        existing.code = svc_data["code"]
                        existing.name = svc_data["name"]
                        existing.unit_price = svc_data["price"]
                        existing.sha_code = svc_data.get("sha_code", "")
                        existing.category = category
                        existing.save(
                            update_fields=["code", "name", "unit_price", "sha_code", "category"]
                        )
                    svc_updated += 1
                    self.stdout.write(f"  Updated: {svc_data['code']}")
                else:
                    svc_skipped += 1
            else:
                if not dry_run:
                    Service.objects.create(
                        code=svc_data["code"],
                        category=category,
                        name=svc_data["name"],
                        unit_price=svc_data["price"],
                        sha_code=svc_data.get("sha_code", ""),
                        is_active=True,
                        created_by=system_user,
                    )
                svc_created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  Service: {svc_data['code']} — {svc_data['name']}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSeeding complete: {svc_created} created, {svc_updated} updated, {svc_skipped} skipped"
            )
        )
