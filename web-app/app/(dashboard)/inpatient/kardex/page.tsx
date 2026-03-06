'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Building2, BedDouble, AlertTriangle, User, Activity } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useKardexList } from '@/lib/hooks/use-inpatient';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { NursingKardex, RiskLevel } from '@/lib/types/inpatient';

const riskColors: Record<RiskLevel, string> = {
  LOW: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  MODERATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function KardexListPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [riskFilter, setRiskFilter] = useState<string>('all');

  const {
    data: kardexData,
    isLoading,
    error,
  } = useKardexList({
    fall_risk: riskFilter !== 'all' ? (riskFilter as RiskLevel) : undefined,
  });

  // Compute stats
  const stats = useMemo(() => {
    const results = kardexData?.results || [];
    const highRiskFall = results.filter((k) => k.fall_risk === 'HIGH').length;
    const highRiskPressure = results.filter((k) => k.pressure_sore_risk === 'HIGH').length;
    const isolationRequired = results.filter((k) => k.isolation_required).length;
    return {
      total: kardexData?.count || 0,
      highRiskFall,
      highRiskPressure,
      isolationRequired,
    };
  }, [kardexData]);

  const handleRowClick = (kardex: NursingKardex) => {
    router.push(`/admissions/${kardex.admission}/kardex`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Nursing Kardex"
          helpContent="View and manage nursing kardex records for all admitted patients. Monitor fall risks, pressure sore risks, and isolation requirements."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Active Kardex"
            value={stats.total}
            icon={ClipboardList}
          />
          <StatsCard
            title="High Fall Risk"
            value={stats.highRiskFall}
            icon={AlertTriangle}
            variant={stats.highRiskFall > 0 ? 'warning' : 'default'}
          />
          <StatsCard
            title="High Pressure Risk"
            value={stats.highRiskPressure}
            icon={Activity}
            variant={stats.highRiskPressure > 0 ? 'warning' : 'default'}
          />
          <StatsCard
            title="In Isolation"
            value={stats.isolationRequired}
            icon={BedDouble}
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Fall Risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="HIGH">High Risk</SelectItem>
                  <SelectItem value="MODERATE">Moderate Risk</SelectItem>
                  <SelectItem value="LOW">Low Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Kardex List */}
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
              <p className="text-destructive">Failed to load nursing kardex records.</p>
            </CardContent>
          </Card>
        ) : (
          <ResponsiveTable
            data={kardexData?.results || []}
            keyExtractor={(kardex) => kardex.id}
            onRowClick={handleRowClick}
            columns={[
              {
                key: 'patient',
                header: 'Patient',
                cell: (kardex) => (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{kardex.patient_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{kardex.admission_number}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'location',
                header: 'Location',
                cell: (kardex) => (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{kardex.ward_name} - {kardex.bed_number}</span>
                  </div>
                ),
                hideOnMobile: true,
              },
              {
                key: 'fall_risk',
                header: 'Fall Risk',
                cell: (kardex) => (
                  <Badge className={riskColors[kardex.fall_risk]}>
                    {kardex.fall_risk_display || kardex.fall_risk}
                  </Badge>
                ),
              },
              {
                key: 'pressure_risk',
                header: 'Pressure Risk',
                cell: (kardex) => (
                  <Badge className={riskColors[kardex.pressure_sore_risk]}>
                    {kardex.pressure_sore_risk_display || kardex.pressure_sore_risk}
                  </Badge>
                ),
                hideOnMobile: true,
              },
              {
                key: 'isolation',
                header: 'Isolation',
                cell: (kardex) =>
                  kardex.isolation_required ? (
                    <Badge variant="destructive">{kardex.isolation_type || 'Yes'}</Badge>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  ),
                hideOnMobile: true,
              },
            ]}
            mobileCard={(kardex) => (
              <Card className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{kardex.patient_name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground">{kardex.admission_number}</p>
                  </div>
                  {kardex.isolation_required && (
                    <Badge variant="destructive">Isolated</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Building2 className="h-4 w-4" />
                  <span>{kardex.ward_name} - {kardex.bed_number}</span>
                </div>
                <div className="flex gap-2">
                  <Badge className={riskColors[kardex.fall_risk]}>
                    Fall: {kardex.fall_risk}
                  </Badge>
                  <Badge className={riskColors[kardex.pressure_sore_risk]}>
                    Pressure: {kardex.pressure_sore_risk}
                  </Badge>
                </div>
              </Card>
            )}
            emptyMessage="No nursing kardex records found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}
