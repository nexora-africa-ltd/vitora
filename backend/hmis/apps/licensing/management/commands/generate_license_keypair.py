"""
Generate RSA-2048 keypair for license token signing.

Usage:
    python manage.py generate_license_keypair
    python manage.py generate_license_keypair --output-dir /path/to/keys

The private key should ONLY exist on the Nexora licensing server.
The public key should be distributed with every installation.
"""

import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate RSA-2048 keypair for license token signing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            type=str,
            default=str(Path(settings.BASE_DIR) / "keys"),
            help="Directory to write the keys to (default: backend/keys/)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing keys (DANGER: invalidates all existing tokens!).",
        )

    def handle(self, *args, **options):
        output_dir = Path(options["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)

        private_key_path = output_dir / "license_private.pem"
        public_key_path = output_dir / "license_public.pem"

        if private_key_path.exists() and not options["force"]:
            self.stderr.write(
                self.style.ERROR(
                    f"Private key already exists at {private_key_path}. "
                    "Use --force to overwrite (WARNING: invalidates all existing tokens!)."
                )
            )
            return

        # Generate RSA-2048 keypair
        self.stdout.write("Generating RSA-2048 keypair...")
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        # Write private key (0600 permissions)
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        old_umask = os.umask(0o177)
        try:
            private_key_path.write_bytes(private_pem)
        finally:
            os.umask(old_umask)

        # Write public key (0644 permissions)
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        public_key_path.write_bytes(public_pem)

        self.stdout.write(self.style.SUCCESS(f"Private key: {private_key_path}"))
        self.stdout.write(self.style.SUCCESS(f"Public key:  {public_key_path}"))
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "IMPORTANT: The private key must ONLY exist on the Nexora licensing server.\n"
                "           The public key should be distributed with every installation.\n"
                "           Add 'keys/license_private.pem' to .gitignore!"
            )
        )
