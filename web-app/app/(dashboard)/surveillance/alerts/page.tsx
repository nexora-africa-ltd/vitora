'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Siren, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { surveillanceApi, type AlertListParams } from '@/lib/api/surveillance';
import { formatDateTime } from '@/lib/utils/format';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { toast } from '@/lib/hooks/use-toast';
import type { SurveillanceAlertListItem } from '@/lib/types/surveillance';

const ALERT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; variant: 'destructive' | 'warning' | 'info' | 'secondary' }
> = {
  NEW_CASE: { label: 'New Case', icon: Bell, variant: 'info' },
  OVERDUE: { label: 'Overdue', icon: Clock, variant: 'warning' },
  OUTBREAK: { label: 'Outbreak', icon: Siren, variant: 'destructive' },
  CASE_UPDATE: { label: 'Update', icon: TrendingUp, variant: 'secondary' },
};

function AlertCard({
  alert,
  onAcknowledge,
  acknowledging,
}: {
  alert: SurveillanceAlertListItem;
  onAcknowledge: (id: number) => void;
  acknowledging: boolean;
}) {
  const config = ALERT_TYPE_CONFIG[alert.alert_type] ?? {
    label: 'New Case',
    icon: Bell,
    variant: 'info' as const,
  };
  const Icon = config.icon;

  return (
    <Card className={alert.is_acknowledged ? 'opacity-60' : ''}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3 min-w-0 flex-1">
          <div
            className={`shrink-0 rounded-full p-2 ${
              config.variant === 'destructive'
                ? 'bg-destructive/10'
                : config.variant === 'warning'
                  ? 'bg-yellow-500/10'
                  : 'bg-muted'
            }`}
          >
            <Icon
              className={`h-4 w-4 ${
                config.variant === 'destructive'
                  ? 'text-destructive'
                  : config.variant === 'warning'
                    ? 'text-yellow-600'
                    : 'text-muted-foreground'
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={config.variant} className="w-fit">
                {config.label}
              </Badge>
              <span className="text-sm font-medium">{alert.case_disease_name}</span>
              {alert.is_acknowledged && (
                <Badge variant="outline" className="w-fit">
                  <Check className="mr-1 h-3 w-3" />
                  Acknowledged
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{alert.message}</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>MRN: {alert.case_patient_mrn}</span>
              <span>{formatDateTime(alert.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 self-start sm:self-center">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/surveillance/cases/${alert.case}`}>View Case</Link>
          </Button>
          {!alert.is_acknowledged && (
            <Button
              size="sm"
              onClick={() => onAcknowledge(alert.id)}
              disabled={acknowledging}
            >
              <Check className="mr-1 h-4 w-4" />
              Acknowledge
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SurveillanceAlertsPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [tab, setTab] = useState<'all' | 'unacknowledged'>('unacknowledged');
  const [page, setPage] = useState(1);

  const params: AlertListParams = {
    page,
    page_size: 20,
    ...(tab === 'unacknowledged' ? { is_acknowledged: false } : {}),
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['surveillance-alerts', params],
    queryFn: () => surveillanceApi.listAlerts(params),
    staleTime: 30000,
  });

  const { mutateAsync: acknowledgeAlert, isPending: acknowledging } = useMutation({
    mutationFn: (id: number) => surveillanceApi.acknowledgeAlert(id),
    onSuccess: () => {
      toast({ title: 'Alert acknowledged' });
      queryClient.invalidateQueries({ queryKey: ['surveillance-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['surveillance-alerts-unacknowledged'] });
    },
    onError: () => {
      toast({ title: 'Failed to acknowledge alert', variant: 'destructive' });
    },
  });

  const handleTabChange = (value: string) => {
    setTab(value as 'all' | 'unacknowledged');
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.count / 20) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Surveillance Alerts"
          helpContent="View and acknowledge surveillance alerts for immediate cases, overdue notifications, and outbreak events."
        />

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="unacknowledged" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="sm:hidden">Pending</span>
              <span className="hidden sm:inline">Unacknowledged</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <Bell className="h-4 w-4" />
              <span>All</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {error ? (
              <Card className="p-6 text-center text-destructive">
                <p>Failed to load alerts</p>
                <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                  Try Again
                </Button>
              </Card>
            ) : isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : data?.results?.length === 0 ? (
              <Card className="p-6 text-center">
                <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 font-medium">No alerts</p>
                <p className="text-sm text-muted-foreground">
                  {tab === 'unacknowledged'
                    ? 'All alerts have been acknowledged'
                    : 'No surveillance alerts found'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {data?.results?.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={acknowledgeAlert}
                    acknowledging={acknowledging}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
