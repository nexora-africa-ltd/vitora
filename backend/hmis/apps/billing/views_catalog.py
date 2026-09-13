# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002
"""Billing views catalog for Vitora HMIS.

What this file is for:
- Implement views catalog logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.billing.serializers import (
    BillingCatalogItemSerializer,
    ServiceCategorySerializer,
    ServiceSerializer,
)
from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


class ServiceCategoryViewSet(AuditedMutationMixin, viewsets.ModelViewSet):
    """
    ViewSet for ServiceCategory model.

    Provides CRUD operations for service categories.
    """

    queryset = ServiceCategory.objects.all()
    audit_resource_type = "ServiceCategory"
    audit_action_prefix = "billing.service_category"
    audit_source = "billing_api"
    serializer_class = ServiceCategorySerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["display_order", "name", "created_at"]
    ordering = ["display_order"]


class ServiceViewSet(AuditedMutationMixin, viewsets.ModelViewSet):
    """
    ViewSet for Service model.

    Provides CRUD operations for billable services with filtering.
    """

    queryset = Service.objects.select_related("category", "created_by").all()
    audit_resource_type = "Service"
    audit_action_prefix = "billing.service"
    audit_source = "billing_api"
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "is_active", "is_taxable", "sha_code"]
    search_fields = ["name", "code", "description", "sha_code"]
    ordering_fields = ["name", "unit_price", "created_at"]
    ordering = ["name"]

    def perform_destroy(self, instance):
        """Soft delete - mark service as unavailable instead of deleting."""
        instance.is_active = False
        instance.save()


class CatalogItemViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """Read-only aggregate catalog for billable items across domains."""

    queryset = Service.objects.none()
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "search",
                OpenApiTypes.STR,
                location="query",
                description="Search by code or name across all billable catalogs.",
            ),
            OpenApiParameter(
                "kind",
                OpenApiTypes.STR,
                location="query",
                description=(
                    "Optional comma-separated kinds: service, procedure_catalog, "
                    "lab_test_catalog, imaging_procedure"
                ),
            ),
            OpenApiParameter(
                "is_active",
                OpenApiTypes.STR,
                location="query",
                description=("Filter rows by active status: true|false|all (defaults to true)."),
            ),
            OpenApiParameter(
                "invoice_id",
                OpenApiTypes.INT,
                location="query",
                description="Optional invoice id; when provided, catalog is scoped to that invoice facility.",
            ),
        ],
        responses=inline_serializer(
            name="PaginatedBillingCatalogItems",
            fields={
                "count": serializers.IntegerField(),
                "next": serializers.CharField(allow_null=True),
                "previous": serializers.CharField(allow_null=True),
                "results": BillingCatalogItemSerializer(many=True),
            },
        ),
    )
    def list(self, request, *args, **kwargs):
        from hmis.apps.imaging.models import ImagingProcedure
        from hmis.apps.laboratory.models import TestCatalog
        from hmis.apps.procedures.models import ProcedureCatalog

        search = str(request.query_params.get("search") or "").strip().lower()
        raw_kinds = str(request.query_params.get("kind") or "").strip().lower()
        requested_kinds = {token.strip() for token in raw_kinds.split(",") if token.strip()}
        allowed_kinds = {
            "service",
            "procedure_catalog",
            "lab_test_catalog",
            "imaging_procedure",
        }
        if requested_kinds:
            requested_kinds = requested_kinds.intersection(allowed_kinds)
        else:
            requested_kinds = allowed_kinds

        is_active_raw = request.query_params.get("is_active")
        active_filter: bool | None = True
        if is_active_raw is not None:
            normalized_active = str(is_active_raw).strip().lower()
            if normalized_active == "all":
                active_filter = None
            else:
                active_filter = normalized_active in {"1", "true", "yes"}

        facility = getattr(request, "facility", None)
        invoice_id_raw = request.query_params.get("invoice_id")
        if invoice_id_raw not in (None, ""):
            try:
                invoice_id = int(invoice_id_raw)
            except (TypeError, ValueError):
                return Response({"invoice_id": "invoice_id must be an integer."}, status=400)

            invoice = Invoice.objects.filter(pk=invoice_id).first()
            if invoice is None:
                return Response({"invoice_id": "Invoice not found."}, status=404)
            facility = getattr(invoice, "facility", None)
        rows = []

        def _matches(code: str, name: str) -> bool:
            if not search:
                return True
            return search in (code or "").lower() or search in (name or "").lower()

        if "service" in requested_kinds:
            services = Service.objects.all()
            if active_filter is not None:
                services = services.filter(is_active=active_filter)
            for service in services:
                if not _matches(service.code, service.name):
                    continue
                rows.append(
                    {
                        "kind": "service",
                        "id": service.id,
                        "code": service.code,
                        "name": service.name,
                        "description": service.description or "",
                        "unit_price": service.unit_price,
                        "sha_code": service.sha_code or "",
                        "item_type": InvoiceItem.ItemType.SERVICE,
                        "service_id": service.id,
                        "is_active": service.is_active,
                    }
                )

        if "procedure_catalog" in requested_kinds:
            procedures = ProcedureCatalog.objects.select_related("billing_service").filter(
                facility__isnull=False
            )
            if facility is not None:
                procedures = procedures.filter(facility=facility)
            if active_filter is not None:
                procedures = procedures.filter(is_active=active_filter)
            for procedure in procedures:
                if not _matches(procedure.code, procedure.name):
                    continue
                linked_service = procedure.billing_service if procedure.billing_service_id else None
                unit_price = (
                    getattr(linked_service, "unit_price", None)
                    if linked_service is not None
                    else procedure.base_fee
                )
                if unit_price is None:
                    continue
                rows.append(
                    {
                        "kind": "procedure_catalog",
                        "id": procedure.id,
                        "code": procedure.code,
                        "name": procedure.name,
                        "description": procedure.description or "",
                        "unit_price": unit_price,
                        "sha_code": (
                            (linked_service.sha_code if linked_service else "")
                            or procedure.sha_tariff_code
                            or ""
                        ),
                        "item_type": InvoiceItem.ItemType.SERVICE,
                        "service_id": linked_service.id if linked_service else None,
                        "is_active": procedure.is_active,
                    }
                )

        if "lab_test_catalog" in requested_kinds:
            tests = TestCatalog.objects.filter(facility__isnull=False)
            if facility is not None:
                tests = tests.filter(facility=facility)
            if active_filter is not None:
                tests = tests.filter(is_active=active_filter)
            for test in tests:
                if not _matches(test.code, test.name):
                    continue
                rows.append(
                    {
                        "kind": "lab_test_catalog",
                        "id": test.id,
                        "code": test.code,
                        "name": test.name,
                        "description": "",
                        "unit_price": test.cost,
                        "sha_code": test.loinc_code or "",
                        "item_type": InvoiceItem.ItemType.LAB,
                        "service_id": None,
                        "is_active": test.is_active,
                    }
                )

        if "imaging_procedure" in requested_kinds:
            imaging = ImagingProcedure.objects.filter(facility__isnull=False)
            if facility is not None:
                imaging = imaging.filter(facility=facility)
            if active_filter is not None:
                imaging = imaging.filter(is_active=active_filter)
            for procedure in imaging:
                if not _matches(procedure.code, procedure.name):
                    continue
                rows.append(
                    {
                        "kind": "imaging_procedure",
                        "id": procedure.id,
                        "code": procedure.code,
                        "name": procedure.name,
                        "description": "",
                        "unit_price": procedure.cost,
                        "sha_code": procedure.sha_intervention_code or "",
                        "item_type": InvoiceItem.ItemType.IMAGING,
                        "service_id": None,
                        "is_active": procedure.is_active,
                    }
                )

        rows.sort(key=lambda row: (row["kind"], row["name"].lower(), row["code"].lower()))

        page = self.paginate_queryset(rows)
        if page is not None:
            serializer = BillingCatalogItemSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = BillingCatalogItemSerializer(rows, many=True)
        return Response(serializer.data)
