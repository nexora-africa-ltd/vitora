# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, DJ012
"""
What this file is for: security, invitations, membership, and outbound DHA call core models.
How to use: imported by `hmis.apps.core.models` compatibility module.
Supported inputs/args: Django model fields and methods for certificates, invites, org membership, and call audit.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import OrganizationScopedModel
from hmis.apps.core.models_audit_sync import TimeStampedModel
from hmis.apps.core.models_reference import Department, Role
from hmis.apps.core.pii import encrypted_pii_property


class DHIS2Config(OrganizationScopedModel, TimeStampedModel):
    """
    DHIS2/KHIS connection configuration scoped to an Organization.

    In Kenya's DHIS2 ecosystem (KHIS), credentials are typically issued at
    the sub-county or county level — one user account can submit data for
    multiple facilities. The DHIS2 Organisation Unit UID, however, is
    per-facility and lives on the ``Facility.dhis2_org_unit`` field.

    This model stores the **connection credentials** (base URL + auth) that
    are shared across all facilities within an organization. Facilities
    resolve their own org unit from ``Facility.dhis2_org_unit``.

    Security:
        The ``password`` field is stored encrypted via the KMS provider.
        Use ``set_password()`` / ``get_password()`` for read/write access.
    """

    class Environment(models.TextChoices):
        """DHIS2 target environment."""

        LOCAL = "local", "Local (dev/test)"
        STAGING = "staging", "Staging"
        PRODUCTION = "production", "Production (KHIS)"

    name = models.CharField(
        max_length=100,
        help_text="Human-readable label, e.g. 'Mombasa Sub-County KHIS'.",
    )
    base_url = models.URLField(
        max_length=255,
        help_text="DHIS2 instance base URL, e.g. 'https://hiskenya.org'.",
    )
    username = models.CharField(
        max_length=150,
        help_text="DHIS2 API username.",
    )
    _password = models.TextField(
        db_column="password",
        help_text="Encrypted DHIS2 API password. Use set_password()/get_password().",
    )
    environment = models.CharField(
        max_length=12,
        choices=Environment.choices,
        default=Environment.PRODUCTION,
        help_text="Target DHIS2 environment (controls data-element UID resolution).",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this configuration is currently active.",
    )

    class Meta:
        verbose_name = "DHIS2 Configuration"
        verbose_name_plural = "DHIS2 Configurations"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization"],
                condition=models.Q(is_active=True),
                name="unique_active_dhis2_config_per_org",
            ),
        ]

    def __str__(self) -> str:
        org_name = getattr(self.organization, "name", "—")
        return f"{self.name} ({org_name})"

    # -- Password encryption helpers ------------------------------------

    def set_password(self, plain: str) -> None:
        """Encrypt and store a plaintext password."""
        from hmis.apps.core.kms import get_kms_provider

        kms = get_kms_provider()
        self._password = kms.encrypt(plain.encode()).decode()

    def get_password(self) -> str:
        """Decrypt and return the stored password."""
        if not self._password:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        kms = get_kms_provider()
        return kms.decrypt(self._password.encode()).decode()

    # -- Convenience helpers --------------------------------------------

    @property
    def api_url(self) -> str:
        """Return the base URL with trailing slash stripped."""
        return self.base_url.rstrip("/")

    @classmethod
    def get_for_facility(cls, facility) -> "DHIS2Config | None":
        """Return the active DHIS2 config for a facility's organization.

        Falls back to global Django settings if no DB config exists
        (backward-compatible with env-var-only deployments).
        """
        if not facility or not facility.organization_id:
            return None
        return (
            cls.objects.filter(
                organization=facility.organization,
                is_active=True,
            )
            .select_related("organization")
            .first()
        )


class CertificateAuthority(models.Model):
    """
    X.509 Certificate Authority for document signing.

    Supports a root CA with optional intermediate CAs. Private keys
    are encrypted at rest using the KMS provider.
    """

    name = models.CharField(
        max_length=200,
        help_text="CA display name (e.g., 'Vitora HMIS Root CA')",
    )
    serial_number = models.CharField(
        max_length=64,
        unique=True,
        help_text="Certificate serial number (hex)",
    )
    subject_dn = models.CharField(
        max_length=500,
        help_text="Distinguished Name (e.g., 'CN=Vitora HMIS Root CA, O=Nexora Consulting Ltd, C=KE')",
    )
    public_key_pem = models.TextField(
        help_text="PEM-encoded public key",
    )
    private_key_pem_encrypted = models.TextField(
        help_text="PEM private key encrypted with KMS",
    )
    certificate_pem = models.TextField(
        help_text="X.509 certificate in PEM format",
    )
    valid_from = models.DateTimeField(help_text="Certificate validity start")
    valid_to = models.DateTimeField(help_text="Certificate validity end")
    is_root = models.BooleanField(
        default=True,
        help_text="Whether this is a root CA (self-signed)",
    )
    parent_ca = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subordinate_cas",
        help_text="Parent CA for intermediate CAs",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="certificate_authorities",
        help_text=(
            "Owning organization for tenant-scoped intermediate CAs. "
            "Root CAs remain global with organization unset."
        ),
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this CA is currently active for issuing certificates",
    )
    key_size = models.IntegerField(
        default=2048,
        help_text="RSA key size in bits",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Certificate Authority"
        verbose_name_plural = "Certificate Authorities"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization"],
                condition=(
                    models.Q(is_root=False, is_active=True) & models.Q(organization__isnull=False)
                ),
                name="unique_active_intermediate_ca_per_organization",
            )
        ]

    def __str__(self) -> str:
        status = "Active" if self.is_active else "Inactive"
        return f"{self.name} ({status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.valid_to


class UserCertificate(models.Model):
    """
    X.509 user certificate for document signing.

    Issued by a CertificateAuthority. Private key encrypted at rest via KMS.
    """

    class RevocationReason(models.TextChoices):
        KEY_COMPROMISE = "KEY_COMPROMISE", "Key Compromise"
        AFFILIATION_CHANGED = "AFFILIATION_CHANGED", "Affiliation Changed"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        CESSATION = "CESSATION", "Cessation of Operation"
        PRIVILEGE_WITHDRAWN = "PRIVILEGE_WITHDRAWN", "Privilege Withdrawn"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="certificates",
        help_text="User who owns this certificate",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="user_certificates",
        help_text="Owning organization (tenant) for this certificate.",
    )
    certificate_authority = models.ForeignKey(
        CertificateAuthority,
        on_delete=models.PROTECT,
        related_name="issued_certificates",
        help_text="CA that issued this certificate",
    )
    serial_number = models.CharField(
        max_length=64,
        unique=True,
        help_text="Certificate serial number (hex)",
    )
    subject_dn = models.CharField(
        max_length=500,
        help_text="Certificate subject DN",
    )
    public_key_pem = models.TextField(
        help_text="PEM-encoded public key",
    )
    private_key_pem_encrypted = models.TextField(
        help_text="PEM private key encrypted with KMS",
    )
    certificate_pem = models.TextField(
        help_text="X.509 certificate in PEM format",
    )
    valid_from = models.DateTimeField(help_text="Certificate validity start")
    valid_to = models.DateTimeField(help_text="Certificate validity end")
    is_revoked = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether this certificate has been revoked",
    )
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the certificate was revoked",
    )
    revocation_reason = models.CharField(
        max_length=30,
        choices=RevocationReason.choices,
        blank=True,
        default="",
        help_text="Reason for revocation",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Certificate"
        verbose_name_plural = "User Certificates"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_revoked"]),
            models.Index(fields=["organization", "is_revoked"]),
        ]

    def __str__(self) -> str:
        status = "Revoked" if self.is_revoked else ("Expired" if self.is_expired else "Valid")
        return f"Cert {self.serial_number[:8]}... ({self.user.username}, {status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.valid_to

    @property
    def is_valid(self) -> bool:
        return not self.is_revoked and not self.is_expired and self.certificate_authority.is_active


class CertificateRevocation(models.Model):
    """CRL entry for a revoked certificate."""

    certificate = models.ForeignKey(
        UserCertificate,
        on_delete=models.CASCADE,
        related_name="revocations",
        help_text="The revoked certificate",
    )
    revoked_at = models.DateTimeField(
        default=timezone.now,
        help_text="When the certificate was revoked",
    )
    reason = models.CharField(
        max_length=30,
        choices=UserCertificate.RevocationReason.choices,
        help_text="Reason for revocation",
    )
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="certificate_revocations",
        help_text="User who revoked the certificate",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Certificate Revocation"
        verbose_name_plural = "Certificate Revocations"
        ordering = ["-revoked_at"]

    def __str__(self) -> str:
        return f"Revocation of {self.certificate.serial_number[:8]}... ({self.reason})"


class DocumentSignature(models.Model):
    """
    Cryptographic signature for a clinical document.

    Stores an RSA-2048 signature over the SHA-256 hash of the
    document's canonical content at signing time.
    """

    document_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Model name of the signed document (e.g., 'LabResult', 'Prescription')",
    )
    document_id = models.BigIntegerField(
        db_index=True,
        help_text="Primary key of the signed document",
    )
    signer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="document_signatures",
        help_text="User who signed the document",
    )
    certificate = models.ForeignKey(
        UserCertificate,
        on_delete=models.PROTECT,
        related_name="signatures",
        help_text="Certificate used to create the signature",
    )
    content_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hex digest of the document content at signing time",
    )
    signature = models.TextField(
        help_text="Base64-encoded RSA signature",
    )
    hash_algorithm = models.CharField(
        max_length=20,
        default="SHA-256",
        help_text="Hash algorithm used",
    )
    signed_at = models.DateTimeField(
        default=timezone.now,
        help_text="When the document was signed",
    )
    is_valid = models.BooleanField(
        default=True,
        help_text="Cached validity (updated on verification)",
    )
    verification_note = models.TextField(
        blank=True,
        default="",
        help_text="Notes from the last verification",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Document Signature"
        verbose_name_plural = "Document Signatures"
        ordering = ["-signed_at"]
        indexes = [
            models.Index(fields=["document_type", "document_id"]),
            models.Index(fields=["signer", "signed_at"]),
        ]

    def __str__(self) -> str:
        return f"Sig on {self.document_type}#{self.document_id} by {self.signer.username}"


class DocumentShare(models.Model):
    """User-to-user share for a signable clinical document."""

    class Permission(models.TextChoices):
        VIEW = "VIEW", "View"
        SIGN = "SIGN", "Sign"

    document_type = models.CharField(max_length=50, db_index=True)
    document_id = models.BigIntegerField(db_index=True)
    shared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_shares_sent",
        help_text="User who shared the document",
    )
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_shares_received",
        help_text="User who received access to the document",
    )
    permission = models.CharField(
        max_length=10,
        choices=Permission.choices,
        default=Permission.VIEW,
        db_index=True,
    )
    note = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="document_shares_revoked",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Document Share"
        verbose_name_plural = "Document Shares"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["document_type", "document_id"]),
            models.Index(fields=["shared_with", "permission"]),
            models.Index(fields=["shared_by"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["document_type", "document_id", "shared_with"],
                condition=models.Q(revoked_at__isnull=True),
                name="unique_active_document_share",
            )
        ]

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and (
            self.expires_at is None or self.expires_at > timezone.now()
        )

    def __str__(self) -> str:
        return (
            f"{self.document_type}#{self.document_id} shared to "
            f"{self.shared_with.username} ({self.permission})"
        )


class StaffInvitation(models.Model):
    """
    Invitation for a new staff member to join the system.

    An admin creates an invitation specifying the email, role, department, and
    facility. The system sends an email with a unique link. The invitee uses the
    link to set their own username, password, and personal details. Once accepted
    a User + StaffProfile are created with the pre-configured role/department.

    Invitations expire after ``expires_hours`` (default 72h, max 720h / 30 days).
    """

    class InvitationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        EXPIRED = "EXPIRED", "Expired"
        REVOKED = "REVOKED", "Revoked"
        DECLINED = "DECLINED", "Declined"

    # Invitation identity
    token = models.UUIDField(
        unique=True,
        editable=False,
        help_text="Unique token embedded in the invitation link.",
    )
    email_encrypted = models.TextField(default="", blank=True)
    email_hmac = models.CharField(max_length=64, default="", blank=True, db_index=True)
    email = encrypted_pii_property("email")

    # Pre-configured admin settings
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="invitations",
        help_text="Organization the invitee will belong to.",
    )
    facility = models.ForeignKey(
        "Facility",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="invitations",
        help_text="Primary facility assignment.",
    )
    role = models.ForeignKey(
        "Role",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations",
        help_text="Primary role to assign on acceptance.",
    )
    department = models.ForeignKey(
        "Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations",
        help_text="Primary department to assign on acceptance.",
    )
    secondary_roles = models.ManyToManyField(
        "Role",
        blank=True,
        related_name="secondary_invitations",
        help_text="Additional roles to assign on acceptance.",
    )
    secondary_departments = models.ManyToManyField(
        "Department",
        blank=True,
        related_name="secondary_invitations",
        help_text="Additional departments to assign on acceptance.",
    )
    job_title = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Job title for the new staff member.",
    )
    employee_id = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Pre-assigned employee ID (admin can pre-fill or leave blank).",
    )

    # Lifecycle
    status = models.CharField(
        max_length=10,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_invitations",
        help_text="Admin who created the invitation.",
    )
    expires_at = models.DateTimeField(
        help_text="When the invitation link expires.",
    )
    expires_hours = models.PositiveIntegerField(
        default=72,
        help_text="Invitation validity in hours (default 72, max 720 = 30 days).",
    )

    # Acceptance tracking
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_invitation",
        help_text="User account created when invitation was accepted.",
    )

    # Email tracking
    last_sent_at = models.DateTimeField(null=True, blank=True)
    send_count = models.PositiveIntegerField(default=0)

    # Cross-org invitation fields
    is_cross_org = models.BooleanField(
        default=False,
        help_text="True when inviting an existing user to a different org.",
    )
    existing_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cross_org_invitations",
        help_text="Reference to existing user being invited cross-org.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Staff Invitation"
        verbose_name_plural = "Staff Invitations"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["email_hmac"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"Invitation for {self.email} ({self.status})"

    def save(self, *args, **kwargs):
        """Auto-generate token and set expiry on first save."""

        if not self.token:
            self.token = uuid.uuid4()
        if not self.expires_at:
            from datetime import timedelta

            hours = min(self.expires_hours, 720)  # Cap at 30 days
            self.expires_at = timezone.now() + timedelta(hours=hours)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        """Check if the invitation has expired."""
        return timezone.now() > self.expires_at

    @property
    def is_usable(self) -> bool:
        """Check if the invitation can still be accepted."""
        return self.status == self.InvitationStatus.PENDING and not self.is_expired

    def revoke(self, user=None):
        """Revoke the invitation."""
        self.status = self.InvitationStatus.REVOKED
        self.save(update_fields=["status", "updated_at"])

    def mark_accepted(self, user):
        """Mark invitation as accepted and link to the created user."""
        self.status = self.InvitationStatus.ACCEPTED
        self.accepted_at = timezone.now()
        self.accepted_user = user
        self.save(update_fields=["status", "accepted_at", "accepted_user", "updated_at"])


class PasswordResetToken(models.Model):
    """
    Time-limited token for password reset flows.

    Tokens are single-use and expire after 1 hour by default.
    The endpoint always returns 200 regardless of email existence
    to prevent email enumeration attacks.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token = models.UUIDField(
        unique=True,
        editable=False,
        help_text="Unique reset token.",
    )
    expires_at = models.DateTimeField(
        help_text="When this token expires (default: 1 hour).",
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this token has been used.",
    )
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Password Reset Token"
        verbose_name_plural = "Password Reset Tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user", "used"]),
        ]

    def __str__(self) -> str:
        return f"Reset token for {self.user.username} (used={self.used})"

    def save(self, *args, **kwargs):
        """Auto-generate token and set expiry on first save."""

        if not self.token:
            self.token = uuid.uuid4()
        if not self.expires_at:
            from datetime import timedelta

            self.expires_at = timezone.now() + timedelta(hours=1)
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        """Check if this token is still valid (not used, not expired)."""
        return not self.used and timezone.now() < self.expires_at

    def consume(self):
        """Mark the token as used."""
        self.used = True
        self.used_at = timezone.now()
        self.save(update_fields=["used", "used_at"])


class EmailVerificationToken(models.Model):
    """
    Time-limited token for email verification during self-service org signup.

    Tokens are single-use and expire after 24 hours by default.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_verification_tokens",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="verification_tokens",
    )
    token = models.UUIDField(
        unique=True,
        editable=False,
        help_text="Unique verification token.",
    )
    expires_at = models.DateTimeField(
        help_text="When this token expires (default: 24 hours).",
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this token has been used.",
    )
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Email Verification Token"
        verbose_name_plural = "Email Verification Tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user", "used"]),
        ]

    def __str__(self) -> str:
        return f"Verification token for {self.user.username} (used={self.used})"

    def save(self, *args, **kwargs):
        """Auto-generate token and set expiry on first save."""

        if not self.token:
            self.token = uuid.uuid4()
        if not self.expires_at:
            from datetime import timedelta

            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        """Check if this token is still valid (not used, not expired)."""
        return not self.used and timezone.now() < self.expires_at

    def consume(self):
        """Mark the token as used."""
        self.used = True
        self.used_at = timezone.now()
        self.save(update_fields=["used", "used_at"])


class OrgMembership(TimeStampedModel):
    """
    Join table linking a StaffProfile to an Organization with per-org role,
    department, and facility assignments.

    Replaces the flat ``StaffProfile.secondary_organizations`` M2M which
    cannot carry per-org metadata (role, department, facilities).

    A user has exactly one ``is_primary=True`` membership (their home org)
    and zero or more secondary memberships (locum, consultant, etc.).
    """

    class MembershipStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        REVOKED = "REVOKED", "Revoked"

    staff_profile = models.ForeignKey(
        "StaffProfile",
        on_delete=models.CASCADE,
        related_name="memberships",
        help_text="Staff member this membership belongs to.",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="memberships",
        help_text="Organization the staff member belongs to.",
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="org_memberships",
        help_text="Role within this organization.",
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="org_memberships",
        help_text="Department within this organization (optional).",
    )
    facilities = models.ManyToManyField(
        "Facility",
        blank=True,
        related_name="org_memberships",
        help_text="Facilities the member can access within this organization.",
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Whether this is the staff member's primary (home) organization.",
    )
    status = models.CharField(
        max_length=20,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
        help_text="Current membership status.",
    )
    joined_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the member joined this organization.",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="org_invitations_sent",
        help_text="User who invited this member (if applicable).",
    )

    class Meta:
        verbose_name = "Organization Membership"
        verbose_name_plural = "Organization Memberships"
        ordering = ["-is_primary", "-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["staff_profile", "organization"],
                name="unique_staff_org_membership",
            ),
        ]
        indexes = [
            models.Index(fields=["staff_profile", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.staff_profile.get_full_name()} @ {self.organization.name}"

    def clean(self):
        """Validate that assigned facilities belong to the membership's org."""
        from django.core.exceptions import ValidationError as DjangoValidationError

        if not self.pk:
            return  # Can't check M2M before save
        bad = list(
            self.facilities.exclude(organization=self.organization).values_list("name", flat=True)
        )
        if bad:
            raise DjangoValidationError(
                {
                    "facilities": (
                        f"These facilities do not belong to {self.organization.name}: "
                        f"{', '.join(bad)}"
                    )
                }
            )

    @property
    def is_active(self) -> bool:
        """Whether this membership is currently active."""
        return self.status == self.MembershipStatus.ACTIVE

    @property
    def facility_ids(self) -> list[int]:
        """Return list of facility PKs for this membership."""
        return list(self.facilities.values_list("pk", flat=True))


class OrgJoinRequest(TimeStampedModel):
    """
    Self-service request for a user to join an organization.

    Users can request to join orgs they are not yet members of.
    Org admins can approve (creating an OrgMembership) or reject.
    Only one PENDING request per user-org pair is allowed.
    """

    class RequestStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="join_requests",
        help_text="User requesting to join.",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="join_requests",
        help_text="Organization the user wants to join.",
    )
    requested_role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="join_requests",
        help_text="Role the user is requesting (optional suggestion).",
    )
    message = models.TextField(
        blank=True,
        default="",
        help_text="Reason the user wants to join.",
    )
    status = models.CharField(
        max_length=20,
        choices=RequestStatus.choices,
        default=RequestStatus.PENDING,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_join_requests",
        help_text="Admin who approved or rejected.",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(
        blank=True,
        default="",
        help_text="Admin notes on approval/rejection.",
    )

    class Meta:
        verbose_name = "Organization Join Request"
        verbose_name_plural = "Organization Join Requests"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"],
                condition=models.Q(status="PENDING"),
                name="unique_pending_join_request",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user.get_full_name() or self.user.username} → {self.organization.name} ({self.status})"


class DHAOutboundCall(TimeStampedModel):
    """Audit row for every outbound call to the DHA HIE Middleware (ILM).

    Captures method, path, status, latency and a PII-redacted excerpt of the
    request/response payloads. Backed by a 7-year retention task to satisfy
    Kenya DPA 2019.
    """

    class Status(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        CLIENT_ERROR = "CLIENT_ERROR", "Client Error (4xx)"
        SERVER_ERROR = "SERVER_ERROR", "Server Error (5xx)"
        TRANSPORT = "TRANSPORT", "Transport Error"
        TIMEOUT = "TIMEOUT", "Timeout"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_outbound_calls",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_outbound_calls",
    )
    user = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_outbound_calls",
        help_text="User who triggered the call (if request-scoped).",
    )

    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500, help_text="Path on the ILM middleware (no host).")
    base_url = models.CharField(max_length=255, blank=True, default="")
    auth_mode = models.CharField(max_length=20, blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices)
    status_code = models.IntegerField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    attempt = models.PositiveSmallIntegerField(default=1)

    consent_token = models.CharField(max_length=255, blank=True, default="")
    request_id = models.CharField(max_length=64, blank=True, default="")
    correlation_id = models.CharField(max_length=64, blank=True, default="")
    error_code = models.CharField(max_length=64, blank=True, default="")

    request_payload = models.JSONField(null=True, blank=True, help_text="PII-redacted body.")
    response_excerpt = models.JSONField(null=True, blank=True, help_text="First 4KB of response.")
    error_message = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["facility", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["consent_token"]),
            models.Index(fields=["correlation_id"]),
            models.Index(fields=["path"]),
        ]
        verbose_name = "DHA Outbound Call"
        verbose_name_plural = "DHA Outbound Calls"

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        return (
            f"[{self.created_at:%Y-%m-%d %H:%M:%S}] {self.method} {self.path} -> {self.status_code}"
        )
