'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, BedDouble, Building2, Calendar, Hash, User, ClipboardList, Users, AlertTriangle, Clock, Activity, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
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
import { usePermissions } from '@/lib/hooks/use-permissions';
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

  // Compute stats from loaded data
  const stats = useMemo(() => {
    const activeAdmissions = admissions?.results?.filter((a) => a.admission_status === 'ACTIVE') || [];
    const pendingRecommendations = recommendations?.count || 0;
    const emergencyRecommendations = recommendations?.results?.filter((r) => r.urgency === 'EMERGENCY').length || 0;

    // Calculate average LOS for active admissions
    const totalLos = activeAdmissions.reduce((sum, adm) => {
      if (!adm.admission_date) return sum;
      const admDate = new Date(adm.admission_date);
      const today = new Date();
      const days = Math.ceil((today.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    const avgLos = activeAdmissions.length > 0 ? Math.round(totalLos / activeAdmissions.length) : 0;

    return {
      activeAdmissions: activeAdmissions.length,
      pendingRecommendations,
      emergencyRecommendations,
      avgLos,
    };
  }, [admissions?.results, recommendations?.count, recommendations?.results]);

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

        {/* Stats Section */}
        <div className="grid gap-2 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Admissions"
            value={admissionsLoading ? '-' : stats.activeAdmissions}
            icon={BedDouble}
            variant="default"
            loading={admissionsLoading}
            href="#admissions"
          />
          <StatsCard
            title="Pending Recommendations"
            value={recommendationsLoading ? '-' : stats.pendingRecommendations}
            icon={ClipboardList}
            variant={stats.pendingRecommendations > 0 ? 'warning' : 'default'}
            loading={recommendationsLoading}
            description={stats.emergencyRecommendations > 0 ? `${stats.emergencyRecommendations} emergency` : undefined}
          />
          <StatsCard
            title="Avg. Length of Stay"
            value={admissionsLoading ? '-' : `${stats.avgLos} days`}
            icon={TrendingUp}
            variant="default"
            loading={admissionsLoading}
          />
          <StatsCard
            title="Occupancy"
            value={admissionsLoading ? '-' : stats.activeAdmissions}
            icon={Activity}
            variant="success"
            loading={admissionsLoading}
            description="active patients"
          />
        </div>

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

        {/* Pending Recommendations Section */}
        {(recommendationsLoading || (recommendations?.results?.length ?? 0) > 0 || recommendationsError) && (
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
        )}

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
          sortable: true,
          cell: (adm) => <code className="text-sm">{adm.admission_number}</code>,
        },
        {
          key: 'patient_name',
          header: 'Patient',
          sortable: true,
          cell: (adm) => <span className="font-medium">{adm.patient_name}</span>,
        },
        {
          key: 'ward_bed',
          header: 'Ward / Bed',
          hideOnMobile: true,
          sortable: true,
          sortFn: (a, b) => (a.ward_name || '').localeCompare(b.ward_name || ''),
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
          sortable: true,
          sortType: 'date' as const,
          cell: (adm) => formatDate(adm.admission_date),
        },
        {
          key: 'status',
          header: 'Status',
          sortable: true,
          sortFn: (a, b) => (a.admission_status || '').localeCompare(b.admission_status || ''),
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
  const { canPerformAction } = usePermissions();

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
            ...(canPerformAction('inpatient.make_rounds') ? [{ label: 'Ward Round', href: `/admissions/${adm.id}/ward-round/new` }] : []),
            ...(canPerformAction('inpatient.discharge') ? [{ label: 'Discharge', href: `/admissions/${adm.id}/discharge` }] : []),
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
          key: 'patient',
          header: 'Patient',
          sortable: true,
          sortFn: (a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''),
          cell: (rec) => (
            <div className="min-w-0">
              <p className="font-medium truncate">{rec.patient_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{rec.patient_mrn}</p>
            </div>
          ),
        },
        {
          key: 'reason',
          header: 'Reason',
          hideOnMobile: true,
          sortable: true,
          cell: (rec) => <span className="text-sm truncate max-w-[200px]">{rec.reason}</span>,
        },
        {
          key: 'diagnosis',
          header: 'Diagnosis',
          hideOnMobile: true,
          sortable: true,
          sortFn: (a, b) => (a.provisional_diagnosis_text || '').localeCompare(b.provisional_diagnosis_text || ''),
          cell: (rec) => (
            <span className="text-sm text-muted-foreground truncate max-w-[200px]">
              {rec.provisional_diagnosis_text}
            </span>
          ),
        },
        {
          key: 'urgency',
          header: 'Urgency',
          sortable: true,
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
          sortable: true,
          sortFn: (a, b) => (a.preferred_ward_type || '').localeCompare(b.preferred_ward_type || ''),
          cell: (rec) => (
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{rec.preferred_ward_type}</span>
            </div>
          ),
        },
      ]}
      mobileCard={(rec) => (
        <Card className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{rec.patient_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground truncate">{rec.patient_mrn}</p>
            </div>
            <Badge
              variant={getUrgencyVariant(rec.urgency)}
              className="shrink-0 w-fit"
            >
              {rec.urgency === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
              {rec.urgency}
            </Badge>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p className="truncate">{rec.reason}</p>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span>{rec.preferred_ward_type}</span>
            <span>•</span>
            <span className="truncate">{rec.provisional_diagnosis_text}</span>
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
          title={rec.patient_name || 'Unknown Patient'}
          subtitle={rec.patient_mrn}
          initials={getInitials(rec.patient_name)}
          href={`/admissions/recommendations/${rec.id}`}
          status={{
            label: rec.urgency,
            variant: getUrgencyVariant(rec.urgency),
          }}
          badges={[{
            label: rec.preferred_ward_type,
            variant: 'outline'
          }]}
          metadata={[
            {
              icon: <ClipboardList className="h-3 w-3" />,
              label: 'Reason',
              value: rec.reason,
            },
            {
              icon: <Building2 className="h-3 w-3" />,
              label: 'Diagnosis',
              value: rec.provisional_diagnosis_text || rec.provisional_diagnosis,
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
