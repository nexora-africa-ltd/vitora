"""
Management command to seed default bed assignment rules.

Phase B: Creates default BED_ASSIGNMENT rules for common ward types.
"""

from django.core.management.base import BaseCommand

from hmis.apps.scheduling.models import AssignmentRule


class Command(BaseCommand):
    """Seed default bed assignment rules for Phase B."""

    help = "Create default BED_ASSIGNMENT rules for common ward types"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without actually creating rules",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing rules with the same code",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]

        rules = self._get_default_rules()

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for rule_data in rules:
            rule_code = rule_data["rule_code"]
            existing = AssignmentRule.objects.filter(rule_code=rule_code).first()

            if existing:
                if force:
                    if dry_run:
                        self.stdout.write(
                            self.style.WARNING(f"Would update: {rule_code}")
                        )
                    else:
                        for key, value in rule_data.items():
                            if key != "rule_code":
                                setattr(existing, key, value)
                        existing.version += 1
                        existing.save()
                        self.stdout.write(
                            self.style.SUCCESS(f"Updated: {rule_code} (v{existing.version})")
                        )
                    updated_count += 1
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Skipped: {rule_code} (exists, use --force to update)"
                        )
                    )
                    skipped_count += 1
            else:
                if dry_run:
                    self.stdout.write(self.style.SUCCESS(f"Would create: {rule_code}"))
                else:
                    AssignmentRule.objects.create(**rule_data)
                    self.stdout.write(self.style.SUCCESS(f"Created: {rule_code}"))
                created_count += 1

        # Summary
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created: {created_count}, Updated: {updated_count}, Skipped: {skipped_count}"
            )
        )

    def _get_default_rules(self):
        """Return the default bed assignment rules."""
        return [
            # General ward rule - load balancing with basic compatibility
            {
                "name": "General Ward Bed Assignment",
                "rule_code": "bed_assign_general",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Default bed assignment for general wards. "
                    "Checks compatibility and scores by occupancy rate (prefer less busy wards)."
                ),
                "priority": 100,
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "ward_type": "MEDICAL",
                    },
                    "constraints": [],  # Compatibility checked automatically
                    "scoring": [
                        # Prefer wards with lower occupancy (load balancing)
                        {"field": "ward_occupancy_rate", "weight": -1},
                    ],
                    "fallback": {
                        "action": "use_first_available",
                        "notify": "ward_nurse",
                    },
                },
            },
            # ICU ward rule - prioritize ventilator/oxygen capability
            {
                "name": "ICU Bed Assignment",
                "rule_code": "bed_assign_icu",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Bed assignment for ICU. "
                    "Requires oxygen-equipped ward and scores by ventilator capability."
                ),
                "priority": 200,  # Higher priority than general
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "ward_type": "ICU",
                    },
                    "constraints": [
                        # ICU patients typically need at least oxygen
                        {"field": "ward.oxygen_equipped", "operator": "==", "value": True},
                    ],
                    "scoring": [
                        # Prefer ventilator-capable beds for ICU
                        {"field": "ward.ventilator_capable", "weight": 10},
                        # Lower occupancy preferred
                        {"field": "ward_occupancy_rate", "weight": -0.5},
                    ],
                    "fallback": {
                        "action": "leave_unassigned",
                        "notify": "icu_supervisor",
                    },
                },
            },
            # Isolation ward rule - strict isolation requirements
            {
                "name": "Isolation Ward Bed Assignment",
                "rule_code": "bed_assign_isolation",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Bed assignment for isolation patients. "
                    "Strictly requires isolation-capable ward. No fallback."
                ),
                "priority": 250,  # Highest priority for safety
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "ward_type": "ISOLATION",
                    },
                    "constraints": [
                        {"field": "ward.isolation_capable", "operator": "==", "value": True},
                    ],
                    "scoring": [
                        # Prefer dedicated isolation wards
                        {"field": "ward.isolation_capable", "weight": 20},
                    ],
                    "fallback": {
                        "action": "leave_unassigned",
                        "notify": "infection_control",
                    },
                },
            },
            # Maternity ward rule - female-only, age-appropriate
            {
                "name": "Maternity Ward Bed Assignment",
                "rule_code": "bed_assign_maternity",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Bed assignment for maternity ward. "
                    "Gender and age validated via WardCompatibilityService."
                ),
                "priority": 180,
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "ward_type": "MATERNITY",
                    },
                    "constraints": [],  # Gender/age checked by compatibility service
                    "scoring": [
                        {"field": "ward_occupancy_rate", "weight": -1},
                    ],
                    "fallback": {
                        "action": "use_first_available",
                        "notify": "maternity_nurse",
                    },
                },
            },
            # Pediatric ward rule
            {
                "name": "Pediatric Ward Bed Assignment",
                "rule_code": "bed_assign_pediatric",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Bed assignment for pediatric ward. "
                    "Age validated via WardCompatibilityService (max 14 years)."
                ),
                "priority": 170,
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "ward_type": "PEDIATRIC",
                    },
                    "constraints": [],  # Age checked by compatibility service
                    "scoring": [
                        {"field": "ward_occupancy_rate", "weight": -1},
                    ],
                    "fallback": {
                        "action": "use_first_available",
                        "notify": "pediatric_nurse",
                    },
                },
            },
            # Surgical ward rule
            {
                "name": "Surgical Ward Bed Assignment",
                "rule_code": "bed_assign_surgical",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Bed assignment for surgical ward. "
                    "Prefers wards with oxygen for post-op monitoring."
                ),
                "priority": 150,
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "ward_type": "SURGICAL",
                    },
                    "constraints": [],
                    "scoring": [
                        # Post-surgical patients may need oxygen
                        {"field": "ward.oxygen_equipped", "weight": 5},
                        {"field": "ward_occupancy_rate", "weight": -1},
                    ],
                    "fallback": {
                        "action": "use_first_available",
                        "notify": "surgical_nurse",
                    },
                },
            },
            # Emergency admission rule - any ward type, priority assignment
            {
                "name": "Emergency Admission Bed Assignment",
                "rule_code": "bed_assign_emergency",
                "applies_to": "BED_ASSIGNMENT",
                "description": (
                    "Bed assignment for emergency admissions. "
                    "Lower priority threshold for constraints. Falls back immediately."
                ),
                "priority": 300,  # Highest priority
                "rule_definition": {
                    "version": "1.0",
                    "when": {
                        "admission_type": "EMERGENCY",
                    },
                    "constraints": [],  # No additional constraints for emergencies
                    "scoring": [
                        # Just get a bed - occupancy less important
                        {"field": "ward_occupancy_rate", "weight": -0.1},
                    ],
                    "fallback": {
                        "action": "use_first_available",
                        "notify": "emergency_coordinator",
                    },
                },
            },
        ]
