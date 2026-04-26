"""
Admin configuration for AI models (chat sessions, stored results, facility keys).
"""

import logging

import requests
from django.conf import settings
from django.contrib import admin, messages
from django.utils import timezone

from .models import (
    AICarePlanResult,
    AICDSResult,
    AIDischargeResult,
    AIICURiskResult,
    AIInvestigationSuggestResult,
    AILabInterpretResult,
    AISurgicalChecklistSessionResult,
    AISurgicalPostOpCarePlanResult,
    AISurgicalPreOpAssessResult,
    ChatMessage,
    ChatSession,
    TibaBotFacilityKey,
)

logger = logging.getLogger(__name__)


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ("id", "role", "content", "timestamp")
    ordering = ("timestamp",)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "title", "message_count", "created_at", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("title", "user__username")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("user",)
    inlines = [ChatMessageInline]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "role", "content_preview", "timestamp")
    list_filter = ("role", "timestamp")
    raw_id_fields = ("session",)
    readonly_fields = ("id", "timestamp")

    @admin.display(description="Content")
    def content_preview(self, obj: ChatMessage) -> str:
        return obj.content[:80] + "…" if len(obj.content) > 80 else obj.content


# =============================================================================
# Stored AI result admin
# =============================================================================


class AIResultBaseAdmin(admin.ModelAdmin):
    """Base admin for all stored AI results."""

    list_filter = ("service_mode", "created_at")
    readonly_fields = ("id", "created_at", "request_data", "result_data")
    raw_id_fields = ("created_by",)


@admin.register(AICarePlanResult)
class AICarePlanResultAdmin(AIResultBaseAdmin):
    list_display = ("id", "primary_diagnosis", "service_mode", "created_by", "created_at")
    search_fields = ("primary_diagnosis",)
    raw_id_fields = ("created_by", "encounter", "admission")


@admin.register(AICDSResult)
class AICDSResultAdmin(AIResultBaseAdmin):
    list_display = ("id", "rules_fired", "alert_count", "service_mode", "created_by", "created_at")
    raw_id_fields = ("created_by", "encounter")


@admin.register(AILabInterpretResult)
class AILabInterpretResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "abnormal_count",
        "critical_count",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "lab_result", "encounter")


@admin.register(AIDischargeResult)
class AIDischargeResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "readiness_level",
        "readiness_score",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "admission")


@admin.register(AIICURiskResult)
class AIICURiskResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "prediction_type",
        "risk_level",
        "risk_score",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "admission")


@admin.register(AIInvestigationSuggestResult)
class AIInvestigationSuggestResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "suggestion_count",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "encounter")


@admin.register(AISurgicalPreOpAssessResult)
class AISurgicalPreOpAssessResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "surgery_case",
        "overall_risk_level",
        "facility_capable",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "surgery_case")


@admin.register(AISurgicalChecklistSessionResult)
class AISurgicalChecklistSessionResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "surgery_case",
        "tibabot_session_id",
        "current_phase",
        "percent_complete",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "surgery_case")


@admin.register(AISurgicalPostOpCarePlanResult)
class AISurgicalPostOpCarePlanResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "surgery_case",
        "procedure_key",
        "surgical_apgar_score",
        "risk_level",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "surgery_case")


# =============================================================================
# TibaBot Facility Key admin
# =============================================================================

_TIBABOT_ADMIN_KEY_ATTR = "TIBABOT_ADMIN_KEY"


def _get_admin_key() -> str:
    return getattr(settings, _TIBABOT_ADMIN_KEY_ATTR, "") or ""


def _tibabot_admin_url() -> str:
    base = getattr(settings, "TIBABOT_API_URL", "https://tibabot.vitora.nexora.africa")
    return f"{base.rstrip('/')}/admin/facility-keys"


def _provision_single_key(fk: "TibaBotFacilityKey", admin_key: str) -> dict[str, str]:
    """
    Call TibaBot admin API to provision a key for a single facility.

    Mutates ``fk`` in place (sets api_key, key_hash, tibabot_facility_id, scopes,
    provisioned_at, is_active) but does NOT call ``fk.save()``.

    Returns:
        dict with "api_key" on success.

    Raises:
        requests.RequestException on HTTP failure.
    """
    facility = fk.facility
    org = getattr(facility, "organization", None)
    org_slug = getattr(org, "slug", "vitora") if org else "vitora"
    fac_id = fk.tibabot_facility_id or f"{org_slug}-{facility.mfl_code or facility.pk}"

    payload = {
        "facility_id": fac_id,
        "facility_name": facility.name,
        "org_id": org_slug,
        "facility_level": _parse_level(facility.level),
        "scopes": fk.scopes or ["chat", "triage", "icd10", "clinical", "predict"],
        "jwt_issuer": getattr(settings, "TIBABOT_JWT_ISSUER", "vitora.nexora.africa"),
    }

    resp = requests.post(
        _tibabot_admin_url(),
        json=payload,
        headers={"X-Admin-Key": admin_key, "Content-Type": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    fk.api_key = data["api_key"]
    fk.key_hash = data.get("key_hash", "")
    fk.tibabot_facility_id = data.get("facility_id", fac_id)
    fk.scopes = data.get("scopes", fk.scopes)
    fk.provisioned_at = timezone.now()
    fk.is_active = True
    return data


@admin.register(TibaBotFacilityKey)
class TibaBotFacilityKeyAdmin(admin.ModelAdmin):
    list_display = (
        "facility",
        "org_display",
        "level_display",
        "masked_key_display",
        "tibabot_facility_id",
        "is_active",
        "scopes_display",
        "provisioned_at",
        "last_rotated_at",
    )
    list_filter = (
        "is_active",
        "facility__organization",
        "facility__level",
        "provisioned_at",
    )
    list_select_related = ("facility__organization",)
    search_fields = ("facility__name", "facility__mfl_code", "tibabot_facility_id")
    autocomplete_fields = ("facility",)
    readonly_fields = (
        "key_hash",
        "provisioned_at",
        "last_rotated_at",
        "masked_key_display",
        "org_display",
        "level_display",
    )
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "facility",
                    "org_display",
                    "level_display",
                    "api_key",
                    "masked_key_display",
                    "key_hash",
                    "tibabot_facility_id",
                ),
            },
        ),
        (
            "Scopes & Status",
            {
                "fields": ("scopes", "is_active"),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("provisioned_at", "last_rotated_at"),
                "classes": ("collapse",),
            },
        ),
        (
            "Notes",
            {
                "fields": ("notes",),
                "classes": ("collapse",),
            },
        ),
    )
    actions = ["provision_key", "rotate_key", "revoke_key"]

    def get_readonly_fields(self, request, obj=None):
        """On edit, lock the facility and auto-populated fields."""
        base = list(self.readonly_fields)
        if obj:  # Editing existing record
            base.append("facility")
        return base

    def get_fieldsets(self, request, obj=None):
        """
        On add: show only facility + scopes (everything else is auto-filled).
        On edit: show the full detail layout.
        """
        if obj is None:
            return (
                (
                    None,
                    {
                        "fields": ("facility",),
                        "description": (
                            "Select a facility and save. The TibaBot API key will be "
                            "provisioned automatically. You can optionally set scopes "
                            "before saving."
                        ),
                    },
                ),
                (
                    "Scopes",
                    {
                        "fields": ("scopes",),
                        "classes": ("collapse",),
                        "description": (
                            'Default: ["chat", "triage", "icd10", "clinical", "predict"]. '
                            "Leave empty to use defaults."
                        ),
                    },
                ),
            )
        return super().get_fieldsets(request, obj)

    def save_model(self, request, obj, form, change):
        """
        On creation, auto-provision the key from TibaBot admin API.

        If TIBABOT_ADMIN_KEY is not set or provisioning fails, the record is
        still saved (with an empty api_key) so the admin can retry via the
        bulk 'Provision' action.
        """
        if not change and not obj.api_key:
            admin_key = _get_admin_key()
            if not admin_key:
                self.message_user(
                    request,
                    "TIBABOT_ADMIN_KEY is not configured — saved without provisioning. "
                    "Set the key in settings, then use the 'Provision' action.",
                    messages.WARNING,
                )
            else:
                try:
                    _provision_single_key(obj, admin_key)
                    self.message_user(
                        request,
                        f"Key provisioned for {obj.facility.name}: {obj.api_key}  "
                        "— copy it now, it cannot be retrieved later.",
                        messages.SUCCESS,
                    )
                except requests.RequestException as e:
                    body = ""
                    if hasattr(e, "response") and e.response is not None:
                        body = e.response.text[:200]
                    logger.warning(
                        "Auto-provision failed for %s: %s %s",
                        obj.facility.name,
                        e,
                        body,
                    )
                    self.message_user(
                        request,
                        f"Auto-provision failed: {e}. Record saved — retry with the 'Provision' action.",
                        messages.WARNING,
                    )
        super().save_model(request, obj, form, change)

    @admin.display(description="API Key")
    def masked_key_display(self, obj: TibaBotFacilityKey) -> str:
        return obj.masked_key

    @admin.display(description="Scopes")
    def scopes_display(self, obj: TibaBotFacilityKey) -> str:
        scopes = obj.scopes or []
        return ", ".join(scopes) if scopes else "—"

    @admin.display(description="Organization", ordering="facility__organization__name")
    def org_display(self, obj: TibaBotFacilityKey) -> str:
        org = getattr(obj.facility, "organization", None)
        return org.name if org else "—"

    @admin.display(description="Level", ordering="facility__level")
    def level_display(self, obj: TibaBotFacilityKey) -> str:
        facility = obj.facility
        return f"L{facility.level}" if facility.level else "—"

    # -----------------------------------------------------------------
    # Admin actions
    # -----------------------------------------------------------------

    @admin.action(description="Provision TibaBot API key for selected facilities")
    def provision_key(self, request, queryset):
        """
        Call TibaBot admin API to provision a new facility key.

        Requires TIBABOT_ADMIN_KEY to be set in Django settings.
        Only processes records that don't already have an api_key.
        """
        admin_key = _get_admin_key()
        if not admin_key:
            self.message_user(
                request,
                "TIBABOT_ADMIN_KEY is not configured in Django settings. Set it to provision keys.",
                messages.ERROR,
            )
            return

        provisioned = 0

        for fk in queryset.filter(api_key=""):
            try:
                _provision_single_key(fk, admin_key)
                fk.save()
                provisioned += 1
            except requests.RequestException as e:
                body = ""
                if hasattr(e, "response") and e.response is not None:
                    body = e.response.text[:200]
                logger.warning(
                    "Failed to provision TibaBot key for %s: %s %s",
                    fk.facility.name,
                    e,
                    body,
                )
                self.message_user(
                    request,
                    f"Failed to provision key for {fk.facility.name}: {e}",
                    messages.WARNING,
                )

        if provisioned:
            self.message_user(
                request,
                f"Successfully provisioned {provisioned} key(s). "
                "Keys are shown in the detail view — copy them now, they cannot be retrieved later.",
                messages.SUCCESS,
            )

    @admin.action(description="Rotate TibaBot API key for selected facilities")
    def rotate_key(self, request, queryset):
        """Call TibaBot admin API to rotate an existing facility key."""
        admin_key = _get_admin_key()
        if not admin_key:
            self.message_user(request, "TIBABOT_ADMIN_KEY not configured.", messages.ERROR)
            return

        base_url = getattr(settings, "TIBABOT_API_URL", "https://tibabot.vitora.nexora.africa")
        url = f"{base_url.rstrip('/')}/admin/facility-keys/rotate"
        rotated = 0

        for fk in queryset.filter(is_active=True).exclude(tibabot_facility_id=""):
            try:
                resp = requests.post(
                    url,
                    json={
                        "facility_id": fk.tibabot_facility_id,
                        "reason": f"Rotated via Django admin by {request.user.username}",
                    },
                    headers={
                        "X-Admin-Key": admin_key,
                        "Content-Type": "application/json",
                    },
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()

                fk.api_key = data["api_key"]
                fk.key_hash = data.get("key_hash", fk.key_hash)
                fk.last_rotated_at = timezone.now()
                fk.notes = f"Rotated by {request.user.username} on {timezone.now().isoformat()}"
                fk.save()
                rotated += 1

            except requests.RequestException as e:
                self.message_user(
                    request,
                    f"Failed to rotate key for {fk.facility.name}: {e}",
                    messages.WARNING,
                )

        if rotated:
            self.message_user(
                request,
                f"Rotated {rotated} key(s). New keys shown in detail view.",
                messages.SUCCESS,
            )

    @admin.action(description="Revoke TibaBot API key for selected facilities")
    def revoke_key(self, request, queryset):
        """Call TibaBot admin API to revoke a facility key, then deactivate locally."""
        admin_key = _get_admin_key()
        if not admin_key:
            self.message_user(request, "TIBABOT_ADMIN_KEY not configured.", messages.ERROR)
            return

        base_url = getattr(settings, "TIBABOT_API_URL", "https://tibabot.vitora.nexora.africa")
        revoked = 0

        for fk in queryset.filter(is_active=True).exclude(tibabot_facility_id=""):
            url = f"{base_url.rstrip('/')}/admin/facility-keys/{fk.tibabot_facility_id}"
            try:
                resp = requests.delete(
                    url,
                    headers={"X-Admin-Key": admin_key},
                    timeout=15,
                )
                resp.raise_for_status()
            except requests.RequestException as e:
                self.message_user(
                    request,
                    f"TibaBot revocation failed for {fk.facility.name}: {e} — marking inactive locally.",
                    messages.WARNING,
                )

            fk.is_active = False
            fk.api_key = ""
            fk.notes = f"Revoked by {request.user.username} on {timezone.now().isoformat()}"
            fk.save()
            revoked += 1

        if revoked:
            self.message_user(request, f"Revoked {revoked} key(s).", messages.SUCCESS)


def _parse_level(level: str | int | None) -> int | None:
    """Parse facility level to int for TibaBot API payload."""
    if level is None:
        return None
    if isinstance(level, int):
        return level if 1 <= level <= 6 else None
    raw = str(level).upper().lstrip("L").strip()
    try:
        val = int(raw)
        return val if 1 <= val <= 6 else None
    except (ValueError, TypeError):
        return None
