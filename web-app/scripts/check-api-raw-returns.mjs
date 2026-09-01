/**
 * Guardrail for API response validation coverage.
 *
 * Usage:
 * - Run from web-app/: `node scripts/check-api-raw-returns.mjs`
 * - Or via npm: `npm run check:api-raw-returns`
 *
 * Inputs:
 * - No CLI args required.
 * - Optional env var `API_GUARD_FILES` (comma-separated relative paths) to override file targets.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_FILES = [
  'lib/api/patients.ts',
  'lib/api/encounters.ts',
  'lib/api/billing.ts',
  'lib/api/scheduling.ts',
  'lib/api/inventory.ts',
  'lib/api/clinics.ts',
  'lib/api/mch.ts',
  'lib/api/triage.ts',
  'lib/api/sha.ts',
  'lib/api/blood-bank.ts',
  'lib/api/procedures.ts',
  'lib/api/dialysis.ts',
  'lib/api/quality.ts',
  'lib/api/laboratory.ts',
  'lib/api/insurance.ts',
  'lib/api/ai.ts',
  'lib/api/moh-reports.ts',
  'lib/api/surveillance.ts',
  'lib/api/licensing.ts',
  'lib/api/inpatient.ts',
  'lib/api/standalone-lis.ts',
  'lib/api/push.ts',
  'lib/api/worksheets.ts',
  'lib/api/theatre.ts',
  'lib/api/standalone-pharmacy.ts',
  'lib/api/standalone-imaging.ts',
  'lib/api/reflex.ts',
  'lib/api/rbac.ts',
  'lib/api/mfa.ts',
  'lib/api/imaging.ts',
  'lib/api/autoverify.ts',
  'lib/api/physiotherapy.ts',
  'lib/api/occupational-therapy.ts',
  'lib/api/last-office.ts',
  'lib/api/critical-values.ts',
  'lib/api/counselling.ts',
  'lib/api/comments.ts',
  'lib/api/analytics.ts',
];

const configuredFiles = process.env.API_GUARD_FILES
  ? process.env.API_GUARD_FILES.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  : DEFAULT_FILES;

const forbiddenReturnRegex = /^\s*return\s+response\.data(?!\s+as\s+Blob)/;

const violations = [];

for (const relativePath of configuredFiles) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (forbiddenReturnRegex.test(line)) {
      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error('Found raw `return response.data` statements in guarded API modules:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(`API raw-return guard passed for ${configuredFiles.length} files.`);
