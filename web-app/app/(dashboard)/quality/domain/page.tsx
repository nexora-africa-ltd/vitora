'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { qualityApi } from '@/lib/api/quality';
import { ChevronRight, BarChart3 } from 'lucide-react';
import { CircularProgress } from '@/components/ui/circular-progress';
import type { QualityDomainSummary } from '@/lib/types/quality';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function QualityDomainIndexPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [year, setYear] = useState<number>(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ['quality-dashboard', year],
    queryFn: () => qualityApi.getDashboard({ year }),
    staleTime: 60_000,
  });

  const domains = data?.domain_summary ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quality Domains" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Quality Domains"
          helpContent="Browse quality measure domains. Each domain groups related clinical quality measures. Click a domain to see its measures and performance."
          actions={
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {domains.length === 0 ? (
          <Card className="p-6">
            <div className="flex flex-col items-center text-center gap-2">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No domain results available for {year}. Run evaluations to generate performance data.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {domains.map((domain) => (
              <DomainCard
                key={domain.domain}
                domain={domain}
                onClick={() => router.push(`/quality/domain/${domain.domain.toLowerCase()}`)}
              />
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

function DomainCard({ domain, onClick }: { domain: QualityDomainSummary; onClick?: () => void }) {
  const complianceColor =
    domain.compliance_rate >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : domain.compliance_rate >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-destructive';

  const strokeClass =
    domain.compliance_rate >= 80
      ? 'stroke-emerald-500'
      : domain.compliance_rate >= 50
        ? 'stroke-amber-500'
        : 'stroke-destructive';

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium truncate text-primary hover:underline">
            {domain.domain_display}
          </h3>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <div className="flex items-center gap-4">
          <CircularProgress
            value={domain.compliance_rate}
            size={56}
            strokeWidth={5}
            indicatorClassName={strokeClass}
          >
            <span className="text-xs font-bold">{domain.compliance_rate.toFixed(0)}%</span>
          </CircularProgress>
          <div className="flex-1 min-w-0">
            <p className={`text-lg font-bold ${complianceColor}`}>
              {domain.compliance_rate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {domain.meeting_target}/{domain.total_results} meeting target
            </p>
            <Badge
              variant={domain.compliance_rate >= 80 ? 'default' : 'secondary'}
              className="mt-1"
            >
              {domain.total_measures} measures
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
