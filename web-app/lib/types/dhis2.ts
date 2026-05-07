/**
 * DHIS2 Configuration types.
 *
 * Mirrors the backend DHIS2Config model serializers.
 */

export type DHIS2Environment = 'local' | 'staging' | 'production';

export interface DHIS2ConfigListItem {
  id: number;
  organization: number;
  organization_name: string | null;
  name: string;
  base_url: string;
  username: string;
  environment: DHIS2Environment;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DHIS2ConfigDetail extends DHIS2ConfigListItem {}

export interface DHIS2ConfigCreateData {
  organization?: number;
  name: string;
  base_url: string;
  username: string;
  password: string;
  environment: DHIS2Environment;
  is_active?: boolean;
}

export interface DHIS2ConfigUpdateData {
  name?: string;
  base_url?: string;
  username?: string;
  password?: string;
  environment?: DHIS2Environment;
  is_active?: boolean;
}

export interface DHIS2ConnectionTestResult {
  status: 'ok' | 'error';
  dhis2_user?: string;
  server_version?: string;
  detail?: string;
}
