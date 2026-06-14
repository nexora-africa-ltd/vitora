# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Bootstrap helpers for activation-driven hub provisioning."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import CommandError


def build_activation_bootstrap_payload(
    installation, token: str, decoded: dict[str, Any]
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
        "sync_url": getattr(settings, "SYNC_SERVER_URL", "https://api.vitora.digital/api/sync"),
        "encryption_key": getattr(settings, "ENCRYPTION_KEY", ""),
        "organization": serialize_organization(organization),
        "facility": serialize_facility(facility) if facility else None,
        "bootstrap": {
            "departments": serialize_departments(organization=organization, facility=facility),
            "roles": serialize_roles(organization=organization, facility=facility),
        },
    }
    return payload


def serialize_organization(organization) -> dict[str, Any]:
    """Serialize an organization for local hub seeding."""
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "contact_email": organization.contact_email,
        "contact_phone": organization.contact_phone,
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
            "id": department.id,
            "code": department.code,
            "name": department.name,
            "department_type": department.department_type,
            "description": department.description,
            "facility_id": department.facility_id,
            "organization_id": department.organization_id,
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
            "id": role.id,
            "code": role.code,
            "name": role.name,
            "category": role.category,
            "scope": role.scope,
            "organization_id": role.organization_id,
            "facility_id": role.facility_id,
            "permissions_matrix": role.permissions_matrix,
            "hierarchy_level": role.hierarchy_level,
            "requires_license": role.requires_license,
            "license_body": role.license_body,
            "is_active": role.is_active,
        }
        for role in queryset.order_by("hierarchy_level", "name")
    ]


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
    from hmis.apps.core.models import County, Facility, Organization, SubCounty

    org_data = payload.get("organization") or {}
    facility_data = payload.get("facility") or {}
    if not org_data:
        raise CommandError("Activation payload is missing organization data.")
    if not facility_data:
        raise CommandError("Activation payload is missing facility data.")

    org, _ = Organization.objects.update_or_create(
        id=org_data["id"],
        defaults={
            "name": org_data["name"],
            "slug": org_data["slug"],
            "is_active": True,
            "is_verified": True,
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
