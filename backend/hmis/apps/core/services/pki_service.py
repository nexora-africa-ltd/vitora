"""
PKI Service — X.509 Certificate Authority and Certificate Management.

Manages the full lifecycle of X.509 certificates for document signing:
- Root CA initialization (self-signed)
- User certificate issuance (signed by CA)
- Certificate revocation and CRL generation
- Certificate verification (validity, expiry, revocation, chain)

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

logger = logging.getLogger(__name__)


@dataclass
class CertificateVerifyResult:
    """Result of a certificate verification."""

    valid: bool
    certificate_id: int | None = None
    subject: str = ""
    issuer: str = ""
    serial_number: str = ""
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    is_expired: bool = False
    is_revoked: bool = False
    ca_active: bool = True
    errors: list[str] | None = None
    chain: list[str] | None = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.chain is None:
            self.chain = []


class PKIService:
    """Service for X.509 PKI operations."""

    def initialize_ca(
        self,
        name: str = "Vitora HMIS Root CA",
        org: str = "Nexora Africa Ltd",
        country: str = "KE",
        key_size: int = 2048,
        validity_years: int = 10,
    ):
        """
        Initialize a root Certificate Authority.

        Generates an RSA key pair, creates a self-signed X.509 certificate,
        and stores the CA with the private key encrypted via KMS.

        Args:
            name: CA common name.
            org: Organization name.
            country: ISO country code.
            key_size: RSA key size in bits.
            validity_years: CA certificate validity in years.

        Returns:
            CertificateAuthority instance.
        """
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.core.models import CertificateAuthority

        # Check if an active root CA already exists
        existing = CertificateAuthority.objects.filter(is_root=True, is_active=True).first()
        if existing:
            logger.info(f"Active root CA already exists: {existing.name}")
            return existing

        # Generate RSA key pair
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size,
        )
        public_key = private_key.public_key()

        # Build subject DN
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, country),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, org),
            x509.NameAttribute(NameOID.COMMON_NAME, name),
        ])

        serial = int(uuid.uuid4().hex[:16], 16)
        now = datetime.now(UTC)
        valid_to = now + timedelta(days=validity_years * 365)

        # Build self-signed certificate
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(public_key)
            .serial_number(serial)
            .not_valid_before(now)
            .not_valid_after(valid_to)
            .add_extension(
                x509.BasicConstraints(ca=True, path_length=None),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_cert_sign=True,
                    crl_sign=True,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(private_key, hashes.SHA256())
        )

        # Serialize keys
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_key_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        cert_pem = cert.public_bytes(serialization.Encoding.PEM)

        # Encrypt private key with KMS
        kms = get_kms_provider()
        encrypted_private_key = kms.encrypt(
            private_key_pem,
            context={"purpose": "ca_private_key", "ca_name": name},
        )

        subject_dn = f"CN={name}, O={org}, C={country}"

        ca = CertificateAuthority.objects.create(
            name=name,
            serial_number=format(serial, "x"),
            subject_dn=subject_dn,
            public_key_pem=public_key_pem.decode(),
            private_key_pem_encrypted=encrypted_private_key.decode("latin-1"),
            certificate_pem=cert_pem.decode(),
            valid_from=now,
            valid_to=valid_to,
            is_root=True,
            is_active=True,
            key_size=key_size,
        )

        logger.info(f"Root CA initialized: {ca.name} (serial: {ca.serial_number})")
        return ca

    def create_intermediate_ca(
        self,
        parent_ca,
        name: str = "Facility Intermediate CA",
        org: str = "Health Facility",
        country: str = "KE",
        key_size: int = 2048,
        validity_years: int = 5,
    ):
        """
        Create an intermediate CA signed by a parent CA.

        Used in multi-tenant deployments where each facility gets its own
        intermediate CA for issuing user certificates, while all chain
        back to the Vitora root CA.

        Args:
            parent_ca: Parent CertificateAuthority (root or another intermediate).
            name: Intermediate CA common name.
            org: Organization name (typically the facility name).
            country: ISO country code.
            key_size: RSA key size in bits.
            validity_years: CA certificate validity in years.

        Returns:
            CertificateAuthority instance.

        Raises:
            ValueError: If parent CA is expired or inactive.
        """
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.core.models import CertificateAuthority

        if parent_ca.is_expired:
            raise ValueError(f"Parent CA '{parent_ca.name}' has expired.")

        if not parent_ca.is_active:
            raise ValueError(f"Parent CA '{parent_ca.name}' is not active.")

        # Idempotent: check if an active intermediate with this name already exists
        existing = CertificateAuthority.objects.filter(
            name=name, is_root=False, is_active=True
        ).first()
        if existing:
            logger.info(f"Active intermediate CA already exists: {existing.name}")
            return existing

        # Cap validity to not exceed parent
        now = datetime.now(UTC)
        max_valid_to = parent_ca.valid_to.replace(tzinfo=UTC) if parent_ca.valid_to.tzinfo is None else parent_ca.valid_to
        requested_valid_to = now + timedelta(days=validity_years * 365)
        valid_to = min(requested_valid_to, max_valid_to)

        # Generate RSA key pair
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size,
        )
        public_key = private_key.public_key()

        # Build subject DN
        subject = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, country),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, org),
            x509.NameAttribute(NameOID.COMMON_NAME, name),
        ])

        # Issuer is the parent CA
        parent_org = (
            parent_ca.subject_dn.split("O=")[1].split(",")[0].strip()
            if "O=" in parent_ca.subject_dn
            else "Nexora Africa Ltd"
        )
        issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, country),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, parent_org),
            x509.NameAttribute(NameOID.COMMON_NAME, parent_ca.name),
        ])

        # Load parent CA private key to sign
        kms = get_kms_provider()
        parent_private_key_pem = kms.decrypt(
            parent_ca.private_key_pem_encrypted.encode("latin-1"),
            context={"purpose": "sign_intermediate_ca", "ca_name": name},
        )
        parent_private_key = serialization.load_pem_private_key(
            parent_private_key_pem, password=None
        )

        serial = int(uuid.uuid4().hex[:16], 16)

        # Build intermediate CA certificate (path_length=0: can only sign end-entity)
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(public_key)
            .serial_number(serial)
            .not_valid_before(now)
            .not_valid_after(valid_to)
            .add_extension(
                x509.BasicConstraints(ca=True, path_length=0),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_cert_sign=True,
                    crl_sign=True,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(parent_private_key, hashes.SHA256())
        )

        # Serialize keys
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_key_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        cert_pem = cert.public_bytes(serialization.Encoding.PEM)

        # Encrypt private key with KMS
        encrypted_private_key = kms.encrypt(
            private_key_pem,
            context={"purpose": "ca_private_key", "ca_name": name},
        )

        subject_dn = f"CN={name}, O={org}, C={country}"

        ca = CertificateAuthority.objects.create(
            name=name,
            serial_number=format(serial, "x"),
            subject_dn=subject_dn,
            public_key_pem=public_key_pem.decode(),
            private_key_pem_encrypted=encrypted_private_key.decode("latin-1"),
            certificate_pem=cert_pem.decode(),
            valid_from=now,
            valid_to=valid_to,
            is_root=False,
            parent_ca=parent_ca,
            is_active=True,
            key_size=key_size,
        )

        logger.info(
            f"Intermediate CA initialized: {ca.name} "
            f"(serial: {ca.serial_number}, parent: {parent_ca.name})"
        )
        return ca

    def issue_user_certificate(
        self,
        user,
        ca=None,
        validity_years: int = 2,
    ):
        """
        Issue an X.509 certificate for a user.

        Generates an RSA key pair, creates a CSR, signs it with the CA,
        and stores the certificate with encrypted private key.

        Args:
            user: Django User instance.
            ca: CertificateAuthority to use. Defaults to active root CA.
            validity_years: Certificate validity in years.

        Returns:
            UserCertificate instance.

        Raises:
            ValueError: If no active CA exists or CA is expired.
        """
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.core.models import CertificateAuthority, UserCertificate

        if ca is None:
            # Prefer an active intermediate CA over root for user cert issuance
            ca = CertificateAuthority.objects.filter(
                is_root=False, is_active=True
            ).first()
            if ca is None:
                ca = CertificateAuthority.objects.filter(
                    is_root=True, is_active=True
                ).first()
            if ca is None:
                raise ValueError("No active CA found. Run 'init_pki_ca' first.")

        if ca.is_expired:
            raise ValueError(f"CA '{ca.name}' has expired.")

        # Generate user key pair
        user_private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=ca.key_size,
        )
        user_public_key = user_private_key.public_key()

        # Load CA private key
        kms = get_kms_provider()
        ca_private_key_pem = kms.decrypt(
            ca.private_key_pem_encrypted.encode("latin-1"),
            context={"purpose": "sign_user_cert", "user": user.username},
        )
        ca_private_key = serialization.load_pem_private_key(
            ca_private_key_pem, password=None
        )

        # Build certificate
        full_name = user.get_full_name().strip() or user.username
        subject = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "KE"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Vitora HMIS"),
            x509.NameAttribute(NameOID.COMMON_NAME, full_name),
            x509.NameAttribute(NameOID.EMAIL_ADDRESS, user.email or f"{user.username}@vitora.health"),
        ])

        issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "KE"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, ca.subject_dn.split("O=")[1].split(",")[0].strip() if "O=" in ca.subject_dn else "Nexora Africa Ltd"),
            x509.NameAttribute(NameOID.COMMON_NAME, ca.name),
        ])

        serial = int(uuid.uuid4().hex[:16], 16)
        now = datetime.now(UTC)
        valid_to = now + timedelta(days=validity_years * 365)

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(user_public_key)
            .serial_number(serial)
            .not_valid_before(now)
            .not_valid_after(valid_to)
            .add_extension(
                x509.BasicConstraints(ca=False, path_length=None),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=True,  # Non-repudiation
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(ca_private_key, hashes.SHA256())
        )

        # Serialize
        user_private_pem = user_private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        user_public_pem = user_public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        cert_pem = cert.public_bytes(serialization.Encoding.PEM)

        # Encrypt user private key
        encrypted_user_key = kms.encrypt(
            user_private_pem,
            context={"purpose": "user_private_key", "user": user.username},
        )

        subject_dn = f"CN={full_name}, O=Vitora HMIS, C=KE"

        user_cert = UserCertificate.objects.create(
            user=user,
            certificate_authority=ca,
            serial_number=format(serial, "x"),
            subject_dn=subject_dn,
            public_key_pem=user_public_pem.decode(),
            private_key_pem_encrypted=encrypted_user_key.decode("latin-1"),
            certificate_pem=cert_pem.decode(),
            valid_from=now,
            valid_to=valid_to,
        )

        logger.info(f"User certificate issued: {user.username} (serial: {user_cert.serial_number})")
        return user_cert

    def revoke_certificate(self, cert, reason: str, user=None):
        """
        Revoke a user certificate.

        Args:
            cert: UserCertificate to revoke.
            reason: Revocation reason (from RevocationReason choices).
            user: User performing the revocation.

        Returns:
            CertificateRevocation instance.
        """
        from django.utils import timezone as dj_tz

        from hmis.apps.core.models import CertificateRevocation

        now = dj_tz.now()
        cert.is_revoked = True
        cert.revoked_at = now
        cert.revocation_reason = reason
        cert.save(update_fields=["is_revoked", "revoked_at", "revocation_reason", "updated_at"])

        revocation = CertificateRevocation.objects.create(
            certificate=cert,
            revoked_at=now,
            reason=reason,
            revoked_by=user,
        )

        logger.info(f"Certificate revoked: {cert.serial_number} (reason: {reason})")
        return revocation

    def _build_chain(self, ca) -> list[str]:
        """
        Build the CA chain from the issuing CA up to the root.

        Returns a list of CA subject DNs from immediate issuer to root.
        """
        chain = []
        current = ca
        seen = set()  # Prevent infinite loops
        while current and current.pk not in seen:
            chain.append(current.subject_dn)
            seen.add(current.pk)
            current = current.parent_ca
        return chain

    def _validate_chain(self, ca) -> list[str]:
        """
        Walk the CA chain and collect errors for any broken link.

        Returns list of error strings (empty if chain is healthy).
        """
        errors = []
        current = ca
        seen = set()
        while current and current.pk not in seen:
            seen.add(current.pk)
            label = "Root CA" if current.is_root else f"Intermediate CA '{current.name}'"
            if not current.is_active:
                errors.append(f"{label} is no longer active")
            if current.is_expired:
                errors.append(f"{label} certificate has expired")
            current = current.parent_ca
        return errors

    def verify_certificate(self, cert) -> CertificateVerifyResult:
        """
        Verify a certificate's validity.

        Checks expiry, revocation status, and full CA chain (intermediate → root).

        Args:
            cert: UserCertificate to verify.

        Returns:
            CertificateVerifyResult with details and chain info.
        """
        errors = []

        if cert.is_expired:
            errors.append("Certificate has expired")
        if cert.is_revoked:
            errors.append(f"Certificate is revoked (reason: {cert.revocation_reason})")

        # Validate entire CA chain (intermediate → root)
        chain_errors = self._validate_chain(cert.certificate_authority)
        errors.extend(chain_errors)

        # Build full chain: user cert → intermediate(s) → root
        ca_chain = self._build_chain(cert.certificate_authority)
        full_chain = [cert.subject_dn] + ca_chain

        return CertificateVerifyResult(
            valid=len(errors) == 0,
            certificate_id=cert.id,
            subject=cert.subject_dn,
            issuer=cert.certificate_authority.subject_dn,
            serial_number=cert.serial_number,
            valid_from=cert.valid_from,
            valid_to=cert.valid_to,
            is_expired=cert.is_expired,
            is_revoked=cert.is_revoked,
            ca_active=cert.certificate_authority.is_active,
            errors=errors,
            chain=full_chain,
        )

    def get_crl(self, ca) -> bytes:
        """
        Generate an X.509 CRL (Certificate Revocation List) in DER format.

        Args:
            ca: CertificateAuthority to generate CRL for.

        Returns:
            DER-encoded CRL bytes.
        """
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.core.models import CertificateRevocation

        # Load CA private key
        kms = get_kms_provider()
        ca_private_key_pem = kms.decrypt(
            ca.private_key_pem_encrypted.encode("latin-1"),
            context={"purpose": "generate_crl", "ca_name": ca.name},
        )
        ca_private_key = serialization.load_pem_private_key(
            ca_private_key_pem, password=None
        )

        issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, ca.name),
        ])

        now = datetime.now(UTC)
        builder = (
            x509.CertificateRevocationListBuilder()
            .issuer_name(issuer)
            .last_update(now)
            .next_update(now + timedelta(days=7))
        )

        # Add revoked certificates
        revocations = CertificateRevocation.objects.filter(
            certificate__certificate_authority=ca,
        ).select_related("certificate")

        for rev in revocations:
            revoked_cert = (
                x509.RevokedCertificateBuilder()
                .serial_number(int(rev.certificate.serial_number, 16))
                .revocation_date(rev.revoked_at)
                .build()
            )
            builder = builder.add_revoked_certificate(revoked_cert)

        crl = builder.sign(ca_private_key, hashes.SHA256())
        return crl.public_bytes(serialization.Encoding.DER)

    def renew_certificate(self, cert, user=None, validity_years: int = 2):
        """
        Renew a certificate by revoking the old one and issuing a new one.

        Args:
            cert: UserCertificate to renew.
            user: User requesting renewal.
            validity_years: New certificate validity.

        Returns:
            New UserCertificate instance.
        """
        self.revoke_certificate(cert, reason="SUPERSEDED", user=user)
        return self.issue_user_certificate(
            user=cert.user,
            ca=cert.certificate_authority,
            validity_years=validity_years,
        )
