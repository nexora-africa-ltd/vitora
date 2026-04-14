"""
Management command to set up Allied Health permissions and groups.

Usage:
    python manage.py setup_allied_health_permissions

This command:
1. Creates/updates Django permission groups for allied health professionals
2. Assigns appropriate model permissions to each group
3. Handles sensitive data access permissions for social workers and counsellors
"""

from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Set up Allied Health permission groups."""

    help = "Set up Allied Health permission groups with appropriate permissions"

    # Permission mappings for each allied health group
    ALLIED_HEALTH_GROUPS = {
        "physiotherapists": {
            "description": "Physiotherapy professionals",
            "permissions": [
                # Physiotherapy module - full CRUD
                ("physiotherapy", "physiotherapyorder", "add"),
                ("physiotherapy", "physiotherapyorder", "change"),
                ("physiotherapy", "physiotherapyorder", "view"),
                ("physiotherapy", "physiotherapyorder", "delete"),
                ("physiotherapy", "physiotherapysession", "add"),
                ("physiotherapy", "physiotherapysession", "change"),
                ("physiotherapy", "physiotherapysession", "view"),
                ("physiotherapy", "physiotherapysession", "delete"),
                ("physiotherapy", "physiotherapytreatmenttype", "view"),
                # Patient - read only
                ("patients", "patient", "view"),
                # Encounter - read only
                ("encounters", "encounter", "view"),
            ],
        },
        "dietitians": {
            "description": "Nutrition and dietetics professionals",
            "permissions": [
                # Nutrition module - full CRUD
                ("nutrition", "nutritionconsultation", "add"),
                ("nutrition", "nutritionconsultation", "change"),
                ("nutrition", "nutritionconsultation", "view"),
                ("nutrition", "nutritionconsultation", "delete"),
                ("nutrition", "dietplan", "add"),
                ("nutrition", "dietplan", "change"),
                ("nutrition", "dietplan", "view"),
                ("nutrition", "dietplan", "delete"),
                ("nutrition", "dietplanmeal", "add"),
                ("nutrition", "dietplanmeal", "change"),
                ("nutrition", "dietplanmeal", "view"),
                ("nutrition", "dietplanmeal", "delete"),
                # Patient - read only
                ("patients", "patient", "view"),
                # Encounter - read only
                ("encounters", "encounter", "view"),
            ],
        },
        "occupational_therapists": {
            "description": "Occupational therapy professionals",
            "permissions": [
                # OT module - full CRUD
                ("occupational_therapy", "occupationaltherapyorder", "add"),
                ("occupational_therapy", "occupationaltherapyorder", "change"),
                ("occupational_therapy", "occupationaltherapyorder", "view"),
                ("occupational_therapy", "occupationaltherapyorder", "delete"),
                ("occupational_therapy", "otsession", "add"),
                ("occupational_therapy", "otsession", "change"),
                ("occupational_therapy", "otsession", "view"),
                ("occupational_therapy", "otsession", "delete"),
                ("occupational_therapy", "ottreatmenttype", "view"),
                # Patient - read only
                ("patients", "patient", "view"),
                # Encounter - read only
                ("encounters", "encounter", "view"),
            ],
        },
        "social_workers": {
            "description": "Medical social workers with sensitive case access",
            "permissions": [
                # Social Work module - full CRUD
                ("social_work", "socialworkreferral", "add"),
                ("social_work", "socialworkreferral", "change"),
                ("social_work", "socialworkreferral", "view"),
                ("social_work", "socialworkreferral", "delete"),
                ("social_work", "socialworkcase", "add"),
                ("social_work", "socialworkcase", "change"),
                ("social_work", "socialworkcase", "view"),
                ("social_work", "socialworkcase", "delete"),
                ("social_work", "casenote", "add"),
                ("social_work", "casenote", "change"),
                ("social_work", "casenote", "view"),
                ("social_work", "casenote", "delete"),
                ("social_work", "intervention", "add"),
                ("social_work", "intervention", "change"),
                ("social_work", "intervention", "view"),
                ("social_work", "intervention", "delete"),
                # Patient - read only with sensitive access
                ("patients", "patient", "view"),
                ("patients", "patient", "view_sensitive_patient"),
                # Encounter - read only
                ("encounters", "encounter", "view"),
            ],
        },
        "counsellors": {
            "description": "Counselling professionals with sensitive session access",
            "permissions": [
                # Counselling module - full CRUD
                ("counselling", "counsellingreferral", "add"),
                ("counselling", "counsellingreferral", "change"),
                ("counselling", "counsellingreferral", "view"),
                ("counselling", "counsellingreferral", "delete"),
                ("counselling", "counsellingsession", "add"),
                ("counselling", "counsellingsession", "change"),
                ("counselling", "counsellingsession", "view"),
                ("counselling", "counsellingsession", "delete"),
                ("counselling", "counsellingtype", "view"),
                # Patient - read only with sensitive access
                ("patients", "patient", "view"),
                ("patients", "patient", "view_sensitive_patient"),
                # Encounter - read only
                ("encounters", "encounter", "view"),
            ],
        },
    }

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )
        parser.add_argument(
            "--group",
            type=str,
            help="Set up only a specific group (e.g., 'physiotherapists')",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        dry_run = options["dry_run"]
        specific_group = options.get("group")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        groups_to_process = self.ALLIED_HEALTH_GROUPS
        if specific_group:
            if specific_group not in self.ALLIED_HEALTH_GROUPS:
                self.stderr.write(self.style.ERROR(f"Unknown group: {specific_group}"))
                self.stderr.write(
                    f"Available groups: {', '.join(self.ALLIED_HEALTH_GROUPS.keys())}"
                )
                return
            groups_to_process = {specific_group: self.ALLIED_HEALTH_GROUPS[specific_group]}

        created_groups = 0
        updated_groups = 0
        total_permissions_assigned = 0
        errors = []

        for group_name, config in groups_to_process.items():
            self.stdout.write(f"\nProcessing group: {group_name}")
            self.stdout.write(f"  Description: {config['description']}")

            # Create or get the group
            if dry_run:
                try:
                    group = Group.objects.get(name=group_name)
                    self.stdout.write(f"  Group exists: {group_name}")
                except Group.DoesNotExist:
                    self.stdout.write(self.style.SUCCESS(f"  Would create group: {group_name}"))
                    created_groups += 1
                    continue
            else:
                group, created = Group.objects.get_or_create(name=group_name)
                if created:
                    created_groups += 1
                    self.stdout.write(self.style.SUCCESS(f"  Created group: {group_name}"))
                else:
                    updated_groups += 1
                    self.stdout.write(f"  Updating group: {group_name}")

            # Assign permissions
            permissions_to_assign = []
            for app_label, model_name, codename_prefix in config["permissions"]:
                # Build the full codename
                if codename_prefix in ("add", "change", "view", "delete"):
                    codename = f"{codename_prefix}_{model_name}"
                else:
                    # Custom permission (e.g., view_sensitive_patient)
                    codename = codename_prefix

                try:
                    content_type = ContentType.objects.get(app_label=app_label, model=model_name)
                    permission = Permission.objects.get(
                        content_type=content_type, codename=codename
                    )
                    permissions_to_assign.append(permission)
                    if dry_run:
                        self.stdout.write(f"    Would assign: {app_label}.{codename}")
                    else:
                        self.stdout.write(f"    Assigning: {app_label}.{codename}")
                except ContentType.DoesNotExist:
                    error_msg = f"ContentType not found: {app_label}.{model_name}"
                    errors.append(error_msg)
                    self.stdout.write(self.style.WARNING(f"    Skipped: {error_msg}"))
                except Permission.DoesNotExist:
                    error_msg = f"Permission not found: {app_label}.{codename}"
                    errors.append(error_msg)
                    self.stdout.write(self.style.WARNING(f"    Skipped: {error_msg}"))

            if not dry_run and permissions_to_assign:
                # Clear existing permissions and set new ones
                group.permissions.set(permissions_to_assign)
                total_permissions_assigned += len(permissions_to_assign)

        # Summary
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(self.style.SUCCESS("SUMMARY"))
        self.stdout.write("=" * 50)

        if dry_run:
            self.stdout.write(f"Groups that would be created: {created_groups}")
            self.stdout.write(f"Groups that would be updated: {updated_groups}")
        else:
            self.stdout.write(f"Groups created: {created_groups}")
            self.stdout.write(f"Groups updated: {updated_groups}")
            self.stdout.write(f"Total permissions assigned: {total_permissions_assigned}")

        if errors:
            self.stdout.write(self.style.WARNING(f"\nWarnings ({len(errors)}):"))
            for error in errors:
                self.stdout.write(f"  - {error}")
            self.stdout.write(
                "\nNote: Some permissions may not exist if migrations haven't been run "
                "or models don't exist yet."
            )

        self.stdout.write(self.style.SUCCESS("\nAllied Health permissions setup complete!"))
