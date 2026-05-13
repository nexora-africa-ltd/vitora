"""
History tracking utilities for audit trail enhancements.

This module provides utilities for working with django-simple-history
for DHA compliance requirements including:
- Field-level change tracking
- Version comparison
- History serialization for API responses

Sprint 1.D: Audit & Integrity Enhancements (DHA Compliance)
"""

from typing import Any


def get_field_changes(old_record, new_record, exclude_fields: list[str] | None = None) -> dict:
    """
    Compare two historical records and return field-level changes.

    This function compares two historical record instances (from django-simple-history)
    and returns a dictionary of fields that changed, with old and new values.

    Args:
        old_record: The previous historical record (or None for creation)
        new_record: The current historical record
        exclude_fields: List of field names to exclude from comparison
            (defaults to history metadata fields and timestamps)

    Returns:
        dict: Dictionary with structure:
            {
                "field_name": {
                    "old": old_value,
                    "new": new_value
                },
                ...
            }

    Example:
        >>> changes = get_field_changes(old_version, new_version)
        >>> changes
        {
            "first_name": {"old": "John", "new": "Johnny"},
            "phone_number": {"old": "0700123456", "new": "0700654321"}
        }
    """
    if exclude_fields is None:
        exclude_fields = [
            "id",
            "history_id",
            "history_date",
            "history_change_reason",
            "history_type",
            "history_user_id",
            "history_user",
            "created_at",
            "updated_at",
        ]

    # Phase D PII: plaintext columns are dropped; only *_encrypted and *_hmac
    # columns remain. Map HMAC column changes back to the logical field name
    # so diffs show "phone_number" instead of "phone_number_hmac".
    # Encrypted columns are excluded from HistoricalRecords, so only HMACs
    # appear in history; we can detect *that* a PII field changed but cannot
    # recover the old/new plaintext (HMACs are one-way).
    def _resolve_pii_mapping(record):
        """Return (hmac_to_plain, suppressed_fields) for a (historical) record."""
        model = getattr(record, "instance_type", None) or type(record)
        # Legacy explicit mapping
        pii_fields = getattr(model, "_PII_FIELDS", None)
        if pii_fields:
            enc_to_plain: dict[str, str] = {}
            suppressed: set[str] = set()
            for plain_attr, enc_attr, hmac_attr in pii_fields:
                enc_to_plain[enc_attr] = plain_attr
                suppressed.add(plain_attr)
                suppressed.add(enc_attr)
                if hmac_attr:
                    suppressed.add(hmac_attr)
            return enc_to_plain, suppressed
        # Phase D auto-discovery: scan concrete fields for *_hmac / *_encrypted
        field_names = {f.name for f in model._meta.fields}
        hmac_to_plain: dict[str, str] = {}
        suppressed_set: set[str] = set()
        for fname in field_names:
            if fname.endswith("_hmac"):
                plain = fname.removesuffix("_hmac")
                hmac_to_plain[fname] = plain
                suppressed_set.add(fname)
                enc = f"{plain}_encrypted"
                if enc in field_names:
                    hmac_to_plain[enc] = plain
                    suppressed_set.add(enc)
        return hmac_to_plain, suppressed_set

    def _decrypt_pii(value):
        """Decrypt a Fernet-encrypted PII value, returning None on failure."""
        if not value:
            return None
        import contextlib

        from hmis.apps.core.kms import get_kms_provider

        with contextlib.suppress(Exception):
            return get_kms_provider().decrypt_string(value)
        return None

    enc_to_plain, suppressed_fields = _resolve_pii_mapping(new_record)

    def _pii_display(field_name, value):
        """Return a human-readable value for a PII-mapped field.

        For *_encrypted fields, attempt decryption.
        For *_hmac fields, return '[redacted]' if non-empty (one-way hash).
        """
        if not value:
            return None
        if field_name.endswith("_hmac"):
            return "[redacted]"
        return _decrypt_pii(value)

    changes = {}

    if old_record is None:
        # This is a creation - show all non-null fields as new
        for field in new_record._meta.fields:
            field_name = field.name
            if field_name in exclude_fields:
                continue

            # PII: render mapped columns under their logical field name
            if field_name in enc_to_plain:
                plain_name = enc_to_plain[field_name]
                if plain_name in changes:
                    continue  # already emitted by a sibling column
                new_value = _pii_display(field_name, getattr(new_record, field_name, None))
                if new_value:
                    changes[plain_name] = {"old": None, "new": _serialize_value(new_value)}
                continue
            if field_name in suppressed_fields:
                continue

            new_value = getattr(new_record, field_name, None)
            if new_value is not None and new_value != "":
                changes[field_name] = {
                    "old": None,
                    "new": _serialize_value(new_value),
                }
        return changes

    # Compare each field between old and new records
    for field in new_record._meta.fields:
        field_name = field.name
        if field_name in exclude_fields:
            continue

        # PII: render mapped columns under their logical field name
        if field_name in enc_to_plain:
            plain_name = enc_to_plain[field_name]
            if plain_name in changes:
                continue  # already emitted by a sibling column
            old_raw = getattr(old_record, field_name, None)
            new_raw = getattr(new_record, field_name, None)
            if old_raw != new_raw:
                changes[plain_name] = {
                    "old": _serialize_value(_pii_display(field_name, old_raw)),
                    "new": _serialize_value(_pii_display(field_name, new_raw)),
                }
            continue
        if field_name in suppressed_fields:
            continue

        old_value = getattr(old_record, field_name, None)
        new_value = getattr(new_record, field_name, None)

        # Handle FK comparisons (compare IDs rather than objects)
        if hasattr(old_value, "pk"):
            old_value = old_value.pk
        if hasattr(new_value, "pk"):
            new_value = new_value.pk

        if old_value != new_value:
            changes[field_name] = {
                "old": _serialize_value(old_value),
                "new": _serialize_value(new_value),
            }

    return changes


def _serialize_value(value: Any) -> Any:
    """
    Serialize a value for JSON output.

    Handles common Django field types.

    Args:
        value: The value to serialize

    Returns:
        A JSON-serializable representation of the value
    """
    if value is None:
        return None

    # Handle date/datetime
    if hasattr(value, "isoformat"):
        return value.isoformat()

    # Handle Decimal
    if hasattr(value, "quantize"):
        return str(value)

    # Handle model instances (return pk)
    if hasattr(value, "pk"):
        return value.pk

    # Handle enums
    if hasattr(value, "value"):
        return value.value

    return value


def get_history_diff(instance, version_id: int | None = None) -> dict:
    """
    Get changes between a specific version and its predecessor.

    If version_id is None, returns changes for the most recent version.

    Args:
        instance: Model instance with history
        version_id: Optional specific history_id to check

    Returns:
        dict: Dictionary containing:
            - version: The version number (history_id)
            - history_type: '+' (create), '~' (update), '-' (delete)
            - history_date: When the change occurred
            - history_user: User who made the change (username or None)
            - changes: Field-level changes dict
    """
    if not hasattr(instance, "history"):
        raise ValueError(f"{instance.__class__.__name__} does not have history tracking enabled")

    history = instance.history.all().order_by("-history_date")

    if version_id is not None:
        current_version = instance.history.filter(history_id=version_id).first()
        if not current_version:
            raise ValueError(f"Version {version_id} not found")
    else:
        current_version = history.first()

    if not current_version:
        return {}

    # Find the previous version
    previous_version = history.filter(history_date__lt=current_version.history_date).first()

    changes = get_field_changes(previous_version, current_version)

    return {
        "version_id": current_version.history_id,
        "history_type": current_version.history_type,
        "history_date": current_version.history_date.isoformat(),
        "history_user": (
            current_version.history_user.username if current_version.history_user else None
        ),
        "changes": changes,
    }


def get_full_history(instance, limit: int | None = None) -> list[dict]:
    """
    Get the complete change history for a model instance.

    Returns a list of changes in reverse chronological order (newest first).

    Args:
        instance: Model instance with history
        limit: Optional limit on number of versions to return

    Returns:
        list: List of dictionaries, each containing version info and changes
    """
    if not hasattr(instance, "history"):
        raise ValueError(f"{instance.__class__.__name__} does not have history tracking enabled")

    history = instance.history.all().order_by("-history_date")
    if limit:
        history = history[:limit]

    result = []
    history_list = list(history)

    for i, current_version in enumerate(history_list):
        # Previous version is the next item in the list (since sorted desc)
        previous_version = history_list[i + 1] if i + 1 < len(history_list) else None

        changes = get_field_changes(previous_version, current_version)

        result.append(
            {
                "version_id": current_version.history_id,
                "history_type": _get_history_type_display(current_version.history_type),
                "history_date": current_version.history_date.isoformat(),
                "history_user": (
                    current_version.history_user.username if current_version.history_user else None
                ),
                "history_user_id": (
                    current_version.history_user.id if current_version.history_user else None
                ),
                "changes": changes,
            }
        )

    return result


def _get_history_type_display(history_type: str) -> str:
    """Convert history type code to human-readable string."""
    return {
        "+": "created",
        "~": "updated",
        "-": "deleted",
    }.get(history_type, history_type)


class HistoryMixin:
    """
    Mixin for models with django-simple-history tracking.

    Provides convenient methods for accessing change history
    and field-level diffs.

    Usage:
        class Patient(HistoryMixin, models.Model):
            history = HistoricalRecords()
            ...

        # Get changes for last update
        patient.get_last_changes()

        # Get full history
        patient.get_change_history(limit=10)
    """

    def get_last_changes(self) -> dict:
        """Get the field changes from the most recent update."""
        return get_history_diff(self)

    def get_change_history(self, limit: int | None = None) -> list[dict]:
        """Get the full change history for this instance."""
        return get_full_history(self, limit=limit)

    def get_version(self, version_id: int) -> dict:
        """Get changes for a specific version."""
        return get_history_diff(self, version_id=version_id)

    def get_version_count(self) -> int:
        """Get the number of versions in history."""
        if not hasattr(self, "history"):
            return 0
        return self.history.count()
