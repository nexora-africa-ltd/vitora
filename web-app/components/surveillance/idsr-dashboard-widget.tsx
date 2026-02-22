'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDate } from '@/lib/utils/format';
import { IDSRStatusBadge } from './idsr-status-badge';

export function IDSRDashboardWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['idsr-dashboard'],
    queryFn: () => surveillanceApi.getIDSRDashboard(),
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">IDSR Weekly Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-24" />
        </CardContent>
      </Card>
    );
  }

  const currentWeek = data?.current_week;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-base sm:text-lg">IDSR Weekly Reports</CardTitle>
        <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto">
          <Link href="/surveillance/idsr">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">This Week</p>
            <p className="text-2xl font-semibold">
              {currentWeek?.total_cases ?? 0}
            </p>
          </div>
          {currentWeek?.status ? (
            <IDSRStatusBadge status={currentWeek.status} />
          ) : (
            <Badge variant="secondary">No Report</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {currentWeek
            ? `${formatDate(currentWeek.week_start)} - ${formatDate(currentWeek.week_end)}`
            : 'Week dates unavailable'}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Pending Submission</span>
          <span className="font-medium">{data?.pending_submission ?? 0}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Outbreak Weeks</span>
          <span className="font-medium">{data?.outbreak_weeks ?? 0}</span>
        </div>
        {!currentWeek?.has_report && (
          <Button size="sm" asChild className="w-full">
            <Link href="/surveillance/idsr">Generate This Week</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
