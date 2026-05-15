"""Tests for insurance services layer (Phase 3).

Covers:
- Error hierarchy and from_status mapping
- Result dataclasses
- ManualAdapter (default, no-API adapter)
- GenericSmartClaimsAdapter (mocked HTTP)
- Adapter registry and get_adapter
- InsuranceHttpClient (mocked requests.Session)
- InsuranceOutboundCall audit model
- Service classes (eligibility, claims, preauth, remittance, export)
- Celery tasks
- PII redaction
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsuranceOutboundCall,
    InsurancePreauth,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    PatientInsurance,
)
from hmis.apps.insurance.services.adapters import (
    AARAdapter,
    BritamAdapter,
    CICAdapter,
    GenericSmartClaimsAdapter,
    JubileeAdapter,
    ManualAdapter,
    get_adapter,
)
from hmis.apps.insurance.services.client import (
    InsuranceHttpClient,
    InsuranceResponse,
    _redact,
    set_request_id,
)
from hmis.apps.insurance.services.errors import (
    InsuranceApiError,
    InsuranceClientError,
    InsuranceConflictError,
    InsuranceNotConfiguredError,
    InsuranceNotFoundError,
    InsuranceRateLimitedError,
    InsuranceServerError,
    InsuranceTimeoutError,
    InsuranceTransportError,
    InsuranceUnauthorizedError,
    InsuranceValidationError,
    from_status,
)
from hmis.apps.insurance.services.results import (
    ClaimResult,
    EligibilityResult,
    PreauthResult,
    RemittanceEntry,
    RemittanceResult,
    TariffEntry,
)

# ===================================================================
# Error hierarchy
# ===================================================================


class TestErrorHierarchy:
    def test_base_error_str(self):
        e = InsuranceApiError("fail", status_code=500, method="POST", path="/claims")
        assert "POST /claims" in str(e)
        assert "HTTP 500" in str(e)

    def test_provider_code_in_str(self):
        e = InsuranceApiError("fail", provider_code="JUBILEE", method="GET", path="/status")
        assert "[JUBILEE]" in str(e)

    def test_inheritance(self):
        assert issubclass(InsuranceTransportError, InsuranceApiError)
        assert issubclass(InsuranceTimeoutError, InsuranceTransportError)
        assert issubclass(InsuranceClientError, InsuranceApiError)
        assert issubclass(InsuranceServerError, InsuranceApiError)
        assert issubclass(InsuranceValidationError, InsuranceClientError)
        assert issubclass(InsuranceUnauthorizedError, InsuranceClientError)
        assert issubclass(InsuranceNotFoundError, InsuranceClientError)
        assert issubclass(InsuranceConflictError, InsuranceClientError)
        assert issubclass(InsuranceRateLimitedError, InsuranceClientError)
        assert issubclass(InsuranceNotConfiguredError, InsuranceApiError)

    def test_from_status_401(self):
        e = from_status(401, "unauthorized")
        assert isinstance(e, InsuranceUnauthorizedError)
        assert e.status_code == 401

    def test_from_status_403(self):
        e = from_status(403, "forbidden")
        assert isinstance(e, InsuranceUnauthorizedError)

    def test_from_status_404(self):
        e = from_status(404, "not found")
        assert isinstance(e, InsuranceNotFoundError)

    def test_from_status_409(self):
        e = from_status(409, "conflict")
        assert isinstance(e, InsuranceConflictError)

    def test_from_status_429(self):
        e = from_status(429, "rate limited")
        assert isinstance(e, InsuranceRateLimitedError)

    def test_from_status_400(self):
        e = from_status(400, "bad request")
        assert isinstance(e, InsuranceValidationError)

    def test_from_status_422(self):
        e = from_status(422, "unprocessable")
        assert isinstance(e, InsuranceValidationError)

    def test_from_status_418(self):
        e = from_status(418, "teapot")
        assert isinstance(e, InsuranceClientError)

    def test_from_status_500(self):
        e = from_status(500, "server error")
        assert isinstance(e, InsuranceServerError)

    def test_from_status_502(self):
        e = from_status(502, "bad gateway")
        assert isinstance(e, InsuranceServerError)

    def test_from_status_200(self):
        e = from_status(200, "unexpected")
        assert isinstance(e, InsuranceApiError)
        assert not isinstance(e, InsuranceClientError)

    def test_validation_error_has_errors_attr(self):
        e = InsuranceValidationError("bad", errors={"field": "required"})
        assert e.errors == {"field": "required"}


# ===================================================================
# Result dataclasses
# ===================================================================


class TestResultDataclasses:
    def test_eligibility_result_defaults(self):
        r = EligibilityResult(eligible=True)
        assert r.eligible is True
        assert r.member_number == ""
        assert r.raw_response == {}

    def test_claim_result_defaults(self):
        r = ClaimResult(success=True, external_claim_id="EXT-123")
        assert r.success is True
        assert r.external_claim_id == "EXT-123"
        assert r.approved_amount is None

    def test_preauth_result_defaults(self):
        r = PreauthResult(success=False, rejection_reason="not covered")
        assert r.success is False
        assert r.rejection_reason == "not covered"

    def test_remittance_result_with_entries(self):
        entry = RemittanceEntry(claim_number="IC-001", paid_amount=Decimal("1000"))
        r = RemittanceResult(success=True, entries=[entry])
        assert len(r.entries) == 1
        assert r.entries[0].claim_number == "IC-001"

    def test_tariff_entry_defaults(self):
        t = TariffEntry(service_code="CONS", tariff_amount=Decimal("500"))
        assert t.requires_preauth is False
        assert t.effective_from is None


# ===================================================================
# PII redaction
# ===================================================================


class TestPiiRedaction:
    def test_redacts_known_fields(self):
        data = {
            "member_number": "JUB-001",
            "name": "John Doe",
            "phone_number": "+254700000000",
        }
        result = _redact(data)
        assert result["member_number"] == "***REDACTED***"
        assert result["name"] == "John Doe"
        assert result["phone_number"] == "***REDACTED***"

    def test_redacts_nested(self):
        data = {"patient": {"national_id": "12345", "name": "Jane"}}
        result = _redact(data)
        assert result["patient"]["national_id"] == "***REDACTED***"
        assert result["patient"]["name"] == "Jane"

    def test_redacts_list(self):
        data = [{"password": "secret", "key": "value"}]
        result = _redact(data)
        assert result[0]["password"] == "***REDACTED***"
        assert result[0]["key"] == "value"

    def test_depth_limit(self):
        data = {"a": {"b": {"c": {"d": {"e": {"f": {"g": "deep"}}}}}}}
        result = _redact(data)
        assert "..." in str(result)

    def test_scalar_passthrough(self):
        assert _redact("hello") == "hello"
        assert _redact(42) == 42
        assert _redact(None) is None


# ===================================================================
# ManualAdapter
# ===================================================================


class TestManualAdapter:
    def test_verify_eligibility_uses_local_state(self, provider_config, patient_insurance):
        adapter = ManualAdapter(provider_config)
        result = adapter.verify_eligibility(patient_insurance)
        assert result.eligible is True
        assert "Manual" in result.message

    def test_submit_claim_returns_not_supported(self, provider_config, insurance_claim):
        adapter = ManualAdapter(provider_config)
        result = adapter.submit_claim(insurance_claim)
        assert result.success is False
        assert "Manual" in result.message

    def test_submit_preauth_returns_not_supported(self, provider_config, insurance_preauth):
        adapter = ManualAdapter(provider_config)
        result = adapter.submit_preauth(insurance_preauth)
        assert result.success is False

    def test_check_claim_status_reflects_local(self, provider_config, insurance_claim):
        adapter = ManualAdapter(provider_config)
        result = adapter.check_claim_status(insurance_claim)
        assert result.success is True
        assert result.status == insurance_claim.status

    def test_check_preauth_status_reflects_local(self, provider_config, insurance_preauth):
        adapter = ManualAdapter(provider_config)
        result = adapter.check_preauth_status(insurance_preauth)
        assert result.success is True

    def test_fetch_remittances_empty(self, provider_config):
        adapter = ManualAdapter(provider_config)
        result = adapter.fetch_remittances(date.today() - timedelta(days=30), date.today())
        assert result == []

    def test_get_tariff_schedule_empty(self, provider_config):
        adapter = ManualAdapter(provider_config)
        result = adapter.get_tariff_schedule()
        assert result == []


# ===================================================================
# Adapter registry
# ===================================================================


class TestAdapterRegistry:
    def test_get_adapter_manual_by_default(self, provider_config):
        adapter = get_adapter(provider_config)
        assert isinstance(adapter, ManualAdapter)

    def test_get_adapter_smart_claims_when_api_enabled(self, sample_facility, sample_organization):
        from hmis.apps.insurance.models import InsuranceProvider

        # Use a provider code NOT in the registry so get_adapter falls through
        provider = InsuranceProvider.objects.create(
            organization=sample_organization,
            name="Generic Insurer",
            code="GENERIC_TEST",
            provider_type=InsuranceProvider.ProviderType.PRIVATE,
            status=InsuranceProvider.Status.ACTIVE,
        )
        config = InsuranceProviderConfig.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            provider=provider,
            api_enabled=True,
            api_base_url="https://api.test.com",
            api_auth_type="BEARER",
            api_credentials={"token": "test"},
        )
        adapter = get_adapter(config)
        assert isinstance(adapter, GenericSmartClaimsAdapter)

    def test_stub_adapters_are_manual(self):
        assert issubclass(JubileeAdapter, ManualAdapter)
        assert issubclass(AARAdapter, ManualAdapter)
        assert issubclass(CICAdapter, ManualAdapter)
        assert issubclass(BritamAdapter, ManualAdapter)

    def test_not_configured_error_when_no_base_url(
        self, insurance_provider, sample_facility, sample_organization
    ):
        config = InsuranceProviderConfig.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            provider=insurance_provider,
            api_enabled=True,
            api_base_url="",
        )
        with pytest.raises(InsuranceNotConfiguredError):
            GenericSmartClaimsAdapter(config)


# ===================================================================
# InsuranceHttpClient
# ===================================================================


class TestInsuranceHttpClient:
    def test_from_config(self, insurance_provider, sample_facility, sample_organization):
        config = InsuranceProviderConfig.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            provider=insurance_provider,
            api_base_url="https://api.test.com",
            api_auth_type="BEARER",
            api_credentials={"token": "abc123"},
        )
        client = InsuranceHttpClient.from_config(config)
        assert client.base_url == "https://api.test.com"
        assert client.auth_type == "BEARER"
        assert client.provider == insurance_provider

    def test_successful_request(self, sample_facility):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "ok"}
        mock_response.text = '{"status": "ok"}'
        mock_response.headers = {"Content-Type": "application/json"}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
        )
        result = client.get("/health")
        assert result.status_code == 200
        assert result.json == {"status": "ok"}

    def test_timeout_raises_after_retries(self, sample_facility):
        import requests

        mock_session = MagicMock()
        mock_session.request.side_effect = requests.Timeout("timeout")

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
            max_retries=1,
            backoff_seconds=0,
        )
        with pytest.raises(InsuranceTimeoutError):
            client.get("/health")

    def test_transport_error_raises(self, sample_facility):
        import requests

        mock_session = MagicMock()
        mock_session.request.side_effect = requests.ConnectionError("conn refused")

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
            max_retries=0,
            backoff_seconds=0,
        )
        with pytest.raises(InsuranceTransportError):
            client.get("/health")

    def test_4xx_raises_client_error(self, sample_facility):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": "bad request"}
        mock_response.text = "bad request"
        mock_response.headers = {}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
        )
        with pytest.raises(InsuranceValidationError):
            client.post("/submit", json_body={"data": "test"})

    def test_5xx_retried_then_raises(self, sample_facility):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.json.return_value = None
        mock_response.text = "Internal Server Error"
        mock_response.headers = {}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
            max_retries=1,
            backoff_seconds=0,
        )
        with pytest.raises(InsuranceServerError):
            client.get("/status")
        # 1 initial + 1 retry = 2 calls
        assert mock_session.request.call_count == 2

    def test_bearer_auth_applied(self, sample_facility):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_response.text = "{}"
        mock_response.headers = {}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            auth_type="BEARER",
            auth_credentials={"token": "mytoken"},
            session=mock_session,
            facility=sample_facility,
        )
        client.get("/test")

        call_kwargs = mock_session.request.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers", {})
        assert headers.get("Authorization") == "Bearer mytoken"

    def test_basic_auth_applied(self, sample_facility):
        import base64

        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_response.text = "{}"
        mock_response.headers = {}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            auth_type="BASIC",
            auth_credentials={"username": "user", "password": "pass"},
            session=mock_session,
            facility=sample_facility,
        )
        client.get("/test")

        call_kwargs = mock_session.request.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers", {})
        expected = base64.b64encode(b"user:pass").decode()
        assert headers.get("Authorization") == f"Basic {expected}"

    def test_api_key_auth_applied(self, sample_facility):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_response.text = "{}"
        mock_response.headers = {}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            auth_type="API_KEY",
            auth_credentials={"api_key": "key123", "header_name": "X-Custom-Key"},
            session=mock_session,
            facility=sample_facility,
        )
        client.get("/test")

        call_kwargs = mock_session.request.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers", {})
        assert headers.get("X-Custom-Key") == "key123"

    def test_audit_row_written_on_success(self, sample_facility, db):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True}
        mock_response.text = '{"ok": true}'
        mock_response.headers = {}
        mock_session.request.return_value = mock_response

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
        )
        result = client.get("/health")
        assert result.audit_id is not None

        audit = InsuranceOutboundCall.objects.get(pk=result.audit_id)
        assert audit.status == "SUCCESS"
        assert audit.method == "GET"
        assert audit.path == "/health"
        assert audit.facility == sample_facility

    def test_audit_row_written_on_error(self, sample_facility, db):
        import requests

        mock_session = MagicMock()
        mock_session.request.side_effect = requests.Timeout("timeout")

        client = InsuranceHttpClient(
            base_url="https://api.test.com",
            session=mock_session,
            facility=sample_facility,
            max_retries=0,
            backoff_seconds=0,
        )
        with pytest.raises(InsuranceTimeoutError):
            client.get("/health")

        audit = InsuranceOutboundCall.objects.latest("created_at")
        assert audit.status == "TIMEOUT"

    def test_set_request_id_correlation(self, sample_facility, db):
        set_request_id("test-correlation-123")
        try:
            mock_session = MagicMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {}
            mock_response.text = "{}"
            mock_response.headers = {}
            mock_session.request.return_value = mock_response

            client = InsuranceHttpClient(
                base_url="https://api.test.com",
                session=mock_session,
                facility=sample_facility,
            )
            result = client.get("/test")
            audit = InsuranceOutboundCall.objects.get(pk=result.audit_id)
            assert audit.correlation_id == "test-correlation-123"
        finally:
            set_request_id(None)


# ===================================================================
# InsuranceOutboundCall model
# ===================================================================


class TestInsuranceOutboundCallModel:
    def test_create_audit_row(self, db, sample_facility, insurance_provider):
        row = InsuranceOutboundCall.objects.create(
            facility=sample_facility,
            provider=insurance_provider,
            method="POST",
            path="/claims/submit",
            base_url="https://api.test.com",
            status="SUCCESS",
            status_code=200,
            duration_ms=150,
        )
        assert row.pk is not None
        assert row.created_at is not None

    def test_ordering_by_created_at(self, db, sample_facility):
        InsuranceOutboundCall.objects.create(
            facility=sample_facility, method="GET", path="/a", status="SUCCESS"
        )
        InsuranceOutboundCall.objects.create(
            facility=sample_facility, method="GET", path="/b", status="SUCCESS"
        )
        rows = list(InsuranceOutboundCall.objects.all())
        assert rows[0].path == "/b"  # Most recent first


# ===================================================================
# InsuranceEligibilityService
# ===================================================================


class TestInsuranceEligibilityService:
    def test_verify_with_manual_adapter(self, provider_config, patient_insurance, sample_facility):
        from hmis.apps.insurance.services.insurance_services import InsuranceEligibilityService

        service = InsuranceEligibilityService()
        result = service.verify(patient_insurance, facility=sample_facility)
        assert result.eligible is True
        assert "Manual" in result.message

    def test_verify_not_configured_raises(self, patient_insurance, sample_facility):
        from hmis.apps.insurance.services.insurance_services import InsuranceEligibilityService

        service = InsuranceEligibilityService()
        with pytest.raises(InsuranceNotConfiguredError):
            service.verify(patient_insurance, facility=sample_facility)


# ===================================================================
# InsuranceClaimsService
# ===================================================================


class TestInsuranceClaimsService:
    def test_submit_with_manual_adapter(self, provider_config, insurance_claim):
        from hmis.apps.insurance.services.insurance_services import InsuranceClaimsService

        service = InsuranceClaimsService()
        result = service.submit(insurance_claim)
        # ManualAdapter returns success=False (manual submission required)
        assert result.success is False
        assert "Manual" in result.message

    def test_check_status_with_manual_adapter(self, provider_config, insurance_claim):
        from hmis.apps.insurance.services.insurance_services import InsuranceClaimsService

        service = InsuranceClaimsService()
        result = service.check_status(insurance_claim)
        assert result.success is True

    @patch("hmis.apps.insurance.services.adapters.InsuranceHttpClient.from_config")
    def test_submit_via_smart_claims(
        self,
        mock_from_config,
        insurance_claim,
        sample_facility,
        sample_organization,
        test_user,
    ):
        from hmis.apps.insurance.models import InsuranceProvider
        from hmis.apps.insurance.services.insurance_services import InsuranceClaimsService

        # Create a provider with a code NOT in the adapter registry
        provider = InsuranceProvider.objects.create(
            organization=sample_organization,
            name="Smart Claims Insurer",
            code="SMARTTEST",
            provider_type=InsuranceProvider.ProviderType.PRIVATE,
            status=InsuranceProvider.Status.ACTIVE,
        )
        config = InsuranceProviderConfig.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            provider=provider,
            api_enabled=True,
            api_base_url="https://api.test.com",
            api_auth_type="BEARER",
            api_credentials={"token": "test"},
        )
        # Point the claim at the new provider
        insurance_claim.provider = provider
        insurance_claim.save(update_fields=["provider"])

        mock_client = MagicMock()
        mock_client.post.return_value = InsuranceResponse(
            status_code=200,
            headers={},
            json={"claim_id": "EXT-001", "status": "SUBMITTED", "message": "ok"},
            text="",
        )
        mock_from_config.return_value = mock_client

        service = InsuranceClaimsService()
        result = service.submit(insurance_claim, user=test_user)
        assert result.success is True
        assert result.external_claim_id == "EXT-001"

        insurance_claim.refresh_from_db()
        assert insurance_claim.status == "SUBMITTED"
        assert insurance_claim.external_claim_id == "EXT-001"


# ===================================================================
# InsurancePreauthService
# ===================================================================


class TestInsurancePreauthService:
    def test_submit_with_manual_adapter(self, provider_config, insurance_preauth):
        from hmis.apps.insurance.services.insurance_services import InsurancePreauthService

        service = InsurancePreauthService()
        result = service.submit(insurance_preauth)
        assert result.success is False
        assert "Manual" in result.message

    def test_check_status_with_manual_adapter(self, provider_config, insurance_preauth):
        from hmis.apps.insurance.services.insurance_services import InsurancePreauthService

        service = InsurancePreauthService()
        result = service.check_status(insurance_preauth)
        assert result.success is True


# ===================================================================
# InsuranceRemittanceService
# ===================================================================


class TestInsuranceRemittanceService:
    def test_fetch_with_manual_adapter(self, provider_config):
        from hmis.apps.insurance.services.insurance_services import InsuranceRemittanceService

        service = InsuranceRemittanceService()
        result = service.fetch_and_reconcile(
            provider_config,
            date.today() - timedelta(days=30),
            date.today(),
        )
        assert result == []


# ===================================================================
# InsuranceExportService
# ===================================================================


class TestInsuranceExportService:
    def test_export_claims_csv(self, insurance_claim):
        from hmis.apps.insurance.services.insurance_services import InsuranceExportService

        csv_str = InsuranceExportService.export_claims_csv(
            InsuranceClaim.objects.filter(pk=insurance_claim.pk)
        )
        assert "Claim Number" in csv_str
        assert insurance_claim.claim_number in csv_str

    def test_export_claim_detail_csv(self, insurance_claim):
        from hmis.apps.insurance.models import InsuranceClaimItem
        from hmis.apps.insurance.services.insurance_services import InsuranceExportService

        InsuranceClaimItem.objects.create(
            claim=insurance_claim,
            service_description="Consultation",
            service_code="CONS-001",
            quantity=1,
            unit_price=Decimal("1500.00"),
            claimed_amount=Decimal("1500.00"),
        )
        csv_str = InsuranceExportService.export_claim_detail_csv(insurance_claim)
        assert insurance_claim.claim_number in csv_str
        assert "CONS-001" in csv_str


# ===================================================================
# Celery tasks
# ===================================================================


class TestCeleryTasks:
    def test_check_pending_claims_no_claims(self, db):
        from hmis.apps.insurance.tasks import check_pending_claims_status

        result = check_pending_claims_status()
        assert "Polled 0" in result

    def test_check_expiring_preauths_no_preauths(self, db):
        from hmis.apps.insurance.tasks import check_expiring_preauths

        result = check_expiring_preauths()
        assert "Expired 0" in result

    def test_fetch_remittances_no_configs(self, db):
        from hmis.apps.insurance.tasks import fetch_remittances

        result = fetch_remittances()
        assert "Fetched 0" in result

    def test_check_expiring_enrollments_no_enrollments(self, db):
        from hmis.apps.insurance.tasks import check_expiring_enrollments

        result = check_expiring_enrollments()
        assert "Alerted 0" in result

    def test_check_expiring_preauths_expires_overdue(self, db, insurance_preauth):
        from django.utils import timezone

        from hmis.apps.insurance.tasks import check_expiring_preauths

        # Must transition to SUBMITTED then APPROVED first
        insurance_preauth.submit()
        insurance_preauth.approve(
            approved_amount=Decimal("40000.00"),
            validity_days=7,
        )
        # Now set expiry in the past
        insurance_preauth.expires_at = timezone.now() - timedelta(hours=1)
        insurance_preauth.save(update_fields=["expires_at"])

        result = check_expiring_preauths()
        assert "Expired 1" in result

        insurance_preauth.refresh_from_db()
        assert insurance_preauth.status == "expired"

    def test_check_expiring_enrollments_alerts(self, db, patient_insurance):
        from hmis.apps.insurance.tasks import check_expiring_enrollments

        # Set enrollment to expire in 15 days
        patient_insurance.valid_to = date.today() + timedelta(days=15)
        patient_insurance.save()

        with patch("hmis.apps.core.events.publish_event") as mock_publish:
            result = check_expiring_enrollments()
            assert "Alerted 1" in result
            mock_publish.assert_called_once()

    def test_check_pending_claims_polls_api_enabled(
        self,
        db,
        insurance_claim,
        insurance_provider,
        provider_config,
    ):
        from hmis.apps.insurance.tasks import check_pending_claims_status

        # Enable API and set claim to SUBMITTED with external ID
        insurance_provider.api_integration_enabled = True
        insurance_provider.save()
        provider_config.api_enabled = True
        provider_config.save()
        insurance_claim.status = InsuranceClaim.Status.SUBMITTED
        insurance_claim.external_claim_id = "EXT-001"
        insurance_claim.save()

        # ManualAdapter.check_claim_status returns success=True, same status
        result = check_pending_claims_status()
        assert "Polled 1" in result
