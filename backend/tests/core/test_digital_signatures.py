"""
Tests for X.509 PKI and document digital signatures.

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from hmis.apps.billing.models import (
    CreditNote,
    Invoice,
    Payment,
    Receipt,
    SHAClaim,
    SHAClaimAttachment,
    SHAMember,
)
from hmis.apps.core.models import (
    AuditLog,
    CertificateAuthority,
    CertificateRevocation,
    DocumentSignature,
    UserCertificate,
)
from hmis.apps.core.services.pki_service import PKIService
from hmis.apps.core.services.signing_service import DocumentSigningService
from tests.conftest import ensure_staff_profile

User = get_user_model()


def _create_sha_claim_attachment(sample_patient, sample_encounter, test_user):
    sha_member = SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-CORE-ATT-0001",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        eligibility_valid_until=date.today() + timedelta(days=30),
        created_by=test_user,
    )
    claim = SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        claim_type="outpatient",
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="Acute upper respiratory infection",
        facility_code="MFL-12345",
        facility_level="L3",
        created_by=test_user,
    )
    content = b"%PDF-1.4 core-signing-attachment"
    return SHAClaimAttachment.objects.create(
        claim=claim,
        attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES,
        name="Clinical Notes",
        description="Read-only SHA attachment",
        file=SimpleUploadedFile(
            name="clinical_notes.pdf",
            content=content,
            content_type="application/pdf",
        ),
        file_size=len(content),
        mime_type="application/pdf",
        checksum="",
        original_filename="clinical_notes.pdf",
        uploaded_by=test_user,
    )


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
def admin_client(api_client, admin_user, sample_organization, sample_facility):
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
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
        pki_service.revoke_certificate(cert=user_cert, reason="KEY_COMPROMISE", user=test_user)
        user_cert.refresh_from_db()
        assert user_cert.is_revoked is True
        assert user_cert.revocation_reason == "KEY_COMPROMISE"
        assert user_cert.revoked_at is not None

    def test_revocation_creates_crl_entry(self, user_cert, pki_service, test_user):
        """Revoking creates a CertificateRevocation record."""
        pki_service.revoke_certificate(cert=user_cert, reason="SUPERSEDED", user=test_user)
        revocations = CertificateRevocation.objects.filter(certificate=user_cert)
        assert revocations.count() == 1
        assert revocations.first().reason == "SUPERSEDED"


class TestCRLGeneration:
    """Tests for CRL generation."""

    def test_crl_includes_revoked_certs(self, root_ca, user_cert, pki_service, test_user):
        """CRL contains revoked certificates."""
        pki_service.revoke_certificate(cert=user_cert, reason="KEY_COMPROMISE", user=test_user)
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

    def test_sign_sha_claim_attachment(
        self,
        user_cert,
        test_user,
        sample_patient,
        sample_encounter,
        signing_service,
    ):
        """SHA claim attachments are signable using a file-hash-bound payload."""
        attachment = _create_sha_claim_attachment(sample_patient, sample_encounter, test_user)

        sig = signing_service.sign_document(
            document_type="SHAClaimAttachment",
            document_id=attachment.pk,
            user=test_user,
        )

        assert sig.document_type == "SHAClaimAttachment"
        assert sig.document_id == attachment.pk
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

    def test_verify_tampered_document(
        self, user_cert, test_user, sample_lab_result, signing_service
    ):
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

    def test_user_without_cert_cannot_sign(
        self, db, another_user, sample_lab_result, signing_service
    ):
        """A user without a certificate cannot sign documents."""
        with pytest.raises(ValueError, match="no valid certificate"):
            signing_service.sign_document(
                document_type="LabResult",
                document_id=sample_lab_result.pk,
                user=another_user,
            )

    def test_content_serialization_is_deterministic(
        self, user_cert, test_user, sample_lab_result, signing_service
    ):
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

    def test_tenant_admin_list_excludes_other_org_certificates(
        self,
        api_client,
        pki_service,
        root_ca,
        sample_organization,
        sample_facility,
        sample_county,
        sample_sub_county,
        another_user,
    ):
        """Tenant-scoped staff admin cannot list certificates from another organization."""
        from hmis.apps.core.models import Facility, Organization

        plan = sample_organization.subscription_plan

        tenant_admin = User.objects.create_user(
            username="tenantadmin",
            email="tenantadmin@example.com",
            password="testpassword123",
            is_staff=True,
        )
        ensure_staff_profile(tenant_admin, sample_organization, sample_facility)

        other_org = Organization.objects.create(
            name="Other Hospital Group",
            slug="other-hospital-group",
            contact_email="other-admin@test-hospital.co.ke",
            is_active=True,
            is_verified=True,
            subscription_plan=plan,
        )
        other_facility = Facility.objects.create(
            organization=other_org,
            name="Other Health Centre",
            mfl_code="99998",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        ensure_staff_profile(another_user, other_org, other_facility)

        own_cert = pki_service.issue_user_certificate(
            user=tenant_admin,
            ca=root_ca,
            organization=sample_organization,
            validity_years=1,
        )
        foreign_cert = pki_service.issue_user_certificate(
            user=another_user,
            ca=root_ca,
            organization=other_org,
            validity_years=1,
        )

        api_client.force_authenticate(user=tenant_admin)
        response = api_client.get("/api/core/certificates/")

        assert response.status_code == status.HTTP_200_OK
        cert_ids = {item["id"] for item in response.data["results"]}
        assert own_cert.id in cert_ids
        assert foreign_cert.id not in cert_ids

    def test_tenant_admin_cannot_revoke_other_org_certificate(
        self,
        api_client,
        pki_service,
        root_ca,
        sample_organization,
        sample_facility,
        sample_county,
        sample_sub_county,
        another_user,
    ):
        """Tenant-scoped staff admin cannot revoke certificates from another organization."""
        from hmis.apps.core.models import Facility, Organization

        tenant_admin = User.objects.create_user(
            username="tenantadmin2",
            email="tenantadmin2@example.com",
            password="testpassword123",
            is_staff=True,
        )
        ensure_staff_profile(tenant_admin, sample_organization, sample_facility)

        other_org = Organization.objects.create(
            name="Other Hospital Group 2",
            slug="other-hospital-group-2",
            contact_email="other2-admin@test-hospital.co.ke",
            is_active=True,
            is_verified=True,
            subscription_plan=sample_organization.subscription_plan,
        )
        other_facility = Facility.objects.create(
            organization=other_org,
            name="Other Health Centre 2",
            mfl_code="99997",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        ensure_staff_profile(another_user, other_org, other_facility)

        foreign_cert = pki_service.issue_user_certificate(
            user=another_user,
            ca=root_ca,
            organization=other_org,
            validity_years=1,
        )

        api_client.force_authenticate(user=tenant_admin)
        response = api_client.post(
            f"/api/core/certificates/{foreign_cert.id}/revoke/",
            {"reason": "KEY_COMPROMISE"},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_tenant_admin_ca_list_shows_root_and_own_intermediate_only(
        self,
        api_client,
        pki_service,
        root_ca,
        sample_organization,
        sample_facility,
        sample_county,
        sample_sub_county,
    ):
        """Tenant admin sees global root CA + own org intermediate CA, but not other org intermediates."""
        from hmis.apps.core.models import Facility, Organization

        tenant_admin = User.objects.create_user(
            username="tenantadmin3",
            email="tenantadmin3@example.com",
            password="testpassword123",
            is_staff=True,
        )
        ensure_staff_profile(tenant_admin, sample_organization, sample_facility)

        own_intermediate = pki_service.create_intermediate_ca(
            parent_ca=root_ca,
            name="Tenant A Intermediate CA",
            org="Tenant A",
            organization=sample_organization,
            validity_years=3,
        )

        other_org = Organization.objects.create(
            name="Other Hospital Group 3",
            slug="other-hospital-group-3",
            contact_email="other3-admin@test-hospital.co.ke",
            is_active=True,
            is_verified=True,
            subscription_plan=sample_organization.subscription_plan,
        )
        Facility.objects.create(
            organization=other_org,
            name="Other Health Centre 3",
            mfl_code="99996",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        foreign_intermediate = pki_service.create_intermediate_ca(
            parent_ca=root_ca,
            name="Tenant B Intermediate CA",
            org="Tenant B",
            organization=other_org,
            validity_years=3,
        )

        api_client.force_authenticate(user=tenant_admin)
        response = api_client.get("/api/core/certificates/ca/")

        assert response.status_code == status.HTTP_200_OK
        ca_ids = {item["id"] for item in response.data}
        assert root_ca.id in ca_ids
        assert own_intermediate.id in ca_ids
        assert foreign_intermediate.id not in ca_ids

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

    def test_create_document_share_defaults_to_view(
        self, authenticated_client, sample_lab_result, another_user
    ):
        """Creating a share defaults to VIEW permission."""
        response = authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": "LabResult",
                "document_id": sample_lab_result.pk,
                "shared_with": another_user.pk,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["permission"] == "VIEW"

    def test_view_share_cannot_sign(
        self,
        api_client,
        another_user,
        sample_lab_result,
        authenticated_client,
        root_ca,
        pki_service,
    ):
        """Recipient with VIEW share cannot sign."""
        authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": "LabResult",
                "document_id": sample_lab_result.pk,
                "shared_with": another_user.pk,
                "permission": "VIEW",
            },
            format="json",
        )

        pki_service.issue_user_certificate(user=another_user, ca=root_ca, validity_years=1)
        api_client.force_authenticate(user=another_user)

        response = api_client.post(
            "/api/core/signatures/sign/",
            {"document_type": "LabResult", "document_id": sample_lab_result.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not authorized" in str(response.data).lower()

    def test_sign_share_can_sign(
        self,
        api_client,
        another_user,
        sample_lab_result,
        authenticated_client,
        root_ca,
        pki_service,
    ):
        """Recipient with SIGN share can sign."""
        authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": "LabResult",
                "document_id": sample_lab_result.pk,
                "shared_with": another_user.pk,
                "permission": "SIGN",
            },
            format="json",
        )

        pki_service.issue_user_certificate(user=another_user, ca=root_ca, validity_years=1)
        api_client.force_authenticate(user=another_user)

        response = api_client.post(
            "/api/core/signatures/sign/",
            {"document_type": "LabResult", "document_id": sample_lab_result.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_document_hub_shared_tab(
        self, api_client, authenticated_client, another_user, sample_lab_result
    ):
        """Shared document should appear in recipient's Shared With Me tab."""
        share_resp = authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": "LabResult",
                "document_id": sample_lab_result.pk,
                "shared_with": another_user.pk,
            },
            format="json",
        )
        assert share_resp.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)

        api_client.force_authenticate(user=another_user)
        response = api_client.get("/api/core/document-hub/?tab=shared")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert any(
            item["document_type"] == "LabResult" and item["document_id"] == sample_lab_result.pk
            for item in results
        )

    def test_sha_attachment_preview_endpoint_allows_shared_view(
        self,
        api_client,
        authenticated_client,
        another_user,
        sample_patient,
        sample_encounter,
        test_user,
    ):
        """Recipient with active share can access SHA attachment preview payload."""
        attachment = _create_sha_claim_attachment(sample_patient, sample_encounter, test_user)

        share_response = authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": "SHAClaimAttachment",
                "document_id": attachment.pk,
                "shared_with": another_user.pk,
                "permission": "VIEW",
            },
            format="json",
        )
        assert share_response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)

        api_client.force_authenticate(user=another_user)
        response = api_client.get(f"/api/core/document-hub/sha-attachments/{attachment.pk}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == attachment.pk
        assert response.data["attachment_type"] == attachment.attachment_type
        assert response.data["file_url"]

    def test_document_hub_mine_includes_invoice(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
    ):
        """Billing invoices created by user should appear in Mine tab."""
        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            due_date=sample_encounter.created_at.date(),
            created_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get("/api/core/document-hub/?tab=mine")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert any(
            item["document_type"] == "Invoice" and item["document_id"] == invoice.pk
            for item in results
        )

    def test_invoice_share_cannot_use_sign_permission(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
        another_user,
    ):
        """Non-signable billing docs should reject SIGN share permission."""
        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            due_date=sample_encounter.created_at.date(),
            created_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": "Invoice",
                "document_id": invoice.pk,
                "shared_with": another_user.pk,
                "permission": "SIGN",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sign permission" in str(response.data).lower()

    def test_document_hub_mine_includes_credit_note_receipt_and_payment(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
    ):
        """Additional billing artifacts should appear in Mine tab for their owner fields."""
        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            due_date=sample_encounter.created_at.date(),
            total_amount=Decimal("1000.00"),
            balance_due=Decimal("1000.00"),
            created_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            method=Payment.Method.CASH,
            amount=Decimal("500.00"),
            status=Payment.Status.COMPLETED,
            received_by=test_user,
        )
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=invoice,
            patient=sample_patient,
            amount=Decimal("500.00"),
            payment_method=Payment.Method.CASH,
            facility_name="Test Facility",
            facility_address="Nairobi",
            facility_phone="0700000000",
            patient_name=f"{sample_patient.first_name} {sample_patient.last_name}".strip(),
            patient_mrn=sample_patient.mrn,
            issued_by=test_user,
        )
        credit_note = CreditNote.objects.create(
            invoice=invoice,
            patient=sample_patient,
            amount=Decimal("100.00"),
            reason=CreditNote.Reason.OTHER,
            reason_detail="Manual adjustment",
            requested_by=test_user,
        )

        response = authenticated_client.get("/api/core/document-hub/?tab=mine")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert any(
            item["document_type"] == "Payment" and item["document_id"] == payment.pk
            for item in results
        )
        assert any(
            item["document_type"] == "Receipt" and item["document_id"] == receipt.pk
            for item in results
        )
        assert any(
            item["document_type"] == "CreditNote" and item["document_id"] == credit_note.pk
            for item in results
        )

    @pytest.mark.parametrize("document_type", ["CreditNote", "Receipt", "Payment"])
    def test_non_signable_billing_artifacts_reject_sign_share_permission(
        self,
        document_type,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
        another_user,
    ):
        """Non-signable billing artifacts should reject SIGN share permission."""
        invoice = Invoice.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            due_date=sample_encounter.created_at.date(),
            total_amount=Decimal("1000.00"),
            balance_due=Decimal("1000.00"),
            created_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            method=Payment.Method.CASH,
            amount=Decimal("500.00"),
            status=Payment.Status.COMPLETED,
            received_by=test_user,
        )
        receipt = Receipt.objects.create(
            payment=payment,
            invoice=invoice,
            patient=sample_patient,
            amount=Decimal("500.00"),
            payment_method=Payment.Method.CASH,
            facility_name="Test Facility",
            facility_address="Nairobi",
            facility_phone="0700000000",
            patient_name=f"{sample_patient.first_name} {sample_patient.last_name}".strip(),
            patient_mrn=sample_patient.mrn,
            issued_by=test_user,
        )
        credit_note = CreditNote.objects.create(
            invoice=invoice,
            patient=sample_patient,
            amount=Decimal("100.00"),
            reason=CreditNote.Reason.OTHER,
            reason_detail="Manual adjustment",
            requested_by=test_user,
        )
        document_ids = {
            "Payment": payment.pk,
            "Receipt": receipt.pk,
            "CreditNote": credit_note.pk,
        }

        response = authenticated_client.post(
            "/api/core/document-shares/",
            {
                "document_type": document_type,
                "document_id": document_ids[document_type],
                "shared_with": another_user.pk,
                "permission": "SIGN",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sign permission" in str(response.data).lower()


@pytest.mark.django_db
class TestDocumentHubPerformanceRegression:
    """Regression tests for document hub query behavior."""

    def test_mine_tab_batches_signature_lookup_per_document_type(
        self,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
        monkeypatch,
    ):
        from hmis.apps.core import views_document_hub

        for _ in range(3):
            Invoice.objects.create(
                patient=sample_patient,
                encounter=sample_encounter,
                status=Invoice.Status.DRAFT,
                payment_type=Invoice.PaymentType.CASH,
                due_date=sample_encounter.created_at.date(),
                created_by=test_user,
                facility=sample_facility,
                organization=sample_organization,
            )

        original_filter = views_document_hub.DocumentSignature.objects.filter
        signature_filter_calls = 0

        def _counting_filter(*args, **kwargs):
            nonlocal signature_filter_calls
            signature_filter_calls += 1
            return original_filter(*args, **kwargs)

        monkeypatch.setattr(
            views_document_hub.DocumentSignature.objects, "filter", _counting_filter
        )

        signature_map = views_document_hub._get_latest_signature_map(
            "Invoice",
            [invoice.pk for invoice in Invoice.objects.all()],
        )

        for invoice in Invoice.objects.all():
            views_document_hub._build_hub_item(
                "Invoice",
                invoice,
                test_user,
                latest_signature=signature_map.get(invoice.pk),
            )

        assert signature_filter_calls == 1


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
