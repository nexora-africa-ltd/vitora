"""
Management command to issue a user certificate for document signing.

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)

Usage:
    python manage.py issue_user_cert --username admin
    python manage.py issue_user_cert --username doctor1 --validity-years 3
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.services.pki_service import PKIService

User = get_user_model()


class Command(BaseCommand):
    help = "Issue an X.509 certificate for a user (for document signing)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            required=True,
            help="Username of the user to issue a certificate for.",
        )
        parser.add_argument(
            "--validity-years",
            type=int,
            default=2,
            help="Certificate validity in years (default: 2).",
        )

    def handle(self, *args, **options):
        username = options["username"]
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"User '{username}' not found.")

        service = PKIService()
        try:
            cert = service.issue_user_certificate(
                user=user,
                validity_years=options["validity_years"],
            )
        except ValueError as e:
            raise CommandError(str(e))

        self.stdout.write(
            self.style.SUCCESS(
                f"Certificate issued for {username}\n"
                f"  Serial: {cert.serial_number}\n"
                f"  Subject: {cert.subject_dn}\n"
                f"  Valid: {cert.valid_from.date()} to {cert.valid_to.date()}"
            )
        )
