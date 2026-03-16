'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Building2,
  Bed,
  Users,
  AlertCircle,
  Plus,
  Search,
  Filter
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import {
  useInpatientWards,
  useAdmissions,
  useWardBeds
} from '@/lib/hooks/use-inpatient';

export default function WardsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWard, setSelectedWard] = useState<string>('all');

  const { data: wards, isLoading: wardsLoading } = useInpatientWards();
  const { data: admissions, isLoading: admissionsLoading } = useAdmissions({
    admission_status: 'ACTIVE',
    page_size: 100
  });

  const wardsList = useMemo(() => {
    return ((wards as any)?.results ?? wards ?? []);
  }, [wards]);

  const filteredWards = useMemo(() => {
    if (!searchQuery && selectedWard === 'all') return wardsList;

    return wardsList.filter((ward: any) => {
      const matchesSearch = !searchQuery ||
        ward.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = selectedWard === 'all' || ward.id === Number(selectedWard);
      return matchesSearch && matchesFilter;
    });
  }, [wardsList, searchQuery, selectedWard]);

  const totalBeds = useMemo(() => {
    return wardsList.reduce((sum: number, ward: any) => sum + (ward.total_beds || 0), 0);
  }, [wardsList]);

  const occupiedBeds = useMemo(() => {
    return wardsList.reduce((sum: number, ward: any) => sum + (ward.occupied_beds || 0), 0);
  }, [wardsList]);

  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const isLoading = wardsLoading || admissionsLoading;

  if (isLoading) {
    return <WardsSkeleton />;
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <PageHeader
          title="Wards"
          helpContent="Manage wards, bed occupancy, and inpatient locations. Pull down to refresh on mobile, or use the refresh button in the header."
          actions={
            <div className="flex gap-2 w-full sm:w-auto">
              <PermissionGate action="inpatient.manage_ward">
                <Button variant="outline" asChild className="gap-2 flex-1 sm:flex-none">
                  <Link href="/wards/new">
                    <Plus className="h-4 w-4" />
                    <span className="sm:hidden">Ward</span>
                    <span className="hidden sm:inline">New Ward</span>
                  </Link>
                </Button>
              </PermissionGate>
              <PermissionGate action="inpatient.create_admission">
                <Button asChild className="gap-2 flex-1 sm:flex-none">
                  <Link href="/admissions/new">
                    <Plus className="h-4 w-4" />
                    <span className="sm:hidden">Admit</span>
                    <span className="hidden sm:inline">New Admission</span>
                  </Link>
                </Button>
              </PermissionGate>
            </div>
          }
        />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Wards</p>
                <p className="text-2xl font-bold">{wardsList.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Bed className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Beds</p>
                <p className="text-2xl font-bold">{totalBeds}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Patients</p>
                <p className="text-2xl font-bold">{admissions?.count ?? admissions?.results?.length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Occupancy Rate</p>
                <p className="text-2xl font-bold">{occupancyRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Occupancy Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Hospital Bed Occupancy</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={occupancyRate} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {occupiedBeds} of {totalBeds} beds occupied
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedWard} onValueChange={setSelectedWard}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by ward" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Wards</SelectItem>
            {wardsList.map((ward: any) => (
              <SelectItem key={ward.id} value={String(ward.id)}>
                {ward.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ward Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredWards.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No wards found matching your search.</p>
            </CardContent>
          </Card>
        ) : (
          filteredWards.map((ward: any) => (
            <WardCard key={ward.id} ward={ward} />
          ))
        )}
      </div>
      </div>
    </PullToRefresh>
  );
}

function WardCard({ ward }: { ward: any }) {
  const { data: beds } = useWardBeds(ward.id);

  const totalBeds = ward.total_beds || 0;
  const occupiedBeds = ward.occupied_beds || 0;
  const bedStatusCounts = useMemo(() => {
    const bedsList = (Array.isArray(beds) ? beds : beds?.results ?? []);
    return {
      available: bedsList.filter((b: any) => b.status === 'AVAILABLE').length,
      occupied: bedsList.filter((b: any) => b.status === 'OCCUPIED').length,
      cleaning: bedsList.filter((b: any) => b.status === 'CLEANING').length,
      maintenance: bedsList.filter((b: any) => b.status === 'MAINTENANCE').length,
      reserved: bedsList.filter((b: any) => b.status === 'RESERVED').length,
    };
  }, [beds]);

  const availableBeds = bedStatusCounts.available || ward.available_beds || Math.max(totalBeds - occupiedBeds, 0);
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const occupancyColor = occupancyRate >= 90 ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{ward.name}</CardTitle>
          <Badge
            variant={ward.ward_type === 'ICU' ? 'destructive' : 'outline'}
            className="shrink-0 w-fit self-start sm:self-auto"
          >
            {ward.ward_type_display || ward.ward_type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Occupancy */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Occupancy</span>
            <span className={occupancyColor}>{occupancyRate}%</span>
          </div>
          <Progress value={occupancyRate} className="h-2" />
        </div>

        {/* Bed Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between p-2 rounded bg-muted/50">
            <span>Available</span>
            <Badge variant="secondary" className="shrink-0 w-fit self-start sm:self-auto">
              {bedStatusCounts.available || availableBeds}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-muted/50">
            <span>Occupied</span>
            <Badge variant="secondary" className="shrink-0 w-fit self-start sm:self-auto">
              {bedStatusCounts.occupied || occupiedBeds}
            </Badge>
          </div>
          {bedStatusCounts.maintenance > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-muted/50">
              <span>Maintenance</span>
              <Badge variant="secondary" className="shrink-0 w-fit self-start sm:self-auto">
                {bedStatusCounts.maintenance}
              </Badge>
            </div>
          )}
          {bedStatusCounts.cleaning > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-muted/50">
              <span>Cleaning</span>
              <Badge variant="secondary" className="shrink-0 w-fit self-start sm:self-auto">
                {bedStatusCounts.cleaning}
              </Badge>
            </div>
          )}
          {bedStatusCounts.reserved > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-muted/50">
              <span>Reserved</span>
              <Badge variant="secondary" className="shrink-0 w-fit self-start sm:self-auto">
                {bedStatusCounts.reserved}
              </Badge>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button variant="outline" size="sm" className="w-full sm:flex-1" asChild>
            <Link href={`/wards/${ward.id}`}>
              View Details
            </Link>
          </Button>
          <PermissionGate action="inpatient.create_admission">
            <Button size="sm" className="w-full sm:flex-1" asChild disabled={availableBeds === 0}>
              <Link href={`/admissions/new?ward=${ward.id}`}>
                Admit Patient
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </CardContent>
    </Card>
  );
}

function WardsSkeleton() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
