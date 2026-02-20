'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, BedDouble, Building2, Calendar, Hash, User, ClipboardList, Users, AlertTriangle, Clock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { useAdmissionRecommendations, useAdmissions } from '@/lib/hooks/use-inpatient';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { Admission, AdmissionRecommendation, AdmissionRecommendationUrgency } from '@/lib/types/inpatient';

export default function AdmissionsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [recommendationsViewMode, setRecommendationsViewMode] = useState<ViewMode>('list');

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
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Admissions"
          helpContent="Manage inpatient admissions and bed assignments."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/admissions/bulk-assign">
                  <Users className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Bulk Assign</span>
                  <span className="sm:hidden">Bulk</span>
                </Link>
              </Button>
              <Button asChild>
                <Link href="/admissions/new">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">New Admission</span>
                  <span className="sm:hidden">New</span>
                </Link>
              </Button>
            </>
          }
        />

        {/* Pending Recommendations Section */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Pending Recommendations
                {recommendations?.count !== undefined && (
                  <Badge variant="warning" className="ml-2 shrink-0 w-fit self-start sm:self-auto">
                    {recommendations.count}
                  </Badge>
                )}
              </CardTitle>
              <ViewToggle value={recommendationsViewMode} onChange={setRecommendationsViewMode} />
            </div>
          </CardHeader>
          <CardContent>
            {recommendationsLoading ? (
              recommendationsViewMode === 'list' ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <EntityGrid>
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-40 w-full rounded-lg" />
                  ))}
                </EntityGrid>
              )
            ) : recommendationsError ? (
              <div className="text-center py-8 text-destructive">
                Failed to load recommendations. Please try again.
              </div>
            ) : recommendationsViewMode === 'list' ? (
              <RecommendationsTableView
                recommendations={recommendations?.results || []}
                onSelect={(id) => router.push(`/admissions/recommendations/${id}`)}
              />
            ) : (
              <RecommendationsGridView recommendations={recommendations?.results || []} />
            )}
          </CardContent>
        </Card>

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
                <Badge variant="secondary" className="ml-2 shrink-0 w-fit self-start sm:self-auto">
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
            <AdmissionsTableView
              admissions={admissions?.results || []}
              onSelect={(id) => router.push(`/admissions/${id}`)}
            />
          ) : (
            <AdmissionsGridView admissions={admissions?.results || []} />
          )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

/**
 * Admissions Table View Component
 */
function AdmissionsTableView({
  admissions,
  onSelect,
}: {
  admissions: Admission[];
  onSelect: (id: number) => void;
}) {
  if (admissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No admissions found.
      </div>
    );
  }

  return (
    <ResponsiveTable
      data={admissions}
      keyExtractor={(adm) => adm.id}
      onRowClick={(adm) => onSelect(adm.id)}
      columns={[
        {
          key: 'admission_number',
          header: 'Admission #',
          cell: (adm) => <code className="text-sm">{adm.admission_number}</code>,
        },
        {
          key: 'patient_name',
          header: 'Patient',
          cell: (adm) => <span className="font-medium">{adm.patient_name}</span>,
        },
        {
          key: 'ward_bed',
          header: 'Ward / Bed',
          hideOnMobile: true,
          cell: (adm) => (
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span>{adm.ward_name}</span>
              <span className="text-muted-foreground">—</span>
              <BedDouble className="h-3 w-3 text-muted-foreground" />
              <span>{adm.bed_number}</span>
            </div>
          ),
        },
        {
          key: 'admission_date',
          header: 'Admitted',
          hideOnMobile: true,
          cell: (adm) => formatDate(adm.admission_date),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (adm) => (
            <Badge
              variant={getStatusVariant(adm.admission_status)}
              className="shrink-0 w-fit self-start sm:self-auto"
            >
              {adm.admission_status_display || adm.admission_status}
            </Badge>
          ),
        },
      ]}
      mobileCard={(adm) => (
        <Card className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{adm.patient_name}</p>
              <p className="text-xs text-muted-foreground truncate">{adm.admission_number}</p>
            </div>
            <Badge
              variant={getStatusVariant(adm.admission_status)}
              className="shrink-0 w-fit self-start sm:self-auto"
            >
              {adm.admission_status_display || adm.admission_status}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span className="truncate">{adm.ward_name}</span>
            <span>•</span>
            <BedDouble className="h-3 w-3" />
            <span className="truncate">{adm.bed_number}</span>
          </div>
        </Card>
      )}
    />
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

/**
 * Get badge variant based on recommendation urgency
 */
function getUrgencyVariant(urgency: AdmissionRecommendationUrgency): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (urgency) {
    case 'EMERGENCY':
      return 'destructive';
    case 'URGENT':
      return 'default';
    case 'ROUTINE':
      return 'secondary';
    default:
      return 'secondary';
  }
}

/**
 * Recommendations Table View Component
 */
function RecommendationsTableView({
  recommendations,
  onSelect,
}: {
  recommendations: AdmissionRecommendation[];
  onSelect: (id: number) => void;
}) {
  if (recommendations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No pending recommendations.
      </div>
    );
  }

  return (
    <ResponsiveTable
      data={recommendations}
      keyExtractor={(rec) => rec.id}
      onRowClick={(rec) => onSelect(rec.id)}
      columns={[
        {
          key: 'reason',
          header: 'Reason',
          cell: (rec) => <span className="font-medium truncate max-w-[200px]">{rec.reason}</span>,
        },
        {
          key: 'diagnosis',
          header: 'Diagnosis',
          hideOnMobile: true,
          cell: (rec) => (
            <span className="text-sm text-muted-foreground truncate max-w-[200px]">
              {rec.provisional_diagnosis_text}
            </span>
          ),
        },
        {
          key: 'urgency',
          header: 'Urgency',
          cell: (rec) => (
            <Badge
              variant={getUrgencyVariant(rec.urgency)}
              className="shrink-0 w-fit"
            >
              {rec.urgency === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
              {rec.urgency}
            </Badge>
          ),
        },
        {
          key: 'ward_type',
          header: 'Ward Type',
          hideOnMobile: true,
          cell: (rec) => (
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{rec.preferred_ward_type}</span>
            </div>
          ),
        },
        {
          key: 'recommended_by',
          header: 'Recommended By',
          hideOnMobile: true,
          cell: (rec) => (
            <span className="text-sm text-muted-foreground">{rec.recommended_by_username}</span>
          ),
        },
      ]}
      mobileCard={(rec) => (
        <Card className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{rec.reason}</p>
              <p className="text-xs text-muted-foreground truncate">{rec.provisional_diagnosis_text}</p>
            </div>
            <Badge
              variant={getUrgencyVariant(rec.urgency)}
              className="shrink-0 w-fit"
            >
              {rec.urgency === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
              {rec.urgency}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span>{rec.preferred_ward_type}</span>
            <span>•</span>
            <User className="h-3 w-3" />
            <span className="truncate">{rec.recommended_by_username}</span>
          </div>
        </Card>
      )}
    />
  );
}

/**
 * Recommendations Grid View Component
 */
function RecommendationsGridView({ recommendations }: { recommendations: AdmissionRecommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No pending recommendations.
      </div>
    );
  }

  return (
    <EntityGrid>
      {recommendations.map((rec) => (
        <EntityCard
          key={rec.id}
          title={rec.reason}
          subtitle={rec.provisional_diagnosis_text}
          initials={rec.preferred_ward_type.substring(0, 2)}
          href={`/admissions/recommendations/${rec.id}`}
          status={{
            label: rec.urgency,
            variant: getUrgencyVariant(rec.urgency),
          }}
          badges={[{
            label: rec.status,
            variant: 'outline'
          }]}
          metadata={[
            {
              icon: <ClipboardList className="h-3 w-3" />,
              label: 'Diagnosis',
              value: rec.provisional_diagnosis || rec.provisional_diagnosis_text,
            },
            {
              icon: <Building2 className="h-3 w-3" />,
              label: 'Ward Type',
              value: rec.preferred_ward_type,
            },
            {
              icon: <User className="h-3 w-3" />,
              label: 'By',
              value: rec.recommended_by_username || 'Unknown',
            },
            {
              icon: <Clock className="h-3 w-3" />,
              label: 'Expires',
              value: formatDate(rec.expires_at),
            },
          ]}
          actions={[
            { label: 'Review', href: `/admissions/recommendations/${rec.id}` },
            { label: 'Accept & Admit', href: `/admissions/new?recommendation=${rec.id}` },
          ]}
        />
      ))}
    </EntityGrid>
  );
}
