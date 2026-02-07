/**
 * Encounter State Transition Component
 *
 * Provides buttons for transitioning encounter status based on valid transitions.
 * Sprint 2 - Phase 2A: Enhanced State Machine
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { encountersApi } from '@/lib/api/encounters';
import type { EncounterStatus } from '@/lib/types/encounter';
import {
  VALID_ENCOUNTER_TRANSITIONS,
  ENCOUNTER_STATUS_DISPLAY,
} from '@/lib/types/encounter';
import { EncounterStatusBadge } from './encounter-status-badge';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface EncounterStateTransitionProps {
  encounterId: number;
  currentStatus: EncounterStatus;
  onTransitionComplete?: (newStatus: EncounterStatus) => void;
}

export function EncounterStateTransition({
  encounterId,
  currentStatus,
  onTransitionComplete,
}: EncounterStateTransitionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<EncounterStatus | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validTransitions = VALID_ENCOUNTER_TRANSITIONS[currentStatus] || [];

  const handleTransitionClick = (targetStatus: EncounterStatus) => {
    setSelectedStatus(targetStatus);
    setReason('');
    // For destructive actions (CANCELLED), show confirmation
    // For CLOSED, also show confirmation since it's terminal
    if (targetStatus === 'CANCELLED' || targetStatus === 'CLOSED') {
      setIsDialogOpen(true);
    } else {
      performTransition(targetStatus);
    }
  };

  const performTransition = async (targetStatus: EncounterStatus, transitionReason?: string) => {
    setIsLoading(true);
    try {
      const result = await encountersApi.transition(encounterId, {
        to_status: targetStatus,
        reason: transitionReason || reason,
      });
      toast.success(
        `Encounter transitioned to ${ENCOUNTER_STATUS_DISPLAY[result.status]}`
      );
      onTransitionComplete?.(result.status);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to transition encounter';
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsDialogOpen(false);
      setSelectedStatus(null);
    }
  };

  if (validTransitions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Current:</span>
        <EncounterStatusBadge status={currentStatus} />
      </div>

      <div className="flex flex-wrap gap-2">
        {validTransitions.map((targetStatus) => (
          <Button
            key={targetStatus}
            variant={targetStatus === 'CANCELLED' ? 'destructive' : 'outline'}
            size="sm"
            disabled={isLoading}
            onClick={() => handleTransitionClick(targetStatus)}
          >
            {isLoading && selectedStatus === targetStatus && (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            )}
            <ArrowRight className="h-3 w-3 mr-1" />
            {ENCOUNTER_STATUS_DISPLAY[targetStatus]}
          </Button>
        ))}
      </div>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedStatus === 'CANCELLED'
                ? 'Cancel Encounter?'
                : `Close Encounter?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStatus === 'CANCELLED'
                ? 'This action cannot be undone. The encounter will be permanently cancelled.'
                : 'Once closed, the encounter becomes immutable and cannot be edited.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason {selectedStatus === 'CANCELLED' ? '(required)' : '(optional)'}
            </Label>
            <Textarea
              id="reason"
              placeholder={
                selectedStatus === 'CANCELLED'
                  ? 'Why is this encounter being cancelled?'
                  : 'Add any notes about closing this encounter...'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStatus && performTransition(selectedStatus)}
              disabled={selectedStatus === 'CANCELLED' && !reason.trim()}
              className={
                selectedStatus === 'CANCELLED'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Confirm{' '}
              {selectedStatus
                ? ENCOUNTER_STATUS_DISPLAY[selectedStatus]
                : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
