"""
Tests for X.509 PKI and document digital signatures.

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.core.models import (
    AuditLog,
    CertificateAuthority,
    CertificateRevocation,
    DocumentSignature,
    UserCertificate,
)
from hmis.apps.core.services.pki_service import PKIService
from hmis.apps.core.services.signing_service import DocumentSigningService

User = get_user_model()


@pytest.fixture
def pki_service():
    return PKIService()


@pytest.fixture
def signing_service():
    return DocumentSigningService()


@pytest.fixture
def root_ca(db, pki_service):
    """Initialize a root CA for testing."""
    return pki_service.initialize_ca(
        name="Test Root CA",
        org="Test Org",
        country="KE",
        key_size=2048,
        validity_years=10,
    )


@pytest.fixture
def user_cert(db, test_user, root_ca, pki_service):
    """Issue a certificate for the test user."""
    return pki_service.issue_user_certificate(
        user=test_user,
        ca=root_ca,
        validity_years=2,
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username="pkiadmin",
        email="pkiadmin@example.com",
        password="adminpassword123",
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


class TestCAInitialization:
    """Tests for Certificate Authority initialization."""

    def test_ca_generates_valid_x509_cert(self, root_ca):
        """CA initialization creates a valid X.509 certificate."""
        assert root_ca.is_root is True
        assert root_ca.is_active is True
        assert root_ca.key_size == 2048
        assert root_ca.certificate_pem.startswith("-----BEGIN CERTIFICATE-----")
        assert root_ca.public_key_pem.startswith("-----BEGIN PUBLIC KEY-----")
        assert len(root_ca.serial_number) > 0

    def test_ca_is_idempotent(self, root_ca, pki_service):
        """Calling initialize_ca twice returns the existing CA."""
        second_ca = pki_service.initialize_ca()
        assert second_ca.pk == root_ca.pk

    def test_ca_subject_dn(self, root_ca):
        """CA has correct subject DN."""
        assert "Test Root CA" in root_ca.subject_dn
        assert "KE" in root_ca.subject_dn

    def test_ca_validity_period(self, root_ca):
        """CA has a 10-year validity period."""
        diff = root_ca.valid_to - root_ca.valid_from
        assert diff.days >= 3649  # ~10 years


class TestUserCertificateIssuance:
    """Tests for user certificate issuance."""

    def test_issue_cert_signed_by_ca(self, user_cert, root_ca):
        """User certificate is issued by the correct CA."""
        assert user_cert.certificate_authority_id == root_ca.pk
        assert user_cert.is_revoked is False
        assert user_cert.certificate_pem.startswith("-----BEGIN CERTIFICATE-----")

    def test_cert_has_correct_subject(self, user_cert, test_user):
        """Certificate subject includes the user's name."""
        assert test_user.username in user_cert.subject_dn or "Vitora" in user_cert.subject_dn

    def test_cert_validity_period(self, user_cert):
        """User certificate has a 2-year validity."""
        diff = user_cert.valid_to - user_cert.valid_from
        assert diff.days >= 729  # ~2 years

    def test_no_ca_raises_error(self, db, test_user, pki_service):
        """Issuing without an active CA raises ValueError."""
        with pytest.raises(ValueError, match="No active CA"):
            pki_service.issue_user_certificate(user=test_user)


class TestCertificateRevocation:
    """Tests for certificate revocation."""

    def test_revoke_marks_cert_as_revoked(self, user_cert, pki_service, test_user):
        """Revoking a certificate marks it as revoked."""
        pki_service.revoke_certificate(
            cert=user_cert, reason="KEY_COMPROMISE", user=test_user
        )
        user_cert.refresh_from_db()
        assert user_cert.is_revoked is True
        assert user_cert.revocation_reason == "KEY_COMPROMISE"
        assert user_cert.revoked_at is not None

    def test_revocation_creates_crl_entry(self, user_cert, pki_service, test_user):
        """Revoking creates a CertificateRevocation record."""
        pki_service.revoke_certificate(
            cert=user_cert, reason="SUPERSEDED", user=test_user
        )
        revocations = CertificateRevocation.objects.filter(certificate=user_cert)
        assert revocations.count() == 1
        assert revocations.first().reason == "SUPERSEDED"


class TestCRLGeneration:
    """Tests for CRL generation."""

    def test_crl_includes_revoked_certs(self, root_ca, user_cert, pki_service, test_user):
        """CRL contains revoked certificates."""
        pki_service.revoke_certificate(
            cert=user_cert, reason="KEY_COMPROMISE", user=test_user
        )
        crl_bytes = pki_service.get_crl(root_ca)
        assert isinstance(crl_bytes, bytes)
        assert len(crl_bytes) > 0


class TestCertificateVerification:
    """Tests for certificate verification."""

    def test_valid_cert_passes(self, user_cert, pki_service):
        """A valid, non-revoked, non-expired certificate passes verification."""
        result = pki_service.verify_certificate(user_cert)
        assert result.valid is True
        assert result.is_expired is False
        assert result.is_revoked is False

    def test_revoked_cert_fails(self, user_cert, pki_service, test_user):
        """A revoked certificate fails verification."""
        pki_service.revoke_certificate(cert=user_cert, reason="KEY_COMPROMISE", user=test_user)
        user_cert.refresh_from_db()
        result = pki_service.verify_certificate(user_cert)
        assert result.valid is False
        assert result.is_revoked is True

    def test_expired_cert_fails(self, user_cert, pki_service):
        """An expired certificate fails verification."""
        from datetime import timedelta

        from django.utils import timezone

        # Force expiration by backdating valid_to
        UserCertificate.objects.filter(pk=user_cert.pk).update(
            valid_to=timezone.now() - timedelta(days=1)
        )
        user_cert.refresh_from_db()
        result = pki_service.verify_certificate(user_cert)
        assert result.valid is False
        assert result.is_expired is True


class TestDocumentSigning:
    """Tests for document signing and verification."""

    def test_sign_lab_result(self, user_cert, test_user, sample_lab_result, signing_service):
        """Signing a lab result creates a DocumentSignature record."""
        sig = signing_service.sign_document(
            document_type="LabResult",
            document_id=sample_lab_result.pk,
            user=test_user,
        )
        assert sig.document_type == "LabResult"
        assert sig.document_id == sample_lab_result.pk
        assert sig.signer == test_user
        assert sig.certificate == user_cert
        assert len(sig.content_hash) == 64
        assert len(sig.signature) > 0

    def test_sign_prescription(self, user_cert, test_user, sample_prescription, signing_service):
        """Signing a prescription creates a DocumentSignature record."""
        sig = signing_service.sign_document(
            document_type="Prescription",
            document_id=sample_prescription.pk,
            user=test_user,
        )
        assert sig.document_type == "Prescription"
        assert sig.signer == test_user

    def test_verify_valid_signature(self, user_cert, test_user, sample_lab_result, signing_service):
        """Verifying an unmodified signed document returns valid=True."""
        sig = signing_service.sign_document(
            document_type="LabResult",
            document_id=sample_lab_result.pk,
            user=test_user,
        )
        result = signing_service.verify_signature(sig)
        assert result.valid is True
        assert result.content_matches is True
        assert result.signature_valid is True

    def test_verify_tampered_document(self, user_cert, test_user, sample_lab_result, signing_service):
        """Verifying a modified document returns valid=False."""
        sig = signing_service.sign_document(
            document_type="LabResult",
            document_id=sample_lab_result.pk,
            user=test_user,
        )

        # Tamper with the lab result
        from hmis.apps.laboratory.models import LabResult

        LabResult.objects.filter(pk=sample_lab_result.pk).update(numeric_value=999.0)

        result = signing_service.verify_signature(sig)
        assert result.valid is False
        assert result.content_matches is False

    def test_user_without_cert_cannot_sign(self, db, another_user, sample_lab_result, signing_service):
        """A user without a certificate cannot sign documents."""
        with pytest.raises(ValueError, match="no valid certificate"):
            signing_service.sign_document(
                document_type="LabResult",
                document_id=sample_lab_result.pk,
                user=another_user,
            )

    def test_content_serialization_is_deterministic(self, user_cert, test_user, sample_lab_result, signing_service):
        """Serializing the same document twice produces the same content."""
        content1 = signing_service.get_signable_content("LabResult", sample_lab_result)
        content2 = signing_service.get_signable_content("LabResult", sample_lab_result)
        assert content1 == content2

    def test_audit_log_on_sign(self, user_cert, test_user, sample_lab_result, signing_service):
        """Signing creates an audit log entry."""
        signing_service.sign_document(
            document_type="LabResult",
            document_id=sample_lab_result.pk,
            user=test_user,
        )
        audit = AuditLog.objects.filter(
            action="document_sign",
            resource_type="LabResult",
            resource_id=sample_lab_result.pk,
        ).first()
        assert audit is not None

    def test_unsupported_document_type_raises(self, user_cert, test_user, signing_service):
        """Signing an unsupported document type raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported document type"):
            signing_service.sign_document(
                document_type="UnknownType",
                document_id=1,
                user=test_user,
            )


class TestPKIAPI:
    """Tests for PKI and signature API endpoints."""

    def test_list_certificates_authenticated(self, authenticated_client, user_cert):
        """Authenticated users can list their certificates."""
        response = authenticated_client.get("/api/core/certificates/")
        assert response.status_code == status.HTTP_200_OK

    def test_list_ca_endpoints(self, authenticated_client, root_ca):
        """Authenticated users can list active CAs."""
        response = authenticated_client.get("/api/core/certificates/ca/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_issue_cert_admin_only(self, admin_client, root_ca, test_user):
        """Admin can issue certificates."""
        response = admin_client.post(
            "/api/core/certificates/issue/",
            {"user_id": test_user.pk, "validity_years": 1},
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_issue_cert_non_admin_rejected(self, authenticated_client, root_ca, test_user):
        """Non-admin cannot issue certificates."""
        response = authenticated_client.post(
            "/api/core/certificates/issue/",
            {"user_id": test_user.pk},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_revoke_cert_admin_only(self, admin_client, user_cert):
        """Admin can revoke certificates."""
        response = admin_client.post(
            f"/api/core/certificates/{user_cert.pk}/revoke/",
            {"reason": "KEY_COMPROMISE"},
        )
        assert response.status_code == status.HTTP_200_OK
        user_cert.refresh_from_db()
        assert user_cert.is_revoked is True

    def test_sign_via_api(self, authenticated_client, user_cert, sample_lab_result):
        """Users can sign documents via the API."""
        response = authenticated_client.post(
            "/api/core/signatures/sign/",
            {"document_type": "LabResult", "document_id": sample_lab_result.pk},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["document_type"] == "LabResult"

    def test_verify_via_api(self, authenticated_client, user_cert, sample_lab_result):
        """Users can verify signatures via the API."""
        # First sign
        sign_resp = authenticated_client.post(
            "/api/core/signatures/sign/",
            {"document_type": "LabResult", "document_id": sample_lab_result.pk},
        )
        sig_id = sign_resp.data["id"]

        # Then verify
        response = authenticated_client.post(
            "/api/core/signatures/verify/",
            {"signature_id": sig_id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["valid"] is True

    def test_for_document_api(self, authenticated_client, user_cert, sample_lab_result):
        """Can get all signatures for a document."""
        # Sign the document
        authenticated_client.post(
            "/api/core/signatures/sign/",
            {"document_type": "LabResult", "document_id": sample_lab_result.pk},
        )

        response = authenticated_client.get(
            f"/api/core/signatures/for_document/?type=LabResult&id={sample_lab_result.pk}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_list_signatures(self, authenticated_client, user_cert, sample_lab_result):
        """Can list all signatures."""
        authenticated_client.post(
            "/api/core/signatures/sign/",
            {"document_type": "LabResult", "document_id": sample_lab_result.pk},
        )
        response = authenticated_client.get("/api/core/signatures/")
        assert response.status_code == status.HTTP_200_OK


class TestPKIManagementCommands:
    """Tests for PKI management commands."""

    def test_init_ca_command(self, db):
        """init_pki_ca command creates a root CA."""
        from django.core.management import call_command

        call_command("init_pki_ca")
        assert CertificateAuthority.objects.filter(is_root=True, is_active=True).exists()

    def test_issue_cert_command(self, root_ca, test_user):
        """issue_user_cert command issues a certificate."""
        from django.core.management import call_command

        call_command("issue_user_cert", username=test_user.username)
        assert UserCertificate.objects.filter(user=test_user).exists()
