"""Django-filter FilterSets for the Inventory app."""

import django_filters
from django.db import models

from hmis.apps.inventory.models import (
    GoodsReceiptNote,
    PurchaseOrder,
    StockTransfer,
    StoreLocation,
    Supplier,
)


class SupplierFilter(django_filters.FilterSet):
    is_active = django_filters.BooleanFilter()
    supplier_type = django_filters.CharFilter()
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Supplier
        fields = ["is_active", "supplier_type"]

    def filter_search(self, queryset, _name, value):
        return queryset.filter(
            models.Q(name__icontains=value)
            | models.Q(code__icontains=value)
            | models.Q(contact_person__icontains=value)
        )


class PurchaseOrderFilter(django_filters.FilterSet):
    status = django_filters.CharFilter()
    supplier = django_filters.NumberFilter()
    order_date_from = django_filters.DateFilter(field_name="order_date", lookup_expr="gte")
    order_date_to = django_filters.DateFilter(field_name="order_date", lookup_expr="lte")

    class Meta:
        model = PurchaseOrder
        fields = ["status", "supplier"]


class GoodsReceiptNoteFilter(django_filters.FilterSet):
    status = django_filters.CharFilter()
    supplier = django_filters.NumberFilter()
    purchase_order = django_filters.NumberFilter()
    received_date_from = django_filters.DateFilter(field_name="received_date", lookup_expr="gte")
    received_date_to = django_filters.DateFilter(field_name="received_date", lookup_expr="lte")

    class Meta:
        model = GoodsReceiptNote
        fields = ["status", "supplier", "purchase_order"]


# ===========================================================================
# Phase 2: Multi-Store Stock Transfers
# ===========================================================================


class StoreLocationFilter(django_filters.FilterSet):
    is_active = django_filters.BooleanFilter()
    location_type = django_filters.CharFilter()
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = StoreLocation
        fields = ["is_active", "location_type"]

    def filter_search(self, queryset, _name, value):
        return queryset.filter(models.Q(name__icontains=value) | models.Q(code__icontains=value))


class StockTransferFilter(django_filters.FilterSet):
    status = django_filters.CharFilter()
    source_facility = django_filters.NumberFilter()
    destination_facility = django_filters.NumberFilter()
    request_date_from = django_filters.DateFilter(field_name="request_date", lookup_expr="gte")
    request_date_to = django_filters.DateFilter(field_name="request_date", lookup_expr="lte")

    class Meta:
        model = StockTransfer
        fields = ["status", "source_facility", "destination_facility"]
