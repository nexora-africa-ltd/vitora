'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Stethoscope, Clock, User, AlertTriangle, Activity } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWardRounds } from '@/lib/hooks/use-inpatient';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate, formatTime } from '@/lib/utils/format';
import type { WardRound, ConditionStatus, ReviewType } from '@/lib/types/inpatient';

const conditionColors: Record<ConditionStatus, string> = {
  STABLE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  IMPROVING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  DETERIORATING: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const reviewTypeLabels: Record<ReviewType, string> = {
  WARD_ROUND: 'Ward Round',
  URGENT_REVIEW: 'Urgent Review',
  CONSULTANT_REVIEW: 'Consultant Review',
  TRANSFER_REVIEW: 'Transfer Review',
  PRE_DISCHARGE: 'Pre-Discharge',
};

export default function WardRoundsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const {
    data: roundsData,
    isLoading,
    error,
  } = useWardRounds({
    condition_status: conditionFilter !== 'all' ? (conditionFilter as ConditionStatus) : undefined,
    review_type: typeFilter !== 'all' ? (typeFilter as ReviewType) : undefined,
    ordering: '-round_date,-round_time',
  });

  // Compute stats
  const stats = useMemo(() => {
    const results = roundsData?.results || [];
    const today = new Date().toISOString().split('T')[0];
    const todayRounds = results.filter((r) => r.round_date === today).length;
    const criticalPatients = results.filter((r) => r.condition_status === 'CRITICAL').length;
    const deteriorating = results.filter((r) => r.condition_status === 'DETERIORATING').length;
    const consultantRequired = results.filter((r) => r.requires_consultant_review).length;
    return {
      total: roundsData?.count || 0,
      todayRounds,
      criticalPatients,
      deteriorating,
      consultantRequired,
    };
  }, [roundsData]);

  const handleRowClick = (round: WardRound) => {
    router.push(`/admissions/${round.admission}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Ward Rounds"
          helpContent="View all ward round documentation. Track patient conditions, review SOAP notes, and monitor patients requiring consultant review."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Today's Rounds"
            value={stats.todayRounds}
            icon={Stethoscope}
          />
          <StatsCard
            title="Critical Patients"
            value={stats.criticalPatients}
            icon={AlertTriangle}
            variant={stats.criticalPatients > 0 ? 'destructive' : 'default'}
          />
          <StatsCard
            title="Deteriorating"
            value={stats.deteriorating}
            icon={Activity}
            variant={stats.deteriorating > 0 ? 'warning' : 'default'}
          />
          <StatsCard
            title="Consultant Required"
            value={stats.consultantRequired}
            icon={User}
            variant={stats.consultantRequired > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={conditionFilter} onValueChange={setConditionFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="DETERIORATING">Deteriorating</SelectItem>
                  <SelectItem value="STABLE">Stable</SelectItem>
                  <SelectItem value="IMPROVING">Improving</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Review Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="WARD_ROUND">Ward Round</SelectItem>
                  <SelectItem value="URGENT_REVIEW">Urgent Review</SelectItem>
                  <SelectItem value="CONSULTANT_REVIEW">Consultant Review</SelectItem>
                  <SelectItem value="TRANSFER_REVIEW">Transfer Review</SelectItem>
                  <SelectItem value="PRE_DISCHARGE">Pre-Discharge</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Rounds List */}
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Failed to load ward rounds.</p>
            </CardContent>
          </Card>
        ) : (
          <ResponsiveTable
            data={roundsData?.results || []}
            keyExtractor={(round) => round.id}
            onRowClick={handleRowClick}
            columns={[
              {
                key: 'patient',
                header: 'Patient',
                cell: (round) => (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{round.patient_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{round.admission_number}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'datetime',
                header: 'Date/Time',
                cell: (round) => (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {formatDate(round.round_date)} {formatTime(round.round_time)}
                    </span>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                cell: (round) => (
                  <span className="text-sm">
                    {round.review_type_display || reviewTypeLabels[round.review_type] || round.review_type}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'condition',
                header: 'Condition',
                cell: (round) => (
                  <Badge className={conditionColors[round.condition_status]}>
                    {round.condition_status_display || round.condition_status}
                  </Badge>
                ),
              },
              {
                key: 'conductor',
                header: 'Conducted By',
                cell: (round) => (
                  <span className="text-sm text-muted-foreground">
                    {round.conducted_by_name || round.conducted_by_username || '-'}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'consultant',
                header: 'Consultant',
                cell: (round) =>
                  round.requires_consultant_review ? (
                    <Badge variant="outline">
                      {round.consultant_specialty || 'Required'}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  ),
                hideOnMobile: true,
              },
            ]}
            mobileCard={(round) => (
              <Card className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{round.patient_name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground">{round.admission_number}</p>
                  </div>
                  <Badge className={conditionColors[round.condition_status]}>
                    {round.condition_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Clock className="h-4 w-4" />
                  <span>{formatDate(round.round_date)} {formatTime(round.round_time)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">
                    {round.review_type_display || reviewTypeLabels[round.review_type]}
                  </span>
                  {round.requires_consultant_review && (
                    <Badge variant="outline" className="text-xs">
                      Consultant: {round.consultant_specialty || 'Required'}
                    </Badge>
                  )}
                </div>
              </Card>
            )}
            emptyMessage="No ward rounds found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}
