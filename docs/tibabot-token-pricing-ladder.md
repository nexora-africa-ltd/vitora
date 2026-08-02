# TibaBot Token Pricing Ladder (Basic/Pro/Enterprise)

Last updated: 2026-08-02

This draft ties token allocations to the current seeded subscription plans in:
- `backend/hmis/apps/core/management/commands/seed_subscription_plans.py`
- `docs/pricing-feature-matrix.md`

## Assumptions

- Currency: KES
- Token meter: combined input + output tokens
- Overage billing unit: per 1,000,000 tokens (1M)
- Plan names mapped to seeded codes:
  - Basic = `BASIC` (Clinic)
  - Pro = `PROFESSIONAL` (Hospital)
  - Enterprise = `ENTERPRISE`

## Recommended Price Points

| Usage Class | Overage Price (KES / 1M tokens) | Intended Workloads |
|---|---:|---|
| Standard AI | 600 | Clinical chat, triage assist, documentation support |
| Premium AI | 2,800 | Heavier reasoning workflows and advanced specialty analysis |

## Plan Ladder (Included + Overage)

| Plan | Seeded Monthly Plan Price (KES) | Included Tokens / Month | Standard Overage (KES / 1M) | Premium Overage (KES / 1M) | Recommended Overage Policy |
|---|---:|---:|---:|---:|---|
| Basic (`BASIC`) | 8,999 | 50,000 | 700 | 3,200 | Pay-as-you-go overage, billed monthly |
| Pro (`PROFESSIONAL`) | 49,999 | 200,000 | 600 | 2,800 | Pay-as-you-go overage, billed monthly |
| Enterprise (`ENTERPRISE`) | 80,000 (base) | 1,000,000 bundled baseline* | 500 (or custom) | 2,400 (or custom) | Contracted commit + custom overage schedule |

\* `ENTERPRISE` is currently seeded as unlimited (`monthly_ai_tokens = None`).
For invoicing clarity, use a contracted "included baseline" (e.g., 1M/month) in MSA/SOW while retaining flexibility for negotiated limits.

## Why This Ladder

- Basic has a small premium over base rates to protect margin at low volume.
- Pro uses benchmark rates from the recommended default (600 / 2,800).
- Enterprise gets volume discounts and contractual flexibility.

## Suggested Commercial Guardrails

- Alert thresholds at 80%, 95%, and 100% of included tokens.
- Hard-stop optional; default to soft overage to avoid clinical workflow interruption.
- Overage line items separated by class (`standard_tokens`, `premium_tokens`).
- Enterprise contracts can swap pay-as-you-go for prepaid token commits (quarterly/annual true-up).

## Example Monthly Overage Calculation

If a Pro tenant uses:
- 1,800,000 standard tokens
- 300,000 premium tokens

Then:
- Included = 200,000 tokens (apply to standard first by policy)
- Billable standard = 1,600,000 = 1.6M × 600 = **KES 960**
- Billable premium = 300,000 = 0.3M × 2,800 = **KES 840**
- Total overage = **KES 1,800**

## Rollout Recommendation

1. Keep existing included token caps for Basic and Pro from seed data.
2. Publish Standard/Premium overage rates in billing terms.
3. For Enterprise, enforce contract-specific included baseline and rate card in the invoice engine.
4. Reassess rates after 60-90 days using observed token mix, margin, and facility utilization.
