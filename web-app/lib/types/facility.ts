import type { FacilityModules } from '@/lib/auth/context';

export type FacilityLevel = '1' | '2' | '3' | '4' | '5' | '6';
export type FacilityOwnership = 'GOK' | 'FBO' | 'NGO' | 'PRIVATE';

export interface FacilityListItem {
  id: number;
  organization: number | null;
  organization_name: string | null;
  mfl_code: string;
  name: string;
  level: string;
  ownership: string;
  county: number;
  county_name: string;
  sub_county: number;
  sub_county_name: string;
  is_headquarters: boolean;
  branch_code: string;
  sha_contracted: boolean;
  is_active: boolean;
}

export interface FacilityDetail extends FacilityListItem {
  ward?: number | null;
  ward_name?: string | null;
  logo: string | null;
  effective_logo_url: string | null;
  sha_contract_expiry: string | null;
  sha_facility_code: string;
  /** DHIS2 Organisation Unit UID for this facility */
  dhis2_org_unit: string;
  modules: FacilityModules;
  enabled_module_names: string[];
  has_outpatient: boolean;
  has_inpatient: boolean;
  has_emergency: boolean;
  has_pharmacy: boolean;
  has_laboratory: boolean;
  has_imaging: boolean;
  has_theatre: boolean;
  has_dialysis: boolean;
  has_icu: boolean;
  has_maternity: boolean;
  has_mortuary: boolean;
  has_blood_bank: boolean;
  has_inventory: boolean;
  has_lis_standalone: boolean;
  has_triage: boolean;
  has_scheduling: boolean;
  has_surveillance: boolean;
  has_immunizations: boolean;
  has_allied_health: boolean;
  has_quality: boolean;
  has_billing: boolean;
  /** Biometrics workstation ID for DHA HIE consent */
  workstation_id?: string;
  /** Agent national ID for biometric authorization */
  biometrics_agent_national_id?: string;
  created_at: string;
  updated_at: string;
}

export interface FacilityUpdateData {
  name?: string;
  mfl_code?: string;
  level?: FacilityLevel;
  ownership?: FacilityOwnership;
  sha_contracted?: boolean;
  sha_contract_expiry?: string | null;
  sha_facility_code?: string;
  dhis2_org_unit?: string;
  workstation_id?: string;
  biometrics_agent_national_id?: string;
  has_outpatient?: boolean;
  has_inpatient?: boolean;
  has_emergency?: boolean;
  has_pharmacy?: boolean;
  has_laboratory?: boolean;
  has_imaging?: boolean;
  has_theatre?: boolean;
  has_dialysis?: boolean;
  has_icu?: boolean;
  has_maternity?: boolean;
  has_mortuary?: boolean;
  has_blood_bank?: boolean;
  has_inventory?: boolean;
  has_lis_standalone?: boolean;
  has_triage?: boolean;
  has_scheduling?: boolean;
  has_surveillance?: boolean;
  has_immunizations?: boolean;
  has_allied_health?: boolean;
  has_quality?: boolean;
  has_billing?: boolean;
  is_active?: boolean;
}

export interface FacilityCreateData {
  organization?: number;
  mfl_code: string;
  name: string;
  level: FacilityLevel;
  ownership: FacilityOwnership;
  is_headquarters?: boolean;
  branch_code?: string;
  county: number;
  sub_county: number;
  ward?: number | null;
  sha_contracted?: boolean;
  sha_contract_expiry?: string | null;
  sha_facility_code?: string;
  has_outpatient?: boolean;
  has_inpatient?: boolean;
  has_emergency?: boolean;
  has_pharmacy?: boolean;
  has_laboratory?: boolean;
  has_imaging?: boolean;
  has_theatre?: boolean;
  has_dialysis?: boolean;
  has_icu?: boolean;
  has_maternity?: boolean;
  has_mortuary?: boolean;
  has_blood_bank?: boolean;
  has_inventory?: boolean;
  has_lis_standalone?: boolean;
  has_triage?: boolean;
  has_scheduling?: boolean;
  has_surveillance?: boolean;
  has_immunizations?: boolean;
  has_allied_health?: boolean;
  has_quality?: boolean;
  has_billing?: boolean;
  is_active?: boolean;
}
