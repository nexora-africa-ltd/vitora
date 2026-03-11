/**
 * CDS (Clinical Decision Support) types for the mobile app.
 *
 * Covers alert listing, acknowledgement, and override workflows
 * surfaced passively on encounter detail screens.
 */

import type { PaginatedResponse } from './common';

// ──────────────────── Enums ────────────────────

export type CDSAlertStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'ACCEPTED'
  | 'OVERRIDDEN'
  | 'DISMISSED'
  | 'AUTO_RESOLVED';

export type CDSRulePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type CDSRuleCategory =
  | 'DRUG_ALLERGY'
  | 'DRUG_DRUG'
  | 'CRITICAL_LAB'
  | 'VITAL_SIGN'
  | 'GUIDELINE'
  | 'PREVENTIVE'
  | 'DOSAGE';

export type CDSActionType =
  | 'ALERT'
  | 'CONTRAINDICATE'
  | 'WARN'
  | 'SUGGEST'
  | 'REQUIRE'
  | 'INFORM';

// ──────────────────── Models ────────────────────

export interface CDSSuggestedAction {
  action_type: string;
  target_field: string;
  value?: unknown;
  confidence: number;
  reason: string;
}

export interface CDSAlertListItem {
  id: number;
  rule: number;
  rule_code: string;
  rule_name: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  priority: string;
  status: string;
  message: string;
  suggestion: string;
  suggested_actions: CDSSuggestedAction[];
  category: string;
  is_pending: boolean;
  is_critical: boolean;
  created_at: string;
}

export interface CDSAlertAcknowledgeData {
  notes?: string;
}

export interface CDSAlertOverrideData {
  override_reason: string;
}

export interface CDSAlertActionResponse {
  id: number;
  status: string;
  message?: string;
}

export interface CDSEvaluateRequest {
  encounter_id: number;
}

export interface CDSEvaluateResponse {
  alerts_generated: number;
  alerts: CDSAlertListItem[];
}

// ──────────────────── Paginated ────────────────────

export type PaginatedCDSAlertResponse = PaginatedResponse<CDSAlertListItem>;
