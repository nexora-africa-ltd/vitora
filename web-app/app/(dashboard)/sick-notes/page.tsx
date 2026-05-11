/**
 * Sick Notes List Page
 * Shows all sick notes/medical certificates with filters.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { sickNotesApi } from '@/lib/api/sick-notes';
import type { SickNoteListItem, SickNoteStatus } from '@/lib/types/sick-note';
import { SICK_NOTE_STATUS_CONFIG } from '@/lib/types/sick-note';

const STATUS_COLORS: Record<SickNoteStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ISSUED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  REVOKED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function SickNotesPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<SickNoteStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['sick-notes', page, debouncedSearch, statusFilter],
    queryFn: () =>
      sickNotesApi.list({
        page,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      }),
  });

  const sickNotes: SickNoteListItem[] = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  if (isLoading && sickNotes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Sick Notes" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Sick Notes"
          helpContent="Manage medical certificates and sick notes issued to patients. Track leave periods, issue status, and print official documents."
          actions={
            <Button onClick={() => router.push('/sick-notes/new')} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Sick Note</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by note number, patient..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as SickNoteStatus | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="REVOKED">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={sickNotes}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => router.push(`/sick-notes/${item.id}`)}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'note_number',
              header: 'Note #',
              sortable: true,
              cell: (item) => (
                <span className="font-mono text-sm">{item.note_number}</span>
              ),
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              cell: (item) => (
                <div>
                  <div className="font-medium">{item.patient_name}</div>
                  <div className="text-xs text-muted-foreground">{item.patient_mrn}</div>
                </div>
              ),
            },
            {
              key: 'diagnosis_text',
              header: 'Diagnosis',
              sortable: true,
              cell: (item) => (
                <span className="text-sm truncate max-w-[200px] block">
                  {item.diagnosis_text}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'leave_start_date',
              header: 'Leave Period',
              sortable: true,
              sortType: 'date',
              cell: (item) => (
                <div className="text-sm">
                  <div>
                    {format(new Date(item.leave_start_date), 'dd MMM')} –{' '}
                    {format(new Date(item.leave_end_date), 'dd MMM yyyy')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.leave_days} day{item.leave_days !== 1 ? 's' : ''}
                  </div>
                </div>
              ),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => (
                <Badge className={`${STATUS_COLORS[item.status as SickNoteStatus] || ''} shrink-0 w-fit`}>
                  {SICK_NOTE_STATUS_CONFIG[item.status as SickNoteStatus]?.label || item.status}
                </Badge>
              ),
            },
            {
              key: 'issued_by_name',
              header: 'Issued By',
              sortable: true,
              cell: (item) => (
                <span className="text-sm">{item.issued_by_name}</span>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(item) => (
            <div className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-sm">{item.note_number}</span>
                </div>
                <div className="mt-1 font-medium">{item.patient_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {item.diagnosis_text}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(item.leave_start_date), 'dd MMM')} –{' '}
                  {format(new Date(item.leave_end_date), 'dd MMM yyyy')} ({item.leave_days}d)
                </div>
              </div>
              <Badge className={`${STATUS_COLORS[item.status as SickNoteStatus] || ''} shrink-0 w-fit self-start`}>
                {SICK_NOTE_STATUS_CONFIG[item.status as SickNoteStatus]?.label || item.status}
              </Badge>
            </div>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalCount} sick note{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
