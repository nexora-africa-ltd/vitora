'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Shield, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import { heiFollowUpApi } from '@/lib/api/mch';
import type { HEIStatus, HEIFollowUpListItem } from '@/lib/types/mch';

const STATUS_OPTIONS: { value: HEIStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CONFIRMED_NEGATIVE', label: 'Confirmed Negative' },
  { value: 'CONFIRMED_POSITIVE', label: 'Confirmed Positive' },
  { value: 'LOST_TO_FOLLOW_UP', label: 'Lost to Follow-up' },
  { value: 'TRANSFERRED', label: 'Transferred' },
  { value: 'DECEASED', label: 'Deceased' },
];

const statusColors: Record<HEIStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  CONFIRMED_NEGATIVE: 'bg-blue-100 text-blue-800',
  CONFIRMED_POSITIVE: 'bg-red-100 text-red-800',
  LOST_TO_FOLLOW_UP: 'bg-orange-100 text-orange-800',
  TRANSFERRED: 'bg-yellow-100 text-yellow-800',
  DECEASED: 'bg-gray-100 text-gray-800',
};

export default function HEIFollowUpPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [statusFilter, setStatusFilter] = useState<HEIStatus | ''>('');
  const [page, setPage] = useState(1);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['hei-followups-list', page, statusFilter],
    queryFn: () =>
      heiFollowUpApi.list({
        page,
        page_size: 20,
        status: statusFilter || undefined,
        ordering: '-created_at',
      }),
  });

  const followups = data?.results || [];
  const totalPages = Math.ceil((data?.count || 0) / 20);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-48" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="HEI Follow-up"
          helpContent="HIV-Exposed Infant follow-up tracking. Monitor PCR tests at 6 weeks, 9 months, and 18 months. Track ARV prophylaxis, feeding status, and final outcomes for all enrolled infants."
        />

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as HEIStatus | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load HEI follow-up records.</p>
          </div>
        ) : followups.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No HEI follow-up records found.
          </Card>
        ) : (
          <>
            <ResponsiveTable
              data={followups}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/mch/hei/${item.id}`)}
              columns={[
                {
                  key: 'hei_number',
                  header: 'HEI Number',
                  cell: (item) => (
                    <span className="font-medium">{item.hei_number}</span>
                  ),
                },
                {
                  key: 'infant_name',
                  header: 'Infant',
                  cell: (item) => (
                    <div>
                      <span>{item.infant_name}</span>
                      <span className="text-muted-foreground text-xs ml-1">
                        {item.infant_mrn}
                      </span>
                    </div>
                  ),
                },
                {
                  key: 'enrollment_date',
                  header: 'Enrolled',
                  cell: (item) => formatDate(item.enrollment_date),
                  hideOnMobile: true,
                },
                {
                  key: 'mother_art',
                  header: 'Mother ART',
                  cell: (item) => item.mother_art_status.replace(/_/g, ' '),
                  hideOnMobile: true,
                },
                {
                  key: 'feeding',
                  header: 'Feeding',
                  cell: (item) => item.breastfeeding_status?.replace(/_/g, ' ') || 'N/A',
                  hideOnMobile: true,
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (item) => (
                    <Badge className={`${statusColors[item.status]} shrink-0 w-fit`}>
                      {item.status.replace(/_/g, ' ')}
                    </Badge>
                  ),
                },
              ]}
              mobileCard={(item) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">{item.hei_number}</span>
                      </div>
                      <p className="text-sm mt-1 truncate">{item.infant_name}</p>
                      <p className="text-xs text-muted-foreground">{item.infant_mrn}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enrolled {formatDate(item.enrollment_date)}
                      </p>
                    </div>
                    <Badge className={`${statusColors[item.status]} shrink-0 w-fit self-start`}>
                      {item.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </Card>
              )}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
