"""
PII (Personally Identifiable Information) encryption utilities.

Provides helpers to create encrypted model fields with optional
HMAC blind-index columns for search capability.

Usage in models:

    from hmis.apps.core.pii import encrypted_pii_property, hmac_pii_property

    class Patient(models.Model):
        # Storage columns (add via migration)
        phone_number_encrypted = models.TextField(blank=True, default="")
        phone_number_hmac = models.CharField(max_length=64, blank=True, default="", db_index=True)

        # Transparent property access
        phone_number = encrypted_pii_property("phone_number")
        phone_number_lookup = hmac_pii_property("phone_number")

Kenya Data Protection Act 2019 § 41 — Integrity & Confidentiality.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Field names that must be redacted in audit log details
REDACTED_PII_FIELDS: set[str] = {
    "identification_number",
    "phone_number",
    "email",
    "national_id",
    "address",
    "alternative_phone",
    "principal_national_id",
    "hwr_national_id",
    "mpesa_phone",
    "emergency_contact_phone",
    "emergency_contact_name",
    "contact_email",
    "contact_phone",
    "sms_recipient",
    "email_recipient",
    "initial_reporter_mobile",
    "initial_reporter_email",
    "ppb_submitter_mobile",
    "ppb_submitter_email",
    "phone",
    "biometrics_agent_national_id",
    "dha_admin_name",
    "dha_admin_phone",
    "dha_admin_email",
    "dha_admin_id",
    "dha_facility_phone",
    "dha_facility_email",
    # Insurance PII
    "member_number",
    "policy_number",
    "api_key",
    "api_secret",
    "api_username",
    "api_password",
    "api_token",
}


def encrypted_pii_property(field_name: str):
    """
    Create a property that transparently encrypts/decrypts a PII field.

    The model must have a ``{field_name}_encrypted`` TextField for storage.

    Args:
        field_name: Base name of the field (e.g. "phone_number").

    Returns:
        A property descriptor.
    """
    encrypted_attr = f"{field_name}_encrypted"

    @property  # type: ignore[misc]
    def _getter(self) -> str:
        raw = getattr(self, encrypted_attr, "")
        if not raw:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        try:
            return get_kms_provider().decrypt_string(raw)
        except Exception:
            logger.warning(
                "Failed to decrypt %s for %s pk=%s", field_name, type(self).__name__, self.pk
            )
            return ""

    @_getter.setter
    def _getter(self, value: str) -> None:
        if not value:
            setattr(self, encrypted_attr, "")
            # Also clear HMAC if the column exists
            hmac_attr = f"{field_name}_hmac"
            if hasattr(self, hmac_attr):
                setattr(self, hmac_attr, "")
            return
        from hmis.apps.core.kms import get_kms_provider

        kms = get_kms_provider()
        setattr(self, encrypted_attr, kms.encrypt_string(value))
        # Also set HMAC if the column exists
        hmac_attr = f"{field_name}_hmac"
        if hasattr(self, hmac_attr):
            setattr(self, hmac_attr, kms.compute_hmac(value))

    _getter.fget.__doc__ = f"Decrypt and return the {field_name} value."
    return _getter


def redact_pii(details: dict) -> dict:
    """
    Redact PII values in an audit-log details dict (in-place).

    Handles top-level keys and nested dicts such as ``old_values``,
    ``new_values``, and ``changes``.

    Returns the same dict for convenience.
    """
    if not isinstance(details, dict):
        return details

    for key in REDACTED_PII_FIELDS:
        if key in details:
            details[key] = "[REDACTED]"
        for nested_key in ("old_values", "new_values", "changes"):
            nested = details.get(nested_key)
            if isinstance(nested, dict) and key in nested:
                nested[key] = "[REDACTED]"

    return details
