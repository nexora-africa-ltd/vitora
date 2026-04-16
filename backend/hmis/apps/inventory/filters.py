"""Django-filter FilterSets for the Inventory app."""

import django_filters
from django.db import models

from hmis.apps.inventory.models import (
    GoodsReceiptNote,
    PurchaseOrder,
    StockCount,
    StockTransfer,
    StoreLocation,
    Supplier,
    WardStock,
    WardStockTransaction,
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


# ===========================================================================
# Phase 3: Ward / Satellite Stock
# ===========================================================================


class WardStockFilter(django_filters.FilterSet):
    store_location = django_filters.NumberFilter()
    drug = django_filters.NumberFilter()
    ward = django_filters.NumberFilter()
    below_par = django_filters.BooleanFilter(method="filter_below_par")

    class Meta:
        model = WardStock
        fields = ["store_location", "drug", "ward"]

    def filter_below_par(self, queryset, _name, value):
        if value:
            return queryset.filter(quantity_available__lte=models.F("par_level"))
        return queryset


class WardStockTransactionFilter(django_filters.FilterSet):
    ward_stock = django_filters.NumberFilter()
    transaction_type = django_filters.CharFilter()
    performed_by = django_filters.NumberFilter()

    class Meta:
        model = WardStockTransaction
        fields = ["ward_stock", "transaction_type", "performed_by"]


# ===========================================================================
# Phase 4: Stock Reconciliation & Cycle Counting
# ===========================================================================


class StockCountFilter(django_filters.FilterSet):
    status = django_filters.CharFilter()
    count_type = django_filters.CharFilter()
    store_location = django_filters.NumberFilter()

    class Meta:
        model = StockCount
        fields = ["status", "count_type", "store_location"]
