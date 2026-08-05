# HealthCloud (Slade360) Sprint 0 Artifacts

## Scope

This document captures the Sprint 0 outputs needed to start implementation safely:

- endpoint and payload mapping decisions
- unresolved integration constraints
- approved fallback behavior
- delivery assumptions for Sprint 1

---

## 1. Locked Endpoint Map (Build Scope)

- OAuth token: `POST /oauth2/token/` (auth host)
- Eligibility: `GET /beneficiaries/member_eligibility/` (provider-edi host)
- OTP request: `POST /beneficiaries/beneficiary_contacts/{contact_id}/send_otp/` (provider-edi)
- Start visit: `POST /authorizations/start_visit/` (provider-is)
- Validate auth token: `POST /authorizations/validate_authorization_token/` (provider-is)
- Reserve balance: `POST /balances/reservations/reserve_from_authorization/` (provider-edi)
- Submit claim: `POST /claims/` (provider-is)
- Claim attachment: `POST /claim_attachments/upload_attachment/` (provider-is)
- Submit invoice: `POST /invoices/` (provider-is)
- Invoice attachment: `POST /invoice_attachments/upload_attachment/` (provider-is)
- Submit credit note: `POST /invoices` with `invoice_type=CREDIT_NOTE` (provider-is)
- List remittances: `GET /remittances/` (provider-edi)
- Claim remittance: `GET /remittances/claim_remittance/?claim_id=` (provider-edi)

---

## 2. Data Mapping Decisions

- Internal payer linkage uses `InsuranceProviderConfig.payer_slade_code`.
- HealthCloud host separation is stored per config:
  - `auth_base_url`
  - `provider_edi_base_url`
  - `provider_is_base_url`
- Visit authorization is modeled explicitly (new `InsuranceVisitAuthorization`).
- Benefit reservations are modeled explicitly (new `InsuranceBalanceReservation`).
- Idempotent external execution log is modeled explicitly (new `InsuranceExternalSync`).

---

## 3. Preauth Gap Decision

Current public HealthCloud OAS does not publish a preauthorization endpoint.

Approved Sprint 0 fallback:

- keep existing `InsurancePreauth` domain model for payer workflows that need it
- mark HealthCloud preauth adapter calls as "not supported" for now
- continue with eligibility + authorization + reservation controls as the operational guard
- revisit once Slade provides preauth API contract

---

## 4. Security/Compliance Decisions

- Credentials remain in encrypted fields on `InsuranceProviderConfig`.
- OAuth access tokens are cached in server cache with early refresh.
- Outbound call audit persists redacted payloads through `InsuranceOutboundCall`.
- Correlation IDs remain mandatory on outbound requests.

---

## 5. Sprint 1 Build Readiness Checklist

- [x] endpoint map locked
- [x] model additions approved
- [x] preauth fallback approved
- [x] environment host model approved
- [x] idempotency model approved
