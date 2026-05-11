/**
 * Referrals Dashboard Page
 * Central view of all clinical referrals across modules.
 * Supports filtering by status, type, service, and priority.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
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
import { useReferrals } from '@/lib/hooks/use-referrals';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type {
  ClinicalReferralListItem,
  ReferralStatus,
  ReferralPriority,
  ReferralType,
} from '@/lib/types/referral';

const STATUS_COLORS: Record<ReferralStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ACCEPTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  DECLINED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const PRIORITY_COLORS: Record<ReferralPriority, string> = {
  ROUTINE: 'bg-muted text-muted-foreground',
  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function ReferralsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ReferralPriority | ''>('');
  const [typeFilter, setTypeFilter] = useState<ReferralType | ''>('');

  const { data, isLoading } = useReferrals({
    page,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    referral_type: typeFilter || undefined,
  });

  const referrals: ClinicalReferralListItem[] = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  if (isLoading && referrals.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Referrals"
          helpContent="View and manage all clinical referrals. Track referrals across departments — allied health, specialty clinics, admissions, and external facilities."
          actions={
            <Button onClick={() => router.push('/referrals/new')} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Referral</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patient, referral #..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ReferralStatus | ''); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ACCEPTED">Accepted</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="DECLINED">Declined</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v as ReferralPriority | ''); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Priorities</SelectItem>
              <SelectItem value="ROUTINE">Routine</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="EMERGENCY">Emergency</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as ReferralType | ''); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              <SelectItem value="ALLIED_HEALTH">Allied Health</SelectItem>
              <SelectItem value="SPECIALTY_CLINIC">Specialty Clinic</SelectItem>
              <SelectItem value="ADMISSION">Admission</SelectItem>
              <SelectItem value="EXTERNAL">External</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={referrals}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => router.push(`/encounters/${item.encounter}`)}
          emptyMessage="No referrals found."
          columns={[
            {
              key: 'referral_number',
              header: 'Referral #',
              cell: (item: ClinicalReferralListItem) => (
                <span className="font-medium text-sm">{item.referral_number}</span>
              ),
            },
            {
              key: 'patient',
              header: 'Patient',
              cell: (item: ClinicalReferralListItem) => (
                <div>
                  <p className="font-medium truncate">{item.patient_name}</p>
                  <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
                </div>
              ),
            },
            {
              key: 'target_service',
              header: 'Service',
              cell: (item: ClinicalReferralListItem) => item.target_service_display,
            },
            {
              key: 'priority',
              header: 'Priority',
              cell: (item: ClinicalReferralListItem) => (
                <Badge className={PRIORITY_COLORS[item.priority]}>
                  {item.priority_display}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (item: ClinicalReferralListItem) => (
                <Badge className={STATUS_COLORS[item.status]}>
                  {item.status_display}
                </Badge>
              ),
            },
            {
              key: 'referred_by',
              header: 'Referred By',
              cell: (item: ClinicalReferralListItem) => item.referred_by_name,
            },
            {
              key: 'created_at',
              header: 'Date',
              cell: (item: ClinicalReferralListItem) => format(new Date(item.created_at), 'dd MMM yyyy'),
            },
          ]}
          mobileCard={(item: ClinicalReferralListItem) => (
            <Card className="p-3" onClick={() => router.push(`/encounters/${item.encounter}`)}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.patient_name}</p>
                  <p className="text-xs text-muted-foreground">{item.referral_number} · {item.patient_mrn}</p>
                </div>
                <Badge className={`${STATUS_COLORS[item.status]} shrink-0 w-fit`}>
                  {item.status_display}
                </Badge>
              </div>
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className="text-muted-foreground">{item.target_service_display}</span>
                <Badge className={PRIORITY_COLORS[item.priority]} variant="outline">
                  {item.priority_display}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                By {item.referred_by_name} · {format(new Date(item.created_at), 'dd MMM yyyy')}
              </p>
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalCount} referral{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
