'use client';

import { useMemo } from 'react';
import { useConsultationQueue } from '@/lib/hooks/use-consultation-queue';
import { useEncounters } from '@/lib/hooks/use-encounters';
import { useWaitingQueue } from '@/lib/hooks/use-triage';

export interface ClinicalWorkflowCounts {
  waitingForTriage: number;
  waitingForConsult: number;
  inProgress: number;
  pendingResults: number;
  readyToClose: number;
  completedToday: number;
  openWork: number;
}

export function useClinicalWorkflowCounts() {
  const waitingQueue = useWaitingQueue({});
  const consultationQueue = useConsultationQueue(undefined, { pollingInterval: 15000 });
  const inProgress = useEncounters({ page: 1, page_size: 1, status: 'IN_PROGRESS', ordering: '-encounter_date' });
  const pendingResults = useEncounters({ page: 1, page_size: 1, status: 'RESULTS_PENDING', ordering: '-encounter_date' });
  const readyToClose = useEncounters({ page: 1, page_size: 1, status: 'READY_TO_CLOSE', ordering: '-encounter_date' });
  const today = new Date().toISOString().split('T')[0];
  const completedToday = useEncounters({
    page: 1,
    page_size: 1,
    status: 'CLOSED',
    encounter_date: today,
    ordering: '-encounter_date',
  });

  const counts = useMemo<ClinicalWorkflowCounts>(() => {
    const waitingForTriage = waitingQueue.data?.count ?? 0;
    const waitingForConsult = consultationQueue.data?.count ?? 0;
    const inProgressCount = inProgress.data?.count ?? 0;
    const pendingResultsCount = pendingResults.data?.count ?? 0;
    const readyToCloseCount = readyToClose.data?.count ?? 0;
    const completedTodayCount = completedToday.data?.count ?? 0;

    return {
      waitingForTriage,
      waitingForConsult,
      inProgress: inProgressCount,
      pendingResults: pendingResultsCount,
      readyToClose: readyToCloseCount,
      completedToday: completedTodayCount,
      openWork:
        waitingForTriage +
        waitingForConsult +
        inProgressCount +
        pendingResultsCount +
        readyToCloseCount,
    };
  }, [
    waitingQueue.data?.count,
    consultationQueue.data?.count,
    inProgress.data?.count,
    pendingResults.data?.count,
    readyToClose.data?.count,
    completedToday.data?.count,
  ]);

  const isLoading = [
    waitingQueue.isLoading,
    consultationQueue.isLoading,
    inProgress.isLoading,
    pendingResults.isLoading,
    readyToClose.isLoading,
    completedToday.isLoading,
  ].some(Boolean);

  return {
    counts,
    isLoading,
  };
}
