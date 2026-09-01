/**
 * Allergy List Item Component
 *
 * Individual allergy row with severity badge and actions.
 */

'use client';

import { useState } from 'react';
import { AlertTriangle, Check, MoreVertical, Pencil, Trash2 } from 'lucide-react';
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
import { useDeleteAllergy, useResolveAllergy } from '@/lib/hooks/use-allergies';
import { AllergyFormDialog } from './allergy-form-dialog';
import type { AllergyListItem, AllergySeverity } from '@/lib/types/allergy';

interface AllergyListItemRowProps {
  allergy: AllergyListItem;
  patientId: number;
  readOnly?: boolean;
}

// Severity color mapping
const severityColors: Record<AllergySeverity, string> = {
  mild: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  moderate: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  severe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  life_threatening: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300 font-semibold',
};

// Substance type icons
const substanceTypeLabels: Record<string, string> = {
  medication: 'Medication',
  food: 'Food',
  environmental: 'Environmental',
  biological: 'Biological',
  other: 'Other',
};

export function AllergyListItemRow({
  allergy,
  patientId,
  readOnly = false,
}: AllergyListItemRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteAllergy = useDeleteAllergy(patientId);
  const resolveAllergy = useResolveAllergy(patientId);

  const isActive = allergy.status === 'active';
  const badgeColor = severityColors[allergy.severity] ?? 'bg-muted text-muted-foreground';

  const handleResolve = () => {
    resolveAllergy.mutate(allergy.id);
  };

  const handleDelete = () => {
    deleteAllergy.mutate(allergy.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div
        className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
          allergy.is_high_risk ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/30'
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {/* High risk indicator */}
          {allergy.is_high_risk && (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{allergy.substance}</span>
              <Badge variant="outline" className="shrink-0 text-xs">
                {substanceTypeLabels[allergy.substance_type] ?? allergy.substance_type}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Reaction: {allergy.reaction_type.replace(/_/g, ' ')}
              {allergy.onset_date && (
                <span className="hidden sm:inline">
                  {' • '}Onset: {new Date(allergy.onset_date).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:gap-3 sm:self-auto">
          {/* Severity badge */}
          <Badge className={`${badgeColor} shrink-0`}>{allergy.severity_display}</Badge>

          {/* Actions dropdown (only if not read-only and active) */}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Allergy actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {isActive && (
                  <DropdownMenuItem onClick={handleResolve} disabled={resolveAllergy.isPending}>
                    <Check className="mr-2 h-4 w-4" />
                    Mark Resolved
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <AllergyFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        patientId={patientId}
        allergyId={allergy.id}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Allergy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the allergy record for{' '}
              <strong>{allergy.substance}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteAllergy.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteAllergy.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
