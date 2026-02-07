/**
 * Encounter Timeline Component
 *
 * Displays chronological state history for an encounter.
 * Sprint 2 - Phase 2A: Encounter State Machine
 */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EncounterStatus } from '@/lib/types/encounter';
import { ENCOUNTER_STATUS_DISPLAY } from '@/lib/types/encounter';
import { EncounterStatusBadge } from './encounter-status-badge';
import { History, ArrowRight } from 'lucide-react';

export interface StateHistoryEntry {
  id: number;
  from_status: EncounterStatus;
  to_status: EncounterStatus;
  changed_at: string;
  changed_by: string;
  reason: string;
}

interface EncounterTimelineProps {
  stateHistory: StateHistoryEntry[];
}

export function EncounterTimeline({ stateHistory }: EncounterTimelineProps) {
  if (stateHistory.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4" />
          State History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stateHistory.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3 pb-3 last:pb-0"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <EncounterStatusBadge status={entry.from_status} size="sm" showIcon={false} />
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <EncounterStatusBadge status={entry.to_status} size="sm" />
                </div>
                {entry.reason && (
                  <p className="text-xs text-muted-foreground">{entry.reason}</p>
                )}
                <div className="text-xs text-muted-foreground">
                  {entry.changed_by} &middot;{' '}
                  {new Date(entry.changed_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
