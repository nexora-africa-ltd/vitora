/**
 * Encounter Audit Trail Component
 *
 * Displays version history for an encounter record.
 * Shows field-level changes with visual diffs for DHA compliance.
 */

'use client';

import { useEncounterHistory } from '@/lib/hooks/use-history';
import { VersionHistoryList } from '@/components/shared/version-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Shield } from 'lucide-react';
import { ENCOUNTER_FIELD_LABELS } from '@/lib/types/history';
import type { FieldChanges, VersionHistoryItem } from '@/lib/types/history';

interface EncounterAuditTrailProps {
  /** Encounter ID to show history for */
  encounterId: number;
}

export function EncounterAuditTrail({ encounterId }: EncounterAuditTrailProps) {
  const { data: versions, isLoading, error } = useEncounterHistory(encounterId);

  const userReferenceFields = new Set([
    'finalized_by',
    'created_by',
    'assigned_clinician',
    'triage_bypassed_by',
    'chief_complaint_edited_by',
  ]);

  const normalizedVersions: VersionHistoryItem[] = (versions || []).map((version) => {
    const userIdToName = new Map<number, string>();
    for (const item of versions || []) {
      if (item.history_user_id && item.history_user) {
        userIdToName.set(item.history_user_id, item.history_user);
      }
    }

    const normalizedChanges: FieldChanges = Object.entries(version.changes).reduce(
      (acc, [field, change]) => {
        if (!userReferenceFields.has(field)) {
          acc[field] = change;
          return acc;
        }

        const resolveUserDisplay = (
          value: string | number | boolean | null
        ): string | number | boolean | null => {
          if (typeof value !== 'number') {
            return value;
          }

          if (
            field === 'finalized_by' &&
            version.history_user_id === value &&
            version.history_user
          ) {
            return version.history_user;
          }

          return userIdToName.get(value) || value;
        };

        acc[field] = {
          old: resolveUserDisplay(change.old),
          new: resolveUserDisplay(change.new),
        };
        return acc;
      },
      {} as FieldChanges
    );

    return {
      ...version,
      changes: normalizedChanges,
    };
  });

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Failed to load audit trail</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Audit Trail</CardTitle>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Shield className="h-3 w-3" />
            DHA Compliant
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete history of changes to this encounter
        </p>
      </CardHeader>
      <CardContent>
        <VersionHistoryList
          versions={normalizedVersions}
          isLoading={isLoading}
          fieldConfig={ENCOUNTER_FIELD_LABELS}
          initialLimit={25}
        />
      </CardContent>
    </Card>
  );
}
