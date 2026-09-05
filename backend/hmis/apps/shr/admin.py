# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Django admin configuration for DHA Shared Health Record consent visits."""

from django.contrib import admin

from hmis.apps.core.mixins import TenantScopedAdminMixin
from hmis.apps.shr.models import SHRConsentVisit


@admin.register(SHRConsentVisit)
class SHRConsentVisitAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    """Show SHR lifecycle metadata without displaying bearer credentials."""

    list_display = (
        "id",
        "patient",
        "visit_type",
        "request_kind",
        "status",
        "facility",
        "created_at",
    )
    list_filter = ("status", "visit_type", "request_kind", "facility")
    search_fields = (
        "consent_id",
        "visit_id",
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
    )
    raw_id_fields = ("patient", "encounter", "created_by", "facility", "organization")
    readonly_fields = (
        "consent_token_encrypted",
        "created_at",
        "updated_at",
        "approved_at",
        "closed_at",
    )
