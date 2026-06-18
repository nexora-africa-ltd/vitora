# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
from datetime import date
from urllib.parse import urlparse

import requests
from django.conf import settings
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
                user = None

            if user and user.check_password(password) and self.user_can_authenticate(user):
                return user

        return authenticate_cloud_user_for_hub(username=username, password=password)


def authenticate_cloud_user_for_hub(username: str | None, password: str | None):
    """Validate cloud credentials from a hub and activate the local placeholder user."""
    if not username or not password:
        return None
    if getattr(settings, "ENVIRONMENT", "") != "hub":
        return None
    if not getattr(settings, "HUB_CLOUD_AUTH_ENABLED", True):
        return None

    cloud_login_url = get_cloud_login_url()
    if not cloud_login_url:
        return None

    try:
        response = requests.post(  # nosec B113 - timeout is supplied from HUB_CLOUD_AUTH_TIMEOUT.
            cloud_login_url,
            json={"username": username, "password": password},
            headers={"Content-Type": "application/json", "X-Vitora-Client": "hub-auth/1.0"},
            timeout=getattr(settings, "HUB_CLOUD_AUTH_TIMEOUT", 10),
        )
    except requests.RequestException:
        return None

    if response.status_code != 200:
        return None

    try:
        payload = response.json()
    except ValueError:
        return None

    user_data = payload.get("user") or {}
    cloud_username = user_data.get("username") or username
    cloud_email = user_data.get("email") or (username if "@" in username else "")
    user = upsert_hub_user_from_cloud(
        user_id=user_data.get("id"),
        username=cloud_username,
        email=cloud_email,
        password=password,
        first_name=user_data.get("first_name", ""),
        last_name=user_data.get("last_name", ""),
        is_superuser=bool(user_data.get("is_superuser", False)),
        role_code=user_data.get("role") or "",
    )
    if user and self_user_can_authenticate(user):
        return user
    return None


def self_user_can_authenticate(user) -> bool:
    """Use ModelBackend's active-user rule without constructing request state."""
    return ModelBackend().user_can_authenticate(user)


def get_cloud_login_url() -> str:
    """Resolve the cloud auth endpoint from SYNC_SERVER_URL or explicit setting."""
    explicit = getattr(settings, "HUB_CLOUD_AUTH_URL", "")
    if explicit:
        return explicit.rstrip("/")

    sync_url = getattr(settings, "SYNC_SERVER_URL", "")
    if not sync_url:
        return ""
    parsed = urlparse(sync_url)
    if not parsed.scheme or not parsed.netloc:
        return ""

    path = parsed.path.rstrip("/")
    if path.endswith("/api/sync"):
        base_path = path[: -len("/api/sync")]
    elif path.endswith("/sync"):
        base_path = path[: -len("/sync")]
    else:
        base_path = path
    return f"{parsed.scheme}://{parsed.netloc}{base_path}/api/auth/login/"


def upsert_hub_user_from_cloud(
    *,
    user_id,
    username: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    is_superuser: bool,
    role_code: str,
):
    """Create/update the local hub user after successful cloud validation."""
    user = None
    if user_id:
        user = User.objects.filter(pk=user_id, username=username).first()
    if not user:
        user = User.objects.filter(username=username).first()
    if not user and email:
        user = User.objects.filter(email__iexact=email).first()
    if not user:
        create_kwargs = {"username": username, "email": email}
        if user_id and not User.objects.filter(pk=user_id).exists():
            create_kwargs["pk"] = user_id
        user = User.objects.create(**create_kwargs)

    user.username = username
    user.email = email
    user.first_name = first_name
    user.last_name = last_name
    user.is_superuser = is_superuser
    user.is_staff = bool(is_superuser)
    user.is_active = True
    user.set_password(password)
    user.save()

    ensure_hub_staff_profile(user, role_code=role_code)
    return user


def ensure_hub_staff_profile(user, *, role_code: str) -> None:
    """Attach remote-authenticated users to the activated hub org/facility if needed."""
    from hmis.apps.core.models import Department, Facility, Organization, Role, StaffProfile

    if StaffProfile.objects.filter(user=user).exists():
        profile = user.staff_profile
        changed_fields = []
        if profile.organization_id is None:
            organization = resolve_hub_organization(Organization)
            if organization:
                profile.organization = organization
                changed_fields.append("organization")
        if profile.primary_facility_id is None:
            facility = resolve_hub_facility(Facility)
            if facility:
                profile.primary_facility = facility
                changed_fields.append("primary_facility")
        if changed_fields:
            profile.save(update_fields=changed_fields)
        return

    organization = resolve_hub_organization(Organization)
    facility = resolve_hub_facility(Facility)
    role = Role.objects.filter(code=role_code, is_active=True).first() if role_code else None
    if not role:
        role = Role.objects.filter(is_active=True).order_by("hierarchy_level").first()
    department = Department.objects.filter(is_active=True).first()
    if role and department:
        StaffProfile.objects.create(
            user=user,
            employee_id=f"CLOUD-{user.pk or user.username}",
            organization=organization,
            primary_facility=facility,
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )


def resolve_hub_organization(Organization):
    org_id = getattr(settings, "HUB_ORGANIZATION_ID", "")
    if org_id:
        return Organization.objects.filter(pk=org_id).first()
    return Organization.objects.filter(is_active=True).first()


def resolve_hub_facility(Facility):
    facility_id = getattr(settings, "HUB_FACILITY_ID", "")
    if facility_id:
        return Facility.objects.filter(pk=facility_id).first()
    return Facility.objects.filter(is_active=True).first()
