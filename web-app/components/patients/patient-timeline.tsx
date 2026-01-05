'use client';

import { useState, useCallback } from 'react';
import { Loader2, History, Calendar, FileText, TestTube2, Pill, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TimelineItem } from './timeline-item';
import { TimelineFilters } from './timeline-filters';
import { usePatientHistoryInfinite, usePatientHistorySummary } from '@/lib/hooks/use-patient-history';
import type { TimelineFilters as FilterType, TimelineEventType } from '@/lib/types/timeline';

interface PatientTimelineProps {
  patientId: number;
}

const defaultFilters: FilterType = {
  eventTypes: ['encounter', 'lab_result', 'prescription', 'vital_alert', 'diagnosis', 'admission', 'discharge'] as TimelineEventType[],
  startDate: undefined,
  endDate: undefined,
  searchQuery: undefined,
};

export function PatientTimeline({ patientId }: PatientTimelineProps) {
  const [filters, setFilters] = useState<FilterType>(defaultFilters);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = usePatientHistoryInfinite(patientId, filters);

  const { data: summary } = usePatientHistorySummary(patientId);

  const allEvents = data?.pages.flatMap(page => page.events) ?? [];

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) {
    return <TimelineSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Failed to load patient history.</p>
          <p className="text-sm text-destructive mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 print:hidden">
          <SummaryCard
            icon={FileText}
            label="Total Visits"
            value={summary.totalEncounters}
          />
          <SummaryCard
            icon={TestTube2}
            label="Lab Results"
            value={summary.totalLabResults}
          />
          <SummaryCard
            icon={Pill}
            label="Prescriptions"
            value={summary.totalPrescriptions}
          />
          <SummaryCard
            icon={Calendar}
            label="Last Visit"
            value={summary.lastVisit ? new Date(summary.lastVisit).toLocaleDateString() : 'Never'}
            isText
          />
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <TimelineFilters filters={filters} onChange={setFilters} />
        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Patient Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {allEvents.length === 0 ? (
            <EmptyTimeline />
          ) : (
            <div className="space-y-0" role="list" aria-label="Patient timeline">
              {allEvents.map((event, index) => (
                <div key={event.id} role="listitem">
                  <TimelineItem
                    event={event}
                    isLast={index === allEvents.length - 1 && !hasNextPage}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasNextPage && (
            <div className="mt-6 flex justify-center print:hidden">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  isText?: boolean;
}

function SummaryCard({ icon: Icon, label, value, isText }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-4 w-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className={isText ? 'text-sm font-medium' : 'text-2xl font-bold'}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyTimeline() {
  return (
    <div className="py-12 text-center">
      <History className="h-12 w-12 mx-auto text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">No History Found</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        This patient has no recorded events matching your filters.
      </p>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Timeline skeleton */}
      <Card>
        <CardHeader className="border-b">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default PatientTimeline;
