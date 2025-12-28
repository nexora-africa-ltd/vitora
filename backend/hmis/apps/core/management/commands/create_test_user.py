"""
Management command to create a test user for E2E testing.

This creates a user with:
- Username: testuser
- Password: testpassword123

Run with: python manage.py create_test_user
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Create a test user for E2E testing."""

    help = "Create a test user for E2E testing"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--username",
            type=str,
            default="testuser",
            help="Username for the test user (default: testuser)",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="testpassword123",
            help="Password for the test user (default: testpassword123)",
        )
        parser.add_argument(
            "--email",
            type=str,
            default="testuser@example.com",
            help="Email for the test user",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        User = get_user_model()

        username = options["username"]
        password = options["password"]
        email = options["email"]

        # Check if user already exists
        if User.objects.filter(username=username).exists():
            self.stdout.write(
                self.style.WARNING(f'User "{username}" already exists')
            )
            return

        # Create the user
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
        )

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created test user "{username}"')
        )
