/**
 * ConsultationQueueContainer Component
 *
 * Full integration container that wires together:
 * - ConsultationQueue display component
 * - useConsultationQueue data fetching hook
 * - useCallPatient mutation hook
 * - useStartConsultation mutation hook
 * - useBypassTriage mutation hook
 * - useClaimEncounter / useReleaseEncounter hooks (Sprint 1.7)
 * - StartConsultationDialog
 * - BypassTriageDialog
 *
 * Phase 3.5: Full Integration
 * Sprint 1.7: Data Integrity - Clinician Claim/Release
 */
'use client';

import React, { useState, useCallback } from 'react';
import { ConsultationQueue } from './consultation-queue';
import { StartConsultationDialog } from './start-consultation-dialog';
import { BypassTriageDialog, type BypassTriageEncounter } from './bypass-triage-dialog';
import {
  useConsultationQueue,
  useCallPatient,
  useStartConsultation,
  useBypassTriage,
  useClaimEncounter,
  useReleaseEncounter,
} from '@/lib/hooks/use-consultation-queue';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import type { ConsultationQueueItem } from '@/lib/types/encounter';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Users, UserPlus } from 'lucide-react';
import Link from 'next/link';
import axios from 'axios';

// =============================================================================
// Types
// =============================================================================

export interface ConsultationQueueContainerProps {
  /** Auto-refresh interval in milliseconds. Default: 30000 (30s). Set to 0 to disable. */
  autoRefreshInterval?: number;
}

// =============================================================================
// Component
// =============================================================================

export function ConsultationQueueContainer({
  autoRefreshInterval = 30000,
}: ConsultationQueueContainerProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Data fetching
  const {
    data: queueData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useConsultationQueue();

  // Mutations
  const callPatientMutation = useCallPatient();
  const startConsultationMutation = useStartConsultation();
  const bypassTriageMutation = useBypassTriage();
  const claimEncounterMutation = useClaimEncounter();
  const releaseEncounterMutation = useReleaseEncounter();

  // Dialog state
  const [startConsultationDialogOpen, setStartConsultationDialogOpen] = useState(false);
  const [bypassTriageDialogOpen, setBypassTriageDialogOpen] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState<ConsultationQueueItem | null>(null);

  // ===========================================================================
  // Handlers
  // ===========================================================================

  /**
   * Handle calling a patient (also claims the encounter automatically)
   */
  const handleCallPatient = useCallback(
    async (encounterId: number) => {
      try {
        await callPatientMutation.mutateAsync(encounterId);
        toast({
          title: 'Patient Called',
          description: 'The patient has been notified. You can now start the consultation.',
        });
      } catch (err) {
        // Handle 409 Conflict (already claimed by another)
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          toast({
            title: 'Patient Unavailable',
            description: err.response.data?.detail || 'This patient is already with another clinician.',
            variant: 'destructive',
          });
        } else {
          const message = err instanceof Error ? err.message : 'Failed to call patient';
          toast({
            title: 'Error',
            description: message,
            variant: 'destructive',
          });
        }
        throw err;
      }
    },
    [callPatientMutation, toast]
  );

  /**
   * Handle opening start consultation dialog
   */
  const handleStartConsultationClick = useCallback((encounterId: number) => {
    const item = queueData?.results.find((q) => q.id === encounterId);
    if (item) {
      setSelectedQueueItem(item);
      setStartConsultationDialogOpen(true);
    }
  }, [queueData]);

  /**
   * Handle starting consultation (from dialog)
   */
  const handleStartConsultation = useCallback(
    async (encounterId: number) => {
      try {
        await startConsultationMutation.mutateAsync(encounterId);
        toast({
          title: 'Consultation Started',
          description: 'You are now documenting the consultation.',
        });
        // Navigation is handled by the dialog
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start consultation';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [startConsultationMutation, toast]
  );

  /**
   * Handle opening bypass triage dialog
   */
  const handleBypassTriageClick = useCallback((encounter: BypassTriageEncounter) => {
    // This would be called from a bypass button if needed
    setSelectedQueueItem(queueData?.results.find((q) => q.id === encounter.id) || null);
    setBypassTriageDialogOpen(true);
  }, [queueData]);

  /**
   * Handle bypassing triage (from dialog)
   */
  const handleBypassTriage = useCallback(
    async (encounterId: number, reason: string, notes?: string) => {
      try {
        await bypassTriageMutation.mutateAsync({ encounterId, reason, notes });
        toast({
          title: 'Triage Bypassed',
          description: 'Patient can now proceed to consultation.',
        });
        setBypassTriageDialogOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to bypass triage';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [bypassTriageMutation, toast]
  );

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // ===========================================================================
  // Claim/Release Handlers (Data Integrity - Sprint 1.7)
  // ===========================================================================

  /**
   * Handle claiming an encounter
   */
  const handleClaimEncounter = useCallback(
    async (encounterId: number) => {
      try {
        await claimEncounterMutation.mutateAsync(encounterId);
        toast({
          title: 'Encounter Claimed',
          description: 'You can now start the consultation.',
        });
      } catch (err) {
        // Handle 409 Conflict (already claimed by another)
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          toast({
            title: 'Already Claimed',
            description: err.response.data?.error || 'This encounter is already claimed by another clinician.',
            variant: 'destructive',
          });
        } else {
          const message = err instanceof Error ? err.message : 'Failed to claim encounter';
          toast({
            title: 'Error',
            description: message,
            variant: 'destructive',
          });
        }
      }
    },
    [claimEncounterMutation, toast]
  );

  /**
   * Handle releasing an encounter
   */
  const handleReleaseEncounter = useCallback(
    async (encounterId: number) => {
      try {
        await releaseEncounterMutation.mutateAsync(encounterId);
        toast({
          title: 'Encounter Released',
          description: 'Another clinician can now claim this encounter.',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to release encounter';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
      }
    },
    [releaseEncounterMutation, toast]
  );

  // ===========================================================================
  // Render States
  // ===========================================================================

  // Loading state
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading consultation queue">
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-3 mt-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">
            Failed to load consultation queue
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'An error occurred'}
          </p>
          <button
            onClick={handleRefresh}
            className="text-sm text-primary underline hover:no-underline"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!queueData?.results.length) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No patients in queue</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Patients will appear here once they complete triage or are registered
            for encounters that don&apos;t require triage.
          </p>
          <Button asChild>
            <Link href="/patients">
              <UserPlus className="h-4 w-4 mr-2" />
              Select from Patient List
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ===========================================================================
  // Main Render
  // ===========================================================================

  return (
    <>
      <ConsultationQueue
        queueItems={queueData.results}
        currentUserId={user?.id}
        onCallPatient={handleCallPatient}
        onStartConsultation={handleStartConsultationClick}
        onClaimEncounter={handleClaimEncounter}
        onReleaseEncounter={handleReleaseEncounter}
        onRefresh={handleRefresh}
        isLoading={isFetching}
        error={null}
        autoRefreshInterval={autoRefreshInterval}
        isClaimingEncounter={claimEncounterMutation.isPending}
        isReleasingEncounter={releaseEncounterMutation.isPending}
      />

      {/* Start Consultation Dialog */}
      {selectedQueueItem && (
        <StartConsultationDialog
          queueItem={selectedQueueItem}
          open={startConsultationDialogOpen}
          onOpenChange={(open) => {
            setStartConsultationDialogOpen(open);
            if (!open) setSelectedQueueItem(null);
          }}
          onStartConsultation={handleStartConsultation}
          isLoading={startConsultationMutation.isPending}
          error={
            startConsultationMutation.error instanceof Error
              ? startConsultationMutation.error.message
              : null
          }
          navigateOnSuccess={true}
        />
      )}

      {/* Bypass Triage Dialog (for future use) */}
      {selectedQueueItem && (
        <BypassTriageDialog
          encounter={{
            id: selectedQueueItem.id,
            patient_name: selectedQueueItem.patient_name,
            patient_mrn: selectedQueueItem.patient_mrn,
            encounter_type: selectedQueueItem.encounter_type,
            encounter_type_display: selectedQueueItem.encounter_type_display,
            triage_requirement: 'OPTIONAL', // Would come from actual data
            triage_status: selectedQueueItem.triage_status,
          }}
          open={bypassTriageDialogOpen}
          onOpenChange={(open) => {
            setBypassTriageDialogOpen(open);
            if (!open) setSelectedQueueItem(null);
          }}
          onBypass={handleBypassTriage}
          isLoading={bypassTriageMutation.isPending}
          error={
            bypassTriageMutation.error instanceof Error
              ? bypassTriageMutation.error.message
              : null
          }
        />
      )}
    </>
  );
}

export default ConsultationQueueContainer;
