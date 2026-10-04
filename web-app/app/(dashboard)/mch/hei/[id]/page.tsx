// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * HEI follow-up detail page for infant HIV exposure monitoring.
 * Route: /mch/hei/[id]. Inputs: Next.js route parameter id and tenant-scoped HEI API data.
 */

'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Baby, ExternalLink, ShieldCheck, TestTube2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { heiFollowUpApi } from '@/lib/api/mch';
import { formatDate } from '@/lib/utils/format';
import type { HEIStatus, PCRResult } from '@/lib/types/mch';

const statusColors: Record<HEIStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  CONFIRMED_NEGATIVE: 'bg-blue-100 text-blue-800',
  CONFIRMED_POSITIVE: 'bg-red-100 text-red-800',
  LOST_TO_FOLLOW_UP: 'bg-orange-100 text-orange-800',
  TRANSFERRED: 'bg-yellow-100 text-yellow-800',
  DECEASED: 'bg-gray-100 text-gray-800',
};

const pcrResultColors: Record<PCRResult, string> = {
  POSITIVE: 'bg-red-100 text-red-800',
  NEGATIVE: 'bg-green-100 text-green-800',
  INDETERMINATE: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-muted text-muted-foreground',
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || 'Not recorded'}</span>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function HEIDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { refresh, isRefreshing } = usePageRefresh();
  const heiId = Number(id);
  const { data: followUp, isLoading, error } = useQuery({
    queryKey: ['hei-followup', heiId],
    queryFn: () => heiFollowUpApi.get(heiId),
    enabled: Number.isInteger(heiId) && heiId > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  if (error || !followUp) {
    return (
      <div className="space-y-4">
        <PageHeader title="HEI Follow-up Not Found" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {error
              ? 'This HEI follow-up is unavailable or is outside your facility.'
              : 'HEI follow-up record not found.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={`HEI Follow-up ${followUp.hei_number}`}
          helpContent="Monitor the infant's HIV exposure follow-up, prophylaxis, feeding status, and scheduled PCR tests."
          actions={
            followUp.mch_registration ? (
              <Link
                href={`/mch/${followUp.mch_registration}?tab=hei`}
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                MCH Record
              </Link>
            ) : null
          }
        />

        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{followUp.infant_name}</p>
            <p className="text-xs text-muted-foreground">{followUp.infant_mrn}</p>
          </div>
          <Badge className={`${statusColors[followUp.status]} w-fit shrink-0`}>
            {followUp.status.replace(/_/g, ' ')}
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Baby className="h-4 w-4" />
                Infant And Mother
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Infant" value={followUp.infant_name} />
              <DetailRow label="Mother" value={followUp.mother_name} />
              <DetailRow label="Enrolled" value={formatDate(followUp.enrollment_date)} />
              <DetailRow label="Mother on ART" value={followUp.mother_art_status.replace(/_/g, ' ')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Prophylaxis And Feeding
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Infant ARV" value={followUp.infant_arv_prophylaxis.replace(/_/g, ' ')} />
              <DetailRow label="ARV start" value={followUp.arv_start_date && formatDate(followUp.arv_start_date)} />
              <DetailRow label="Feeding" value={followUp.breastfeeding_status.replace(/_/g, ' ')} />
              <DetailRow
                label="Cotrimoxazole"
                value={followUp.cotrimoxazole_prophylaxis ? 'Receiving' : 'Not recorded'}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TestTube2 className="h-4 w-4" />
              PCR Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {followUp.pcr_tests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No PCR tests have been recorded.</p>
            ) : (
              followUp.pcr_tests.map((test) => (
                <div
                  key={test.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">PCR Test {test.test_number}</p>
                    <p className="text-xs text-muted-foreground">
                      Scheduled {formatDate(test.scheduled_date)}
                      {test.actual_date ? ` · Collected ${formatDate(test.actual_date)}` : ''}
                    </p>
                  </div>
                  <Badge className={`${pcrResultColors[test.result]} w-fit shrink-0`}>
                    {test.result}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {followUp.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Clinical Notes</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
              {followUp.notes}
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
