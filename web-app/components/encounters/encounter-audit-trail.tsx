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

interface EncounterAuditTrailProps {
  /** Encounter ID to show history for */
  encounterId: number;
}

export function EncounterAuditTrail({ encounterId }: EncounterAuditTrailProps) {
  const { data: versions, isLoading, error } = useEncounterHistory(encounterId);

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Failed to load audit trail</p>
          <p className="text-sm text-muted-foreground mt-1">
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
          versions={versions || []}
          isLoading={isLoading}
          fieldConfig={ENCOUNTER_FIELD_LABELS}
          initialLimit={10}
        />
      </CardContent>
    </Card>
  );
}
