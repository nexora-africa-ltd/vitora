"""
Management command for KMS operations.

Provides commands for:
- Checking KMS health
- Viewing key metadata
- Rotating keys
- Generating new Fernet keys (for local provider)

Usage:
    # Check KMS status
    python manage.py kms_status

    # Rotate key
    python manage.py kms_rotate

    # Generate new Fernet key
    python manage.py kms_generate_key
"""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.kms import clear_kms_cache, get_kms_provider
from hmis.apps.core.kms.local import LocalKMSProvider
from hmis.apps.core.kms.rotation import KeyRotationService


class Command(BaseCommand):
    """Management command for KMS operations."""

    help = "Key Management System operations: status, rotate, generate"

    def add_arguments(self, parser):
        """Add command arguments."""
        subparsers = parser.add_subparsers(dest="operation", help="KMS operation to perform")

        # Status subcommand
        status_parser = subparsers.add_parser("status", help="Check KMS status and key metadata")
        status_parser.add_argument(
            "--json",
            action="store_true",
            help="Output in JSON format",
        )

        # Rotate subcommand
        rotate_parser = subparsers.add_parser("rotate", help="Rotate encryption key")
        rotate_parser.add_argument(
            "--force",
            action="store_true",
            help="Force rotation even if not needed",
        )
        rotate_parser.add_argument(
            "--reencrypt",
            action="store_true",
            help="Re-encrypt existing data with new key (local provider only)",
        )

        # Generate key subcommand
        gen_parser = subparsers.add_parser("generate-key", help="Generate a new Fernet key")
        gen_parser.add_argument(
            "--count",
            type=int,
            default=1,
            help="Number of keys to generate",
        )

        # Health check subcommand
        subparsers.add_parser("health", help="Check KMS provider health")

    def handle(self, *args, **options):
        """Handle the command."""
        operation = options.get("operation")

        if operation == "status":
            self.handle_status(options)
        elif operation == "rotate":
            self.handle_rotate(options)
        elif operation == "generate-key":
            self.handle_generate_key(options)
        elif operation == "health":
            self.handle_health(options)
        else:
            # Default to status if no operation specified
            self.handle_status(options)

    def handle_status(self, options):
        """Check KMS status and display key metadata."""
        try:
            provider = get_kms_provider()
            metadata = provider.get_key_metadata()

            if options.get("json"):
                output = {
                    "provider": provider.get_provider_name(),
                    "healthy": provider.is_healthy(),
                    "supports_auto_rotation": provider.supports_automatic_rotation(),
                    "key": {
                        "id": metadata.key_id,
                        "name": metadata.key_name,
                        "state": metadata.state.value,
                        "algorithm": metadata.algorithm,
                        "version": metadata.version,
                        "created_at": metadata.created_at.isoformat() if metadata.created_at else None,
                        "last_rotated_at": metadata.last_rotated_at.isoformat() if metadata.last_rotated_at else None,
                        "next_rotation_at": metadata.next_rotation_at.isoformat() if metadata.next_rotation_at else None,
                        "rotation_period_days": metadata.rotation_period_days,
                    },
                }
                self.stdout.write(json.dumps(output, indent=2))
            else:
                self.stdout.write(self.style.SUCCESS("\n🔐 KMS Status"))
                self.stdout.write("=" * 50)
                self.stdout.write(f"Provider: {provider.get_provider_name()}")
                self.stdout.write(f"Healthy: {'✅ Yes' if provider.is_healthy() else '❌ No'}")
                self.stdout.write(f"Auto-rotation: {'✅ Supported' if provider.supports_automatic_rotation() else '❌ Manual only'}")
                self.stdout.write("")
                self.stdout.write(self.style.SUCCESS("Key Information"))
                self.stdout.write("-" * 50)
                self.stdout.write(f"Key ID: {metadata.key_id}")
                self.stdout.write(f"Key Name: {metadata.key_name}")
                self.stdout.write(f"State: {metadata.state.value}")
                self.stdout.write(f"Algorithm: {metadata.algorithm}")
                self.stdout.write(f"Version: {metadata.version or 'N/A'}")
                self.stdout.write(f"Created: {metadata.created_at or 'N/A'}")
                self.stdout.write(f"Last Rotated: {metadata.last_rotated_at or 'Never'}")
                self.stdout.write(f"Next Rotation: {metadata.next_rotation_at or 'Not scheduled'}")
                self.stdout.write(f"Rotation Period: {metadata.rotation_period_days or 'N/A'} days")

                # Check if rotation needed
                service = KeyRotationService(provider)
                if service.needs_rotation():
                    self.stdout.write("")
                    self.stdout.write(self.style.WARNING("⚠️  Key rotation is recommended!"))
                    self.stdout.write("   Run: python manage.py kms rotate")

        except Exception as e:
            raise CommandError(f"Failed to get KMS status: {e}")

    def handle_rotate(self, options):
        """Rotate the encryption key."""
        try:
            clear_kms_cache()  # Clear cache to ensure fresh provider
            provider = get_kms_provider()
            service = KeyRotationService(provider)

            # Check if rotation is needed
            if not options.get("force") and not service.needs_rotation():
                self.stdout.write(
                    self.style.WARNING("Key rotation is not needed at this time.")
                )
                self.stdout.write("Use --force to rotate anyway.")
                return

            self.stdout.write("Starting key rotation...")

            if options.get("reencrypt"):
                result = service.rotate_and_reencrypt()
            else:
                result = service.rotate()

            if result.success:
                self.stdout.write(self.style.SUCCESS("\n✅ Key rotation successful!"))
                self.stdout.write(f"Old Key ID: {result.old_key_id or 'N/A'}")
                self.stdout.write(f"New Key ID: {result.new_key_id}")
                self.stdout.write(f"Records re-encrypted: {result.records_reencrypted}")
                self.stdout.write(f"Duration: {result.completed_at - result.started_at}")

                if result.metadata and result.metadata.tags and "new_key" in result.metadata.tags:
                    self.stdout.write("")
                    self.stdout.write(self.style.WARNING("⚠️  Local provider: Manual key update required!"))
                    self.stdout.write("New ENCRYPTION_KEY:")
                    self.stdout.write(f"  {result.metadata.tags['new_key']}")
                    self.stdout.write("")
                    self.stdout.write("Update your environment variables and re-encrypt existing data.")
            else:
                self.stdout.write(self.style.ERROR("\n❌ Key rotation failed!"))
                for error in result.errors:
                    self.stdout.write(f"  - {error}")

        except Exception as e:
            raise CommandError(f"Key rotation failed: {e}")

    def handle_generate_key(self, options):
        """Generate new Fernet keys."""
        count = options.get("count", 1)

        self.stdout.write(self.style.SUCCESS(f"\n🔑 Generating {count} Fernet key(s):\n"))

        for i in range(count):
            key = LocalKMSProvider.generate_key()
            self.stdout.write(f"Key {i + 1}: {key}")

        self.stdout.write("")
        self.stdout.write("Set one of these as ENCRYPTION_KEY in your environment.")

    def handle_health(self, options):
        """Check KMS provider health."""
        try:
            provider = get_kms_provider()
            is_healthy = provider.is_healthy()

            if is_healthy:
                self.stdout.write(self.style.SUCCESS("✅ KMS provider is healthy"))
            else:
                self.stdout.write(self.style.ERROR("❌ KMS provider is NOT healthy"))
                raise CommandError("KMS health check failed")

        except Exception as e:
            raise CommandError(f"KMS health check failed: {e}")
