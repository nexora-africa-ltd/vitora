"""
Mixins for data integrity and idempotency.

Sprint 1.7: Data Integrity & Idempotency

This module provides mixins for:
1. Idempotent API operations (preventing duplicate resource creation)
2. Transaction-safe operations with row locking
"""

from django.db import models, transaction
from rest_framework import status
from rest_framework.response import Response

from hmis.apps.core.models import IdempotencyKey


class IdempotentCreateMixin:
    """
    Mixin to make create operations idempotent.

    When a client includes an X-Idempotency-Key header, the system:
    1. Checks if the key exists for this user
    2. If yes, returns the cached response (idempotent replay)
    3. If no, processes the request and caches the response

    Usage:
        class MyViewSet(IdempotentCreateMixin, viewsets.ModelViewSet):
            ...

    Client usage:
        POST /api/patients/
        X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
        Content-Type: application/json
        {"first_name": "John", ...}

    On retry with same key:
        Returns the same response as the first request (idempotent)
    """

    IDEMPOTENCY_HEADER = "HTTP_X_IDEMPOTENCY_KEY"

    def create(self, request, *args, **kwargs):
        """
        Create with idempotency support.

        If X-Idempotency-Key header is provided:
        - Checks for existing cached response
        - If found, returns cached response
        - If not, processes request and caches response
        """
        idempotency_key = request.META.get(self.IDEMPOTENCY_HEADER)

        if idempotency_key:
            # Check for existing idempotency record
            existing = IdempotencyKey.get_or_none(key=idempotency_key, user=request.user)

            if existing:
                # Return cached response (idempotent replay)
                return Response(
                    existing.response_data,
                    status=existing.response_status,
                )

        # Process the request with atomic transaction
        with transaction.atomic():
            response = super().create(request, *args, **kwargs)

            # Cache the response for idempotency
            if idempotency_key and response.status_code in (200, 201):
                IdempotencyKey.objects.create(
                    key=idempotency_key,
                    user=request.user,
                    resource_type=self.get_serializer_class().Meta.model.__name__,
                    resource_id=response.data.get("id"),
                    response_status=response.status_code,
                    response_data=response.data,
                )

        return response


class TransactionSafeUpdateMixin:
    """
    Mixin to provide transaction-safe updates with row locking.

    Uses SELECT ... FOR UPDATE to prevent race conditions
    when multiple requests try to update the same resource.

    Usage:
        class MyViewSet(TransactionSafeUpdateMixin, viewsets.ModelViewSet):
            ...
    """

    def update(self, request, *_args, **kwargs):
        """Update with row locking to prevent race conditions."""
        partial = kwargs.pop("partial", False)

        with transaction.atomic():
            # Lock the row to prevent concurrent updates
            instance = self.get_queryset().select_for_update().get(pk=kwargs.get("pk"))

            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            if getattr(instance, "_prefetched_objects_cache", None):
                # If 'prefetch_related' has been applied to a queryset, we need to
                # forcibly invalidate the prefetch cache on the instance.
                instance._prefetched_objects_cache = {}

        return Response(serializer.data)


class ConcurrencyControlMixin:
    """
    Mixin for optimistic concurrency control using version numbers.

    Requires a 'version' field on the model.
    Client must include the current version in update requests.

    Usage:
        class MyModel(models.Model):
            version = models.IntegerField(default=1)

        class MyViewSet(ConcurrencyControlMixin, viewsets.ModelViewSet):
            ...

    Client request:
        PATCH /api/resource/1/
        {"field": "value", "version": 1}

    If version doesn't match current, returns 409 Conflict.
    """

    VERSION_FIELD = "version"

    def update(self, request, *_args, **kwargs):
        """Update with optimistic concurrency control."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # Get version from request
        request_version = request.data.get(self.VERSION_FIELD)

        if request_version is not None:
            current_version = getattr(instance, self.VERSION_FIELD, None)

            if current_version is not None and int(request_version) != current_version:
                return Response(
                    {
                        "error": "Concurrency conflict",
                        "detail": f"Resource has been modified. "
                        f"Expected version {request_version}, current version is {current_version}. "
                        f"Please refresh and try again.",
                        "current_version": current_version,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        # Increment version on successful update
        if hasattr(instance, self.VERSION_FIELD):
            setattr(instance, self.VERSION_FIELD, getattr(instance, self.VERSION_FIELD, 0) + 1)

        self.perform_update(serializer)

        return Response(serializer.data)


# ============================================================================
# Multitenancy Mixins (Organization / Facility scoping)
# ============================================================================


class OrganizationScopedModel(models.Model):
    """
    Abstract base for models scoped to an Organization (tenant).

    Records with this mixin are visible across all facilities within the
    same organization — e.g. Patient, Allergy, shared catalogues.
    """

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_set",
        null=True,
        blank=True,
        help_text="Owning organization (tenant).",
    )

    class Meta:
        abstract = True


class FacilityScopedModel(OrganizationScopedModel):
    """
    Abstract base for models scoped to a specific Facility (branch).

    Records with this mixin are created at and primarily visible to a
    single facility — e.g. Encounter, Triage, Invoice.

    ``organization`` is auto-set from the facility on save.
    """

    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_set",
        null=True,
        blank=True,
        help_text="Facility (branch) where this record was created.",
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        """Auto-set organization from facility before saving."""
        if self.facility and self.facility.organization:
            self.organization = self.facility.organization
        super().save(*args, **kwargs)


class TenantScopedViewMixin:
    """
    ViewSet mixin that scopes querysets and auto-sets tenant FKs on create.

    Set ``tenant_scope`` on the viewset to control the isolation level:

    * ``"organization"`` — filters by ``request.organization`` (org-wide data).
    * ``"facility"`` — filters by ``request.facility`` (single-branch data).

    For ViewSets that override ``create()`` directly (instead of using
    ``perform_create()``), call ``self.get_tenant_save_kwargs()`` and
    unpack the result into ``serializer.save(**tenant_kwargs)``.

    Requirements:
        * ``TenantMiddleware`` must be active.
        * The underlying model must have the corresponding FK fields.
    """

    tenant_scope: str = "facility"  # "organization" or "facility"
    tenant_facility_field: str = "facility"  # FK field name on the model

    def _resolve_tenant_context(self):
        """
        Ensure ``request.facility`` and ``request.organization`` are set.

        The ``TenantMiddleware`` normally sets these during the WSGI
        pipeline.  However, in DRF test clients that use
        ``force_authenticate`` the user is not available until the view
        layer, so the middleware sees ``AnonymousUser``.  This helper
        re-resolves lazily when the attributes are still ``None``.
        """
        request = self.request
        if getattr(request, "facility", None) or getattr(request, "organization", None):
            return  # Already resolved by middleware

        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return

        from hmis.apps.core.models import Facility

        # 1. Try X-Facility-Id header
        facility_id = request.META.get("HTTP_X_FACILITY_ID")
        if facility_id:
            try:
                facility = Facility.objects.select_related("organization").get(
                    pk=int(facility_id), is_active=True
                )
                request.facility = facility
                request.organization = facility.organization
                return
            except (Facility.DoesNotExist, ValueError, TypeError):
                pass

        # 2. Fallback to primary facility
        profile = getattr(user, "staff_profile", None)
        if profile and profile.primary_facility_id:
            try:
                facility = Facility.objects.select_related("organization").get(
                    pk=profile.primary_facility_id, is_active=True
                )
                request.facility = facility
                request.organization = facility.organization
            except Facility.DoesNotExist:
                pass

    def get_queryset(self):
        """Filter queryset by the active tenant scope."""
        self._resolve_tenant_context()
        qs = super().get_queryset()
        request = self.request

        org = getattr(request, "organization", None)
        facility = getattr(request, "facility", None)

        if self.tenant_scope == "facility" and facility:
            qs = qs.filter(**{self.tenant_facility_field: facility})
        elif org:
            qs = qs.filter(organization=org)

        return qs

    def get_tenant_save_kwargs(self) -> dict:
        """
        Return a dict of tenant FK values to unpack into ``serializer.save()``.

        Use this in ViewSets that override ``create()`` directly::

            patient = serializer.save(
                registered_by=request.user,
                **self.get_tenant_save_kwargs(),
            )
        """
        self._resolve_tenant_context()
        request = self.request
        org = getattr(request, "organization", None)
        facility = getattr(request, "facility", None)

        extra: dict = {}
        if org:
            extra["organization"] = org
        if self.tenant_scope == "facility" and facility:
            extra[self.tenant_facility_field] = facility
        return extra

    def perform_create(self, serializer):
        """Auto-set organization and facility from the request context."""
        serializer.save(**self.get_tenant_save_kwargs())
