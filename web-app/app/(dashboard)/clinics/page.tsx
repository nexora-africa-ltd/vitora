/**
 * Clinics Module - Overview Page
 *
 * Displays all clinics with filtering and search capabilities.
 * Admin view for managing and monitoring all clinic operations.
 *
 * Route: /clinics
 */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Filter, Building2, Clock, Activity, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClinics } from '@/lib/hooks/use-clinics';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { SeedClinicsDialog } from '@/components/clinics/seed-clinics-dialog';
import type { ClinicListParams, ClinicStatus, ClinicType } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

const CLINIC_TYPE_OPTIONS: { value: ClinicType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Types' },
  // Primary Care
  { value: 'GENERAL_OPD', label: 'General OPD' },
  { value: 'FILTER_CLINIC', label: 'Filter/Screening Clinic' },
  // Maternal & Child Health
  { value: 'ANC', label: 'Antenatal Clinic' },
  { value: 'PNC', label: 'Postnatal Clinic' },
  { value: 'FP', label: 'Family Planning' },
  { value: 'CWC', label: 'Child Welfare Clinic' },
  { value: 'IMMUNIZATION', label: 'Immunization' },
  { value: 'NUTRITION', label: 'Nutrition Clinic' },
  // Specialized Clinics
  { value: 'DENTAL', label: 'Dental Clinic' },
  { value: 'EYE', label: 'Eye Clinic' },
  { value: 'ENT', label: 'ENT Clinic' },
  { value: 'SURGICAL', label: 'Surgical Clinic' },
  { value: 'ORTHO', label: 'Orthopedic Clinic' },
  { value: 'DERM', label: 'Dermatology Clinic' },
  // Allied Health
  { value: 'PHYSIO', label: 'Physiotherapy' },
  { value: 'OT', label: 'Occupational Therapy' },
  { value: 'SOCIAL_WORK', label: 'Social Work' },
  { value: 'COUNSELLING', label: 'Counselling' },
  // Chronic Care
  { value: 'CCC', label: 'CCC (HIV)' },
  { value: 'TB', label: 'TB Clinic' },
  { value: 'DIABETIC', label: 'Diabetic Clinic' },
  { value: 'HYPERTENSION', label: 'Hypertension Clinic' },
  { value: 'MENTAL_HEALTH', label: 'Mental Health' },
  { value: 'ONCOLOGY', label: 'Oncology Clinic' },
  { value: 'DIALYSIS', label: 'Dialysis Unit' },
  // Other
  { value: 'PROCEDURE', label: 'Procedure Room' },
  { value: 'DRESSING', label: 'Dressing/Wound Care' },
  { value: 'INJECTION', label: 'Injection Room' },
  { value: 'OTHER', label: 'Other Clinic' },
];

const STATUS_OPTIONS: { value: ClinicStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TEMPORARILY_CLOSED', label: 'Temporarily Closed' },
];

export default function ClinicsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { hasPermission } = usePermissions();
  const canCreateClinic = hasPermission('clinics.add_clinic');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [clinicType, setClinicType] = useState<ClinicType | 'ALL'>('ALL');
  const [status, setStatus] = useState<ClinicStatus | 'ALL'>('ALL');

  const params = useMemo<ClinicListParams>(() => {
    const p: ClinicListParams = {
      page_size: 100, // Fetch all clinics (facilities typically have <50)
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (clinicType !== 'ALL') p.clinic_type = clinicType;
    if (status !== 'ALL') p.status = status;
    return p;
  }, [debouncedSearch, clinicType, status]);

  const { data, isLoading, refetch } = useClinics(params);

  const clinics = useMemo(() => data?.results ?? [], [data?.results]);
  const totalCount = data?.count ?? 0;

  // Group clinics by type for summary
  const clinicsByType = useMemo(() => {
    const grouped: Record<string, number> = {};
    clinics.forEach((clinic) => {
      grouped[clinic.clinic_type_display] = (grouped[clinic.clinic_type_display] || 0) + 1;
    });
    return grouped;
  }, [clinics]);

  const openClinicsCount = useMemo(() => clinics.filter((c) => c.is_open_today).length, [clinics]);

  const scheduledCount = useMemo(
    () => clinics.filter((c) => c.is_scheduled_today && !c.is_open_today).length,
    [clinics]
  );

  /** Return badge variant + label for a clinic's operational state. */
  const getClinicStatus = (clinic: (typeof clinics)[number]) => {
    if (clinic.is_open_today) {
      return {
        label: 'Open',
        variant: 'default' as const,
        className: 'bg-green-500 hover:bg-green-600',
      };
    }
    if (clinic.is_scheduled_today) {
      return {
        label: 'Scheduled',
        variant: 'outline' as const,
        className: 'border-amber-500 text-amber-600',
      };
    }
    return { label: 'Closed', variant: 'secondary' as const, className: '' };
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Clinics"
          helpContent="Manage and monitor all clinic operations. View open/closed status, filter by type, and access individual clinic dashboards."
          actions={
            canCreateClinic ? (
              <Button asChild size="sm">
                <Link href="/clinics/new">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Clinic</span>
                </Link>
              </Button>
            ) : undefined
          }
        />

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Total Clinics</CardTitle>
              <Building2 className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-xl font-bold sm:text-2xl">{totalCount}</div>
              <p className="hidden text-xs text-muted-foreground sm:block">Registered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Open Now</CardTitle>
              <Activity className="hidden h-4 w-4 text-green-500 sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-xl font-bold text-green-600 sm:text-2xl">{openClinicsCount}</div>
              <p className="hidden text-xs text-muted-foreground sm:block">Session started</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Types</CardTitle>
              <Filter className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-xl font-bold sm:text-2xl">
                {Object.keys(clinicsByType).length}
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Categories</p>
            </CardContent>
          </Card>

          <Card className="col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs font-medium sm:text-sm">Quick Actions</CardTitle>
              <Clock className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </CardHeader>
            <CardContent className="flex flex-row gap-2 p-3 pt-0 sm:flex-col sm:gap-1 sm:p-6 sm:pt-0">
              <Button variant="link" size="sm" className="h-auto p-0 text-xs sm:text-sm" asChild>
                <Link href="/clinics/enrollments">Enrollments</Link>
              </Button>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs sm:text-sm" asChild>
                <Link href="/clinics/enrollments/overdue">Overdue</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="p-3 pb-2 sm:p-6 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Filter Clinics</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6">
            <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search clinics..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
                <Select
                  value={clinicType}
                  onValueChange={(v) => setClinicType(v as ClinicType | 'ALL')}
                >
                  <SelectTrigger className="w-full sm:w-[180px] lg:w-[200px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLINIC_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setStatus(v as ClinicStatus | 'ALL')}>
                  <SelectTrigger className="w-full sm:w-[150px] lg:w-[180px]">
                    <SelectValue placeholder="Status" />
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
            </div>
          </CardContent>
        </Card>

        {/* Clinics Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="p-3 sm:p-6">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6">
                  <Skeleton className="mb-2 h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : clinics.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
              <Building2 className="mb-4 h-10 w-10 text-muted-foreground sm:h-12 sm:w-12" />
              <h3 className="mb-2 text-base font-semibold sm:text-lg">No clinics found</h3>
              <p className="mb-4 px-4 text-center text-sm text-muted-foreground">
                {search || clinicType !== 'ALL' || status !== 'ALL'
                  ? 'Try adjusting your filters'
                  : 'Get started by adding your first clinic or seeding defaults'}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {!(search || clinicType !== 'ALL' || status !== 'ALL') && <SeedClinicsDialog />}
                <Button asChild size="sm">
                  <Link href="/clinics/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Clinic
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {clinics.map((clinic) => {
              const clinicStatus = getClinicStatus(clinic);
              return (
                <Link key={clinic.id} href={`/clinics/${clinic.id}`}>
                  <Card className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]">
                    <CardHeader className="p-3 pb-2 sm:p-6">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
                          <CardTitle className="truncate text-base sm:text-lg">
                            {clinic.name}
                          </CardTitle>
                          <CardDescription className="truncate text-xs sm:text-sm">
                            {clinic.clinic_type_display}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={clinicStatus.variant}
                          className={cn('w-fit shrink-0 text-xs', clinicStatus.className)}
                        >
                          {clinicStatus.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 sm:p-6">
                      <div className="flex items-center justify-between text-xs text-muted-foreground sm:text-sm">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{clinic.location || 'No location'}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </div>
                      <Badge variant="outline" className="mt-2 text-xs">
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
