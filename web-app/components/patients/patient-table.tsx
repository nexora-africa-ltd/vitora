'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, ChevronLeft, ChevronRight, Phone, MapPin, Calendar, Hash } from 'lucide-react';
import { Patient } from '@/lib/types/patient';
import { calculateAge, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/shared/empty-state';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import type { ViewMode } from '@/components/ui/view-toggle';

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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MRN</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Age/Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
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
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>MRN</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Age/Gender</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>County</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patients.map((patient) => (
            <TableRow
              key={patient.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(patient.id)}
              data-testid={`patient-row-${patient.id}`}
            >
              <TableCell className="font-mono text-sm">
                {patient.mrn}
              </TableCell>
              <TableCell>
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
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{calculateAge(patient.date_of_birth)} yrs</span>
                  <Badge className={genderColors[patient.gender]}>
                    {genderLabels[patient.gender]}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>{patient.phone_number || '—'}</TableCell>
              <TableCell>{patient.county_name || '—'}</TableCell>
              <TableCell>{formatDate(patient.created_at)}</TableCell>
              <TableCell>
                {!selectMode && (
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
