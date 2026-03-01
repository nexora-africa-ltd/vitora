/**
 * Clinic Type Page Component
 *
 * Reusable page that displays clinics filtered by type.
 * Used by General OPD, MCH, Eye, Dental, Chronic Care pages.
 */
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Building2,
  Activity,
  Clock,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useClinics } from '@/lib/hooks/use-clinics';
import type { ClinicType } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface ClinicTypePageProps {
  title: string;
  description: string;
  clinicTypes: ClinicType[];
  icon?: React.ReactNode;
}

export function ClinicTypePage({
  title,
  description,
  clinicTypes,
  icon,
}: ClinicTypePageProps) {
  const { data, isLoading, refetch } = useClinics({ status: 'ACTIVE' });
  const { refresh, isRefreshing } = usePageRefresh();

  // Filter clinics by type
  const clinics = useMemo(() => {
    if (!data?.results) return [];
    return data.results.filter((clinic) =>
      clinicTypes.includes(clinic.clinic_type)
    );
  }, [data?.results, clinicTypes]);

  const openClinicsCount = clinics.filter((c) => c.is_open_today).length;
  const scheduledCount = clinics.filter((c) => c.is_scheduled_today && !c.is_open_today).length;

  /** Return badge variant + label for a clinic's operational state. */
  const getClinicStatus = (clinic: (typeof clinics)[number]) => {
    if (clinic.is_open_today) {
      return { label: 'Open', variant: 'default' as const, className: 'bg-green-500 hover:bg-green-600' };
    }
    if (clinic.is_scheduled_today) {
      return { label: 'Scheduled', variant: 'outline' as const, className: 'border-amber-500 text-amber-600' };
    }
    return { label: 'Closed', variant: 'secondary' as const, className: '' };
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={title}
        helpContent={description}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clinics</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clinics.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Now</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{openClinicsCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{scheduledCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting session start</p>
          </CardContent>
        </Card>
      </div>

      {/* Clinics Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : clinics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No clinics found</h3>
            <p className="text-muted-foreground text-center mb-4">
              No {title.toLowerCase()} clinics have been set up yet.
            </p>
            <Button asChild>
              <Link href="/clinics">View All Clinics</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clinics.map((clinic) => {
            const status = getClinicStatus(clinic);
            return (
            <Link key={clinic.id} href={`/clinics/${clinic.id}`}>
              <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{clinic.name}</CardTitle>
                      <CardDescription>{clinic.clinic_type_display}</CardDescription>
                    </div>
                    <Badge
                      variant={status.variant}
                      className={cn(status.className)}
                    >
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span>{clinic.location || 'No location set'}</span>
                    </div>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                  <Badge variant="outline" className="mt-2">
                    {clinic.code}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
            );
          })}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
