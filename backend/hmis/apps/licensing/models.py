# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Licensing models for Vitora HMIS.

Tracks physical installations of the HMIS and their license status.
Each installation is tied to an Organization and its SubscriptionPlan.
License tokens (JWT, RS256-signed) are issued on activation and refreshed
on periodic check-ins.
"""

from django.db import models

from hmis.apps.core.models import TimeStampedModel


class Installation(TimeStampedModel):
    """
    Represents a single deployed instance of the Vitora HMIS.

    Each physical deployment (desktop hub, kiosk, etc.) registers as an
    Installation and receives a signed license JWT derived from the
    Organization's subscription plan.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Activation"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        REVOKED = "REVOKED", "Revoked"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    installation_id = models.CharField(
        max_length=200,
        unique=True,
        blank=True,
        default="",
        help_text="Unique hardware/installation identifier generated on first run.",
    )
    name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Human-friendly name (e.g., 'Reception Desk 1', 'Pharmacy Hub').",
    )

    # ------------------------------------------------------------------
    # Ownership
    # ------------------------------------------------------------------

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="installations",
        help_text="Organization this installation belongs to.",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="installations",
        help_text="Facility this installation is deployed at (optional).",
    )
    activated_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activated_installations",
        help_text="User who activated this installation.",
    )

    # ------------------------------------------------------------------
    # Activation
    # ------------------------------------------------------------------

    activation_code = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="One-time activation code issued to the customer.",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    activated_at = models.DateTimeField(null=True, blank=True)

    # ------------------------------------------------------------------
    # License Token
    # ------------------------------------------------------------------

    license_jwt = models.TextField(
        blank=True,
        default="",
        help_text="Current signed license JWT for this installation.",
    )
    last_check_in = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this installation checked in for token renewal.",
    )
    check_in_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of last check-in.",
    )

    # ------------------------------------------------------------------
    # Revocation
    # ------------------------------------------------------------------

    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.TextField(blank=True, default="")

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    app_version = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="App version reported on last check-in.",
    )
    os_info = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="OS info reported on last check-in.",
    )

    # ------------------------------------------------------------------
    # Phase 3: Integrity & Hardware Binding
    # ------------------------------------------------------------------

    hardware_fingerprint = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="SHA-256 of hardware identifiers (CPU + MB serial + disk UUID).",
    )
    binary_manifest_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Expected manifest version for integrity checks (e.g., '1.4.5-r3').",
    )
    hostname = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Hostname reported at last check-in.",
    )
    tamper_flagged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When binary integrity mismatch was first detected.",
    )
    tamper_resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When tamper flag was manually cleared.",
    )
    revocation_epoch = models.PositiveIntegerField(
        default=0,
        help_text="Monotonic counter; incremented by cloud to force token refresh.",
    )
    last_reported_hashes = models.JSONField(
        default=dict,
        blank=True,
        help_text="Binary hashes from last check-in {path: sha256}.",
    )
    check_in_count = models.PositiveIntegerField(
        default=0,
        help_text="Total number of successful check-ins.",
    )

    # ------------------------------------------------------------------
    # Phase 4: Distribution Hardening
    # ------------------------------------------------------------------

    class DeliveryMode(models.TextChoices):
        TARBALL = "TARBALL", "Tarball (native)"
        CONTAINER = "CONTAINER", "Container (Docker)"
        MSI = "MSI", "Windows MSI"

    class UpdateChannel(models.TextChoices):
        STABLE = "stable", "Stable"
        BETA = "beta", "Beta"

    delivery_mode = models.CharField(
        max_length=20,
        choices=DeliveryMode.choices,
        default=DeliveryMode.TARBALL,
        help_text="How this installation receives updates.",
    )
    update_channel = models.CharField(
        max_length=20,
        choices=UpdateChannel.choices,
        default=UpdateChannel.STABLE,
        help_text="Update channel: stable or beta.",
    )
    last_update_check = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the last update check was performed.",
    )
    pending_update_version = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Version of a pending (downloaded but not applied) update.",
    )
    update_deferred_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Customer-deferred update deadline.",
    )
    container_image_digest = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="SHA-256 digest of the running container image.",
    )

    # ------------------------------------------------------------------
    # Phase 5: Aggressive Controls
    # ------------------------------------------------------------------

    class ProtectionTier(models.TextChoices):
        STANDARD = "STANDARD", "Standard (Phase 2+3)"
        ENHANCED = "ENHANCED", "Enhanced (+ SQLCipher)"
        MAXIMUM = "MAXIMUM", "Maximum (+ TPM + per-customer)"

    protection_tier = models.CharField(
        max_length=20,
        choices=ProtectionTier.choices,
        default=ProtectionTier.STANDARD,
        help_text="Protection level for this installation.",
    )
    sqlcipher_enabled = models.BooleanField(
        default=False,
        help_text="Whether the local database is encrypted with SQLCipher.",
    )
    tpm_available = models.BooleanField(
        default=False,
        help_text="Whether TPM 2.0 attestation is available on this hardware.",
    )
    tpm_ak_public = models.TextField(
        blank=True,
        default="",
        help_text="TPM attestation key public part (base64) for cloud verification.",
    )
    last_tpm_quote_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the last TPM PCR quote was received.",
    )
    build_id = models.CharField(
        max_length=16,
        blank=True,
        default="",
        help_text="Watermark build ID embedded in this installation's binaries.",
    )
    canary_token = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="Canary token for provenance tracking.",
    )
    is_per_customer_build = models.BooleanField(
        default=False,
        help_text="Whether this installation has a unique per-customer build.",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name or self.installation_id} ({self.organization})"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE

    def revoke(self, reason: str = "") -> None:
        """Revoke this installation's license."""
        from django.utils import timezone

        self.status = self.Status.REVOKED
        self.revoked_at = timezone.now()
        self.revoked_reason = reason
        self.license_jwt = ""
        self.save(
            update_fields=["status", "revoked_at", "revoked_reason", "license_jwt", "updated_at"]
        )

    def suspend(self, reason: str = "") -> None:
        """Temporarily suspend this installation."""
        self.status = self.Status.SUSPENDED
        self.revoked_reason = reason
        self.save(update_fields=["status", "revoked_reason", "updated_at"])

    @property
    def is_tampered(self) -> bool:
        """True if integrity mismatch detected and not yet resolved."""
        return self.tamper_flagged_at is not None and self.tamper_resolved_at is None

    def flag_tamper(self) -> None:
        """Mark this installation as having mismatched binary hashes."""
        from django.utils import timezone

        if not self.tamper_flagged_at:
            self.tamper_flagged_at = timezone.now()
            self.save(update_fields=["tamper_flagged_at", "updated_at"])

    def clear_tamper(self) -> None:
        """Clear the tamper flag (support override)."""
        from django.utils import timezone

        self.tamper_resolved_at = timezone.now()
        self.save(update_fields=["tamper_resolved_at", "updated_at"])


class ReleaseManifest(TimeStampedModel):
    """
    Expected binary integrity manifest for a given hub release version.

    The cloud stores the expected SHA-256 hashes of all compiled .so files
    for each released version. During check-in, the hub's reported hashes
    are compared against this manifest.
    """

    version = models.CharField(
        max_length=50,
        unique=True,
        help_text="Release version string (e.g., '1.4.5').",
    )
    manifest_id = models.CharField(
        max_length=100,
        unique=True,
        help_text="Manifest identifier (e.g., '1.4.5-r3').",
    )
    file_hashes = models.JSONField(
        default=dict,
        help_text="Map of relative file path → expected SHA-256 hash.",
    )
    published_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this release was published.",
    )
    signed_by = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Identity of the release signer (e.g., CI build ID, GPG key fingerprint).",
    )

    class Meta:
        ordering = ["-published_at"]

    def __str__(self) -> str:
        return f"Manifest {self.manifest_id} ({len(self.file_hashes)} files)"

    def verify_hashes(self, reported_hashes: dict[str, str]) -> dict:
        """
        Compare reported binary hashes against expected manifest.

        Returns:
            {
                "match": True/False,
                "mismatched_files": [list of paths that don't match],
                "missing_files": [expected but not reported],
                "extra_files": [reported but not expected],
            }
        """
        expected = self.file_hashes
        mismatched = []
        missing = []
        extra = []

        for path, expected_hash in expected.items():
            reported_hash = reported_hashes.get(path)
            if reported_hash is None:
                missing.append(path)
            elif reported_hash != expected_hash:
                mismatched.append(path)

        for path in reported_hashes:
            if path not in expected:
                extra.append(path)

        return {
            "match": not mismatched and not missing,
            "mismatched_files": mismatched,
            "missing_files": missing,
            "extra_files": extra,
        }


class CheckInLog(TimeStampedModel):
    """
    Audit log of hub check-in events.

    Stores each check-in attempt with metadata for monitoring,
    tamper detection forensics, and clone detection.
    """

    installation = models.ForeignKey(
        Installation,
        on_delete=models.CASCADE,
        related_name="check_in_logs",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    hostname = models.CharField(max_length=255, blank=True, default="")
    app_version = models.CharField(max_length=50, blank=True, default="")
    os_info = models.CharField(max_length=200, blank=True, default="")
    uptime_seconds = models.PositiveIntegerField(default=0)
    user_count_24h = models.PositiveIntegerField(default=0)
    encounter_count_24h = models.PositiveIntegerField(default=0)
    hardware_fingerprint = models.CharField(max_length=128, blank=True, default="")
    binary_hashes = models.JSONField(default=dict, blank=True)
    integrity_match = models.BooleanField(
        null=True,
        help_text="True if binary hashes matched expected manifest.",
    )
    token_issued = models.BooleanField(
        default=True,
        help_text="Whether a fresh license JWT was issued.",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["installation", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"CheckIn {self.installation_id} @ {self.created_at}"
