"""
Management command to initialize the PKI root Certificate Authority.

Creates a self-signed X.509 root CA for document signing.
Idempotent — skips if an active root CA already exists.

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)

Usage:
    python manage.py init_pki_ca
    python manage.py init_pki_ca --name "My CA" --org "My Org" --key-size 4096
"""

from django.core.management.base import BaseCommand

from hmis.apps.core.services.pki_service import PKIService


class Command(BaseCommand):
    help = "Initialize the PKI root Certificate Authority for document signing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--name",
            default="Vitora HMIS Root CA",
            help="CA common name (default: 'Vitora HMIS Root CA').",
        )
        parser.add_argument(
            "--org",
            default="Nexora Africa Ltd",
            help="Organization name (default: 'Nexora Africa Ltd').",
        )
        parser.add_argument(
            "--country",
            default="KE",
            help="ISO country code (default: 'KE').",
        )
        parser.add_argument(
            "--key-size",
            type=int,
            default=2048,
            help="RSA key size in bits (default: 2048).",
        )
        parser.add_argument(
            "--validity-years",
            type=int,
            default=10,
            help="CA certificate validity in years (default: 10).",
        )

    def handle(self, *args, **options):
        service = PKIService()
        ca = service.initialize_ca(
            name=options["name"],
            org=options["org"],
            country=options["country"],
            key_size=options["key_size"],
            validity_years=options["validity_years"],
        )

        from hmis.apps.core.models import CertificateAuthority

        existing_count = CertificateAuthority.objects.filter(is_root=True, is_active=True).count()
        if existing_count > 1:
            self.stdout.write(self.style.WARNING(f"Active root CA already existed: {ca.name}"))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Root CA initialized: {ca.name}\n"
                    f"  Serial: {ca.serial_number}\n"
                    f"  Valid: {ca.valid_from.date()} to {ca.valid_to.date()}\n"
                    f"  Key size: {ca.key_size} bits"
                )
            )
