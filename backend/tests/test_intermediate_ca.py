"""
Tests for intermediate Certificate Authority support.

Multi-tenant PKI hierarchy:
  Root CA (Vitora production, one per deployment)
    └── Intermediate CA (per facility/tenant)
          └── User Certificate (per clinician)
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework import status

from hmis.apps.core.models import CertificateAuthority, UserCertificate
from hmis.apps.core.services.pki_service import PKIService
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.fixture
def pki_service():
    return PKIService()


@pytest.fixture
def root_ca(db, pki_service):
    """Initialize a root CA for testing."""
    return pki_service.initialize_ca(
        name="Test Root CA",
        org="Nexora Africa Ltd",
        country="KE",
        key_size=2048,
        validity_years=10,
    )


@pytest.fixture
def intermediate_ca(db, pki_service, root_ca):
    """Create an intermediate CA signed by the root."""
    return pki_service.create_intermediate_ca(
        parent_ca=root_ca,
        name="Demo Health Facility CA",
        org="Demo Health Facility",
        country="KE",
        key_size=2048,
        validity_years=5,
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username="pkiadmin_inter",
        email="pkiadmin_inter@example.com",
        password="adminpassword123",
    )


@pytest.fixture
def admin_client(api_client, admin_user, sample_organization, sample_facility):
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=admin_user)
    return api_client


# =============================================================================
# Intermediate CA Creation
# =============================================================================


class TestIntermediateCACreation:
    """Tests for creating intermediate CAs."""

    def test_create_intermediate_ca(self, intermediate_ca, root_ca):
        """Intermediate CA is created with correct parent reference."""
        assert intermediate_ca.is_root is False
        assert intermediate_ca.parent_ca_id == root_ca.pk
        assert intermediate_ca.is_active is True
        assert "Demo Health Facility CA" in intermediate_ca.name

    def test_intermediate_ca_signed_by_root(self, intermediate_ca, root_ca):
        """Intermediate CA certificate is signed by the root CA."""
        from cryptography import x509 as cx509

        cert = cx509.load_pem_x509_certificate(intermediate_ca.certificate_pem.encode())
        # Issuer should be the root CA
        issuer_cn = cert.issuer.get_attributes_for_oid(cx509.oid.NameOID.COMMON_NAME)[0].value
        assert issuer_cn == root_ca.name

    def test_intermediate_ca_has_ca_constraint(self, intermediate_ca):
        """Intermediate CA has BasicConstraints CA:TRUE with path_length=0."""
        from cryptography import x509 as cx509

        cert = cx509.load_pem_x509_certificate(intermediate_ca.certificate_pem.encode())
        bc = cert.extensions.get_extension_for_class(cx509.BasicConstraints)
        assert bc.value.ca is True
        assert bc.value.path_length == 0  # Can sign end-entity certs only

    def test_intermediate_ca_has_key_usage(self, intermediate_ca):
        """Intermediate CA has correct KeyUsage extensions."""
        from cryptography import x509 as cx509

        cert = cx509.load_pem_x509_certificate(intermediate_ca.certificate_pem.encode())
        ku = cert.extensions.get_extension_for_class(cx509.KeyUsage)
        assert ku.value.digital_signature is True
        assert ku.value.key_cert_sign is True
        assert ku.value.crl_sign is True

    def test_intermediate_ca_validity_capped_by_root(self, pki_service, root_ca):
        """Intermediate CA validity cannot exceed root CA validity."""
        # Request 20 years but root only has 10
        inter_ca = pki_service.create_intermediate_ca(
            parent_ca=root_ca,
            name="Long Lived Intermediate",
            validity_years=20,
        )
        assert inter_ca.valid_to <= root_ca.valid_to

    def test_intermediate_ca_subject_dn(self, intermediate_ca):
        """Intermediate CA has correct subject DN."""
        assert "Demo Health Facility CA" in intermediate_ca.subject_dn
        assert "KE" in intermediate_ca.subject_dn

    def test_cannot_create_intermediate_from_expired_root(self, pki_service, root_ca):
        """Cannot create intermediate CA from an expired root."""
        from datetime import timedelta

        from django.utils import timezone

        CertificateAuthority.objects.filter(pk=root_ca.pk).update(
            valid_to=timezone.now() - timedelta(days=1)
        )
        root_ca.refresh_from_db()

        with pytest.raises(ValueError, match="expired"):
            pki_service.create_intermediate_ca(
                parent_ca=root_ca,
                name="Should Fail",
            )

    def test_cannot_create_intermediate_from_inactive_root(self, pki_service, root_ca):
        """Cannot create intermediate CA from an inactive root."""
        CertificateAuthority.objects.filter(pk=root_ca.pk).update(is_active=False)
        root_ca.refresh_from_db()

        with pytest.raises(ValueError, match="not active"):
            pki_service.create_intermediate_ca(
                parent_ca=root_ca,
                name="Should Fail",
            )


# =============================================================================
# User Certificates from Intermediate CA
# =============================================================================


class TestUserCertFromIntermediateCA:
    """Tests for issuing user certificates from intermediate CAs."""

    def test_issue_cert_from_intermediate(self, pki_service, intermediate_ca, test_user):
        """Can issue user certificates from an intermediate CA."""
        cert = pki_service.issue_user_certificate(
            user=test_user,
            ca=intermediate_ca,
            validity_years=2,
        )
        assert cert.certificate_authority_id == intermediate_ca.pk

    def test_default_ca_prefers_intermediate(
        self, pki_service, root_ca, intermediate_ca, test_user
    ):
        """When no CA specified, prefer an active intermediate CA over root."""
        cert = pki_service.issue_user_certificate(
            user=test_user,
            validity_years=2,
        )
        # Should use intermediate CA, not root
        assert cert.certificate_authority_id == intermediate_ca.pk

    def test_falls_back_to_root_when_no_intermediate(self, pki_service, root_ca, test_user):
        """When no intermediate CA exists, falls back to root CA."""
        cert = pki_service.issue_user_certificate(
            user=test_user,
            validity_years=2,
        )
        assert cert.certificate_authority_id == root_ca.pk

    def test_user_cert_issuer_is_intermediate(self, pki_service, intermediate_ca, test_user):
        """User cert issuer DN references the intermediate CA."""
        from cryptography import x509 as cx509

        cert = pki_service.issue_user_certificate(
            user=test_user,
            ca=intermediate_ca,
            validity_years=1,
        )
        x509_cert = cx509.load_pem_x509_certificate(cert.certificate_pem.encode())
        issuer_cn = x509_cert.issuer.get_attributes_for_oid(cx509.oid.NameOID.COMMON_NAME)[0].value
        assert issuer_cn == intermediate_ca.name


# =============================================================================
# Chain Verification
# =============================================================================


class TestChainVerification:
    """Tests for certificate chain verification."""

    def test_verify_cert_with_intermediate_ca(self, pki_service, intermediate_ca, test_user):
        """Valid cert from intermediate CA passes verification."""
        cert = pki_service.issue_user_certificate(
            user=test_user,
            ca=intermediate_ca,
        )
        result = pki_service.verify_certificate(cert)
        assert result.valid is True
        assert len(result.chain) == 3  # user_cert -> intermediate -> root

    def test_verify_fails_when_intermediate_expired(self, pki_service, intermediate_ca, test_user):
        """Verification fails if the intermediate CA has expired."""
        from datetime import timedelta

        from django.utils import timezone

        cert = pki_service.issue_user_certificate(
            user=test_user,
            ca=intermediate_ca,
        )
        # Expire the intermediate
        CertificateAuthority.objects.filter(pk=intermediate_ca.pk).update(
            valid_to=timezone.now() - timedelta(days=1)
        )
        intermediate_ca.refresh_from_db()

        result = pki_service.verify_certificate(cert)
        assert result.valid is False
        assert any("intermediate" in e.lower() or "expired" in e.lower() for e in result.errors)

    def test_verify_fails_when_root_inactive(
        self, pki_service, root_ca, intermediate_ca, test_user
    ):
        """Verification fails if the root CA is inactive."""
        cert = pki_service.issue_user_certificate(
            user=test_user,
            ca=intermediate_ca,
        )
        CertificateAuthority.objects.filter(pk=root_ca.pk).update(is_active=False)
        root_ca.refresh_from_db()

        result = pki_service.verify_certificate(cert)
        assert result.valid is False
        assert any("root" in e.lower() for e in result.errors)

    def test_chain_for_root_issued_cert(self, pki_service, root_ca, test_user):
        """Cert issued directly by root CA has a 2-element chain."""
        cert = pki_service.issue_user_certificate(
            user=test_user,
            ca=root_ca,
        )
        result = pki_service.verify_certificate(cert)
        assert result.valid is True
        assert len(result.chain) == 2  # user_cert -> root


# =============================================================================
# Management Command
# =============================================================================


class TestIntermediateCACommand:
    """Tests for init_pki_intermediate_ca management command."""

    def test_command_creates_intermediate(self, root_ca):
        """Command creates an intermediate CA."""
        call_command(
            "init_pki_intermediate_ca",
            name="Cmd Test Facility CA",
            org="Cmd Test Facility",
        )
        inter = CertificateAuthority.objects.filter(
            is_root=False, is_active=True, name="Cmd Test Facility CA"
        )
        assert inter.exists()
        assert inter.first().parent_ca_id == root_ca.pk

    def test_command_idempotent(self, root_ca):
        """Running the command twice with same name doesn't duplicate."""
        call_command("init_pki_intermediate_ca", name="Idempotent CA")
        call_command("init_pki_intermediate_ca", name="Idempotent CA")
        count = CertificateAuthority.objects.filter(name="Idempotent CA", is_active=True).count()
        assert count == 1

    def test_command_fails_without_root(self, db):
        """Command fails gracefully if no root CA exists."""
        from django.core.management.base import CommandError

        with pytest.raises(CommandError, match="root CA"):
            call_command("init_pki_intermediate_ca", name="No Root")


# =============================================================================
# API Endpoints
# =============================================================================


class TestIntermediateCAAPI:
    """Tests for intermediate CA API endpoints."""

    def test_list_cas_includes_intermediate(self, admin_client, root_ca, intermediate_ca):
        """CA list endpoint returns both root and intermediate CAs."""
        response = admin_client.get("/api/core/certificates/ca/")
        assert response.status_code == status.HTTP_200_OK
        names = [ca["name"] for ca in response.data]
        assert root_ca.name in names
        assert intermediate_ca.name in names

    def test_ca_serializer_includes_parent(self, admin_client, intermediate_ca):
        """CA serializer includes parent_ca and ca_type fields."""
        response = admin_client.get("/api/core/certificates/ca/")
        inter_data = next(ca for ca in response.data if ca["id"] == intermediate_ca.pk)
        assert inter_data["parent_ca"] == intermediate_ca.parent_ca_id
        assert inter_data["ca_type"] == "intermediate"

    def test_create_intermediate_via_api(self, admin_client, root_ca):
        """Admin can create an intermediate CA via API."""
        response = admin_client.post(
            "/api/core/certificates/create_intermediate/",
            {
                "name": "API Test Facility CA",
                "org": "API Test Facility",
                "validity_years": 5,
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_root"] is False
        assert response.data["parent_ca"] == root_ca.pk

    def test_create_intermediate_non_admin_rejected(self, authenticated_client, root_ca):
        """Non-admin users cannot create intermediate CAs."""
        response = authenticated_client.post(
            "/api/core/certificates/create_intermediate/",
            {"name": "Should Fail CA"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_issue_cert_via_api_uses_intermediate(
        self, admin_client, root_ca, intermediate_ca, test_user
    ):
        """Issuing cert via API uses the intermediate CA by default."""
        response = admin_client.post(
            "/api/core/certificates/issue/",
            {"user_id": test_user.pk, "validity_years": 1},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["ca_name"] == intermediate_ca.name
