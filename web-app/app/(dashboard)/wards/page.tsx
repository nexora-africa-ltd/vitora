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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { 
  useInpatientWards, 
  useAdmissions,
  useWardBeds
} from '@/lib/hooks/use-inpatient';

export default function WardsPage() {
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
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Ward Dashboard"
        description="Manage wards, beds, and patient locations"
        actions={
          <Button asChild>
            <Link href="/admissions/new">
              <Plus className="h-4 w-4 mr-2" />
              New Admission
            </Link>
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                <Bed className="h-5 w-5 text-green-600 dark:text-green-400" />
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
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
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
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
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
          <CardDescription>
            {occupiedBeds} of {totalBeds} beds occupied
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={occupancyRate} className="h-3" />
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
          <SelectTrigger className="w-[200px]">
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
  );
}

function WardCard({ ward }: { ward: any }) {
  const { data: beds, isLoading } = useWardBeds(ward.id);
  
  const totalBeds = ward.total_beds || 0;
  const occupiedBeds = ward.occupied_beds || 0;
  const availableBeds = totalBeds - occupiedBeds;
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const occupancyColor = occupancyRate >= 90 
    ? 'text-red-600' 
    : occupancyRate >= 70 
    ? 'text-yellow-600' 
    : 'text-green-600';

  const bedStatusCounts = useMemo(() => {
    const bedsList = (Array.isArray(beds) ? beds : beds?.results ?? []);
    return {
      available: bedsList.filter((b: any) => b.status === 'AVAILABLE').length,
      occupied: bedsList.filter((b: any) => b.status === 'OCCUPIED').length,
      maintenance: bedsList.filter((b: any) => b.status === 'MAINTENANCE').length,
      reserved: bedsList.filter((b: any) => b.status === 'RESERVED').length,
    };
  }, [beds]);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{ward.name}</CardTitle>
          <Badge 
            variant={ward.ward_type === 'ICU' ? 'destructive' : 'outline'}
          >
            {ward.ward_type_display || ward.ward_type}
          </Badge>
        </div>
        <CardDescription>{ward.description || 'No description'}</CardDescription>
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
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              {bedStatusCounts.available || availableBeds}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-muted/50">
            <span>Occupied</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              {bedStatusCounts.occupied || occupiedBeds}
            </Badge>
          </div>
          {bedStatusCounts.maintenance > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-muted/50">
              <span>Maintenance</span>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                {bedStatusCounts.maintenance}
              </Badge>
            </div>
          )}
          {bedStatusCounts.reserved > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-muted/50">
              <span>Reserved</span>
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                {bedStatusCounts.reserved}
              </Badge>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link href={`/wards/${ward.id}`}>
              View Details
            </Link>
          </Button>
          <Button size="sm" className="flex-1" asChild disabled={availableBeds === 0}>
            <Link href={`/admissions/new?ward=${ward.id}`}>
              Admit Patient
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WardsSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
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
