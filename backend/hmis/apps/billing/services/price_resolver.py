"""
Billing catalog price resolver for invoice item creation.

Use:
- Imported by billing serializers to resolve unit price/item metadata from catalog sources.

Supported inputs:
- ResolvePriceRequest fields: facility_id, catalog_kind, catalog_id, quantity,
  price_mode, unit_price_override, invoice_id, encounter_id, user_id.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from hmis.apps.billing.models import InvoiceItem, Service

CatalogKind = Literal[
    "service",
    "procedure_catalog",
    "lab_test_catalog",
    "imaging_procedure",
]
PriceMode = Literal["catalog", "override"]


class CatalogItemNotFound(Exception):
    """Raised when the requested catalog item does not exist in scope."""


class CatalogItemInactive(Exception):
    """Raised when the requested catalog item is inactive."""


class PriceNotConfigured(Exception):
    """Raised when a catalog item does not have a usable billable price."""


@dataclass(frozen=True)
class ResolvePriceRequest:
    facility_id: int | None
    catalog_kind: CatalogKind
    catalog_id: int
    quantity: Decimal
    price_mode: PriceMode = "catalog"
    unit_price_override: Decimal | None = None
    invoice_id: int | None = None
    encounter_id: int | None = None
    user_id: int | None = None


@dataclass(frozen=True)
class ResolvePriceResult:
    item_type: str
    unit_price: Decimal
    quantity: Decimal
    line_total: Decimal
    description: str
    sha_code: str
    service_id: int | None
    source_kind: CatalogKind
    source_id: int
    source_code: str
    source_name: str
    warnings: list[str]


class BillingPriceResolver:
    """Resolve invoice-item pricing from billing and clinical catalogs."""

    def resolve(self, req: ResolvePriceRequest) -> ResolvePriceResult:
        if req.quantity <= 0:
            raise ValueError("quantity must be greater than zero.")

        if req.catalog_kind == "service":
            return self._resolve_service(req)
        if req.catalog_kind == "procedure_catalog":
            return self._resolve_procedure_catalog(req)
        if req.catalog_kind == "lab_test_catalog":
            return self._resolve_lab_test_catalog(req)
        if req.catalog_kind == "imaging_procedure":
            return self._resolve_imaging_procedure(req)
        raise ValueError(f"Unsupported catalog_kind: {req.catalog_kind}")

    def _finalize_price(self, req: ResolvePriceRequest, default_price: Decimal) -> Decimal:
        if req.price_mode == "override":
            if req.unit_price_override is None:
                raise ValueError("unit_price_override is required when price_mode is override.")
            if req.unit_price_override <= 0:
                raise ValueError("unit_price_override must be greater than zero.")
            return req.unit_price_override
        if default_price <= 0:
            raise PriceNotConfigured("Catalog item has no billable price configured.")
        return default_price

    def _resolve_service(self, req: ResolvePriceRequest) -> ResolvePriceResult:
        service = Service.objects.filter(id=req.catalog_id).first()
        if not service:
            raise CatalogItemNotFound("Billing service not found.")
        pending_tariff_override = (
            req.price_mode == "override"
            and req.unit_price_override is not None
            and service.unit_price in (None, "")
        )
        if not service.is_active and not pending_tariff_override:
            raise CatalogItemInactive("Billing service is inactive.")

        default_price = Decimal(str(service.unit_price or 0))
        unit_price = self._finalize_price(req, default_price)
        line_total = (unit_price * req.quantity).quantize(Decimal("0.01"))
        return ResolvePriceResult(
            item_type=InvoiceItem.ItemType.SERVICE,
            unit_price=unit_price,
            quantity=req.quantity,
            line_total=line_total,
            description=service.name,
            sha_code=service.sha_code or "",
            service_id=service.id,
            source_kind="service",
            source_id=service.id,
            source_code=service.code,
            source_name=service.name,
            warnings=[],
        )

    def _resolve_procedure_catalog(self, req: ResolvePriceRequest) -> ResolvePriceResult:
        from hmis.apps.procedures.models import ProcedureCatalog

        queryset = ProcedureCatalog.objects.filter(id=req.catalog_id)
        if req.facility_id is not None:
            queryset = queryset.filter(facility_id=req.facility_id)
        entry = queryset.select_related("billing_service").first()
        if not entry:
            raise CatalogItemNotFound("Procedure catalog item not found.")
        if not entry.is_active:
            raise CatalogItemInactive("Procedure catalog item is inactive.")

        linked_service = entry.billing_service if entry.billing_service_id else None
        default_price = (
            Decimal(str(linked_service.unit_price))
            if linked_service is not None
            else Decimal(str(entry.base_fee or 0))
        )
        unit_price = self._finalize_price(req, default_price)
        line_total = (unit_price * req.quantity).quantize(Decimal("0.01"))

        return ResolvePriceResult(
            item_type=InvoiceItem.ItemType.SERVICE,
            unit_price=unit_price,
            quantity=req.quantity,
            line_total=line_total,
            description=f"Procedure: {entry.name}",
            sha_code=(linked_service.sha_code if linked_service else "")
            or entry.sha_tariff_code
            or "",
            service_id=linked_service.id if linked_service else None,
            source_kind="procedure_catalog",
            source_id=entry.id,
            source_code=entry.code,
            source_name=entry.name,
            warnings=[],
        )

    def _resolve_lab_test_catalog(self, req: ResolvePriceRequest) -> ResolvePriceResult:
        from hmis.apps.laboratory.models import TestCatalog

        queryset = TestCatalog.objects.filter(id=req.catalog_id)
        if req.facility_id is not None:
            queryset = queryset.filter(facility_id=req.facility_id)
        test = queryset.first()
        if not test:
            raise CatalogItemNotFound("Lab test catalog item not found.")
        if not test.is_active:
            raise CatalogItemInactive("Lab test catalog item is inactive.")

        unit_price = self._finalize_price(req, Decimal(str(test.cost or 0)))
        line_total = (unit_price * req.quantity).quantize(Decimal("0.01"))
        return ResolvePriceResult(
            item_type=InvoiceItem.ItemType.LAB,
            unit_price=unit_price,
            quantity=req.quantity,
            line_total=line_total,
            description=test.name,
            sha_code=test.loinc_code or "",
            service_id=None,
            source_kind="lab_test_catalog",
            source_id=test.id,
            source_code=test.code,
            source_name=test.name,
            warnings=[],
        )

    def _resolve_imaging_procedure(self, req: ResolvePriceRequest) -> ResolvePriceResult:
        from hmis.apps.imaging.models import ImagingProcedure

        queryset = ImagingProcedure.objects.filter(id=req.catalog_id)
        if req.facility_id is not None:
            queryset = queryset.filter(facility_id=req.facility_id)
        procedure = queryset.first()
        if not procedure:
            raise CatalogItemNotFound("Imaging procedure catalog item not found.")
        if not procedure.is_active:
            raise CatalogItemInactive("Imaging procedure catalog item is inactive.")

        unit_price = self._finalize_price(req, Decimal(str(procedure.cost or 0)))
        line_total = (unit_price * req.quantity).quantize(Decimal("0.01"))
        return ResolvePriceResult(
            item_type=InvoiceItem.ItemType.IMAGING,
            unit_price=unit_price,
            quantity=req.quantity,
            line_total=line_total,
            description=procedure.name,
            sha_code=procedure.sha_intervention_code or "",
            service_id=None,
            source_kind="imaging_procedure",
            source_id=procedure.id,
            source_code=procedure.code,
            source_name=procedure.name,
            warnings=[],
        )
