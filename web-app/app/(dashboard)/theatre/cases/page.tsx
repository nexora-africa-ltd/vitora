'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, ClipboardList, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList, SurgeryCaseListParams } from '@/lib/types/theatre';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PRE_OP: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  IN_THEATRE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  IN_SURGERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  IN_PACU: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  DISCHARGED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  POSTPONED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PRE_OP', label: 'Pre-Op' },
  { value: 'IN_THEATRE', label: 'In Theatre' },
  { value: 'IN_SURGERY', label: 'In Surgery' },
  { value: 'IN_PACU', label: 'In PACU' },
  { value: 'DISCHARGED', label: 'Discharged' },
  { value: 'POSTPONED', label: 'Postponed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'ELECTIVE', label: 'Elective' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

export default function TheatreCasesPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [cases, setCases] = useState<SurgeryCaseList[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [page, setPage] = useState(1);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const params: SurgeryCaseListParams = { page, search: search || undefined };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      const data = await theatreApi.listCases(params);
      setCases(data.results);
      setTotalCount(data.count);
    } catch {
      setCases([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter]);

  const totalPages = Math.ceil(totalCount / 20);

  return (
    <PullToRefresh onRefresh={() => { refresh(); return fetchCases(); }} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Surgery Cases"
          helpContent="Browse and manage all surgery cases. Filter by status, priority, or search by patient name, MRN, or case number."
          actions={
            <Button asChild>
              <Link href="/theatre/cases/new">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Book Surgery</span>
              </Link>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient, MRN, or case #"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={cases}
          keyExtractor={c => c.id}
          onRowClick={c => router.push(`/theatre/cases/${c.case_number}`)}
          loading={loading}
          emptyState={
            <div className="text-center py-12">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No cases found.</p>
            </div>
          }
          columns={[
            {
              key: 'case_number',
              header: 'Case #',
              sortable: true,
              cell: c => <span className="font-medium">{c.case_number}</span>,
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              sortFn: (a, b) => a.patient_name.localeCompare(b.patient_name),
              cell: c => (
                <div>
                  <div className="truncate">{c.patient_name}</div>
                  <div className="text-xs text-muted-foreground">{c.patient_mrn}</div>
                </div>
              ),
            },
            {
              key: 'primary_procedure_name',
              header: 'Procedure',
              sortable: true,
              cell: c => <span className="truncate">{c.primary_procedure_name}</span>,
            },
            {
              key: 'scheduled_date',
              header: 'Date',
              sortable: true,
              sortType: 'date' as const,
              cell: c => (
                <div>
                  <div>{c.scheduled_date}</div>
                  {c.scheduled_start_time && (
                    <div className="text-xs text-muted-foreground">{c.scheduled_start_time.slice(0, 5)}</div>
                  )}
                </div>
              ),
              hideOnMobile: true,
            },
            {
              key: 'theatre_name',
              header: 'Theatre',
              sortable: true,
              cell: c => c.theatre_name,
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: c => (
                <Badge className={`${STATUS_COLORS[c.status] || ''} text-xs shrink-0 w-fit`}>
                  {c.status.replace(/_/g, ' ')}
                </Badge>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              sortable: true,
              cell: c =>
                c.priority !== 'ELECTIVE' ? (
                  <Badge
                    className={`text-xs shrink-0 w-fit ${c.priority === 'EMERGENCY' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}
                  >
                    {c.priority === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
                    {c.priority}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Elective</span>
                ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={c => (
            <Card className="p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.primary_procedure_name}</p>
                  <p className="text-sm text-muted-foreground truncate">{c.patient_name} &middot; {c.patient_mrn}</p>
                  <p className="text-xs text-muted-foreground">{c.case_number} &middot; {c.scheduled_date} {c.scheduled_start_time?.slice(0, 5) || ''}</p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  <Badge className={`${STATUS_COLORS[c.status] || ''} text-xs w-fit`}>
                    {c.status.replace(/_/g, ' ')}
                  </Badge>
                  {c.priority !== 'ELECTIVE' && (
                    <Badge className={`text-xs w-fit ${c.priority === 'EMERGENCY' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {c.priority}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} &middot; {totalCount} case{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
