'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, BedDouble, Building2, Calendar, Hash, User, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { useAdmissionRecommendations, useAdmissions } from '@/lib/hooks/use-inpatient';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { formatDate } from '@/lib/utils/format';
import type { Admission } from '@/lib/types/inpatient';

export default function AdmissionsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  const debouncedSearch = useDebounce(search, 300);

  const {
    data: recommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
  } = useAdmissionRecommendations({ status: 'PENDING', ordering: '-created_at' });

  const {
    data: admissions,
    isLoading: admissionsLoading,
    error: admissionsError,
  } = useAdmissions({ 
    admission_status: statusFilter || undefined, 
    ordering: '-admission_date',
    search: debouncedSearch || undefined,
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Admissions"
        description="Manage inpatient admissions and bed assignments"
        actions={
          <Button asChild>
            <Link href="/admissions/new">
              <Plus className="h-4 w-4 mr-2" />
              New Admission
            </Link>
          </Button>
        }
      />

      {/* Pending Recommendations Alert */}
      {!recommendationsLoading && !recommendationsError && (recommendations?.results?.length ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              Pending Admission Recommendations
              <Badge variant="secondary" className="ml-2">
                {recommendations?.results?.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recommendations?.results.slice(0, 3).map((rec) => (
              <div key={rec.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{rec.reason}</p>
                  <p className="text-sm text-muted-foreground">
                    {rec.provisional_diagnosis_text}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recommended by {rec.recommended_by_username}
                  </p>
                </div>
              </div>
            ))}
            {(recommendations?.results?.length ?? 0) > 3 && (
              <Button variant="link" asChild className="px-0">
                <Link href="/admissions/recommendations">
                  View all {recommendations?.results?.length} recommendations →
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name, admission number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Search admissions"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" aria-label="Status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="DISCHARGED">Discharged</SelectItem>
                <SelectItem value="TRANSFERRED_OUT">Transferred</SelectItem>
                <SelectItem value="DECEASED">Deceased</SelectItem>
              </SelectContent>
            </Select>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </CardContent>
      </Card>

      {/* Admissions List/Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BedDouble className="h-5 w-5" />
            Admissions
            {admissions?.count !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {admissions.count}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {admissionsLoading ? (
            viewMode === 'list' ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <EntityGrid>
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-lg" />
                ))}
              </EntityGrid>
            )
          ) : admissionsError ? (
            <div className="text-center py-8 text-destructive">
              Failed to load admissions. Please try again.
            </div>
          ) : viewMode === 'list' ? (
            <AdmissionsTableView admissions={admissions?.results || []} />
          ) : (
            <AdmissionsGridView admissions={admissions?.results || []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Admissions Table View Component
 */
function AdmissionsTableView({ admissions }: { admissions: Admission[] }) {
  if (admissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No admissions found.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Admission #</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Ward / Bed</TableHead>
          <TableHead>Admitted</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {admissions.map((adm) => (
          <TableRow key={adm.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell>
              <code className="text-sm">{adm.admission_number}</code>
            </TableCell>
            <TableCell>
              <p className="font-medium">{adm.patient_name}</p>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span>{adm.ward_name}</span>
                <span className="text-muted-foreground">—</span>
                <BedDouble className="h-3 w-3 text-muted-foreground" />
                <span>{adm.bed_number}</span>
              </div>
            </TableCell>
            <TableCell>
              {formatDate(adm.admission_date)}
            </TableCell>
            <TableCell>
              <Badge variant={getStatusVariant(adm.admission_status)}>
                {adm.admission_status_display || adm.admission_status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/admissions/${adm.id}`}>
                  View
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Admissions Grid View Component
 */
function AdmissionsGridView({ admissions }: { admissions: Admission[] }) {
  if (admissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No admissions found.
      </div>
    );
  }

  return (
    <EntityGrid>
      {admissions.map((adm) => (
        <EntityCard
          key={adm.id}
          title={adm.patient_name || 'Unknown Patient'}
          subtitle={adm.admission_number}
          initials={getInitials(adm.patient_name)}
          href={`/admissions/${adm.id}`}
          status={{
            label: adm.admission_status_display || adm.admission_status,
            variant: getStatusVariant(adm.admission_status),
          }}
          badges={adm.payer_type ? [{ 
            label: adm.payer_type_display || adm.payer_type, 
            variant: 'outline' 
          }] : []}
          metadata={[
            {
              icon: <Hash className="h-3 w-3" />,
              label: 'Admission',
              value: adm.admission_number,
            },
            {
              icon: <Building2 className="h-3 w-3" />,
              label: 'Ward',
              value: adm.ward_name || 'Unassigned',
            },
            {
              icon: <BedDouble className="h-3 w-3" />,
              label: 'Bed',
              value: adm.bed_number || 'Unassigned',
            },
            {
              icon: <Calendar className="h-3 w-3" />,
              label: 'Admitted',
              value: formatDate(adm.admission_date),
            },
            ...(adm.attending_doctor_username ? [{
              icon: <User className="h-3 w-3" />,
              label: 'Doctor',
              value: adm.attending_doctor_username,
            }] : []),
          ]}
          actions={[
            { label: 'View Details', href: `/admissions/${adm.id}` },
            { label: 'Ward Round', href: `/admissions/${adm.id}/ward-round/new` },
            { label: 'Discharge', href: `/admissions/${adm.id}/discharge` },
          ]}
        />
      ))}
    </EntityGrid>
  );
}

/**
 * Get initials from patient name
 */
function getInitials(name?: string): string {
  if (!name) return '??';
  const parts = name.split(' ');
  const first = parts[0]?.charAt(0) || '';
  const last = parts[parts.length - 1]?.charAt(0) || '';
  return (first + last).toUpperCase() || '??';
}

/**
 * Get badge variant based on admission status
 */
function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVE':
      return 'default';
    case 'DISCHARGED':
      return 'secondary';
    case 'TRANSFERRED_OUT':
      return 'outline';
    case 'DECEASED':
    case 'ABSCONDED':
      return 'destructive';
    default:
      return 'secondary';
  }
}
