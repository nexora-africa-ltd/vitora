"""
Tests for DHA HIE Consent & Preauth (User Journey Compliance).

Covers:
- ConsentToken model state transitions
- PreauthRequest model state transitions
- SHAConsentService (send_otp, validate_otp, start_visit)
- SHAPreauthService (submit_preauth, poll_status)
- API views (send-otp, validate-otp, consent detail, preauth submit/status)
- Domain event publication
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, Mock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.billing.models import ConsentToken, PreauthRequest, SHAClaim, SHAMember

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an SHA member for consent tests."""
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-9876543210",
        national_id="31234567",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=180),
        coverage_end_date=date.today() + timedelta(days=180),
        created_by=test_user,
    )


@pytest.fixture
def consent_token(db, sample_patient, sha_member, test_user, sample_facility):
    """Create a pending consent token."""
    return ConsentToken.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        facility=sample_facility,
        consent_method=ConsentToken.ConsentMethod.OTP,
        status=ConsentToken.ConsentStatus.PENDING,
        otp_reference="OTP-REF-12345",
        identification_type="National ID",
        identification_number="31234567",
        created_by=test_user,
    )


@pytest.fixture
def validated_consent(db, consent_token):
    """Create a validated consent token."""
    consent_token.mark_validated(token="consent-token-xyz-123", expires_in_seconds=3600)
    return consent_token


@pytest.fixture
def sha_claim(db, sample_patient, sha_member, test_user, sample_facility, sample_encounter):
    """Create an SHA claim for preauth tests."""
    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="K35.80",
        primary_diagnosis_description="Acute appendicitis",
        facility=sample_facility,
        facility_code=sample_facility.mfl_code or "12345",
        facility_level="L4",
        created_by=test_user,
    )


@pytest.fixture
def preauth_request(
    db, sha_claim, sample_patient, sha_member, validated_consent, test_user, sample_facility
):
    """Create a pending preauth request."""
    return PreauthRequest.objects.create(
        claim=sha_claim,
        patient=sample_patient,
        sha_member=sha_member,
        consent_token=validated_consent,
        facility=sample_facility,
        preauth_reference="PA-20260429-ABC123",
        procedure_code="SURG-001",
        diagnosis_codes=["K35.80"],
        estimated_cost=Decimal("150000.00"),
        scheduled_date=date.today() + timedelta(days=7),
        clinical_notes="Appendectomy required",
        decision=PreauthRequest.PreauthDecision.PENDING,
        submitted_at=timezone.now(),
        created_by=test_user,
    )


# ---------------------------------------------------------------------------
# ConsentToken Model Tests
# ---------------------------------------------------------------------------


class TestConsentTokenModel:
    """Tests for ConsentToken model state transitions."""

    def test_create_consent_token(self, consent_token):
        """Should create consent token in PENDING status."""
        assert consent_token.status == ConsentToken.ConsentStatus.PENDING
        assert consent_token.otp_reference == "OTP-REF-12345"
        assert consent_token.consent_token == ""
        assert consent_token.is_valid is False

    def test_mark_validated(self, consent_token):
        """Should transition to VALIDATED with token and expiry."""
        consent_token.mark_validated(token="test-consent-token-abc", expires_in_seconds=7200)

        consent_token.refresh_from_db()
        assert consent_token.status == ConsentToken.ConsentStatus.VALIDATED
        assert consent_token.consent_token == "test-consent-token-abc"
        assert consent_token.validated_at is not None
        assert consent_token.expires_at is not None
        assert consent_token.is_valid is True

    def test_mark_failed(self, consent_token):
        """Should transition to FAILED."""
        consent_token.mark_failed()

        consent_token.refresh_from_db()
        assert consent_token.status == ConsentToken.ConsentStatus.FAILED
        assert consent_token.is_valid is False

    def test_mark_expired(self, validated_consent):
        """Should transition to EXPIRED."""
        validated_consent.mark_expired()

        validated_consent.refresh_from_db()
        assert validated_consent.status == ConsentToken.ConsentStatus.EXPIRED
        assert validated_consent.is_valid is False

    def test_is_valid_false_when_expired(self, validated_consent):
        """Should report invalid when token is past expiry."""
        validated_consent.expires_at = timezone.now() - timedelta(minutes=1)
        validated_consent.save(update_fields=["expires_at"])
        assert validated_consent.is_valid is False

    def test_str_representation(self, consent_token):
        """Should have meaningful string representation."""
        result = str(consent_token)
        assert "OTP" in result
        assert "Pending" in result


# ---------------------------------------------------------------------------
# PreauthRequest Model Tests
# ---------------------------------------------------------------------------


class TestPreauthRequestModel:
    """Tests for PreauthRequest model state transitions."""

    def test_create_preauth_request(self, preauth_request):
        """Should create preauth in PENDING decision."""
        assert preauth_request.decision == PreauthRequest.PreauthDecision.PENDING
        assert preauth_request.preauth_reference == "PA-20260429-ABC123"
        assert preauth_request.is_valid is False

    def test_update_from_poll_approved(self, preauth_request):
        """Should update to APPROVED with amounts and validity."""
        response_data = {
            "decision": "approved",
            "approved_amount": 145000.00,
            "valid_until": (date.today() + timedelta(days=30)).isoformat(),
        }
        preauth_request.update_from_poll(response_data)

        preauth_request.refresh_from_db()
        assert preauth_request.decision == PreauthRequest.PreauthDecision.APPROVED
        assert preauth_request.approved_amount == Decimal("145000")
        assert preauth_request.valid_until is not None
        assert preauth_request.poll_count == 1
        assert preauth_request.is_valid is True

    def test_update_from_poll_denied(self, preauth_request):
        """Should update to DENIED with reason."""
        response_data = {
            "decision": "denied",
            "message": "Procedure not covered under current plan",
        }
        preauth_request.update_from_poll(response_data)

        preauth_request.refresh_from_db()
        assert preauth_request.decision == PreauthRequest.PreauthDecision.DENIED
        assert "not covered" in preauth_request.denial_reason
        assert preauth_request.is_valid is False

    def test_mark_expired(self, preauth_request):
        """Should transition to EXPIRED."""
        preauth_request.decision = PreauthRequest.PreauthDecision.APPROVED
        preauth_request.valid_until = date.today() - timedelta(days=1)
        preauth_request.save()
        preauth_request.mark_expired()

        preauth_request.refresh_from_db()
        assert preauth_request.decision == PreauthRequest.PreauthDecision.EXPIRED

    def test_is_valid_false_when_past_valid_until(self, preauth_request):
        """Should report invalid when past validity date."""
        preauth_request.decision = PreauthRequest.PreauthDecision.APPROVED
        preauth_request.valid_until = date.today() - timedelta(days=1)
        preauth_request.save()
        assert preauth_request.is_valid is False

    def test_str_representation(self, preauth_request):
        """Should have meaningful string representation."""
        result = str(preauth_request)
        assert "SURG-001" in result
        assert "Pending" in result


# ---------------------------------------------------------------------------
# SHAConsentService Tests
# ---------------------------------------------------------------------------


class TestSHAConsentServiceSendOTP:
    """Tests for SHAConsentService.send_otp()."""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_send_otp_success(
        self, mock_auth_cls, mock_request, sha_member, test_user, sample_facility
    ):
        """Should send OTP and create pending consent token."""
        mock_request.return_value = {
            "status": "success",
            "message": "OTP sent successfully",
            "otp_reference": "a4klufn4o0",
        }

        from hmis.apps.billing.services.sha_consent import SHAConsentService

        service = SHAConsentService()
        consent = service.send_otp(
            sha_member=sha_member,
            facility_code="12345",
            user=test_user,
            facility=sample_facility,
        )

        assert consent.status == ConsentToken.ConsentStatus.PENDING
        assert consent.otp_reference == "a4klufn4o0"
        assert consent.patient == sha_member.patient
        assert consent.sha_member == sha_member
        assert consent.facility == sample_facility
        assert consent.organization == sample_facility.organization

    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_send_otp_no_national_id(self, mock_auth_cls, sha_member, test_user, sample_facility):
        """Should raise error if member has no national ID."""
        # Bypass full_clean to test the service-level validation
        SHAMember.objects.filter(pk=sha_member.pk).update(national_id="")
        sha_member.refresh_from_db()

        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        service = SHAConsentService()
        with pytest.raises(SHAConsentError) as exc_info:
            service.send_otp(
                sha_member=sha_member,
                facility_code="12345",
                user=test_user,
                facility=sample_facility,
            )
        assert exc_info.value.code == "missing_national_id"


class TestSHAConsentServiceValidateOTP:
    """Tests for SHAConsentService.validate_otp()."""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_validate_otp_success(self, mock_auth_cls, mock_request, consent_token):
        """Should validate OTP and store consent token."""
        mock_request.return_value = {
            "status": "success",
            "message": "OTP validated successfully",
            "consent_token": "dha-consent-token-xyz",
            "expires_in": 3600,
        }

        from hmis.apps.billing.services.sha_consent import SHAConsentService

        service = SHAConsentService()
        result = service.validate_otp(consent=consent_token, otp_code="12345")

        result.refresh_from_db()
        assert result.status == ConsentToken.ConsentStatus.VALIDATED
        assert result.consent_token == "dha-consent-token-xyz"
        assert result.is_valid is True

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_validate_otp_failure(self, mock_auth_cls, mock_request, consent_token):
        """Should mark consent as failed on invalid OTP."""
        mock_request.return_value = {
            "status": "error",
            "message": "Invalid OTP code",
        }

        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        service = SHAConsentService()
        with pytest.raises(SHAConsentError) as exc_info:
            service.validate_otp(consent=consent_token, otp_code="99999")
        assert exc_info.value.code == "otp_validation_failed"

        consent_token.refresh_from_db()
        assert consent_token.status == ConsentToken.ConsentStatus.FAILED

    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_validate_otp_wrong_status(self, mock_auth_cls, validated_consent):
        """Should reject validation attempt on non-PENDING consent."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        service = SHAConsentService()
        with pytest.raises(SHAConsentError) as exc_info:
            service.validate_otp(consent=validated_consent, otp_code="12345")
        assert exc_info.value.code == "invalid_status"


# ---------------------------------------------------------------------------
# SHAPreauthService Tests
# ---------------------------------------------------------------------------


class TestSHAPreauthServiceSubmit:
    """Tests for SHAPreauthService.submit_preauth()."""

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService._make_request")
    @patch("hmis.apps.billing.services.sha_preauth.SHAAuthService")
    def test_submit_preauth_success(
        self, mock_auth_cls, mock_request, sha_claim, validated_consent, test_user
    ):
        """Should submit preauth and create PreauthRequest."""
        mock_request.return_value = {
            "preauth_reference": "PA-20260429-NEW001",
            "decision": "pending_review",
            "message": "Pre-authorization submitted for review",
        }

        from hmis.apps.billing.services.sha_preauth import SHAPreauthService

        service = SHAPreauthService()
        preauth = service.submit_preauth(
            claim=sha_claim,
            consent=validated_consent,
            procedure_code="SURG-001",
            diagnosis_codes=["K35.80"],
            estimated_cost=Decimal("150000.00"),
            scheduled_date=date.today() + timedelta(days=7),
            clinical_notes="Appendectomy required",
            user=test_user,
        )

        assert preauth.preauth_reference == "PA-20260429-NEW001"
        assert preauth.decision == PreauthRequest.PreauthDecision.PENDING
        assert preauth.claim == sha_claim

        # Should also update claim's preauth fields
        sha_claim.refresh_from_db()
        assert sha_claim.preauth_number == "PA-20260429-NEW001"

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService._make_request")
    @patch("hmis.apps.billing.services.sha_preauth.SHAAuthService")
    def test_submit_preauth_immediate_approval(
        self, mock_auth_cls, mock_request, sha_claim, validated_consent, test_user
    ):
        """Should handle immediate approval from DHA."""
        mock_request.return_value = {
            "preauth_reference": "PA-20260429-AUTO",
            "decision": "approved",
            "approved_amount": 145000.00,
            "valid_until": (date.today() + timedelta(days=30)).isoformat(),
            "message": "Pre-authorization approved",
        }

        from hmis.apps.billing.services.sha_preauth import SHAPreauthService

        service = SHAPreauthService()
        preauth = service.submit_preauth(
            claim=sha_claim,
            consent=validated_consent,
            procedure_code="SURG-001",
            diagnosis_codes=["K35.80"],
            estimated_cost=Decimal("150000.00"),
            scheduled_date=date.today() + timedelta(days=7),
            user=test_user,
        )

        assert preauth.decision == PreauthRequest.PreauthDecision.APPROVED
        assert preauth.approved_amount == Decimal("145000")
        assert preauth.is_valid is True

    @patch("hmis.apps.billing.services.sha_preauth.SHAAuthService")
    def test_submit_preauth_invalid_consent(
        self, mock_auth_cls, sha_claim, consent_token, test_user
    ):
        """Should reject submission with invalid consent token."""
        from hmis.apps.billing.services.sha_preauth import SHAPreauthError, SHAPreauthService

        service = SHAPreauthService()
        with pytest.raises(SHAPreauthError) as exc_info:
            service.submit_preauth(
                claim=sha_claim,
                consent=consent_token,  # PENDING, not VALIDATED
                procedure_code="SURG-001",
                diagnosis_codes=["K35.80"],
                estimated_cost=Decimal("150000"),
                scheduled_date=date.today(),
                user=test_user,
            )
        assert exc_info.value.code == "invalid_consent"


class TestSHAPreauthServicePoll:
    """Tests for SHAPreauthService.poll_status()."""

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService._make_request")
    @patch("hmis.apps.billing.services.sha_preauth.SHAAuthService")
    def test_poll_status_approved(self, mock_auth_cls, mock_request, preauth_request):
        """Should update preauth to APPROVED on poll."""
        mock_request.return_value = {
            "preauth_reference": preauth_request.preauth_reference,
            "decision": "approved",
            "approved_amount": 140000.00,
            "valid_until": (date.today() + timedelta(days=30)).isoformat(),
        }

        from hmis.apps.billing.services.sha_preauth import SHAPreauthService

        service = SHAPreauthService()
        result = service.poll_status(preauth_request)

        result.refresh_from_db()
        assert result.decision == PreauthRequest.PreauthDecision.APPROVED
        assert result.approved_amount == Decimal("140000")
        assert result.poll_count == 1

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService._make_request")
    @patch("hmis.apps.billing.services.sha_preauth.SHAAuthService")
    def test_poll_status_denied(self, mock_auth_cls, mock_request, preauth_request):
        """Should update preauth to DENIED with reason."""
        mock_request.return_value = {
            "preauth_reference": preauth_request.preauth_reference,
            "decision": "denied",
            "message": "Service not covered",
        }

        from hmis.apps.billing.services.sha_preauth import SHAPreauthService

        service = SHAPreauthService()
        result = service.poll_status(preauth_request)

        result.refresh_from_db()
        assert result.decision == PreauthRequest.PreauthDecision.DENIED
        assert "not covered" in result.denial_reason


# ---------------------------------------------------------------------------
# API View Tests
# ---------------------------------------------------------------------------


class TestConsentSendOTPAPI:
    """Tests for POST /api/sha/consent/send-otp/."""

    @patch("hmis.apps.billing.services.ilm_lifecycle_service.IlmLifecycleService.send_visit_otp")
    def test_send_otp_api_success(self, mock_send_otp, authenticated_client, sha_member):
        """Should send OTP and return 201."""
        from hmis.apps.billing.services.ilm_lifecycle_service import IlmLifecycleResult

        mock_result = Mock()
        mock_result.payload = {
            "otp_reference": "api-otp-ref-123",
        }
        mock_send_otp.return_value = mock_result

        response = authenticated_client.post(
            "/api/sha/consent/send-otp/",
            {"sha_member_id": sha_member.id},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["otp_reference"] == "api-otp-ref-123"
        assert response.data["status"] == "PENDING"

    def test_send_otp_api_unauthenticated(self, api_client, sha_member):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/sha/consent/send-otp/",
            {"sha_member_id": sha_member.id},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_send_otp_api_member_not_found(self, authenticated_client):
        """Should return 404 for non-existent member."""
        response = authenticated_client.post(
            "/api/sha/consent/send-otp/",
            {"sha_member_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestConsentValidateOTPAPI:
    """Tests for POST /api/sha/consent/validate-otp/."""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_validate_otp_api_success(
        self, mock_auth_cls, mock_request, authenticated_client, consent_token
    ):
        """Should validate OTP and return 200."""
        mock_request.return_value = {
            "status": "success",
            "consent_token": "validated-token-abc",
            "expires_in": 3600,
        }

        response = authenticated_client.post(
            "/api/sha/consent/validate-otp/",
            {"consent_id": consent_token.id, "otp_code": "12345"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "VALIDATED"
        assert response.data["consent_token"] == "validated-token-abc"

    def test_validate_otp_api_consent_not_found(self, authenticated_client):
        """Should return 404 for non-existent consent."""
        response = authenticated_client.post(
            "/api/sha/consent/validate-otp/",
            {"consent_id": 99999, "otp_code": "12345"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestConsentDetailAPI:
    """Tests for GET /api/sha/consent/{id}/."""

    def test_get_consent_detail(self, authenticated_client, consent_token):
        """Should return consent token details."""
        response = authenticated_client.get(f"/api/sha/consent/{consent_token.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == consent_token.id
        assert response.data["status"] == "PENDING"
        assert response.data["otp_reference"] == "OTP-REF-12345"

    def test_get_consent_detail_not_found(self, authenticated_client):
        """Should return 404 for non-existent consent."""
        response = authenticated_client.get("/api/sha/consent/99999/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestStartVisitAPI:
    """Tests for POST /api/sha/consent/start-visit/."""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_start_visit_success(
        self, mock_auth_cls, mock_request, authenticated_client, consent_token
    ):
        """Should start visit via DHA and return validated consent."""
        mock_request.return_value = {
            "status": "success",
            "consent_token": "dha-visit-token-123",
            "expires_in": 3600,
            "visit_id": "VISIT-001",
        }

        response = authenticated_client.post(
            "/api/sha/consent/start-visit/",
            {
                "consent_id": consent_token.id,
                "otp_code": "123456",
                "intervention_codes": ["SHA-01", "SHA-02"],
                "service_type": "outpatient",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "VALIDATED"
        assert response.data["consent_token"] == "dha-visit-token-123"
        assert response.data["message"] == "Visit started successfully"

        # Verify DHA was called with correct payload
        call_kwargs = mock_request.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["otp"] == "123456"
        assert payload["intervention_codes"] == ["SHA-01", "SHA-02"]
        assert payload["service_type"] == "outpatient"
        assert payload["patient_id"] == consent_token.identification_number

    def test_start_visit_missing_otp(self, authenticated_client, consent_token):
        """Should reject request without otp_code."""
        response = authenticated_client.post(
            "/api/sha/consent/start-visit/",
            {"consent_id": consent_token.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "otp_code" in response.data["error"]

    def test_start_visit_missing_consent_id(self, authenticated_client):
        """Should reject request without consent_id."""
        response = authenticated_client.post(
            "/api/sha/consent/start-visit/",
            {"otp_code": "123456"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "consent_id" in response.data["error"]

    def test_start_visit_consent_not_found(self, authenticated_client):
        """Should return 404 for non-existent consent."""
        response = authenticated_client.post(
            "/api/sha/consent/start-visit/",
            {"consent_id": 99999, "otp_code": "123456"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_start_visit_unauthenticated(self, api_client, consent_token):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/sha/consent/start-visit/",
            {"consent_id": consent_token.id, "otp_code": "123456"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestStartVisitService:
    """Tests for SHAConsentService.start_visit() with DHA payload."""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_start_visit_sends_correct_payload(self, mock_auth_cls, mock_request, consent_token):
        """Should send DHA-compliant payload to /api/v1/claims/visit."""
        mock_request.return_value = {
            "status": "success",
            "consent_token": "visit-token-abc",
            "expires_in": 7200,
        }

        from hmis.apps.billing.services.sha_consent import SHAConsentService

        service = SHAConsentService()
        result = service.start_visit(
            consent=consent_token,
            otp_code="654321",
            intervention_codes=["SHA-PROC-01"],
            service_type="inpatient",
            admission_date="2026-04-29",
            estimated_days_of_admission=5,
        )

        assert result["status"] == "success"

        # Verify the DHA payload shape
        call_kwargs = mock_request.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload == {
            "admission_date": "2026-04-29",
            "estimated_days_of_admission": 5,
            "intervention_codes": ["SHA-PROC-01"],
            "otp": "654321",
            "patient_id": consent_token.identification_number,
            "service_type": "inpatient",
        }

        # Consent should be validated with returned token
        consent_token.refresh_from_db()
        assert consent_token.status == ConsentToken.ConsentStatus.VALIDATED
        assert consent_token.consent_token == "visit-token-abc"

    @patch("hmis.apps.billing.services.sha_consent.SHAAuthService")
    def test_start_visit_rejects_failed_consent(self, mock_auth_cls, consent_token):
        """Should reject start_visit on FAILED consent."""
        consent_token.status = ConsentToken.ConsentStatus.FAILED
        consent_token.save()

        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        service = SHAConsentService()
        with pytest.raises(SHAConsentError) as exc_info:
            service.start_visit(consent=consent_token, otp_code="123456")
        assert exc_info.value.code == "invalid_consent_status"


class TestPreauthSubmitAPI:
    """Tests for POST /api/sha/preauth/submit/."""

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService._make_request")
    @patch("hmis.apps.billing.services.sha_preauth.SHAAuthService")
    def test_submit_preauth_api_success(
        self, mock_auth_cls, mock_request, authenticated_client, sha_claim, validated_consent
    ):
        """Should submit preauth and return 201."""
        mock_request.return_value = {
            "preauth_reference": "PA-API-001",
            "decision": "pending_review",
        }

        response = authenticated_client.post(
            "/api/sha/preauth/submit/",
            {
                "claim_id": sha_claim.id,
                "consent_token_id": validated_consent.id,
                "procedure_code": "SURG-001",
                "diagnosis_codes": ["K35.80"],
                "estimated_cost": "150000.00",
                "scheduled_date": (date.today() + timedelta(days=7)).isoformat(),
                "clinical_notes": "Surgery needed",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["preauth_reference"] == "PA-API-001"

    def test_submit_preauth_api_invalid_consent(
        self, authenticated_client, sha_claim, consent_token
    ):
        """Should reject preauth with invalid (non-validated) consent."""
        response = authenticated_client.post(
            "/api/sha/preauth/submit/",
            {
                "claim_id": sha_claim.id,
                "consent_token_id": consent_token.id,  # PENDING, not VALIDATED
                "procedure_code": "SURG-001",
                "diagnosis_codes": ["K35.80"],
                "estimated_cost": "150000.00",
                "scheduled_date": (date.today() + timedelta(days=7)).isoformat(),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestPreauthStatusAPI:
    """Tests for GET /api/sha/preauth/{id}/status/."""

    def test_get_preauth_status(self, authenticated_client, preauth_request):
        """Should return preauth status."""
        response = authenticated_client.get(f"/api/sha/preauth/{preauth_request.id}/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == preauth_request.id
        assert response.data["decision"] == "PENDING"
        assert response.data["preauth_reference"] == "PA-20260429-ABC123"

    def test_get_preauth_status_not_found(self, authenticated_client):
        """Should return 404 for non-existent preauth."""
        response = authenticated_client.get("/api/sha/preauth/99999/status/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestPreauthPendingListAPI:
    """Tests for GET /api/sha/preauth/pending/."""

    def test_list_pending_preauths(self, authenticated_client, preauth_request):
        """Should list pending preauth requests."""
        response = authenticated_client.get("/api/sha/preauth/pending/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
        assert any(r["id"] == preauth_request.id for r in response.data["results"])


# ---------------------------------------------------------------------------
# Domain Event Tests
# ---------------------------------------------------------------------------


class TestConsentDomainEvents:
    """Tests for consent domain event publication."""

    def test_consent_creation_publishes_otp_sent_event(
        self, db, mocker, sample_patient, sha_member, test_user, sample_facility
    ):
        """Should publish CONSENT_OTP_SENT event on creation."""
        mock_publish = mocker.patch("hmis.apps.billing.signals.publish_event")

        ConsentToken.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            facility=sample_facility,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.PENDING,
            otp_reference="EVENT-TEST",
            identification_type="National ID",
            identification_number="12345678",
            created_by=test_user,
        )

        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert call_args.kwargs["event_type"] == "billing.consent.otp_sent"

    def test_preauth_creation_publishes_submitted_event(
        self,
        db,
        mocker,
        sha_claim,
        sample_patient,
        sha_member,
        validated_consent,
        test_user,
        sample_facility,
    ):
        """Should publish PREAUTH_SUBMITTED event on creation."""
        mock_publish = mocker.patch("hmis.apps.billing.signals.publish_event")

        PreauthRequest.objects.create(
            claim=sha_claim,
            patient=sample_patient,
            sha_member=sha_member,
            consent_token=validated_consent,
            facility=sample_facility,
            preauth_reference="PA-EVENT-TEST",
            procedure_code="SURG-001",
            diagnosis_codes=["K35.80"],
            estimated_cost=Decimal("100000"),
            scheduled_date=date.today() + timedelta(days=7),
            decision=PreauthRequest.PreauthDecision.PENDING,
            created_by=test_user,
        )

        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert call_args.kwargs["event_type"] == "billing.preauth.submitted"
