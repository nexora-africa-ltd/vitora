// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Facility-scoped surveillance submission ledger.
 *
 * Use: Open /surveillance/submissions to inspect county email/SMS delivery,
 * drill into the source case, and manually retry failed deliveries.
 * Inputs: Authenticated facility context; optional search, channel, and status filters.
 */

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Mail, MessageSquare, RefreshCw, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { surveillanceApi } from '@/lib/api/surveillance';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { toast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type {
  CountyNotificationDelivery,
  CountyNotificationDeliveryListParams,
  CountyNotificationDeliveryStatus,
} from '@/lib/types/surveillance';

const PAGE_SIZE = 20;

const DELIVERY_STATUS_CONFIG: Record<
  CountyNotificationDeliveryStatus,
  {
    label: string;
    variant: 'secondary' | 'warning' | 'info' | 'success' | 'destructive';
  }
> = {
  PENDING: { label: 'Queued', variant: 'warning' },
  SENT: { label: 'Delivery pending', variant: 'info' },
  DELIVERED: { label: 'Sent & delivered', variant: 'success' },
  BOUNCED: { label: 'Bounced', variant: 'destructive' },
  RETRY_SCHEDULED: { label: 'Retry scheduled', variant: 'warning' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  SUPERSEDED: { label: 'Superseded', variant: 'secondary' },
};

function DeliveryStatusBadge({ delivery }: { delivery: CountyNotificationDelivery }) {
  const config = DELIVERY_STATUS_CONFIG[delivery.status];

  return (
    <Badge variant={config.variant} className="w-fit">
      {config.label}
    </Badge>
  );
}

function DeliveryChannel({ channel }: { channel: CountyNotificationDelivery['channel'] }) {
  const Icon = channel === 'EMAIL' ? Mail : MessageSquare;
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {channel === 'EMAIL' ? 'Email' : 'SMS'}
    </span>
  );
}

export default function SurveillanceSubmissionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<'all' | CountyNotificationDelivery['channel']>('all');
  const [deliveryStatus, setDeliveryStatus] = useState<'all' | CountyNotificationDeliveryStatus>(
    'all'
  );
  const canViewSubmissions = canPerformAction('surveillance.view_submissions');
  const canRetry = canPerformAction('surveillance.retry_submissions');

  const params = useMemo<CountyNotificationDeliveryListParams>(() => {
    const value: CountyNotificationDeliveryListParams = { page, page_size: PAGE_SIZE };
    if (search.trim()) value.search = search.trim();
    if (channel !== 'all') value.channel = channel;
    if (deliveryStatus !== 'all') value.status = deliveryStatus;
    return value;
  }, [channel, deliveryStatus, page, search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['surveillance-delivery-submissions', params],
    queryFn: () => surveillanceApi.listNotificationDeliveries(params),
    enabled: canViewSubmissions,
    staleTime: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: (deliveryId: number) => surveillanceApi.retryNotificationDelivery(deliveryId),
    onSuccess: (delivery) => {
      toast({
        title: 'Delivery retried',
        description: `${delivery.channel === 'EMAIL' ? 'Email' : 'SMS'} delivery is now ${DELIVERY_STATUS_CONFIG[delivery.status].label.toLowerCase()}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['surveillance-delivery-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case-deliveries', delivery.case] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', delivery.case] });
    },
    onError: () => {
      toast({
        title: 'Retry failed',
        description:
          'The delivery could not be retried. Review the delivery error and recipient settings.',
        variant: 'destructive',
      });
    },
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const retryable = (delivery: CountyNotificationDelivery) =>
    delivery.status === 'FAILED' || delivery.status === 'RETRY_SCHEDULED';

  const columns = [
    {
      key: 'case_disease_name',
      header: 'Source report',
      sortable: true,
      cell: (delivery: CountyNotificationDelivery) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{delivery.case_disease_name}</p>
          <p className="text-xs text-muted-foreground">
            Case #{delivery.case} · {delivery.case_patient_mrn}
          </p>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      sortable: true,
      cell: (delivery: CountyNotificationDelivery) => (
        <DeliveryChannel channel={delivery.channel} />
      ),
    },
    {
      key: 'status',
      header: 'Delivery status',
      sortable: true,
      cell: (delivery: CountyNotificationDelivery) => <DeliveryStatusBadge delivery={delivery} />,
    },
    {
      key: 'sent_by_name',
      header: 'Sent by',
      hideOnMobile: true,
      sortable: true,
      cell: (delivery: CountyNotificationDelivery) => delivery.sent_by_name,
    },
    {
      key: 'sent_at',
      header: 'Sent',
      hideOnMobile: true,
      sortable: true,
      sortType: 'date' as const,
      cell: (delivery: CountyNotificationDelivery) =>
        delivery.sent_at ? formatDateTime(delivery.sent_at) : 'Not sent',
    },
    {
      key: 'actions',
      header: '',
      cell: (delivery: CountyNotificationDelivery) =>
        retryable(delivery) ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!canRetry || retryMutation.isPending}
            onClick={(event) => {
              event.stopPropagation();
              retryMutation.mutate(delivery.id);
            }}
          >
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
            Retry
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">View case</span>
        ),
    },
  ];

  if (!canViewSubmissions) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Submissions" />
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Access denied</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to view facility surveillance submissions.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Submissions"
          helpContent="Track facility surveillance notifications sent to county contacts. Open a row to review the source case and delivery history; retry failed or scheduled deliveries after correcting the underlying issue."
        />

        <Card className="space-y-3 p-3 sm:p-4">
          <Input
            value={search}
            placeholder="Search disease, case MRN, or provider message ID..."
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={channel}
              onValueChange={(value) => {
                setChannel(value as typeof channel);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={deliveryStatus}
              onValueChange={(value) => {
                setDeliveryStatus(value as typeof deliveryStatus);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Delivery status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(DELIVERY_STATUS_CONFIG).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {error ? (
          <Card className="p-6 text-center text-destructive">
            <TriangleAlert className="mx-auto size-8" aria-hidden="true" />
            <p className="mt-2 font-medium">Unable to load submissions</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <ResponsiveTable
            data={data?.results ?? []}
            columns={columns}
            keyExtractor={(delivery) => delivery.id}
            onRowClick={(delivery) => router.push(`/surveillance/cases/${delivery.case}`)}
            isLoading={isLoading}
            emptyMessage="No surveillance submissions match these filters."
            mobileCard={(delivery) => (
              <Card className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{delivery.case_disease_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Case #{delivery.case} · {delivery.case_patient_mrn}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <DeliveryChannel channel={delivery.channel} />
                      <span className="text-xs text-muted-foreground">
                        {delivery.sent_at ? formatDateTime(delivery.sent_at) : 'Not sent'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <DeliveryStatusBadge delivery={delivery} />
                    {retryable(delivery) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canRetry || retryMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          retryMutation.mutate(delivery.id);
                        }}
                      >
                        <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.next}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
