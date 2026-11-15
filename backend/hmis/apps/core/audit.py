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

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip
from hmis.apps.core.pii import REDACTED_PII_FIELDS


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
    audit_action_names: dict[str, str] = {}

    def _resolve_audit_resource_id(self, _request, response) -> Any:
        data = getattr(response, "data", None)
        if isinstance(data, dict) and "id" in data:
            return data.get("id")
        lookup_kwarg = getattr(self, "lookup_url_kwarg", None) or getattr(
            self, "lookup_field", "pk"
        )
        view_kwargs = getattr(self, "kwargs", {})
        return view_kwargs.get(lookup_kwarg) or view_kwargs.get("pk")

    def _resolve_audit_patient_id(self, response) -> Any:
        data = getattr(response, "data", None)
        if isinstance(data, dict):
            return data.get("patient") or data.get("patient_id")
        return None

    def _resolve_audit_action_name(self) -> str:
        action_name = getattr(self, "action", "unknown")
        return self.audit_action_names.get(action_name, f"{self.audit_action_prefix}.{action_name}")

    def get_audit_details(self, request, response) -> dict[str, Any]:
        """Return the standard mutation metadata, overridable by specialized views."""
        return {
            "method": request.method,
            "path": request.path,
            "view_action": getattr(self, "action", ""),
            "status_code": getattr(response, "status_code", None),
        }

    def get_audit_context(self, _request, _response) -> dict[str, Any]:
        """Return optional explicit tenant context for the audit entry."""
        return {}

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
            details=self.get_audit_details(request, response),
            **self.get_audit_context(request, response),
        )
        return response


class AuditedConfigurationMutationMixin(AuditedMutationMixin):
    """
    Add field-level, secret-safe change evidence to facility configuration APIs.

    The mixin captures concrete model fields and editable many-to-many relations
    around successful CRUD operations. It records safe before/after values and
    retains the names, but never values, of PII, encrypted, credential, or
    financial-account fields.
    """

    audit_configuration_excluded_fields = {
        "id",
        "pk",
        "created_at",
        "updated_at",
        "facility",
        "organization",
    }
    audit_configuration_sensitive_markers = (
        "password",
        "secret",
        "token",
        "api_key",
        "private_key",
        "credential",
        "account_number",
        "encrypted",
    )

    @staticmethod
    def _safe_audit_value(value: Any) -> Any:
        """Normalize model values into JSON-safe audit values without decryption."""
        if value is None or isinstance(value, str | int | float | bool):
            return value
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, date | datetime | time):
            return value.isoformat()
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, dict):
            return {
                str(key): AuditedConfigurationMutationMixin._safe_audit_value(item)
                for key, item in value.items()
            }
        if isinstance(value, list | tuple | set):
            return [AuditedConfigurationMutationMixin._safe_audit_value(item) for item in value]
        if hasattr(value, "pk"):
            return value.pk
        return str(value)

    @staticmethod
    def _audit_field_name(field_name: str) -> str:
        """Map encrypted storage columns to their public configuration field names."""
        return field_name.removesuffix("_encrypted")

    @classmethod
    def _is_sensitive_configuration_field(cls, field_name: str) -> bool:
        """Return whether a field name may identify a recipient or expose a secret."""
        normalized = field_name.lower()
        return normalized in REDACTED_PII_FIELDS or any(
            marker in normalized for marker in cls.audit_configuration_sensitive_markers
        )

    def configuration_audit_snapshot(self, instance) -> dict[str, Any]:
        """Capture auditable model state without reading encrypted-property accessors."""
        snapshot: dict[str, Any] = {}
        if instance is None:
            return snapshot

        for field in instance._meta.concrete_fields:
            field_name = self._audit_field_name(field.name)
            if field_name in self.audit_configuration_excluded_fields:
                continue
            snapshot[field_name] = self._safe_audit_value(getattr(instance, field.attname))

        if instance.pk:
            for field in instance._meta.many_to_many:
                if field.auto_created:
                    continue
                snapshot[field.name] = sorted(field.value_from_object(instance))

        return snapshot

    def build_configuration_audit_details(
        self,
        before: dict[str, Any],
        after: dict[str, Any],
        *,
        operation: str,
    ) -> dict[str, Any]:
        """Build a redacted diff suitable for AuditLog.details."""
        changed_fields: list[str] = []
        redacted_fields: list[str] = []
        old_values: dict[str, Any] = {}
        new_values: dict[str, Any] = {}

        for field_name in sorted(set(before) | set(after)):
            old_value = before.get(field_name)
            new_value = after.get(field_name)
            if old_value == new_value:
                continue
            changed_fields.append(field_name)
            if self._is_sensitive_configuration_field(field_name):
                redacted_fields.append(field_name)
                continue
            if field_name in before:
                old_values[field_name] = old_value
            if field_name in after:
                new_values[field_name] = new_value

        return {
            "configuration_operation": operation,
            "changed_fields": changed_fields,
            "old_values": old_values,
            "new_values": new_values,
            "redacted_fields": redacted_fields,
        }

    def capture_configuration_audit(self, instance, *, operation: str, before=None) -> None:
        """Store a pre-mutation snapshot for finalize_response to audit."""
        self._configuration_audit_instance = instance
        self._configuration_audit_before = (
            self.configuration_audit_snapshot(instance) if before is None else before
        )
        self._configuration_audit_operation = operation

    def capture_configuration_creation(self, instance) -> None:
        """Prepare a newly-created setting for create auditing."""
        self.capture_configuration_audit(instance, operation="create", before={})

    def update(self, request, *args, **kwargs):
        """Capture a configuration snapshot before DRF persists an update."""
        self.capture_configuration_audit(
            self.get_object(), operation=getattr(self, "action", "update")
        )
        return super().update(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        """Capture newly-created configuration state for the common create path."""
        response = super().create(request, *args, **kwargs)
        if getattr(response, "status_code", 500) < 400:
            resource_id = self._resolve_audit_resource_id(request, response)
            if resource_id:
                instance = self.queryset.model._default_manager.filter(pk=resource_id).first()
                if instance is not None:
                    self.capture_configuration_creation(instance)
        return response

    def destroy(self, request, *args, **kwargs):
        """Capture the final safe state before a configuration is deleted."""
        self.capture_configuration_audit(self.get_object(), operation="destroy")
        self._configuration_audit_deleted = True
        return super().destroy(request, *args, **kwargs)

    def _configuration_audit_details(self) -> dict[str, Any] | None:
        """Build the captured diff after a mutation has completed."""
        instance = getattr(self, "_configuration_audit_instance", None)
        if instance is None:
            return None

        before = getattr(self, "_configuration_audit_before", {})
        if getattr(self, "_configuration_audit_deleted", False):
            after = {}
        else:
            instance.refresh_from_db()
            after = self.configuration_audit_snapshot(instance)

        return self.build_configuration_audit_details(
            before,
            after,
            operation=getattr(self, "_configuration_audit_operation", getattr(self, "action", "")),
        )

    def get_audit_details(self, request, response) -> dict[str, Any]:
        """Add field-level configuration changes to the common audit metadata."""
        details = super().get_audit_details(request, response)
        configuration_details = self._configuration_audit_details()
        if configuration_details is not None:
            details.update(configuration_details)
        instance = getattr(self, "_configuration_audit_instance", None)
        if instance is not None:
            facility = (
                instance
                if instance._meta.label_lower == "core.facility"
                else getattr(instance, "facility", None)
            )
            if facility is not None:
                details["target_facility_id"] = facility.pk
        return details

    def get_audit_context(self, request, response) -> dict[str, Any]:
        """Attach the configured facility, rather than the actor's active facility."""
        context = super().get_audit_context(request, response)
        instance = getattr(self, "_configuration_audit_instance", None)
        if instance is None:
            return context

        facility = (
            instance
            if instance._meta.label_lower == "core.facility"
            else getattr(instance, "facility", None)
        )
        organization = getattr(instance, "organization", None) or getattr(
            facility, "organization", None
        )
        if getattr(self, "_configuration_audit_deleted", False):
            # Audit entries are finalized after the object is removed. Retaining
            # its Facility FK would violate referential integrity; resource_id
            # and details.target_facility_id preserve the target identity.
            facility = None
        return {**context, "facility": facility, "organization": organization}

    def log_captured_configuration_mutation(
        self,
        request,
        *,
        action: str,
        status_code: int | None = None,
    ) -> AuditLog:
        """Write a configuration audit entry for a mutation returning an error response."""
        instance = getattr(self, "_configuration_audit_instance", None)
        if instance is None:
            raise RuntimeError("Capture configuration state before logging a mutation.")

        details = self._configuration_audit_details() or {}
        details.update(
            {
                "method": request.method,
                "path": request.path,
                "view_action": getattr(self, "action", ""),
                "status_code": status_code,
            }
        )
        context = self.get_audit_context(request, None)
        return log_audited_action(
            action=action,
            resource_type=self.audit_resource_type,
            resource_id=instance.pk,
            request=request,
            source=self.audit_source,
            details=details,
            **context,
        )
