// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** SDMX platform contract types used by the Nexora configuration console. */

export type SDMXPartner = 'DHA' | 'KHIS' | 'OTHER';
export type SDMXEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface SDMXContractListItem {
  id: number;
  display_name: string;
  partner: SDMXPartner;
  environment: SDMXEnvironment;
  agency_id: string;
  dataflow_id: string;
  dsd_id: string;
  version: string;
  receiver_id: string;
  is_active: boolean;
  mapping_count: number;
  effective_from: string | null;
  effective_until: string | null;
  updated_at: string;
}

export interface SDMXContractDetail extends SDMXContractListItem {
  endpoint_url: string;
  secret_reference: string;
  created_by: number | null;
  created_at: string;
}

export interface SDMXContractCreateData {
  partner: SDMXPartner;
  environment: SDMXEnvironment;
  agency_id: string;
  dataflow_id: string;
  dsd_id: string;
  version: string;
  endpoint_url: string;
  receiver_id: string;
  secret_reference?: string;
  effective_from?: string | null;
  effective_until?: string | null;
  is_active?: boolean;
}

export interface SDMXCodeMapping {
  id: number;
  contract: number;
  contract_name: string;
  dimension: string;
  source_code: string;
  target_code: string;
  target_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FacilitySDMXConfiguration {
  id: number;
  organization: number | null;
  facility: number;
  facility_name: string;
  contract: number;
  contract_name: string;
  is_enabled: boolean;
  facility_code: string;
  report_types: string[];
  is_ready: boolean;
  last_validated_at: string | null;
  last_successful_submission_at: string | null;
  enabled_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface FacilitySDMXConfigurationCreateData {
  facility: number;
  contract: number;
  is_enabled: boolean;
  facility_code: string;
  report_types: string[];
}
