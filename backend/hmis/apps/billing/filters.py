"""
Custom FilterSets for the billing app.

These filters normalize case for status fields to support both uppercase
and lowercase values from frontends (e.g., 'PROFORMA' -> 'proforma').
"""

import django_filters
from django_filters import rest_framework as filters

from hmis.apps.billing.models import (
    CreditNote,
    Invoice,
    Payment,
    SHAClaim,
    SHAMember,
)


class CaseInsensitiveCharFilter(filters.CharFilter):
    """
    A CharFilter that normalizes input to lowercase before filtering.

    This allows frontends to send either 'PROFORMA' or 'proforma' and
    have it match the backend's lowercase status values.
    
    Uses CharFilter instead of ChoiceFilter to avoid validation errors
    when frontend sends uppercase values.
    """

    def filter(self, qs, value):
        if value is not None and value != "":
            value = value.lower()
        return super().filter(qs, value)


class InvoiceFilter(django_filters.FilterSet):
    """
    FilterSet for Invoice model with case-insensitive status filtering.

    Supports both uppercase and lowercase status values:
    - ?status=PROFORMA -> matches 'proforma'
    - ?status=proforma -> matches 'proforma'
    """

    status = CaseInsensitiveCharFilter(field_name="status")
    payment_type = CaseInsensitiveCharFilter(field_name="payment_type")

    class Meta:
        model = Invoice
        fields = ["status", "patient", "encounter", "payment_type"]


class PaymentFilter(django_filters.FilterSet):
    """
    FilterSet for Payment model with case-insensitive status filtering.

    Supports both uppercase and lowercase status values:
    - ?status=COMPLETED -> matches 'completed'
    - ?status=completed -> matches 'completed'
    """

    status = CaseInsensitiveCharFilter(field_name="status")
    method = CaseInsensitiveCharFilter(field_name="method")

    class Meta:
        model = Payment
        fields = ["method", "status", "invoice"]


class CreditNoteFilter(django_filters.FilterSet):
    """
    FilterSet for CreditNote model with case-insensitive status filtering.

    Supports both uppercase and lowercase status values:
    - ?status=APPROVED -> matches 'approved'
    - ?status=approved -> matches 'approved'
    """

    status = CaseInsensitiveCharFilter(field_name="status")
    reason = CaseInsensitiveCharFilter(field_name="reason")

    class Meta:
        model = CreditNote
        fields = ["status", "reason", "invoice", "patient"]


class SHAMemberFilter(django_filters.FilterSet):
    """
    FilterSet for SHAMember model with case-insensitive status filtering.

    Supports both uppercase and lowercase status values:
    - ?status=ACTIVE -> matches 'active'
    - ?status=active -> matches 'active'
    """

    status = CaseInsensitiveCharFilter(field_name="status")
    membership_type = CaseInsensitiveCharFilter(field_name="membership_type")

    class Meta:
        model = SHAMember
        fields = ["status", "membership_type", "patient"]


class SHAClaimFilter(django_filters.FilterSet):
    """
    FilterSet for SHAClaim model with case-insensitive status filtering.

    Supports both uppercase and lowercase status values:
    - ?status=SUBMITTED -> matches 'submitted'
    - ?status=submitted -> matches 'submitted'
    """

    status = CaseInsensitiveCharFilter(field_name="status")
    claim_type = CaseInsensitiveCharFilter(field_name="claim_type")

    class Meta:
        model = SHAClaim
        fields = ["status", "claim_type", "patient", "invoice", "encounter"]
