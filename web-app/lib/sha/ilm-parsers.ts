/**
 * Typed parsers for DHA HIE (ILM) response payloads.
 *
 * The DHA Integration Layer Middleware returns deeply nested, partly free-form
 * JSON. Our Zod schemas validate the envelope (`data + http_status`) but treat
 * `data` as `unknown`. These parsers normalise the raw payload into typed,
 * UI-friendly shapes so renderers don't have to drill into `Record<string, unknown>`.
 *
 * All parsers return `null` when the payload is empty/unrecognised. UI consumers
 * can then fall back to "No result" instead of crashing.
 */

import type { IlmRegistryResponse } from '@/lib/schemas/sha.schema';

// ============================================================================
// Generic helpers
// ============================================================================

export function getString(obj: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!obj) return '';
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

export function getNumber(obj: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && val.trim() && !Number.isNaN(Number(val))) return Number(val);
  }
  return undefined;
}

export function getBool(obj: Record<string, unknown> | undefined, ...keys: string[]): boolean | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'boolean') return val;
    if (val === 'true') return true;
    if (val === 'false') return false;
  }
  return undefined;
}

/**
 * Extract array items from DHA/ILM response payloads. Handles direct arrays,
 * `{ results: [...] }`, `{ data: [...] }`, the double-nested
 * `{ results: [{ results: [...] }] }` shape, and named buckets like
 * `{ benefits: [...] }` / `{ interventions: [...] }`.
 */
export function extractItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const raw = obj.raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        return extractItems<T>(JSON.parse(raw));
      } catch {
        // Keep existing fallbacks when raw is non-JSON/truncated.
      }
    }
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) {
      const results = obj.results as unknown[];
      if (
        results.length === 1 &&
        typeof results[0] === 'object' &&
        results[0] !== null &&
        Array.isArray((results[0] as Record<string, unknown>).results)
      ) {
        return (results[0] as Record<string, unknown>).results as T[];
      }
      return results as T[];
    }
    if (Array.isArray(obj.benefits)) return obj.benefits as T[];
    if (Array.isArray(obj.interventions)) return obj.interventions as T[];
    if (Array.isArray(obj.facilities)) return obj.facilities as T[];
    if (Array.isArray(obj.practitioners)) return obj.practitioners as T[];
    if (Array.isArray(obj.patients)) return obj.patients as T[];
    if (Object.keys(obj).length > 0 && !obj.error) return [obj as T];
  }
  return [];
}

/** Pull the first record from an envelope that may be a single object or an array. */
function firstRecord(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    return data.length ? (data[0] as Record<string, unknown>) : null;
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data) && obj.data.length) return obj.data[0] as Record<string, unknown>;
    if (Array.isArray(obj.results) && obj.results.length) {
      const first = obj.results[0] as Record<string, unknown>;
      // Handle double-nested
      if (Array.isArray(first?.results) && (first.results as unknown[]).length) {
        return (first.results as unknown[])[0] as Record<string, unknown>;
      }
      return first;
    }
    return obj;
  }
  return null;
}

// ============================================================================
// Eligibility / Patient lookup
// ============================================================================

export interface ParsedScheme {
  schemeName: string;
  memberType: string;
  coverageStatus: string;
  coverageStart: string;
  coverageEnd: string;
}

export interface ParsedEligibility {
  fullName: string;
  memberCrNumber: string;
  identificationNumber: string;
  identificationType: string;
  age?: number;
  gender: string;
  whitelistedForOTP?: boolean;
  schemes: ParsedScheme[];
  /** True when at least one scheme has an ACTIVE coverage status. */
  isActive: boolean;
}

function parseScheme(raw: Record<string, unknown>): ParsedScheme {
  const coverage = (raw.coverage ?? {}) as Record<string, unknown>;
  const rawStatus = getString(coverage, 'status', 'coverageStatus');
  // DHA returns "1" for active coverage, or text like "ACTIVE"
  const normalizedStatus = rawStatus === '1' || rawStatus.toUpperCase() === 'ACTIVE'
    ? 'ACTIVE'
    : rawStatus.toUpperCase() || 'INACTIVE';
  return {
    schemeName: getString(raw, 'schemeName', 'scheme_name', 'name'),
    memberType: getString(raw, 'memberType', 'member_type', 'membership_type'),
    coverageStatus: normalizedStatus,
    coverageStart: getString(coverage, 'startDate', 'start_date', 'effectiveStartDate'),
    coverageEnd: getString(coverage, 'endDate', 'end_date', 'effectiveEndDate'),
  };
}

export function parseEligibility(resp: IlmRegistryResponse | null | undefined): ParsedEligibility | null {
  const rec = firstRecord(resp?.data);
  if (!rec) return null;

  const rawSchemes = Array.isArray(rec.schemes)
    ? (rec.schemes as Record<string, unknown>[])
    : [];
  const schemes = rawSchemes.map(parseScheme);
  // DHA signals eligibility via: schemes[].coverage.status === "1" (parsed above),
  // OR top-level `eligible: 1` / `statusCode: "10"` when no schemes present.
  const isActive = schemes.some((s) => s.coverageStatus === 'ACTIVE')
    || rec.eligible === 1 || rec.eligible === true
    || String(rec.statusCode) === '10';

  return {
    fullName: getString(rec, 'fullName', 'full_name', 'name', 'patientName'),
    memberCrNumber: getString(rec, 'memberCrNumber', 'member_cr_number', 'crNumber', 'cr_number', 'patientId', 'patient_id'),
    identificationNumber: getString(rec, 'identificationNumber', 'identification_number', 'idNumber', 'nationalId', 'national_id'),
    identificationType: getString(rec, 'identificationType', 'identification_type', 'idType'),
    age: getNumber(rec, 'age', 'patientAge'),
    gender: getString(rec, 'gender', 'sex'),
    whitelistedForOTP: getBool(rec, 'whitelistedForOTP', 'whitelisted_for_otp', 'isWhitelisted'),
    schemes,
    isActive,
  };
}

// ============================================================================
// Facility lookup
// ============================================================================

export interface ParsedFacility {
  fidCode: string;
  frCode: string;
  officialName: string;
  facilityType: string;
  kephLevel: string;
  shaContractStatus: string;
  shaOperationalStatus: string;
  facilityLicenseStatus: string;
  shaContractedServices: string[];
  county: string;
  subCounty: string;
}

export function parseFacility(resp: IlmRegistryResponse | null | undefined): ParsedFacility | null {
  const rec = firstRecord(resp?.data);
  if (!rec) return null;
  const services = rec.shaContractedServices ?? rec.sha_contracted_services ?? rec.contractedServices;
  const shaOps = (rec.SHAOperationStatus ?? rec.shaOperationStatus ?? {}) as Record<string, unknown>;

  return {
    fidCode: getString(rec, 'fidCode', 'fid_code', 'mflCode', 'mfl_code'),
    frCode: getString(rec, 'frCode', 'fr_code'),
    officialName: getString(rec, 'officialName', 'official_name', 'name', 'facilityName'),
    facilityType: getString(rec, 'facilityType', 'facility_type', 'type'),
    kephLevel: getString(rec, 'kephLevel', 'keph_level', 'level'),
    shaContractStatus: getString(rec, 'shaContractStatus', 'sha_contract_status', 'contractStatus').toUpperCase(),
    shaOperationalStatus: getString(shaOps, 'operationalStatus', 'operational_status').toUpperCase(),
    facilityLicenseStatus: getString(rec, 'facilityLicenseStatus', 'facility_license_status', 'licenseStatus').toUpperCase(),
    shaContractedServices: Array.isArray(services) ? (services as string[]).map(String) : [],
    county: getString(rec, 'county', 'countyName'),
    subCounty: getString(rec, 'subCounty', 'sub_county', 'subCountyName'),
  };
}

// ============================================================================
// Professional / Practitioner lookup
// ============================================================================

export interface ParsedProfessional {
  fullName: string;
  registrationNumber: string;
  regulator: string;
  cadre: string;
  specialty: string;
  licenseStatus: string;
  licenseExpiry: string;
  identificationNumber: string;
}

export function parseProfessional(resp: IlmRegistryResponse | null | undefined): ParsedProfessional | null {
  const rec = firstRecord(resp?.data);
  if (!rec) return null;

  const root = (typeof rec.message === 'object' && rec.message !== null)
    ? (rec.message as Record<string, unknown>)
    : rec;
  const membership = (typeof root.membership === 'object' && root.membership !== null)
    ? (root.membership as Record<string, unknown>)
    : undefined;
  const identifiers = (typeof root.identifiers === 'object' && root.identifiers !== null)
    ? (root.identifiers as Record<string, unknown>)
    : undefined;
  const professional = (typeof root.professional_details === 'object' && root.professional_details !== null)
    ? (root.professional_details as Record<string, unknown>)
    : undefined;

  const licenses = Array.isArray(root.licenses)
    ? (root.licenses as Record<string, unknown>[])
    : [];
  const activeLicense = licenses.find((license) => {
    const end = getString(license, 'license_end', 'licenseEnd', 'expiryDate', 'expiry_date');
    if (!end || end.toLowerCase() === 'none') return false;
    const parsed = new Date(end);
    if (Number.isNaN(parsed.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsed >= today;
  }) || licenses[0];

  const explicitStatus = getString(root, 'licenseStatus', 'license_status', 'status')
    || getString(membership, 'licenseStatus', 'license_status', 'status');
  const membershipActiveRaw = membership?.is_active;
  const membershipActive = membershipActiveRaw === true
    || membershipActiveRaw === 1
    || membershipActiveRaw === '1'
    || membershipActiveRaw === 'true';
  const derivedStatus = explicitStatus
    ? explicitStatus.toUpperCase()
    : membershipActive
      ? 'ACTIVE'
      : '';

  return {
    fullName:
      getString(root, 'fullName', 'full_name', 'name', 'practitionerName') ||
      getString(membership, 'full_name', 'fullName', 'name') ||
      [
        getString(root, 'firstName', 'first_name'),
        getString(membership, 'first_name', 'firstName'),
        getString(root, 'lastName', 'last_name'),
        getString(membership, 'last_name', 'lastName'),
      ]
        .filter(Boolean)
        .join(' '),
    registrationNumber: getString(
      root,
      'registrationNumber',
      'registration_number',
      'regNumber',
      'reg_number',
      'licenseNumber',
    ) || getString(membership, 'registration_id', 'registrationNumber'),
    regulator: getString(root, 'regulator', 'regulatoryBody') || getString(membership, 'licensing_body'),
    cadre: getString(root, 'cadre', 'category', 'profession')
      || getString(professional, 'professional_cadre', 'practice_type'),
    specialty: getString(root, 'specialty', 'specialization', 'specialisation')
      || getString(membership, 'specialty')
      || getString(professional, 'discipline_name'),
    licenseStatus: derivedStatus,
    licenseExpiry: getString(
      activeLicense,
      'license_end',
      'licenseExpiry',
      'license_expiry',
      'expiryDate',
      'expiry_date',
    ),
    identificationNumber: getString(root, 'identificationNumber', 'identification_number', 'idNumber')
      || getString(identifiers, 'identification_number', 'identificationNumber'),
  };
}

// ============================================================================
// Utilisation
// ============================================================================

export interface ParsedUtilizationEntry {
  interventionCode: string;
  interventionName: string;
  visitCount: number;
  lastVisit: string;
  periodStart?: string;
  periodEnd?: string;
  schemeCode?: string;
  schemeName?: string;
  status?: string;
  benefitCode?: string;
  benefitName?: string;
  eligibility?: string;
  remainingQuota?: number;
  totalQuota?: number;
  amountUsed?: number;
  amountRemaining?: number;
  facilityName: string;
  additionalDetails?: Array<{ key: string; value: string }>;
}

const UTILIZATION_KNOWN_KEYS = new Set([
  'interventioncode', 'intervention_code', 'code',
  'interventionname', 'intervention_name', 'name',
  'visitcount', 'visit_count', 'count', 'utilisationcount',
  'lastvisit', 'last_visit', 'lastvisitdate', 'servicedate',
  'periodstart', 'period_start', 'startdate',
  'periodend', 'period_end', 'enddate',
  'schemecode', 'scheme_code',
  'schemename', 'scheme_name',
  'status', 'coverage_status', 'coveragestatus',
  'benefitcode', 'benefit_code',
  'benefitname', 'benefit_name',
  'remainingquota', 'remaining_quota', 'remaining',
  'totalquota', 'total_quota', 'quota', 'limit',
  'amountused', 'amount_used', 'usedamount',
  'amountremaining', 'amount_remaining', 'remainingamount',
  'facilityname', 'facility_name', 'facility',
]);

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function eligibilityFromValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'ELIGIBLE' : 'INELIGIBLE';
  if (typeof value === 'number') {
    if (value === 1) return 'ELIGIBLE';
    if (value === 0) return 'INELIGIBLE';
    return String(value);
  }
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return '';
    const upper = v.toUpperCase();
    if (upper === '1' || upper === 'TRUE' || upper === 'ELIGIBLE' || upper === 'ACTIVE') return 'ELIGIBLE';
    if (upper === '0' || upper === 'FALSE' || upper === 'INELIGIBLE' || upper === 'INACTIVE') return 'INELIGIBLE';
    return upper;
  }
  return '';
}

function extractAdditionalDetails(item: Record<string, unknown>): Array<{ key: string; value: string }> {
  const details: Array<{ key: string; value: string }> = [];
  for (const [rawKey, rawValue] of Object.entries(item)) {
    const key = rawKey.trim();
    if (!key) continue;
    const normalized = key.toLowerCase();
    if (UTILIZATION_KNOWN_KEYS.has(normalized)) continue;
    const value = toDisplayValue(rawValue);
    if (!value) continue;
    details.push({ key, value });
    if (details.length >= 8) break;
  }
  return details;
}

function extractComputationalDetails(item: Record<string, unknown>): Array<{ key: string; value: string }> {
  const computational = (item.computationalDetails ?? item.computational_details) as unknown;
  if (!computational || typeof computational !== 'object' || Array.isArray(computational)) return [];
  const details: Array<{ key: string; value: string }> = [];
  for (const [rawKey, rawValue] of Object.entries(computational as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) continue;
    const value = toDisplayValue(rawValue);
    if (!value) continue;
    details.push({ key: `computational.${key}`, value });
    if (details.length >= 8) break;
  }
  return details;
}

export function parseUtilization(resp: IlmRegistryResponse | null | undefined): ParsedUtilizationEntry[] {
  const items = extractItems<Record<string, unknown>>(resp?.data);
  return items.map((item) => {
    const directEligibility = eligibilityFromValue(
      item.eligibility ?? item.isEligible ?? item.is_eligible ?? item.coverageEligible
    );
    const computational = (item.computationalDetails ?? item.computational_details) as
      | Record<string, unknown>
      | undefined;
    const computationalEligibility = eligibilityFromValue(
      computational?.eligibility ?? computational?.isEligible ?? computational?.is_eligible
    );
    return {
      interventionCode: getString(item, 'interventionCode', 'intervention_code', 'code'),
      interventionName: getString(item, 'interventionName', 'intervention_name', 'name'),
      visitCount: getNumber(item, 'visitCount', 'visit_count', 'count', 'utilisationCount') ?? 0,
      lastVisit: getString(item, 'lastVisit', 'last_visit', 'lastVisitDate', 'serviceDate'),
      periodStart: getString(item, 'periodStart', 'period_start', 'startDate'),
      periodEnd: getString(item, 'periodEnd', 'period_end', 'endDate'),
      schemeCode: getString(item, 'schemeCode', 'scheme_code'),
      schemeName: getString(item, 'schemeName', 'scheme_name'),
      status: getString(item, 'status', 'coverage_status', 'coverageStatus'),
      benefitCode: getString(item, 'benefitCode', 'benefit_code'),
      benefitName: getString(item, 'benefitName', 'benefit_name'),
      eligibility: directEligibility || computationalEligibility,
      remainingQuota: getNumber(item, 'remainingQuota', 'remaining_quota', 'remaining'),
      totalQuota: getNumber(item, 'totalQuota', 'total_quota', 'quota', 'limit'),
      amountUsed: getNumber(item, 'amountUsed', 'amount_used', 'usedAmount'),
      amountRemaining: getNumber(item, 'amountRemaining', 'amount_remaining', 'remainingAmount'),
      facilityName: getString(item, 'facilityName', 'facility_name', 'facility'),
      additionalDetails: [
        ...extractAdditionalDetails(item),
        ...extractComputationalDetails(item),
      ],
    };
  });
}

// ============================================================================
// Normalisers
// ============================================================================

/**
 * Normalise an internal SHA member number to the DHA Client Registry id.
 * Local convention stores numbers as `SHA-XXXXX-N`; DHA expects `CRXXXXX-N`.
 * Already-CR ids and other shapes are returned unchanged.
 */
export function toCrId(value: string | null | undefined): string {
  if (!value) return '';
  if (value.startsWith('SHA-')) return `CR${value.slice(4)}`;
  return value;
}
