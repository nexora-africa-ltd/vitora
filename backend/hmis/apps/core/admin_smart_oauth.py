# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Secure Django-admin controls for SMART-on-FHIR OAuth applications.

Use Django admin to register an external SMART application, enter its verified
callback/origin URLs, and create its required Vitora tenant binding inline.
"""

from contextlib import suppress
from urllib.parse import urlsplit

from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from oauth2_provider.admin import ApplicationAdmin
from oauth2_provider.models import Application

from hmis.apps.core.models import SMARTOAuthClientTenantBinding


class SMARTOAuthApplicationForm(forms.ModelForm):
    """Validate externally supplied OAuth URLs and explain their security purpose."""

    class Meta:
        model = Application
        fields = (
            "client_id",
            "user",
            "redirect_uris",
            "post_logout_redirect_uris",
            "client_type",
            "authorization_grant_type",
            "client_secret",
            "hash_client_secret",
            "name",
            "skip_authorization",
            "algorithm",
            "allowed_origins",
        )
        help_texts = {
            "name": "Recognizable partner/application name. Never place credentials or PII here.",
            "user": "Vitora service owner accountable for this integration.",
            "redirect_uris": (
                "Exact OAuth callback URLs supplied and verified by the SMART application owner, "
                "space-separated. These are not Vitora API URLs. HTTPS is required except localhost "
                "or loopback development callbacks."
            ),
            "post_logout_redirect_uris": (
                "Exact post-logout destinations supplied by the SMART application owner, "
                "space-separated. Keep this empty unless the application uses OIDC logout."
            ),
            "allowed_origins": (
                "Browser origins allowed for CORS, space-separated (for example https://app.example). "
                "Do not include paths, wildcards, credentials, queries, or fragments."
            ),
            "client_type": "Use Confidential for server-side integrations; Public only for audited native/browser apps.",
            "authorization_grant_type": "SMART applications normally use Authorization code with PKCE.",
            "skip_authorization": "Leave disabled. Enabling it bypasses the user consent screen.",
            "algorithm": "Signing algorithm for tokens. Change only when the partner's documented SMART profile requires it.",
        }

    @staticmethod
    def _validate_uri_list(value: str, field_name: str, *, origin_only: bool = False) -> str:
        """Validate whitespace-separated URL values without inventing partner endpoints."""
        for raw_uri in value.split():
            parsed = urlsplit(raw_uri)
            loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            if parsed.scheme not in {"https", "http"} or not parsed.netloc:
                raise ValidationError(f"{field_name} must contain absolute HTTP(S) URLs.")
            if parsed.scheme != "https" and not loopback:
                raise ValidationError(f"{field_name} must use HTTPS outside localhost or loopback.")
            if parsed.username or parsed.password or "*" in raw_uri or parsed.fragment:
                raise ValidationError(
                    f"{field_name} cannot contain credentials, fragments, or wildcards."
                )
            if origin_only and (parsed.path not in {"", "/"} or parsed.query):
                raise ValidationError(
                    f"{field_name} entries must be origins without paths or queries."
                )
        return value

    def clean_redirect_uris(self):
        """Validate partner-controlled OAuth redirect callbacks."""
        return self._validate_uri_list(self.cleaned_data["redirect_uris"], "Redirect URIs")

    def clean_post_logout_redirect_uris(self):
        """Validate optional partner-controlled OIDC logout destinations."""
        return self._validate_uri_list(
            self.cleaned_data["post_logout_redirect_uris"],
            "Post logout redirect URIs",
        )

    def clean_allowed_origins(self):
        """Validate CORS origins."""
        return self._validate_uri_list(
            self.cleaned_data["allowed_origins"],
            "Allowed origins",
            origin_only=True,
        )


class SMARTOAuthClientTenantBindingInline(admin.StackedInline):
    """Make the required Vitora tenant assignment visible beside the OAuth client."""

    model = SMARTOAuthClientTenantBinding
    extra = 0
    max_num = 1
    raw_id_fields = ("organization", "facility")
    fields = ("organization", "facility", "is_active")
    verbose_name = "Vitora FHIR tenant binding"
    verbose_name_plural = "Vitora FHIR tenant binding"


class SMARTOAuthApplicationAdmin(ApplicationAdmin):
    """Hardened admin for partner-managed SMART-on-FHIR applications."""

    form = SMARTOAuthApplicationForm
    inlines = (SMARTOAuthClientTenantBindingInline,)
    list_display = (*ApplicationAdmin.list_display, "tenant_binding_status")
    readonly_fields = ("client_id", "created", "updated")
    fieldsets = (
        ("Application identity", {"fields": ("name", "user", "client_id")}),
        (
            "OAuth flow",
            {
                "fields": (
                    "client_type",
                    "authorization_grant_type",
                    "client_secret",
                    "hash_client_secret",
                    "algorithm",
                    "skip_authorization",
                )
            },
        ),
        (
            "Partner-supplied URLs",
            {"fields": ("redirect_uris", "post_logout_redirect_uris", "allowed_origins")},
        ),
        ("Audit", {"fields": ("created", "updated"), "classes": ("collapse",)}),
    )

    @admin.display(description="FHIR tenant binding", boolean=True)
    def tenant_binding_status(self, obj):
        """Show whether this client can access the Vitora FHIR API."""
        return bool(getattr(obj, "vitora_tenant_binding", None))

    def get_changeform_initial_data(self, request):
        """Provide secure editable flow defaults; partner URLs are never guessed."""
        initial = super().get_changeform_initial_data(request)
        initial.update(
            {
                "client_type": Application.CLIENT_CONFIDENTIAL,
                "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
                "hash_client_secret": True,
                "skip_authorization": False,
            }
        )
        return initial


with suppress(admin.sites.NotRegistered):
    admin.site.unregister(Application)
admin.site.register(Application, SMARTOAuthApplicationAdmin)
