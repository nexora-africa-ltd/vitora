/**
 * Patient Audit Trail Component
 *
 * Displays version history for a patient record.
 * Shows field-level changes with visual diffs for DHA compliance.
 */

'use client';

import { usePatientHistory, usePatientHistoryCount } from '@/lib/hooks/use-history';
import { VersionHistoryList } from '@/components/shared/version-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Shield } from 'lucide-react';
import { PATIENT_FIELD_LABELS } from '@/lib/types/history';

interface PatientAuditTrailProps {
  /** Patient ID to show history for */
  patientId: number;
}

export function PatientAuditTrail({ patientId }: PatientAuditTrailProps) {
  const { data: versions, isLoading, error } = usePatientHistory(patientId);
  const { data: countData } = usePatientHistoryCount(patientId);

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
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" />
              DHA Compliant
            </Badge>
            {countData && (
              <Badge variant="outline">
                {countData.count} version{countData.count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete history of changes to this patient record
        </p>
      </CardHeader>
      <CardContent>
        <VersionHistoryList
          versions={versions || []}
          isLoading={isLoading}
          fieldConfig={PATIENT_FIELD_LABELS}
          initialLimit={10}
        />
      </CardContent>
    </Card>
  );
}
