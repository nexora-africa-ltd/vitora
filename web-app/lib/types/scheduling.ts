/**
 * Scheduling Types
 *
 * TypeScript interfaces for scheduling resources.
 */

export type ResourceType = 'PERSON' | 'PLACE' | 'ASSET';

export interface ResourceListItem {
  id: number;
  name: string;
  resource_type: ResourceType;
  code: string;
  is_active: boolean;
}

export interface Resource extends ResourceListItem {
  capacity: number;
  staff_profile: number | null;
  staff_profile_name: string | null;
  metadata: Record<string, unknown>;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceCreateData {
  name: string;
  resource_type: ResourceType;
  code: string;
  is_active?: boolean;
  capacity?: number;
  staff_profile?: number | null;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceListParams {
  page?: number;
  page_size?: number;
  resource_type?: ResourceType;
  is_active?: boolean;
  ordering?: string;
  search?: string;
}
