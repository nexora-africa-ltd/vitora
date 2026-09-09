// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Assignment engine frontend helpers.
 * Used by scheduling assignment pages to render target-aware UI copy.
 */

import type { AssignmentType } from '@/lib/types/scheduling';

const PATIENT_TARGET_TYPES: AssignmentType[] = ['APPOINTMENT', 'BED_ASSIGNMENT', 'THEATRE_SLOT'];

export function isPatientTargetRelevant(type: AssignmentType): boolean {
  return PATIENT_TARGET_TYPES.includes(type);
}

export function getTargetReferenceLabel(type: AssignmentType): string {
  if (type === 'SHIFT') return 'Shift reference';
  if (type === 'LAB_BATCH') return 'Lab batch reference';
  return 'Target reference';
}

export function getTargetReferencePlaceholder(type: AssignmentType): string {
  if (type === 'SHIFT') return 'Shift ID or code';
  if (type === 'LAB_BATCH') return 'Batch ID or specimen group';
  return 'Target context reference';
}

export function buildAutoAssignReason(reason: string, targetReference?: string): string {
  const trimmedReason = reason.trim();
  const trimmedTarget = (targetReference || '').trim();

  if (trimmedReason && trimmedTarget) return `${trimmedReason} [target:${trimmedTarget}]`;
  if (trimmedReason) return trimmedReason;
  if (trimmedTarget) return `Auto-assigned [target:${trimmedTarget}]`;
  return 'Auto-assigned via frontend';
}
