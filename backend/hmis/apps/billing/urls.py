"""
URL configuration for billing app.
"""

from django.urls import path, include
from rest_framework import routers

from hmis.apps.billing.views import (
    ServiceCategoryViewSet,
    ServiceViewSet,
    InvoiceViewSet,
    PaymentViewSet,
    CreditNoteViewSet,
    MpesaViewSet,
)

router = routers.DefaultRouter()
router.register(r'service-categories', ServiceCategoryViewSet, basename='servicecategory')
router.register(r'services', ServiceViewSet, basename='service')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'credit-notes', CreditNoteViewSet, basename='creditnote')
router.register(r'mpesa', MpesaViewSet, basename='mpesa')

app_name = 'billing'

urlpatterns = [
    path('', include(router.urls)),
    # Custom nested routes for invoice items
    path(
        'invoices/<int:pk>/items/<int:item_id>/',
        InvoiceViewSet.as_view({'delete': 'remove_item'}),
        name='invoice-item-delete'
    ),
]
