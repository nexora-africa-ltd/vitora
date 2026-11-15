# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR tenant-resolution and query-scoping helpers.

Use these helpers in FHIR views to derive the local Vitora tenant from the
authenticated principal, never from an inbound FHIR Organization reference.
"""

from __future__ import annotations

from django.core.exceptions import FieldDoesNotExist
from rest_framework.exceptions import PermissionDenied

from hmis.apps.core.mixins import resolve_request_tenant


def resolve_fhir_tenant(request) -> tuple[object | None, object | None]:
    """Return the caller's tenant, requiring an explicit binding for SMART clients."""
    access_token = getattr(request, "access_token", None)
    application_id = getattr(access_token, "application_id", None) if access_token else None
    if application_id:
        from hmis.apps.core.models import SMARTOAuthClientTenantBinding

        binding = (
            SMARTOAuthClientTenantBinding.objects.select_related("organization", "facility")
            .filter(
                application_id=application_id,
                is_active=True,
            )
            .first()
        )
        if not binding:
            return None, None
        request.organization = binding.organization
        request.facility = binding.facility
        return binding.organization, binding.facility

    resolve_request_tenant(request)
    return getattr(request, "organization", None), getattr(request, "facility", None)


def _has_field(model, field_name: str) -> bool:
    """Return whether a queryset model has a concrete field."""
    try:
        model._meta.get_field(field_name)
    except FieldDoesNotExist:
        return False
    return True


def scope_fhir_queryset(request, queryset, *, organization_lookup: str = "organization"):
    """
    Limit a queryset to the authenticated caller's Vitora organization.

    ``organization_lookup`` supports resources that inherit tenancy through a
    parent, such as ``encounter__organization``. FHIR references remain opaque
    interoperability identifiers and never establish this scope.
    """
    organization, _ = resolve_fhir_tenant(request)
    if not organization:
        return queryset.none()

    root_field = organization_lookup.split("__", 1)[0]
    if not _has_field(queryset.model, root_field):
        return queryset.none()
    return queryset.filter(**{organization_lookup: organization})


def fhir_patient_create_tenant_kwargs(request) -> dict[str, object]:
    """Return tenant fields for inbound Patient creation, failing closed without context."""
    organization, facility = resolve_fhir_tenant(request)
    if not organization:
        return {}

    tenant_kwargs: dict[str, object] = {"organization": organization}
    if facility:
        tenant_kwargs["registered_at_facility"] = facility
    return tenant_kwargs


def fhir_facility_create_tenant_kwargs(request) -> dict[str, object]:
    """Return required tenant fields for inbound facility-scoped clinical records."""
    organization, facility = resolve_fhir_tenant(request)
    if not organization or not facility:
        raise PermissionDenied("FHIR clinical writes require a facility-bound tenant context.")
    return {"organization": organization, "facility": facility}
