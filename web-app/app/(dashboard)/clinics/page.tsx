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
import {
  Plus,
  Search,
  Filter,
  Building2,
  Clock,
  Users,
  Activity,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import type { ClinicListParams, ClinicStatus, ClinicType } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

const CLINIC_TYPE_OPTIONS: { value: ClinicType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'GENERAL_OPD', label: 'General OPD' },
  { value: 'ANC', label: 'Antenatal Clinic' },
  { value: 'PNC', label: 'Postnatal Clinic' },
  { value: 'CWC', label: 'Child Welfare Clinic' },
  { value: 'IMMUNIZATION', label: 'Immunization' },
  { value: 'FP', label: 'Family Planning' },
  { value: 'EYE', label: 'Eye Clinic' },
  { value: 'DENTAL', label: 'Dental Clinic' },
  { value: 'CCC', label: 'CCC (HIV)' },
  { value: 'TB', label: 'TB Clinic' },
  { value: 'DIABETIC', label: 'Diabetic Clinic' },
  { value: 'HYPERTENSION', label: 'Hypertension Clinic' },
  { value: 'MENTAL_HEALTH', label: 'Mental Health' },
  { value: 'SURGICAL', label: 'Surgical Clinic' },
];

const STATUS_OPTIONS: { value: ClinicStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TEMPORARILY_CLOSED', label: 'Temporarily Closed' },
];

export default function ClinicsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [clinicType, setClinicType] = useState<ClinicType | 'ALL'>('ALL');
  const [status, setStatus] = useState<ClinicStatus | 'ALL'>('ALL');

  const params = useMemo<ClinicListParams>(() => {
    const p: ClinicListParams = {};
    if (search) p.search = search;
    if (clinicType !== 'ALL') p.clinic_type = clinicType;
    if (status !== 'ALL') p.status = status;
    return p;
  }, [search, clinicType, status]);

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

  const openClinicsCount = useMemo(
    () => clinics.filter((c) => c.is_open_today).length,
    [clinics]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinics"
        description="Manage and monitor all clinic operations"
        actions={
          <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/clinics/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Clinic
              </Link>
            </Button>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clinics</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">Registered clinics</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Today</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{openClinicsCount}</div>
            <p className="text-xs text-muted-foreground">Currently operating</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clinic Types</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(clinicsByType).length}</div>
            <p className="text-xs text-muted-foreground">Different categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link href="/clinics/enrollments">View Enrollments</Link>
            </Button>
            <br />
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link href="/clinics/enrollments/overdue">Overdue Patients</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter Clinics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search clinics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={clinicType} onValueChange={(v) => setClinicType(v as ClinicType | 'ALL')}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Clinic Type" />
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
              <SelectTrigger className="w-full md:w-[180px]">
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
        </CardContent>
      </Card>

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
              {search || clinicType !== 'ALL' || status !== 'ALL'
                ? 'Try adjusting your filters'
                : 'Get started by adding your first clinic'}
            </p>
            <Button asChild>
              <Link href="/clinics/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Clinic
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clinics.map((clinic) => (
            <Link key={clinic.id} href={`/clinics/${clinic.id}`}>
              <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{clinic.name}</CardTitle>
                      <CardDescription>{clinic.clinic_type_display}</CardDescription>
                    </div>
                    <Badge
                      variant={clinic.is_open_today ? 'default' : 'secondary'}
                      className={cn(
                        clinic.is_open_today && 'bg-green-500 hover:bg-green-600'
                      )}
                    >
                      {clinic.is_open_today ? 'Open' : 'Closed'}
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
          ))}
        </div>
      )}
    </div>
  );
}
