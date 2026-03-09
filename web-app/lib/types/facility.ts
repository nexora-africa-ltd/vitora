import type { FacilityModules } from '@/lib/auth/context';

export type FacilityLevel = '1' | '2' | '3' | '4' | '5' | '6';
export type FacilityOwnership = 'GOK' | 'FBO' | 'NGO' | 'PRIVATE';

export interface FacilityListItem {
  id: number;
  mfl_code: string;
  name: string;
  level: string;
  ownership: string;
  county: number;
  county_name: string;
  sub_county: number;
  sub_county_name: string;
  sha_contracted: boolean;
  is_active: boolean;
}

export interface FacilityDetail extends FacilityListItem {
  ward: number | null;
  ward_name: string | null;
  sha_contract_expiry: string | null;
  sha_facility_code: string;
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
  is_active?: boolean;
}