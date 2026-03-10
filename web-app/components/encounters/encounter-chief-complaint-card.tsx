'use client';

import { useState } from 'react';
import { Pencil, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChiefComplaintEditDialog } from '@/components/encounters/chief-complaint-edit-dialog';
import { useEditChiefComplaint } from '@/lib/hooks/use-encounters';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import type { Encounter } from '@/lib/types/encounter';

interface EncounterChiefComplaintCardProps {
  encounter: Encounter;
}

export function EncounterChiefComplaintCard({ encounter }: EncounterChiefComplaintCardProps) {
  const { canAccessModule, canPerformAction } = usePermissions();
  const { toast } = useToast();
  const editChiefComplaint = useEditChiefComplaint();
  const [dialogOpen, setDialogOpen] = useState(false);

  const canEditChiefComplaint =
    canAccessModule('encounters' as never)
    && canPerformAction('encounters.edit' as never)
    && encounter.triage_status === 'COMPLETED'
    && encounter.status !== 'CLOSED'
    && encounter.status !== 'CANCELLED';

  const handleConfirm = async (data: {
    chief_complaint: string;
    edit_reason: string;
    edit_reason_other: string;
  }) => {
    try {
      await editChiefComplaint.mutateAsync({
        encounterId: encounter.id,
        data,
      });
      setDialogOpen(false);
      toast({
        title: 'Chief complaint updated',
        description: 'The change was saved with an audit trail.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update chief complaint.';
      toast({
        title: 'Unable to update chief complaint',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
              Chief Complaint
            </CardTitle>

            {canEditChiefComplaint ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setDialogOpen(true)}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-3 sm:px-6">
          <p className="text-sm sm:text-base">{encounter.chief_complaint}</p>

          {encounter.chief_complaint_edited ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-medium">Chief complaint edited after initial recording</p>
              <p>
                {encounter.chief_complaint_edited_by_username
                  ? `Edited by ${encounter.chief_complaint_edited_by_username}`
                  : 'Edited'}
                {encounter.chief_complaint_edited_at
                  ? ` on ${new Date(encounter.chief_complaint_edited_at).toLocaleString()}`
                  : ''}
                {encounter.chief_complaint_edit_reason
                  ? ` • Reason: ${encounter.chief_complaint_edit_reason.replace(/_/g, ' ').toLowerCase()}`
                  : ''}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ChiefComplaintEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentComplaint={encounter.chief_complaint}
        originalComplaint={encounter.chief_complaint_original ?? undefined}
        onConfirm={handleConfirm}
        isLoading={editChiefComplaint.isPending}
      />
    </>
  );
}