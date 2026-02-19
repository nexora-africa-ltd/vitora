'use client';

import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  Calendar,
  Hash,
  Stethoscope,
  FileText,
  Loader2,
} from 'lucide-react';
import { Patient } from '@/lib/types/patient';
import { calculateAge, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/shared/empty-state';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import type { ViewMode } from '@/components/ui/view-toggle';
import { useQuickConsultation } from '@/lib/hooks/use-encounters';
import { useToast } from '@/lib/hooks/use-toast';

interface PatientTableProps {
  patients: Patient[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  selectMode?: boolean;
  onSelect?: (patientId: number) => void;
  viewMode?: ViewMode;
}

const genderLabels: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
};

const genderColors: Record<string, string> = {
  M: 'bg-blue-100 text-blue-800',
  F: 'bg-pink-100 text-pink-800',
  O: 'bg-purple-100 text-purple-800',
};

export function PatientTable({
  patients,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  selectMode = false,
  onSelect,
  viewMode = 'list',
}: PatientTableProps) {
  const router = useRouter();

  const handleRowClick = (patientId: number) => {
    if (selectMode && onSelect) {
      onSelect(patientId);
    } else {
      router.push(`/patients/${patientId}`);
    }
  };

  if (error) {
    return (
      <EmptyState
        title="Error loading patients"
        description={error.message}
        action={{
          label: 'Try again',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (!isLoading && patients.length === 0) {
    return (
      <EmptyState
        title="No patients found"
        description="Try adjusting your search or filters, or register a new patient."
        action={{
          label: 'Register Patient',
          onClick: () => router.push('/patients/new'),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Loading state */}
      {isLoading ? (
        viewMode === 'list' ? (
          <div className="space-y-3">
            {/* Desktop skeleton table */}
            <div className="hidden md:block animate-pulse">
              <div className="rounded-md border">
                <div className="h-12 border-b bg-muted/30" />
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 border-b flex items-center px-4 gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                ))}
              </div>
            </div>
            {/* Mobile skeleton cards */}
            <div className="md:hidden space-y-3">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-8 w-8" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <EntityGrid>
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-lg" />
            ))}
          </EntityGrid>
        )
      ) : viewMode === 'list' ? (
        <PatientListView
          patients={patients}
          selectMode={selectMode}
          onRowClick={handleRowClick}
          router={router}
        />
      ) : (
        <PatientGridView
          patients={patients}
          selectMode={selectMode}
          onSelect={onSelect}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="hidden sm:inline">Page </span>{page}<span className="hidden sm:inline"> of {totalPages}</span><span className="sm:hidden">/{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Patient List View Component (Table)
 */
interface PatientListViewProps {
  patients: Patient[];
  selectMode: boolean;
  onRowClick: (patientId: number) => void;
  router: ReturnType<typeof useRouter>;
}

function PatientListView({ patients, selectMode, onRowClick, router }: PatientListViewProps) {
  const { toast } = useToast();
  const quickConsult = useQuickConsultation();

  const handleStartConsultation = async (e: React.MouseEvent, patientId: number) => {
    e.stopPropagation();
    try {
      const encounter = await quickConsult.mutateAsync({ patientId });
      toast({
        title: 'Consultation Started',
        description: 'Patient has been called. You can now start the consultation.',
      });
      router.push(`/encounters/${encounter.id}`);
    } catch (err) {
      // Handle 409 Conflict - patient already has active encounter with another clinician
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const data = err.response.data;
        toast({
          title: 'Patient Unavailable',
          description: data.detail || 'This patient already has an active encounter with another clinician.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to start consultation. Please try again.',
          variant: 'destructive',
        });
      }
    }
  };

  const renderMobileCard = (patient: Patient) => (
    <Card className="p-4 hover:bg-muted/50 transition-colors">
      <div className="space-y-3">
        {/* Header: Name + Sensitive badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">
              {patient.first_name} {patient.last_name}
            </p>
            <p className="text-sm text-muted-foreground font-mono">
              {patient.mrn}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {patient.is_sensitive && (
              <Badge variant="destructive" className="text-xs shrink-0 w-fit">
                Sensitive
              </Badge>
            )}
            {!selectMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/patients/${patient.id}`);
                  }}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/patients/${patient.id}/edit`);
                  }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => handleStartConsultation(e, patient.id)}
                    disabled={quickConsult.isPending}
                  >
                    {quickConsult.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Stethoscope className="h-4 w-4 mr-2" />
                    )}
                    Start Consultation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/encounters/new?patient=${patient.id}`);
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    New Encounter
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{calculateAge(patient.date_of_birth)} yrs</span>
          <Badge className={`shrink-0 w-fit ${genderColors[patient.gender]}`}>
            {genderLabels[patient.gender]}
          </Badge>
          {patient.phone_number && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {patient.phone_number}
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <ResponsiveTable
      data={patients}
      keyExtractor={(patient) => patient.id}
      onRowClick={(patient) => onRowClick(patient.id)}
      emptyMessage="No patients found"
      mobileCard={renderMobileCard}
      columns={[
        {
          key: 'mrn',
          header: 'MRN',
          cell: (patient) => (
            <span className="font-mono text-sm">{patient.mrn}</span>
          ),
        },
        {
          key: 'name',
          header: 'Name',
          cell: (patient) => (
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {patient.first_name} {patient.last_name}
              </span>
              {patient.is_sensitive && (
                <Badge variant="destructive" className="text-xs">
                  Sensitive
                </Badge>
              )}
            </div>
          ),
        },
        {
          key: 'age_gender',
          header: 'Age/Gender',
          hideOnMobile: true,
          cell: (patient) => (
            <div className="flex items-center gap-2">
              <span>{calculateAge(patient.date_of_birth)} yrs</span>
              <Badge className={genderColors[patient.gender]}>
                {genderLabels[patient.gender]}
              </Badge>
            </div>
          ),
        },
        {
          key: 'phone_number',
          header: 'Phone',
          hideOnMobile: true,
          cell: (patient) => patient.phone_number || '—',
        },
        {
          key: 'county_name',
          header: 'County',
          hideOnMobile: true,
          cell: (patient) => patient.county_name || '—',
        },
        {
          key: 'created_at',
          header: 'Registered',
          hideOnMobile: true,
          cell: (patient) => formatDate(patient.created_at),
        },
        {
          key: 'actions',
          header: '',
          className: 'w-[50px]',
          cell: (patient) => (
            !selectMode ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/patients/${patient.id}`);
                  }}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/patients/${patient.id}/edit`);
                  }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => handleStartConsultation(e, patient.id)}
                    disabled={quickConsult.isPending}
                  >
                    {quickConsult.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Stethoscope className="h-4 w-4 mr-2" />
                    )}
                    Start Consultation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/encounters/new?patient=${patient.id}`);
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    New Encounter
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null
          ),
        },
      ]}
    />
  );
}

/**
 * Patient Grid View Component (Cards)
 */
interface PatientGridViewProps {
  patients: Patient[];
  selectMode: boolean;
  onSelect?: (patientId: number) => void;
}

function PatientGridView({ patients, selectMode, onSelect }: PatientGridViewProps) {
  return (
    <EntityGrid>
      {patients.map((patient) => (
        <EntityCard
          key={patient.id}
          title={`${patient.first_name} ${patient.last_name}`}
          subtitle={patient.mrn}
          initials={getInitials(patient.first_name, patient.last_name)}
          gender={patient.gender}
          href={selectMode ? undefined : `/patients/${patient.id}`}
          onClick={selectMode && onSelect ? () => onSelect(patient.id) : undefined}
          status={patient.is_sensitive ? {
            label: 'Sensitive',
            variant: 'destructive',
          } : undefined}
          badges={[{
            label: `${calculateAge(patient.date_of_birth)} yrs, ${genderLabels[patient.gender]}`,
            variant: 'secondary',
          }]}
          metadata={[
            {
              icon: <Hash className="h-3 w-3" />,
              label: 'MRN',
              value: patient.mrn,
            },
            ...(patient.phone_number ? [{
              icon: <Phone className="h-3 w-3" />,
              label: 'Phone',
              value: patient.phone_number,
            }] : []),
            ...(patient.county_name ? [{
              icon: <MapPin className="h-3 w-3" />,
              label: 'County',
              value: patient.county_name,
            }] : []),
            {
              icon: <Calendar className="h-3 w-3" />,
              label: 'Registered',
              value: formatDate(patient.created_at),
            },
          ]}
          actions={selectMode ? [] : [
            { label: 'View Details', href: `/patients/${patient.id}` },
            { label: 'Edit', href: `/patients/${patient.id}/edit` },
            { label: 'New Encounter', href: `/encounters/new?patient=${patient.id}` },
          ]}
        />
      ))}
    </EntityGrid>
  );
}

/**
 * Get initials from first and last name
 */
function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.charAt(0) || '';
  const last = lastName?.charAt(0) || '';
  return (first + last).toUpperCase() || '??';
}
