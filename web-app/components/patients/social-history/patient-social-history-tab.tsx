/**
 * Patient Social History Tab Component
 *
 * Displays and manages structured social history observations for a patient.
 * Groups by observation type (Alcohol, Tobacco, Occupation, Lifestyle).
 */

'use client';

import { useState } from 'react';
import { Plus, HeartPulse } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePatientSocialHistory } from '@/lib/hooks/use-social-history';
import { SocialHistoryListItem } from './social-history-list-item';
import { SocialHistoryFormDialog } from './social-history-form-dialog';

interface PatientSocialHistoryTabProps {
  patientId: number;
  readOnly?: boolean;
}

export function PatientSocialHistoryTab({
  patientId,
  readOnly = false,
}: PatientSocialHistoryTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: observations, isLoading } = usePatientSocialHistory(patientId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const items = observations ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base sm:text-lg">Social History</CardTitle>
          {items.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {items.length}
            </Badge>
          )}
          <HelpPopover content="Structured social history observations (alcohol, tobacco, occupation, lifestyle). These map to FHIR Observation resources for IPS interoperability." />
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setShowAddDialog(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" />
            Add Observation
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {items.length === 0 && (
          <EmptyState
            icon={HeartPulse}
            title="No social history recorded"
            description="No social history observations have been recorded for this patient."
          />
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((obs) => (
              <SocialHistoryListItem
                key={obs.id}
                observation={obs}
                patientId={patientId}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Dialog */}
      <SocialHistoryFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        patientId={patientId}
      />
    </Card>
  );
}
