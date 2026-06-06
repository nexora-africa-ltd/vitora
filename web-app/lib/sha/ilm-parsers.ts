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
  return {
    schemeName: getString(raw, 'schemeName', 'scheme_name', 'name'),
    memberType: getString(raw, 'memberType', 'member_type', 'membership_type'),
    coverageStatus: getString(coverage, 'status', 'coverageStatus').toUpperCase(),
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
  const isActive = schemes.some((s) => s.coverageStatus === 'ACTIVE');

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
  shaContractedServices: string[];
  county: string;
  subCounty: string;
}

export function parseFacility(resp: IlmRegistryResponse | null | undefined): ParsedFacility | null {
  const rec = firstRecord(resp?.data);
  if (!rec) return null;
  const services = rec.shaContractedServices ?? rec.sha_contracted_services ?? rec.contractedServices;

  return {
    fidCode: getString(rec, 'fidCode', 'fid_code', 'mflCode', 'mfl_code'),
    frCode: getString(rec, 'frCode', 'fr_code'),
    officialName: getString(rec, 'officialName', 'official_name', 'name', 'facilityName'),
    facilityType: getString(rec, 'facilityType', 'facility_type', 'type'),
    kephLevel: getString(rec, 'kephLevel', 'keph_level', 'level'),
    shaContractStatus: getString(rec, 'shaContractStatus', 'sha_contract_status', 'contractStatus').toUpperCase(),
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

  return {
    fullName:
      getString(rec, 'fullName', 'full_name', 'name', 'practitionerName') ||
      [getString(rec, 'firstName', 'first_name'), getString(rec, 'lastName', 'last_name')]
        .filter(Boolean)
        .join(' '),
    registrationNumber: getString(rec, 'registrationNumber', 'registration_number', 'regNumber', 'reg_number', 'licenseNumber'),
    regulator: getString(rec, 'regulator', 'regulatoryBody'),
    cadre: getString(rec, 'cadre', 'category', 'profession'),
    specialty: getString(rec, 'specialty', 'specialization', 'specialisation'),
    licenseStatus: getString(rec, 'licenseStatus', 'license_status', 'status').toUpperCase(),
    licenseExpiry: getString(rec, 'licenseExpiry', 'license_expiry', 'expiryDate', 'expiry_date'),
    identificationNumber: getString(rec, 'identificationNumber', 'identification_number', 'idNumber'),
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
  remainingQuota?: number;
  totalQuota?: number;
  amountUsed?: number;
  amountRemaining?: number;
  facilityName: string;
}

export function parseUtilization(resp: IlmRegistryResponse | null | undefined): ParsedUtilizationEntry[] {
  const items = extractItems<Record<string, unknown>>(resp?.data);
  return items.map((item) => ({
    interventionCode: getString(item, 'interventionCode', 'intervention_code', 'code'),
    interventionName: getString(item, 'interventionName', 'intervention_name', 'name'),
    visitCount: getNumber(item, 'visitCount', 'visit_count', 'count', 'utilisationCount') ?? 0,
    lastVisit: getString(item, 'lastVisit', 'last_visit', 'lastVisitDate', 'serviceDate'),
    remainingQuota: getNumber(item, 'remainingQuota', 'remaining_quota', 'remaining'),
    totalQuota: getNumber(item, 'totalQuota', 'total_quota', 'quota', 'limit'),
    amountUsed: getNumber(item, 'amountUsed', 'amount_used', 'usedAmount'),
    amountRemaining: getNumber(item, 'amountRemaining', 'amount_remaining', 'remainingAmount'),
    facilityName: getString(item, 'facilityName', 'facility_name', 'facility'),
  }));
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
