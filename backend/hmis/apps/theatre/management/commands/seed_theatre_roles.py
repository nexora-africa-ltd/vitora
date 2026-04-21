"""
Management command to seed theatre-specific roles.

Creates roles for theatre staff if they do not already exist.
Safe to run multiple times — only creates missing roles.

Usage:
    python manage.py seed_theatre_roles
    python manage.py seed_theatre_roles --dry-run
"""

from django.core.management.base import BaseCommand

from hmis.apps.core.models import Role

THEATRE_ROLES = [
    {
        "code": "THEATRE_COORDINATOR",
        "name": "Theatre Coordinator",
        "category": "CLINICAL",
        "description": (
            "Manages theatre scheduling, assigns surgical teams, and oversees daily theatre lists."
        ),
    },
    {
        "code": "SURGEON",
        "name": "Surgeon",
        "category": "CLINICAL",
        "description": (
            "Performs surgical procedures, documents operative notes, "
            "and manages post-operative care plans."
        ),
    },
    {
        "code": "ANESTHESIOLOGIST",
        "name": "Anesthesiologist",
        "category": "CLINICAL",
        "description": (
            "Provides anesthesia care including pre-op evaluation, "
            "intra-op monitoring, and PACU handover."
        ),
    },
    {
        "code": "THEATRE_NURSE",
        "name": "Theatre Nurse",
        "category": "CLINICAL",
        "description": (
            "Circulating nurse responsible for WHO safety checklists, "
            "patient advocacy, and theatre documentation."
        ),
    },
    {
        "code": "SCRUB_TECH",
        "name": "Scrub Technician",
        "category": "TECHNICAL",
        "description": (
            "Manages sterile field, instruments, consumable tracking, "
            "and implant serial number documentation."
        ),
    },
    {
        "code": "RECOVERY_NURSE",
        "name": "Recovery Nurse",
        "category": "CLINICAL",
        "description": (
            "Monitors patients in PACU, records Aldrete scores, "
            "and manages post-anaesthesia discharge."
        ),
    },
]


class Command(BaseCommand):
    help = "Seed theatre-specific roles (Theatre Coordinator, Surgeon, etc.)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview roles that would be created without writing to DB.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        created_count = 0
        existing_count = 0

        for role_data in THEATRE_ROLES:
            exists = Role.objects.filter(code=role_data["code"]).exists()
            if exists:
                existing_count += 1
                self.stdout.write(f"  [exists] {role_data['code']}: {role_data['name']}")
            else:
                if dry_run:
                    self.stdout.write(f"  [would create] {role_data['code']}: {role_data['name']}")
                else:
                    Role.objects.create(**role_data)
                    self.stdout.write(
                        self.style.SUCCESS(f"  [created] {role_data['code']}: {role_data['name']}")
                    )
                created_count += 1

        verb = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{verb} {created_count} role(s), {existing_count} already existed."
            )
        )
