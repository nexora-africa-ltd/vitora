'use client';

import { useRouter } from 'next/navigation';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, AlertTriangle, Clock } from 'lucide-react';
import { Encounter } from '@/lib/types/encounter';
import { formatDate } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils/cn';

interface EncounterTableProps {
  encounters: Encounter[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function EncounterTable({
  encounters,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  emptyTitle = 'No encounters found',
  emptyDescription = 'Try adjusting your filters or create a new encounter.',
}: EncounterTableProps) {
  const router = useRouter();

  const hasCriticalVitals = (encounter: Encounter) => {
    return encounter.spo2 != null && encounter.spo2 < 95;
  };

  if (error) {
    return (
      <EmptyState
        title="Error loading encounters"
        description={error.message}
        action={{
          label: 'Try again',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (!isLoading && encounters.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={{
          label: 'New Encounter',
          onClick: () => router.push('/encounters/new'),
        }}
      />
    );
  }

  // Mobile card rendering
  const renderMobileCard = (encounter: Encounter) => {
    const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
    const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);
    const isCritical = hasCriticalVitals(encounter);

    return (
      <Card
        className={cn(
          'p-3 hover:bg-muted/50 transition-colors',
          isCritical && 'border-destructive/50 bg-destructive/10'
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Top row: Patient name + Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{encounter.patient_name}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {encounter.patient_mrn}
              </p>
            </div>
            <Badge className={cn(status?.color, 'shrink-0 text-xs w-fit')}>
              {status?.label}
            </Badge>
          </div>

          {/* Chief complaint */}
          <p className="text-sm text-muted-foreground line-clamp-2">
            {encounter.chief_complaint}
          </p>

          {/* Bottom row: Type, Date, Vitals */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="text-xs">
              {type?.label}
            </Badge>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(encounter.encounter_date)}
            </span>
            {isCritical && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                SpO2: {encounter.spo2}%
              </Badge>
            )}
          </div>
        </div>
      </Card>
    );
  };

  // Column definitions for ResponsiveTable
  const columns = [
    {
      key: 'patient',
      header: 'Patient',
      sortable: true,
      sortFn: (a: Encounter, b: Encounter) => (a.patient_name || '').localeCompare(b.patient_name || ''),
      cell: (encounter: Encounter) => (
        <div>
          <p className="font-medium">{encounter.patient_name}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {encounter.patient_mrn}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortFn: (a: Encounter, b: Encounter) => (a.encounter_type || '').localeCompare(b.encounter_type || ''),
      cell: (encounter: Encounter) => {
        const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);
        return <Badge variant="outline">{type?.label}</Badge>;
      },
      hideOnMobile: true,
    },
    {
      key: 'chief_complaint',
      header: 'Chief Complaint',
      sortable: true,
      cell: (encounter: Encounter) => (
        <span className="block max-w-[200px] truncate">{encounter.chief_complaint}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortFn: (a: Encounter, b: Encounter) => (a.status || '').localeCompare(b.status || ''),
      cell: (encounter: Encounter) => {
        const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
        return <Badge className={status?.color}>{status?.label}</Badge>;
      },
    },
    {
      key: 'encounter_date',
      header: 'Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (encounter: Encounter) => (
        <span className="text-muted-foreground">{formatDate(encounter.encounter_date)}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'vitals',
      header: 'Vitals',
      cell: (encounter: Encounter) => {
        const isCritical = hasCriticalVitals(encounter);
        if (isCritical) {
          return (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              SpO2: {encounter.spo2}%
            </Badge>
          );
        }
        if (encounter.spo2) {
          return (
            <span className="text-sm text-muted-foreground">SpO2: {encounter.spo2}%</span>
          );
        }
        return <span className="text-sm text-muted-foreground">—</span>;
      },
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <ResponsiveTable
        data={encounters}
        columns={columns}
        keyExtractor={(encounter) => encounter.id}
        onRowClick={(encounter) => router.push(`/encounters/${encounter.id}`)}
        isLoading={isLoading}
        emptyMessage={emptyTitle}
        mobileCard={renderMobileCard}
        rowClassName={(encounter) =>
          hasCriticalVitals(encounter) ? 'bg-destructive/10' : ''
        }
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex-1 sm:flex-none"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex-1 sm:flex-none"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
