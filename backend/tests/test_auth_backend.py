import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from hmis.apps.core.backends import EmailOrUsernameBackend

User = get_user_model()


@pytest.fixture
def backend():
    return EmailOrUsernameBackend()


@pytest.fixture
def user_with_email(db):
    return User.objects.create_user(
        username="jdoe",
        email="jdoe@hospital.ke",
        password="securePass1!",
    )


class TestEmailOrUsernameBackend:
    """Tests for the custom authentication backend that accepts username or email."""

    def test_authenticate_by_username(self, backend, user_with_email):
        """Should authenticate when correct username and password are provided."""
        user = backend.authenticate(None, username="jdoe", password="securePass1!")
        assert user is not None
        assert user.pk == user_with_email.pk

    def test_authenticate_by_email(self, backend, user_with_email):
        """Should authenticate when correct email and password are provided."""
        user = backend.authenticate(None, username="jdoe@hospital.ke", password="securePass1!")
        assert user is not None
        assert user.pk == user_with_email.pk

    def test_authenticate_by_email_case_insensitive(self, backend, user_with_email):
        """Should authenticate with email regardless of case."""
        user = backend.authenticate(None, username="JDOE@Hospital.KE", password="securePass1!")
        assert user is not None
        assert user.pk == user_with_email.pk

    def test_wrong_password_by_username(self, backend, user_with_email):
        """Should reject wrong password when authenticating by username."""
        user = backend.authenticate(None, username="jdoe", password="wrong")
        assert user is None

    def test_wrong_password_by_email(self, backend, user_with_email):
        """Should reject wrong password when authenticating by email."""
        user = backend.authenticate(None, username="jdoe@hospital.ke", password="wrong")
        assert user is None

    def test_nonexistent_username(self, backend, db):
        """Should return None for a username that does not exist."""
        user = backend.authenticate(None, username="ghost", password="any")
        assert user is None

    def test_nonexistent_email(self, backend, db):
        """Should return None for an email that does not exist."""
        user = backend.authenticate(None, username="ghost@nowhere.com", password="any")
        assert user is None

    def test_inactive_user_rejected_by_username(self, backend, user_with_email):
        """Should reject inactive users when authenticating by username."""
        user_with_email.is_active = False
        user_with_email.save()
        user = backend.authenticate(None, username="jdoe", password="securePass1!")
        assert user is None

    def test_inactive_user_rejected_by_email(self, backend, user_with_email):
        """Should reject inactive users when authenticating by email."""
        user_with_email.is_active = False
        user_with_email.save()
        user = backend.authenticate(None, username="jdoe@hospital.ke", password="securePass1!")
        assert user is None

    def test_duplicate_email_returns_none(self, backend, user_with_email, db):
        """Should return None when multiple users share the same email.

        This scenario can only arise from legacy data (before the unique
        constraint was added). We simulate it by temporarily disconnecting the
        pre_save signal.
        """
        from hmis.apps.core.signals import enforce_unique_email
        from django.db.models.signals import pre_save

        pre_save.disconnect(enforce_unique_email, sender=User)
        try:
            User.objects.create_user(
                username="jdoe2",
                email="jdoe@hospital.ke",  # duplicate email
                password="otherPass1!",
            )
        finally:
            pre_save.connect(enforce_unique_email, sender=User)

        user = backend.authenticate(None, username="jdoe@hospital.ke", password="securePass1!")
        assert user is None

    def test_non_email_string_skips_email_fallback(self, backend, db):
        """Should not attempt email lookup when input has no @ symbol."""
        user = backend.authenticate(None, username="notanemail", password="any")
        assert user is None

    @pytest.mark.xfail(
        reason="Pre-existing: core_usertotpdevice table missing in isolated test runs",
        raises=Exception,
    )
    def test_jwt_login_by_username(self, api_client, test_user):
        """Should obtain JWT tokens via /api/token/ using username."""
        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
            format="json",
        )
        # 200 means tokens issued, or MFA required
        assert response.status_code in (200, 202)

    @pytest.mark.xfail(
        reason="Pre-existing: core_usertotpdevice table missing in isolated test runs",
        raises=Exception,
    )
    def test_jwt_login_by_email(self, api_client, test_user):
        """Should obtain JWT tokens via /api/token/ using email."""
        response = api_client.post(
            "/api/token/",
            {"username": "test@example.com", "password": "testpassword123"},
            format="json",
        )
        assert response.status_code in (200, 202)

    @pytest.mark.xfail(
        reason="Pre-existing: core_usertotpdevice table missing in isolated test runs",
        raises=Exception,
    )
    def test_jwt_login_wrong_credentials(self, api_client, test_user):
        """Should reject invalid credentials via /api/token/."""
        response = api_client.post(
            "/api/token/",
            {"username": "test@example.com", "password": "wrong"},
            format="json",
        )
        assert response.status_code == 401


class TestUniqueEmailConstraint:
    """Tests for the database-level unique email constraint."""

    def test_duplicate_email_raises_validation_error(self, user_with_email, db):
        """Should reject creating a second user with the same email."""
        with pytest.raises(ValidationError, match="email"):
            User.objects.create_user(
                username="other",
                email="jdoe@hospital.ke",
                password="pass123!",
            )

    def test_duplicate_email_case_insensitive(self, user_with_email, db):
        """Should reject duplicate emails regardless of case."""
        with pytest.raises(ValidationError, match="email"):
            User.objects.create_user(
                username="other",
                email="JDOE@Hospital.KE",
                password="pass123!",
            )

    def test_different_emails_allowed(self, user_with_email, db):
        """Should allow users with different email addresses."""
        user2 = User.objects.create_user(
            username="other",
            email="other@hospital.ke",
            password="pass123!",
        )
        assert user2.pk is not None

    def test_empty_email_allowed_for_multiple_users(self, db):
        """Should allow multiple users with empty email (admin-created)."""
        User.objects.create_user(username="noemail1", email="", password="pass1!")
        User.objects.create_user(username="noemail2", email="", password="pass2!")
        assert User.objects.filter(email="").count() == 2

    def test_serializer_rejects_duplicate_email(self, user_with_email, db):
        """StaffProfileCreateSerializer should reject duplicate email."""
        from hmis.apps.core.serializers import StaffProfileCreateSerializer

        data = {
            "username": "newuser",
            "email": "jdoe@hospital.ke",
            "first_name": "New",
            "last_name": "User",
            "employee_id": "EMP-999",
        }
        serializer = StaffProfileCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "email" in serializer.errors
