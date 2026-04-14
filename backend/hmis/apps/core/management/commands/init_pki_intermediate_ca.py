"""
Management command to initialize an intermediate CA for a facility/tenant.

Creates an X.509 intermediate CA signed by the active root CA.
Idempotent — skips if an active intermediate CA with the same name exists.

Multi-tenant hierarchy:
  Root CA (Vitora production)
    └── Intermediate CA (per facility)

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)

Usage:
    python manage.py init_pki_intermediate_ca
    python manage.py init_pki_intermediate_ca --name "Kenyatta NH CA" --org "Kenyatta National Hospital"
    python manage.py init_pki_intermediate_ca --validity-years 3 --key-size 4096
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import CertificateAuthority
from hmis.apps.core.services.pki_service import PKIService


class Command(BaseCommand):
    help = "Initialize an intermediate CA for a facility, signed by the root CA."

    def add_arguments(self, parser):
        parser.add_argument(
            "--name",
            default="Facility Intermediate CA",
            help="Intermediate CA common name (default: 'Facility Intermediate CA').",
        )
        parser.add_argument(
            "--org",
            default="Health Facility",
            help="Organization/facility name (default: 'Health Facility').",
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
            default=5,
            help="CA certificate validity in years (default: 5).",
        )
        parser.add_argument(
            "--parent-ca-id",
            type=int,
            default=None,
            help="ID of specific parent CA to use. Defaults to the active root CA.",
        )

    def handle(self, *args, **options):
        # Resolve parent CA
        parent_ca_id = options["parent_ca_id"]
        if parent_ca_id:
            try:
                parent_ca = CertificateAuthority.objects.get(pk=parent_ca_id, is_active=True)
            except CertificateAuthority.DoesNotExist:
                raise CommandError(f"No active CA found with ID {parent_ca_id}.")
        else:
            parent_ca = CertificateAuthority.objects.filter(is_root=True, is_active=True).first()
            if parent_ca is None:
                raise CommandError(
                    "No active root CA found. Run 'python manage.py init_pki_ca' first."
                )

        service = PKIService()
        try:
            ca = service.create_intermediate_ca(
                parent_ca=parent_ca,
                name=options["name"],
                org=options["org"],
                country=options["country"],
                key_size=options["key_size"],
                validity_years=options["validity_years"],
            )
        except ValueError as e:
            raise CommandError(str(e))

        # Check if it was an existing CA (idempotent)
        existing_count = CertificateAuthority.objects.filter(
            name=options["name"], is_root=False, is_active=True
        ).count()
        if existing_count > 1:
            self.stdout.write(
                self.style.WARNING(f"Active intermediate CA already existed: {ca.name}")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Intermediate CA initialized: {ca.name}\n"
                    f"  Parent: {parent_ca.name}\n"
                    f"  Serial: {ca.serial_number}\n"
                    f"  Valid: {ca.valid_from.date()} to {ca.valid_to.date()}\n"
                    f"  Key size: {ca.key_size} bits"
                )
            )
