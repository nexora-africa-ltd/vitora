"""
Tests for multi-tenant M-Pesa support.

Verifies that MpesaService can load credentials per-facility from
FacilityBillingConfig, falling back to global settings when no
facility-level config exists.
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from rest_framework import status

from hmis.apps.billing.models import FacilityBillingConfig, Invoice, Payment, PaymentPoint
from hmis.apps.billing.services.mpesa import MpesaService
from hmis.apps.core.models import County, Facility, Organization, SubCounty

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def org_a(db):
    return Organization.objects.create(name="Org A", slug="org-a")


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Org B", slug="org-b")


@pytest.fixture
def mt_county(db):
    return County.objects.create(code=99, name="Test County")


@pytest.fixture
def mt_sub_county(db, mt_county):
    return SubCounty.objects.create(county=mt_county, name="Test Sub-County")


@pytest.fixture
def facility_a(db, org_a, mt_county, mt_sub_county):
    return Facility.objects.create(
        organization=org_a,
        mfl_code="FA001",
        name="Facility A",
        county=mt_county,
        sub_county=mt_sub_county,
    )


@pytest.fixture
def facility_b(db, org_b, mt_county, mt_sub_county):
    return Facility.objects.create(
        organization=org_b,
        mfl_code="FB002",
        name="Facility B",
        county=mt_county,
        sub_county=mt_sub_county,
    )


@pytest.fixture
def config_a(db, facility_a):
    """FacilityBillingConfig with M-Pesa credentials for Facility A."""
    return FacilityBillingConfig.objects.create(
        facility=facility_a,
        mpesa_consumer_key="key_facility_a",
        mpesa_consumer_secret="secret_facility_a",
        mpesa_passkey="passkey_facility_a",
        mpesa_shortcode="100001",
        mpesa_callback_url="https://facility-a.example.com/api/billing/mpesa/callback/",
        mpesa_environment="sandbox",
    )


@pytest.fixture
def config_b(db, facility_b):
    """FacilityBillingConfig with M-Pesa credentials for Facility B."""
    return FacilityBillingConfig.objects.create(
        facility=facility_b,
        mpesa_consumer_key="key_facility_b",
        mpesa_consumer_secret="secret_facility_b",
        mpesa_passkey="passkey_facility_b",
        mpesa_shortcode="200002",
        mpesa_callback_url="https://facility-b.example.com/api/billing/mpesa/callback/",
        mpesa_environment="sandbox",
    )


# ============================================================================
# MpesaService credential resolution
# ============================================================================


class TestMpesaServiceCredentialResolution:
    """MpesaService should resolve credentials per-facility."""

    def test_facility_credentials_used_when_provided(self, config_a, facility_a):
        """Service should use facility-specific credentials when facility is given."""
        service = MpesaService(facility=facility_a)

        assert service.consumer_key == "key_facility_a"
        assert service.consumer_secret == "secret_facility_a"
        assert service.passkey == "passkey_facility_a"
        assert service.shortcode == "100001"
        assert service.callback_url == "https://facility-a.example.com/api/billing/mpesa/callback/"

    def test_different_facilities_get_different_credentials(
        self, config_a, config_b, facility_a, facility_b
    ):
        """Two facilities should get their own M-Pesa credentials."""
        service_a = MpesaService(facility=facility_a)
        service_b = MpesaService(facility=facility_b)

        assert service_a.consumer_key == "key_facility_a"
        assert service_b.consumer_key == "key_facility_b"
        assert service_a.shortcode != service_b.shortcode

    @patch("hmis.apps.billing.services.mpesa.settings")
    def test_falls_back_to_global_settings_when_no_facility(self, mock_settings):
        """Without a facility, service should use global settings from django.conf."""
        mock_settings.MPESA_CONSUMER_KEY = "global_key"
        mock_settings.MPESA_CONSUMER_SECRET = "global_secret"
        mock_settings.MPESA_PASSKEY = "global_passkey"
        mock_settings.MPESA_SHORTCODE = "174379"
        mock_settings.MPESA_CALLBACK_URL = "https://global.example.com/callback/"
        mock_settings.MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"

        service = MpesaService()

        assert service.consumer_key == "global_key"
        assert service.consumer_secret == "global_secret"
        assert service.shortcode == "174379"

    @patch("hmis.apps.billing.services.mpesa.settings")
    def test_falls_back_to_global_when_facility_has_no_config(self, mock_settings, facility_a):
        """If facility exists but has no billing config, fall back to global."""
        mock_settings.MPESA_CONSUMER_KEY = "global_key"
        mock_settings.MPESA_CONSUMER_SECRET = "global_secret"
        mock_settings.MPESA_PASSKEY = "global_passkey"
        mock_settings.MPESA_SHORTCODE = "174379"
        mock_settings.MPESA_CALLBACK_URL = "https://global.example.com/callback/"
        mock_settings.MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"

        # facility_a has no FacilityBillingConfig yet
        service = MpesaService(facility=facility_a)

        assert service.consumer_key == "global_key"
        assert service.shortcode == "174379"

    @patch("hmis.apps.billing.services.mpesa.settings")
    def test_falls_back_to_global_when_facility_config_has_empty_credentials(
        self, mock_settings, facility_a
    ):
        """If config exists but M-Pesa fields are blank, fall back to global."""
        mock_settings.MPESA_CONSUMER_KEY = "global_key"
        mock_settings.MPESA_CONSUMER_SECRET = "global_secret"
        mock_settings.MPESA_PASSKEY = "global_passkey"
        mock_settings.MPESA_SHORTCODE = "174379"
        mock_settings.MPESA_CALLBACK_URL = "https://global.example.com/callback/"
        mock_settings.MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"

        # Config exists but mpesa fields are empty
        FacilityBillingConfig.objects.create(facility=facility_a)

        service = MpesaService(facility=facility_a)

        assert service.consumer_key == "global_key"
        assert service.shortcode == "174379"

    @patch("hmis.apps.billing.services.mpesa.settings")
    def test_sandbox_uses_global_shortcode_and_passkey_when_empty(self, mock_settings, facility_a):
        """Sandbox config with only key+secret should fall back to global shortcode/passkey."""
        mock_settings.MPESA_PASSKEY = "global_sandbox_passkey"
        mock_settings.MPESA_SHORTCODE = "174379"
        mock_settings.MPESA_CALLBACK_URL = "https://global.example.com/callback/"
        mock_settings.MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"

        FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_consumer_key="sandbox_key",
            mpesa_consumer_secret="sandbox_secret",
            mpesa_environment="sandbox",
            # shortcode and passkey intentionally blank
        )

        service = MpesaService(facility=facility_a)

        assert service.consumer_key == "sandbox_key"
        assert service.consumer_secret == "sandbox_secret"
        assert service.shortcode == "174379"  # Global fallback
        assert service.passkey == "global_sandbox_passkey"  # Global fallback

    def test_stk_push_uses_facility_shortcode(self, config_a, facility_a):
        """STK Push payload should use the facility's shortcode."""
        service = MpesaService(facility=facility_a)

        # Mock the HTTP call
        with patch.object(service, "get_access_token", return_value="mock_token"):
            with patch("hmis.apps.billing.services.mpesa.requests.post") as mock_post:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "ResponseCode": "0",
                    "ResponseDescription": "Success",
                    "MerchantRequestID": "MR123",
                    "CheckoutRequestID": "CR123",
                    "CustomerMessage": "Success",
                }
                mock_response.raise_for_status = MagicMock()
                mock_post.return_value = mock_response

                service.initiate_stk_push(
                    phone_number="254712345678",
                    amount=Decimal("500.00"),
                    account_reference="INV-001",
                    transaction_desc="Test payment",
                )

                # Verify the payload uses facility shortcode
                call_kwargs = mock_post.call_args
                payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
                assert payload["BusinessShortCode"] == "100001"
                assert payload["PartyB"] == "100001"
                assert payload["CallBackURL"] == (
                    "https://facility-a.example.com/api/billing/mpesa/callback/"
                )

    def test_query_uses_facility_shortcode(self, config_a, facility_a):
        """Transaction query should use the facility's shortcode."""
        service = MpesaService(facility=facility_a)

        with patch.object(service, "get_access_token", return_value="mock_token"):
            with patch("hmis.apps.billing.services.mpesa.requests.post") as mock_post:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "ResponseCode": "0",
                    "ResponseDescription": "Success",
                    "ResultCode": "0",
                    "ResultDesc": "Success",
                }
                mock_response.raise_for_status = MagicMock()
                mock_post.return_value = mock_response

                service.query_transaction_status("CR123")

                call_kwargs = mock_post.call_args
                payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
                assert payload["BusinessShortCode"] == "100001"


# ============================================================================
# MpesaViewSet integration — facility is resolved from invoice
# ============================================================================


class TestMpesaViewSetMultiTenant:
    """MpesaViewSet should pass facility context to MpesaService."""

    @pytest.fixture
    def invoice_a(self, db, facility_a, sample_patient, billing_user):
        """Invoice scoped to facility_a."""
        return Invoice.objects.create(
            patient=sample_patient,
            facility=facility_a,
            organization=facility_a.organization,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PENDING,
            payment_type=Invoice.PaymentType.MPESA,
            subtotal=Decimal("500.00"),
            total_amount=Decimal("500.00"),
            balance_due=Decimal("500.00"),
            created_by=billing_user,
        )

    @pytest.fixture
    def mpesa_payment_point(self, db, billing_user):
        return PaymentPoint.objects.create(
            name="M-Pesa Till",
            code="MPESA-MT01",
            method=Payment.Method.MPESA,
            till_number="999999",
            created_by=billing_user,
        )

    @patch("hmis.apps.billing.services.MpesaService")
    def test_initiate_passes_facility_to_service(
        self,
        MockMpesaService,
        authenticated_client,
        invoice_a,
        mpesa_payment_point,
        config_a,
        facility_a,
    ):
        """Initiate endpoint should instantiate MpesaService with the invoice's facility."""
        mock_service_instance = MagicMock()
        mock_service_instance.format_phone.return_value = "254712345678"
        mock_service_instance.initiate_stk_push.return_value = {
            "MerchantRequestID": "MR123",
            "CheckoutRequestID": "CR123",
            "ResponseCode": "0",
            "ResponseDescription": "Success",
            "CustomerMessage": "Success",
        }
        MockMpesaService.return_value = mock_service_instance

        response = authenticated_client.post(
            "/api/billing/mpesa/initiate/",
            {
                "invoice_id": invoice_a.id,
                "phone_number": "0712345678",
                "amount": "500.00",
                "payment_point": mpesa_payment_point.id,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify MpesaService was constructed with facility
        MockMpesaService.assert_called_once_with(facility=facility_a)

    @patch("hmis.apps.billing.services.MpesaService")
    def test_callback_passes_facility_to_service(
        self,
        MockMpesaService,
        api_client,
        invoice_a,
        mpesa_payment_point,
        billing_user,
        facility_a,
        config_a,
    ):
        """Callback should instantiate MpesaService with the payment's facility."""
        # Create a pending M-Pesa payment
        payment = Payment.objects.create(
            invoice=invoice_a,
            payment_point=mpesa_payment_point,
            method=Payment.Method.MPESA,
            amount=Decimal("500.00"),
            mpesa_phone="254712345678",
            mpesa_transaction_id="CR-CALLBACK-123",
            status=Payment.Status.PENDING,
            payment_details={"checkout_request_id": "CR-CALLBACK-123"},
            received_by=billing_user,
        )

        mock_service_instance = MagicMock()
        mock_service_instance.process_callback.return_value = {
            "success": True,
            "result_code": 0,
            "result_description": "Success",
            "merchant_request_id": "MR123",
            "checkout_request_id": "CR-CALLBACK-123",
            "amount": 500,
            "mpesa_receipt_number": "REC123",
            "transaction_date": "20260329120000",
            "phone_number": "254712345678",
        }
        MockMpesaService.return_value = mock_service_instance

        callback_data = {
            "Body": {
                "stkCallback": {
                    "MerchantRequestID": "MR123",
                    "CheckoutRequestID": "CR-CALLBACK-123",
                    "ResultCode": 0,
                    "ResultDesc": "Success",
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": 500},
                            {"Name": "MpesaReceiptNumber", "Value": "REC123"},
                            {"Name": "TransactionDate", "Value": "20260329120000"},
                            {"Name": "PhoneNumber", "Value": "254712345678"},
                        ]
                    },
                }
            }
        }

        response = api_client.post(
            "/api/billing/mpesa/callback/",
            callback_data,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        # Callback resolves facility from the payment's invoice
        MockMpesaService.assert_called_once_with(facility=facility_a)


# ============================================================================
# Model field tests
# ============================================================================


class TestFacilityBillingConfigMpesaFields:
    """FacilityBillingConfig should store per-facility M-Pesa credentials."""

    def test_mpesa_credential_fields_exist(self, facility_a):
        """Config should have all M-Pesa credential fields."""
        config = FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_consumer_key="test_key",
            mpesa_consumer_secret="test_secret",
            mpesa_passkey="test_passkey",
            mpesa_shortcode="174379",
            mpesa_callback_url="https://example.com/callback/",
            mpesa_environment="sandbox",
        )

        config.refresh_from_db()
        assert config.mpesa_consumer_key == "test_key"
        assert config.mpesa_consumer_secret == "test_secret"
        assert config.mpesa_passkey == "test_passkey"
        assert config.mpesa_shortcode == "174379"
        assert config.mpesa_callback_url == "https://example.com/callback/"
        assert config.mpesa_environment == "sandbox"

    def test_mpesa_fields_default_to_blank(self, facility_a):
        """M-Pesa fields should default to empty strings."""
        config = FacilityBillingConfig.objects.create(facility=facility_a)
        config.refresh_from_db()

        assert config.mpesa_consumer_key == ""
        assert config.mpesa_consumer_secret == ""
        assert config.mpesa_passkey == ""
        assert config.mpesa_shortcode == ""
        assert config.mpesa_callback_url == ""
        assert config.mpesa_environment == "sandbox"

    def test_mpesa_environment_choices(self, facility_a):
        """Environment should only accept 'sandbox' or 'production'."""
        config = FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_environment="production",
        )
        config.refresh_from_db()
        assert config.mpesa_environment == "production"

    def test_has_mpesa_credentials_property(self, config_a, facility_a):
        """Config should report whether complete M-Pesa credentials are set."""
        assert config_a.has_mpesa_credentials is True

    def test_has_mpesa_credentials_false_when_empty(self, facility_a):
        """Property should return False when credentials are not set."""
        config = FacilityBillingConfig.objects.create(facility=facility_a)
        assert config.has_mpesa_credentials is False

    def test_has_mpesa_credentials_false_when_partial(self, facility_a):
        """Property should return False when only some credentials are set."""
        config = FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_consumer_key="key_only",
        )
        assert config.has_mpesa_credentials is False

    def test_sandbox_only_needs_key_and_secret(self, facility_a):
        """In sandbox, consumer_key + consumer_secret are sufficient."""
        config = FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_consumer_key="sandbox_key",
            mpesa_consumer_secret="sandbox_secret",
            mpesa_environment="sandbox",
            # shortcode and passkey intentionally omitted
        )
        assert config.has_mpesa_credentials is True

    def test_production_requires_all_four_fields(self, facility_a):
        """In production, shortcode + passkey are also required."""
        config = FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_consumer_key="prod_key",
            mpesa_consumer_secret="prod_secret",
            mpesa_environment="production",
            # Missing shortcode and passkey
        )
        assert config.has_mpesa_credentials is False

    def test_production_with_all_four_returns_true(self, facility_a):
        """Production with all credentials should return True."""
        config = FacilityBillingConfig.objects.create(
            facility=facility_a,
            mpesa_consumer_key="prod_key",
            mpesa_consumer_secret="prod_secret",
            mpesa_passkey="prod_passkey",
            mpesa_shortcode="600000",
            mpesa_environment="production",
        )
        assert config.has_mpesa_credentials is True
