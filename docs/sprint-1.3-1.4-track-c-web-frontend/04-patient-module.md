# Sprint 1.3-1.4 Track C: Patient Module

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P0 (Critical Path)
**Estimated Tests**: 35 tests
**Parallel Track**: 🅲 Track C (Days 9-12)

---

## Overview

This document covers the Patient module implementation including list view with search/filters, detail view, patient cards, and data table components.

---

## 1. TypeScript Types

**lib/types/patient.ts**:
```typescript
export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  phone_number: string | null;
  national_id: string | null;
  email: string | null;
  
  // Address
  county: number | null;
  county_name?: string;
  sub_county: number | null;
  sub_county_name?: string;
  ward: number | null;
  ward_name?: string;
  village: string;
  
  // Emergency contact
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  
  // Referral
  referral_source: 'self' | 'clinic' | 'other_facility';
  referred_from_facility: string;
  
  // Consent
  consent_given: boolean;
  consent_date: string | null;
  
  // Sensitive
  is_sensitive: boolean;
  
  // Metadata
  registered_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PatientListParams {
  page?: number;
  page_size?: number;
  search?: string;
  gender?: string;
  county?: number;
  ordering?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface EmergencyContact {
  id: number;
  patient: number;
  name: string;
  phone: string;
  relationship: string;
  is_primary: boolean;
  created_at: string;
}

export type PatientFormData = Omit<Patient, 'id' | 'mrn' | 'created_at' | 'updated_at' | 'registered_by'>;
```

---

## 2. Patient API Client

**lib/api/patients.ts**:
```typescript
import { apiClient } from './client';
import {
  Patient,
  PatientListParams,
  PaginatedResponse,
  PatientFormData,
  EmergencyContact,
} from '@/lib/types/patient';

export const patientsApi = {
  /**
   * Get paginated list of patients.
   */
  async list(params?: PatientListParams): Promise<PaginatedResponse<Patient>> {
    const response = await apiClient.get<PaginatedResponse<Patient>>('/api/patients/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single patient by ID.
   */
  async get(id: number): Promise<Patient> {
    const response = await apiClient.get<Patient>(`/api/patients/${id}/`);
    return response.data;
  },

  /**
   * Create a new patient.
   */
  async create(data: PatientFormData): Promise<Patient> {
    const response = await apiClient.post<Patient>('/api/patients/', data);
    return response.data;
  },

  /**
   * Update a patient.
   */
  async update(id: number, data: Partial<PatientFormData>): Promise<Patient> {
    const response = await apiClient.patch<Patient>(`/api/patients/${id}/`, data);
    return response.data;
  },

  /**
   * Delete a patient.
   */
  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${id}/`);
  },

  /**
   * Search patients by name, MRN, or phone.
   */
  async search(query: string): Promise<PaginatedResponse<Patient>> {
    return this.list({ search: query });
  },

  /**
   * Get emergency contacts for a patient.
   */
  async getEmergencyContacts(patientId: number): Promise<EmergencyContact[]> {
    const response = await apiClient.get<EmergencyContact[]>(
      `/api/patients/${patientId}/emergency-contacts/`
    );
    return response.data;
  },

  /**
   * Get patient's encounters.
   */
  async getEncounters(patientId: number) {
    const response = await apiClient.get(`/api/patients/${patientId}/encounters/`);
    return response.data;
  },
};
```

---

## 3. Patient Hooks

**lib/hooks/use-patients.ts**:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '@/lib/api/patients';
import { PatientListParams, PatientFormData } from '@/lib/types/patient';

/**
 * Hook for fetching paginated patient list.
 */
export function usePatients(params?: PatientListParams) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => patientsApi.list(params),
  });
}

/**
 * Hook for fetching a single patient.
 */
export function usePatient(id: number) {
  return useQuery({
    queryKey: ['patients', id],
    queryFn: () => patientsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook for searching patients with debounce.
 */
export function usePatientSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['patients', 'search', query],
    queryFn: () => patientsApi.search(query),
    enabled: enabled && query.length >= 2,
  });
}

/**
 * Hook for creating a patient.
 */
export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PatientFormData) => patientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * Hook for updating a patient.
 */
export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PatientFormData> }) =>
      patientsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patients', variables.id] });
    },
  });
}

/**
 * Hook for deleting a patient.
 */
export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => patientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * Hook for fetching patient's emergency contacts.
 */
export function usePatientEmergencyContacts(patientId: number) {
  return useQuery({
    queryKey: ['patients', patientId, 'emergency-contacts'],
    queryFn: () => patientsApi.getEmergencyContacts(patientId),
    enabled: !!patientId,
  });
}
```

---

## 4. Patient List Page

**app/(dashboard)/patients/page.tsx**:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PatientTable } from '@/components/patients/patient-table';
import { usePatients } from '@/lib/hooks/use-patients';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { GENDER_OPTIONS } from '@/lib/utils/constants';

export default function PatientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, error } = usePatients({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    gender: gender || undefined,
  });

  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description={`${data?.count ?? 0} patients registered`}
        actions={
          <Button onClick={() => router.push('/patients/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Register Patient
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, MRN, or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={gender}
          onValueChange={(value) => {
            setGender(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            {GENDER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Patient table */}
      <PatientTable
        patients={data?.results ?? []}
        isLoading={isLoading}
        error={error as Error | null}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

---

## 5. Patient Table Component

**components/patients/patient-table.tsx**:
```typescript
'use client';

import { useRouter } from 'next/navigation';
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
import { MoreHorizontal, Eye, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Patient } from '@/lib/types/patient';
import { calculateAge, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/shared/empty-state';

interface PatientTableProps {
  patients: Patient[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const genderLabels: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
};

export function PatientTable({
  patients,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
}: PatientTableProps) {
  const router = useRouter();

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
            {isLoading ? (
              // Loading skeleton
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                </TableRow>
              ))
            ) : (
              patients.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/patients/${patient.id}`)}
                >
                  <TableCell className="font-mono text-sm">{patient.mrn}</TableCell>
                  <TableCell className="font-medium">
                    {patient.first_name} {patient.last_name}
                    {patient.is_sensitive && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Sensitive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {calculateAge(patient.date_of_birth)} yrs / {genderLabels[patient.gender]}
                  </TableCell>
                  <TableCell>{patient.phone_number || '—'}</TableCell>
                  <TableCell>{patient.county_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(patient.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/patients/${patient.id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/patients/${patient.id}/edit`)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
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
```

---

## 6. Patient Detail Page

**app/(dashboard)/patients/[id]/page.tsx**:
```typescript
'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, User, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatient, usePatientEmergencyContacts } from '@/lib/hooks/use-patients';
import { calculateAge, formatDate, formatPhoneNumber } from '@/lib/utils/format';
import { PatientEncounters } from '@/components/patients/patient-encounters';
import { EmergencyContactsList } from '@/components/patients/emergency-contacts-list';

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = Number(params.id);

  const { data: patient, isLoading, error } = usePatient(patientId);
  const { data: emergencyContacts } = usePatientEmergencyContacts(patientId);

  if (isLoading) {
    return <PatientDetailSkeleton />;
  }

  if (error || !patient) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Patient not found</h2>
        <p className="text-muted-foreground mt-2">
          The patient you're looking for doesn't exist or has been removed.
        </p>
        <Button onClick={() => router.push('/patients')} className="mt-4">
          Back to Patients
        </Button>
      </div>
    );
  }

  const genderLabels: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">
                {patient.first_name} {patient.last_name}
              </h1>
              {patient.is_sensitive && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Sensitive
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">MRN: {patient.mrn}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/patients/${patient.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button variant="outline" className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Patient Info Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={User} label="Gender" value={genderLabels[patient.gender]} />
            <InfoRow
              icon={Calendar}
              label="Date of Birth"
              value={`${formatDate(patient.date_of_birth)} (${calculateAge(patient.date_of_birth)} years)`}
            />
            <InfoRow icon={Phone} label="Phone" value={formatPhoneNumber(patient.phone_number || '')} />
            <InfoRow icon={Mail} label="Email" value={patient.email || '—'} />
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={MapPin} label="County" value={patient.county_name || '—'} />
            <InfoRow icon={MapPin} label="Sub-County" value={patient.sub_county_name || '—'} />
            <InfoRow icon={MapPin} label="Ward" value={patient.ward_name || '—'} />
            <InfoRow icon={MapPin} label="Village" value={patient.village || '—'} />
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={User} label="Name" value={patient.emergency_contact_name || '—'} />
            <InfoRow
              icon={Phone}
              label="Phone"
              value={formatPhoneNumber(patient.emergency_contact_phone || '')}
            />
            <InfoRow
              icon={User}
              label="Relationship"
              value={patient.emergency_contact_relationship || '—'}
            />
          </CardContent>
        </Card>
      </div>

      {/* Tabs for encounters and more */}
      <Tabs defaultValue="encounters" className="space-y-4">
        <TabsList>
          <TabsTrigger value="encounters">Encounters</TabsTrigger>
          <TabsTrigger value="emergency-contacts">Emergency Contacts</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="lab-results">Lab Results</TabsTrigger>
        </TabsList>

        <TabsContent value="encounters">
          <PatientEncounters patientId={patientId} />
        </TabsContent>

        <TabsContent value="emergency-contacts">
          <EmergencyContactsList contacts={emergencyContacts || []} />
        </TabsContent>

        <TabsContent value="prescriptions">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Prescriptions will be displayed here
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lab-results">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Lab results will be displayed here
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

function PatientDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Patient Components

**components/patients/patient-card.tsx**:
```typescript
import Link from 'next/link';
import { User, Phone, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Patient } from '@/lib/types/patient';
import { calculateAge } from '@/lib/utils/format';

interface PatientCardProps {
  patient: Patient;
}

export function PatientCard({ patient }: PatientCardProps) {
  const genderLabels: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

  return (
    <Link href={`/patients/${patient.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {patient.first_name[0]}
                {patient.last_name[0]}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">
                  {patient.first_name} {patient.last_name}
                </h3>
                {patient.is_sensitive && (
                  <Badge variant="destructive" className="text-xs">
                    Sensitive
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground font-mono">
                {patient.mrn}
              </p>

              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {calculateAge(patient.date_of_birth)} yrs, {genderLabels[patient.gender]}
                </span>
                {patient.phone_number && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {patient.phone_number}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**components/patients/patient-encounters.tsx**:
```typescript
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '@/lib/api/patients';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { Stethoscope, Calendar, User } from 'lucide-react';

interface PatientEncountersProps {
  patientId: number;
}

export function PatientEncounters({ patientId }: PatientEncountersProps) {
  const { data: encounters, isLoading } = useQuery({
    queryKey: ['patients', patientId, 'encounters'],
    queryFn: () => patientsApi.getEncounters(patientId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!encounters?.length) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No encounters"
        description="This patient has no recorded encounters yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      {encounters.map((encounter: any) => {
        const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
        const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

        return (
          <Link key={encounter.id} href={`/encounters/${encounter.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Stethoscope className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{type?.label || encounter.encounter_type}</h4>
                        <Badge className={status?.color}>{status?.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {encounter.chief_complaint}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(encounter.encounter_date)}
                        </span>
                        <span>{formatRelativeTime(encounter.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
```

**components/patients/emergency-contacts-list.tsx**:
```typescript
import { User, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { EmergencyContact } from '@/lib/types/patient';
import { formatPhoneNumber } from '@/lib/utils/format';

interface EmergencyContactsListProps {
  contacts: EmergencyContact[];
}

export function EmergencyContactsList({ contacts }: EmergencyContactsListProps) {
  if (!contacts.length) {
    return (
      <EmptyState
        icon={User}
        title="No emergency contacts"
        description="No emergency contacts have been added for this patient."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {contacts.map((contact) => (
        <Card key={contact.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.relationship}</p>
                </div>
              </div>
              {contact.is_primary && <Badge>Primary</Badge>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
                {formatPhoneNumber(contact.phone)}
              </a>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

## 8. Debounce Hook

**lib/hooks/use-debounce.ts**:
```typescript
import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value.
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

---

## 9. Test Coverage

### 9.1 Patient API Tests (8 tests)

**__tests__/lib/api/patients.test.ts**:
```typescript
import { patientsApi } from '@/lib/api/patients';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

describe('Patients API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch patient list', async () => {
    const mockResponse = { data: { count: 1, results: [{ id: 1 }] } };
    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await patientsApi.list();
    expect(apiClient.get).toHaveBeenCalledWith('/api/patients/', { params: undefined });
    expect(result.count).toBe(1);
  });

  it('should fetch patient list with params', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { count: 0, results: [] } });

    await patientsApi.list({ search: 'john', page: 2 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/patients/', {
      params: { search: 'john', page: 2 },
    });
  });

  it('should fetch single patient', async () => {
    const mockPatient = { id: 1, mrn: 'MRN-001', first_name: 'John' };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPatient });

    const result = await patientsApi.get(1);
    expect(apiClient.get).toHaveBeenCalledWith('/api/patients/1/');
    expect(result.mrn).toBe('MRN-001');
  });

  it('should create patient', async () => {
    const newPatient = { first_name: 'Jane', last_name: 'Doe' };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: 2, ...newPatient } });

    const result = await patientsApi.create(newPatient as any);
    expect(apiClient.post).toHaveBeenCalledWith('/api/patients/', newPatient);
    expect(result.id).toBe(2);
  });

  it('should update patient', async () => {
    const updates = { first_name: 'Janet' };
    (apiClient.patch as jest.Mock).mockResolvedValue({ data: { id: 1, ...updates } });

    const result = await patientsApi.update(1, updates);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/patients/1/', updates);
    expect(result.first_name).toBe('Janet');
  });

  it('should delete patient', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({});

    await patientsApi.delete(1);
    expect(apiClient.delete).toHaveBeenCalledWith('/api/patients/1/');
  });

  it('should search patients', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { count: 1, results: [] } });

    await patientsApi.search('john');
    expect(apiClient.get).toHaveBeenCalledWith('/api/patients/', {
      params: { search: 'john' },
    });
  });

  it('should fetch emergency contacts', async () => {
    const mockContacts = [{ id: 1, name: 'Jane' }];
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockContacts });

    const result = await patientsApi.getEmergencyContacts(1);
    expect(apiClient.get).toHaveBeenCalledWith('/api/patients/1/emergency-contacts/');
    expect(result).toEqual(mockContacts);
  });
});
```

### 9.2 Patient Hooks Tests (10 tests)

**__tests__/lib/hooks/use-patients.test.tsx**:
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePatients, usePatient, usePatientSearch } from '@/lib/hooks/use-patients';
import { patientsApi } from '@/lib/api/patients';

jest.mock('@/lib/api/patients');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('usePatients', () => {
  it('should fetch patient list', async () => {
    (patientsApi.list as jest.Mock).mockResolvedValue({ count: 1, results: [] });

    const { result } = renderHook(() => usePatients(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(patientsApi.list).toHaveBeenCalled();
  });

  it('should pass params to API', async () => {
    (patientsApi.list as jest.Mock).mockResolvedValue({ count: 0, results: [] });

    const { result } = renderHook(() => usePatients({ search: 'test', page: 2 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(patientsApi.list).toHaveBeenCalledWith({ search: 'test', page: 2 });
  });
});

describe('usePatient', () => {
  it('should fetch single patient', async () => {
    (patientsApi.get as jest.Mock).mockResolvedValue({ id: 1, mrn: 'MRN-001' });

    const { result } = renderHook(() => usePatient(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.mrn).toBe('MRN-001');
  });

  it('should not fetch when id is falsy', () => {
    const { result } = renderHook(() => usePatient(0), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('usePatientSearch', () => {
  it('should search when query length >= 2', async () => {
    (patientsApi.search as jest.Mock).mockResolvedValue({ count: 1, results: [] });

    const { result } = renderHook(() => usePatientSearch('jo'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(patientsApi.search).toHaveBeenCalledWith('jo');
  });

  it('should not search when query is too short', () => {
    const { result } = renderHook(() => usePatientSearch('j'), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(patientsApi.search).not.toHaveBeenCalled();
  });
});
```

### 9.3 Patient Table Tests (8 tests)

**__tests__/components/patients/patient-table.test.tsx**:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { PatientTable } from '@/components/patients/patient-table';
import { Patient } from '@/lib/types/patient';

const mockPatients: Patient[] = [
  {
    id: 1,
    mrn: 'MRN-001',
    first_name: 'John',
    last_name: 'Doe',
    date_of_birth: '1990-01-15',
    gender: 'M',
    phone_number: '+254700000000',
    county_name: 'Nairobi',
    is_sensitive: false,
    created_at: '2024-01-01T00:00:00Z',
  } as Patient,
];

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('PatientTable', () => {
  const defaultProps = {
    patients: mockPatients,
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    onPageChange: jest.fn(),
  };

  it('should render patient data', () => {
    render(<PatientTable {...defaultProps} />);
    
    expect(screen.getByText('MRN-001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Nairobi')).toBeInTheDocument();
  });

  it('should show loading skeleton', () => {
    render(<PatientTable {...defaultProps} isLoading={true} />);
    
    // Skeleton rows should be present
    expect(screen.queryByText('MRN-001')).not.toBeInTheDocument();
  });

  it('should show error state', () => {
    render(<PatientTable {...defaultProps} error={new Error('Failed to load')} />);
    
    expect(screen.getByText(/error loading patients/i)).toBeInTheDocument();
  });

  it('should show empty state', () => {
    render(<PatientTable {...defaultProps} patients={[]} />);
    
    expect(screen.getByText(/no patients found/i)).toBeInTheDocument();
  });

  it('should display sensitive badge', () => {
    const sensitivePatient = { ...mockPatients[0], is_sensitive: true };
    render(<PatientTable {...defaultProps} patients={[sensitivePatient]} />);
    
    expect(screen.getByText('Sensitive')).toBeInTheDocument();
  });

  it('should show pagination when multiple pages', () => {
    render(<PatientTable {...defaultProps} totalPages={3} />);
    
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('should call onPageChange when pagination clicked', () => {
    render(<PatientTable {...defaultProps} totalPages={3} />);
    
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(2);
  });

  it('should disable previous on first page', () => {
    render(<PatientTable {...defaultProps} totalPages={3} page={1} />);
    
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });
});
```

### 9.4 Patient Detail Tests (6 tests)

### 9.5 Patient Card Tests (3 tests)

---

## 10. Checklist

### Days 9-10: Patient List
- [ ] Create Patient types
- [ ] Implement Patients API client
- [ ] Create usePatients hook
- [ ] Implement useDebounce hook
- [ ] Create Patient list page
- [ ] Implement PatientTable component
- [ ] Add search and filters
- [ ] Add pagination
- [ ] Write 18 tests

### Days 11-12: Patient Detail
- [ ] Create Patient detail page
- [ ] Implement PatientCard component
- [ ] Implement PatientEncounters component
- [ ] Implement EmergencyContactsList component
- [ ] Add tabs for different sections
- [ ] Write 17 tests

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Patient TypeScript types | 📋 |
| Patients API client | 📋 |
| Patient hooks (5 hooks) | 📋 |
| Patient list page | 📋 |
| Patient table with pagination | 📋 |
| Search and filter functionality | 📋 |
| Patient detail page | 📋 |
| Patient card component | 📋 |
| Emergency contacts list | 📋 |
| Patient encounters list | 📋 |
| 35 patient tests passing | 📋 |

---

**Previous**: [03-layout-navigation.md](./03-layout-navigation.md)
**Next**: [05-encounter-module.md](./05-encounter-module.md)
