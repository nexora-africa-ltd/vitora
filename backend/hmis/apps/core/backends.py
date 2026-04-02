from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

User = get_user_model()


class EmailOrUsernameBackend(ModelBackend):
    """Authenticate by username or email address.

    Tries the default username lookup first. If that fails and the
    supplied ``username`` value looks like it could be an email, falls
    back to an email lookup (case-insensitive).
    """

    def authenticate(self, request, username=None, password=None, **kwargs):  # type: ignore[override]
        # Default path: authenticate by username
        user = super().authenticate(request, username=username, password=password, **kwargs)
        if user is not None:
            return user

        # Fallback: try email (case-insensitive)
        if username and "@" in username:
            try:
                user = User.objects.get(email__iexact=username)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                return None

            if user.check_password(password) and self.user_can_authenticate(user):
                return user

        return None
