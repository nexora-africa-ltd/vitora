"""
Management command to create a superuser for Vitora HMIS.
Used for initial setup and admin access.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import IntegrityError

User = get_user_model()


class Command(BaseCommand):
    help = "Creates a superuser account for admin access"

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            default="admin",
            help="Username for the superuser (default: admin)",
        )
        parser.add_argument(
            "--email",
            type=str,
            default="admin@vitora.hmis",
            help="Email for the superuser (default: admin@vitora.hmis)",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="a8nD7gDlRxDTrQ/voXOQkM4Tn6qCNQTy",
            help="Password for the superuser (default: a8nD7gDlRxDTrQ/voXOQkM4Tn6qCNQTy)",
        )

    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]
        password = options["password"]

        try:
            # Check if superuser already exists
            if User.objects.filter(username=username).exists():
                self.stdout.write(self.style.WARNING(f'Superuser "{username}" already exists'))
                return

            # Create superuser
            User.objects.create_superuser(username=username, email=email, password=password)

            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully created superuser "{username}" with password "{password}"'
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    "SECURITY: Change the default password immediately in production!"
                )
            )

        except IntegrityError as e:
            self.stdout.write(self.style.ERROR(f"Failed to create superuser: {e}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Unexpected error: {e}"))
