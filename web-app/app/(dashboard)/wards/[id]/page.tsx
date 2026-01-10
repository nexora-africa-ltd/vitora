'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Bed, 
  Building2, 
  Plus, 
  User,
  Settings,
  AlertCircle
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useInpatientWard,
  useWardBeds,
  useAdmissions
} from '@/lib/hooks/use-inpatient';

const BED_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 border-green-300 text-green-800',
  OCCUPIED: 'bg-blue-100 border-blue-300 text-blue-800',
  MAINTENANCE: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  RESERVED: 'bg-purple-100 border-purple-300 text-purple-800',
};

export default function WardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const wardId = Number(params.id);

  const { data: ward, isLoading: wardLoading } = useInpatientWard(wardId);
  const { data: beds, isLoading: bedsLoading } = useWardBeds(wardId);
  const { data: admissions, isLoading: admissionsLoading } = useAdmissions({ 
    ward: wardId,
    admission_status: 'ACTIVE',
    page_size: 100 
  });

  const isLoading = wardLoading || bedsLoading || admissionsLoading;

  const bedsList = useMemo(() => {
    return (Array.isArray(beds) ? beds : beds?.results ?? []);
  }, [beds]);

  const admissionsList = useMemo(() => {
    return admissions?.results ?? [];
  }, [admissions]);

  const stats = useMemo(() => {
    const available = bedsList.filter((b: any) => b.status === 'AVAILABLE').length;
    const occupied = bedsList.filter((b: any) => b.status === 'OCCUPIED').length;
    const maintenance = bedsList.filter((b: any) => b.status === 'MAINTENANCE').length;
    const reserved = bedsList.filter((b: any) => b.status === 'RESERVED').length;
    const total = bedsList.length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { available, occupied, maintenance, reserved, total, occupancyRate };
  }, [bedsList]);

  if (isLoading) {
    return <WardDetailSkeleton />;
  }

  if (!ward) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Ward not found</h2>
        <p className="text-muted-foreground mt-2">
          The ward you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button onClick={() => router.push('/wards')} className="mt-4">
          Back to Wards
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href="/wards" className="text-sm text-muted-foreground hover:text-primary">
          Back to Wards
        </Link>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <h1 className="text-2xl font-bold">{ward.name}</h1>
            <Badge variant={ward.ward_type === 'ICU' ? 'destructive' : 'outline'}>
              {ward.ward_type_display || ward.ward_type}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {ward.description || 'No description available'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Manage Ward
          </Button>
          <Button size="sm" asChild disabled={stats.available === 0}>
            <Link href={`/admissions/new?ward=${wardId}`}>
              <Plus className="h-4 w-4 mr-2" />
              Admit Patient
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Beds</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Available</p>
            <p className="text-2xl font-bold text-green-600">{stats.available}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Occupied</p>
            <p className="text-2xl font-bold text-blue-600">{stats.occupied}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Maintenance</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.maintenance}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Occupancy</p>
            <p className="text-2xl font-bold">{stats.occupancyRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Occupancy Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Bed Occupancy</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={stats.occupancyRate} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {stats.occupied} of {stats.total} beds occupied
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="beds" className="space-y-4">
        <TabsList>
          <TabsTrigger value="beds">Bed Layout</TabsTrigger>
          <TabsTrigger value="patients">Current Patients ({admissionsList.length})</TabsTrigger>
        </TabsList>

        {/* Bed Layout Tab */}
        <TabsContent value="beds" className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
              <span className="text-sm">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300" />
              <span className="text-sm">Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300" />
              <span className="text-sm">Maintenance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-100 border border-purple-300" />
              <span className="text-sm">Reserved</span>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {bedsList.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center">
                  <Bed className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No beds configured for this ward.</p>
                </CardContent>
              </Card>
            ) : (
              bedsList.map((bed: any) => (
                <BedCard key={bed.id} bed={bed} />
              ))
            )}
          </div>
        </TabsContent>

        {/* Patients Tab */}
        <TabsContent value="patients" className="space-y-4">
          {admissionsList.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No patients currently admitted to this ward.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {admissionsList.map((admission: any) => (
                <Card key={admission.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-full bg-muted">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{admission.patient_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Bed {admission.bed_number} • {admission.admitting_diagnosis_text || admission.admitting_diagnosis}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          Day {Math.ceil(
                            (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
                          )}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/admissions/${admission.id}`}>
                            View
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BedCard({ bed }: { bed: any }) {
  const statusClass = BED_STATUS_COLORS[bed.status] || BED_STATUS_COLORS.AVAILABLE;
  
  return (
    <Card className={`${statusClass} border`}>
      <CardContent className="p-3 text-center">
        <Bed className="h-6 w-6 mx-auto mb-1" />
        <p className="font-medium">{bed.bed_number}</p>
        <p className="text-xs">{bed.status_display || bed.status}</p>
        {bed.current_patient_name && (
          <p className="text-xs mt-1 truncate" title={bed.current_patient_name}>
            {bed.current_patient_name}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WardDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {[...Array(12)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
