"""
URL configuration for billing app.
"""

from django.urls import include, path
from rest_framework import routers

from hmis.apps.billing.sha_views import (
    ClientRegistryView,
    DirectEligibilityCheckView,
    EligibilityCheckView,
    FacilitySearchView,
    PractitionerSearchView,
    SHAClaimViewSet,
    SHAMemberViewSet,
    SHATariffViewSet,
    TerminologySearchView,
)
from hmis.apps.billing.views import (
    CreditNoteViewSet,
    InvoiceViewSet,
    MpesaViewSet,
    PaymentViewSet,
    ReportViewSet,
    ServiceCategoryViewSet,
    ServiceViewSet,
)

router = routers.DefaultRouter()
router.register(r'service-categories', ServiceCategoryViewSet, basename='servicecategory')
router.register(r'services', ServiceViewSet, basename='service')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'credit-notes', CreditNoteViewSet, basename='creditnote')
router.register(r'mpesa', MpesaViewSet, basename='mpesa')
router.register(r'reports', ReportViewSet, basename='reports')

# SHA-related endpoints
router.register(r'sha-members', SHAMemberViewSet, basename='sha-member')
router.register(r'sha-tariffs', SHATariffViewSet, basename='sha-tariff')
router.register(r'claims', SHAClaimViewSet, basename='claim')

app_name = 'billing'

urlpatterns = [
    path('', include(router.urls)),
    # Custom nested routes for invoice items
    path(
        'invoices/<int:pk>/items/<int:item_id>/',
        InvoiceViewSet.as_view({'delete': 'remove_item'}),
        name='invoice-item-delete'
    ),

    # SHA Terminology endpoints
    path('terminology/<str:terminology_type>/', TerminologySearchView.as_view(), name='terminology-search'),

    # SHA Client Registry endpoints
    path('client-registry/fetch/', ClientRegistryView.as_view(), name='client-registry-fetch'),
    path('client-registry/register/', ClientRegistryView.as_view(), name='client-registry-register'),
    path('client-registry/update/', ClientRegistryView.as_view(), name='client-registry-update'),

    # SHA Facility and Practitioner validation
    path('facility/validate/', FacilitySearchView.as_view(), name='facility-validate'),
    path('practitioner/validate/', PractitionerSearchView.as_view(), name='practitioner-validate'),
    # DHA Health Worker Registry search (new rich endpoint)
    path('dha/practitioner-search/', PractitionerSearchView.as_view(), name='dha-practitioner-search'),

    # SHA Eligibility check
    path('eligibility/check/', EligibilityCheckView.as_view(), name='eligibility-check'),
    path('eligibility/direct/', DirectEligibilityCheckView.as_view(), name='eligibility-direct'),
]
