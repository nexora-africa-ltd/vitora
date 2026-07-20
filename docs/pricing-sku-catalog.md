# Vitora SKU Catalog For Cart Pricing

Last updated: 2026-07-20

This document defines a cart-ready pricing model where customers buy a base platform and add module SKUs.

All feature keys map to `SubscriptionPlan.features` keys in backend plan logic.

## 1) Pricing Model

- Required: `base_platform`
- Optional: module SKUs (`inpatient`, `laboratory`, `imaging`, etc.)
- Optional: platform SKUs (`ai_assistant`, `api_access`, `custom_reports`, etc.)
- Usage meters: AI tokens, SMS/WhatsApp, API overage
- Bundle discounts: automatic when qualifying SKU sets are present

## 2) Base SKU

| SKU Code | SKU Name | Monthly (KES) | Annual (KES) | Included |
|---|---|---:|---:|---|
| `base_platform` | Core Platform (Clinic package) | 8,999 | 89,990 | `outpatient`, `emergency`, `pharmacy`, `inventory`, `billing`, `scheduling`, `sha_claims`, `dhis2_reporting`, `offline_sync` |

## 3) Clinical Module SKUs

| SKU Code | Feature Key | Monthly (KES) | Annual (KES) | Depends On |
|---|---|---:|---:|---|
| `mod_emergency` | `emergency` | 0 | 0 | Included in base |
| `mod_inpatient` | `inpatient` | 10,000 | 100,000 | - |
| `mod_laboratory` | `laboratory` | 8,000 | 80,000 | - |
| `mod_imaging` | `imaging` | 7,000 | 70,000 | - |
| `mod_theatre` | `theatre` | 6,000 | 60,000 | `inpatient` |
| `mod_dialysis` | `dialysis` | 10,000 | 100,000 | `inpatient` |
| `mod_icu` | `icu` | 4,000 | 40,000 | `inpatient` |
| `mod_maternity` | `maternity` | 3,000 | 30,000 | `inpatient` |
| `mod_mortuary` | `mortuary` | 3,000 | 30,000 | `inpatient` |
| `mod_blood_bank` | `blood_bank` | 5,000 | 50,000 | `laboratory` |
| `mod_inventory` | `inventory` | 0 | 0 | Included in base |
| `mod_scheduling` | `scheduling` | 0 | 0 | Included in base |

## 4) Public Health And Extended Clinical SKUs

| SKU Code | Feature Key | Monthly (KES) | Annual (KES) | Depends On |
|---|---|---:|---:|---|
| `mod_triage` | `triage` | 2,500 | 25,000 | `emergency` or `outpatient` |
| `mod_surveillance` | `surveillance` | 4,500 | 45,000 | `dhis2_reporting` |
| `mod_immunizations` | `immunizations` | 3,500 | 35,000 | `outpatient` |
| `mod_allied_health` | `allied_health` | 4,000 | 40,000 | `outpatient` |
| `mod_quality` | `quality` | 3,000 | 30,000 | - |
| `mod_private_insurance` | `private_insurance` | 5,500 | 55,000 | `billing` |
| `mod_moh_reporting` | `moh_reporting` | 4,000 | 40,000 | `dhis2_reporting` |

## 5) Platform And Integration SKUs

| SKU Code | Feature Key | Monthly (KES) | Annual (KES) | Included Usage |
|---|---|---:|---:|---|
| `plat_sha_claims` | `sha_claims` | 0 | 0 | Included in base |
| `plat_dhis2_reporting` | `dhis2_reporting` | 0 | 0 | Included in base |
| `plat_ai_assistant` | `ai_assistant` | 1,500 | 15,000 | 100,000 AI tokens/month |
| `plat_analytics` | `analytics` | 500 | 5,000 | Standard BI dashboards |
| `plat_api_access` | `api_access` | 300 | 3,000 | 200,000 API calls/month |
| `plat_custom_reports` | `custom_reports` | 300 | 3,000 | 5 custom report templates |
| `plat_offline_sync` | `offline_sync` | 0 | 0 | Included in base |
| `plat_sms_notifications` | `sms_notifications` | 400 | 4,000 | 5,000 SMS/WhatsApp messages/month |

## 6) Standalone SKU Family

| SKU Code | Feature Key | Monthly (KES) | Annual (KES) | Notes |
|---|---|---:|---:|---|
| `std_lis` | `lis_standalone` | 15,000 | 150,000 | Standalone lab license |
| `std_pharmacy` | `pharmacy_standalone` | 12,000 | 120,000 | Standalone pharmacy license |
| `std_imaging` | `imaging_standalone` | 18,000 | 180,000 | Standalone imaging/RIS license |

## 7) Usage Meters

| Meter | Included | Overage Price |
|---|---:|---:|
| AI tokens | From `plat_ai_assistant` or plan quota | KES 0.06 per token |
| SMS/WhatsApp | From `plat_sms_notifications` | KES 2.50 per message |
| API calls | From `plat_api_access` | KES 0.03 per call |

## 8) Bundle Presets (Cart Templates)

| Template | Included SKUs | Monthly Before Discount (KES) | Discount |
|---|---|---:|---:|
| `clinic_bundle` | `base_platform` | 8,999 | 0 |
| `hospital_bundle` | `base_platform`, `mod_inpatient`, `mod_laboratory`, `mod_imaging`, `mod_theatre`, `mod_icu`, `mod_maternity`, `plat_ai_assistant`, `plat_analytics`, `plat_api_access`, `plat_custom_reports`, `plat_sms_notifications` | 49,999 | 0 |
| `enterprise_bundle` | `hospital_bundle` + `mod_dialysis`, `mod_mortuary`, `mod_blood_bank`, `mod_surveillance`, `mod_quality`, `mod_private_insurance`, `mod_moh_reporting`, `plat_analytics` | 116,000 | Negotiated |

## 9) Quantity Rules

- Facility pack: first facility included in base; extra facilities at KES 4,000 each/month.
- User pack: first 10 users included in base; extra users at KES 800 each/month.
- Annual billing discount: 2 months free equivalent (pay 10x monthly).

## 10) Dependency Rules

Hard rules to enforce in cart and backend:

- `sha_claims` requires `billing`
- `theatre` requires `inpatient`
- `dialysis` requires `inpatient`
- `blood_bank` requires `laboratory`
- `surveillance` requires `dhis2_reporting`
- `moh_reporting` requires `dhis2_reporting`
- `custom_reports` requires `analytics`

## 11) Pricing Formula

```text
monthly_total =
  base_fee
  + sum(module_skus)
  + sum(platform_skus)
  + quantity_overages
  + usage_overages
  - bundle_discounts
```

## 12) Implementation Notes

- Persist selected SKUs as line items, not just one tier string.
- Compute `features` from purchased SKUs at subscription activation time.
- Keep existing tier plans (`FREE`, `BASIC`, `PROFESSIONAL`, `ENTERPRISE`) as pre-packaged templates for sales-led onboarding.
