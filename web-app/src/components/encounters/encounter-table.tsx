'use client';

import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Encounter } from '@/lib/types/encounter';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
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
}

export function EncounterTable({
  encounters,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
}: EncounterTableProps) {
  const router = useRouter();

  const hasCriticalVitals = (encounter: Encounter) => {
    return encounter.spo2 !== null && encounter.spo2 < 95;
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
        title="No encounters found"
        description="Try adjusting your filters or create a new encounter."
        action={{
          label: 'New Encounter',
          onClick: () => router.push('/encounters/new'),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Chief Complaint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vitals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              encounters.map((encounter) => {
                const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
                const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);
                const isCritical = hasCriticalVitals(encounter);

                return (
                  <TableRow
                    key={encounter.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      isCritical && 'bg-red-50 dark:bg-red-950/20'
                    )}
                    onClick={() => router.push(`/encounters/${encounter.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{encounter.patient_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {encounter.patient_mrn}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{type?.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {encounter.chief_complaint}
                    </TableCell>
                    <TableCell>
                      <Badge className={status?.color}>{status?.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(encounter.encounter_date)}
                    </TableCell>
                    <TableCell>
                      {isCritical ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          SpO2: {encounter.spo2}%
                        </Badge>
                      ) : encounter.spo2 ? (
                        <span className="text-sm text-muted-foreground">
                          SpO2: {encounter.spo2}%
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
