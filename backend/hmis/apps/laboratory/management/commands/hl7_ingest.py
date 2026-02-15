"""
Management command for HL7 ORU message ingestion testing.

Phase C: External exchange wiring (HL7/MLLP) behind flags

This command allows controlled testing of ORU message ingestion without
requiring an always-on socket listener.

Usage:
    # Validate message format (dry run)
    python manage.py hl7_ingest --file /path/to/oru.hl7 --validate

    # Import results from ORU file
    python manage.py hl7_ingest --file /path/to/oru.hl7 --user admin

    # Import from stdin
    cat oru.hl7 | python manage.py hl7_ingest --user admin

    # Override code system for mapping
    python manage.py hl7_ingest --file oru.hl7 --user admin --code-system LIS_ACME
"""

import sys

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    """Ingest HL7 ORU messages for testing external lab integration."""

    help = "Ingest HL7 ORU messages for testing external lab integration"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            "-f",
            type=str,
            help="Path to HL7 ORU message file. If not provided, reads from stdin.",
        )
        parser.add_argument(
            "--user",
            "-u",
            type=str,
            help="Username for the user importing results (required for import).",
        )
        parser.add_argument(
            "--validate",
            action="store_true",
            help="Validate message only without importing (dry run).",
        )
        parser.add_argument(
            "--code-system",
            "-c",
            type=str,
            help="Override HL7_LIS_CODE_SYSTEM for ExternalCodeMapping lookup.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force import even if HL7_INTEGRATION_ENABLED=False.",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show detailed output including raw message.",
        )

    def handle(self, *args, **options):
        from hmis.apps.laboratory.services.hl7_integration import (
            HL7IntegrationConfig,
            HL7IntegrationService,
        )

        # Read message from file or stdin
        file_path = options.get("file")
        if file_path:
            try:
                with open(file_path) as f:
                    oru_message = f.read()
            except FileNotFoundError:
                raise CommandError(f"File not found: {file_path}") from None
            except OSError as e:
                raise CommandError(f"Error reading file: {e}") from None
            self.stdout.write(f"Read ORU message from: {file_path}")
        else:
            if sys.stdin.isatty():
                raise CommandError(
                    "No input provided. Use --file or pipe message to stdin."
                )
            oru_message = sys.stdin.read()
            self.stdout.write("Read ORU message from stdin")

        if not oru_message.strip():
            raise CommandError("Empty ORU message")

        if options.get("verbose"):
            self.stdout.write("\n--- Raw Message ---")
            self.stdout.write(oru_message[:1000])
            if len(oru_message) > 1000:
                self.stdout.write(f"... ({len(oru_message)} bytes total)")
            self.stdout.write("--- End Message ---\n")

        # Configure service
        config = HL7IntegrationConfig.from_settings()

        # Force enable if --force flag used
        if options.get("force"):
            config.enabled = True
            self.stdout.write(
                self.style.WARNING("--force: Ignoring HL7_INTEGRATION_ENABLED setting")
            )

        # Override code system if provided
        if options.get("code_system"):
            config.lis_code_system = options["code_system"]
            self.stdout.write(f"Using code system: {config.lis_code_system}")

        service = HL7IntegrationService(config)

        # Check if integration is enabled
        if not service.is_enabled:
            raise CommandError(
                "HL7 integration is disabled (HL7_INTEGRATION_ENABLED=False). "
                "Use --force to override."
            )

        # Validate mode
        if options.get("validate"):
            is_valid, message = service.validate_oru_message(oru_message)
            if is_valid:
                self.stdout.write(self.style.SUCCESS(f"✓ {message}"))
            else:
                self.stdout.write(self.style.ERROR(f"✗ Validation failed: {message}"))
            return

        # Import mode - requires user
        username = options.get("user")
        if not username:
            raise CommandError("--user is required for import (not --validate)")

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"User not found: {username}") from None

        self.stdout.write(f"Importing results as user: {user.username}")

        # Process the ORU message
        result = service.process_oru_message(
            oru_message,
            entered_by=user,
            code_system=config.lis_code_system,
        )

        # Output results
        self.stdout.write("")
        self.stdout.write("=" * 50)
        self.stdout.write("HL7 ORU Import Results")
        self.stdout.write("=" * 50)

        if result.success:
            self.stdout.write(self.style.SUCCESS("✓ Import completed successfully"))
        else:
            self.stdout.write(self.style.ERROR("✗ Import failed"))

        self.stdout.write(f"Results created: {result.results_created}")
        self.stdout.write(f"Results skipped: {result.results_skipped}")

        if result.errors:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Errors:"))
            for error in result.errors:
                self.stdout.write(f"  - {error}")

        if result.lab_results and options.get("verbose"):
            self.stdout.write("")
            self.stdout.write("Created results:")
            for lab_result in result.lab_results:
                self.stdout.write(
                    f"  - {lab_result.order_item.test.name}: "
                    f"{lab_result.numeric_value or lab_result.text_value} "
                    f"{lab_result.result_unit}"
                )

        self.stdout.write("=" * 50)
