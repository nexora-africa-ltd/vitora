/**
 * Social History List Item Component
 *
 * Individual observation row with type badge and actions.
 */

'use client';

import { useState } from 'react';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeleteSocialHistory } from '@/lib/hooks/use-social-history';
import { SocialHistoryFormDialog } from './social-history-form-dialog';
import type { SocialHistoryObservation, UsageStatus } from '@/lib/types/social-history';

interface SocialHistoryListItemProps {
  observation: SocialHistoryObservation;
  patientId: number;
  readOnly?: boolean;
}

const statusColors: Record<UsageStatus, string> = {
  CURRENT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  FORMER: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  NEVER: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

const typeIcons: Record<string, string> = {
  ALCOHOL_USE: '🍺',
  TOBACCO_USE: '🚬',
  OCCUPATION: '💼',
  LIFESTYLE: '🏃',
};

export function SocialHistoryListItem({
  observation,
  patientId,
  readOnly = false,
}: SocialHistoryListItemProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteMutation = useDeleteSocialHistory(patientId);

  const badgeColor = statusColors[observation.status] ?? 'bg-muted text-muted-foreground';
  const icon = typeIcons[observation.observation_type] ?? '📝';

  const handleDelete = () => {
    deleteMutation.mutate(observation.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border bg-muted/30">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{observation.observation_type_display}</span>
              <Badge className={`${badgeColor} shrink-0`}>
                {observation.status_display}
              </Badge>
            </div>
            {observation.value_text && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {observation.value_text}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(observation.effective_date).toLocaleDateString()}
              {observation.recorded_by_username && (
                <span> &bull; {observation.recorded_by_username}</span>
              )}
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="shrink-0 self-end sm:self-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Social history actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <SocialHistoryFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        patientId={patientId}
        observationId={observation.id}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Social History</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this{' '}
              <strong>{observation.observation_type_display.toLowerCase()}</strong> record?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
