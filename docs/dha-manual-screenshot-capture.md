<!--
Purpose: Runbook for capturing DHA-facing Vitora system user manual screenshots from staging.
Use: Run the capture script with a dedicated synthetic-data staging account, then review and curate the output.
Inputs: A staging URL, authenticated Playwright storage state or credentials, optional synthetic patient/laboratory result IDs.
-->
# DHA Manual Screenshot Capture

Use `scripts/capture-dha-manual-screenshots.js` to produce the screenshot evidence required by the system user manual. It captures the standard manual screens and writes a `capture-manifest.json` that records any route unavailable to the selected user or facility.

## Safety Requirements

- Use a dedicated staging organization and facility populated exclusively with synthetic data.
- Never capture production, real patient data, credentials, MFA codes, access tokens, or browser developer tools.
- Use a least-privileged capture account that has the roles and facility modules intended for the manual. Use a separate administrator account only for the access-administration screen if necessary.
- Review, redact where required, and approve every image before adding it to a DHA submission.
- Do not present a skipped route as evidence of an enabled workflow. Resolve the capability or capture it with the correct approved role.

## Prerequisites

Install the web application's dependencies and Playwright browser:

```bash
cd web-app
npm install
npx playwright install chromium
```

Use an authenticated Playwright storage-state file when the account requires MFA. Create it only on a protected workstation, store it outside the repository, and delete it after the capture session.

## Capture Command

Run from the repository root. The command defaults to `https://staging.vitora.digital` and writes output to a timestamped directory under `/tmp`.

```bash
DHA_CAPTURE_STORAGE_STATE=/secure/path/vitora-staging-state.json \
DHA_CAPTURE_PATIENT_ID=<synthetic-patient-id> \
DHA_CAPTURE_LAB_RESULT_ID=<synthetic-lab-result-id> \
node scripts/capture-dha-manual-screenshots.js
```

For a staging account without MFA, pass credentials through the process environment rather than source code or shell history:

```bash
read -r -p 'Staging username: ' DHA_CAPTURE_USERNAME
read -r -s -p 'Staging password: ' DHA_CAPTURE_PASSWORD
export DHA_CAPTURE_USERNAME DHA_CAPTURE_PASSWORD
export DHA_CAPTURE_BASE_URL='https://staging.vitora.digital'
node scripts/capture-dha-manual-screenshots.js --headed
unset DHA_CAPTURE_USERNAME DHA_CAPTURE_PASSWORD
```

Optional variables:

| Variable | Purpose |
|---|---|
| `DHA_CAPTURE_BASE_URL` | Staging web-app URL. Defaults to `https://staging.vitora.digital`. |
| `DHA_CAPTURE_STORAGE_STATE` | Secure Playwright authenticated session file. Preferred for MFA accounts. |
| `DHA_CAPTURE_USERNAME` / `DHA_CAPTURE_PASSWORD` | Dedicated staging credentials when MFA is not required. |
| `DHA_CAPTURE_OUTPUT_DIR` | Explicit output directory. Keep raw staging captures outside the repository until reviewed. |
| `DHA_CAPTURE_PATIENT_ID` | Synthetic patient ID for the patient-profile screenshot. |
| `DHA_CAPTURE_LAB_RESULT_ID` | Synthetic lab-result ID for the result-verification screenshot. |

`--headed` displays the browser for supervised capture. `--full-page` captures full scrolling pages; omit it for the manual's standard viewport images.

## Outputs and Review

The script captures sign-in, validation, dashboard, patients, check-in, triage, encounter, CDS, laboratory, pharmacy, billing, SHA/DHA insurance, MOH reporting, scheduling, analytics, administration, and emergency-access screens. When supplied, the synthetic patient and laboratory IDs add detail screenshots for those workflows.

Review `capture-manifest.json` first. A non-zero exit status of `2` means at least one requested route was skipped and must be resolved, recaptured with the appropriate role, or explicitly removed from the manual because the module is not part of the DHA deployment scope.

After approval, copy only curated and redacted images into the manual's controlled asset location, add figure captions/callouts, and record the app release, capture date, staging facility, reviewer, and synthetic-data confirmation in the document-control evidence.
