<!-- M-Pesa merchant configuration guide. Use when configuring facility payments;
     inputs are FacilityBillingConfig fields and existing MPESA_* sandbox settings. -->
# M-Pesa facility credential isolation

Live Daraja transactions always use the selected facility's merchant credentials.
Missing live credentials return HTTP 503 with `code: mpesa_configuration_error`
before any OAuth or payment request is made. Global live merchant credentials
are never used as a fallback, including on staging.

## Deployment policy

`MPESA_SANDBOX_ALLOWED` is a settings-module policy, not an environment-variable
override. Development, test, and staging settings enable it. Production and hub
settings inherit the disabled default.

- Production/hub: select `production` on each facility and configure its consumer
  key, consumer secret, passkey, and shortcode.
- Development/testing/staging: sandbox facilities can use shared sandbox
  settings when global `MPESA_ENVIRONMENT=sandbox`. Sandbox requests always use
  Safaricom's sandbox gateway, irrespective of `MPESA_BASE_URL`.
- A facility configured for production must have all four merchant credentials,
  even in development or staging. An incomplete live configuration never falls
  through to another merchant or to sandbox.
- Callback URLs may share the application's global `MPESA_CALLBACK_URL`: this is
  a delivery endpoint, not a merchant account credential.

## Manual transaction verification

The Transaction Status API additionally requires a facility's
`mpesa_initiator_name` and `mpesa_security_credential`. Configure these through
`PATCH /api/billing/facility-configs/{id}/` along with other facility settings.
The security credential is write-only and encrypted through KMS. Omitting it
or sending an empty value during PATCH preserves the saved secret, matching the
other credential fields. Migration `0073_mpesa_facility_verification_credentials`
adds these fields without copying global secrets to tenants.

`POST /api/billing/mpesa/verify/` uses the authorized active facility context
(including the existing `X-Facility-ID` selection). STK push also requires the
invoice and payment point to belong to that facility. Query responses are scoped
before reading cached payment data. Unmatched callbacks are acknowledged with a
failure result without constructing an unscoped service.

## Verification

Run from `backend/`:

```bash
poetry run pytest tests/billing/test_mpesa_multitenant.py tests/billing/test_mpesa_verify.py tests/billing/test_services/test_mpesa.py tests/billing/test_api/test_payment_api.py tests/billing/test_facility_billing_config.py --no-cov
poetry run python manage.py migrate
```
