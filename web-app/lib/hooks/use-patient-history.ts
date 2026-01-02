/**
 * React hooks for patient history/timeline data fetching.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { 
  PatientHistoryParams, 
  PatientHistoryResponse, 
  TimelineEvent,
  TimelineFilters 
} from '@/lib/types/timeline';
import type { Encounter } from '@/lib/types/encounter';

// Transform encounters to timeline events
function transformEncounterToTimelineEvent(encounter: Encounter): TimelineEvent {
  return {
    id: `encounter-${encounter.id}`,
    type: 'encounter',
    title: `${encounter.encounter_type} Visit`,
    description: encounter.chief_complaint,
    timestamp: encounter.encounter_date,
    metadata: {
      encounterId: encounter.id,
      encounterType: encounter.encounter_type,
      status: encounter.status,
      provider: undefined, // Provider name not available in current Encounter type
    },
  };
}

// Mock patient history API - transforms encounters into timeline format
// In production, this would call a dedicated /api/patients/{id}/history endpoint
async function fetchPatientHistory(params: PatientHistoryParams): Promise<PatientHistoryResponse> {
  const { patientId, filters, page = 1, pageSize = 20 } = params;
  
  // Fetch patient encounters
  const encountersResponse = await apiClient.get(`/api/encounters/`, {
    params: {
      patient: patientId,
      page,
      page_size: pageSize,
      ordering: '-encounter_date',
    },
  });

  const encounters: Encounter[] = encountersResponse.data.results || [];
  const totalCount = encountersResponse.data.count || 0;

  // Transform to timeline events
  let events: TimelineEvent[] = encounters.map(transformEncounterToTimelineEvent);

  // Apply client-side filters (in production, this would be server-side)
  if (filters?.eventTypes && filters.eventTypes.length > 0) {
    events = events.filter(event => filters.eventTypes.includes(event.type));
  }

  if (filters?.startDate) {
    events = events.filter(event => event.timestamp >= filters.startDate!);
  }

  if (filters?.endDate) {
    events = events.filter(event => event.timestamp <= filters.endDate!);
  }

  if (filters?.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    events = events.filter(
      event =>
        event.title.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query)
    );
  }

  // Calculate summary
  const summary = {
    totalEncounters: totalCount,
    totalLabResults: 0, // Would come from lab API
    totalPrescriptions: 0, // Would come from pharmacy API
    lastVisit: encounters[0]?.encounter_date,
  };

  return {
    events,
    totalCount,
    hasMore: page * pageSize < totalCount,
    summary,
  };
}

/**
 * Hook for fetching patient history/timeline.
 */
export function usePatientHistory(patientId: number, filters?: TimelineFilters) {
  return useQuery({
    queryKey: ['patient-history', patientId, filters],
    queryFn: () => fetchPatientHistory({ patientId, filters }),
    enabled: !!patientId,
  });
}

/**
 * Hook for infinite scrolling patient history.
 */
export function usePatientHistoryInfinite(patientId: number, filters?: TimelineFilters) {
  return useInfiniteQuery({
    queryKey: ['patient-history-infinite', patientId, filters],
    queryFn: ({ pageParam = 1 }) => 
      fetchPatientHistory({ patientId, filters, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => 
      lastPage.hasMore ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!patientId,
  });
}

/**
 * Hook for fetching patient history summary only.
 */
export function usePatientHistorySummary(patientId: number) {
  return useQuery({
    queryKey: ['patient-history-summary', patientId],
    queryFn: async () => {
      const response = await fetchPatientHistory({ patientId, page: 1, pageSize: 1 });
      return response.summary;
    },
    enabled: !!patientId,
  });
}
