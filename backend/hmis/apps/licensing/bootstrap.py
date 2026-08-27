# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Bootstrap helpers for activation-driven hub provisioning."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import CommandError


def _sync_url_from_base(base_url: str) -> str:
    """Build the sync endpoint URL from a public API base URL."""
    return f"{base_url.rstrip('/')}/api/sync"


def _is_local_url(url: str) -> bool:
    """Return whether a URL points at a local development server."""
    normalized = url.lower()
    return "localhost" in normalized or "127.0.0.1" in normalized


def _activation_sync_url(request: Any | None = None) -> str:
    """Return the cloud sync URL to embed in activation payloads."""
    sync_url = (getattr(settings, "SYNC_SERVER_URL", "") or "").strip()
    if sync_url and not _is_local_url(sync_url):
        return sync_url

    cloud_base_url = (getattr(settings, "CLOUD_API_BASE_URL", "") or "").strip()
    if cloud_base_url:
        return _sync_url_from_base(cloud_base_url)

    if request and not getattr(settings, "DEBUG", False):
        return _sync_url_from_base(request.build_absolute_uri("/"))

    if sync_url:
        return sync_url

    return sync_url


def _build_tibabot_config(facility) -> dict[str, Any]:
    """Build TibaBot configuration block for the activation response.

    Passes through the cloud's TibaBot settings so the hub installer can
    write them to the hub's .env file.
    """
    enabled = getattr(settings, "TIBABOT_ENABLED", False)
    config: dict[str, Any] = {
        "enabled": "true" if enabled else "false",
        "api_url": getattr(settings, "TIBABOT_API_URL", ""),
        "timeout": str(getattr(settings, "TIBABOT_TIMEOUT", 30)),
        "jwt_issuer": getattr(settings, "TIBABOT_JWT_ISSUER", "vitora-hmis"),
        "jwt_audience": getattr(settings, "TIBABOT_JWT_AUDIENCE", "tibabot"),
        "jwt_expiry_seconds": str(getattr(settings, "TIBABOT_JWT_EXPIRY_SECONDS", 300)),
        "jwks_url": getattr(settings, "TIBABOT_JWKS_URL", ""),
    }

    # Include per-facility API key if one exists
    if facility:
        try:
            fk = getattr(facility, "tibabot_key", None)
            if fk and fk.is_active and fk.api_key:
                config["api_key"] = fk.api_key
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError):  # noqa: S110
            pass

    return config


def build_activation_bootstrap_payload(
    installation, token: str, decoded: dict[str, Any], request: Any | None = None
) -> dict[str, Any]:
    """Build the activation response used by installers to seed a hub."""
    organization = installation.organization
    facility = installation.facility

    payload = {
        "license_token": token,
        "installation_id": str(installation.installation_id),
        "org_name": organization.name,
        "tier": getattr(organization, "subscription_tier", ""),
        "features": decoded.get("features", {}),
        "expires_at": decoded.get("exp"),
        "check_in_by": decoded.get("check_in_by"),
        "sync_url": _activation_sync_url(request),
        "encryption_key": getattr(settings, "ENCRYPTION_KEY", ""),
        "pii_hmac_key": getattr(settings, "PII_HMAC_KEY", ""),
        # WebAuthn config so installers can seed sensible defaults. Leaving
        # these blank lets the installer fall back to localhost-scoped values
        # (which is the only WebAuthn config that works over HTTP).
        "webauthn_rp_id": getattr(settings, "WEBAUTHN_RP_ID", ""),
        "webauthn_origin": getattr(settings, "WEBAUTHN_ORIGIN", ""),
        "organization": serialize_organization(organization),
        "facility": serialize_facility(facility) if facility else None,
        "bootstrap": {
            "departments": serialize_departments(organization=organization, facility=facility),
            "roles": serialize_roles(organization=organization, facility=facility),
            "users": serialize_users_summary(organization=organization),
        },
        "tibabot": _build_tibabot_config(facility),
    }
    return payload


def serialize_organization(organization) -> dict[str, Any]:
    """Serialize an organization for local hub seeding."""
    plan = organization.subscription_plan
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "contact_email": organization.contact_email,
        "contact_phone": organization.contact_phone,
        "subscription_tier": organization.subscription_tier,
        "subscription_status": organization.subscription_status,
        "subscription_plan": {
            "code": plan.code,
            "name": plan.name,
            "features": plan.features,
            "max_facilities": plan.max_facilities,
            "max_users": plan.max_users,
            "max_patients": plan.max_patients,
            "monthly_ai_tokens": plan.monthly_ai_tokens,
        }
        if plan
        else None,
    }


def serialize_facility(facility) -> dict[str, Any]:
    """Serialize a facility for local hub seeding."""
    return {
        "id": facility.id,
        "name": facility.name,
        "mfl_code": facility.mfl_code,
        "level": facility.level,
        "ownership": facility.ownership,
        "county_id": facility.county_id,
        "county_name": facility.county.name if facility.county_id else "",
        "sub_county_id": facility.sub_county_id,
        "sub_county_name": facility.sub_county.name if facility.sub_county_id else "",
        "modules": facility.modules,
    }


def serialize_departments(*, organization, facility) -> list[dict[str, Any]]:
    """Serialize bootstrap departments scoped to this organization/facility."""
    from hmis.apps.core.models import Department

    queryset = Department.objects.filter(organization=organization)
    if facility:
        queryset = queryset.filter(facility__in=[facility, None])

    return [
        {
            "id": department.pk,
            "code": department.code,
            "name": department.name,
            "department_type": department.department_type,
            "description": department.description,
            "facility_id": getattr(department, "facility_id", None),
            "organization_id": getattr(department, "organization_id", None),
            "is_active": department.is_active,
        }
        for department in queryset.order_by("name")
    ]


def serialize_roles(*, organization, facility) -> list[dict[str, Any]]:
    """Serialize bootstrap roles scoped to this organization/facility."""
    from hmis.apps.core.models import Role

    queryset = Role.objects.filter(organization__in=[organization, None])
    if facility:
        queryset = queryset.filter(facility__in=[facility, None])

    return [
        {
            "id": role.pk,
            "code": role.code,
            "name": role.name,
            "category": role.category,
            "scope": role.scope,
            "organization_id": getattr(role, "organization_id", None),
            "facility_id": getattr(role, "facility_id", None),
            "permissions_matrix": role.permissions_matrix,
            "hierarchy_level": role.hierarchy_level,
            "requires_license": role.requires_license,
            "license_body": role.license_body,
            "is_active": role.is_active,
        }
        for role in queryset.order_by("hierarchy_level", "name")
    ]


def serialize_users_summary(*, organization) -> list[dict[str, Any]]:
    """Serialize a lightweight user manifest for the activating organization.

    Returns usernames, PKs, superuser flag, and primary role code -- NO
    password hashes.  The hub installer uses this to:
    1. Warn about username collisions before ``createsuperuser``.
    2. Let the operator skip local superuser creation when cloud admins exist.
    3. Pre-create placeholder User rows so the sync materializer can
       ``update_or_create`` by PK without colliding with hub-local users.
    """
    # Staff profiles link users to the organization
    from hmis.apps.core.models import StaffProfile

    staff_qs = StaffProfile.objects.filter(organization=organization).select_related(
        "user", "primary_role"
    )

    users = []
    for sp in staff_qs.order_by("user__username"):
        u = sp.user
        users.append(
            {
                "id": u.pk,
                "username": u.username,
                "email": u.email or "",
                "is_superuser": u.is_superuser,
                "is_active": u.is_active,
                "role_code": sp.primary_role.code if sp.primary_role else "",
                "role_name": sp.primary_role.name if sp.primary_role else "",
            }
        )
    return users


def seed_cloud_users(users_data: list[dict[str, Any]], *, organization, facility) -> dict[str, int]:
    """Create placeholder User + StaffProfile rows from the cloud user manifest.

    Each user is created with ``set_unusable_password()`` and ``is_active=False``
    so the account cannot be used for local login until the real credentials
    are synced down from the cloud.  The primary purpose is to **reserve the
    cloud PK** in the local ``auth_user`` table so that:

    1. Hub-created users (e.g. via ``createsuperuser``) do not collide on PK
       with cloud users when the sync materializer later does
       ``update_or_create(pk=...)`` .
    2. The ``createsuperuser`` command can detect username conflicts and warn
       the operator.
    """
    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import Department, Role, StaffProfile

    User = get_user_model()
    counts = {"created": 0, "skipped": 0}

    # Resolve fallback role/department for placeholder profiles (both NOT NULL)
    fallback_role = Role.objects.filter(is_active=True).order_by("hierarchy_level").first()
    fallback_dept = Department.objects.filter(is_active=True).first()

    for u_data in users_data:
        cloud_pk = u_data.get("id")
        username = u_data.get("username", "")
        if not cloud_pk or not username:
            continue

        # Skip if the PK or username already exists locally
        if (
            User.objects.filter(pk=cloud_pk).exists()
            or User.objects.filter(username=username).exists()
        ):
            counts["skipped"] += 1
            continue

        user = User(
            pk=cloud_pk,
            username=username,
            email=u_data.get("email", ""),
            is_superuser=u_data.get("is_superuser", False),
            is_staff=u_data.get("is_superuser", False),
            is_active=False,  # Cannot login until real sync
        )
        user.set_unusable_password()
        user.save()

        # Create a minimal StaffProfile so role info is preserved
        role_code = u_data.get("role_code", "")
        role = Role.objects.filter(code=role_code, is_active=True).first() if role_code else None
        if not role:
            role = fallback_role

        if role and fallback_dept and not StaffProfile.objects.filter(user=user).exists():
            StaffProfile.objects.create(
                user=user,
                employee_id=f"CLOUD-{cloud_pk}",
                organization=organization,
                primary_facility=facility,
                primary_role=role,
                primary_department=fallback_dept,
                date_joined=date.today(),
            )

        counts["created"] += 1

    return counts


def seed_bootstrap_data(bootstrap: dict[str, Any], *, organization, facility) -> dict[str, int]:
    """Seed departments and roles from bootstrap payload data."""
    from hmis.apps.core.models import Department, Role

    counts = {"departments": 0, "roles": 0}

    for dept_data in bootstrap.get("departments") or []:
        _, created = Department.objects.update_or_create(
            code=dept_data["code"],
            organization=organization,
            defaults={
                "name": dept_data["name"],
                "department_type": dept_data.get("department_type", ""),
                "description": dept_data.get("description", ""),
                "facility": facility if dept_data.get("facility_id") else None,
                "is_active": dept_data.get("is_active", True),
            },
        )
        if created:
            counts["departments"] += 1

    for role_data in bootstrap.get("roles") or []:
        # Role.code has a global unique constraint, so we must look up by code
        # alone. The hub may already have system-default roles (organization=None)
        # seeded by load_default_roles during initialize_hub. The bootstrap
        # payload also includes those system roles (organization_id=None) plus
        # any org-specific roles. We preserve the existing organization for
        # system roles and attach org-specific roles to the activating org.
        is_org_scoped_role = bool(role_data.get("organization_id"))
        defaults = {
            "name": role_data["name"],
            "category": role_data.get("category", ""),
            "scope": role_data.get("scope", "FACILITY"),
            "facility": facility if role_data.get("facility_id") else None,
            "permissions_matrix": role_data.get("permissions_matrix", {}),
            "hierarchy_level": role_data.get("hierarchy_level", 50),
            "requires_license": role_data.get("requires_license", False),
            "license_body": role_data.get("license_body", ""),
            "is_active": role_data.get("is_active", True),
        }
        if is_org_scoped_role:
            defaults["organization"] = organization

        _, created = Role.objects.update_or_create(
            code=role_data["code"],
            defaults=defaults,
        )
        if created:
            counts["roles"] += 1

    return counts


def load_activation_response(response_file: str) -> dict[str, Any]:
    """Load an activation response JSON file."""
    path = Path(response_file)
    if not path.exists():
        raise CommandError(f"Activation response file not found: {response_file}")

    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise CommandError(f"Invalid activation response JSON: {exc}") from exc


def seed_from_activation_payload(payload: dict[str, Any]) -> tuple[Any, Any]:
    """Create/update local Organization and Facility records from activation data."""
    from hmis.apps.core.models import County, Facility, Organization, SubCounty, SubscriptionPlan

    org_data = payload.get("organization") or {}
    facility_data = payload.get("facility") or {}
    if not org_data:
        raise CommandError("Activation payload is missing organization data.")
    if not facility_data:
        raise CommandError("Activation payload is missing facility data.")

    subscription_plan_data = org_data.get("subscription_plan") or {}
    subscription_features = subscription_plan_data.get("features") or payload.get("features") or {}
    subscription_tier = (
        subscription_plan_data.get("code")
        or org_data.get("subscription_tier")
        or payload.get("tier")
        or "FREE"
    )
    plan = None
    if subscription_tier:
        plan_defaults = {
            "name": subscription_plan_data.get("name") or f"{subscription_tier.title()} Plan",
            "features": subscription_features,
            "max_facilities": subscription_plan_data.get("max_facilities")
            if "max_facilities" in subscription_plan_data
            else payload.get("max_facilities"),
            "max_users": subscription_plan_data.get("max_users")
            if "max_users" in subscription_plan_data
            else payload.get("max_staff"),
            "max_patients": subscription_plan_data.get("max_patients")
            if "max_patients" in subscription_plan_data
            else payload.get("max_patients"),
            "monthly_ai_tokens": subscription_plan_data.get("monthly_ai_tokens"),
            "is_active": True,
        }
        if plan_defaults["monthly_ai_tokens"] is None and subscription_features.get("ai_assistant"):
            plan_defaults["monthly_ai_tokens"] = None
        plan, _ = SubscriptionPlan.objects.update_or_create(
            code=subscription_tier,
            defaults=plan_defaults,
        )

    org, _ = Organization.objects.update_or_create(
        id=org_data["id"],
        defaults={
            "name": org_data["name"],
            "slug": org_data["slug"],
            "is_active": True,
            "is_verified": True,
            "subscription_plan": plan,
            "subscription_status": org_data.get(
                "subscription_status",
                payload.get("subscription_status", Organization.SubscriptionStatus.ACTIVE),
            ),
        },
    )
    org.contact_email = org_data.get("contact_email", "")
    org.contact_phone = org_data.get("contact_phone", "")
    org.save(update_fields=["contact_email_encrypted", "contact_phone_encrypted", "updated_at"])

    # Create county/subcounty if they don't exist (hub may not have location data loaded yet)
    county, _ = County.objects.get_or_create(
        pk=facility_data["county_id"],
        defaults={
            "name": facility_data.get("county_name", "Unknown County"),
            "code": facility_data["county_id"],
        },
    )
    sub_county, _ = SubCounty.objects.get_or_create(
        pk=facility_data["sub_county_id"],
        defaults={
            "name": facility_data.get("sub_county_name", "Unknown Sub-County"),
            "county": county,
        },
    )

    facility_defaults = {
        "organization": org,
        "name": facility_data["name"],
        "mfl_code": facility_data["mfl_code"],
        "level": facility_data["level"],
        "ownership": facility_data["ownership"],
        "county": county,
        "sub_county": sub_county,
        "is_headquarters": True,
        "is_active": True,
    }
    for module_name, enabled in (facility_data.get("modules") or {}).items():
        field_name = f"has_{module_name}"
        if hasattr(Facility, field_name):
            facility_defaults[field_name] = bool(enabled)

    facility, _ = Facility.objects.update_or_create(
        id=facility_data["id"],
        defaults=facility_defaults,
    )
    return org, facility
