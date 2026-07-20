# Vitora Pricing Feature Matrix

Last updated: 2026-07-20

This matrix is intended to be the pricing-logic reference for tier gating.

Sources of truth:
- `backend/hmis/apps/core/management/commands/seed_subscription_plans.py` (plan prices, limits, and enabled features)
- `backend/hmis/apps/core/models.py` (`SubscriptionPlan.FEATURE_REGISTRY` canonical feature keys)

## Plan Limits And Commercial Inputs

| Plan Code | Plan Name | Monthly Price (KES) | Annual Price (KES) | Max Facilities | Max Users | Max Patients | Monthly AI Tokens | Trial (Days) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| FREE | Free Pilot | 0.00 | 0.00 | 1 | 5 | 100 | 0 | 14 |
| BASIC | Clinic | 8,999.00 | 89,990.00 | 1 | 10 | Unlimited | 50,000 | 0 |
| PROFESSIONAL | Hospital | 49,999.00 | 499,990.00 | 3 | 50 | Unlimited | 200,000 | 0 |
| ENTERPRISE | Enterprise | 80,000.00 | 800,000.00 | Unlimited | Unlimited | Unlimited | Unlimited | 0 |

## Feature Availability Matrix (Canonical Keys)

Legend:
- `Yes` = enabled for the plan in current seed data
- `No` = disabled or not explicitly set for the plan in current seed data

| Category | Feature Key | Feature Name | FREE | BASIC | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|---|---|---|
| Core Clinical | `outpatient` | Outpatient (OPD) | Yes | Yes | Yes | Yes |
| Core Clinical | `inpatient` | Inpatient (IPD) | No | No | Yes | Yes |
| Core Clinical | `emergency` | Emergency / Casualty | No | Yes | Yes | Yes |
| Core Clinical | `pharmacy` | Pharmacy | Yes | Yes | Yes | Yes |
| Core Clinical | `laboratory` | Laboratory | No | No | Yes | Yes |
| Core Clinical | `imaging` | Imaging / Radiology | No | No | Yes | Yes |
| Core Clinical | `theatre` | Surgical Theatre | No | No | Yes | Yes |
| Core Clinical | `dialysis` | Renal Dialysis | No | No | No | Yes |
| Core Clinical | `icu` | ICU | No | No | Yes | Yes |
| Core Clinical | `maternity` | Maternity / Obstetrics | No | No | Yes | Yes |
| Core Clinical | `mortuary` | Mortuary | No | No | No | Yes |
| Core Clinical | `blood_bank` | Blood Bank | No | No | No | Yes |
| Operations | `inventory` | Inventory / Supply Chain | No | Yes | Yes | Yes |
| Operations | `billing` | Billing and Invoicing | Yes | Yes | Yes | Yes |
| Operations | `scheduling` | Staff Rostering and Scheduling | No | Yes | Yes | Yes |
| Clinical Add-On | `triage` | Triage / Acuity Scoring | No | No | No | No |
| Public Health | `surveillance` | Disease Surveillance / IDSR | No | No | No | No |
| Public Health | `immunizations` | Immunizations / Vaccination | No | No | No | No |
| Allied Health | `allied_health` | Allied Health (Physio, Nutrition, etc.) | No | No | No | No |
| Quality | `quality` | Quality Improvement and Clinical Audit | No | No | No | No |
| Insurance | `private_insurance` | Private Insurance Claims | No | No | No | No |
| Reporting | `moh_reporting` | MOH 705/711/717 Aggregate Reporting | No | No | No | No |
| Standalone SKU | `lis_standalone` | Standalone Laboratory (LIS) | No | No | No | No |
| Standalone SKU | `pharmacy_standalone` | Standalone Pharmacy / Retail | No | No | No | No |
| Standalone SKU | `imaging_standalone` | Standalone Imaging / RIS | No | No | No | No |
| Platform | `ai_assistant` | AI Assistant (TibaBot) | No | No | Yes | Yes |
| Platform | `sha_claims` | SHA Claims Integration | No | Yes | Yes | Yes |
| Platform | `dhis2_reporting` | DHIS2 / KHIS Reporting | No | Yes | Yes | Yes |
| Platform | `analytics` | Analytics and BI Dashboards | No | No | No | No |
| Platform | `api_access` | API Access | No | No | Yes | Yes |
| Platform | `custom_reports` | Custom Reports | No | No | Yes | Yes |
| Platform | `offline_sync` | Offline Sync | No | Yes | Yes | Yes |
| Platform | `sms_notifications` | SMS and WhatsApp Notifications | No | No | Yes | Yes |

## Pricing Logic Notes

- Treat any missing key in a plan's `features` JSON as `No`.
- `Organization.has_feature(feature_key)` resolves access from `subscription_plan.features`.
- If an org has no linked plan, fallback baseline is: `outpatient`, `pharmacy`, `billing`.

## Unmapped Features In Current Seed Plans

These canonical feature keys are currently `No` across all four seeded plans and need product/commercial decisions before hard pricing rollout:

- `triage`
- `surveillance`
- `immunizations`
- `allied_health`
- `quality`
- `private_insurance`
- `moh_reporting`
- `lis_standalone`
- `pharmacy_standalone`
- `imaging_standalone`
- `analytics`
