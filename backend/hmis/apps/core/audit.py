"""
Reusable audit logging helpers for API actions and background workflows.

Use:
- ``log_audited_action(...)`` from views, signals, tasks, or commands.
- ``AuditedMutationMixin`` on DRF ViewSets to auto-log successful writes.

Inputs:
- ``action``: canonical audit action name (required).
- ``resource_type`` / ``resource_id``: target entity information.
- ``request`` (optional): used to infer user, IP, UA, facility, organization.
- ``source`` (optional): tagged into ``details['source']``.
"""

from __future__ import annotations

from typing import Any

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip


def _to_int(value: Any) -> int | None:
    try:
        if value in (None, ""):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def log_audited_action(
    *,
    action: str,
    resource_type: str,
    resource_id: Any = None,
    request=None,
    user=None,
    patient_id: Any = None,
    details: dict[str, Any] | None = None,
    source: str | None = None,
    facility=None,
    organization=None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Write a normalized audit entry with optional request-context defaults."""
    resolved_user = user if user is not None else getattr(request, "user", None)
    resolved_ip = (
        ip_address
        if ip_address is not None
        else (get_client_ip(request) if request is not None else None)
    )
    resolved_ua = (
        user_agent
        if user_agent is not None
        else (request.META.get("HTTP_USER_AGENT", "") if request is not None else "")
    )

    resolved_details: dict[str, Any] = dict(details or {})
    if source:
        resolved_details.setdefault("source", source)

    return AuditLog.log(
        action=action,
        user=resolved_user,
        resource_type=resource_type,
        resource_id=_to_int(resource_id),
        patient_id=_to_int(patient_id),
        ip_address=resolved_ip,
        user_agent=resolved_ua,
        details=resolved_details,
        facility=facility,
        organization=organization,
        request=request,
    )


class AuditedMutationMixin:
    """Auto-log successful write actions on DRF ViewSets."""

    audit_resource_type = "Resource"
    audit_action_prefix = "api"
    audit_source = "api"
    audit_excluded_actions: set[str] = set()
    audit_write_methods = {"POST", "PUT", "PATCH", "DELETE"}

    def _resolve_audit_resource_id(self, _request, response) -> Any:
        data = getattr(response, "data", None)
        if isinstance(data, dict) and "id" in data:
            return data.get("id")
        lookup_kwarg = getattr(self, "lookup_url_kwarg", None) or getattr(
            self, "lookup_field", "pk"
        )
        return self.kwargs.get(lookup_kwarg) or self.kwargs.get("pk")

    def _resolve_audit_patient_id(self, response) -> Any:
        data = getattr(response, "data", None)
        if isinstance(data, dict):
            return data.get("patient") or data.get("patient_id")
        return None

    def _resolve_audit_action_name(self) -> str:
        action_name = getattr(self, "action", "unknown")
        return f"{self.audit_action_prefix}.{action_name}"

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)

        action_name = getattr(self, "action", "")
        if request.method not in self.audit_write_methods:
            return response
        if not getattr(request.user, "is_authenticated", False):
            return response
        if action_name in self.audit_excluded_actions:
            return response
        if getattr(response, "status_code", 500) >= 400:
            return response

        log_audited_action(
            action=self._resolve_audit_action_name(),
            resource_type=self.audit_resource_type,
            resource_id=self._resolve_audit_resource_id(request, response),
            patient_id=self._resolve_audit_patient_id(response),
            request=request,
            source=self.audit_source,
            details={
                "method": request.method,
                "path": request.path,
                "view_action": action_name,
                "status_code": getattr(response, "status_code", None),
            },
        )
        return response
